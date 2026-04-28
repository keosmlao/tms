const { pool, query, queryOne } = require("../lib/db");

const billTodoCache = globalThis;

async function safeDdl(db, sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (
      err?.code === "23505" ||
      msg.includes("pg_class_relname_nsp_index") ||
      msg.includes("pg_type_typname_nsp_index") ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw err;
  }
}

async function ensureBillTodoSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_bill_todo (
      id BIGSERIAL PRIMARY KEY,
      bill_no character varying NOT NULL,
      summary text NOT NULL,
      deadline date,
      done boolean DEFAULT false,
      created_by character varying,
      created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      done_by character varying,
      done_at timestamp without time zone
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_bill_todo_bill_no
    ON public.odg_tms_bill_todo (bill_no)
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_bill_todo_deadline
    ON public.odg_tms_bill_todo (deadline) WHERE done = false
  `);
}

async function ensureBillTodoSchema() {
  if (billTodoCache.__tmsBillTodoSchemaReady) return;
  if (!billTodoCache.__tmsBillTodoSchemaPromise) {
    billTodoCache.__tmsBillTodoSchemaPromise = ensureBillTodoSchemaInternal(pool)
      .then(() => {
        billTodoCache.__tmsBillTodoSchemaReady = true;
      })
      .catch((err) => {
        billTodoCache.__tmsBillTodoSchemaPromise = null;
        throw err;
      });
  }
  await billTodoCache.__tmsBillTodoSchemaPromise;
}

// Aggregated summary used when rendering bills lists: returns one row per
// bill_no with pending count + earliest deadline so the UI can colour the
// indicator without fetching every todo upfront.
async function getBillTodoSummaryMap(billNos) {
  if (!Array.isArray(billNos) || billNos.length === 0) return new Map();
  await ensureBillTodoSchema();
  const rows = await query(
    `SELECT bill_no,
            COUNT(*) FILTER (WHERE done = false)::int AS pending_count,
            COUNT(*) FILTER (WHERE done = true)::int  AS done_count,
            to_char(MIN(deadline) FILTER (WHERE done = false), 'YYYY-MM-DD') AS earliest_deadline,
            to_char(MIN(deadline) FILTER (WHERE done = false), 'DD-MM-YYYY') AS earliest_deadline_display
     FROM public.odg_tms_bill_todo
     WHERE bill_no = ANY($1::varchar[])
     GROUP BY bill_no`,
    [billNos]
  );
  return new Map(rows.map((r) => [r.bill_no, r]));
}

async function getBillTodos(billNo) {
  const code = String(billNo ?? "").trim();
  if (!code) return [];
  await ensureBillTodoSchema();
  return query(
    `SELECT id, bill_no, summary,
            to_char(deadline,'YYYY-MM-DD') AS deadline,
            to_char(deadline,'DD-MM-YYYY') AS deadline_display,
            done,
            COALESCE(created_by,'') AS created_by,
            to_char(created_at,'DD-MM-YYYY HH24:MI') AS created_at,
            COALESCE(done_by,'') AS done_by,
            to_char(done_at,'DD-MM-YYYY HH24:MI') AS done_at
     FROM public.odg_tms_bill_todo
     WHERE bill_no = $1
     ORDER BY done ASC, deadline ASC NULLS LAST, id DESC`,
    [code]
  );
}

async function createBillTodo({ billNo, summary, deadline, userCode }) {
  const code = String(billNo ?? "").trim();
  const text = String(summary ?? "").trim();
  if (!code) throw new Error("bill_no is required");
  if (!text) throw new Error("ກະລຸນາໃສ່ໃນລາຍລະອຽດ");
  await ensureBillTodoSchema();

  const date = deadline ? String(deadline).trim() || null : null;
  const user = userCode ? String(userCode).trim() || null : null;

  const row = await queryOne(
    `INSERT INTO public.odg_tms_bill_todo (bill_no, summary, deadline, created_by)
     VALUES ($1, $2, $3::date, $4)
     RETURNING id`,
    [code, text, date, user]
  );
  return { success: true, id: row?.id ?? null };
}

async function setBillTodoDone({ id, done, userCode }) {
  if (!id) throw new Error("id is required");
  await ensureBillTodoSchema();
  const user = userCode ? String(userCode).trim() || null : null;
  await pool.query(
    `UPDATE public.odg_tms_bill_todo
     SET done = $2,
         done_by = CASE WHEN $2 THEN $3 ELSE NULL END,
         done_at = CASE WHEN $2 THEN LOCALTIMESTAMP(0) ELSE NULL END
     WHERE id = $1`,
    [id, Boolean(done), user]
  );
  return { success: true };
}

async function deleteBillTodo(id) {
  if (!id) throw new Error("id is required");
  await ensureBillTodoSchema();
  await pool.query(`DELETE FROM public.odg_tms_bill_todo WHERE id = $1`, [id]);
  return { success: true };
}

module.exports = {
  ensureBillTodoSchema,
  getBillTodoSummaryMap,
  getBillTodos,
  createBillTodo,
  setBillTodoDone,
  deleteBillTodo,
};

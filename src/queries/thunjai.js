const { pool, query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");

const thunjaiCache = globalThis;

async function safeDdl(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (
      err?.code === "23505" ||
      msg.includes("pg_class_relname_nsp_index") ||
      msg.includes("pg_type_typname_s_nsp_index") ||
      msg.includes("pg_type_typname_nsp_index") ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw err;
  }
}

async function ensureThunJaiSchemaInternal() {
  await safeDdl(`
    CREATE TABLE IF NOT EXISTS public.odg_thunjai_setting (
      key character varying PRIMARY KEY,
      value text,
      updated_by character varying,
      updated_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
}

async function ensureThunJaiSchema() {
  if (thunjaiCache.__odgThunJaiSchemaReady) return;
  if (!thunjaiCache.__odgThunJaiSchemaPromise) {
    thunjaiCache.__odgThunJaiSchemaPromise = ensureThunJaiSchemaInternal()
      .then(() => {
        thunjaiCache.__odgThunJaiSchemaReady = true;
      })
      .catch((err) => {
        thunjaiCache.__odgThunJaiSchemaPromise = null;
        throw err;
      });
  }
  await thunjaiCache.__odgThunJaiSchemaPromise;
}

async function getSettings(keys) {
  await ensureThunJaiSchema();
  const wanted = (keys ?? []).map((key) => String(key ?? "").trim()).filter(Boolean);
  const out = Object.fromEntries(wanted.map((key) => [key, ""]));
  if (wanted.length === 0) return out;
  const rows = await query(
    `SELECT key, value FROM public.odg_thunjai_setting WHERE key = ANY($1::varchar[])`,
    [wanted]
  );
  for (const row of rows) {
    out[row.key] = row.value ?? "";
  }
  return out;
}

async function setSetting(key, value, userCode) {
  await ensureThunJaiSchema();
  const k = String(key ?? "").trim();
  if (!k) throw new Error("ThunJai setting key is required");
  const v = value == null ? null : String(value);
  const u = userCode ? String(userCode).trim() || null : null;
  await pool.query(
    `INSERT INTO public.odg_thunjai_setting (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, LOCALTIMESTAMP(0))
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = LOCALTIMESTAMP(0)`,
    [k, v, u]
  );
  return { success: true };
}

async function setSettings(entries, userCode) {
  for (const [key, value] of Object.entries(entries ?? {})) {
    await setSetting(key, value, userCode);
  }
  return { success: true };
}

async function searchSourceProducts(search) {
  const q = String(search ?? "").trim();
  if (q.length < 2) return [];
  return query(
    `SELECT
       t.doc_no,
       to_char(t.doc_date, 'DD-MM-YYYY') AS doc_date,
       COALESCE(t.cust_code, '') AS cust_code,
       COALESCE(NULLIF(TRIM(c.name_1), ''), t.cust_code, '') AS cust_name,
       COALESCE(NULLIF(TRIM(c.telephone), ''), '') AS telephone,
       SUM(COALESCE(d.qty, 0))::numeric AS qty,
       COUNT(*)::int AS line_count,
       STRING_AGG(
         CONCAT(
           COALESCE(NULLIF(TRIM(d.item_name), ''), d.item_code),
           ' x',
           TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM COALESCE(d.qty, 0)::numeric::text)),
           CASE
             WHEN NULLIF(TRIM(COALESCE(d.unit_code, '')), '') IS NULL THEN ''
             ELSE CONCAT(' ', TRIM(d.unit_code))
           END
         ),
         ', '
         ORDER BY d.item_code
       ) AS item_summary,
       JSON_AGG(
         JSON_BUILD_OBJECT(
           'item_code', d.item_code,
           'item_name', COALESCE(NULLIF(TRIM(d.item_name), ''), d.item_code),
           'qty', COALESCE(d.qty, 0)::numeric,
           'unit_code', COALESCE(NULLIF(TRIM(d.unit_code), ''), '')
         )
         ORDER BY d.item_code
       ) AS item_lines
     FROM public.ic_trans t
     INNER JOIN public.ic_trans_detail d ON d.doc_no = t.doc_no
     LEFT JOIN public.ar_customer c ON c.code = t.cust_code
     WHERE ${getFixedYearSqlFilter("t.doc_date")}
       AND d.item_code NOT LIKE '97%'
       AND (
         t.doc_no ILIKE $1
         OR COALESCE(t.cust_code, '') ILIKE $1
         OR COALESCE(c.name_1, '') ILIKE $1
         OR COALESCE(c.telephone, '') ILIKE $1
         OR COALESCE(d.item_code, '') ILIKE $1
         OR COALESCE(d.item_name, '') ILIKE $1
       )
     GROUP BY t.doc_no, t.doc_date, t.cust_code, c.name_1, c.telephone
     ORDER BY t.doc_date DESC, t.doc_no DESC
     LIMIT 80`,
    [`%${q}%`]
  ).then((rows) =>
    rows.map((row) => ({
      ...row,
      qty: Number(row.qty ?? 0),
      line_count: Number(row.line_count ?? 0),
    }))
  );
}

module.exports = {
  ensureThunJaiSchema,
  getSettings,
  setSettings,
  searchSourceProducts,
};

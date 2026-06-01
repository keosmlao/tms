const { pool, query, queryOne } = require("../lib/db");

const maintCache = globalThis;
// Reset on each module load so new ALTER TABLE migrations always run
maintCache.__tmsMaintSchemaReady = false;
maintCache.__tmsMaintSchemaPromise = null;

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

async function ensureMaintSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_maint_log (
      id BIGSERIAL PRIMARY KEY,
      car_code character varying NOT NULL,
      maint_date date NOT NULL DEFAULT CURRENT_DATE,
      odometer numeric NOT NULL DEFAULT 0,
      inspect_code character varying,
      item_code character varying,
      maint_note text,
      cost_amount numeric NOT NULL DEFAULT 0,
      currency character varying NOT NULL DEFAULT 'LAK',
      invoice_no character varying,
      created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_maint_log_date
    ON public.odg_tms_maint_log (maint_date)
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_maint_log_car
    ON public.odg_tms_maint_log (car_code)
  `);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log ADD COLUMN IF NOT EXISTS repair_shop character varying`);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log ADD COLUMN IF NOT EXISTS created_by character varying`);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log ADD COLUMN IF NOT EXISTS receipt_files jsonb DEFAULT '[]'::jsonb`);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log ADD COLUMN IF NOT EXISTS payment_status character varying NOT NULL DEFAULT 'pending'`);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)`);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log DROP CONSTRAINT IF EXISTS fk_maint_log_item`);
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_maint_log_detail (
      id BIGSERIAL PRIMARY KEY,
      maint_log_id BIGINT NOT NULL,
      item_code character varying,
      item_name character varying,
      qty numeric NOT NULL DEFAULT 1,
      unit_price numeric NOT NULL DEFAULT 0,
      subtotal numeric NOT NULL DEFAULT 0
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_maint_log_detail_log_id
    ON public.odg_tms_maint_log_detail(maint_log_id)
  `);
  await safeDdl(db, `ALTER TABLE public.odg_tms_maint_log_detail DROP CONSTRAINT IF EXISTS fk_maint_log_item`);
}

async function ensureMaintSchema(client) {
  const db = client ?? pool;
  if (client && client !== pool) {
    await ensureMaintSchemaInternal(client);
    return;
  }
  if (maintCache.__tmsMaintSchemaReady) return;
  if (!maintCache.__tmsMaintSchemaPromise) {
    maintCache.__tmsMaintSchemaPromise = ensureMaintSchemaInternal(db)
      .then(() => { maintCache.__tmsMaintSchemaReady = true; })
      .catch((err) => {
        maintCache.__tmsMaintSchemaPromise = null;
        throw err;
      });
  }
  await maintCache.__tmsMaintSchemaPromise;
}

function asText(v) {
  return typeof v === "string" ? v.trim() : "";
}

function asNullableText(v) {
  const t = asText(v);
  return t || null;
}

function asNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function saveMaintLog(payload) {
  await ensureMaintSchema();

  const carCode = asNullableText(payload?.car_code);
  if (!carCode) throw new Error("ກະລຸນາລະບຸລະຫັດລົດ (car_code)");

  const currency = asNullableText(payload?.currency) ?? "LAK";
  const validCurrencies = ["LAK", "THB", "USD"];
  if (!validCurrencies.includes(currency)) {
    throw new Error(`ສະກຸນເງິນຕ້ອງເປັນ: ${validCurrencies.join(", ")}`);
  }

  const lineItems = Array.isArray(payload?.line_items) ? payload.line_items : [];
  let costAmount;
  if (lineItems.length > 0) {
    costAmount = lineItems.reduce((sum, item) => {
      const qty = asNumber(item?.qty) ?? 1;
      const unitPrice = asNumber(item?.unit_price) ?? 0;
      return sum + qty * unitPrice;
    }, 0);
  } else {
    costAmount = asNumber(payload?.cost_amount) ?? 0;
  }
  if (costAmount < 0) throw new Error("ຄ່າໃຊ້ຈ່າຍຕ້ອງຕິດລົບ (cost_amount ≥ 0)");

  const itemCodeJoined = lineItems.length > 0
    ? lineItems.map((i) => asNullableText(i?.item_code)).filter(Boolean).join(",") || null
    : asNullableText(payload?.item_code);

  const receiptFiles = Array.isArray(payload?.receipt_files) ? payload.receipt_files : [];
  const maintDate = asNullableText(payload?.maint_date);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const validPaymentStatuses = ["pending", "paid"];
    const paymentStatus = validPaymentStatuses.includes(payload?.payment_status)
      ? payload.payment_status
      : "pending";

    const insertSql = `
      INSERT INTO public.odg_tms_maint_log
        (car_code, maint_date, odometer, inspect_code,
         item_code, maint_note, cost_amount, currency, invoice_no,
         repair_shop, created_by, receipt_files, payment_status)
      VALUES (
        $1,
        COALESCE($2::date, CURRENT_DATE),
        $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      RETURNING id
    `;
    const insertParams = [
      carCode,
      maintDate,
      asNumber(payload?.odometer) ?? 0,
      asNullableText(payload?.inspect_code),
      itemCodeJoined,
      asNullableText(payload?.maint_note),
      costAmount,
      currency,
      asNullableText(payload?.invoice_no),
      asNullableText(payload?.repair_shop),
      asNullableText(payload?.created_by),
      JSON.stringify(receiptFiles),
      paymentStatus,
    ];

    const result = await client.query(insertSql, insertParams);
    const newId = result.rows[0]?.id;

    for (const item of lineItems) {
      const qty = asNumber(item?.qty) ?? 1;
      const unitPrice = asNumber(item?.unit_price) ?? 0;
      const subtotal = qty * unitPrice;
      await client.query(
        `INSERT INTO public.odg_tms_maint_log_detail
           (maint_log_id, item_code, item_name, qty, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newId,
          asNullableText(item?.item_code),
          asNullableText(item?.item_name),
          qty,
          unitPrice,
          subtotal,
        ]
      );
    }

    await client.query("COMMIT");
    return { success: true, id: newId ?? null };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getMaintLogs({ fromDate, toDate, carCode, search } = {}) {
  await ensureMaintSchema();

  const params = [];
  const where = [];

  if (fromDate) {
    params.push(fromDate);
    where.push(`ml.maint_date >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`ml.maint_date <= $${params.length}::date`);
  }
  if (carCode) {
    params.push(carCode);
    where.push(`ml.car_code = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(
      COALESCE(ml.car_code, '') ILIKE $${params.length}
      OR COALESCE(ml.invoice_no, '') ILIKE $${params.length}
      OR COALESCE(ml.item_code, '') ILIKE $${params.length}
      OR COALESCE(ml.maint_note, '') ILIKE $${params.length}
      OR COALESCE(ml.repair_shop, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query(
    `SELECT
       ml.id,
       ml.car_code,
       TO_CHAR(ml.maint_date, 'YYYY-MM-DD') AS maint_date,
       ml.odometer,
       ml.inspect_code,
       ml.item_code,
       ml.maint_note,
       ml.cost_amount,
       ml.currency,
       ml.invoice_no,
       ml.repair_shop,
       ml.created_by,
       ml.receipt_files,
       ml.payment_status,
       TO_CHAR(ml.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
       (SELECT COALESCE(json_agg(
           json_build_object('id', d.id, 'item_code', d.item_code, 'item_name', d.item_name,
                             'qty', d.qty, 'unit_price', d.unit_price, 'subtotal', d.subtotal)
           ORDER BY d.id
         ), '[]'::json)
        FROM public.odg_tms_maint_log_detail d
        WHERE d.maint_log_id = ml.id) AS line_items
     FROM public.odg_tms_maint_log ml
     ${whereClause}
     ORDER BY ml.maint_date DESC, ml.id DESC
     LIMIT 500`,
    params
  );

  const summaryRows = await query(
    `SELECT
       currency,
       COALESCE(SUM(cost_amount), 0)::numeric AS total_cost,
       COUNT(*)::int AS entry_count
     FROM public.odg_tms_maint_log ml
     ${whereClause}
     GROUP BY currency
     ORDER BY currency`,
    params
  );

  const totalByCurrency = {};
  for (const r of summaryRows) {
    totalByCurrency[r.currency] = {
      total_cost: Number(r.total_cost),
      entry_count: r.entry_count,
    };
  }

  return { rows, totalByCurrency };
}

async function getCarDefaults(carCode) {
  await ensureMaintSchema();

  const lastRow = await queryOne(
    `SELECT odometer, item_code, currency
     FROM public.odg_tms_maint_log
     WHERE car_code = $1
     ORDER BY maint_date DESC, id DESC
     LIMIT 1`,
    [carCode]
  );

  let lastOdometer = lastRow?.odometer ?? null;
  if (lastOdometer === null) {
    const inspRow = await queryOne(
      `SELECT odometer
       FROM public.odg_tms_inspect
       WHERE car_code = $1 AND odometer IS NOT NULL
       ORDER BY inspect_date DESC, inspect_code DESC
       LIMIT 1`,
      [carCode]
    );
    lastOdometer = inspRow?.odometer ?? null;
  }

  const itemRows = await query(
    `SELECT item_code, COUNT(*)::int AS cnt
     FROM public.odg_tms_maint_log
     WHERE car_code = $1 AND item_code IS NOT NULL
     GROUP BY item_code
     ORDER BY cnt DESC
     LIMIT 5`,
    [carCode]
  );

  let commonItems = itemRows.map((r) => r.item_code);

  if (commonItems.length === 0) {
    const globalRows = await query(
      `SELECT item_code, COUNT(*)::int AS cnt
       FROM public.odg_tms_maint_log
       WHERE item_code IS NOT NULL
       GROUP BY item_code
       ORDER BY cnt DESC
       LIMIT 5`,
      []
    );
    commonItems = globalRows.map((r) => r.item_code);
  }

  let lastItemCode = lastRow?.item_code ?? null;
  if (lastItemCode === null) {
    const itemRow = await query(
      `SELECT item_code FROM public.odg_tms_maint_log
       WHERE car_code = $1 AND item_code IS NOT NULL
       ORDER BY maint_date DESC, id DESC
       LIMIT 1`,
      [carCode]
    );
    lastItemCode = itemRow[0]?.item_code ?? null;
  }

  return {
    last_odometer: lastOdometer,
    last_item_code: lastItemCode,
    last_currency: lastRow?.currency ?? "LAK",
    common_items: commonItems,
  };
}

async function deleteMaintLog(id) {
  await ensureMaintSchema();
  await pool.query(`DELETE FROM public.odg_tms_maint_log_detail WHERE maint_log_id = $1`, [id]);
  await pool.query(`DELETE FROM public.odg_tms_maint_log WHERE id = $1`, [id]);
  return { success: true };
}

async function getLatestRuleOdometers() {
  return [];
}

async function getHandledInspectCodes() {
  await ensureMaintSchema();
  const rows = await query(
    `SELECT DISTINCT inspect_code
     FROM public.odg_tms_maint_log
     WHERE inspect_code IS NOT NULL`,
    []
  );
  return rows.map((r) => r.inspect_code);
}

async function searchItemCodes(q) {
  await ensureMaintSchema();
  const params = q ? [`%${q}%`] : [];
  const whereClause = q ? `WHERE item_code ILIKE $1` : `WHERE item_code IS NOT NULL`;
  const rows = await query(
    `SELECT item_code, COUNT(*)::int AS cnt
     FROM public.odg_tms_maint_log
     ${whereClause}
     GROUP BY item_code
     ORDER BY cnt DESC, item_code ASC
     LIMIT 15`,
    params
  );
  return rows.map((r) => ({ item_code: r.item_code, cnt: r.cnt }));
}

module.exports = {
  ensureMaintSchema,
  saveMaintLog,
  getMaintLogs,
  getCarDefaults,
  deleteMaintLog,
  searchItemCodes,
  getHandledInspectCodes,
  getLatestRuleOdometers,
};

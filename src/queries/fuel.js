const { pool, query, queryOne } = require("../lib/db");

const fuelCache = globalThis;

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

async function ensureFuelSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_fuel_log (
      id BIGSERIAL PRIMARY KEY,
      fuel_date date NOT NULL DEFAULT CURRENT_DATE,
      user_code character varying,
      driver_name character varying,
      car character varying,
      doc_no character varying,
      liters numeric DEFAULT 0,
      amount numeric DEFAULT 0,
      odometer numeric,
      station character varying,
      note text,
      image_data text,
      lat character varying,
      lng character varying,
      created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_fuel_log_date
    ON public.odg_tms_fuel_log (fuel_date)
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_fuel_log_user
    ON public.odg_tms_fuel_log (user_code)
  `);
}

async function ensureFuelSchema(client) {
  const db = client ?? pool;
  if (client && client !== pool) {
    await ensureFuelSchemaInternal(client);
    return;
  }
  if (fuelCache.__tmsFuelSchemaReady) return;
  if (!fuelCache.__tmsFuelSchemaPromise) {
    fuelCache.__tmsFuelSchemaPromise = ensureFuelSchemaInternal(db)
      .then(() => {
        fuelCache.__tmsFuelSchemaReady = true;
      })
      .catch((err) => {
        fuelCache.__tmsFuelSchemaPromise = null;
        throw err;
      });
  }
  await fuelCache.__tmsFuelSchemaPromise;
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

async function saveFuelRefill(payload, client) {
  const db = client ?? pool;
  await ensureFuelSchema(db);

  const liters = asNumber(payload?.liters);
  const amount = asNumber(payload?.amount);
  if (liters === null && amount === null) {
    throw new Error("ກະລຸນາໃສ່ຈຳນວນລິດ ຫຼື ຈຳນວນເງິນ");
  }

  const fuelDate = asNullableText(payload?.fuel_date);
  const sql = `
    INSERT INTO public.odg_tms_fuel_log
      (fuel_date, user_code, driver_name, car, doc_no, liters, amount, odometer,
       station, note, image_data, lat, lng)
    VALUES (
      COALESCE($1::date, CURRENT_DATE),
      $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    RETURNING id
  `;
  const params = [
    fuelDate,
    asNullableText(payload?.user_code),
    asNullableText(payload?.driver_name),
    asNullableText(payload?.car),
    asNullableText(payload?.doc_no),
    liters ?? 0,
    amount ?? 0,
    asNumber(payload?.odometer),
    asNullableText(payload?.station),
    asNullableText(payload?.note),
    asNullableText(payload?.image_data),
    asNullableText(payload?.lat),
    asNullableText(payload?.lng),
  ];
  const result = await db.query(sql, params);
  return { success: true, id: result.rows[0]?.id ?? null };
}

async function getFuelLogs({ fromDate, toDate, search, userCode } = {}) {
  await ensureFuelSchema();

  const params = [];
  const where = [];

  if (fromDate) {
    params.push(fromDate);
    where.push(`fuel_date >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`fuel_date <= $${params.length}::date`);
  }
  if (userCode) {
    params.push(userCode);
    where.push(`user_code = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(
      COALESCE(driver_name, '') ILIKE $${params.length}
      OR COALESCE(user_code, '') ILIKE $${params.length}
      OR COALESCE(car, '') ILIKE $${params.length}
      OR COALESCE(station, '') ILIKE $${params.length}
      OR COALESCE(doc_no, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await query(
    `SELECT
       id,
       to_char(fuel_date, 'YYYY-MM-DD') AS fuel_date,
       user_code,
       driver_name,
       car,
       doc_no,
       liters,
       amount,
       odometer,
       station,
       note,
       lat,
       lng,
       (image_data IS NOT NULL AND image_data <> '') AS has_image,
       to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM public.odg_tms_fuel_log
     ${whereClause}
     ORDER BY fuel_date DESC, created_at DESC, id DESC`,
    params
  );
  return rows;
}

async function getFuelSummary({ fromDate, toDate, userCode } = {}) {
  await ensureFuelSchema();
  const params = [];
  const where = [];
  if (fromDate) {
    params.push(fromDate);
    where.push(`fuel_date >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`fuel_date <= $${params.length}::date`);
  }
  if (userCode) {
    params.push(userCode);
    where.push(`user_code = $${params.length}`);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const row = await queryOne(
    `SELECT
       COUNT(*)::int AS entry_count,
       COALESCE(SUM(liters), 0)::numeric AS total_liters,
       COALESCE(SUM(amount), 0)::numeric AS total_amount
     FROM public.odg_tms_fuel_log
     ${whereClause}`,
    params
  );
  return row ?? { entry_count: 0, total_liters: 0, total_amount: 0 };
}

async function getFuelImage(id) {
  await ensureFuelSchema();
  const row = await queryOne(
    `SELECT image_data FROM public.odg_tms_fuel_log WHERE id = $1`,
    [id]
  );
  return row?.image_data ?? null;
}

async function deleteFuelLog(id) {
  await ensureFuelSchema();
  await pool.query(`DELETE FROM public.odg_tms_fuel_log WHERE id = $1`, [id]);
  return { success: true };
}

module.exports = {
  ensureFuelSchema,
  saveFuelRefill,
  getFuelLogs,
  getFuelSummary,
  getFuelImage,
  deleteFuelLog,
};

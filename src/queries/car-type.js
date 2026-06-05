// Car types (ປະເພດລົດ) — admin-managed list used by the car form's type
// dropdown. odg_tms_car.car_type stores the type NAME, so these rows ARE the
// option values; the legacy hard-coded list is seeded once on first use.
const { pool, query, queryOne } = require("../lib/db");

const ctCache = globalThis;

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

// Same list the cars page used to hard-code — seeded once so existing cars
// (whose car_type holds one of these names) keep matching a dropdown option.
const DEFAULT_CAR_TYPES = [
  "ລົດກະບະ",
  "ລົດຕູ້",
  "ລົດ 4 ລໍ້",
  "ລົດ 6 ລໍ້",
  "ລົດ 10 ລໍ້",
  "ລົດແຊ່ເຢັນ",
  "ລົດພ່ວງ",
  "ລົດຈັກ",
];

async function ensureCarTypeSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_car_type (
      code character varying PRIMARY KEY,
      name character varying NOT NULL,
      sort_order int DEFAULT 0,
      active boolean DEFAULT true,
      created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      updated_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  // Seed the legacy types only when the table is empty (first install).
  const existing = await db.query(`SELECT COUNT(*)::int AS n FROM public.odg_tms_car_type`);
  if (Number(existing.rows?.[0]?.n ?? 0) === 0) {
    for (let i = 0; i < DEFAULT_CAR_TYPES.length; i++) {
      await db.query(
        `INSERT INTO public.odg_tms_car_type (code, name, sort_order)
         VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
        ["T" + String(i + 1).padStart(3, "0"), DEFAULT_CAR_TYPES[i], i]
      );
    }
  }
}

async function ensureCarTypeSchema() {
  if (ctCache.__tmsCarTypeSchemaReady) return;
  if (!ctCache.__tmsCarTypeSchemaPromise) {
    ctCache.__tmsCarTypeSchemaPromise = ensureCarTypeSchemaInternal(pool)
      .then(() => {
        ctCache.__tmsCarTypeSchemaReady = true;
      })
      .catch((err) => {
        ctCache.__tmsCarTypeSchemaPromise = null;
        throw err;
      });
  }
  await ctCache.__tmsCarTypeSchemaPromise;
}

async function listCarTypes({ activeOnly = false } = {}) {
  await ensureCarTypeSchema();
  const where = activeOnly ? "WHERE active = true" : "";
  return query(
    `SELECT code, name, COALESCE(sort_order, 0) as sort_order, active
     FROM public.odg_tms_car_type
     ${where}
     ORDER BY COALESCE(sort_order, 0) ASC, name ASC`
  );
}

async function nextCarTypeCode() {
  await ensureCarTypeSchema();
  // Codes are T001, T002, ... — generated server-side.
  const row = await queryOne(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 2) AS INT)), 0) AS max_n
     FROM public.odg_tms_car_type
     WHERE code ~ '^T[0-9]+$'`
  );
  const next = Number(row?.max_n ?? 0) + 1;
  return "T" + String(next).padStart(3, "0");
}

async function upsertCarType(input) {
  await ensureCarTypeSchema();
  let code = String(input?.code ?? "").trim();
  const name = String(input?.name ?? "").trim();
  if (!code) {
    code = await nextCarTypeCode();
  }
  if (!name) throw new Error("name is required");
  const sortOrder = Number.isFinite(Number(input?.sort_order))
    ? Number(input.sort_order)
    : 0;
  const active = input?.active === false ? false : true;

  await pool.query(
    `INSERT INTO public.odg_tms_car_type
       (code, name, sort_order, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, LOCALTIMESTAMP(0), LOCALTIMESTAMP(0))
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           sort_order = EXCLUDED.sort_order,
           active = EXCLUDED.active,
           updated_at = LOCALTIMESTAMP(0)`,
    [code, name, sortOrder, active]
  );
  return { success: true };
}

async function deleteCarType(code) {
  await ensureCarTypeSchema();
  await pool.query(
    `DELETE FROM public.odg_tms_car_type WHERE code = $1`,
    [String(code ?? "").trim()]
  );
  return { success: true };
}

module.exports = {
  ensureCarTypeSchema,
  listCarTypes,
  upsertCarType,
  deleteCarType,
  nextCarTypeCode,
};

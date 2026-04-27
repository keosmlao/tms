const { pool, query, queryOne } = require("../lib/db");

const cache = globalThis;

// ==================== Schema ====================

async function safeDdl(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (err?.code === "23505" || /already exists/i.test(msg)) return;
    throw err;
  }
}

async function ensureSchemaInternal() {
  await safeDdl(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_gps_day (
      imei character varying NOT NULL,
      usage_date date NOT NULL,
      car_code character varying,
      car_name character varying,
      points_count integer NOT NULL DEFAULT 0,
      points jsonb NOT NULL DEFAULT '[]'::jsonb,
      fetched_at timestamp without time zone NOT NULL DEFAULT LOCALTIMESTAMP(0),
      PRIMARY KEY (imei, usage_date)
    )
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_gps_day_date
    ON public.odg_tms_gps_day (usage_date)
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_gps_day_imei
    ON public.odg_tms_gps_day (imei)
  `);
}

async function ensureSchema() {
  if (cache.__tmsGpsDaySchemaReady) return;
  if (!cache.__tmsGpsDaySchemaPromise) {
    cache.__tmsGpsDaySchemaPromise = ensureSchemaInternal()
      .then(() => {
        cache.__tmsGpsDaySchemaReady = true;
      })
      .catch((err) => {
        cache.__tmsGpsDaySchemaPromise = null;
        throw err;
      });
  }
  await cache.__tmsGpsDaySchemaPromise;
}

// ==================== Queries ====================

// Returns Set of YYYY-MM-DD strings that already have a row
async function getExistingDays(imei, fromDate, toDate) {
  await ensureSchema();
  const rows = await query(
    `SELECT to_char(usage_date, 'YYYY-MM-DD') AS d
     FROM public.odg_tms_gps_day
     WHERE imei = $1 AND usage_date BETWEEN $2 AND $3`,
    [imei, fromDate, toDate]
  );
  return new Set(rows.map((r) => r.d));
}

async function hasDay(imei, usageDate) {
  await ensureSchema();
  const row = await queryOne(
    `SELECT 1 FROM public.odg_tms_gps_day WHERE imei = $1 AND usage_date = $2 LIMIT 1`,
    [imei, usageDate]
  );
  return row != null;
}

async function insertDay({ imei, car_code, car_name, usage_date, points }) {
  await ensureSchema();
  const pointsJson = JSON.stringify(Array.isArray(points) ? points : []);
  await pool.query(
    `INSERT INTO public.odg_tms_gps_day
       (imei, usage_date, car_code, car_name, points_count, points, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, LOCALTIMESTAMP(0))
     ON CONFLICT (imei, usage_date) DO UPDATE SET
       car_code = EXCLUDED.car_code,
       car_name = EXCLUDED.car_name,
       points_count = EXCLUDED.points_count,
       points = EXCLUDED.points,
       fetched_at = LOCALTIMESTAMP(0)`,
    [
      imei,
      usage_date,
      car_code ?? "",
      car_name ?? "",
      Array.isArray(points) ? points.length : 0,
      pointsJson,
    ]
  );
}

module.exports = {
  ensureSchema,
  getExistingDays,
  hasDay,
  insertDay,
};

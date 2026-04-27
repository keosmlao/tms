const { pool, query, queryOne } = require("../lib/db");
const { getGpsRealtimeAll } = require("./tracking");
const {
  ensureSchema: ensureCurrentSchema,
  upsertCurrentRow,
} = require("./gps-current");

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
    CREATE TABLE IF NOT EXISTS public.odg_tms_gps_realtime_log (
      roworder BIGSERIAL PRIMARY KEY,
      imei character varying NOT NULL,
      car_code character varying,
      car_name character varying,
      lat numeric,
      lng numeric,
      speed numeric,
      heading numeric,
      recorded_at timestamp without time zone,
      address text,
      fetched_at timestamp without time zone NOT NULL DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_gps_realtime_log_imei_ts
    ON public.odg_tms_gps_realtime_log (imei, recorded_at DESC)
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_gps_realtime_log_recorded_at
    ON public.odg_tms_gps_realtime_log (recorded_at DESC)
  `);
  // Unique per (imei, recorded_at) so backfill can use ON CONFLICT DO NOTHING
  // and the realtime worker no longer inserts duplicates for the same ping.
  // (NULL recorded_at slots are still allowed because PG treats NULL as distinct.)
  await safeDdl(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_odg_tms_gps_realtime_log_imei_ts
    ON public.odg_tms_gps_realtime_log (imei, recorded_at)
  `);
}

async function ensureSchema() {
  if (cache.__tmsGpsRealtimeLogSchemaReady) return;
  if (!cache.__tmsGpsRealtimeLogSchemaPromise) {
    cache.__tmsGpsRealtimeLogSchemaPromise = ensureSchemaInternal()
      .then(() => {
        cache.__tmsGpsRealtimeLogSchemaReady = true;
      })
      .catch((err) => {
        cache.__tmsGpsRealtimeLogSchemaPromise = null;
        throw err;
      });
  }
  await cache.__tmsGpsRealtimeLogSchemaPromise;
}

// ==================== Helpers ====================

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getLastRecordedAt(imei) {
  const row = await queryOne(
    `SELECT to_char(recorded_at, 'YYYY-MM-DD HH24:MI:SS') AS recorded_at
     FROM public.odg_tms_gps_realtime_log
     WHERE imei = $1
     ORDER BY recorded_at DESC NULLS LAST, roworder DESC
     LIMIT 1`,
    [imei]
  );
  return row?.recorded_at ?? null;
}

async function insertLogRow(row) {
  await pool.query(
    `INSERT INTO public.odg_tms_gps_realtime_log (
       imei, car_code, car_name, lat, lng, speed, heading,
       recorded_at, address
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (imei, recorded_at) DO NOTHING`,
    [
      String(row.imei ?? "").trim(),
      String(row.car_code ?? "").trim(),
      String(row.car_name ?? "").trim(),
      numOrNull(row.lat),
      numOrNull(row.lng),
      numOrNull(row.speed),
      numOrNull(row.heading),
      String(row.recorded_at ?? "").trim() || null,
      String(row.address ?? "").trim() || null,
    ]
  );
}

// Batch insert for backfill paths. Skips duplicates via unique index.
async function insertLogRowsBatch(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  await ensureSchema();
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    for (const r of batch) {
      const b = params.length;
      values.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`
      );
      params.push(
        String(r.imei ?? "").trim(),
        String(r.car_code ?? "").trim(),
        String(r.car_name ?? "").trim(),
        numOrNull(r.lat),
        numOrNull(r.lng),
        numOrNull(r.speed),
        numOrNull(r.heading),
        String(r.recorded_at ?? "").trim() || null,
        String(r.address ?? "").trim() || null
      );
    }
    const res = await pool.query(
      `INSERT INTO public.odg_tms_gps_realtime_log
         (imei, car_code, car_name, lat, lng, speed, heading, recorded_at, address)
       VALUES ${values.join(",")}
       ON CONFLICT (imei, recorded_at) DO NOTHING`,
      params
    );
    inserted += res.rowCount || 0;
  }
  return inserted;
}

// ==================== Worker ====================

let timer = null;
let running = false;

async function runTick() {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    await ensureSchema();
    await ensureCurrentSchema();
    const rows = await getGpsRealtimeAll();
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("[gps-realtime-log] no rows from provider");
      return;
    }
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    let currentOk = 0;
    let currentFail = 0;
    let currentStale = 0;
    for (const r of rows) {
      const imei = String(r.imei ?? "").trim();
      if (!imei) continue;

      // Skip overwriting "current" if provider returned no fix (e.g. 403 / network).
      // Preserves last known good lat/lng/state so the UI doesn't go offline.
      const hasFreshFix =
        String(r.lat ?? "").trim() !== "" && String(r.lng ?? "").trim() !== "";
      if (!hasFreshFix) {
        currentStale++;
      } else {
        try {
          await upsertCurrentRow(r);
          currentOk++;
        } catch (err) {
          currentFail++;
          console.error(
            `[gps-current] upsert failed imei=${imei}:`,
            err?.message ?? err
          );
        }
      }

      // Insert into history log only when recorded_at advances
      try {
        const recordedAt = String(r.recorded_at ?? "").trim();
        if (!recordedAt) {
          skipped++;
          continue;
        }
        const lastTs = await getLastRecordedAt(imei);
        if (lastTs && lastTs === recordedAt) {
          skipped++;
          continue;
        }
        await insertLogRow(r);
        inserted++;
      } catch (err) {
        errors++;
        console.error(
          `[gps-realtime-log] insert failed imei=${imei}:`,
          err?.message ?? err
        );
      }
    }
    const elapsed = Date.now() - started;
    console.log(
      `[gps-realtime-log] tick log_inserted=${inserted} log_skipped=${skipped} log_errors=${errors} current_ok=${currentOk} current_fail=${currentFail} current_stale=${currentStale} elapsed=${elapsed}ms`
    );
  } catch (err) {
    console.error("[gps-realtime-log] tick failed:", err?.message ?? err);
  } finally {
    running = false;
  }
}

function startWorker(options = {}) {
  if (timer) return;
  const intervalMs = Number(
    options.intervalMs ?? process.env.GPS_REALTIME_LOG_INTERVAL_MS ?? 20_000
  );
  const initialDelayMs = Number(
    options.initialDelayMs ??
      process.env.GPS_REALTIME_LOG_INITIAL_DELAY_MS ??
      5_000
  );
  console.log(
    `[gps-realtime-log] worker starting interval=${intervalMs}ms initial_delay=${initialDelayMs}ms`
  );
  setTimeout(() => void runTick(), initialDelayMs);
  timer = setInterval(() => void runTick(), intervalMs);
}

function stopWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

// ==================== Read ====================

async function getLogRange(imei, fromDate, toDate) {
  await ensureSchema();
  return query(
    `SELECT
       imei,
       COALESCE(car_code, '') AS car_code,
       COALESCE(car_name, '') AS car_name,
       lat::float AS lat,
       lng::float AS lng,
       COALESCE(speed, 0)::float AS speed,
       COALESCE(heading, 0)::float AS heading,
       to_char(recorded_at, 'YYYY-MM-DD HH24:MI:SS') AS recorded_at,
       COALESCE(address, '') AS address,
       to_char(fetched_at, 'YYYY-MM-DD HH24:MI:SS') AS fetched_at
     FROM public.odg_tms_gps_realtime_log
     WHERE imei = $1
       AND recorded_at >= $2::timestamp
       AND recorded_at <  ($3::date + INTERVAL '1 day')
     ORDER BY recorded_at ASC`,
    [imei, fromDate, toDate]
  );
}

module.exports = {
  startWorker,
  stopWorker,
  runTick,
  getLogRange,
  insertLogRowsBatch,
  ensureSchema,
};

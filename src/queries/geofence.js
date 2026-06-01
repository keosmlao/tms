// Per-branch delivery geofence. Each branch/warehouse (transport_type.code)
// can define a start point and an end point with a radius (default 50 m). When
// enabled, a driver must be within the start point's radius to begin dispatch
// and within the end point's radius to close the trip — enforced server-side
// from mobile.js so the rule can't be bypassed by the app.
const { pool, query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const { checkWithinRadius } = require("../lib/geo");

const geofenceCache = globalThis;
const DEFAULT_RADIUS_M = 50;

async function safeDdl(db, sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (err?.code === "23505" || /already exists/i.test(msg)) return;
    throw err;
  }
}

async function ensureGeofenceSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_geofence (
      transport_code character varying PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT false,
      start_lat character varying,
      start_lng character varying,
      end_lat character varying,
      end_lng character varying,
      radius_m integer NOT NULL DEFAULT ${DEFAULT_RADIUS_M},
      updated_by character varying,
      updated_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
}

// Cached like the other schema-ensures: applied once per process. Accepts an
// optional client so it can run inside the mobile action's transaction.
async function ensureGeofenceSchema(client) {
  if (geofenceCache.__tmsGeofenceSchemaReady) return;
  const db = client && client !== pool ? client : null;
  if (db) {
    await ensureGeofenceSchemaInternal(db);
    geofenceCache.__tmsGeofenceSchemaReady = true;
    return;
  }
  if (!geofenceCache.__tmsGeofenceSchemaPromise) {
    geofenceCache.__tmsGeofenceSchemaPromise = ensureGeofenceSchemaInternal(pool)
      .then(() => {
        geofenceCache.__tmsGeofenceSchemaReady = true;
      })
      .catch((err) => {
        geofenceCache.__tmsGeofenceSchemaPromise = null;
        throw err;
      });
  }
  await geofenceCache.__tmsGeofenceSchemaPromise;
}

function clampRadius(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : DEFAULT_RADIUS_M;
}

function coordOrNull(value) {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

// Admin: list every branch with its geofence config (LEFT JOIN so branches
// without a row appear with sensible defaults).
async function listGeofences() {
  await ensureGeofenceSchema();
  return query(
    `SELECT
       tt.code AS transport_code,
       COALESCE(NULLIF(TRIM(tt.name_1), ''), tt.code) AS name,
       COALESCE(g.enabled, false) AS enabled,
       COALESCE(g.start_lat, '') AS start_lat,
       COALESCE(g.start_lng, '') AS start_lng,
       COALESCE(g.end_lat, '') AS end_lat,
       COALESCE(g.end_lng, '') AS end_lng,
       COALESCE(g.radius_m, ${DEFAULT_RADIUS_M}) AS radius_m
     FROM public.transport_type tt
     LEFT JOIN public.odg_tms_geofence g ON g.transport_code = tt.code
     ORDER BY tt.code`
  );
}

// Admin: upsert one branch's geofence config.
async function saveGeofence({
  transport_code,
  enabled,
  start_lat,
  start_lng,
  end_lat,
  end_lng,
  radius_m,
  userCode,
}) {
  await ensureGeofenceSchema();
  const code = String(transport_code ?? "").trim();
  if (!code) throw new Error("transport_code is required");
  await pool.query(
    `INSERT INTO public.odg_tms_geofence
       (transport_code, enabled, start_lat, start_lng, end_lat, end_lng, radius_m, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, LOCALTIMESTAMP(0))
     ON CONFLICT (transport_code) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       start_lat = EXCLUDED.start_lat,
       start_lng = EXCLUDED.start_lng,
       end_lat = EXCLUDED.end_lat,
       end_lng = EXCLUDED.end_lng,
       radius_m = EXCLUDED.radius_m,
       updated_by = EXCLUDED.updated_by,
       updated_at = LOCALTIMESTAMP(0)`,
    [
      code,
      !!enabled,
      coordOrNull(start_lat),
      coordOrNull(start_lng),
      coordOrNull(end_lat),
      coordOrNull(end_lng),
      clampRadius(radius_m),
      userCode ? String(userCode).trim() || null : null,
    ]
  );
  return { success: true };
}

// Resolve the geofence row that applies to a trip: the job's
// origin_transport_code, falling back to the first bill's shipment branch.
// Returns null when no branch resolves or the branch has no geofence row.
async function getGeofenceForJob(client, docNo) {
  const runner = client ?? pool;
  await ensureGeofenceSchema(client);
  const row = await runner.query(
    `SELECT g.transport_code, g.enabled, g.start_lat, g.start_lng,
            g.end_lat, g.end_lng, g.radius_m
       FROM odg_tms t
       JOIN public.odg_tms_geofence g
         ON g.transport_code = COALESCE(
              NULLIF(TRIM(t.origin_transport_code), ''),
              (SELECT s.transport_code
                 FROM public.odg_tms_detail d
                 JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
                WHERE d.doc_no = t.doc_no
                LIMIT 1))
      WHERE t.doc_no = $1 AND ${getFixedYearSqlFilter("t.doc_date")}
      LIMIT 1`,
    [docNo]
  );
  return row.rows[0] ?? null;
}

// Enforcement entry point called from mobile.js inside the action transaction.
// `kind` is "start" (start_dispatch) or "end" (complete_job). Throws a 400 when
// the driver is outside the configured radius (or sent no location). No-op when
// the branch has no geofence, it's disabled, or the relevant point isn't set.
async function assertJobGeofence(client, { docNo, kind, lat, lng }) {
  const geo = await getGeofenceForJob(client, docNo);
  if (!geo || !geo.enabled) return;

  const targetLat = kind === "start" ? geo.start_lat : geo.end_lat;
  const targetLng = kind === "start" ? geo.start_lng : geo.end_lng;
  if (!targetLat || !targetLng) return; // point not configured → can't enforce

  const radius = clampRadius(geo.radius_m);
  const res = checkWithinRadius(lat, lng, targetLat, targetLng, radius);

  if (res.distance == null) {
    const err = new Error(
      kind === "start"
        ? "ກະລຸນາເປີດ GPS ກ່ອນເລີ່ມຈັດສົ່ງ (ບໍ່ພົບຕຳແໜ່ງມືຖື)"
        : "ກະລຸນາເປີດ GPS ກ່ອນປິດຖ້ຽວ (ບໍ່ພົບຕຳແໜ່ງມືຖື)"
    );
    err.status = 400;
    throw err;
  }
  if (!res.ok) {
    const m = Math.round(res.distance);
    const err = new Error(
      kind === "start"
        ? `ທ່ານຢູ່ຫ່າງຈຸດເລີ່ມຈັດສົ່ງ ${m} ແມັດ (ຕ້ອງບໍ່ເກີນ ${radius} ແມັດ) — ກະລຸນາໄປຢູ່ຈຸດເລີ່ມກ່ອນ`
        : `ທ່ານຢູ່ຫ່າງຈຸດສິ້ນສຸດ ${m} ແມັດ (ຕ້ອງບໍ່ເກີນ ${radius} ແມັດ) — ກະລຸນາໄປຢູ່ຈຸດສິ້ນສຸດກ່ອນ`
    );
    err.status = 400;
    throw err;
  }
}

module.exports = {
  ensureGeofenceSchema,
  listGeofences,
  saveGeofence,
  getGeofenceForJob,
  assertJobGeofence,
  DEFAULT_RADIUS_M,
};

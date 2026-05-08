const { pool, query, queryOne } = require("../lib/db");

const pendingBillCache = globalThis;

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

async function ensurePendingBillSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_pending_bill (
      bill_no character varying PRIMARY KEY,
      scheduled_date date,
      remark text,
      action_status character varying,
      delivery_route_code character varying,
      delivery_round_code character varying,
      updated_by character varying,
      updated_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms_pending_bill
    ADD COLUMN IF NOT EXISTS action_status character varying
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms_pending_bill
    ADD COLUMN IF NOT EXISTS delivery_route_code character varying
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms_pending_bill
    ADD COLUMN IF NOT EXISTS delivery_round_code character varying
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_pending_bill_scheduled
    ON public.odg_tms_pending_bill (scheduled_date)
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_pending_bill_status
    ON public.odg_tms_pending_bill (action_status) WHERE action_status IS NOT NULL
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_pending_bill_route
    ON public.odg_tms_pending_bill (delivery_route_code) WHERE delivery_route_code IS NOT NULL
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_pending_bill_round
    ON public.odg_tms_pending_bill (delivery_round_code) WHERE delivery_round_code IS NOT NULL
  `);
}

// Bump the cache version whenever the DDL changes so existing dev/prod
// processes re-run the ALTER TABLE migrations on next call (the global cache
// otherwise persists across hot-reloads).
const PENDING_BILL_SCHEMA_VERSION = "v3_route";

async function ensurePendingBillSchema() {
  const readyKey = `__tmsPendingBillSchemaReady_${PENDING_BILL_SCHEMA_VERSION}`;
  const promiseKey = `__tmsPendingBillSchemaPromise_${PENDING_BILL_SCHEMA_VERSION}`;
  if (pendingBillCache[readyKey]) return;
  if (!pendingBillCache[promiseKey]) {
    pendingBillCache[promiseKey] = ensurePendingBillSchemaInternal(pool)
      .then(() => {
        pendingBillCache[readyKey] = true;
      })
      .catch((err) => {
        pendingBillCache[promiseKey] = null;
        throw err;
      });
  }
  await pendingBillCache[promiseKey];
}

async function getPendingBillScheduleMap(billNos) {
  if (!Array.isArray(billNos) || billNos.length === 0) {
    return new Map();
  }
  await ensurePendingBillSchema();
  const rows = await query(
    `SELECT bill_no,
            to_char(scheduled_date,'YYYY-MM-DD') as scheduled_date,
            to_char(scheduled_date,'DD-MM-YYYY') as scheduled_date_display,
            COALESCE(remark, '') as remark,
            COALESCE(action_status, '') as action_status,
            COALESCE(delivery_route_code, '') as delivery_route_code,
            COALESCE(delivery_round_code, '') as delivery_round_code,
            COALESCE(updated_by, '') as updated_by,
            to_char(updated_at,'DD-MM-YYYY HH24:MI') as updated_at
     FROM public.odg_tms_pending_bill
     WHERE bill_no = ANY($1::varchar[])`,
    [billNos]
  );
  return new Map(rows.map((r) => [r.bill_no, r]));
}

async function upsertPendingBillSchedule({
  billNo,
  scheduledDate,
  remark,
  actionStatus,
  deliveryRouteCode,
  deliveryRoundCode,
  userCode,
}) {
  const code = String(billNo ?? "").trim();
  if (!code) throw new Error("bill_no is required");
  await ensurePendingBillSchema();

  const date = scheduledDate ? String(scheduledDate).trim() || null : null;
  const note = remark ? String(remark).trim() || null : null;
  const status = actionStatus ? String(actionStatus).trim() || null : null;
  const route = deliveryRouteCode ? String(deliveryRouteCode).trim() || null : null;
  const round = deliveryRoundCode ? String(deliveryRoundCode).trim() || null : null;
  const user = userCode ? String(userCode).trim() || null : null;

  // If all fields are blank, drop the row instead of keeping an empty entry.
  if (!date && !note && !status && !route && !round) {
    await pool.query(
      `DELETE FROM public.odg_tms_pending_bill WHERE bill_no = $1`,
      [code]
    );
    return { success: true, removed: true };
  }

  await pool.query(
    `INSERT INTO public.odg_tms_pending_bill (bill_no, scheduled_date, remark, action_status, delivery_route_code, delivery_round_code, updated_by, updated_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, LOCALTIMESTAMP(0))
     ON CONFLICT (bill_no) DO UPDATE
       SET scheduled_date = EXCLUDED.scheduled_date,
           remark = EXCLUDED.remark,
           action_status = EXCLUDED.action_status,
           delivery_route_code = EXCLUDED.delivery_route_code,
           delivery_round_code = EXCLUDED.delivery_round_code,
           updated_by = EXCLUDED.updated_by,
           updated_at = LOCALTIMESTAMP(0)`,
    [code, date, note, status, route, round, user]
  );
  return { success: true };
}

async function getPendingBillSchedule(billNo) {
  const code = String(billNo ?? "").trim();
  if (!code) return null;
  await ensurePendingBillSchema();
  return queryOne(
    `SELECT bill_no,
            to_char(scheduled_date,'YYYY-MM-DD') as scheduled_date,
            COALESCE(remark, '') as remark,
            COALESCE(action_status, '') as action_status,
            COALESCE(delivery_route_code, '') as delivery_route_code,
            COALESCE(delivery_round_code, '') as delivery_round_code,
            COALESCE(updated_by, '') as updated_by,
            to_char(updated_at,'DD-MM-YYYY HH24:MI') as updated_at
     FROM public.odg_tms_pending_bill
     WHERE bill_no = $1`,
    [code]
  );
}

module.exports = {
  ensurePendingBillSchema,
  getPendingBillScheduleMap,
  getPendingBillSchedule,
  upsertPendingBillSchedule,
};

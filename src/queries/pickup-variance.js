const { query, pool } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const { getBranchScope, branchFilterJob } = require("./helpers");
const { ensureDeliveryWorkflowSchema } = require("./delivery");

// ບິນເບີກບໍ່ຄົບ — the dispatcher's worklist of pickups where the driver reported
// a different quantity at the warehouse than the trip planned. Rows are written
// by the pickup_bill action (see src/queries/mobile.js); the trip itself was
// already corrected at that moment, so this list is about ACKNOWLEDGING that
// the office has seen it and dealt with the shortfall.
//
// One entry per pickup event = (doc_no, bill_no, created_at truncated to the
// second) — every item line written in the same transaction shares a timestamp.
// The item lines ride along in `items` so the UI can expand a row without a
// second round-trip.

const STATUS_VALUES = new Set(["open", "acknowledged", "all"]);

async function getPickupVarianceList(session, fromDate, toDate, status = "open") {
  await ensureDeliveryWorkflowSchema();
  const scope = getBranchScope(session);
  const mode = STATUS_VALUES.has(status) ? status : "open";
  const statusClause =
    mode === "open"
      ? "AND v.acknowledged_at IS NULL"
      : mode === "acknowledged"
      ? "AND v.acknowledged_at IS NOT NULL"
      : "";

  const rows = await query(
    `SELECT
       v.doc_no,
       v.bill_no,
       to_char(MAX(v.created_at), 'DD-MM-YYYY HH24:MI') AS created_at,
       MAX(v.created_at) AS created_at_raw,
       COALESCE(NULLIF(TRIM(cust.name_1), ''), NULLIF(TRIM(d.cust_code), ''), '-') AS cust_name,
       COALESCE(NULLIF(TRIM(drv.name_1), ''), NULLIF(TRIM(j.driver), ''), '-') AS driver_name,
       COALESCE(NULLIF(TRIM(carT.name_1), ''), NULLIF(TRIM(j.car), ''), '-') AS car_name,
       COALESCE(NULLIF(TRIM(tt.name_1), ''), NULLIF(TRIM(j.origin_transport_code), ''), '-') AS branch_name,
       COUNT(*)::int AS line_count,
       COALESCE(SUM(GREATEST(-v.diff_qty, 0)), 0)::numeric AS missing_qty,
       COUNT(*) FILTER (WHERE v.over_reported)::int AS over_count,
       COALESCE(MAX(NULLIF(TRIM(v.remark), '')), '') AS remark,
       BOOL_AND(v.acknowledged_at IS NOT NULL) AS acknowledged,
       COALESCE(to_char(MAX(v.acknowledged_at), 'DD-MM-YYYY HH24:MI'), '') AS acknowledged_at,
       COALESCE(NULLIF(TRIM(MAX(ack.name_1)), ''), MAX(v.acknowledged_by), '') AS acknowledged_by,
       json_agg(
         json_build_object(
           'item_code', v.item_code,
           'item_name', COALESCE(NULLIF(TRIM(v.item_name), ''), v.item_code),
           'unit_code', COALESCE(v.unit_code, ''),
           'planned_qty', v.planned_qty,
           'reported_qty', v.reported_qty,
           'actual_qty', v.actual_qty,
           'diff_qty', v.diff_qty,
           'over_reported', v.over_reported
         ) ORDER BY v.roworder
       ) AS items
     FROM public.odg_tms_pickup_variance v
     LEFT JOIN public.odg_tms j ON j.doc_no = v.doc_no
     LEFT JOIN public.odg_tms_detail d ON d.doc_no = v.doc_no AND d.bill_no = v.bill_no
     LEFT JOIN public.ar_customer cust ON cust.code = d.cust_code
     LEFT JOIN public.odg_tms_driver drv ON drv.code = j.driver
     LEFT JOIN public.odg_tms_car carT ON carT.code = j.car
     LEFT JOIN public.transport_type tt ON tt.code = j.origin_transport_code
     LEFT JOIN erp_user ack ON ack.code = v.acknowledged_by
     WHERE v.created_at::date BETWEEN $1::date AND $2::date
       AND ${getFixedYearSqlFilter("j.doc_date")}
       ${statusClause}
       ${branchFilterJob(scope, "j")}
     GROUP BY v.doc_no, v.bill_no, date_trunc('second', v.created_at),
              cust.name_1, d.cust_code, drv.name_1, j.driver, carT.name_1, j.car,
              tt.name_1, j.origin_transport_code
     ORDER BY MAX(v.created_at) DESC`,
    [fromDate, toDate]
  );

  return rows.map((row) => ({
    ...row,
    missing_qty: Number(row.missing_qty ?? 0),
    items: Array.isArray(row.items) ? row.items.map(normalizeItem) : [],
  }));
}

function normalizeItem(item) {
  return {
    ...item,
    planned_qty: Number(item?.planned_qty ?? 0),
    reported_qty: Number(item?.reported_qty ?? 0),
    actual_qty: Number(item?.actual_qty ?? 0),
    diff_qty: Number(item?.diff_qty ?? 0),
  };
}

// Mark every still-open variance line of one pickup as seen. Scoped to
// (doc_no, bill_no) rather than a row id so the dispatcher acknowledges the
// whole event in one click; already-acknowledged rows are left untouched so the
// original acknowledger and timestamp are never overwritten.
async function acknowledgePickupVariance(session, docNo, billNo) {
  await ensureDeliveryWorkflowSchema();
  const doc = String(docNo ?? "").trim();
  const bill = String(billNo ?? "").trim();
  if (!doc || !bill) throw new Error("doc_no ແລະ bill_no ຈຳເປັນ");
  const userCode = String(session?.usercode ?? "").trim() || null;

  const result = await pool.query(
    `UPDATE public.odg_tms_pickup_variance
     SET acknowledged_at = LOCALTIMESTAMP(0),
         acknowledged_by = $3
     WHERE doc_no = $1 AND bill_no = $2 AND acknowledged_at IS NULL`,
    [doc, bill, userCode]
  );
  return { success: true, updated: result.rowCount ?? 0 };
}

// Badge count for the sidebar / topbar: pickups still waiting to be seen.
async function getOpenPickupVarianceCount(session) {
  await ensureDeliveryWorkflowSchema();
  const scope = getBranchScope(session);
  const rows = await query(
    `SELECT COUNT(DISTINCT (v.doc_no, v.bill_no))::int AS n
     FROM public.odg_tms_pickup_variance v
     LEFT JOIN public.odg_tms j ON j.doc_no = v.doc_no
     WHERE v.acknowledged_at IS NULL
       AND ${getFixedYearSqlFilter("j.doc_date")}
       ${branchFilterJob(scope, "j")}`
  );
  return Number(rows[0]?.n ?? 0);
}

module.exports = {
  getPickupVarianceList,
  acknowledgePickupVariance,
  getOpenPickupVarianceCount,
};

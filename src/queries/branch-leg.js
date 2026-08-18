// ── Branch legs: ບິນ 1 ໃບ ຫຼາຍສາງ ຫຼາຍສາຂາ → ແຕ່ລະສາຂາຈັດຖ້ຽວສ່ວນຂອງຕົນເອງ ──
//
// A sale bill (ic_trans_shipment, flag 44) has ONE transport_code = its home
// delivery branch, and the dispatch pool locks it as a whole (check_status +
// odg_tms_detail). So when the goods sit in two warehouses that belong to two
// different branches, only the home branch could ever see or dispatch it, and
// the other branch had to wait until the home trip closed.
//
// This module fans such a bill out into "branch legs": one custom sub-bill
// (odg_tms_custom_bill, bill_no = `${bill}#${branch}`, parent_bill_no = bill)
// per FOREIGN branch, carrying that branch's warehouse items, and parked on that
// branch's pending queue (odg_tms_pending_bill.transport_code = branch, no date
// yet — the branch schedules it like any other bill). Every remaining-qty
// formula (queries/helpers.js split_off) subtracts leg items from the parent,
// so the home branch keeps only its own warehouses' goods and both branches can
// dispatch in parallel without ever double-shipping.
//
// Which bills / branches / quantities is decided by the pure planner in
// lib/warehouse-branch.js (planBranchLegs) — this file only does the I/O.
//
// Trigger: syncMultiBranchBillLegs() is called from the queue readers
// (getBillsPending / getAvailableBillsWithProducts) with a per-process
// throttle, so the very first time ANY dispatcher opens the queue after a
// multi-branch bill lands in the ERP, the legs exist for every branch.
"use strict";

const { pool, query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  DELIVERY_BRANCH_CODES,
  BRANCH_STOCK_TO_TRANSPORT,
  planBranchLegs,
  branchLegBillNo,
} = require("../lib/warehouse-branch");
const { invalidateRemainingSummary, invalidatePendingList } = require("./helpers");

const BRANCH_LEG_SYSTEM_USER = "system:branch-leg";
// How far back (doc_date) the planner looks for un-split bills. The queue's
// own window is the fixed year, but a bill older than this that is still open
// has long been handled by hand — no point re-scanning it every minute.
const SYNC_LOOKBACK_DAYS = 60;
// The sync is idempotent and cheap once the legs exist, but it still scans
// ic_trans_detail for every open bill — once a minute per process is plenty.
const SYNC_THROTTLE_MS = 60_000;

const legCache = globalThis;
function throttleState() {
  if (!legCache.__tmsBranchLegSync) {
    legCache.__tmsBranchLegSync = { lastRunAt: 0, inflight: null };
  }
  return legCache.__tmsBranchLegSync;
}

async function ensureBranchLegSchema() {
  const { ensurePendingBillSchema } = require("./pending-bill");
  await ensurePendingBillSchema();
}

// Every (bill, warehouse, item) line of the open multi-branch sale bills that
// still lack a leg for at least one foreign branch, with the qty already placed
// on a non-cancelled trip or returned via credit note netted out by the planner.
async function loadCandidateLines() {
  const stockKeys = Object.keys(BRANCH_STOCK_TO_TRANSPORT);
  const stockVals = stockKeys.map((k) => BRANCH_STOCK_TO_TRANSPORT[k]);
  return query(
    `WITH map(branch_stock, transport_code) AS (
       SELECT * FROM unnest($1::text[], $2::text[])
     ),
     parents AS (
       SELECT a.doc_no,
              COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) AS home
       FROM ic_trans_shipment a
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.doc_no
       -- No check_status gate on purpose: a bill the home branch has ALREADY
       -- put on an open trip (with only its own warehouse's items) is exactly
       -- the case where the other branch is waiting — its un-placed foreign
       -- items still get a leg (placed qty is netted out below).
       WHERE a.trans_flag = 44
         AND ${getFixedYearSqlFilter("a.doc_date")}
         AND a.doc_date >= CURRENT_DATE - $3::int
         AND COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) = ANY($4::varchar[])
     ),
     lines AS (
       SELECT p.doc_no, p.home,
              COALESCE(NULLIF(TRIM(d.wh_code), ''), '') AS wh_code,
              d.item_code,
              MAX(d.item_name) AS item_name,
              MAX(d.unit_code) AS unit_code,
              SUM(COALESCE(d.qty, 0))::numeric AS erp_qty
       FROM ic_trans_detail d
       INNER JOIN parents p ON p.doc_no = d.doc_no
       WHERE d.item_code NOT LIKE '97%'
       GROUP BY p.doc_no, p.home, COALESCE(NULLIF(TRIM(d.wh_code), ''), ''), d.item_code
     ),
     mapped AS (
       SELECT l.*,
              COALESCE(w.name_1, NULLIF(l.wh_code, ''), 'ບໍ່ລະບຸສາງ') AS wh_name,
              COALESCE(NULLIF(TRIM(w.branch_stock), ''), '') AS branch_stock,
              CASE WHEN m.transport_code = ANY($4::varchar[]) THEN m.transport_code ELSE l.home END AS leg_branch
       FROM lines l
       LEFT JOIN public.ic_warehouse w ON w.code = NULLIF(l.wh_code, '')
       LEFT JOIN map m ON m.branch_stock = NULLIF(TRIM(w.branch_stock), '')
     ),
     -- only bills that span ≥ 2 branches AND still miss a leg for some foreign branch
     todo AS (
       SELECT doc_no
       FROM mapped
       GROUP BY doc_no
       HAVING COUNT(DISTINCT leg_branch) >= 2
          AND bool_or(
            leg_branch <> home
            AND NOT EXISTS (
              SELECT 1 FROM public.odg_tms_custom_bill cb
              WHERE cb.bill_no = mapped.doc_no || '#' || mapped.leg_branch
            )
          )
     ),
     placed AS (
       SELECT i.bill_no, i.item_code,
              SUM(COALESCE(i.selected_qty, 0))::numeric AS placed_qty
       FROM public.odg_tms_detail_item i
       INNER JOIN public.odg_tms_detail det
         ON det.bill_no = i.bill_no AND det.doc_no = i.doc_no
       INNER JOIN todo t ON t.doc_no = i.bill_no
       WHERE COALESCE(det.status, 0) <> 2
       GROUP BY i.bill_no, i.item_code
     ),
     returned AS (
       SELECT rd.ref_doc_no AS bill_no, rd.item_code,
              COALESCE(SUM(ABS(COALESCE(rd.qty, 0))), 0)::numeric AS returned_qty
       FROM ic_trans_detail rd
       INNER JOIN todo t ON t.doc_no = rd.ref_doc_no
       INNER JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
       WHERE rd.item_code NOT LIKE '97%'
       GROUP BY rd.ref_doc_no, rd.item_code
     )
     SELECT mp.doc_no,
            mp.home AS home_transport_code,
            mp.wh_code, mp.wh_name, mp.branch_stock,
            mp.item_code, mp.item_name, mp.unit_code,
            mp.erp_qty,
            COALESCE(pl.placed_qty, 0)::numeric AS placed_qty,
            COALESCE(rt.returned_qty, 0)::numeric AS returned_qty
     FROM mapped mp
     INNER JOIN todo t ON t.doc_no = mp.doc_no
     LEFT JOIN placed pl ON pl.bill_no = mp.doc_no AND pl.item_code = mp.item_code
     LEFT JOIN returned rt ON rt.bill_no = mp.doc_no AND rt.item_code = mp.item_code
     ORDER BY mp.doc_no, mp.wh_code, mp.item_code`,
    [stockKeys, stockVals, SYNC_LOOKBACK_DAYS, DELIVERY_BRANCH_CODES]
  );
}

// Snapshot of customer name/phone for the sub-bill (custom bills carry no
// cust_code link) — same source the manual split tool uses.
async function loadParentCustomers(parentBillNos) {
  if (parentBillNos.length === 0) return new Map();
  const rows = await query(
    `SELECT s.doc_no,
            COALESCE(NULLIF(TRIM(c.name_1), ''), s.cust_code, '') AS cust_name,
            COALESCE(NULLIF(TRIM(c.telephone), ''), '') AS telephone
     FROM public.ic_trans_shipment s
     LEFT JOIN ar_customer c ON c.code = s.cust_code
     WHERE s.doc_no = ANY($1::varchar[])`,
    [parentBillNos]
  );
  return new Map(rows.map((r) => [r.doc_no, r]));
}

async function insertLeg(client, plan, customer) {
  const legNo = branchLegBillNo(plan.parent_bill_no, plan.transport_code);
  const whLabel = plan.wh_labels.filter(Boolean).join(", ");
  const remark = `ແຍກຈາກບິນ ${plan.parent_bill_no}${whLabel ? ` · ${whLabel}` : ""}`;
  const custName = (customer?.cust_name || plan.parent_bill_no).trim() || plan.parent_bill_no;
  const telephone = (customer?.telephone || "").trim() || null;
  // ON CONFLICT DO NOTHING: two processes may plan the same leg in the same
  // minute — the PK is deterministic, first writer wins, nothing to reconcile.
  const inserted = await client.query(
    `INSERT INTO public.odg_tms_custom_bill (bill_no, cust_name, telephone, items, remark, created_by, parent_bill_no)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (bill_no) DO NOTHING
     RETURNING bill_no`,
    [legNo, custName, telephone, JSON.stringify(plan.items), remark, BRANCH_LEG_SYSTEM_USER, plan.parent_bill_no]
  );
  if (inserted.rowCount === 0) return null;
  // Park it on the target branch's queue. No date/round yet — that branch's
  // dispatcher schedules it (bills-pending → jobs/add) exactly like an ERP bill.
  await client.query(
    `INSERT INTO public.odg_tms_pending_bill (bill_no, transport_code, remark, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, LOCALTIMESTAMP(0))
     ON CONFLICT (bill_no) DO UPDATE
       SET transport_code = EXCLUDED.transport_code,
           updated_at = LOCALTIMESTAMP(0)`,
    [legNo, plan.transport_code, remark, BRANCH_LEG_SYSTEM_USER]
  );
  return legNo;
}

async function runSync() {
  await ensureBranchLegSchema();
  const lines = await loadCandidateLines();
  if (lines.length === 0) return { scanned: 0, created: [] };
  const plans = planBranchLegs(lines);
  if (plans.length === 0) return { scanned: lines.length, created: [] };
  const parents = Array.from(new Set(plans.map((p) => p.parent_bill_no)));
  const customers = await loadParentCustomers(parents);
  const created = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const plan of plans) {
      const legNo = await insertLeg(client, plan, customers.get(plan.parent_bill_no));
      if (legNo) created.push({ bill_no: legNo, parent_bill_no: plan.parent_bill_no, transport_code: plan.transport_code });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (created.length > 0) {
    // The parents just lost items to their legs — drop the cached counts so the
    // home branch's list shrinks immediately, not after the TTL.
    invalidateRemainingSummary(Array.from(new Set(created.map((c) => c.parent_bill_no))));
    invalidatePendingList();
    console.log(`[branch-leg] created ${created.length} leg(s): ${created.map((c) => c.bill_no).join(", ")}`);
  }
  return { scanned: lines.length, created };
}

// Dry run: what WOULD be created right now (no writes). Handy for verifying the
// warehouse→branch mapping against live bills before trusting the sync.
async function previewBranchLegs() {
  await ensureBranchLegSchema();
  const lines = await loadCandidateLines();
  return { scanned: lines.length, plans: planBranchLegs(lines) };
}

// Plan + create any missing branch legs. Throttled per process (SYNC_THROTTLE_MS)
// unless { force: true }; concurrent callers share one in-flight run. Never
// throws — a failed sync must not take the dispatch queue down with it.
async function syncMultiBranchBillLegs({ force = false } = {}) {
  const state = throttleState();
  if (state.inflight) return state.inflight;
  if (!force && Date.now() - state.lastRunAt < SYNC_THROTTLE_MS) {
    return { scanned: 0, created: [], skipped: true };
  }
  state.inflight = runSync()
    .catch((err) => {
      console.error("[branch-leg] sync failed:", err);
      return { scanned: 0, created: [], error: String(err?.message ?? err) };
    })
    .finally(() => {
      state.lastRunAt = Date.now();
      state.inflight = null;
    });
  return state.inflight;
}

// Active (non-cancelled) legs of the given parent bills, keyed by parent —
// for the "ແຍກໄປສາຂາ …" badge on the parent row and the jobs/add banner.
async function getBranchLegsForBills(parentBillNos) {
  const parents = Array.from(
    new Set((parentBillNos ?? []).map((b) => String(b ?? "").trim()).filter(Boolean))
  );
  const map = new Map();
  if (parents.length === 0) return map;
  await ensureBranchLegSchema();
  const rows = await query(
    `SELECT cb.parent_bill_no, cb.bill_no,
            COALESCE(NULLIF(TRIM(pb.transport_code), ''), '') AS transport_code,
            COALESCE(NULLIF(TRIM(tt.name_1), ''), NULLIF(TRIM(pb.transport_code), ''), '') AS transport_name,
            COALESCE(cb.remark, '') AS remark,
            to_char(pb.scheduled_date, 'DD-MM-YYYY') AS scheduled_date_display,
            EXISTS (
              SELECT 1 FROM public.odg_tms_detail d
              WHERE d.bill_no = cb.bill_no AND COALESCE(d.status, 0) NOT IN (1, 2)
            ) AS on_open_trip,
            EXISTS (
              SELECT 1 FROM public.odg_tms_detail d
              WHERE d.bill_no = cb.bill_no AND COALESCE(d.status, 0) = 1
            ) AS delivered
     FROM public.odg_tms_custom_bill cb
     LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = cb.bill_no
     LEFT JOIN public.transport_type tt ON tt.code = NULLIF(TRIM(pb.transport_code), '')
     WHERE cb.parent_bill_no = ANY($1::varchar[])
       AND cb.leg_cancelled_at IS NULL
     ORDER BY cb.parent_bill_no, cb.bill_no`,
    [parents]
  );
  for (const row of rows) {
    const list = map.get(row.parent_bill_no) ?? [];
    list.push({
      bill_no: row.bill_no,
      transport_code: row.transport_code,
      transport_name: row.transport_name,
      remark: row.remark,
      scheduled_date_display: row.scheduled_date_display ?? null,
      on_open_trip: Boolean(row.on_open_trip),
      delivered: Boolean(row.delivered),
    });
    map.set(row.parent_bill_no, list);
  }
  return map;
}

async function getBranchLegsForBill(parentBillNo) {
  const map = await getBranchLegsForBills([parentBillNo]);
  return map.get(String(parentBillNo ?? "").trim()) ?? [];
}

// Dispatcher removed a leg from its branch's queue: the home branch will
// deliver those goods after all. Tombstone the leg (so the planner does not
// recreate it) and give its items back to the parent. Refused once the leg is
// already on a trip — cancel that trip stop instead.
async function cancelBranchLeg(legBillNo, userCode) {
  const legNo = String(legBillNo ?? "").trim();
  if (!legNo) throw new Error("bill_no is required");
  await ensureBranchLegSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const leg = (
      await client.query(
        `SELECT bill_no, parent_bill_no FROM public.odg_tms_custom_bill
         WHERE bill_no = $1 AND parent_bill_no IS NOT NULL FOR UPDATE`,
        [legNo]
      )
    ).rows[0];
    if (!leg) {
      await client.query("ROLLBACK");
      return { success: false, notLeg: true };
    }
    const used = (
      await client.query(
        `SELECT 1 FROM public.odg_tms_detail WHERE bill_no = $1 LIMIT 1`,
        [legNo]
      )
    ).rowCount;
    if (used > 0) {
      await client.query("ROLLBACK");
      throw new Error(`ບິນຍ່ອຍ ${legNo} ຢູ່ໃນຖ້ຽວແລ້ວ — ຍົກເລີກທີ່ຖ້ຽວກ່ອນ`);
    }
    await client.query(
      `UPDATE public.odg_tms_custom_bill
       SET leg_cancelled_at = LOCALTIMESTAMP(0),
           remark = COALESCE(remark, '') || ' · ຍົກເລີກໂດຍ ' || COALESCE($2, '-')
       WHERE bill_no = $1`,
      [legNo, userCode ? String(userCode) : null]
    );
    await client.query(`DELETE FROM public.odg_tms_pending_bill WHERE bill_no = $1`, [legNo]);
    await client.query("COMMIT");
    invalidateRemainingSummary([leg.parent_bill_no]);
    invalidatePendingList();
    return { success: true, parent_bill_no: leg.parent_bill_no };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  BRANCH_LEG_SYSTEM_USER,
  previewBranchLegs,
  syncMultiBranchBillLegs,
  getBranchLegsForBills,
  getBranchLegsForBill,
  cancelBranchLeg,
};

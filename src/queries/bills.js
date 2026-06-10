const { query, queryOne, queryB } = require("../lib/db");
const {
  coerceDateToFixedYear,
  getFixedTodayDate,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterShipment,
  branchFilterJob,
  ensureJobListIndexes,
  ensureTmsDetailItemTable,
  ensureForwardBranchColumn,
  getRemainingBillProducts,
  getRemainingSummaryMap,
} = require("./helpers");

// Only surface bills that the department head has scheduled — i.e. both
// scheduled_date AND delivery_round_code must be set in odg_tms_pending_bill.
// Bills not yet triaged are not addable to a job until they are scheduled.
const SCHEDULED_BILL_JOIN = `
  INNER JOIN public.odg_tms_pending_bill pb
    ON pb.bill_no = a.doc_no
    AND pb.scheduled_date IS NOT NULL
    AND COALESCE(NULLIF(TRIM(pb.delivery_round_code), ''), NULL) IS NOT NULL
  LEFT JOIN public.odg_tms_delivery_round dr ON dr.code = pb.delivery_round_code`;

const SCHEDULED_BILL_FIELDS = `
  to_char(pb.scheduled_date,'YYYY-MM-DD') as scheduled_date,
  to_char(pb.scheduled_date,'DD-MM-YYYY') as scheduled_date_display,
  pb.delivery_round_code,
  pb.delivery_route_code,
  COALESCE(dr.name, '') as delivery_round_name,
  COALESCE(dr.time_label, '') as delivery_round_time_label`;

const MANUAL_IC_TRANS_FLAGS = [56, 72, 44, 48];
// ບິນໂອນ (transfer bills) — when scheduling a trip we only surface this flag.
const TRANSFER_BILL_FLAG = 72;
const SERVICE_SOURCE_TYPE = "odservice.tb_product";

// The "ລໍຖ້າຈັດຖ້ຽວ" (bills-pending) queue only dispatches the three internal
// delivery branches: 02-0001 ໂອດ້ຽນ/ຂົວຫຼວງ · 02-0002 ດອນຕິ້ວ · 02-0003 ປາກເຊ.
// Every other transport code — customer self-pickup (02-0004), ThunJai
// (02-0005), technician-pickup (02-0006), and any other branch — is handled
// outside this queue and must NOT appear here.
const DELIVERY_BRANCH_CODES = ["02-0001", "02-0002", "02-0003"];
function deliveryBranchListSql() {
  return DELIVERY_BRANCH_CODES.map((c) => `'${c}'`).join(", ");
}

function manualFlagListSql() {
  return MANUAL_IC_TRANS_FLAGS.join(",");
}

async function applyRemainingCounts(rows) {
  const serviceRows = rows.filter((row) => row.source_type === SERVICE_SOURCE_TYPE);
  const normalRows = rows.filter((row) => row.source_type !== SERVICE_SOURCE_TYPE);
  const [normalSummaries, serviceSummaries] = await Promise.all([
    getRemainingSummaryMap(normalRows.map((row) => row.doc_no)),
    getServiceSummaryMap(serviceRows.map((row) => row.doc_no)),
  ]);
  return rows.map((row) => {
    const summary =
      row.source_type === SERVICE_SOURCE_TYPE
        ? serviceSummaries.get(row.doc_no)
        : normalSummaries.get(row.doc_no);
    return {
      ...row,
      count_item: summary?.remaining_count ?? 0,
      remaining_qty_total: summary?.remaining_qty_total ?? 0,
    };
  });
}

async function getServiceBillProducts(billNo) {
  await ensureTmsDetailItemTable();
  const billItems = await queryB(
    `SELECT
       d.code AS item_code,
       MAX(COALESCE(NULLIF(TRIM(d.name_1), ''), NULLIF(TRIM(d.p_model), ''), d.code)) AS item_name,
       COUNT(*)::numeric AS total_qty,
       'ເຄື່ອງ' AS unit_code
     FROM public.tb_product d
     WHERE d.code = $1
     GROUP BY d.code
     ORDER BY d.code`,
    [billNo]
  );
  if (billItems.length === 0) return [];
  // Service bills (tb_product) can be re-delivered for repeat servicing, so
  // we don't subtract delivered_qty — only the qty currently held by an
  // in-flight job is unavailable.
  const usageRows = await query(
    `SELECT item.item_code,
            COALESCE(SUM(item.selected_qty), 0)::numeric AS locked_qty
     FROM public.odg_tms_detail_item item
     INNER JOIN public.odg_tms_detail det
       ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
     WHERE item.bill_no = $1
       AND COALESCE(det.status, 0) NOT IN (1, 2)
     GROUP BY item.item_code`,
    [billNo]
  );
  const usage = new Map(usageRows.map((row) => [row.item_code, row]));
  return billItems
    .map((row) => {
      const used = usage.get(row.item_code);
      const qty = Math.max(
        Number(row.total_qty ?? 0) - Number(used?.locked_qty ?? 0),
        0
      );
      return {
        item_code: row.item_code,
        item_name: row.item_name,
        qty,
        unit_code: row.unit_code,
      };
    })
    .filter((row) => row.qty > 0);
}

async function getServiceSummaryMap(billNos) {
  if (!Array.isArray(billNos) || billNos.length === 0) return new Map();
  const result = new Map(billNos.map((billNo) => [billNo, { remaining_count: 0, remaining_qty_total: 0 }]));
  for (const billNo of billNos) {
    const products = await getServiceBillProducts(billNo);
    result.set(billNo, {
      remaining_count: products.length,
      remaining_qty_total: products.reduce((sum, product) => sum + Number(product.qty || 0), 0),
    });
  }
  return result;
}

async function getAvailableBillsWithProducts(session) {
  await ensurePendingBillSchema();
  await ensureForwardBranchColumn();
  const scope = getBranchScope(session);
  const [shipmentBills, manualBills] = await Promise.all([
    query(
    `SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.cust_code, b.name_1 as cust_name, b.telephone,
      (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no AND item_code NOT LIKE '97%') as count_item,
      ${SCHEDULED_BILL_FIELDS},
      COALESCE(a.transport_code, '') as origin_transport_code,
      COALESCE(tt.name_1, '') as origin_transport_name,
      CASE WHEN fwd.bill_no IS NULL THEN false ELSE true END as incoming_forwarded,
      COALESCE(fwd.origin_transport_code, '') as forward_from_transport_code,
      COALESCE(fwd.origin_transport_name, '') as forward_from_transport_name,
      COALESCE(fwd.forwarded_at, '') as forwarded_at
    FROM ic_trans_shipment a
    LEFT JOIN ar_customer b ON b.code=a.cust_code
    LEFT JOIN public.transport_type tt ON tt.code = a.transport_code
    ${SCHEDULED_BILL_JOIN}
    LEFT JOIN LATERAL (
      SELECT d.bill_no,
             COALESCE(j.origin_transport_code, '') as origin_transport_code,
             COALESCE(ott.name_1, '') as origin_transport_name,
             to_char(COALESCE(d.sent_end, d.create_date_time_now), 'DD-MM-YYYY HH24:MI') as forwarded_at
      FROM public.odg_tms_detail d
      LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
      LEFT JOIN public.transport_type ott ON ott.code = j.origin_transport_code
      WHERE d.bill_no = a.doc_no
        AND COALESCE(d.status, 0) = 1
        AND NULLIF(TRIM(d.forward_transport_code), '') = a.transport_code
        AND ${getFixedYearSqlFilter("d.doc_date")}
      ORDER BY COALESCE(d.sent_end, d.create_date_time_now) DESC
      LIMIT 1
    ) fwd ON true
    WHERE a.trans_flag=44 AND a.check_status=0
      ${branchFilterShipment(scope, "a")}
      AND ${getFixedYearSqlFilter("a.doc_date")}
    ORDER BY pb.scheduled_date ASC, a.doc_date DESC`
    ),
    getManualReadyBills(),
  ]);
  const shipmentDocNos = new Set(shipmentBills.map((bill) => bill.doc_no));
  const bills = [...shipmentBills, ...manualBills.filter((bill) => !shipmentDocNos.has(bill.doc_no))];
  const availableBills = (await applyRemainingCounts(bills)).filter((bill) => bill.count_item > 0);

  const result = [];
  for (const bill of availableBills) {
    const products = await getAvailableBillProducts(bill.doc_no);
    if (products.length > 0) {
      result.push({ ...bill, products, count_item: products.length });
    }
  }
  return result;
}

async function getAvailableBills(session) {
  await ensurePendingBillSchema();
  await ensureForwardBranchColumn();
  const scope = getBranchScope(session);
  const [shipmentBills, manualBills] = await Promise.all([
    query(
    `SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.cust_code,
      b.name_1 as cust_name, b.telephone,
      (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no AND item_code NOT LIKE '97%') as count_item,
      ${SCHEDULED_BILL_FIELDS},
      COALESCE(a.transport_code, '') as origin_transport_code,
      COALESCE(tt.name_1, '') as origin_transport_name,
      -- Effective delivery branch (pending override wins, else the shipment's) —
      -- used by the create-trip page so a manager can pick a branch and a branch
      -- admin defaults to their own.
      COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code, '') as delivery_transport_code,
      CASE WHEN fwd.bill_no IS NULL THEN false ELSE true END as incoming_forwarded,
      COALESCE(fwd.origin_transport_code, '') as forward_from_transport_code,
      COALESCE(fwd.origin_transport_name, '') as forward_from_transport_name,
      COALESCE(fwd.forwarded_at, '') as forwarded_at,
      COALESCE(pb.planned_lat::text, NULLIF(TRIM(acd.latitude::text), ''), '') as planned_lat,
      COALESCE(pb.planned_lng::text, NULLIF(TRIM(acd.longitude::text), ''), '') as planned_lng
    FROM ic_trans_shipment a
    LEFT JOIN ar_customer b ON b.code=a.cust_code
    LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
    LEFT JOIN public.transport_type tt ON tt.code = a.transport_code
    ${SCHEDULED_BILL_JOIN}
    LEFT JOIN LATERAL (
      SELECT d.bill_no,
             COALESCE(j.origin_transport_code, '') as origin_transport_code,
             COALESCE(ott.name_1, '') as origin_transport_name,
             to_char(COALESCE(d.sent_end, d.create_date_time_now), 'DD-MM-YYYY HH24:MI') as forwarded_at
      FROM public.odg_tms_detail d
      LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
      LEFT JOIN public.transport_type ott ON ott.code = j.origin_transport_code
      WHERE d.bill_no = a.doc_no
        AND COALESCE(d.status, 0) = 1
        AND NULLIF(TRIM(d.forward_transport_code), '') = a.transport_code
        AND ${getFixedYearSqlFilter("d.doc_date")}
      ORDER BY COALESCE(d.sent_end, d.create_date_time_now) DESC
      LIMIT 1
    ) fwd ON true
    WHERE a.trans_flag=44
      ${branchFilterShipment(scope, "a")}
      AND ${getFixedYearSqlFilter("a.doc_date")}
    ORDER BY pb.scheduled_date ASC, a.doc_date DESC`
    ),
    getManualReadyBills(),
  ]);
  const shipmentDocNos = new Set(shipmentBills.map((bill) => bill.doc_no));
  const bills = [...shipmentBills, ...manualBills.filter((bill) => !shipmentDocNos.has(bill.doc_no))];
  return (await applyRemainingCounts(bills)).filter((bill) => bill.count_item > 0);
}

async function getAvailableBillProducts(docNo) {
  const products = await getRemainingBillProducts(docNo);
  if (products.length > 0) return products;
  return getServiceBillProducts(docNo);
}

async function searchManualPendingBills(q) {
  await ensurePendingBillSchema();
  const text = String(q ?? "").trim();
  if (text.length < 2) return [];
  const [icRows, serviceRows] = await Promise.all([
    query(
    `SELECT a.doc_no,
            to_char(a.doc_date,'DD-MM-YYYY') as doc_date,
            a.cust_code,
            COALESCE(NULLIF(TRIM(b.name_1), ''), a.cust_code, '') as cust_name,
            COALESCE(b.telephone, '') as telephone,
            a.trans_flag as source_trans_flag,
            to_char(pb.scheduled_date,'YYYY-MM-DD') as scheduled_date,
            to_char(pb.scheduled_date,'DD-MM-YYYY') as scheduled_date_display,
            COALESCE(pb.delivery_route_code, '') as delivery_route_code,
            COALESCE(pb.delivery_round_code, '') as delivery_round_code,
            COALESCE(dr.name, '') as delivery_round_name,
            COALESCE(dr.time_label, '') as delivery_round_time_label,
            COALESCE(pb.transport_code, '') as transport_code,
            'ic_trans' as source_type
     FROM ic_trans a
     LEFT JOIN ar_customer b ON b.code = a.cust_code
     LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.doc_no
     LEFT JOIN public.odg_tms_delivery_round dr ON dr.code = pb.delivery_round_code
     WHERE a.trans_flag IN (${manualFlagListSql()})
       AND (
         a.doc_no ILIKE $1
         OR a.cust_code ILIKE $1
         OR COALESCE(b.name_1, '') ILIKE $1
       )
     ORDER BY a.doc_date DESC
     LIMIT 30`,
    [`%${text}%`]
    ),
    queryB(
      `SELECT s.code as doc_no,
              to_char(MAX(COALESCE(s.time_register, s.create_date_time_now)),'DD-MM-YYYY') as doc_date,
              COALESCE(MAX(NULLIF(TRIM(s.cust_code), '')), '') as cust_code,
              COALESCE(MAX(NULLIF(TRIM(s.name_1), '')), MAX(NULLIF(TRIM(s.p_model), '')), s.code) as cust_name,
              '' as telephone,
              NULL::int as source_trans_flag,
              '${SERVICE_SOURCE_TYPE}' as source_type
       FROM public.tb_product s
       WHERE (
         s.code ILIKE $1
         OR COALESCE(s.cust_code, '') ILIKE $1
         OR COALESCE(s.name_1, '') ILIKE $1
         OR COALESCE(s.sn, '') ILIKE $1
         OR COALESCE(s.p_model, '') ILIKE $1
         OR COALESCE(s.p_brand, '') ILIKE $1
       )
       GROUP BY s.code
       ORDER BY MAX(COALESCE(s.time_register, s.create_date_time_now)) DESC
       LIMIT 30`,
      [`%${text}%`]
    ),
  ]);
  const serviceDocNos = serviceRows.map((row) => row.doc_no);
  const serviceScheduleMap = await getPendingBillScheduleMap(serviceDocNos);
  const serviceRowsWithSchedule = serviceRows.map((row) => {
    const sched = serviceScheduleMap.get(row.doc_no);
    return {
      ...row,
      scheduled_date: sched?.scheduled_date ?? null,
      scheduled_date_display: sched?.scheduled_date_display ?? null,
      delivery_route_code: sched?.delivery_route_code ?? "",
      delivery_round_code: sched?.delivery_round_code ?? "",
      delivery_round_name: "",
      delivery_round_time_label: "",
      transport_code: sched?.transport_code ?? "",
    };
  });
  const icSummaries = await getRemainingSummaryMap(icRows.map((row) => row.doc_no));
  const serviceSummaries = await getServiceSummaryMap(serviceRows.map((row) => row.doc_no));
  const icResult = icRows
    .map((row) => ({
      ...row,
      count_item: icSummaries.get(row.doc_no)?.remaining_count ?? 0,
    }))
    .filter((row) => row.count_item > 0);
  // Service bills (tb_product) can be re-added to pending after a completed
  // delivery — the same unit may come back for repeat servicing — so we keep
  // them in search results regardless of remaining_count.
  const serviceResult = serviceRowsWithSchedule.map((row) => ({
    ...row,
    count_item: serviceSummaries.get(row.doc_no)?.remaining_count ?? 0,
  }));
  const seen = new Set();
  return [...icResult, ...serviceResult].filter((row) => {
    const key = `${row.source_type}:${row.doc_no}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function addManualPendingBill({ billNo, scheduledDate, deliveryRoundCode, deliveryRouteCode, transportCode, remark, userCode, sourceType }) {
  const code = String(billNo ?? "").trim();
  const date = String(scheduledDate ?? "").trim();
  const round = String(deliveryRoundCode ?? "").trim();
  const route = deliveryRouteCode ? String(deliveryRouteCode).trim() : "";
  const transport = transportCode ? String(transportCode).trim() : "";
  if (!code) throw new Error("bill_no is required");
  if (!date) throw new Error("scheduled_date is required");
  if (!round) throw new Error("delivery_round_code is required");
  await ensurePendingBillSchema();
  const requestedSource = String(sourceType ?? "").trim();
  const icBill = requestedSource === SERVICE_SOURCE_TYPE ? null : await queryOne(
    `SELECT doc_no FROM ic_trans
     WHERE doc_no = $1
       AND trans_flag IN (${manualFlagListSql()})`,
    [code]
  );
  const serviceBill = icBill ? null : await queryB(
    `SELECT code FROM public.tb_product WHERE code = $1 LIMIT 1`,
    [code]
  );
  if (!icBill && serviceBill.length === 0) {
    throw new Error("Bill not found in ic_trans trans_flag 56/72/44/48 or odservice.tb_product");
  }
  const { upsertPendingBillSchedule } = require("./pending-bill");
  await upsertPendingBillSchedule({
    billNo: code,
    scheduledDate: date,
    remark: remark ?? null,
    actionStatus: "contacted_ready",
    deliveryRoundCode: round,
    deliveryRouteCode: route || null,
    transportCode: transport || null,
    userCode,
  });
  return { success: true };
}

async function removeManualPendingBill(billNo) {
  const code = String(billNo ?? "").trim();
  if (!code) throw new Error("bill_no is required");
  await ensurePendingBillSchema();
  const icBill = await queryOne(
    `SELECT doc_no FROM ic_trans
     WHERE doc_no = $1
       AND trans_flag IN (${manualFlagListSql()})`,
    [code]
  );
  const serviceBill = icBill ? [] : await queryB(
    `SELECT code FROM public.tb_product WHERE code = $1 LIMIT 1`,
    [code]
  );
  if (!icBill && serviceBill.length === 0) {
    throw new Error("Bill not found in ic_trans trans_flag 56/72/44/48 or odservice.tb_product");
  }
  await query(
    `DELETE FROM public.odg_tms_pending_bill WHERE bill_no = $1`,
    [code]
  );
  return { success: true };
}

async function getManualReadyBills() {
  await ensurePendingBillSchema();
  const icRows = await query(
    `SELECT a.doc_no,
            to_char(a.doc_date,'DD-MM-YYYY') as doc_date,
            a.cust_code,
            COALESCE(NULLIF(TRIM(b.name_1), ''), a.cust_code, '') as cust_name,
            COALESCE(b.telephone, '') as telephone,
            (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no AND item_code NOT LIKE '97%') as count_item,
            ${SCHEDULED_BILL_FIELDS},
            -- Manual bills (transfer flag 72 / returns / service) carry their
            -- delivery branch on the pending row; surface it so the create-trip
            -- page can scope them to the chosen branch like shipment bills do.
            COALESCE(NULLIF(TRIM(pb.transport_code), ''), '') as delivery_transport_code,
            false as incoming_forwarded,
            '' as forward_from_transport_code,
            '' as forward_from_transport_name,
            '' as forwarded_at,
            true as manual_pending_bill,
            a.trans_flag as source_trans_flag,
            'ic_trans' as source_type
     FROM ic_trans a
     LEFT JOIN ar_customer b ON b.code = a.cust_code
     ${SCHEDULED_BILL_JOIN}
     WHERE a.trans_flag IN (${manualFlagListSql()})
       AND COALESCE(pb.action_status, '') = 'contacted_ready'
     ORDER BY pb.scheduled_date ASC, a.doc_date DESC`
  );
  const readySchedules = await query(
    `SELECT pb.bill_no,
            to_char(pb.scheduled_date,'YYYY-MM-DD') as scheduled_date,
            to_char(pb.scheduled_date,'DD-MM-YYYY') as scheduled_date_display,
            COALESCE(pb.delivery_route_code, '') as delivery_route_code,
            COALESCE(NULLIF(TRIM(pb.transport_code), ''), '') as delivery_transport_code,
            pb.delivery_round_code,
            COALESCE(dr.name, '') as delivery_round_name,
            COALESCE(dr.time_label, '') as delivery_round_time_label
     FROM public.odg_tms_pending_bill pb
     LEFT JOIN public.odg_tms_delivery_round dr ON dr.code = pb.delivery_round_code
     WHERE pb.scheduled_date IS NOT NULL
       AND COALESCE(NULLIF(TRIM(pb.delivery_round_code), ''), NULL) IS NOT NULL
       AND COALESCE(pb.action_status, '') = 'contacted_ready'`
  );
  const scheduledDocNos = readySchedules.map((row) => row.bill_no);
  const existingIc = new Set(icRows.map((row) => row.doc_no));
  const serviceBaseRows = scheduledDocNos.length === 0
    ? []
    : await queryB(
        `SELECT s.code as doc_no,
                to_char(MAX(COALESCE(s.time_register, s.create_date_time_now)),'DD-MM-YYYY') as doc_date,
                COALESCE(MAX(NULLIF(TRIM(s.cust_code), '')), '') as cust_code,
                COALESCE(MAX(NULLIF(TRIM(s.name_1), '')), MAX(NULLIF(TRIM(s.p_model), '')), s.code) as cust_name,
                '' as telephone,
                NULL::int as source_trans_flag
         FROM public.tb_product s
         WHERE s.code = ANY($1::varchar[])
         GROUP BY s.code`,
        [scheduledDocNos.filter((docNo) => !existingIc.has(docNo))]
      );
  const scheduleMap = new Map(readySchedules.map((row) => [row.bill_no, row]));
  const serviceRows = serviceBaseRows.map((row) => {
    const sched = scheduleMap.get(row.doc_no);
    return {
      ...row,
      count_item: 0,
      scheduled_date: sched?.scheduled_date ?? null,
      scheduled_date_display: sched?.scheduled_date_display ?? null,
      delivery_route_code: sched?.delivery_route_code ?? "",
      delivery_transport_code: sched?.delivery_transport_code ?? "",
      delivery_round_code: sched?.delivery_round_code ?? "",
      delivery_round_name: sched?.delivery_round_name ?? "",
      delivery_round_time_label: sched?.delivery_round_time_label ?? "",
      incoming_forwarded: false,
      forward_from_transport_code: "",
      forward_from_transport_name: "",
      forwarded_at: "",
      manual_pending_bill: true,
      source_type: SERVICE_SOURCE_TYPE,
    };
  });
  return [...icRows, ...serviceRows];
}

const {
  getPendingBillScheduleMap,
  ensurePendingBillSchema,
} = require("./pending-bill");
const { getBillTodoSummaryMap } = require("./bill-todo");

async function getManualPendingRowsForPending(fromDate, toDate, transportCode = "all", branchListSql = null) {
  // branchListSql (a pre-quoted, controlled set from getBranchScope) restricts a
  // branch-scoped user to their assigned branches. Otherwise the unscoped UI
  // filter applies: a single chosen branch, else the three delivery branches.
  const scopedList = !!branchListSql && branchListSql.length > 0;
  const filterByTransport = !scopedList && transportCode && transportCode !== "all";
  const params = filterByTransport ? [fromDate, toDate, transportCode] : [fromDate, toDate];
  const transportWhere = scopedList
    ? `AND pb.transport_code IN (${branchListSql})`
    : filterByTransport
      ? "AND pb.transport_code = $3"
      : `AND COALESCE(NULLIF(TRIM(pb.transport_code), ''), '') IN (${deliveryBranchListSql()})`;
  const icRows = await query(
    `SELECT
      a.doc_no,
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date,
      a.cust_code,
      COALESCE(NULLIF(TRIM(cust.name_1), ''), a.cust_code, '') as cust_name,
      COALESCE(NULLIF(TRIM(cust.name_1), ''), a.cust_code, '') as transport_name,
      COALESCE(NULLIF(TRIM(acd.latitude::text), ''), '') as cust_lat,
      COALESCE(NULLIF(TRIM(acd.longitude::text), ''), '') as cust_lng,
      COALESCE(NULLIF(TRIM(a.remark), ''), '') as sales_remark,
      to_char(COALESCE(a.send_date, pb.scheduled_date, a.doc_date),'YYYY-MM-DD') as send_date,
      to_char(COALESCE(a.send_date, pb.scheduled_date, a.doc_date),'DD-MM-YYYY') as send_date_display,
      COALESCE(NULLIF(TRIM(oe.fullname_lo), ''), NULLIF(TRIM(oe.nickname), ''), a.sale_code) as sale,
      COALESCE(NULLIF(TRIM(od.department_name_lo), ''), oe.department_code, '') as department,
      COALESCE(pb.transport_code, '') as transport_code,
      COALESCE(NULLIF(TRIM(tt.name_1), ''), NULLIF(TRIM(pb.transport_code), ''), '') as transport,
      to_char(COALESCE(a.create_date_time_now, pb.updated_at),'DD-MM-YYYY HH24:MI') as time_open,
      now() - COALESCE(a.create_date_time_now, pb.updated_at) as time_use,
      true as manual_pending_bill,
      a.trans_flag as source_trans_flag,
      'ic_trans' as source_type
    FROM ic_trans a
    INNER JOIN public.odg_tms_pending_bill pb
      ON pb.bill_no = a.doc_no
      AND pb.scheduled_date IS NOT NULL
      AND COALESCE(NULLIF(TRIM(pb.delivery_round_code), ''), NULL) IS NOT NULL
    LEFT JOIN ar_customer cust ON cust.code = a.cust_code
    LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
    LEFT JOIN public.odg_employee oe ON oe.employee_code = a.sale_code
    LEFT JOIN public.odg_department od ON od.department_code = oe.department_code
    LEFT JOIN transport_type tt ON tt.code = pb.transport_code
    WHERE a.trans_flag IN (${manualFlagListSql()})
      AND pb.scheduled_date::date BETWEEN $1::date AND $2::date
      ${transportWhere}
    ORDER BY pb.scheduled_date ASC, a.doc_date ASC`,
    params
  );
  const readySchedules = await query(
    `SELECT pb.bill_no,
            pb.scheduled_date,
            to_char(pb.scheduled_date,'YYYY-MM-DD') as send_date,
            to_char(pb.scheduled_date,'DD-MM-YYYY') as send_date_display,
            COALESCE(pb.transport_code, '') as transport_code,
            COALESCE(NULLIF(TRIM(tt.name_1), ''), NULLIF(TRIM(pb.transport_code), ''), '') as transport,
            to_char(COALESCE(pb.updated_at, LOCALTIMESTAMP(0)),'DD-MM-YYYY HH24:MI') as time_open,
            now() - COALESCE(pb.updated_at, LOCALTIMESTAMP(0)) as time_use
     FROM public.odg_tms_pending_bill pb
     LEFT JOIN transport_type tt ON tt.code = pb.transport_code
     WHERE pb.scheduled_date IS NOT NULL
       AND COALESCE(NULLIF(TRIM(pb.delivery_round_code), ''), NULL) IS NOT NULL
       AND COALESCE(pb.action_status, '') = 'contacted_ready'
       AND pb.scheduled_date::date BETWEEN $1::date AND $2::date
       ${transportWhere}`,
    params
  );
  const existingIc = new Set(icRows.map((row) => row.doc_no));
  const serviceDocNos = readySchedules
    .map((row) => row.bill_no)
    .filter((docNo) => !existingIc.has(docNo));
  const serviceBaseRows = serviceDocNos.length === 0
    ? []
    : await queryB(
        `SELECT s.code as doc_no,
                to_char(MAX(COALESCE(s.time_register, s.create_date_time_now)),'DD-MM-YYYY') as doc_date,
                COALESCE(MAX(NULLIF(TRIM(s.cust_code), '')), '') as cust_code,
                COALESCE(MAX(NULLIF(TRIM(s.name_1), '')), MAX(NULLIF(TRIM(s.p_model), '')), s.code) as transport_name,
                NULL::int as source_trans_flag
         FROM public.tb_product s
         WHERE s.code = ANY($1::varchar[])
         GROUP BY s.code`,
        [serviceDocNos]
      );
  const scheduleMap = new Map(readySchedules.map((row) => [row.bill_no, row]));
  const serviceRows = serviceBaseRows.map((row) => {
    const sched = scheduleMap.get(row.doc_no);
    return {
      doc_no: row.doc_no,
      doc_date: row.doc_date,
      transport_name: row.transport_name,
      sales_remark: "",
      send_date: sched?.send_date ?? null,
      send_date_display: sched?.send_date_display ?? null,
      sale: "",
      department: "ສູນບໍລິການ",
      transport_code: sched?.transport_code ?? "",
      transport: sched?.transport ?? "",
      time_open: sched?.time_open ?? "",
      time_use: sched?.time_use ?? null,
      manual_pending_bill: true,
      source_trans_flag: row.source_trans_flag,
      source_type: SERVICE_SOURCE_TYPE,
    };
  });
  return [...icRows, ...serviceRows];
}

async function getBillsPending(session, fromDate, toDate, transportCode) {
  await ensureTmsDetailItemTable();
  await ensurePendingBillSchema();
  const scope = getBranchScope(session);
  // A branch-scoped user sees only their assigned branch SET; an unscoped user
  // honours the UI's transportCode filter ("all" → the three delivery branches,
  // else a single chosen branch). Match on the effective transport (pending
  // override, else the shipment's) so a re-assigned bill drops out accordingly.
  let where, params;
  if (scope.scoped) {
    where = `COALESCE(NULLIF(TRIM(pbov.transport_code), ''), a.transport_code) IN (${scope.branchListSql})`;
    params = [fromDate, toDate];
  } else if (transportCode === "all") {
    where = `COALESCE(NULLIF(TRIM(pbov.transport_code), ''), a.transport_code) IN (${deliveryBranchListSql()})`;
    params = [fromDate, toDate];
  } else {
    where = `COALESCE(NULLIF(TRIM(pbov.transport_code), ''), a.transport_code)=$3`;
    params = [fromDate, toDate, transportCode];
  }
  const [shipmentRaw, manualRaw, listtrans] = await Promise.all([
    query(
      `SELECT
        a.doc_no, to_char(b.doc_date,'DD-MM-YYYY') as doc_date, a.transport_name,
        COALESCE(NULLIF(TRIM(pbov.transport_code), ''), a.transport_code) as transport_code,
        a.cust_code,
        COALESCE(NULLIF(TRIM(cust.name_1), ''), a.cust_code, '') as cust_name,
        COALESCE(NULLIF(TRIM(acd.latitude::text), ''), '') as cust_lat,
        COALESCE(NULLIF(TRIM(acd.longitude::text), ''), '') as cust_lng,
        COALESCE(NULLIF(TRIM(b.remark), ''), '') as sales_remark,
        to_char(b.send_date,'YYYY-MM-DD') as send_date,
        to_char(b.send_date,'DD-MM-YYYY') as send_date_display,
        COALESCE(b.doc_format_code, '') as source_format,
        COALESCE(NULLIF(TRIM(oe.fullname_lo), ''), NULLIF(TRIM(oe.nickname), ''), b.sale_code) as sale,
        COALESCE(NULLIF(TRIM(od.department_name_lo), ''), oe.department_code, '') as department,
        COALESCE(NULLIF(TRIM(dov.name_1), ''), d.name_1) as transport, to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as time_open,
        now() - a.create_date_time_now as time_use,
        now() - b.send_date::timestamp as time_use_send
      FROM ic_trans_shipment a
      LEFT JOIN ic_trans b ON b.doc_no=a.doc_no
      LEFT JOIN ar_customer cust ON cust.code = a.cust_code
      LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
      LEFT JOIN public.odg_employee oe ON oe.employee_code = b.sale_code
      LEFT JOIN public.odg_department od ON od.department_code = oe.department_code
      LEFT JOIN transport_type d ON d.code=a.transport_code
      LEFT JOIN public.odg_tms_pending_bill pbov ON pbov.bill_no = a.doc_no
      LEFT JOIN transport_type dov ON dov.code = NULLIF(TRIM(pbov.transport_code), '')
      -- A sale bill with no send_date yet (NULL) must still surface so admins
      -- can schedule it. NULL::date BETWEEN x AND y is FALSE in SQL, which used
      -- to silently drop these bills, so fall back to doc_date for the window
      -- check (matches the COALESCE in getManualPendingRowsForPending). The
      -- SELECT keeps send_date NULL on purpose so the row stays flagged as
      -- "needs a delivery date" on the page.
      WHERE a.trans_flag=44 AND check_status=0 AND COALESCE(b.send_date::date, b.doc_date::date) BETWEEN $1::date AND $2::date AND ${where}
      ORDER BY COALESCE(b.send_date, b.doc_date) ASC, b.doc_date ASC`,
      params
    ),
    getManualPendingRowsForPending(
      fromDate,
      toDate,
      scope.scoped ? null : transportCode,
      scope.scoped ? scope.branchListSql : null
    ),
    scope.scoped
      ? query(`SELECT code, name_1 FROM transport_type WHERE code IN (${scope.branchListSql}) ORDER BY code ASC`)
      : query(`SELECT code, name_1 FROM transport_type WHERE code IN (${deliveryBranchListSql()}) ORDER BY code ASC`),
  ]);

  const shipmentDocNos = new Set(shipmentRaw.map((bill) => bill.doc_no));
  const transRaw = [...shipmentRaw, ...manualRaw.filter((bill) => !shipmentDocNos.has(bill.doc_no))];
  if (transRaw.length === 0) return { trans: [], listtrans };

  const billNos = transRaw.map((bill) => bill.doc_no);
  // Service bills (tb_product) are "re-deliverable for repeat servicing", so the
  // service summary deliberately ignores delivered_qty — a delivered service
  // bill keeps remaining_count > 0 and would otherwise sit in pending forever.
  // We drop it once its CURRENT scheduled cycle has been fulfilled (see
  // deliveredServiceRows); only service rows are eligible, so a partially-
  // delivered ic_trans bill is never affected.
  const serviceBillNos = transRaw
    .filter((bill) => bill.source_type === SERVICE_SOURCE_TYPE)
    .map((bill) => bill.doc_no);
  // Use the shared summary helper so this list always agrees with the
  // "ຕົວທີ່ເພີ່ມ" (available bills) list — both reflect the same
  // re-dispatchable amount (cancelled bills + partial delivery leftovers).
  // applyRemainingCounts (the heavy one), the cancelled-delivery lookup, the
  // schedule map and the todo map all depend only on transRaw/billNos and are
  // independent of each other — run them concurrently so the lighter lookups
  // overlap with applyRemainingCounts instead of stacking after it.
  const [countedRows, cancelledRows, scheduleMap, todoMap, activeDispatchRows, forwardedAwayRows, deliveredServiceRows] = await Promise.all([
    applyRemainingCounts(transRaw),
    query(
      `SELECT DISTINCT ON (d.bill_no)
          d.bill_no,
          d.doc_no as cancelled_delivery_job,
          COALESCE(d.remark, '') as cancelled_delivery_remark,
          COALESCE(NULLIF(TRIM(drv.name_1), ''), a.driver, '') as cancelled_delivery_driver,
          COALESCE(NULLIF(TRIM(car.name_1), ''), a.car, '') as cancelled_delivery_car,
          to_char(COALESCE(d.sent_end, d.create_date_time_now), 'DD-MM-YYYY HH24:MI') as cancelled_delivery_at,
          GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(d.sent_end, d.create_date_time_now)))), 0)::bigint as cancelled_secs_ago
        FROM public.odg_tms_detail d
        LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
        LEFT JOIN public.odg_tms_driver drv ON drv.code = a.driver
        LEFT JOIN public.odg_tms_car car ON car.code = a.car
        WHERE d.bill_no = ANY($1::varchar[])
          AND COALESCE(d.status, 0) = 2
        ORDER BY d.bill_no, COALESCE(d.sent_end, d.create_date_time_now) DESC`,
      [billNos]
    ),
    // Schedule + remark stamps for bills the admin has flagged as overdue.
    getPendingBillScheduleMap(billNos),
    // Aggregated todo counts/earliest deadline for the row indicator.
    getBillTodoSummaryMap(billNos),
    // Bills already sitting on an OPEN trip (status NULL/0/3 — not delivered=1,
    // not cancelled=2) must not show in this triage queue. The shipment path
    // already drops them via check_status=1, but manual/transfer bills (flag 72)
    // have no check_status gate, so a dispatched ໂອນ bill kept re-appearing here.
    // Same rule getJobInit/searchBills use for the "addable bills" list.
    query(
      `SELECT DISTINCT bill_no FROM public.odg_tms_detail
       WHERE bill_no = ANY($1::varchar[])
         AND COALESCE(status, 0) NOT IN (1, 2)
         AND ${getFixedYearSqlFilter("doc_date")}`,
      [billNos]
    ),
    // Bills already handed off to another branch via a COMPLETED "ສົ່ງສາຂາ"
    // (forward-to-branch) stop have left this triage queue — their onward
    // delivery to the customer is dispatched from the RECEIVING branch's
    // available-bills / incoming-forwarded list (getAvailableBills*), not here.
    // Commit 3998cf6 stopped counting forward legs as "delivered" in the shared
    // remaining-qty CTE (correct for the available queue), which made these
    // forwarded bills re-surface in the originating branch's pending list. We
    // drop them here the same way activeDispatchSet drops in-flight bills.
    query(
      `SELECT DISTINCT bill_no FROM public.odg_tms_detail
       WHERE bill_no = ANY($1::varchar[])
         AND COALESCE(status, 0) = 1
         AND NULLIF(TRIM(forward_transport_code), '') IS NOT NULL
         AND ${getFixedYearSqlFilter("doc_date")}`,
      [billNos]
    ),
    // Service bills whose CURRENT scheduled cycle has been delivered. A service
    // bill is re-deliverable, so we can't net out delivered_qty like an ic_trans
    // bill — instead we drop it once it has a completed customer delivery
    // (status=1, not a branch forward) on or after its scheduled day. A bill
    // re-scheduled to a LATER date for repeat servicing keeps showing because
    // its old delivery's sent_end falls before the new scheduled_date.
    serviceBillNos.length === 0
      ? Promise.resolve([])
      : query(
          `SELECT DISTINCT d.bill_no
             FROM public.odg_tms_detail d
             JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
            WHERE d.bill_no = ANY($1::varchar[])
              AND COALESCE(d.status, 0) = 1
              AND NULLIF(TRIM(d.forward_transport_code), '') IS NULL
              AND ${getFixedYearSqlFilter("d.doc_date")}
              AND pb.scheduled_date IS NOT NULL
              AND COALESCE(d.sent_end, d.create_date_time_now)::date >= pb.scheduled_date::date`,
          [serviceBillNos]
        ),
  ]);
  const activeDispatchSet = new Set(activeDispatchRows.map((r) => r.bill_no));
  const forwardedAwaySet = new Set(forwardedAwayRows.map((r) => r.bill_no));
  const deliveredServiceSet = new Set(deliveredServiceRows.map((r) => r.bill_no));
  const summaries = new Map(
    countedRows.map((row) => [
      row.doc_no,
      {
        remaining_count: Number(row.count_item ?? 0),
        remaining_qty_total: Number(row.remaining_qty_total ?? 0),
        total_qty_total: Number(row.total_qty_total ?? 0),
        delivered_qty_total: Number(row.delivered_qty_total ?? 0),
      },
    ])
  );
  const cancelledMap = new Map(cancelledRows.map((row) => [row.bill_no, row]));

  const trans = transRaw
    .map((bill) => {
      const summary = summaries.get(bill.doc_no) ?? {
        remaining_count: 0,
        remaining_qty_total: 0,
        total_qty_total: 0,
        delivered_qty_total: 0,
      };
      const sched = scheduleMap.get(bill.doc_no) ?? null;
      const todo = todoMap.get(bill.doc_no) ?? null;
      const cancelled = cancelledMap.get(bill.doc_no) ?? null;
      // CAKAP = POS receipt from web_sale_order's cashier/settle. The customer
      // has already paid, so the "ຕ້ອງໂທຫາລູກຄ້າ" gate doesn't apply — auto-
      // promote to contacted_ready and treat send_date as the planned delivery
      // day so dispatchers don't see freshly-paid bills sitting in the call
      // queue. The auto-defaults only apply when admin hasn't manually touched
      // the bill (no odg_tms_pending_bill row) — any explicit override wins.
      const isPosSettled = (bill.source_format ?? "").trim() === "CAKAP";
      // Default delivery date is the bill's send_date from ic_trans; admins can
      // override it via odg_tms_pending_bill when reschedule is needed.
      const effectiveDate = sched?.scheduled_date ?? bill.send_date ?? null;
      const effectiveDisplay =
        sched?.scheduled_date_display ?? bill.send_date_display ?? null;
      // Normalise action_status to the flat reason+contact-state model.
      //   contact_failed       — ຕິດຕໍ່ບໍ່ໄດ້
      //   customer_postponed   — ລູກຄ້າເລື່ອນວັນຮັບ
      //   customer_cancelled   — ລູກຄ້າປະຕິເສດ/ຍົກເລີກ
      //   contacted_ready      — ພ້ອມຮັບ
      // Anything else (legacy values like contacted_waiting/contacted_dispatched)
      // is cleared so the bill falls back to "ບໍ່ຕິດຕໍ່" until admin retags.
      const allowedStatuses = [
        "sales_not_notified",
        "contact_failed",
        "customer_postponed",
        "customer_cancelled",
        "contacted_ready",
      ];
      const rawStatus = sched?.action_status ?? "";
      const normalisedStatus = allowedStatuses.includes(rawStatus) ? rawStatus : "";
      // POS bills with no admin override default to "ready" — payment is proof
      // the customer is committed. Dispatchers can still flip the status later
      // (e.g. ລູກຄ້າເລື່ອນວັນຮັບ) and that override is preserved.
      const actionStatus =
        normalisedStatus || (isPosSettled && !sched ? "contacted_ready" : "");
      // scheduled_date_overridden controls whether the bill counts as "admin
      // has acted on this" (used by isDispatchReady on the UI). For POS bills
      // we treat the auto-default as an override so they don't get stuck in
      // missing_date — admin only has to pick route+round.
      const scheduledOverridden = Boolean(sched?.scheduled_date) || (isPosSettled && !sched);
      return {
        ...bill,
        remaining_count: summary.remaining_count,
        remaining_qty_total: summary.remaining_qty_total,
        total_qty_total: summary.total_qty_total,
        delivered_qty_total: summary.delivered_qty_total,
        // Partial = some qty was actually delivered on a finished attempt AND
        // some still remains. A purely *cancelled* bill (status=2) delivered
        // nothing — delivered_qty_total = 0 — so it no longer falsely reads as
        // ທະຍອຍ even though it has odg_tms_detail_item rows.
        partial_delivery:
          (summary.delivered_qty_total ?? 0) > 0 && summary.remaining_count > 0,
        scheduled_date: effectiveDate,
        scheduled_date_display: effectiveDisplay,
        scheduled_date_overridden: scheduledOverridden,
        schedule_remark: sched?.remark ?? "",
        sales_remark: bill.sales_remark ?? "",
        action_status: actionStatus,
        delivery_route_code: sched?.delivery_route_code ?? "",
        delivery_round_code: sched?.delivery_round_code ?? "",
        schedule_updated_at: sched?.updated_at ?? null,
        schedule_updated_by: sched?.updated_by ?? "",
        cancelled_delivery: Boolean(cancelled),
        cancelled_delivery_job: cancelled?.cancelled_delivery_job ?? "",
        cancelled_delivery_at: cancelled?.cancelled_delivery_at ?? "",
        cancelled_delivery_remark: cancelled?.cancelled_delivery_remark ?? "",
        cancelled_delivery_driver: cancelled?.cancelled_delivery_driver ?? "",
        cancelled_delivery_car: cancelled?.cancelled_delivery_car ?? "",
        cancelled_secs_ago: Number(cancelled?.cancelled_secs_ago ?? 0),
        todo_pending_count: Number(todo?.pending_count ?? 0),
        todo_done_count: Number(todo?.done_count ?? 0),
        todo_earliest_deadline: todo?.earliest_deadline ?? null,
        todo_earliest_deadline_display: todo?.earliest_deadline_display ?? null,
        planned_lat: sched?.planned_lat ?? "",
        planned_lng: sched?.planned_lng ?? "",
        is_pos_settled: isPosSettled,
      };
    })
    // Service bills (tb_product) can be re-delivered for repeat servicing,
    // so keep them visible even when every unit is locked in an active job
    // (remaining_count = 0). Same rationale as the search modal — see the
    // comment in getServiceBillProducts.
    // Hide bills already on an open trip (manual/transfer bills lack the
    // check_status gate the shipment path relies on).
    .filter((bill) => !activeDispatchSet.has(bill.doc_no))
    // Hide bills handed off to another branch ("ສົ່ງສາຂາ" completed) — they are
    // re-dispatched onward from the receiving branch's available list, not here.
    .filter((bill) => !forwardedAwaySet.has(bill.doc_no))
    // Hide service bills whose current scheduled delivery is already done — the
    // service summary can't net out delivered_qty (re-deliverable), so this is
    // what makes a completed service stop leave the queue.
    .filter((bill) => !deliveredServiceSet.has(bill.doc_no))
    .filter((bill) => bill.source_type === SERVICE_SOURCE_TYPE || bill.remaining_count > 0)
    .map((bill, index) => ({ ...bill, row_num: index + 1 }));

  return { trans, listtrans };
}

async function updateBillTransport(docNo, transportCode) {
  const code = String(transportCode ?? "").trim() || null;
  await ensurePendingBillSchema();
  // bills-pending reads/filters the transport from odg_tms_pending_bill
  // (pb.transport_code), so the change MUST land there or it reverts on refresh.
  // A fresh sale bill (flag 44) shows in the queue via the shipment LEFT JOIN
  // with NO pending_bill row yet, so a plain UPDATE was a no-op and the override
  // was silently lost — UPSERT so the row is created when missing. Keep
  // ic_trans_shipment in sync for the downstream job / waiting-sent views that
  // still read transport from it (no-op when the bill has no shipment row).
  await query(
    `INSERT INTO public.odg_tms_pending_bill (bill_no, transport_code, updated_at)
     VALUES ($2, $1, LOCALTIMESTAMP(0))
     ON CONFLICT (bill_no) DO UPDATE
       SET transport_code = EXCLUDED.transport_code,
           updated_at = LOCALTIMESTAMP(0)`,
    [code, docNo]
  );
  await query(
    `UPDATE ic_trans_shipment SET transport_code=$1 WHERE doc_no=$2 AND ${getFixedYearSqlFilter("doc_date")}`,
    [code, docNo]
  );
}

async function getBillProducts(docNo) {
  return getRemainingBillProducts(docNo);
}

async function getBillsWaitingSent(session) {
  const scope = getBranchScope(session);
  await ensureJobListIndexes();
  const { ensureDeliveryRouteSchema } = require("./delivery-route");
  const { ensureDeliveryRoundSchema } = require("./delivery-round");
  await ensureDeliveryRouteSchema();
  await ensureDeliveryRoundSchema();
  return query(
    `WITH candidate_jobs AS (
      SELECT doc_no FROM public.odg_tms
      WHERE COALESCE(approve_status, 0) = 1
        AND COALESCE(job_status, 0) IN (0, 1)
        AND ${getFixedYearSqlFilter("doc_date")}
        ${branchFilterJob(scope, "public.odg_tms")}
    ),
    bill_summary AS (
      SELECT d.doc_no, COUNT(*)::int AS total_bills,
        COUNT(*) FILTER (WHERE d.sent_start IS NULL AND d.sent_end IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE d.sent_start IS NOT NULL AND d.sent_end IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count
      FROM public.odg_tms_detail d
      INNER JOIN candidate_jobs cj ON cj.doc_no = d.doc_no
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY d.doc_no
    ),
    job_transport AS (
      SELECT DISTINCT ON (d.doc_no) d.doc_no, COALESCE(t.name_1, '-') as transport_name
      FROM public.odg_tms_detail d
      INNER JOIN candidate_jobs cj ON cj.doc_no = d.doc_no
      LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
      LEFT JOIN transport_type t ON t.code = s.transport_code
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      ORDER BY d.doc_no, d.roworder
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at,
      COALESCE(NULLIF(TRIM(b.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(c.name_1), ''), a.driver, '-') as driver,
      COALESCE(NULLIF(TRIM(u.name_1), ''), a.user_created, '-') as user_created,
      COALESCE(NULLIF(TRIM(ap.name_1), ''), a.approve_user, '-') as approve_user,
      bs.total_bills as item_bill,
      bs.waiting_bill_count, bs.inprogress_bill_count,
      bs.completed_bill_count, bs.cancelled_bill_count,
      COALESCE(jt.transport_name, '-') as transport_name,
      COALESCE(a.delivery_route_code, '') as delivery_route_code,
      COALESCE(rt.name, '') as delivery_route_name,
      COALESCE(a.delivery_round_code, '') as delivery_round_code,
      COALESCE(dr.name, '') as delivery_round_name,
      COALESCE(dr.time_label, '') as delivery_round_time_label
    FROM odg_tms a
    INNER JOIN bill_summary bs ON bs.doc_no = a.doc_no
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user u ON u.code = a.user_created
    LEFT JOIN erp_user ap ON ap.code = a.approve_user
    LEFT JOIN job_transport jt ON jt.doc_no = a.doc_no
    LEFT JOIN public.odg_tms_delivery_route rt ON rt.code = a.delivery_route_code
    LEFT JOIN public.odg_tms_delivery_round dr ON dr.code = a.delivery_round_code
    WHERE COALESCE(a.approve_status, 0) = 1
      AND COALESCE(a.job_status, 0) in (1,0)
      AND ${getFixedYearSqlFilter("a.doc_date")}
      ${branchFilterJob(scope, "a")}
    ORDER BY a.date_logistic ASC, a.create_date_time_now ASC, a.doc_no ASC`
  );
}

async function getBillsWaitingSentDetails(docNo) {
  return query(
    `WITH item_totals AS (
      SELECT
        bill_no,
        COALESCE(SUM(COALESCE(selected_qty, 0)::numeric), 0)::numeric AS selected_qty_total,
        COALESCE(SUM(COALESCE(delivered_qty, 0)::numeric), 0)::numeric AS delivered_qty_total,
        COALESCE(SUM(GREATEST(COALESCE(selected_qty, 0)::numeric - COALESCE(delivered_qty, 0)::numeric, 0)), 0)::numeric AS remaining_qty_total,
        COUNT(*) FILTER (
          WHERE GREATEST(COALESCE(selected_qty, 0)::numeric - COALESCE(delivered_qty, 0)::numeric, 0) > 0
        )::int AS remaining_item_count
      FROM public.odg_tms_detail_item
      WHERE doc_no = $1
      GROUP BY bill_no
    )
    SELECT
      d.bill_no, to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
      to_char(d.date_logistic,'DD-MM-YYYY') as date_logistic,
      COALESCE(NULLIF(TRIM(c.name_1), ''), d.cust_code, '-') as customer,
      COALESCE(NULLIF(TRIM(d.telephone), ''), NULLIF(TRIM(c.telephone), ''), '-') as telephone,
      COALESCE(d.count_item::int, 0) as count_item,
      COALESCE(to_char(d.recipt_job,'DD-MM-YYYY HH24:MI'), '-') as recipt_job,
      COALESCE(to_char(d.sent_start,'DD-MM-YYYY HH24:MI'), '-') as sent_start,
      COALESCE(to_char(d.sent_end,'DD-MM-YYYY HH24:MI'), '-') as sent_end,
      COALESCE(d.remark, '') as remark,
      COALESCE(d.url_img, '') as url_img,
      COALESCE(d.sight_img, '') as sight_img,
      -- Proof-of-pickup captured at the customer's yard for '__CUSTOMER__' bills
      -- (photo of the goods + customer signature taken at collection time).
      COALESCE(d.recipt_img, '') as recipt_img,
      COALESCE(d.recipt_sign_img, '') as recipt_sign_img,
      COALESCE(img.delivery_images, ARRAY[]::text[]) as delivery_images,
      COALESCE(d.forward_transport_code, '') as forward_transport_code,
      COALESCE(ftt.name_1, '') as forward_transport_name,
      CASE
        WHEN d.sent_start IS NOT NULL AND d.sent_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (d.sent_end - d.sent_start))::bigint
        ELSE NULL
      END as duration_seconds,
      CASE
        WHEN a.lat_start ~ E'^-?\\\\d+(\\\\.\\\\d+)?$'
          AND a.lng_start ~ E'^-?\\\\d+(\\\\.\\\\d+)?$'
          AND d.lat_end ~ E'^-?\\\\d+(\\\\.\\\\d+)?$'
          AND d.lng_end ~ E'^-?\\\\d+(\\\\.\\\\d+)?$'
        THEN ROUND((6371.0 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(a.lat_start::float)) * cos(radians(d.lat_end::float)) *
            cos(radians(d.lng_end::float) - radians(a.lng_start::float)) +
            sin(radians(a.lat_start::float)) * sin(radians(d.lat_end::float))
          ))
        ))::numeric, 2)
        ELSE NULL
      END as distance_km,
      COALESCE(it.selected_qty_total, 0)::numeric as selected_qty_total,
      COALESCE(it.delivered_qty_total, 0)::numeric as delivered_qty_total,
      COALESCE(it.remaining_qty_total, 0)::numeric as remaining_qty_total,
      COALESCE(it.remaining_item_count, 0)::int as remaining_item_count,
      CASE
        WHEN COALESCE(d.status, 0) = 1 AND COALESCE(it.remaining_qty_total, 0) > 0 THEN true
        ELSE false
      END as partial_delivery,
      CASE
        WHEN d.sent_start IS NULL AND d.sent_end IS NULL THEN 'ລໍຖ້າຈັດສົ່ງ'
        WHEN d.sent_start IS NOT NULL AND d.sent_end IS NULL THEN 'ກຳລັງຈັດສົ່ງ'
        WHEN COALESCE(d.status, 0) = 1 AND d.forward_transport_code IS NOT NULL THEN 'ສົ່ງຕໍ່ສາຂາແລ້ວ'
        WHEN COALESCE(d.status, 0) = 1 AND COALESCE(it.remaining_qty_total, 0) > 0 THEN 'ທະຍອຍສົ່ງ'
        WHEN COALESCE(d.status, 0) = 1 THEN 'ຄົບຈຳນວນ'
        WHEN COALESCE(d.status, 0) = 2 THEN 'ຍົກເລີກຈັດສົ່ງ'
        ELSE 'ລໍຖ້າຈັດສົ່ງ'
      END as bill_status,
      CASE
        WHEN d.sent_start IS NULL AND d.sent_end IS NULL THEN 'waiting'
        WHEN d.sent_start IS NOT NULL AND d.sent_end IS NULL THEN 'inprogress'
        WHEN COALESCE(d.status, 0) = 1 AND d.forward_transport_code IS NOT NULL THEN 'forwarded'
        WHEN COALESCE(d.status, 0) = 1 AND COALESCE(it.remaining_qty_total, 0) > 0 THEN 'partial'
        WHEN COALESCE(d.status, 0) = 1 THEN 'done'
        WHEN COALESCE(d.status, 0) = 2 THEN 'cancel'
        ELSE 'waiting'
      END as phase
    FROM public.odg_tms_detail d
    LEFT JOIN ar_customer c ON c.code = d.cust_code
    LEFT JOIN item_totals it ON it.bill_no = d.bill_no
    LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN public.transport_type ftt ON ftt.code = d.forward_transport_code
    LEFT JOIN LATERAL (
      SELECT array_agg(di.image_data ORDER BY di.created_at ASC, di.roworder ASC) as delivery_images
      FROM public.odg_tms_delivery_images di
      WHERE di.bill_no = d.bill_no
    ) img ON true
    WHERE d.doc_no = $1
      AND ${getFixedYearSqlFilter("d.doc_date")}
    ORDER BY d.roworder`,
    [docNo]
  );
}

async function getBillsInProgress(session) {
  const scope = getBranchScope(session);
  await ensureJobListIndexes();
  return query(
    `WITH candidate_jobs AS (
      SELECT doc_no FROM public.odg_tms
      WHERE COALESCE(approve_status, 0) = 1
        AND COALESCE(job_status, 0) = 2
        AND ${getFixedYearSqlFilter("doc_date")}
        ${branchFilterJob(scope, "public.odg_tms")}
    ),
    bill_summary AS (
      SELECT d.doc_no, COUNT(*)::int AS total_bills,
        COUNT(*) FILTER (WHERE d.sent_start IS NULL AND d.sent_end IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE d.sent_start IS NOT NULL AND d.sent_end IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count,
        MIN(d.sent_start) FILTER (WHERE d.sent_start IS NOT NULL AND d.sent_end IS NULL) AS active_sent_start
      FROM public.odg_tms_detail d
      INNER JOIN candidate_jobs cj ON cj.doc_no = d.doc_no
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY d.doc_no
    ),
    latest_location AS (
      SELECT DISTINCT ON (h.doc_no) h.doc_no, h.lat, h.lng,
        to_char(h.recorded_at, 'DD-MM-YYYY HH24:MI') as recorded_at
      FROM public.odg_tms_travel_history h
      INNER JOIN candidate_jobs cj ON cj.doc_no = h.doc_no
      WHERE ${getFixedYearSqlFilter("h.doc_date")}
      ORDER BY h.doc_no, h.recorded_at DESC
    ),
    job_transport AS (
      SELECT DISTINCT ON (d.doc_no) d.doc_no, COALESCE(t.name_1, '-') as transport_name
      FROM public.odg_tms_detail d
      INNER JOIN candidate_jobs cj ON cj.doc_no = d.doc_no
      LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
      LEFT JOIN transport_type t ON t.code = s.transport_code
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      ORDER BY d.doc_no, d.roworder
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at,
      COALESCE(to_char(bs.active_sent_start,'DD-MM-YYYY HH24:MI'), '-') as active_sent_start,
      bs.active_sent_start as active_sent_start_raw,
      COALESCE(NULLIF(TRIM(b.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(c.name_1), ''), a.driver, '-') as driver,
      COALESCE(NULLIF(TRIM(u.name_1), ''), a.user_created, '-') as user_created,
      COALESCE(NULLIF(TRIM(ap.name_1), ''), a.approve_user, '-') as approve_user,
      bs.total_bills as item_bill,
      bs.waiting_bill_count, bs.inprogress_bill_count,
      bs.completed_bill_count, bs.cancelled_bill_count,
      COALESCE(a.miles_start, '') as miles_start,
      COALESCE(a.lat_start, '') as lat_start,
      COALESCE(a.lng_start, '') as lng_start,
      COALESCE(ll.lat, '') as current_lat,
      COALESCE(ll.lng, '') as current_lng,
      COALESCE(ll.recorded_at, '') as current_location_time,
      COALESCE(jt.transport_name, '-') as transport_name
    FROM odg_tms a
    INNER JOIN bill_summary bs ON bs.doc_no = a.doc_no
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user u ON u.code = a.user_created
    LEFT JOIN erp_user ap ON ap.code = a.approve_user
    LEFT JOIN latest_location ll ON ll.doc_no = a.doc_no
    LEFT JOIN job_transport jt ON jt.doc_no = a.doc_no
    WHERE COALESCE(a.approve_status, 0) = 1
      AND COALESCE(a.job_status, 0) = 2
      AND ${getFixedYearSqlFilter("a.doc_date")}
      ${branchFilterJob(scope, "a")}
    ORDER BY bs.active_sent_start ASC NULLS LAST, a.create_date_time_now ASC, a.doc_no ASC`
  );
}

async function getBillCompleteList(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureJobListIndexes();
  const from = coerceDateToFixedYear(fromDate ?? getFixedTodayDate());
  const to = coerceDateToFixedYear(toDate ?? getFixedTodayDate());
  const dateClause = `AND doc_date BETWEEN '${from}' AND '${to}'`;
  const dateClauseAliased = `AND a.doc_date BETWEEN '${from}' AND '${to}'`;
  return query(
    `WITH candidate_jobs AS (
      SELECT doc_no FROM public.odg_tms
      WHERE COALESCE(approve_status, 0) = 1
        AND COALESCE(job_status, 0) IN (3, 4)
        AND ${getFixedYearSqlFilter("doc_date")}
        ${dateClause}
        ${branchFilterJob(scope, "public.odg_tms")}
    ),
    bill_summary AS (
      SELECT d.doc_no, COUNT(*)::int AS total_bills,
        COUNT(*) FILTER (WHERE d.sent_start IS NULL AND d.sent_end IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE d.sent_start IS NOT NULL AND d.sent_end IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count,
        MAX(d.sent_end) AS finished_at
      FROM public.odg_tms_detail d
      INNER JOIN candidate_jobs cj ON cj.doc_no = d.doc_no
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY d.doc_no
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at,
      COALESCE(to_char(bs.finished_at,'DD-MM-YYYY HH24:MI'), '-') as finished_at,
      COALESCE(to_char(a.job_close,'DD-MM-YYYY HH24:MI'), '-') as driver_closed_at,
      COALESCE(to_char(a.admin_close_at,'DD-MM-YYYY HH24:MI'), '-') as admin_closed_at,
      COALESCE(NULLIF(TRIM(b.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(c.name_1), ''), a.driver, '-') as driver,
      COALESCE(NULLIF(TRIM(u.name_1), ''), a.user_created, '-') as user_created,
      COALESCE(NULLIF(TRIM(ap.name_1), ''), a.approve_user, '-') as approve_user,
      bs.total_bills as item_bill,
      bs.completed_bill_count, bs.cancelled_bill_count,
      COALESCE(a.job_status, 0) as job_status
    FROM odg_tms a
    INNER JOIN bill_summary bs ON bs.doc_no = a.doc_no
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user u ON u.code = a.user_created
    LEFT JOIN erp_user ap ON ap.code = a.approve_user
    WHERE COALESCE(a.approve_status, 0) = 1
      AND COALESCE(a.job_status, 0) IN (3, 4)
      AND ${getFixedYearSqlFilter("a.doc_date")}
      ${dateClauseAliased}
      ${branchFilterJob(scope, "a")}
    ORDER BY bs.finished_at DESC NULLS LAST, a.doc_no DESC`
  );
}

// ============ Cancelled bills (status=2) ============
async function getBillsCancelledList(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureJobListIndexes();
  const from = coerceDateToFixedYear(fromDate ?? getFixedTodayDate());
  const to = coerceDateToFixedYear(toDate ?? getFixedTodayDate());
  return query(
    `SELECT
      to_char(d.doc_date,'DD-MM-YYYY') as doc_date,
      d.doc_no, d.bill_no,
      to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
      to_char(d.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(d.sent_end,'DD-MM-YYYY HH24:MI') as cancelled_at,
      d.cust_code,
      COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '-') as cust_name,
      COALESCE(d.telephone, '') as telephone,
      COALESCE(NULLIF(TRIM(car.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(drv.name_1), ''), a.driver, '-') as driver,
      COALESCE(d.remark, '') as remark
    FROM public.odg_tms_detail d
    INNER JOIN odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN ar_customer cu ON cu.code = d.cust_code
    LEFT JOIN public.odg_tms_car car ON car.code = a.car
    LEFT JOIN public.odg_tms_driver drv ON drv.code = a.driver
    WHERE COALESCE(d.status, 0) = 2
      AND d.doc_date BETWEEN $1 AND $2
      AND ${getFixedYearSqlFilter("d.doc_date")}
      ${branchFilterJob(scope, "a")}
    ORDER BY d.sent_end DESC NULLS LAST, d.doc_no DESC`,
    [from, to]
  );
}

// ============ Partial-delivered bills (status=1 but delivered < selected) ============
async function getBillsPartialList(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureJobListIndexes();
  const from = coerceDateToFixedYear(fromDate ?? getFixedTodayDate());
  const to = coerceDateToFixedYear(toDate ?? getFixedTodayDate());
  return query(
    `WITH partial_bills AS (
      SELECT i.bill_no, i.doc_no,
        SUM(COALESCE(i.selected_qty, 0))::numeric AS selected_total,
        SUM(COALESCE(i.delivered_qty, 0))::numeric AS delivered_total
      FROM public.odg_tms_detail_item i
      INNER JOIN public.odg_tms_detail d
        ON d.bill_no = i.bill_no AND d.doc_no = i.doc_no
      WHERE COALESCE(d.status, 0) = 1
        AND d.doc_date BETWEEN $1 AND $2
        AND ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY i.bill_no, i.doc_no
      HAVING SUM(COALESCE(i.delivered_qty, 0)) < SUM(COALESCE(i.selected_qty, 0))
    )
    SELECT
      to_char(d.doc_date,'DD-MM-YYYY') as doc_date,
      d.doc_no, d.bill_no,
      to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
      to_char(d.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(d.sent_end,'DD-MM-YYYY HH24:MI') as completed_at,
      d.cust_code,
      COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '-') as cust_name,
      COALESCE(d.telephone, '') as telephone,
      COALESCE(NULLIF(TRIM(car.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(drv.name_1), ''), a.driver, '-') as driver,
      COALESCE(d.remark, '') as remark,
      pb.selected_total::float as selected_total,
      pb.delivered_total::float as delivered_total,
      (pb.selected_total - pb.delivered_total)::float as remaining_total
    FROM partial_bills pb
    INNER JOIN public.odg_tms_detail d
      ON d.bill_no = pb.bill_no AND d.doc_no = pb.doc_no
    INNER JOIN odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN ar_customer cu ON cu.code = d.cust_code
    LEFT JOIN public.odg_tms_car car ON car.code = a.car
    LEFT JOIN public.odg_tms_driver drv ON drv.code = a.driver
    WHERE 1=1 ${branchFilterJob(scope, "a")}
    ORDER BY d.sent_end DESC NULLS LAST, d.doc_no DESC`,
    [from, to]
  );
}

module.exports = {
  applyRemainingCounts,
  getAvailableBillsWithProducts,
  getAvailableBills,
  getAvailableBillProducts,
  searchManualPendingBills,
  addManualPendingBill,
  removeManualPendingBill,
  getBillsPending,
  getManualPendingRowsForPending,
  updateBillTransport,
  getBillProducts,
  getBillsWaitingSent,
  getBillsWaitingSentDetails,
  getBillsInProgress,
  getBillCompleteList,
  getBillsCancelledList,
  getBillsPartialList,
};

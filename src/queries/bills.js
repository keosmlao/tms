const { query } = require("../lib/db");
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
  getRemainingBillProducts,
  getRemainingSummaryMap,
} = require("./helpers");

async function getAvailableBillsWithProducts(session) {
  const scope = getBranchScope(session);
  const bills = await query(
    `SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.cust_code, b.name_1 as cust_name, b.telephone,
      (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no AND item_code NOT LIKE '97%') as count_item
    FROM ic_trans_shipment a
    LEFT JOIN ar_customer b ON b.code=a.cust_code
    WHERE trans_flag=44 AND check_status=0
      ${branchFilterShipment(scope, "a")}
      AND ${getFixedYearSqlFilter("a.doc_date")}
    ORDER BY a.doc_date DESC`
  );
  const summaries = await getRemainingSummaryMap(bills.map((bill) => bill.doc_no));
  const availableBills = bills
    .map((bill) => ({ ...bill, count_item: summaries.get(bill.doc_no)?.remaining_count ?? 0 }))
    .filter((bill) => bill.count_item > 0);

  const result = [];
  for (const bill of availableBills) {
    const products = await getRemainingBillProducts(bill.doc_no);
    if (products.length > 0) {
      result.push({ ...bill, products, count_item: products.length });
    }
  }
  return result;
}

async function getAvailableBills(session) {
  const scope = getBranchScope(session);
  const bills = await query(
    `SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.cust_code,
      b.name_1 as cust_name, b.telephone,
      (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no AND item_code NOT LIKE '97%') as count_item
    FROM ic_trans_shipment a
    LEFT JOIN ar_customer b ON b.code=a.cust_code
    WHERE trans_flag=44
      ${branchFilterShipment(scope, "a")}
      AND ${getFixedYearSqlFilter("a.doc_date")}
    ORDER BY a.doc_date DESC`
  );
  const summaries = await getRemainingSummaryMap(bills.map((bill) => bill.doc_no));
  return bills
    .map((bill) => ({ ...bill, count_item: summaries.get(bill.doc_no)?.remaining_count ?? 0 }))
    .filter((bill) => bill.count_item > 0);
}

async function getAvailableBillProducts(docNo) {
  return getRemainingBillProducts(docNo);
}

const { getPendingBillScheduleMap } = require("./pending-bill");
const { getBillTodoSummaryMap } = require("./bill-todo");

async function getBillsPending(session, fromDate, toDate, transportCode) {
  await ensureTmsDetailItemTable();
  const scope = getBranchScope(session);
  const effectiveCode = scope.scoped ? scope.branch : transportCode;
  const params = effectiveCode === "all" ? [fromDate, toDate] : [fromDate, toDate, effectiveCode];
  const where = effectiveCode === "all" ? "a.transport_code NOT IN ('02-0004')" : "a.transport_code=$3";
  const [transRaw, listtrans] = await Promise.all([
    query(
      `SELECT
        a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.transport_name,
        to_char(b.send_date,'YYYY-MM-DD') as send_date,
        to_char(b.send_date,'DD-MM-YYYY') as send_date_display,
        c.name_1 as sale, COALESCE(dep.name_1::text, c.department::text, '') as department,
        d.name_1 as transport, to_char(a.create_date_time_now,'DD-MM-YYYY HH:MI') as time_open,
        now() - a.create_date_time_now as time_use
      FROM ic_trans_shipment a
      LEFT JOIN ic_trans b ON b.doc_no=a.doc_no
      LEFT JOIN erp_user c ON c.code=b.sale_code
      LEFT JOIN erp_department_list dep ON dep.code=c.department
      LEFT JOIN transport_type d ON d.code=a.transport_code
      WHERE check_status=0 AND b.send_date::date BETWEEN $1::date AND $2::date AND ${where}
      ORDER BY b.send_date ASC, a.doc_date ASC`,
      params
    ),
    scope.scoped
      ? query("SELECT code, name_1 FROM transport_type WHERE code=$1", [scope.branch])
      : query("SELECT code, name_1 FROM transport_type WHERE code NOT LIKE '01-%' ORDER BY code ASC"),
  ]);

  if (transRaw.length === 0) return { trans: [], listtrans };

  const billNos = transRaw.map((bill) => bill.doc_no);
  // Use the shared summary helper so this list always agrees with the
  // "ຕົວທີ່ເພີ່ມ" (available bills) list — both reflect the same
  // re-dispatchable amount (cancelled bills + partial delivery leftovers).
  const summaries = await getRemainingSummaryMap(billNos);

  // Detect which bills have a partial-delivery history (had detail_item rows)
  // so the UI can flag them. Cheap because billNos is bounded.
  const detailItemRows = await query(
    `SELECT bill_no FROM public.odg_tms_detail_item WHERE bill_no = ANY($1::varchar[]) GROUP BY bill_no`,
    [billNos]
  );
  const detailItemBills = new Set(detailItemRows.map((row) => row.bill_no));

  // Schedule + remark stamps for bills the admin has flagged as overdue.
  const scheduleMap = await getPendingBillScheduleMap(billNos);

  // Aggregated todo counts/earliest deadline so the row indicator can render
  // without fetching every individual todo upfront.
  const todoMap = await getBillTodoSummaryMap(billNos);

  const trans = transRaw
    .map((bill) => {
      const summary = summaries.get(bill.doc_no) ?? {
        remaining_count: 0,
        remaining_qty_total: 0,
      };
      const sched = scheduleMap.get(bill.doc_no) ?? null;
      const todo = todoMap.get(bill.doc_no) ?? null;
      // Default delivery date is the bill's send_date from ic_trans; admins can
      // override it via odg_tms_pending_bill when reschedule is needed.
      const effectiveDate = sched?.scheduled_date ?? bill.send_date ?? null;
      const effectiveDisplay =
        sched?.scheduled_date_display ?? bill.send_date_display ?? null;
      return {
        ...bill,
        remaining_count: summary.remaining_count,
        remaining_qty_total: summary.remaining_qty_total,
        partial_delivery:
          detailItemBills.has(bill.doc_no) && summary.remaining_count > 0,
        scheduled_date: effectiveDate,
        scheduled_date_display: effectiveDisplay,
        scheduled_date_overridden: Boolean(sched?.scheduled_date),
        schedule_remark: sched?.remark ?? "",
        action_status: sched?.action_status ?? "",
        schedule_updated_at: sched?.updated_at ?? null,
        schedule_updated_by: sched?.updated_by ?? "",
        todo_pending_count: Number(todo?.pending_count ?? 0),
        todo_done_count: Number(todo?.done_count ?? 0),
        todo_earliest_deadline: todo?.earliest_deadline ?? null,
        todo_earliest_deadline_display: todo?.earliest_deadline_display ?? null,
      };
    })
    .filter((bill) => bill.remaining_count > 0)
    .map((bill, index) => ({ ...bill, row_num: index + 1 }));

  return { trans, listtrans };
}

async function updateBillTransport(docNo, transportCode) {
  await query(`UPDATE ic_trans_shipment SET transport_code=$1 WHERE doc_no=$2 AND ${getFixedYearSqlFilter("doc_date")}`, [transportCode, docNo]);
}

async function getBillProducts(docNo) {
  return getRemainingBillProducts(docNo);
}

async function getBillsWaitingSent(session) {
  const scope = getBranchScope(session);
  await ensureJobListIndexes();
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
      COALESCE(jt.transport_name, '-') as transport_name
    FROM odg_tms a
    INNER JOIN bill_summary bs ON bs.doc_no = a.doc_no
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user u ON u.code = a.user_created
    LEFT JOIN erp_user ap ON ap.code = a.approve_user
    LEFT JOIN job_transport jt ON jt.doc_no = a.doc_no
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
  getAvailableBillsWithProducts,
  getAvailableBills,
  getAvailableBillProducts,
  getBillsPending,
  updateBillTransport,
  getBillProducts,
  getBillsWaitingSent,
  getBillsWaitingSentDetails,
  getBillsInProgress,
  getBillCompleteList,
  getBillsCancelledList,
  getBillsPartialList,
};

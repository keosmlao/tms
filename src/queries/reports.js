const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterJob,
  ensureForwardBranchColumn,
} = require("./helpers");

async function getReportDaily(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status, coalesce(b.imei,'') as imei FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 ${branchFilterJob(scope, "a")} ORDER BY a.create_date_time_now`, [fromDate, toDate]);
}

async function getReportByDriver(session, fromDate, toDate, driverId) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  const drivers = await getTransportDepartmentEmployees();
  let listitem = [];
  if (driverId) {
    const scope = getBranchScope(session);
    await ensureForwardBranchColumn();
    listitem = await query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 AND a.driver=$3 ${branchFilterJob(scope, "a")} ORDER BY doc_no`, [fromDate, toDate, driverId]);
  }
  return { drivers, listitem };
}

async function getReportByCar(session, fromDate, toDate, carId) {
  const cars = await query("SELECT code, name_1 FROM public.odg_tms_car");
  let listitem = [];
  if (carId) {
    const scope = getBranchScope(session);
    await ensureForwardBranchColumn();
    listitem = await query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status, COALESCE(a.miles_start,'') as miles_start, COALESCE(a.miles_end,'') as miles_end, CASE WHEN regexp_replace(COALESCE(a.miles_start,''), '[^0-9.]', '', 'g') ~ E'^\\\\d+(\\\\.\\\\d+)?$' AND regexp_replace(COALESCE(a.miles_end,''), '[^0-9.]', '', 'g') ~ E'^\\\\d+(\\\\.\\\\d+)?$' AND regexp_replace(a.miles_end, '[^0-9.]', '', 'g')::numeric >= regexp_replace(a.miles_start, '[^0-9.]', '', 'g')::numeric THEN (regexp_replace(a.miles_end, '[^0-9.]', '', 'g')::numeric - regexp_replace(a.miles_start, '[^0-9.]', '', 'g')::numeric) ELSE NULL END as distance_km FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 AND a.car=$3 ${branchFilterJob(scope, "a")} ORDER BY doc_no`, [fromDate, toDate, carId]);
  }
  return { cars, listitem };
}

async function getReportByBill(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  return query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, a.doc_no, bill_no, to_char(bill_date,'DD-MM-YYYY') as bill_date, b.name_1 as cust_code, to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic, a.status, url_img, COALESCE(a.sight_img,'') as sight_img, COALESCE(img.delivery_images, ARRAY[]::text[]) as delivery_images, case when sent_start IS NULL then 'ລໍຖ້າຈັດສົ່ງ / ເບີກເຄື່ອງ' when sent_start IS NOT NULL AND sent_end IS NULL then 'ກຳລັງຈັດສົ່ງ' else case when a.status=1 then 'ຈັດສົ່ງສຳເລັດ' else 'ຍົກເລີກຈັດສົ່ງ' end end as status_trans, d.name_1 as car, e.name_1 as driver, count_item, a.remark, to_char(a.recipt_job,'DD-MM-YYYY HH24:MI') as recipt_job, to_char(a.sent_start,'DD-MM-YYYY HH24:MI') as sent_start, to_char(a.sent_end,'DD-MM-YYYY HH24:MI') as sent_end FROM public.odg_tms_detail a LEFT JOIN ar_customer b ON b.code=a.cust_code LEFT JOIN odg_tms c ON c.doc_no=a.doc_no LEFT JOIN public.odg_tms_car d ON d.code=a.car LEFT JOIN public.odg_tms_driver e ON e.code=c.driver LEFT JOIN public.ic_trans_shipment s ON s.doc_no=a.bill_no LEFT JOIN LATERAL (SELECT array_agg(di.image_data ORDER BY di.created_at ASC, di.roworder ASC) as delivery_images FROM public.odg_tms_delivery_images di WHERE di.bill_no = a.bill_no) img ON true WHERE a.doc_date BETWEEN $1 AND $2 ${scope.scoped ? `AND s.transport_code = '${scope.branch}'` : ""} ORDER BY a.roworder`, [fromDate, toDate]);
}

async function getReportMonthlyCar(session, monthly) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(
    `SELECT
       a.car AS car_code,
       b.name_1 AS car,
       COALESCE(b.imei, '') AS imei,
       COUNT(a.doc_no)::int AS qty,
       COALESCE(MAX(gps.total_km), 0)::numeric AS total_km,
       to_char(a.doc_date,'MM') AS month,
       to_char(a.doc_date,'yyyy') AS year
     FROM odg_tms a
     LEFT JOIN public.odg_tms_car b ON b.code = a.car
     LEFT JOIN (
       SELECT imei, SUM(COALESCE(distance_km, 0))::numeric AS total_km
       FROM public.odg_tms_gps_daily
       WHERE to_char(usage_date, 'yyyy-MM') = $1
       GROUP BY imei
     ) gps ON gps.imei = NULLIF(TRIM(b.imei), '')
     WHERE to_char(a.doc_date,'yyyy-MM') = $1
       ${branchFilterJob(scope, "a")}
     GROUP BY a.car, b.name_1, b.imei, to_char(a.doc_date,'MM'), to_char(a.doc_date,'yyyy')
     ORDER BY COUNT(a.doc_no) DESC, b.name_1 ASC`,
    [monthly]
  );
}

async function getReportMonthlyDriver(session, monthly) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  const scope = getBranchScope(session);
  const employees = await getTransportDepartmentEmployees();
  const jobBranchFilter = scope.scoped
    ? `AND EXISTS (
        SELECT 1 FROM public.odg_tms_detail __dd
        JOIN public.ic_trans_shipment __ss ON __ss.doc_no = __dd.bill_no
        WHERE __dd.doc_no = a.doc_no AND __ss.transport_code = '${scope.branch}'
      )`
    : "";
  const counts = await query(
    `SELECT a.driver, COUNT(a.doc_no)::int AS qty
     FROM public.odg_tms a
     WHERE to_char(a.doc_date, 'yyyy-MM') = $1
       ${jobBranchFilter}
     GROUP BY a.driver`,
    [monthly]
  );
  const countMap = new Map();
  for (const row of counts) countMap.set(row.driver, Number(row.qty) || 0);

  const [year, month] = monthly.split("-");
  const result = employees.map((e) => ({
    driver: e.name_1,
    driver_code: e.code,
    qty: countMap.get(e.code) ?? 0,
    month,
    year,
  }));
  result.sort((a, b) => {
    const diff = b.qty - a.qty;
    if (diff !== 0) return diff;
    return a.driver.localeCompare(b.driver);
  });
  return result;
}

// Monthly delivery KPI for management review.
// The month is event-based:
//   opened    — closed bills with delivery in the month, using real open
//               timestamp from the shipment/sales bill
//               (ic_trans.create_date_time_now, shipment create timestamp,
//               then doc_date fallback).
//   assigned  — bills arranged into delivery trips in the month, using the
//               delivery detail creation timestamp. Some were opened in an
//               earlier month; those are carry_in.
//   carry_out — bills opened in the month but not completed before next month.
//   multi_round_bills — distinct bills touched in the month that have more
//               than one approved delivery detail across their history.
//   on_time   — delivered within 24h, measured two ways:
//               1) bill open time -> sent_end, denominator = opened
//               2) delivery date/start -> sent_end, denominator = assigned
// Only the three managed transport branches are included in delivery KPIs.
// 02-0001 is the Khua Luang/Odean branch in current master data.
const MONTHLY_DELIVERY_BRANCH_CODES = ["02-0001", "02-0002", "02-0003"];
const MONTHLY_DELIVERY_BRANCH_NAMES = {
  "02-0001": "ຂົນສົ່ງຂົວຫຼວງ",
  "02-0002": "ຂົນສົ່ງດອນຕິ້ວ",
  "02-0003": "ຂົນສົ່ງປາກເຊ",
};

async function getReportMonthlyDelivery(session, monthly) {
  const scope = getBranchScope(session);
  const monthStart = `${monthly}-01`;
  const [yearText, monthText] = monthly.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const nextMonthStart =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const branchCodeSql = MONTHLY_DELIVERY_BRANCH_CODES.map((code) => `'${code}'`).join(",");
  const openedBranchClause = scope.scoped ? `AND s.transport_code = '${scope.branch}'` : "";
  const deliveredBranchClause = scope.scoped ? `AND s.transport_code = '${scope.branch}'` : "";
  const rows = await query(
    `WITH params AS (
       SELECT $1::timestamp AS start_at, $2::timestamp AS end_at
     ),
     opened_source AS (
       SELECT
         s.doc_no AS bill_no,
         COALESCE(NULLIF(TRIM(s.transport_code), ''), 'unknown') AS branch_code,
         COALESCE(NULLIF(TRIM(sale_u.department::text), ''), 'unknown') AS department_code,
         COALESCE(
           NULLIF(TRIM(dep.name_1::text), ''),
           NULLIF(TRIM(sale_u.department::text), ''),
           'ບໍ່ລະບຸພະແນກ'
         ) AS department_name,
         COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) AS opened_at,
         completed.sent_end AS completed_at,
         p.end_at AS month_end_at
       FROM public.ic_trans_shipment s
       LEFT JOIN public.ic_trans t ON t.doc_no = s.doc_no
       LEFT JOIN erp_user sale_u ON sale_u.code = t.sale_code
       LEFT JOIN erp_department_list dep ON dep.code = sale_u.department
       LEFT JOIN LATERAL (
         SELECT MIN(done.sent_end) AS sent_end
         FROM public.odg_tms_detail done
         LEFT JOIN public.odg_tms done_job ON done_job.doc_no = done.doc_no
         WHERE done.bill_no = s.doc_no
           AND done.status = 1
           AND done.sent_end IS NOT NULL
           AND COALESCE(done_job.approve_status,0) = 1
       ) completed ON true
       CROSS JOIN params p
       WHERE COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) >= p.start_at
         AND COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) < p.end_at
         AND s.transport_code IS NOT NULL
         AND s.transport_code IN (${branchCodeSql})
         ${openedBranchClause}
     ),
     opened_rollup AS (
       SELECT
         branch_code,
         COUNT(*)::int AS opened,
         COUNT(*) FILTER (WHERE completed_at IS NULL)::int AS pending,
         COUNT(*) FILTER (
           WHERE completed_at IS NULL
              OR completed_at >= month_end_at
         )::int AS carry_out,
         COUNT(*) FILTER (
           WHERE completed_at IS NOT NULL
             AND completed_at <= opened_at + INTERVAL '24 hours'
         )::int AS on_time_from_open,
         COUNT(*) FILTER (
           WHERE completed_at IS NULL
              OR completed_at > opened_at + INTERVAL '24 hours'
         )::int AS breach_from_open
       FROM opened_source
       GROUP BY branch_code
     ),
     department_opened_rollup AS (
       SELECT
         department_code,
         MAX(department_name) AS department_name,
         COUNT(*)::int AS opened,
         COUNT(*) FILTER (WHERE completed_at IS NULL)::int AS pending,
         COUNT(*) FILTER (
           WHERE completed_at IS NULL
              OR completed_at >= month_end_at
         )::int AS carry_out,
         COUNT(*) FILTER (
           WHERE completed_at IS NOT NULL
             AND completed_at <= opened_at + INTERVAL '24 hours'
         )::int AS on_time_from_open,
         COUNT(*) FILTER (
           WHERE completed_at IS NULL
              OR completed_at > opened_at + INTERVAL '24 hours'
         )::int AS breach_from_open
       FROM opened_source
       GROUP BY department_code
     ),
     assigned_source AS (
       SELECT
         d.bill_no,
         COALESCE(NULLIF(TRIM(s.transport_code), ''), 'unknown') AS branch_code,
         COALESCE(NULLIF(TRIM(sale_u.department::text), ''), 'unknown') AS department_code,
         COALESCE(
           NULLIF(TRIM(dep.name_1::text), ''),
           NULLIF(TRIM(sale_u.department::text), ''),
           'ບໍ່ລະບຸພະແນກ'
         ) AS department_name,
         d.status,
         d.sent_start,
         COALESCE(d.date_logistic::timestamp, a.date_logistic::timestamp, d.sent_start, a.dispatch_started_at) AS delivery_date_at,
         d.sent_end,
         COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) AS bill_opened_at,
         COALESCE(history.delivery_rounds, 0) AS delivery_rounds,
         p.start_at AS month_start_at,
         p.end_at AS month_end_at
       FROM public.odg_tms_detail d
       LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       LEFT JOIN erp_user sale_u ON sale_u.code = t.sale_code
       LEFT JOIN erp_department_list dep ON dep.code = sale_u.department
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS delivery_rounds
         FROM public.odg_tms_detail hist
         LEFT JOIN public.odg_tms hist_job ON hist_job.doc_no = hist.doc_no
         WHERE hist.bill_no = d.bill_no
           AND COALESCE(hist_job.approve_status,0) = 1
       ) history ON true
       CROSS JOIN params p
       WHERE d.create_date_time_now >= p.start_at
         AND d.create_date_time_now < p.end_at
         AND COALESCE(a.approve_status,0) = 1
         AND COALESCE(NULLIF(TRIM(s.transport_code), ''), '') IN (${branchCodeSql})
         ${deliveredBranchClause}
     ),
     assigned_rollup AS (
       SELECT
         branch_code,
         COUNT(*)::int AS assigned,
         COUNT(DISTINCT bill_no)::int AS assigned_bills,
         COUNT(DISTINCT bill_no) FILTER (WHERE delivery_rounds > 1)::int AS multi_round_bills,
         COUNT(DISTINCT bill_no) FILTER (WHERE bill_opened_at < month_start_at)::int AS carry_in,
         COUNT(DISTINCT bill_no) FILTER (
           WHERE bill_opened_at >= month_start_at
             AND bill_opened_at < month_end_at
         )::int AS same_month_assigned,
         COUNT(*) FILTER (WHERE status = 1 AND sent_end IS NOT NULL)::int AS delivered,
         COUNT(*) FILTER (WHERE status = 2 AND sent_end IS NOT NULL)::int AS cancelled,
         COUNT(*) FILTER (
           WHERE status = 1
             AND sent_end IS NOT NULL
             AND delivery_date_at IS NOT NULL
             AND sent_end <= delivery_date_at + INTERVAL '24 hours'
         )::int AS on_time_from_start,
         COUNT(*) FILTER (
           WHERE NOT (
             status = 1
             AND sent_end IS NOT NULL
             AND delivery_date_at IS NOT NULL
             AND sent_end <= delivery_date_at + INTERVAL '24 hours'
           )
           AND COALESCE(status,0) <> 2
             AND (
               delivery_date_at IS NULL
               OR sent_end IS NULL
               OR sent_end > delivery_date_at + INTERVAL '24 hours'
             )
         )::int AS breach_from_start
       FROM assigned_source
       GROUP BY branch_code
     ),
     department_assigned_rollup AS (
       SELECT
         department_code,
         MAX(department_name) AS department_name,
         COUNT(*)::int AS assigned,
         COUNT(DISTINCT bill_no)::int AS assigned_bills,
         COUNT(DISTINCT bill_no) FILTER (WHERE delivery_rounds > 1)::int AS multi_round_bills,
         COUNT(DISTINCT bill_no) FILTER (WHERE bill_opened_at < month_start_at)::int AS carry_in,
         COUNT(DISTINCT bill_no) FILTER (
           WHERE bill_opened_at >= month_start_at
             AND bill_opened_at < month_end_at
         )::int AS same_month_assigned,
         COUNT(*) FILTER (WHERE status = 1 AND sent_end IS NOT NULL)::int AS delivered,
         COUNT(*) FILTER (WHERE status = 2 AND sent_end IS NOT NULL)::int AS cancelled,
         COUNT(*) FILTER (
           WHERE status = 1
             AND sent_end IS NOT NULL
             AND delivery_date_at IS NOT NULL
             AND sent_end <= delivery_date_at + INTERVAL '24 hours'
         )::int AS on_time_from_start,
         COUNT(*) FILTER (
           WHERE NOT (
             status = 1
             AND sent_end IS NOT NULL
             AND delivery_date_at IS NOT NULL
             AND sent_end <= delivery_date_at + INTERVAL '24 hours'
           )
           AND COALESCE(status,0) <> 2
             AND (
               delivery_date_at IS NULL
               OR sent_end IS NULL
               OR sent_end > delivery_date_at + INTERVAL '24 hours'
             )
         )::int AS breach_from_start
       FROM assigned_source
       GROUP BY department_code
     )
     SELECT
       'branch' AS dimension,
       COALESCE(o.branch_code, d.branch_code) AS branch_code,
       NULL::text AS department_code,
       NULL::text AS department_name,
       COALESCE(o.opened, 0)::int AS opened,
       COALESCE(d.assigned, 0)::int AS assigned,
       COALESCE(d.assigned_bills, 0)::int AS assigned_bills,
       COALESCE(d.multi_round_bills, 0)::int AS multi_round_bills,
       COALESCE(d.carry_in, 0)::int AS carry_in,
       COALESCE(d.same_month_assigned, 0)::int AS same_month_assigned,
       COALESCE(d.delivered, 0)::int AS delivered,
       COALESCE(o.pending, 0)::int AS pending,
       GREATEST(COALESCE(o.opened, 0) - COALESCE(d.same_month_assigned, 0), 0)::int AS carry_out,
       COALESCE(d.cancelled, 0)::int AS cancelled,
       COALESCE(o.on_time_from_open, 0)::int AS on_time_from_open,
       COALESCE(o.breach_from_open, 0)::int AS breach_from_open,
       COALESCE(d.on_time_from_start, 0)::int AS on_time_from_start,
       COALESCE(d.breach_from_start, 0)::int AS breach_from_start
     FROM opened_rollup o
     FULL JOIN assigned_rollup d USING (branch_code)
     UNION ALL
     SELECT
       'department' AS dimension,
       NULL::text AS branch_code,
       COALESCE(o.department_code, d.department_code) AS department_code,
       COALESCE(o.department_name, d.department_name, 'ບໍ່ລະບຸພະແນກ') AS department_name,
       COALESCE(o.opened, 0)::int AS opened,
       COALESCE(d.assigned, 0)::int AS assigned,
       COALESCE(d.assigned_bills, 0)::int AS assigned_bills,
       COALESCE(d.multi_round_bills, 0)::int AS multi_round_bills,
       COALESCE(d.carry_in, 0)::int AS carry_in,
       COALESCE(d.same_month_assigned, 0)::int AS same_month_assigned,
       COALESCE(d.delivered, 0)::int AS delivered,
       COALESCE(o.pending, 0)::int AS pending,
       GREATEST(COALESCE(o.opened, 0) - COALESCE(d.same_month_assigned, 0), 0)::int AS carry_out,
       COALESCE(d.cancelled, 0)::int AS cancelled,
       COALESCE(o.on_time_from_open, 0)::int AS on_time_from_open,
       COALESCE(o.breach_from_open, 0)::int AS breach_from_open,
       COALESCE(d.on_time_from_start, 0)::int AS on_time_from_start,
       COALESCE(d.breach_from_start, 0)::int AS breach_from_start
     FROM department_opened_rollup o
     FULL JOIN department_assigned_rollup d USING (department_code)
     ORDER BY dimension, branch_code, department_code`,
    [monthStart, nextMonthStart]
  );

  const branchNameRows = await query(
    `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name
     FROM transport_type
     WHERE code = ANY($1::text[])`,
    [MONTHLY_DELIVERY_BRANCH_CODES]
  );
  const branchNames = {
    ...Object.fromEntries(branchNameRows.map((r) => [r.code, r.name])),
    ...MONTHLY_DELIVERY_BRANCH_NAMES,
  };

  const toEntry = (r) => ({
    opened: Number(r.opened) || 0,
    assigned: Number(r.assigned) || 0,
    assigned_bills: Number(r.assigned_bills) || 0,
    multi_round_bills: Number(r.multi_round_bills) || 0,
    carry_in: Number(r.carry_in) || 0,
    same_month_assigned: Number(r.same_month_assigned) || 0,
    delivered: Number(r.delivered) || 0,
    pending: Number(r.pending) || 0,
    carry_out: Number(r.carry_out) || 0,
    cancelled: Number(r.cancelled) || 0,
    on_time: Number(r.on_time_from_open) || 0,
    breach: Number(r.breach_from_open) || 0,
    on_time_from_open: Number(r.on_time_from_open) || 0,
    breach_from_open: Number(r.breach_from_open) || 0,
    on_time_from_start: Number(r.on_time_from_start) || 0,
    breach_from_start: Number(r.breach_from_start) || 0,
  });

  const overall = {
    opened: 0,
    assigned: 0,
    assigned_bills: 0,
    multi_round_bills: 0,
    carry_in: 0,
    same_month_assigned: 0,
    delivered: 0,
    pending: 0,
    carry_out: 0,
    cancelled: 0,
    on_time: 0,
    breach: 0,
    on_time_from_open: 0,
    breach_from_open: 0,
    on_time_from_start: 0,
    breach_from_start: 0,
  };
  const branchRows = rows.filter((r) => r.dimension === "branch");
  const departmentRows = rows.filter((r) => r.dimension === "department");

  const branches = branchRows.map((r) => {
    const code = String(r.branch_code || "").trim();
    const entry = {
      branch_code: code || "unknown",
      branch_name: (code && branchNames[code]) || code || "ບໍ່ລະບຸສາຂາ",
      ...toEntry(r),
    };
    for (const key of Object.keys(overall)) {
      overall[key] += Number(entry[key]) || 0;
    }
    return entry;
  });

  const departments = departmentRows.map((r) => ({
    department_code: String(r.department_code || "").trim() || "unknown",
    department_name: String(r.department_name || "").trim() || "ບໍ່ລະບຸພະແນກ",
    ...toEntry(r),
  }));

  branches.sort((a, b) => a.branch_code.localeCompare(b.branch_code));
  departments.sort((a, b) => {
    const assignedDiff = (Number(b.assigned) || 0) - (Number(a.assigned) || 0);
    if (assignedDiff !== 0) return assignedDiff;
    return a.department_name.localeCompare(b.department_name);
  });
  // ບິນຄ້າງສົ່ງແຕ່ລະມື້ — ນັບບິນທີ່ເປີດແຕ່ລະວັນ (ໃນເດືອນ) ແລະ ຍັງບໍ່ສຳເລັດ.
  const dailyRows = await query(
    `WITH params AS (SELECT $1::timestamp AS start_at, $2::timestamp AS end_at),
     opened_source AS (
       SELECT s.doc_no AS bill_no,
         COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) AS opened_at,
         (SELECT MIN(done.sent_end) FROM public.odg_tms_detail done
            LEFT JOIN public.odg_tms done_job ON done_job.doc_no = done.doc_no
            WHERE done.bill_no = s.doc_no AND done.status = 1 AND done.sent_end IS NOT NULL
              AND COALESCE(done_job.approve_status,0) = 1) AS completed_at
       FROM public.ic_trans_shipment s
       LEFT JOIN public.ic_trans t ON t.doc_no = s.doc_no
       CROSS JOIN params p
       WHERE COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) >= p.start_at
         AND COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) < p.end_at
         AND s.transport_code IS NOT NULL
         AND s.transport_code IN (${branchCodeSql})
         ${openedBranchClause}
     )
     SELECT to_char(opened_at::date, 'YYYY-MM-DD') AS day,
            to_char(opened_at::date, 'DD/MM') AS day_label,
            COUNT(DISTINCT bill_no)::int AS opened,
            COUNT(DISTINCT bill_no) FILTER (WHERE completed_at IS NULL)::int AS pending,
            COUNT(DISTINCT bill_no) FILTER (WHERE completed_at IS NOT NULL)::int AS delivered
     FROM opened_source
     GROUP BY opened_at::date
     ORDER BY opened_at::date`,
    [monthStart, nextMonthStart]
  );
  const daily = dailyRows.map((r) => ({
    day: r.day,
    day_label: r.day_label,
    opened: Number(r.opened) || 0,
    pending: Number(r.pending) || 0,
    delivered: Number(r.delivered) || 0,
  }));

  // ສະຫຼຸບຕາມເຂດ (ນະຄອນຫຼວງ vs ຕ່າງແຂວງ) — ສະເລ່ຍ "ມື້ທີ່ຈັດສົ່ງສຳເລັດ"
  // ນັບຈາກ ວັນນັດຈັດສົ່ງ (date_logistic) ຫາ ວັນສຳເລັດ (sent_end). province '01' = ນະຄອນຫຼວງ.
  const zoneRows = await query(
    `WITH params AS (SELECT $1::timestamp AS start_at, $2::timestamp AS end_at),
     zone_source AS (
       SELECT d.bill_no,
         CASE WHEN TRIM(COALESCE(cust.province,'')) = '01' THEN 'ນະຄອນຫຼວງ' ELSE 'ຕ່າງແຂວງ' END AS zone,
         d.status,
         COALESCE(d.date_logistic::timestamp, a.date_logistic::timestamp, d.sent_start, a.dispatch_started_at) AS appt_at,
         COALESCE(t.create_date_time_now, s.create_date_time_now, s.doc_date::timestamp) AS bill_opened_at,
         d.sent_end
       FROM public.odg_tms_detail d
       LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       LEFT JOIN public.ar_customer cust ON cust.code = s.cust_code
       CROSS JOIN params p
       WHERE d.create_date_time_now >= p.start_at
         AND d.create_date_time_now < p.end_at
         AND COALESCE(a.approve_status,0) = 1
         AND COALESCE(NULLIF(TRIM(s.transport_code), ''), '') IN (${branchCodeSql})
         ${deliveredBranchClause}
     )
     SELECT zone,
       COUNT(DISTINCT bill_no)::int AS assigned_bills,
       COUNT(*) FILTER (WHERE status = 1 AND sent_end IS NOT NULL)::int AS delivered,
       COUNT(*) FILTER (
         WHERE status = 1 AND sent_end IS NOT NULL AND appt_at IS NOT NULL
           AND sent_end::date <= appt_at::date
       )::int AS on_time_appt,
       ROUND(AVG(sent_end::date - appt_at::date) FILTER (
         WHERE status = 1 AND sent_end IS NOT NULL AND appt_at IS NOT NULL
       ), 2) AS avg_days_from_appt,
       ROUND(AVG(sent_end::date - bill_opened_at::date) FILTER (
         WHERE status = 1 AND sent_end IS NOT NULL AND bill_opened_at IS NOT NULL
       ), 2) AS avg_days_from_open
     FROM zone_source
     GROUP BY zone`,
    [monthStart, nextMonthStart]
  );
  const zoneOrder = ["ນະຄອນຫຼວງ", "ຕ່າງແຂວງ"];
  const zones = zoneRows
    .map((r) => ({
      zone: r.zone,
      assigned_bills: Number(r.assigned_bills) || 0,
      delivered: Number(r.delivered) || 0,
      on_time_appt: Number(r.on_time_appt) || 0,
      avg_days_from_appt: r.avg_days_from_appt == null ? null : Number(r.avg_days_from_appt),
      avg_days_from_open: r.avg_days_from_open == null ? null : Number(r.avg_days_from_open),
    }))
    .sort((a, b) => zoneOrder.indexOf(a.zone) - zoneOrder.indexOf(b.zone));

  // ການນຳໃຊ້ລົດ — ຖ້ຽວທີ່ແລ່ນ, ລົດທີ່ໃຊ້ງານ, ສະເລ່ຍຖ້ຽວ/ຄັນ/ມື້ (job ທີ່ອະນຸມັດ
  // ແລະ ມີບິນຢູ່ສາຂາ KPI).
  const fleetRow = await queryOne(
    `WITH j AS (
       SELECT DISTINCT a.doc_no, a.car, a.create_date_time_now::date AS d
       FROM public.odg_tms a
       WHERE a.create_date_time_now >= $1::timestamp
         AND a.create_date_time_now < $2::timestamp
         AND COALESCE(a.approve_status,0) = 1
         AND COALESCE(NULLIF(TRIM(a.car), ''), '') <> ''
         AND EXISTS (
           SELECT 1 FROM public.odg_tms_detail dd
           LEFT JOIN public.ic_trans_shipment ss ON ss.doc_no = dd.bill_no
           WHERE dd.doc_no = a.doc_no
             AND COALESCE(NULLIF(TRIM(ss.transport_code), ''), '') IN (${branchCodeSql})
         )
     )
     SELECT COUNT(*)::int AS total_trips,
            COUNT(DISTINCT car)::int AS active_cars,
            COUNT(DISTINCT (car, d))::int AS car_days,
            ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT (car, d)), 0), 2) AS trips_per_car_per_day
     FROM j`,
    [monthStart, nextMonthStart]
  );
  const fleet = {
    total_trips: Number(fleetRow?.total_trips) || 0,
    active_cars: Number(fleetRow?.active_cars) || 0,
    car_days: Number(fleetRow?.car_days) || 0,
    trips_per_car_per_day:
      fleetRow?.trips_per_car_per_day == null ? null : Number(fleetRow.trips_per_car_per_day),
  };

  return { month: monthly, overall, branches, departments, daily, zones, fleet };
}

async function getMonthlyDeliveryKpi(session, monthly) {
  const report = await getReportMonthlyDelivery(session, monthly);
  return {
    branches: report.branches.map((branch) => {
      const opened = Number(branch.opened) || 0;
      return {
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        opened,
        assigned: Number(branch.assigned) || 0,
        assigned_bills: Number(branch.assigned_bills) || 0,
        multi_round_bills: Number(branch.multi_round_bills) || 0,
        carry_in: Number(branch.carry_in) || 0,
        carry_out: Number(branch.carry_out) || 0,
        dispatched: Number(branch.assigned) || 0,
        delivered: Number(branch.delivered) || 0,
        pending: Number(branch.pending) || 0,
        kpi_success: Number(branch.on_time_from_open ?? branch.on_time) || 0,
        returns: 0,
        failed_closed: Number(branch.cancelled) || 0,
        avg_days_from_appt: null,
      };
    }),
    fleet: {
      active_vehicles: 0,
      active_drivers: 0,
      total_trips: 0,
      vehicle_days: 0,
    },
  };
}

// Daily pending-bills report grouped by sale department + transport branch.
// Reuses getBillsPending so the figures stay in sync with /bills-pending and
// the dashboard's "ຄ້າງສົ່ງ" tile — no duplicated WHERE clauses to drift.
//
// Returns:
//   { rows, days, departments, transports, totals }
//   - rows: per-bill records (date, department, transport, bill_no, ...)
//   - days/departments/transports: distinct sorted dimensions for filter UI
//   - totals: aggregate { bills, items, qty } for the whole range
async function getReportPendingDaily(session, fromDate, toDate) {
  const { getBillsPending } = require("./bills");
  const { trans } = await getBillsPending(session, fromDate, toDate, "all");

  const rows = trans.map((bill) => ({
    send_date: bill.send_date ?? null,
    send_date_display: bill.send_date_display ?? bill.send_date ?? "-",
    department: (bill.department && String(bill.department).trim()) || "(ບໍ່ກຳນົດພະແນກ)",
    transport_code: bill.transport_code ?? "",
    transport: (bill.transport && String(bill.transport).trim()) || "(ບໍ່ກຳນົດຂົນສົ່ງ)",
    doc_no: bill.doc_no,
    customer: bill.transport_name || bill.cust_name || bill.cust_code || "-",
    sale: bill.sale ?? "",
    remaining_count: Number(bill.remaining_count ?? 0),
    remaining_qty_total: Number(bill.remaining_qty_total ?? 0),
    scheduled_date_display: bill.scheduled_date_display ?? "",
    action_status: bill.action_status ?? "",
    source_type: bill.source_type ?? "ic_trans_shipment",
  }));

  const sortedUnique = (vals) => Array.from(new Set(vals)).sort();
  const totals = rows.reduce(
    (acc, r) => {
      acc.bills += 1;
      acc.items += r.remaining_count;
      acc.qty += r.remaining_qty_total;
      return acc;
    },
    { bills: 0, items: 0, qty: 0 }
  );

  return {
    rows,
    days: sortedUnique(rows.map((r) => r.send_date_display).filter(Boolean)),
    departments: sortedUnique(rows.map((r) => r.department)),
    transports: sortedUnique(rows.map((r) => r.transport)),
    totals,
  };
}

// Helper: per-bill rows for a given final status (1 = ສຳເລັດ, 2 = ຍົກເລີກ),
// grouped + filterable by sale department + transport branch the same way
// the pending report does. Driven by sent_end so partial deliveries on the
// same bill across multiple trips each count once per attempt.
async function getReportByDeliveryStatus(session, fromDate, toDate, status) {
  const scope = getBranchScope(session);
  const branchClause = scope.scoped
    ? `AND s.transport_code = '${scope.branch}'`
    : "";
  const rows = await query(
    `SELECT
       to_char(d.sent_end, 'YYYY-MM-DD') AS finished_date,
       to_char(d.sent_end, 'DD-MM-YYYY') AS finished_date_display,
       to_char(d.sent_end, 'HH24:MI') AS finished_time,
       d.bill_no,
       d.doc_no,
       COALESCE(NULLIF(TRIM(cust.name_1), ''), d.cust_code, '-') AS customer,
       COALESCE(NULLIF(TRIM(dep.name_1::text), ''), NULLIF(TRIM(saleU.department::text), ''), '(ບໍ່ກຳນົດພະແນກ)') AS department,
       COALESCE(NULLIF(TRIM(saleU.name_1::text), ''), '') AS sale,
       COALESCE(NULLIF(TRIM(s.transport_code), ''), '') AS transport_code,
       COALESCE(NULLIF(TRIM(tt.name_1::text), ''), '(ບໍ່ກຳນົດຂົນສົ່ງ)') AS transport,
       COALESCE(NULLIF(TRIM(carT.name_1::text), ''), d.car, '-') AS car,
       COALESCE(NULLIF(TRIM(drvT.name_1::text), ''), j.driver, '-') AS driver,
       COALESCE(NULLIF(TRIM(d.count_item::text), ''), '0')::int AS item_count,
       COALESCE(d.remark, '') AS remark
     FROM public.odg_tms_detail d
     LEFT JOIN odg_tms j ON j.doc_no = d.doc_no
     LEFT JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
     LEFT JOIN public.ic_trans ic ON ic.doc_no = d.bill_no
     LEFT JOIN erp_user saleU ON saleU.code = ic.sale_code
     LEFT JOIN erp_department_list dep ON dep.code = saleU.department
     LEFT JOIN public.transport_type tt ON tt.code = s.transport_code
     LEFT JOIN ar_customer cust ON cust.code = d.cust_code
     LEFT JOIN public.odg_tms_car carT ON carT.code = d.car
     LEFT JOIN public.odg_tms_driver drvT ON drvT.code = j.driver
     WHERE COALESCE(d.status, 0) = $3
       AND d.sent_end IS NOT NULL
       AND d.sent_end::date BETWEEN $1::date AND $2::date
       AND ${getFixedYearSqlFilter("d.doc_date")}
       ${branchClause}
     ORDER BY d.sent_end DESC, d.bill_no`,
    [fromDate, toDate, status]
  );

  const sortedUnique = (vals) => Array.from(new Set(vals)).sort();
  const totals = rows.reduce(
    (acc, r) => {
      acc.bills += 1;
      acc.items += Number(r.item_count) || 0;
      return acc;
    },
    { bills: 0, items: 0 }
  );
  return {
    rows,
    days: sortedUnique(rows.map((r) => r.finished_date_display)),
    departments: sortedUnique(rows.map((r) => r.department)),
    transports: sortedUnique(rows.map((r) => r.transport)),
    totals,
  };
}

async function getReportDeliveredDaily(session, fromDate, toDate) {
  return getReportByDeliveryStatus(session, fromDate, toDate, 1);
}

async function getReportCancelledDaily(session, fromDate, toDate) {
  return getReportByDeliveryStatus(session, fromDate, toDate, 2);
}

// Per-attempt items: what was loaded into this trip for this bill, and how
// much actually got delivered. Falls back to ic_trans_detail when the row
// table is empty (cancelled before pickup) so the UI can still show what
// the bill contained.
async function getAttemptDeliveryItems(docNo, billNo) {
  const items = await query(
    `SELECT i.item_code,
            i.item_name,
            COALESCE(i.qty, 0)::numeric AS qty,
            COALESCE(i.selected_qty, 0)::numeric AS selected_qty,
            COALESCE(i.delivered_qty, 0)::numeric AS delivered_qty,
            i.unit_code
     FROM public.odg_tms_detail_item i
     WHERE i.doc_no = $1 AND i.bill_no = $2
     ORDER BY i.roworder NULLS LAST, i.item_code`,
    [docNo, billNo]
  );
  if (items.length > 0) return items;
  return query(
    `SELECT t.item_code,
            MAX(t.item_name) AS item_name,
            SUM(COALESCE(t.qty, 0))::numeric AS qty,
            SUM(COALESCE(t.qty, 0))::numeric AS selected_qty,
            0::numeric AS delivered_qty,
            MAX(t.unit_code) AS unit_code
     FROM ic_trans_detail t
     WHERE t.doc_no = $1 AND t.item_code NOT LIKE '97%'
     GROUP BY t.item_code
     ORDER BY t.item_code`,
    [billNo]
  );
}

module.exports = {
  getReportDaily,
  getReportByDriver,
  getReportByCar,
  getReportByBill,
  getReportMonthlyCar,
  getReportMonthlyDriver,
  getReportMonthlyDelivery,
  getMonthlyDeliveryKpi,
  getReportPendingDaily,
  getReportDeliveredDaily,
  getReportCancelledDaily,
  getAttemptDeliveryItems,
};

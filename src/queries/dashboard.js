const { query, queryOne } = require("../lib/db");
const {
  getFixedTodayDate,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const {
  formatInterval,
  getNextMonthStart,
  toDisplayDate,
  toDisplayMonth,
  getBranchScope,
  branchFilterJob,
} = require("./helpers");

async function getDashboardData(session) {
  const fixedToday = getFixedTodayDate();
  const fixedMonth = fixedToday.slice(0, 7);
  const monthStart = `${fixedMonth}-01`;
  const nextMonthStart = getNextMonthStart(fixedMonth);

  const userBranch = session?.logistic_code?.trim();
  const scoped = !!userBranch && userBranch !== "02-0004";
  const branchAnd = (alias = "") =>
    scoped ? `AND ${alias ? alias + "." : ""}transport_code = '${userBranch}'` : "";
  const scope = { scoped, branch: userBranch ?? "" };

  const data = await queryOne(`
    SELECT count(doc_no) AS bill_count,
      sum(case when transport_code='02-0004' then 1 else 0 end) as pickup,
      sum(case when transport_code !='02-0004' then 1 else 0 end) as logistic,
      sum(case when transport_code ='02-0001' then 1 else 0 end) as logistic_od,
      sum(case when transport_code ='02-0002' then 1 else 0 end) as logistic_dt,
      sum(case when transport_code ='02-0003' then 1 else 0 end) as logistic_ps
    FROM ic_trans_shipment
    WHERE ${getFixedYearSqlFilter("doc_date")} AND transport_code IS NOT NULL ${branchAnd()}
  `);
  const teamSql = (code) =>
    `SELECT count(doc_no) AS bill_count,
       sum(case when check_status=0 then 1 else 0 end) as still,
       sum(case when check_status=1 then 1 else 0 end) as complete
     FROM ic_trans_shipment
     WHERE ${getFixedYearSqlFilter("doc_date")} AND transport_code='${code}'`;
  const emptyTeam = { bill_count: 0, still: 0, complete: 0 };
  const kl = !scoped || userBranch === "02-0001" ? await queryOne(teamSql("02-0001")) : emptyTeam;
  const dt = !scoped || userBranch === "02-0002" ? await queryOne(teamSql("02-0002")) : emptyTeam;
  const ps = !scoped || userBranch === "02-0003" ? await queryOne(teamSql("02-0003")) : emptyTeam;
  const pendingSummary = await queryOne(
    `SELECT
      count(*) FILTER (WHERE a.doc_date >= $1::date AND a.doc_date < $2::date AND a.check_status=0) AS month_count,
      count(*) FILTER (WHERE a.doc_date = $3::date AND a.check_status=0) AS today_count,
      count(*) FILTER (WHERE a.doc_date = $3::date AND a.check_status=0) AS today_pending,
      count(*) FILTER (WHERE a.doc_date = $3::date AND a.check_status=1) AS today_complete,
      count(*) FILTER (WHERE a.doc_date >= $1::date AND a.doc_date < $2::date AND a.check_status=0) AS month_pending,
      count(*) FILTER (WHERE a.doc_date >= $1::date AND a.doc_date < $2::date AND a.check_status=1) AS month_complete,
      count(*) FILTER (WHERE a.check_status=0) AS year_pending,
      count(*) FILTER (WHERE a.check_status=1) AS year_complete
    FROM ic_trans_shipment a
    WHERE a.transport_code NOT IN ('02-0004')
      ${branchAnd("a")}
      AND ${getFixedYearSqlFilter("a.doc_date")}`,
    [monthStart, nextMonthStart, fixedToday]
  );

  const pendingSelect = `
    SELECT a.doc_no, to_char(a.doc_date,'DD-MM-YYYY') AS doc_date, a.transport_name, c.name_1 AS sale, d.name_1 AS transport,
      to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI:SS') AS time_open,
      now() - a.create_date_time_now AS time_use,
      greatest(floor(extract(epoch from now() - a.create_date_time_now)), 0)::bigint AS time_use_seconds
    FROM ic_trans_shipment a
    LEFT JOIN ic_trans b ON b.doc_no=a.doc_no
    LEFT JOIN erp_user c ON c.code=b.sale_code
    LEFT JOIN transport_type d ON d.code=a.transport_code
  `;
  const pendingBaseWhere = `
    WHERE check_status=0
      AND a.transport_code NOT IN ('02-0004')
      ${branchAnd("a")}
  `;

  const trans = await query(
    `${pendingSelect} ${pendingBaseWhere}
      AND ${getFixedYearSqlFilter("a.doc_date")}
    ORDER BY a.create_date_time_now ASC, a.doc_date ASC
    LIMIT 10`
  );
  const transMonth = await query(
    `${pendingSelect} ${pendingBaseWhere}
      AND a.doc_date >= $1::date AND a.doc_date < $2::date
    ORDER BY a.create_date_time_now ASC, a.doc_date ASC
    LIMIT 10`,
    [monthStart, nextMonthStart]
  );
  const transToday = await query(
    `${pendingSelect} ${pendingBaseWhere}
      AND a.doc_date = $1::date
    ORDER BY a.create_date_time_now ASC, a.doc_date ASC
    LIMIT 10`,
    [fixedToday]
  );

  const inProgressBranchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  const inProgressRows = await query(
    `SELECT
      d.bill_no,
      d.doc_no,
      to_char(d.doc_date,'DD-MM-YYYY') as doc_date,
      to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
      COALESCE(NULLIF(TRIM(cust.name_1), ''), d.cust_code, '-') as customer,
      COALESCE(d.telephone, '') as telephone,
      COALESCE(to_char(d.sent_start,'DD-MM-YYYY HH24:MI'), '-') as active_sent_start,
      greatest(floor(extract(epoch from now() - d.sent_start)), 0)::bigint AS active_seconds,
      COALESCE(NULLIF(TRIM(carT.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(drvT.name_1), ''), a.driver, '-') as driver,
      COALESCE(tt.name_1, '-') as transport_name,
      COUNT(*) OVER() AS total_in_progress_bills
    FROM public.odg_tms_detail d
    INNER JOIN odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN ar_customer cust ON cust.code = d.cust_code
    LEFT JOIN public.odg_tms_car carT ON carT.code = a.car
    LEFT JOIN public.odg_tms_driver drvT ON drvT.code = a.driver
    LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
    LEFT JOIN transport_type tt ON tt.code = s.transport_code
    WHERE d.sent_start IS NOT NULL
      AND d.sent_end IS NULL
      AND COALESCE(d.status, 0) NOT IN (1, 2)
      AND ${getFixedYearSqlFilter("d.doc_date")}
      AND COALESCE(a.approve_status, 0) = 1
      AND COALESCE(a.job_status, 0) <> 4
      ${inProgressBranchClause}
    ORDER BY d.sent_start ASC
    LIMIT 8`
  );

  const waitingDispatchBranchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  const waitingDispatchRows = await query(
    `SELECT
      d.bill_no,
      d.doc_no,
      to_char(d.doc_date,'DD-MM-YYYY') as doc_date,
      to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
      COALESCE(NULLIF(TRIM(cust.name_1), ''), d.cust_code, '-') as customer,
      COALESCE(d.telephone, '') as telephone,
      COALESCE(to_char(COALESCE(d.recipt_job, a.create_date_time_now),'DD-MM-YYYY HH24:MI'), '-') as waiting_since,
      greatest(floor(extract(epoch from now() - COALESCE(d.recipt_job, a.create_date_time_now))), 0)::bigint AS waiting_seconds,
      COALESCE(NULLIF(TRIM(carT.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(drvT.name_1), ''), a.driver, '-') as driver,
      COALESCE(tt.name_1, '-') as transport_name,
      CASE WHEN d.recipt_job IS NOT NULL THEN true ELSE false END as picked_up,
      COUNT(*) OVER() AS total_waiting_dispatch_bills
    FROM public.odg_tms_detail d
    INNER JOIN odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN ar_customer cust ON cust.code = d.cust_code
    LEFT JOIN public.odg_tms_car carT ON carT.code = a.car
    LEFT JOIN public.odg_tms_driver drvT ON drvT.code = a.driver
    LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
    LEFT JOIN transport_type tt ON tt.code = s.transport_code
    WHERE d.sent_start IS NULL
      AND d.sent_end IS NULL
      AND COALESCE(d.status, 0) NOT IN (1, 2)
      AND ${getFixedYearSqlFilter("d.doc_date")}
      AND COALESCE(a.approve_status, 0) = 1
      AND COALESCE(a.job_status, 0) <> 4
      ${waitingDispatchBranchClause}
    ORDER BY COALESCE(d.recipt_job, a.create_date_time_now) ASC
    LIMIT 8`
  );

  const deliveredPendingCloseBranchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  const deliveredPendingCloseRows = await query(
    `SELECT
      d.bill_no,
      d.doc_no,
      to_char(d.doc_date,'DD-MM-YYYY') as doc_date,
      to_char(d.bill_date,'DD-MM-YYYY') as bill_date,
      COALESCE(NULLIF(TRIM(cust.name_1), ''), d.cust_code, '-') as customer,
      COALESCE(d.telephone, '') as telephone,
      COALESCE(to_char(d.sent_end,'DD-MM-YYYY HH24:MI'), '-') as delivered_at,
      greatest(floor(extract(epoch from now() - d.sent_end)), 0)::bigint AS pending_close_seconds,
      COALESCE(NULLIF(TRIM(carT.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(drvT.name_1), ''), a.driver, '-') as driver,
      COALESCE(tt.name_1, '-') as transport_name,
      COALESCE(a.job_status, 0) as job_status,
      CASE
        WHEN COALESCE(a.job_status, 0) = 3 THEN 'ຄົນຂັບປິດງານແລ້ວ'
        WHEN COALESCE(a.job_status, 0) = 2 THEN 'ກຳລັງຈັດສົ່ງ'
        WHEN COALESCE(a.job_status, 0) = 1 THEN 'ຮັບຖ້ຽວແລ້ວ'
        ELSE 'ລໍຖ້າ'
      END as job_status_text,
      COALESCE(d.url_img, '') as url_img,
      COALESCE(d.sight_img, '') as sight_img,
      COALESCE(d.remark, '') as remark,
      COUNT(*) OVER() AS total_delivered_pending_close
    FROM public.odg_tms_detail d
    INNER JOIN odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN ar_customer cust ON cust.code = d.cust_code
    LEFT JOIN public.odg_tms_car carT ON carT.code = a.car
    LEFT JOIN public.odg_tms_driver drvT ON drvT.code = a.driver
    LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
    LEFT JOIN transport_type tt ON tt.code = s.transport_code
    WHERE COALESCE(d.status, 0) = 1
      AND d.sent_end IS NOT NULL
      AND ${getFixedYearSqlFilter("d.doc_date")}
      AND COALESCE(a.approve_status, 0) = 1
      AND COALESCE(a.job_status, 0) <> 4
      ${deliveredPendingCloseBranchClause}
    ORDER BY d.sent_end DESC
    LIMIT 8`
  );

  const normalizePendingShipments = (items) =>
    items.map((item) => ({ ...item, time_use: formatInterval(item.time_use) }));
  const inProgressCount = inProgressRows[0]?.total_in_progress_bills ?? 0;
  const inProgress = inProgressRows.map(({ total_in_progress_bills, ...bill }) => bill);
  const waitingDispatchCount = waitingDispatchRows[0]?.total_waiting_dispatch_bills ?? 0;
  const waitingDispatch = waitingDispatchRows.map(({ total_waiting_dispatch_bills, ...bill }) => bill);
  const deliveredPendingCloseCount = deliveredPendingCloseRows[0]?.total_delivered_pending_close ?? 0;
  const deliveredPendingClose = deliveredPendingCloseRows.map(({ total_delivered_pending_close, ...bill }) => bill);

  return {
    data,
    kl,
    dt,
    ps,
    user_branch: scoped ? userBranch : null,
    trans: normalizePendingShipments(trans),
    trans_month: normalizePendingShipments(transMonth),
    trans_today: normalizePendingShipments(transToday),
    in_progress: inProgress,
    in_progress_count: inProgressCount,
    waiting_dispatch: waitingDispatch,
    waiting_dispatch_count: waitingDispatchCount,
    delivered_pending_close: deliveredPendingClose,
    delivered_pending_close_count: deliveredPendingCloseCount,
    pending_summary: {
      ...pendingSummary,
      current_date: toDisplayDate(fixedToday),
      current_month: toDisplayMonth(fixedMonth),
    },
  };
}

module.exports = { getDashboardData };

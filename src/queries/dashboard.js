const { query, queryOne } = require("../lib/db");
const {
  getFixedTodayDate,
  FIXED_YEAR_START,
  FIXED_YEAR_END,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const {
  formatInterval,
  getNextMonthStart,
  toDisplayDate,
  toDisplayMonth,
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
  let kl = !scoped || userBranch === "02-0001" ? await queryOne(teamSql("02-0001")) : emptyTeam;
  let dt = !scoped || userBranch === "02-0002" ? await queryOne(teamSql("02-0002")) : emptyTeam;
  let ps = !scoped || userBranch === "02-0003" ? await queryOne(teamSql("02-0003")) : emptyTeam;
  const completeSummary = await queryOne(
    `SELECT
      count(*) FILTER (WHERE a.doc_date = $3::date AND a.check_status=1) AS today_complete,
      count(*) FILTER (WHERE a.doc_date >= $1::date AND a.doc_date < $2::date AND a.check_status=1) AS month_complete,
      count(*) FILTER (WHERE a.check_status=1) AS year_complete
    FROM ic_trans_shipment a
    WHERE a.transport_code NOT IN ('02-0004')
      ${branchAnd("a")}
      AND ${getFixedYearSqlFilter("a.doc_date")}`,
    [monthStart, nextMonthStart, fixedToday]
  );

  // Single source of truth: delegate to getBillsPending so the dashboard's
  // count is byte-for-byte identical to what /bills-pending shows for the
  // same date range. We use the year's full range here — month_pending /
  // today_pending are derived by filtering this list in JS below.
  const { getBillsPending } = require("./bills");
  const { trans: pendingWithRemaining } = await getBillsPending(
    session,
    FIXED_YEAR_START,
    FIXED_YEAR_END,
    "all"
  );
  const trans = pendingWithRemaining.slice(0, 10);
  const transMonth = pendingWithRemaining
    .filter((bill) => bill.send_date >= monthStart && bill.send_date < nextMonthStart)
    .slice(0, 10);
  const transToday = pendingWithRemaining
    .filter((bill) => bill.send_date === fixedToday)
    .slice(0, 10);
  const branchPendingCount = (code) =>
    pendingWithRemaining.filter((bill) => bill.transport_code === code).length;
  kl = { ...kl, still: branchPendingCount("02-0001") };
  dt = { ...dt, still: branchPendingCount("02-0002") };
  ps = { ...ps, still: branchPendingCount("02-0003") };
  const pendingSummary = {
    ...completeSummary,
    month_count: pendingWithRemaining.filter(
      (bill) => bill.send_date >= monthStart && bill.send_date < nextMonthStart
    ).length,
    today_count: pendingWithRemaining.filter((bill) => bill.send_date === fixedToday).length,
    today_pending: pendingWithRemaining.filter((bill) => bill.send_date === fixedToday).length,
    month_pending: pendingWithRemaining.filter(
      (bill) => bill.send_date >= monthStart && bill.send_date < nextMonthStart
    ).length,
    year_pending: pendingWithRemaining.length,
  };

  // Breakdown for the pending KPI strip. Computed in JS from the same
  // pendingWithRemaining list to stay consistent with /bills-pending.
  //   overdue        — ANY pending bill whose effective scheduled_date is past
  //   past_send_date — bills that are contacted+ready, but the delivery date
  //                    has already slipped past today (escalation queue)
  //   contacted      — has any contact action_status set
  //   uncontacted    — no action_status yet
  //   ready          — contacted_ready, dispatch-eligible
  const pendingBreakdown = {
    total: pendingWithRemaining.length,
    overdue: pendingWithRemaining.filter(
      (bill) => bill.scheduled_date && bill.scheduled_date < fixedToday
    ).length,
    past_send_date: pendingWithRemaining.filter(
      (bill) =>
        bill.action_status === "contacted_ready" &&
        bill.scheduled_date &&
        bill.scheduled_date < fixedToday
    ).length,
    contacted: pendingWithRemaining.filter((bill) => bill.action_status).length,
    uncontacted: pendingWithRemaining.filter((bill) => !bill.action_status).length,
    ready: pendingWithRemaining.filter(
      (bill) => bill.action_status === "contacted_ready"
    ).length,
  };

  const branchNameRows = await query(
    `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name
     FROM transport_type
     WHERE code IN ('02-0001','02-0002','02-0003')`
  );
  const branchNames = Object.fromEntries(branchNameRows.map((r) => [r.code, r.name]));

  // Delivery KPIs measured on completed bills (status=1, sent_end set):
  //   on_time   — sent_end::date <= target (scheduled_date | send_date | bill_date)
  //   breach    — sent_end::date >  target
  //   delivery  — avg seconds from sent_start → sent_end
  //   close     — avg seconds from sent_end → odg_tms.job_close
  // Window selected on the bill's actual delivery date (sent_end::date) so a
  // late bill closed today counts toward today's stats.
  const kpiBranchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  // The delivered CTE adds a `branch_code` from the bill's shipment record so
  // we can compute the same KPI bucket per-branch in one pass.
  const kpiRows = await query(
    `WITH delivered AS (
       SELECT
         COALESCE(s.transport_code, '') AS branch_code,
         d.sent_end::date AS delivered_date,
         EXTRACT(EPOCH FROM (d.sent_end - d.sent_start))::float8 AS delivery_seconds,
         CASE WHEN a.job_close IS NOT NULL
              THEN EXTRACT(EPOCH FROM (a.job_close - d.sent_end))::float8
         END AS close_seconds,
         CASE
           WHEN COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) IS NULL THEN NULL
           WHEN d.sent_end::date <= COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) THEN true
           ELSE false
         END AS is_on_time
       FROM public.odg_tms_detail d
       INNER JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN ic_trans t ON t.doc_no = d.bill_no
       LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
       WHERE d.status = 1
         AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND ${getFixedYearSqlFilter("d.doc_date")}
         ${kpiBranchClause}
     ),
     bucket AS (
       SELECT branch_code, period, delivery_seconds, close_seconds, is_on_time
       FROM delivered
       CROSS JOIN LATERAL (
         VALUES
           ('today', delivered_date = $3::date),
           ('month', delivered_date >= $1::date AND delivered_date < $2::date),
           ('year', true)
       ) AS p(period, matches)
       WHERE p.matches
     )
     SELECT
       branch_code,
       period,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_on_time = true) AS on_time,
       COUNT(*) FILTER (WHERE is_on_time = false) AS breach,
       AVG(delivery_seconds) AS avg_delivery,
       AVG(close_seconds) AS avg_close
     FROM bucket
     GROUP BY GROUPING SETS ((period), (branch_code, period))`,
    [monthStart, nextMonthStart, fixedToday]
  );
  // Split rows into all-branches summary (branch_code IS NULL from rollup) and
  // per-branch breakdown. Postgres GROUPING SETS marks the rollup row with
  // branch_code = NULL.
  const overallByPeriod = new Map();
  const perBranchByPeriod = new Map();
  for (const row of kpiRows) {
    const period = row.period;
    const entry = {
      total: Number(row.total ?? 0),
      on_time: Number(row.on_time ?? 0),
      breach: Number(row.breach ?? 0),
      avg_delivery_seconds: row.avg_delivery == null ? null : Number(row.avg_delivery),
      avg_close_seconds: row.avg_close == null ? null : Number(row.avg_close),
    };
    if (row.branch_code === null) {
      overallByPeriod.set(period, entry);
    } else {
      const code = String(row.branch_code || "").trim() || "unknown";
      if (!perBranchByPeriod.has(period)) perBranchByPeriod.set(period, []);
      perBranchByPeriod.get(period).push({ branch_code: code, ...entry });
    }
  }
  const emptyKpi = {
    total: 0,
    on_time: 0,
    breach: 0,
    avg_delivery_seconds: null,
    avg_close_seconds: null,
  };
  const kpiBuild = (period) => overallByPeriod.get(period) ?? emptyKpi;
  const kpiBranchesBuild = (period) => {
    const list = perBranchByPeriod.get(period) ?? [];
    return list
      .map((row) => ({
        ...row,
        branch_name: branchNames[row.branch_code]?.trim() || row.branch_code,
      }))
      .sort((a, b) => a.branch_code.localeCompare(b.branch_code));
  };
  // 30-day rolling trend for KPI sparkline. One row per day with the same
  // on-time / breach / avg-delivery / avg-close metrics as the snapshot.
  const trendRows = await query(
    `WITH delivered AS (
       SELECT
         d.sent_end::date AS delivered_date,
         EXTRACT(EPOCH FROM (d.sent_end - d.sent_start))::float8 AS delivery_seconds,
         CASE WHEN a.job_close IS NOT NULL
              THEN EXTRACT(EPOCH FROM (a.job_close - d.sent_end))::float8
         END AS close_seconds,
         CASE
           WHEN COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) IS NULL THEN NULL
           WHEN d.sent_end::date <= COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) THEN true
           ELSE false
         END AS is_on_time
       FROM public.odg_tms_detail d
       INNER JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN ic_trans t ON t.doc_no = d.bill_no
       WHERE d.status = 1
         AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND d.sent_end::date >= ($1::date - INTERVAL '29 days')
         AND d.sent_end::date <= $1::date
         ${kpiBranchClause}
     )
     SELECT
       to_char(delivered_date, 'YYYY-MM-DD') AS day,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_on_time = true) AS on_time,
       COUNT(*) FILTER (WHERE is_on_time = false) AS breach,
       AVG(delivery_seconds) AS avg_delivery,
       AVG(close_seconds) AS avg_close
     FROM delivered
     GROUP BY delivered_date
     ORDER BY delivered_date ASC`,
    [fixedToday]
  );
  const trendMap = new Map(trendRows.map((row) => [row.day, row]));
  const deliveryKpiTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(`${fixedToday}T00:00:00`);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = trendMap.get(key);
    deliveryKpiTrend.push({
      day: key,
      total: Number(row?.total ?? 0),
      on_time: Number(row?.on_time ?? 0),
      breach: Number(row?.breach ?? 0),
      avg_delivery_seconds: row?.avg_delivery == null ? null : Number(row.avg_delivery),
      avg_close_seconds: row?.avg_close == null ? null : Number(row.avg_close),
    });
  }

  const { getCustomerRatingSummary } = require("./customer-rating");
  const ratingSummary = await getCustomerRatingSummary().catch(() => ({
    total: 0,
    avg_stars: null,
    positive: 0,
    negative: 0,
  }));

  const { getSettings } = require("./settings");
  const kpiSettings = await getSettings([
    "kpi.target_on_time_rate",
    "kpi.target_avg_delivery_minutes",
    "kpi.target_avg_close_minutes",
  ]);
  const parseTarget = (raw) => {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };
  const deliveryKpi = {
    today: kpiBuild("today"),
    month: kpiBuild("month"),
    year: kpiBuild("year"),
    by_branch: {
      today: kpiBranchesBuild("today"),
      month: kpiBranchesBuild("month"),
      year: kpiBranchesBuild("year"),
    },
    trend_30d: deliveryKpiTrend,
    targets: {
      on_time_rate: parseTarget(kpiSettings["kpi.target_on_time_rate"]),
      avg_delivery_minutes: parseTarget(kpiSettings["kpi.target_avg_delivery_minutes"]),
      avg_close_minutes: parseTarget(kpiSettings["kpi.target_avg_close_minutes"]),
    },
  };

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
      COALESCE(img.delivery_images, ARRAY[]::text[]) as delivery_images,
      (
        CASE WHEN COALESCE(d.url_img, '') <> '' THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(d.sight_img, '') <> '' THEN 1 ELSE 0 END
        + COALESCE(img.delivery_image_count, 0)
      )::int as image_count,
      COALESCE(d.remark, '') as remark,
      COUNT(*) OVER() AS total_delivered_pending_close
    FROM public.odg_tms_detail d
    INNER JOIN odg_tms a ON a.doc_no = d.doc_no
    LEFT JOIN ar_customer cust ON cust.code = d.cust_code
    LEFT JOIN public.odg_tms_car carT ON carT.code = a.car
    LEFT JOIN public.odg_tms_driver drvT ON drvT.code = a.driver
    LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
    LEFT JOIN transport_type tt ON tt.code = s.transport_code
    LEFT JOIN LATERAL (
      SELECT array_agg(di.image_data ORDER BY di.created_at ASC, di.roworder ASC) as delivery_images,
             COUNT(*)::int as delivery_image_count
      FROM public.odg_tms_delivery_images di
      WHERE di.bill_no = d.bill_no
    ) img ON true
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
    branch_names: branchNames,
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
    pending_breakdown: pendingBreakdown,
    delivery_kpi: deliveryKpi,
    customer_rating: ratingSummary,
  };
}

module.exports = { getDashboardData };

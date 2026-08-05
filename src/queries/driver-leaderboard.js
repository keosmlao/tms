const { query } = require("../lib/db");
const { getFixedTodayDate, getFixedYearSqlFilter } = require("../lib/fixed-year");
const { addMonths, startOfMonth } = require("../lib/lao-date");
const { getBranchScope } = require("./helpers");

// Driver performance leaderboard for a chosen window (today/month/year).
// Computed on completed bills (status=1, sent_end set). Returns one row per
// driver with totals + averages mirrored from the delivery-KPI definition.
async function getDriverLeaderboard(session, period = "month") {
  // ຄິດເປັນຂໍ້ຄວາມລ້ວນໆ — new Date(`${monthStart}T00:00:00`).toISOString()
  // ຢູ່ເຄື່ອງ +07 ຄືນວັນສຸດທ້າຍຂອງເດືອນກ່ອນ ຈຶ່ງນັບບິນເກີນມາທັງເດືອນ
  const fixedToday = getFixedTodayDate();
  const monthStart = startOfMonth(fixedToday);
  const nextMonthStart = addMonths(monthStart, 1);

  const scope = getBranchScope(session);
  const branchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code IN (${scope.branchListSql}))`
    : "";

  // ສົ່ງສະເພາະ param ທີ່ຊ່ວງນັ້ນໃຊ້ຈິງ. ເມື່ອກ່ອນສົ່ງທັງ 3 ຕົວສະເໝີ ແຕ່ຊ່ວງ
  // "ເດືອນ" (ຄ່າເລີ່ມຕົ້ນ) ແລະ "ປີ" ບໍ່ໄດ້ອ້າງ $1 ເລີຍ Postgres ຈຶ່ງຕອບ
  // "could not determine data type of parameter $1" ແລ້ວໜ້າຄະແນນຄົນຂັບຂຶ້ນ error.
  let dateFilter;
  let params;
  switch (period) {
    case "today":
      dateFilter = `d.sent_end::date = $1::date`;
      params = [fixedToday];
      break;
    case "year":
      dateFilter = "TRUE";
      params = [];
      break;
    case "month":
    default:
      dateFilter = `d.sent_end::date >= $1::date AND d.sent_end::date < $2::date`;
      params = [monthStart, nextMonthStart];
  }

  return query(
    `WITH delivered AS (
       SELECT
         a.driver AS driver_code,
         COALESCE(NULLIF(TRIM(drvT.name_1), ''), a.driver, '-') AS driver_name,
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
       LEFT JOIN public.odg_tms_driver drvT ON drvT.code = a.driver
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN ic_trans t ON t.doc_no = d.bill_no
       WHERE d.status = 1
         AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND ${getFixedYearSqlFilter("d.doc_date")}
         AND ${dateFilter}
         AND a.driver IS NOT NULL
         ${branchClause}
     )
     SELECT
       driver_code,
       driver_name,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE is_on_time = true)::int AS on_time,
       COUNT(*) FILTER (WHERE is_on_time = false)::int AS breach,
       AVG(delivery_seconds) AS avg_delivery_seconds,
       AVG(close_seconds) AS avg_close_seconds
     FROM delivered
     GROUP BY driver_code, driver_name
     HAVING COUNT(*) > 0
     ORDER BY on_time DESC, total DESC`,
    params
  );
}

module.exports = { getDriverLeaderboard };

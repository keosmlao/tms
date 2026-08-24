const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const { addDays } = require("../lib/lao-date");
const {
  customerAreaSql,
  billOpenedAtSql,
  getBranchScope,
  branchFilterJob,
  getNextMonthStart,
  ensureForwardBranchColumn,
  firstPromiseSql,
} = require("./helpers");

// ເວລາເປີດບິນ ສຳລັບ query ທີ່ join ic_trans ເປັນ `t` ແລະ ic_trans_shipment ເປັນ `s`.
// ເບິ່ງ billOpenedAtSql — create_date_time_now ຂອງສອງຕາຕະລາງນີ້ເປັນ UTC ຈຶ່ງໃຊ້
// ບໍ່ໄດ້ (ບິນທີ່ເປີດຫຼັງ 17:00 ຈະຖືກນັບເປັນມື້ຖັດໄປ).
const BILL_OPENED_AT = billOpenedAtSql("t", "s.doc_date::timestamp");

// dateField ເລືອກໄດ້ວ່າຊ່ວງວັນທີກັ່ນຕອງດ້ວຍວັນໃດ:
//   "logistic" (ຄ່າເລີ່ມຕົ້ນ) = ວັນທີຈັດສົ່ງ ຂອງຖ້ຽວ
//   "dispatch"              = ວັນທີ/ເວລາ ທີ່ຜູ້ຈັດຖ້ຽວສ້າງໃບງານ
// ສອງອັນນີ້ບໍ່ຕົງກັນເມື່ອຈັດຖ້ຽວລ່ວງໜ້າ — ວັດແລ້ວ 152/3,759 ຖ້ຽວຂອງປີນີ້.
// ໃຊ້ create_date_time_now ບໍ່ແມ່ນ doc_date ເພາະນັ້ນຄືຄ່າທີ່ຖັນ "ວັນທີຈັດຖ້ຽວ"
// ສະແດງ — ຖ້າກັ່ນຕອງດ້ວຍອີກຄໍລຳ ຜົນຈະບໍ່ຕົງກັບຕາທີ່ເຫັນ.
async function getReportDaily(session, fromDate, toDate, dateField = "logistic") {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  // ຮັບແຕ່ຄ່າທີ່ຮູ້ຈັກ — ຄ່ານີ້ຖືກຕໍ່ໃສ່ SQL ໂດຍກົງ
  const byDispatch = dateField === "dispatch";
  const rangeSql = byDispatch
    ? "a.create_date_time_now::date BETWEEN $1::date AND $2::date"
    : "a.date_logistic BETWEEN $1 AND $2";
  const orderSql = byDispatch
    ? "a.create_date_time_now, a.date_logistic"
    : "a.date_logistic, a.create_date_time_now";
  // ເວລາເລີ່ມຈັດສົ່ງຈິງ = ຕອນຄົນຂັບກົດ "ເລີ່ມສົ່ງ" ບິນທຳອິດຂອງຖ້ຽວ. ຢູ່ລະດັບບິນ
  // (odg_tms_detail.sent_start) ບໍ່ແມ່ນລະດັບຖ້ຽວ ຈຶ່ງຕ້ອງຍຸບເອົາອັນທຳອິດ.
  return query(`WITH trip_start AS (
      SELECT doc_no, MIN(sent_start) AS first_sent_at
      FROM public.odg_tms_detail
      WHERE sent_start IS NOT NULL AND ${getFixedYearSqlFilter("doc_date")}
      GROUP BY doc_no
    ),
    -- ບິນຂອງແຕ່ລະຖ້ຽວ ນັບຈາກແຖວຈິງໃນ odg_tms_detail ບໍ່ແມ່ນ odg_tms.item_bill —
    -- item_bill ຖືກຂຽນຕອນສ້າງໃບງານ ຈຶ່ງບໍ່ຂຶ້ນຕາມການເພີ່ມ/ຖອດບິນພາຍຫຼັງ.
    -- ບໍ່ສຳເລັດ = ທຸກແຖວທີ່ບໍ່ແມ່ນ status=1 (ຍັງບໍ່ໄດ້ສົ່ງ ແລະ ຍົກເລີກ).
    trip_bills AS (
      SELECT doc_no,
             COUNT(DISTINCT bill_no)::int AS bills_total,
             COUNT(DISTINCT bill_no) FILTER (WHERE COALESCE(status,0) = 1)::int AS bills_done
      FROM public.odg_tms_detail
      WHERE ${getFixedYearSqlFilter("doc_date")}
      GROUP BY doc_no
    )
    SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, a.doc_no, to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, to_char(ts.first_sent_at,'DD-MM-YYYY HH24:MI') as sent_start, b.name_1 as car, c.name_1 as driver, a.item_bill, COALESCE(tb.bills_total, 0)::int as bills_total, COALESCE(tb.bills_done, 0)::int as bills_done, GREATEST(COALESCE(tb.bills_total, 0) - COALESCE(tb.bills_done, 0), 0)::int as bills_undone, d.name_1 as user_created, a.approve_status, case when a.approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when a.job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when a.job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when a.job_status=2 then 'ກຳລັງຈັດສົ່ງ' when a.job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, a.job_status, coalesce(b.imei,'') as imei FROM odg_tms a LEFT JOIN trip_start ts ON ts.doc_no=a.doc_no LEFT JOIN trip_bills tb ON tb.doc_no=a.doc_no LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE ${rangeSql} ${branchFilterJob(scope, "a")} ORDER BY ${orderSql}`, [fromDate, toDate]);
}

async function getReportByDriver(session, fromDate, toDate, driverId) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  // ຄືກັບ getReportMonthlyDriver — ຕ້ອງສົ່ງ session + role ບໍ່ດັ່ງນັ້ນ dropdown
  // ຂຶ້ນພະນັກງານຂົນສົ່ງທຸກຄົນທຸກສາຂາ ບໍ່ຕົງກັບລາຍຊື່ຢູ່ໜ້າຈັດຖ້ຽວ.
  const drivers = await getTransportDepartmentEmployees(session, "driver");
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

// ໜຶ່ງແຖວຕໍ່ໜຶ່ງບິນຂອງຖ້ຽວໃນຊ່ວງວັນທີ.
//
// ⚠️ ຢ່າດຶງຮູບ (url_img / sight_img / odg_tms_delivery_images) ມາໃນລາຍການນີ້:
// ຮູບເກັບເປັນ base64 ໃນຖານຂໍ້ມູນ ຈຶ່ງໜັກ ~27 MB ຕໍ່ 1 ວັນ (68 ແຖວ) ແລະ ພໍເລືອກ
// ເປັນເດືອນ JSON.stringify ຈະລົ້ມດ້ວຍ "Invalid string length" ແລ້ວໜ້າຈໍຂຶ້ນ
// error ລ້າໆ. ໜ້າຈໍນີ້ບໍ່ໄດ້ໃຊ້ຮູບຢູ່ແລ້ວ — ຢາກເບິ່ງຮູບໃຫ້ໄປໜ້າ ຫຼັກຖານການສົ່ງ.
async function getReportByBill(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(
    `SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date,
            a.doc_no, a.bill_no,
            to_char(a.bill_date,'DD-MM-YYYY') as bill_date,
            b.name_1 as cust_code,
            to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
            a.status,
            case when a.sent_start IS NULL then 'ລໍຖ້າຈັດສົ່ງ / ເບີກເຄື່ອງ'
                 when a.sent_start IS NOT NULL AND a.sent_end IS NULL then 'ກຳລັງຈັດສົ່ງ'
                 else case when a.status=1 then 'ຈັດສົ່ງສຳເລັດ' else 'ຍົກເລີກຈັດສົ່ງ' end
            end as status_trans,
            d.name_1 as car, e.name_1 as driver, a.count_item, a.remark,
            to_char(a.recipt_job,'DD-MM-YYYY HH24:MI') as recipt_job,
            to_char(a.sent_start,'DD-MM-YYYY HH24:MI') as sent_start,
            to_char(a.sent_end,'DD-MM-YYYY HH24:MI') as sent_end
     FROM public.odg_tms_detail a
     JOIN odg_tms c ON c.doc_no = a.doc_no
     LEFT JOIN ar_customer b ON b.code = a.cust_code
     LEFT JOIN public.odg_tms_car d ON d.code = a.car
     LEFT JOIN public.odg_tms_driver e ON e.code = c.driver
     WHERE a.doc_date BETWEEN $1 AND $2
       ${branchFilterJob(scope, "c")}
     ORDER BY a.roworder`,
    [fromDate, toDate]
  );
}

// ==================== ລາຍງານຕາມຖ້ຽວ ====================

// ໜຶ່ງແຖວຕໍ່ໜຶ່ງຖ້ຽວ (odg_tms) ພ້ອມສະຫຼຸບບິນ, ເວລາ ແລະ ໄລຍະທາງ.
// ກັ່ນຕອງດ້ວຍ date_logistic (ວັນທີຈັດສົ່ງຂອງຖ້ຽວ) ຄືກັບລາຍງານປະຈຳວັນ —
// doc_date ເປັນວັນທີສ້າງໃບງານ ຈຶ່ງບໍ່ຕົງກັບວັນທີລົດອອກແລ່ນ.
async function getReportByTrip(session, fromDate, toDate, filters = {}) {
  const { getDistanceMap } = require("./trip-distance");
  const { ensureDeliveryRoundSchema, listDeliveryRounds } = require("./delivery-round");
  const { ensureDeliveryRouteSchema } = require("./delivery-route");

  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  await ensureDeliveryRoundSchema();
  await ensureDeliveryRouteSchema();

  const carCode = String(filters.carId ?? "").trim();
  const driverCode = String(filters.driverId ?? "").trim();
  const roundCode = String(filters.roundCode ?? "").trim();

  const params = [fromDate, toDate];
  const tripFilters = [];
  if (carCode) {
    params.push(carCode);
    tripFilters.push(`AND a.car = $${params.length}`);
  }
  if (driverCode) {
    params.push(driverCode);
    tripFilters.push(`AND a.driver = $${params.length}`);
  }
  if (roundCode) {
    params.push(roundCode);
    tripFilters.push(`AND a.delivery_round_code = $${params.length}`);
  }

  const rows = await query(
    `WITH trips AS (
       SELECT a.*
       FROM odg_tms a
       WHERE a.date_logistic BETWEEN $1 AND $2
         AND ${getFixedYearSqlFilter("a.doc_date")}
         ${tripFilters.join("\n         ")}
         ${branchFilterJob(scope, "a")}
     ),
     bill_summary AS (
       SELECT d.doc_no,
         COUNT(*)::int AS bills_total,
         COUNT(*) FILTER (WHERE d.sent_end IS NOT NULL AND COALESCE(d.status, 0) = 1)::int AS bills_delivered,
         COUNT(*) FILTER (WHERE d.sent_end IS NOT NULL AND COALESCE(d.status, 0) = 2)::int AS bills_cancelled,
         COUNT(*) FILTER (WHERE d.sent_start IS NOT NULL AND d.sent_end IS NULL)::int AS bills_sending,
         COUNT(*) FILTER (WHERE d.sent_start IS NULL)::int AS bills_waiting,
         COALESCE(SUM(COALESCE(NULLIF(TRIM(d.count_item::text), ''), '0')::numeric), 0)::int AS item_count,
         MIN(d.recipt_job) AS recipt_at,
         MIN(d.sent_start) AS first_sent_at,
         MAX(d.sent_end) AS last_sent_at
       FROM public.odg_tms_detail d
       JOIN trips t ON t.doc_no = d.doc_no
       GROUP BY d.doc_no
     )
     SELECT
       a.doc_no,
       to_char(a.doc_date, 'DD-MM-YYYY') AS doc_date,
       to_char(a.date_logistic, 'DD-MM-YYYY') AS date_logistic,
       to_char(a.date_logistic, 'YYYY-MM-DD') AS date_logistic_iso,
       to_char(a.create_date_time_now, 'DD-MM-YYYY HH24:MI') AS created_at,
       COALESCE(a.car, '') AS car_code,
       COALESCE(b.name_1, a.car, '-') AS car,
       COALESCE(a.driver, '') AS driver_code,
       COALESCE(c.name_1, a.driver, '-') AS driver,
       COALESCE(u.name_1, '') AS user_created,
       COALESCE(a.delivery_round_code, '') AS round_code,
       COALESCE(dr.name, '') AS round_name,
       COALESCE(dr.time_label, '') AS round_time_label,
       COALESCE(rt.name, '') AS route_name,
       COALESCE(NULLIF(TRIM(a.item_bill::text), ''), '0')::numeric::int AS item_bill,
       a.approve_status,
       a.job_status,
       CASE WHEN a.approve_status = 0 THEN 'ລໍຖ້າອະນຸມັດ'
         ELSE CASE
           WHEN a.job_status = 0 THEN 'ລໍຖ້າຈັດສົ່ງ'
           WHEN a.job_status = 1 THEN 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ'
           WHEN a.job_status = 2 THEN 'ກຳລັງຈັດສົ່ງ'
           WHEN a.job_status = 3 THEN 'ຄົນຂັບປິດງານ'
           ELSE 'admin ປິດຖ້ຽວ' END
       END AS status,
       COALESCE(bs.bills_total, 0) AS bills_total,
       COALESCE(bs.bills_delivered, 0) AS bills_delivered,
       COALESCE(bs.bills_cancelled, 0) AS bills_cancelled,
       COALESCE(bs.bills_sending, 0) AS bills_sending,
       COALESCE(bs.bills_waiting, 0) AS bills_waiting,
       COALESCE(bs.item_count, 0) AS item_count,
       to_char(bs.recipt_at, 'DD-MM-YYYY HH24:MI') AS recipt_at,
       to_char(bs.first_sent_at, 'HH24:MI') AS first_sent_at,
       to_char(bs.last_sent_at, 'HH24:MI') AS last_sent_at,
       to_char(a.job_close, 'DD-MM-YYYY HH24:MI') AS job_close,
       CASE
         WHEN bs.first_sent_at IS NOT NULL AND COALESCE(a.job_close, bs.last_sent_at) IS NOT NULL
           AND COALESCE(a.job_close, bs.last_sent_at) >= bs.first_sent_at
         THEN ROUND(EXTRACT(EPOCH FROM (COALESCE(a.job_close, bs.last_sent_at) - bs.first_sent_at)) / 60.0)::int
       END AS duration_min,
       COALESCE(a.miles_start, '') AS miles_start,
       COALESCE(a.miles_end, '') AS miles_end,
       CASE
         WHEN regexp_replace(COALESCE(a.miles_start, ''), '[^0-9.]', '', 'g') ~ E'^\\\\d+(\\\\.\\\\d+)?$'
          AND regexp_replace(COALESCE(a.miles_end, ''), '[^0-9.]', '', 'g') ~ E'^\\\\d+(\\\\.\\\\d+)?$'
          AND regexp_replace(a.miles_end, '[^0-9.]', '', 'g')::numeric >= regexp_replace(a.miles_start, '[^0-9.]', '', 'g')::numeric
         THEN ROUND(regexp_replace(a.miles_end, '[^0-9.]', '', 'g')::numeric - regexp_replace(a.miles_start, '[^0-9.]', '', 'g')::numeric, 1)
       END AS miles_km
     FROM trips a
     LEFT JOIN bill_summary bs ON bs.doc_no = a.doc_no
     LEFT JOIN public.odg_tms_car b ON b.code = a.car
     LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
     LEFT JOIN erp_user u ON u.code = a.user_created
     LEFT JOIN public.odg_tms_delivery_round dr ON dr.code = a.delivery_round_code
     LEFT JOIN public.odg_tms_delivery_route rt ON rt.code = a.delivery_route_code
     ORDER BY a.date_logistic DESC, a.doc_no DESC`,
    params
  );

  // ໄລຍະທາງຈາກເລກໄມລ໌ tracker ແມ່ນແມ່ນຢຳກວ່າເລກທີ່ຄົນຂັບພິມເອງ ຈຶ່ງເອົາກ່ອນ.
  const distances = await getDistanceMap(rows.map((r) => r.doc_no));
  for (const row of rows) {
    const tracked = distances.get(row.doc_no);
    const manual = row.miles_km === null || row.miles_km === undefined ? null : Number(row.miles_km);
    row.distance_km = tracked ?? manual ?? null;
    row.distance_source = tracked != null ? "tracker" : manual != null ? "miles" : "";
  }

  const [cars, drivers, rounds] = await Promise.all([
    query("SELECT code, name_1 FROM public.odg_tms_car ORDER BY name_1"),
    query("SELECT code, name_1 FROM public.odg_tms_driver ORDER BY name_1"),
    listDeliveryRounds({ activeOnly: true }),
  ]);

  // ລາຍງານນີ້ສະແດງໃບທີ່ຍັງລໍອະນຸມັດນຳ (ຜູ້ຈັດຖ້ຽວຕ້ອງເຫັນ) ແຕ່ນິຍາມ "ຖ້ຽວ"
  // ຢູ່ໜ້າ BI/ໜ້າຫຼັກ ນັບສະເພາະທີ່ອະນຸມັດແລ້ວ — ຈຶ່ງແຍກ trips_approved ອອກມາ
  // ໃຫ້ໜ້າຈໍບອກໄດ້ວ່າສ່ວນຕ່າງມາຈາກໃສ.
  const totals = rows.reduce(
    (acc, r) => {
      acc.trips += 1;
      if (Number(r.approve_status ?? 0) === 1) acc.trips_approved += 1;
      else acc.trips_pending_approval += 1;
      acc.bills += Number(r.bills_total) || 0;
      acc.delivered += Number(r.bills_delivered) || 0;
      acc.cancelled += Number(r.bills_cancelled) || 0;
      acc.pending += (Number(r.bills_sending) || 0) + (Number(r.bills_waiting) || 0);
      acc.items += Number(r.item_count) || 0;
      acc.km += Number(r.distance_km) || 0;
      return acc;
    },
    { trips: 0, trips_approved: 0, trips_pending_approval: 0, bills: 0, delivered: 0, cancelled: 0, pending: 0, items: 0, km: 0 }
  );
  totals.km = Math.round(totals.km * 10) / 10;

  return { rows, cars, drivers, rounds, totals };
}

// ບິນທັງໝົດຂອງໜຶ່ງຖ້ຽວ — ໃຊ້ຕອນກາງແຖວລາຍງານຕາມຖ້ຽວ.
async function getReportTripBills(docNo) {
  return query(
    `SELECT
       d.bill_no,
       to_char(d.bill_date, 'DD-MM-YYYY') AS bill_date,
       COALESCE(NULLIF(TRIM(cust.name_1), ''), NULLIF(TRIM(d.cust_code), ''), '-') AS customer,
       COALESCE(NULLIF(TRIM(d.count_item::text), ''), '0')::int AS item_count,
       COALESCE(d.remark, '') AS remark,
       COALESCE(d.status, 0) AS status,
       CASE
         WHEN d.sent_start IS NULL THEN 'ລໍຖ້າຈັດສົ່ງ / ເບີກເຄື່ອງ'
         WHEN d.sent_end IS NULL THEN 'ກຳລັງຈັດສົ່ງ'
         WHEN COALESCE(d.status, 0) = 1 THEN 'ຈັດສົ່ງສຳເລັດ'
         ELSE 'ຍົກເລີກຈັດສົ່ງ'
       END AS status_trans,
       to_char(d.recipt_job, 'DD-MM-YYYY HH24:MI') AS recipt_job,
       to_char(d.sent_start, 'HH24:MI') AS sent_start,
       to_char(d.sent_end, 'HH24:MI') AS sent_end
     FROM public.odg_tms_detail d
     LEFT JOIN ar_customer cust ON cust.code = d.cust_code
     WHERE d.doc_no = $1
     ORDER BY d.roworder`,
    [docNo]
  );
}

// ລົດ + ຈຳນວນຖ້ຽວ ແລະ ກມ ຂອງເດືອນ.
//
// ແຖວ = ລົດຂອງສາຂາທີ່ລັອກອິນ (ຕາມທະບຽນລົດ) ∪ ລົດທີ່ມີຖ້ຽວໃນຂອບເຂດນັ້ນ.
// ຕ້ອງລວມລົດທີ່ບໍ່ມີຖ້ຽວນຳ ບໍ່ດັ່ງນັ້ນ "ກມ. ລວມ" ຂອງໜ້ານີ້ຈະໜ້ອຍກວ່າໜ້າ BI
// ທີ່ນັບທັງກອງລົດ (ວັດ 2026-08 ສາຂາ 02-0002: 15,244 ທຽບ 15,998 ກມ).
async function getReportMonthlyCar(session, monthly) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  const [year, month] = monthly.split("-");
  // ລົດທີ່ຍັງບໍ່ໄດ້ຜູກສາຂາ ບໍ່ນັບເປັນລົດຂົນສົ່ງ — ກົດດຽວກັບ IS_TRANSPORT_CAR
  // ຢູ່ໜ້າ BI ບໍ່ດັ່ງນັ້ນຜູ້ໃຊ້ລະດັບບໍລິສັດຈະເຫັນ ກມ. ລວມ ຂອງ 2 ໜ້າຕ່າງກັນ
  // (ວັດ 2026-08: 6 ຄັນ 4,375 ກມ ທີ່ບໍ່ມີ transport_code).
  const carBranchSql = scope.scoped
    ? `b.transport_code IN (${scope.branchListSql})`
    : "NULLIF(BTRIM(b.transport_code), '') IS NOT NULL";
  return query(
    `WITH trip_counts AS (
       SELECT a.car, COUNT(a.doc_no)::int AS qty
       FROM odg_tms a
       WHERE to_char(a.doc_date,'yyyy-MM') = $1
         -- "ຖ້ຽວ" = ໃບງານທີ່ອະນຸມັດແລ້ວ ຄືກັບ BI/ໜ້າຫຼັກ (getTripCore).
         AND COALESCE(a.approve_status, 0) = 1
         ${branchFilterJob(scope, "a")}
       GROUP BY a.car
     ),
     gps AS (
       SELECT imei, SUM(COALESCE(distance_km, 0))::numeric AS total_km
       FROM public.odg_tms_gps_daily
       WHERE to_char(usage_date, 'yyyy-MM') = $1
       GROUP BY imei
     )
     SELECT
       b.code AS car_code,
       COALESCE(NULLIF(TRIM(b.name_1), ''), b.code) AS car,
       COALESCE(b.imei, '') AS imei,
       COALESCE(tc.qty, 0)::int AS qty,
       COALESCE(g.total_km, 0)::numeric AS total_km,
       $2::text AS month,
       $3::text AS year
     FROM public.odg_tms_car b
     LEFT JOIN trip_counts tc ON tc.car = b.code
     LEFT JOIN gps g ON g.imei = NULLIF(TRIM(b.imei), '')
     WHERE ${carBranchSql} OR tc.car IS NOT NULL
     ORDER BY COALESCE(tc.qty, 0) DESC, car ASC`,
    [monthly, month, year]
  );
}

// ລາຍຊື່ຄົນຂັບ + ຈຳນວນຖ້ຽວຂອງເດືອນ. ໜ້ານີ້ຄິດ "ວ່າງ" ຈາກ qty = 0 ຈຶ່ງລາຍຊື່
// ຕ້ອງເປັນ *ຄົນຂັບຂອງສາຂາທີ່ລັອກອິນ* ຄືກັບໜ້າຈັດຖ້ຽວ (getDispatchDrivers):
// ຖ້າສົ່ງ session/role ບໍ່ຄົບ ຈະໄດ້ພະນັກງານຂົນສົ່ງທັງໝົດທຸກສາຂາ (ກຳມະກອນ,
// ຫົວໜ້າທີມ, admin ນຳ) ແລ້ວ "ວ່າງ" ບວມຂຶ້ນຫຼາຍສິບຄົນ ບໍ່ຕົງກັບໜ້າອື່ນ.
async function getReportMonthlyDriver(session, monthly) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  const employees = await getTransportDepartmentEmployees(session, "driver");
  // ນັບຖ້ຽວດ້ວຍກົດດຽວກັບ BI/ໜ້າຫຼັກ: ອະນຸມັດແລ້ວ + branchFilterJob (ຖື
  // origin_transport_code ເປັນຫຼັກ). ກົດເກົ່າເບິ່ງແຕ່ສາຂາຂອງບິນ ຈຶ່ງໃຫ້ຄ່າ
  // ຄົນລະຢ່າງກັບລາຍງານປະຈຳວັນ (ວັດແລ້ວ 140 ຖ້ຽວ/ປີ ທີ່ສອງກົດບໍ່ຕົງກັນ).
  const counts = await query(
    `SELECT a.driver, COUNT(a.doc_no)::int AS qty
     FROM public.odg_tms a
     WHERE to_char(a.doc_date, 'yyyy-MM') = $1
       AND COALESCE(a.approve_status, 0) = 1
       ${branchFilterJob(scope, "a")}
     GROUP BY a.driver`,
    [monthly]
  );
  const countMap = new Map();
  for (const row of counts) countMap.set(row.driver, Number(row.qty) || 0);

  // ຄົນຂັບທີ່ມີຖ້ຽວໃນຂອບເຂດ ແຕ່ບໍ່ຢູ່ໃນລາຍຊື່ (ຍ້າຍສາຂາ, ລາອອກ, ຫຼື ຍັງບໍ່ໄດ້
  // ກຳນົດຕຳແໜ່ງ) ຕ້ອງຍັງຂຶ້ນ ບໍ່ດັ່ງນັ້ນຍອດຖ້ຽວລວມຂອງໜ້ານີ້ຈະໜ້ອຍກວ່າຄວາມຈິງ.
  const listed = new Set(employees.map((e) => e.code));
  const extraCodes = [...countMap.keys()].filter(
    (code) => String(code ?? "").trim() && !listed.has(code)
  );
  const extras = [];
  if (extraCodes.length > 0) {
    const known = await query(
      `SELECT d.code, COALESCE(NULLIF(TRIM(d.name_1), ''), d.code) AS name_1
       FROM public.odg_tms_driver d
       WHERE d.code = ANY($1::varchar[])`,
      [extraCodes]
    );
    const nameMap = new Map(known.map((r) => [r.code, r.name_1]));
    for (const code of extraCodes) extras.push({ code, name_1: nameMap.get(code) ?? code });
  }

  const [year, month] = monthly.split("-");
  const result = [...employees, ...extras].map((e) => ({
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
  // ຍິງບັນຊີກາງໄປພ້ອມກັນຕັ້ງແຕ່ຕົ້ນ ແລ້ວຄ່ອຍ await ຢູ່ທ້າຍ — ຖ້າລໍຢູ່ທ້າຍຢ່າງດຽວ
  // ໜ້ານີ້ຈະຊ້າຂຶ້ນອີກ ~2 ວິນາທີ ໂດຍບໍ່ຈຳເປັນ (server action ແລ່ນເທື່ອລະອັນ).
  const perfPromise = getDeliveryPerformance(session, monthly);
  const openedBranchClause = scope.scoped ? `AND s.transport_code IN (${scope.branchListSql})` : "";
  const deliveredBranchClause = scope.scoped
    ? `AND COALESCE(NULLIF(TRIM(s.transport_code), ''),
                    NULLIF(TRIM(a.origin_transport_code), ''), '') IN (${scope.branchListSql})`
    : "";
  const rows = await query(
    `WITH params AS (
       SELECT $1::timestamp AS start_at, $2::timestamp AS end_at
     ),
     opened_source AS (
       SELECT
         s.doc_no AS bill_no,
         COALESCE(NULLIF(TRIM(s.transport_code), ''), 'unknown') AS branch_code,
         COALESCE(NULLIF(TRIM(sale_u.department_code::text), ''), 'unknown') AS department_code,
         COALESCE(
           NULLIF(TRIM(dep.department_name_lo::text), ''),
           NULLIF(TRIM(sale_u.department_code::text), ''),
           'ບໍ່ລະບຸພະແນກ'
         ) AS department_name,
         ${BILL_OPENED_AT} AS opened_at,
         completed.sent_end AS completed_at,
         p.end_at AS month_end_at
       FROM public.ic_trans_shipment s
       LEFT JOIN public.ic_trans t ON t.doc_no = s.doc_no
       -- ພະແນກເອົາຈາກທະບຽນ TMS (odg_employee → odg_department) ບ່ອນດຽວກັບ
       -- getDeliveryPerformance ແລະ ລາຍງານ ປະຈຳວັນ/ພະແນກ ຈຶ່ງໄດ້ຊື່ພະແນກ
       -- ຊຸດດຽວກັນ. ຝ່າຍ ERP ໃຫ້ພະແນກທີ່ບໍ່ແມ່ນຝ່າຍຂາຍນຳ (ບັນຊີ, HR).
       LEFT JOIN public.odg_employee sale_u ON sale_u.employee_code = t.sale_code
       LEFT JOIN public.odg_department dep ON dep.department_code = sale_u.department_code
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
       WHERE ${BILL_OPENED_AT} >= p.start_at
         AND ${BILL_OPENED_AT} < p.end_at
         AND s.transport_code IS NOT NULL
         AND s.transport_code IN (${branchCodeSql})
         ${openedBranchClause}
       UNION ALL
       -- ບິນທີ່ບໍ່ມີແຖວ shipment ເລີຍ (ໃບໂອນສາຂາ FT, ໃບເບີກ WFOH, ບິນມືຂອງ TMS)
       -- ແຕ່ຖືກຂົນດ້ວຍຖ້ຽວຂອງສາຂາເຫຼົ່ານີ້ — ນັບເປັນບິນຂອງສາຂາທີ່ຂົນ ຄືກັບ
       -- getDeliveryPerformance. ບໍ່ມີແຂນນີ້ ຍອດເປີດບິນຈະໜ້ອຍກວ່າໜ້ານັ້ນ
       -- (ວັດ 08/2026: 1,604 ທຽບ 1,882).
       SELECT
         x.bill_no,
         x.branch_code,
         COALESCE(NULLIF(TRIM(sale_x.department_code::text), ''), 'unknown') AS department_code,
         COALESCE(
           NULLIF(TRIM(dep_x.department_name_lo::text), ''),
           NULLIF(TRIM(sale_x.department_code::text), ''),
           'ບໍ່ລະບຸພະແນກ'
         ) AS department_name,
         x.opened_at,
         x.completed_at,
         p.end_at AS month_end_at
       FROM (
         SELECT d.bill_no,
                (ARRAY_AGG(a.origin_transport_code
                           ORDER BY (COALESCE(d.status, 0) = 1) DESC,
                                    d.sent_end DESC NULLS LAST))[1] AS branch_code,
                COALESCE(MIN(ic_x.doc_date)::timestamp,
                         MIN(cb_x.created_at),
                         MIN(d.bill_date)::timestamp) AS opened_at,
                MIN(d.sent_end) FILTER (WHERE d.status = 1) AS completed_at,
                MIN(ic_x.sale_code) AS sale_code
         FROM public.odg_tms_detail d
         JOIN public.odg_tms a ON a.doc_no = d.doc_no
         LEFT JOIN LATERAL (
           SELECT y.doc_date, y.sale_code FROM ic_trans y
           WHERE y.doc_no = d.bill_no ORDER BY y.doc_date LIMIT 1
         ) ic_x ON true
         LEFT JOIN public.odg_tms_custom_bill cb_x ON cb_x.bill_no = d.bill_no
         WHERE COALESCE(a.approve_status, 0) = 1
           AND a.origin_transport_code IN (${branchCodeSql})
           AND ${getFixedYearSqlFilter("d.doc_date")}
           AND NOT EXISTS (
             SELECT 1 FROM public.ic_trans_shipment s_x WHERE s_x.doc_no = d.bill_no
           )
         GROUP BY d.bill_no
       ) x
       -- ພະແນກເອົາຈາກທະບຽນ TMS (odg_employee → odg_department) ບ່ອນດຽວກັບ
       -- getDeliveryPerformance ແລະ ລາຍງານ ປະຈຳວັນ/ພະແນກ ຈຶ່ງໄດ້ຊື່ພະແນກ
       -- ຊຸດດຽວກັນ. ຝ່າຍ ERP ໃຫ້ພະແນກທີ່ບໍ່ແມ່ນຝ່າຍຂາຍນຳ (ບັນຊີ, HR).
       LEFT JOIN public.odg_employee sale_x ON sale_x.employee_code = x.sale_code
       LEFT JOIN public.odg_department dep_x ON dep_x.department_code = sale_x.department_code
       CROSS JOIN params p
       WHERE x.opened_at >= p.start_at
         AND x.opened_at < p.end_at
         ${scope.scoped ? `AND x.branch_code IN (${scope.branchListSql})` : ""}
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
         -- ບິນທີ່ບໍ່ມີແຖວ shipment (ໃບໂອນສາຂາ FT, ໃບເບີກ WFOH, ບິນມືຂອງ TMS)
         -- ຖອຍໄປໃຊ້ສາຂາຕົ້ນທາງຂອງຖ້ຽວ — ນິຍາມດຽວກັບ branchFilterJob ແລະ
         -- getDeliveryPerformance. ບໍ່ດັ່ງນັ້ນປີນີ້ຫຼຸດໄປ 1,065 ບິນ.
         COALESCE(
           NULLIF(TRIM(s.transport_code), ''),
           NULLIF(TRIM(a.origin_transport_code), ''),
           'unknown'
         ) AS branch_code,
         COALESCE(NULLIF(TRIM(sale_u.department_code::text), ''), 'unknown') AS department_code,
         COALESCE(
           NULLIF(TRIM(dep.department_name_lo::text), ''),
           NULLIF(TRIM(sale_u.department_code::text), ''),
           'ບໍ່ລະບຸພະແນກ'
         ) AS department_name,
         d.status,
         d.sent_start,
         COALESCE(d.date_logistic::timestamp, a.date_logistic::timestamp, d.sent_start, a.dispatch_started_at) AS delivery_date_at,
         d.sent_end,
         ${BILL_OPENED_AT} AS bill_opened_at,
         COALESCE(history.delivery_rounds, 0) AS delivery_rounds,
         p.start_at AS month_start_at,
         p.end_at AS month_end_at
       FROM public.odg_tms_detail d
       LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       -- ພະແນກເອົາຈາກທະບຽນ TMS (odg_employee → odg_department) ບ່ອນດຽວກັບ
       -- getDeliveryPerformance ແລະ ລາຍງານ ປະຈຳວັນ/ພະແນກ ຈຶ່ງໄດ້ຊື່ພະແນກ
       -- ຊຸດດຽວກັນ. ຝ່າຍ ERP ໃຫ້ພະແນກທີ່ບໍ່ແມ່ນຝ່າຍຂາຍນຳ (ບັນຊີ, HR).
       LEFT JOIN public.odg_employee sale_u ON sale_u.employee_code = t.sale_code
       LEFT JOIN public.odg_department dep ON dep.department_code = sale_u.department_code
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
         AND COALESCE(NULLIF(TRIM(s.transport_code), ''),
                      NULLIF(TRIM(a.origin_transport_code), ''), '') IN (${branchCodeSql})
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
  // ບິນຄ້າງສົ່ງແຕ່ລະມື້ — ດຶງຈາກບັນຊີກາງ (getDeliveryPerformance) ບ່ອນດຽວກັບ
  // ບັດເທິງສຸດ ຈຶ່ງບວກໄດ້ເທົ່າ "ເປີດບິນ" ສະເໝີ. ກ່ອນນີ້ຄິດເອງດ້ວຍ query ຕ່າງຫາກ
  // ແລ້ວກຣາຟກັບບັດຢູ່ໜ້າດຽວກັນບໍ່ຕົງກັນ (ວັດ 08/2026: 1,609 ທຽບ 1,887).
  const daily = (await perfPromise).daily ?? [];

  // ສະຫຼຸບຕາມເຂດ (ນະຄອນຫຼວງ vs ຕ່າງແຂວງ) — ສະເລ່ຍ "ມື້ທີ່ຈັດສົ່ງສຳເລັດ"
  // ນັບຈາກ ວັນນັດຈັດສົ່ງ (date_logistic) ຫາ ວັນສຳເລັດ (sent_end). province '01' = ນະຄອນຫຼວງ.
  const zoneRows = await query(
    `WITH params AS (SELECT $1::timestamp AS start_at, $2::timestamp AS end_at),
     zone_source AS (
       SELECT d.bill_no,
         CASE WHEN TRIM(COALESCE(cust.province,'')) = '01' THEN 'ນະຄອນຫຼວງ' ELSE 'ຕ່າງແຂວງ' END AS zone,
         d.status,
         COALESCE(d.date_logistic::timestamp, a.date_logistic::timestamp, d.sent_start, a.dispatch_started_at) AS appt_at,
         ${BILL_OPENED_AT} AS bill_opened_at,
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
         AND COALESCE(NULLIF(TRIM(s.transport_code), ''),
                      NULLIF(TRIM(a.origin_transport_code), ''), '') IN (${branchCodeSql})
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
  // ຂອບເຂດສາຂາ: branchCodeSql ເປັນ 3 ສາຂາ KPI ສະເໝີ ຈຶ່ງຕ້ອງແຄບລົງຕາມ login
  // ເອງ — ບໍ່ດັ່ງນັ້ນຜູ້ໃຊ້ສາຂາດຽວຈະເຫັນຕົວເລກກອງລົດຂອງທັງບໍລິສັດ.
  const fleetBranchList = scope.scoped ? scope.branchListSql : branchCodeSql;
  const fleetRow = await queryOne(
    `WITH j AS (
       -- ນິຍາມ "ຖ້ຽວ" ອັນດຽວກັບໜ້າອື່ນ: ນັບດ້ວຍ doc_date (ບໍ່ແມ່ນເວລາສ້າງໃບງານ)
       -- ແລະ ຂອບເຂດສາຂາຖື origin_transport_code ເປັນຫຼັກ. ກົດເກົ່າ (ເວລາສ້າງ +
       -- ສາຂາຂອງບິນ) ໃຫ້ 355 ຖ້ຽວ ໃນຂະນະທີ່ໜ້າອື່ນນັບໄດ້ 375 ໃນເດືອນດຽວກັນ.
       SELECT DISTINCT a.doc_no, a.car, a.doc_date::date AS d
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date
         AND a.doc_date < $2::date
         AND COALESCE(a.approve_status,0) = 1
         AND COALESCE(NULLIF(TRIM(a.car), ''), '') <> ''
         AND (
           NULLIF(TRIM(a.origin_transport_code), '') IN (${fleetBranchList})
           OR (
             NULLIF(TRIM(a.origin_transport_code), '') IS NULL
             AND EXISTS (
               SELECT 1 FROM public.odg_tms_detail dd
               JOIN public.ic_trans_shipment ss ON ss.doc_no = dd.bill_no
               WHERE dd.doc_no = a.doc_no
                 AND NULLIF(TRIM(ss.transport_code), '') IN (${fleetBranchList})
             )
           )
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

  // ສັດສ່ວນການລັດຄິວ — ບິນທີ່ສົ່ງສຳເລັດ ໃນຂະນະທີ່ມີບິນ (ສາຂາດຽວກັນ) ທີ່ນັດໃຫ້
  // ສົ່ງກ່ອນ (appointment ກ່ອນ) ແຕ່ຍັງບໍ່ສຳເລັດ → ໄດ້ສົ່ງຂ້າມຄິວຄົນທີ່ຄວນໄດ້ກ່ອນ.
  const queueRow = await queryOne(
    `WITH bills AS (
       SELECT s.doc_no AS bill_no,
         COALESCE(NULLIF(TRIM(s.transport_code), ''), '') AS branch,
         (SELECT MIN(COALESCE(dd.date_logistic::timestamp, dd.sent_start))
            FROM public.odg_tms_detail dd
            LEFT JOIN public.odg_tms aa ON aa.doc_no = dd.doc_no
            WHERE dd.bill_no = s.doc_no AND COALESCE(aa.approve_status,0) = 1) AS appt_at,
         (SELECT MIN(dn.sent_end)
            FROM public.odg_tms_detail dn
            LEFT JOIN public.odg_tms dj ON dj.doc_no = dn.doc_no
            WHERE dn.bill_no = s.doc_no AND dn.status = 1 AND dn.sent_end IS NOT NULL
              AND COALESCE(dj.approve_status,0) = 1) AS completed_at
       FROM public.ic_trans_shipment s
       LEFT JOIN public.ic_trans t ON t.doc_no = s.doc_no
       WHERE ${BILL_OPENED_AT} >= $1::timestamp
         AND ${BILL_OPENED_AT} < $2::timestamp
         AND s.transport_code IS NOT NULL
         AND s.transport_code IN (${branchCodeSql})
         ${openedBranchClause}
     )
     SELECT
       COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS delivered,
       COUNT(*) FILTER (
         WHERE completed_at IS NOT NULL AND EXISTS (
           SELECT 1 FROM bills a
           WHERE a.branch = b.branch AND a.appt_at IS NOT NULL AND a.appt_at < b.appt_at
             AND (a.completed_at IS NULL OR a.completed_at > b.completed_at)
         )
       )::int AS jumped
     FROM bills b`,
    [monthStart, nextMonthStart]
  );
  const qDelivered = Number(queueRow?.delivered) || 0;
  const qJumped = Number(queueRow?.jumped) || 0;
  const queue = {
    delivered: qDelivered,
    jumped: qJumped,
    rate: qDelivered > 0 ? (qJumped / qDelivered) * 100 : 0,
  };

  // ── ຊ່ອງບັນຊີ (ຍົກມາ / ເປີດບິນ / ຈັດສົ່ງ / ຍົກໄປ) ເອົາຈາກແຫຼ່ງດຽວ ──
  //
  // getDeliveryPerformance() ເປັນບັນຊີລະດັບບິນທີ່ກົງກັບໜ້າ /bills-pending ສະເໝີ
  // ແລະ ໜ້າ /reports/bi ກໍ່ດຶງຈາກມັນຢູ່ແລ້ວ. ກ່ອນນີ້ໜ້ານີ້ຄິດເອງ ຈຶ່ງໃຫ້ຄ່າ
  // ຄົນລະຢ່າງກັບໜ້າ ປະສິດທິພາບການຈັດສົ່ງ ໃນເດືອນດຽວກັນ (ວັດ 08/2026 ກ່ອນແກ້:
  // ເປີດບິນ 1,604 ທຽບ 1,882 · ຈັດສົ່ງ 1,598 ທຽບ 1,896).
  //
  // ຄ່າສະເພາະຂອງໜ້ານີ້ (ຍອດຈັດຖ້ຽວ, ບິນຫຼາຍຮອບ, ທັນ 24 ຊມ ຈາກເປີດບິນ/ວັນນັດ,
  // ພະແນກ, ໂຊນ, ກອງລົດ, ຄິວ) ຍັງຄິດຢູ່ບ່ອນນີ້ຄືເກົ່າ.
  const LEDGER_KEYS = ["carry_in", "opened", "delivered", "carry_out", "closed_other"];
  // ອັດຕາ "ທັນ 24 ຊມ ນັບແຕ່ເປີດບິນ" ມີ opened ເປັນຕົວຫານ ຈຶ່ງຕົວເສດຕ້ອງມາຈາກ
  // ຊຸດຂໍ້ມູນດຽວກັນ. ຖ້າປະໄວ້ຄ່າເກົ່າ ຕົວເສດຈະນັບຈາກຊຸດແຄບກວ່າ ແລ້ວອັດຕາຕໍ່າ
  // ກວ່າຄວາມຈິງ (ວັດ 08/2026: ທັນ+ຊ້າ ໄດ້ 1,807 ແຕ່ ເປີດບິນ 1,888).
  const applyOnTime = (target, src) => {
    const opened = Number(src?.opened) || 0;
    const onTime = Number(src?.opened_on_time_24h) || 0;
    target.on_time_from_open = onTime;
    target.breach_from_open = Math.max(opened - onTime, 0);
    target.on_time = onTime;
    target.breach = target.breach_from_open;
    // "ຄ້າງ" ກໍ່ຕ້ອງມາຈາກຊຸດດຽວກັບ opened ບໍ່ດັ່ງນັ້ນ pendingRate ປົນສອງຊຸດ
    target.pending = Number(src?.opened_pending) || 0;
  };
  const perf = await perfPromise;
  const perfByBranch = new Map((perf.branches || []).map((b) => [String(b.branch_code), b]));
  for (const branch of branches) {
    const src = perfByBranch.get(String(branch.branch_code));
    if (!src) continue;
    for (const key of LEDGER_KEYS) branch[key] = Number(src[key]) || 0;
    applyOnTime(branch, src);
  }
  for (const key of LEDGER_KEYS) {
    overall[key] = Number(perf.overall?.[key]) || 0;
  }
  applyOnTime(overall, perf.overall);
  // ພະແນກ: ຊື່ມາຈາກທະບຽນຊຸດດຽວກັນແລ້ວ ຈຶ່ງຈັບຄູ່ດ້ວຍຊື່ໄດ້ໂດຍກົງ
  const perfByDept = new Map(
    (perf.departments || []).map((d) => [String(d.department_name || "").trim(), d])
  );
  for (const dept of departments) {
    const src = perfByDept.get(String(dept.department_name || "").trim());
    if (!src) continue;
    for (const key of LEDGER_KEYS) dept[key] = Number(src[key]) || 0;
    applyOnTime(dept, src);
  }

  return { month: monthly, overall, branches, departments, daily, zones, fleet, queue };
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
  await ensureForwardBranchColumn();
  // ຂອບເຂດສາຂາ ແລະ ນິຍາມ "ຈຸດສົ່ງ" ຕ້ອງເປັນອັນດຽວກັບໜ້າ BI / ໜ້າຫຼັກ:
  // ຖ້ຽວທີ່ອະນຸມັດແລ້ວ + branchFilterJob. ກົດເກົ່າ (ສາຂາຂອງບິນ) ໃຫ້ 1,381 ແຖວ
  // ໃນຂະນະທີ່ໜ້າອື່ນນັບໄດ້ 1,724 ສຳລັບ 02-0002 ເດືອນ 2026-08.
  const branchClause = branchFilterJob(scope, "j");
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
     JOIN odg_tms j ON j.doc_no = d.doc_no
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
       AND COALESCE(j.approve_status, 0) = 1
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

// ── ຈັກກະວານບິນຂອງບັນຊີເຄື່ອນໄຫວ (ໃຊ້ຮ່ວມກັນທັງ 3 ຄຳຂໍ) ──
// ບໍ່ແມ່ນສະເພາະໃບຂາຍຂອງ ERP (ic_trans_shipment trans_flag=44) ອີກຕໍ່ໄປ. ຄົນຂັບ
// ປິດບິນອີກຫຼາຍປະເພດຢູ່ໜ້າມືຖື: ໃບໂອນສາຂາ (FT, flag 70/72), ໃບເບີກ (WFOH,
// flag 56), ບິນ COD/INH ໜ້າຮ້ານທີ່ບໍ່ມີແຖວ shipment ແລະ ບິນທີ່ບໍ່ມີເອກະສານ ERP
// ເລີຍ. ຄຸມແຕ່ flag 44 ເຮັດໃຫ້ "ຈັດສົ່ງໃນວັນ" ໜ້ອຍກວ່າໜ້າ TV ທຸກມື້
// (19-08-2026 ດອນຕິ້ວ: 76 ທຽບ 88 — ຫຼຸດ 12 ບິນ).
//
// extra_bills = ບິນທີ່ຖ້ຽວຂອງສາຂານີ້ຈັບ ແຕ່ແຂນທຳອິດ (ໃບຂາຍ) ເຫັນບໍ່ໄດ້ —
// ບໍ່ມີແຖວ shipment ເລີຍ ຫຼື ສາຂາຂອງບິນບໍ່ແມ່ນສາຂາຂົນສົ່ງທີ່ບັນຊີນີ້ຄຸມ (ເຊັ່ນ
// 02-0004 ລູກຄ້າຮັບເອງ, 02-0007 ໂພນສະອາດ, 02-0008 ສົ່ງແລ້ວແຕ່ບໍ່ໄດ້ຈັດຖ້ຽວ).
// ໃນກໍລະນີນັ້ນຖືເປັນຍອດຂອງສາຂາທີ່ແລ່ນຖ້ຽວແທ້.
//
// ⚠️ ຂຽນເປັນ subquery ບົນຕາຕະລາງຈິງ ບໍ່ແມ່ນ CTE ຊ້ອນ CTE: DB ເປັນ PostgreSQL 11
// ເຊິ່ງ CTE ເປັນກຳແພງກັ້ນ optimizer ແລະ CTE ທີ່ອ້າງ CTE ອື່ນຈະຖືກຄາດຄະເນເປັນ
// 1 ແຖວ ແລ້ວ planner ເລືອກ nested loop ໃສ່ 15,000 ແຖວ — ວັດແລ້ວ 110 ວິນາທີ.
//
// allowedListSql ຕ້ອງເປັນ "ທຸກສາຂາທີ່ຜູ້ໃຊ້ເຫັນໄດ້" ບໍ່ແມ່ນສາຂາທີ່ຖືກເລືອກຢູ່ຕົວ
// ກັ່ນຕອງ — ບໍ່ດັ່ງນັ້ນບິນຂອງສາຂາອື່ນຈະຍ້າຍມາໃສ່ຖ້ຽວເມື່ອປ່ຽນຕົວກັ່ນຕອງ.
// ⚠️ ທັງສອງພາຣາມິເຕີຕ້ອງເປັນ "ທຸກສາຂາທີ່ຜູ້ໃຊ້ເຫັນໄດ້" ບໍ່ແມ່ນສາຂາທີ່ຖືກເລືອກ
// ຢູ່ຕົວກັ່ນຕອງ. trip_branch ຄືສາຂາຂອງຖ້ຽວ **ຫຼ້າສຸດທີ່ສົ່ງສຳເລັດ** ຂອງບິນນັ້ນ
// ຈຶ່ງຕ້ອງເບິ່ງຖ້ຽວທັງໝົດກ່ອນ ແລ້ວຄ່ອຍກັ່ນຕອງດ້ວຍສາຂາທີ່ເລືອກຢູ່ຊັ້ນນອກ:
// ບິນ 7275 ຖືກສົ່ງໂດຍຖ້ຽວ 02-0001 (ມິຖຸນາ) ແລະ 02-0002 (ສິງຫາ) — ຖ້າສະແກນ
// ສະເພາະ 02-0001 ມັນຈະຖືກຕີເປັນບິນຂອງ 02-0001 ແລ້ວລາຍການລະອຽດຈະມີ 1 ແຖວ
// ຫຼາຍກວ່າບັດສະຫຼຸບ.
function ledgerExtraBillsCte(allowedListSql, allowedListSql2 = allowedListSql) {
  return `extra_bills AS (
      SELECT d.bill_no,
             MIN(d.bill_date)::date AS tms_date,
             (ARRAY_AGG(t.origin_transport_code
                        ORDER BY (COALESCE(d.status, 0) = 1) DESC,
                                 d.sent_end DESC NULLS LAST))[1] AS trip_branch
      FROM public.odg_tms_detail d
      JOIN public.odg_tms t ON t.doc_no = d.doc_no
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
        AND t.origin_transport_code IN (${allowedListSql})
        AND NOT EXISTS (
          SELECT 1 FROM ic_trans_shipment s
          LEFT JOIN public.odg_tms_pending_bill p2 ON p2.bill_no = s.doc_no
          WHERE s.doc_no = d.bill_no AND s.trans_flag = 44
            AND ${getFixedYearSqlFilter("s.doc_date")}
            AND COALESCE(NULLIF(TRIM(p2.transport_code), ''), s.transport_code)
                IN (${allowedListSql2})
        )
      GROUP BY d.bill_no
    )`;
}

// ແຂນທີສາມຂອງ sale_bills — ບິນທີ່ຢູ່ໃນລາຍການ "ບິນລໍຈັດຖ້ຽວ" (canonical) ແຕ່
// ອີກສອງແຂນເຫັນບໍ່ໄດ້: ບິນ TMS ທີ່ບໍ່ມີເອກະສານ ERP ເລີຍ (CAK…, OTH-…, CODPB…
// ທີ່ສ້າງຢູ່ໜ້າ ບິນລໍຈັດຖ້ຽວ) ແລະ **ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ** ຈຶ່ງບໍ່ມີແຖວໃນ
// odg_tms_detail ໃຫ້ແຂນທີສອງຈັບ.
//
// ບໍ່ມີແຂນນີ້ ຊ່ອງ ຄົງເຫຼືອ ຈະໜ້ອຍກວ່າໜ້າ /bills-pending ສະເໝີ (ວັດ 2026-08-23:
// 40 ທຽບ 44) ແລ້ວ ຍອດຍົກມາ ທີ່ຄິດຍ້ອນຫຼັງຈາກ ຄົງເຫຼືອ ກໍ່ຜິດຕາມ.
//
// ວັນທີ່ບິນ: ເອກະສານ ERP → ວັນສ້າງບິນມືຢູ່ TMS → ວັນນັດ. ສາຂາ: ສາຂາທີ່ຜູ້ຈັດ
// ມອບໝາຍ → ສາຂາໃນແຖວ shipment.
function ledgerPendingOnlyArmSql(
  branchListSql,
  allowedListSql = branchListSql,
  pendingParam = "$3",
  toDateParam = "$2"
) {
  return `SELECT o.bill_no AS doc_no,
             COALESCE(ic.doc_date::date, cb.created_at::date, pb.scheduled_date::date) AS doc_date,
             -- ໃບຂໍໂອນສິນຄ້າ (ic_trans flag 70/72) ບໍ່ມີທັງແຖວ pending ແລະ shipment
             -- ຈຶ່ງຖອຍໄປໃຊ້ກຸ່ມສາງ: 11xx ຂົວຫຼວງ · 12xx ດອນຕິ້ວ · 13xx ໂພນສະອາດ
             -- · 14xx ປາກເຊ. ບໍ່ມີແຖວນີ້ ໃບຂໍໂອນຈະຫາຍຈາກບັນຊີເຄື່ອນໄຫວ ທັງທີ່ຂຶ້ນ
             -- ຢູ່ຄິວ ບິນລໍຈັດຖ້ຽວ ແລ້ວ.
             COALESCE(
               NULLIF(TRIM(pb.transport_code), ''),
               sh.transport_code,
               CASE left(COALESCE(ic.wh_from, ''), 2)
                 WHEN '11' THEN '02-0001'
                 WHEN '12' THEN '02-0002'
                 WHEN '13' THEN '02-0007'
                 WHEN '14' THEN '02-0003'
               END
             ) AS branch_code,
             ic.sale_code
      FROM unnest(${pendingParam}::varchar[]) AS o(bill_no)
      LEFT JOIN LATERAL (
        SELECT x.doc_date, x.sale_code, x.wh_from FROM ic_trans x
        WHERE x.doc_no = o.bill_no ORDER BY x.doc_date LIMIT 1
      ) ic ON true
      LEFT JOIN public.odg_tms_custom_bill cb ON cb.bill_no = o.bill_no
      LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = o.bill_no
      LEFT JOIN LATERAL (
        SELECT s2.transport_code FROM ic_trans_shipment s2
        WHERE s2.doc_no = o.bill_no ORDER BY s2.doc_date LIMIT 1
      ) sh ON true
      WHERE COALESCE(
              NULLIF(TRIM(pb.transport_code), ''),
              sh.transport_code,
              CASE left(COALESCE(ic.wh_from, ''), 2)
                WHEN '11' THEN '02-0001'
                WHEN '12' THEN '02-0002'
                WHEN '13' THEN '02-0007'
                WHEN '14' THEN '02-0003'
              END
            ) IN (${branchListSql})
        AND COALESCE(ic.doc_date::date, cb.created_at::date, pb.scheduled_date::date) IS NOT NULL
        AND COALESCE(ic.doc_date::date, cb.created_at::date, pb.scheduled_date::date) <= ${toDateParam}::date
        -- ບໍ່ຊ້ຳກັບແຂນໃບຂາຍ ERP
        AND NOT EXISTS (
          SELECT 1 FROM ic_trans_shipment s3
          WHERE s3.doc_no = o.bill_no AND s3.trans_flag = 44
            AND ${getFixedYearSqlFilter("s3.doc_date")}
        )
        -- ບໍ່ຊ້ຳກັບແຂນບິນທີ່ຢູ່ເທິງຖ້ຽວ (extra_bills)
        AND NOT EXISTS (
          SELECT 1 FROM public.odg_tms_detail d3
          JOIN public.odg_tms t3 ON t3.doc_no = d3.doc_no
          WHERE d3.bill_no = o.bill_no
            AND ${getFixedYearSqlFilter("d3.doc_date")}
            AND t3.origin_transport_code IN (${allowedListSql})
        )`;
}

// ແຂນທີສອງຂອງ sale_bills — ຄືນຄໍລຳ (doc_no, doc_date, branch_code, sale_code)
// ຄືກັນກັບແຂນໃບຂາຍ. ວັນທີ່ບິນເອົາຈາກ ic_trans ບໍ່ວ່າ trans_flag ໃດ ແລະ ຖ້າບໍ່ມີ
// ເອກະສານ ERP ເລີຍຈຶ່ງໃຊ້ວັນທີ່ບິນທີ່ TMS ຈົດໄວ້.
function ledgerExtraBillsArmSql(toDateParam = "$2", branchListSql = "") {
  return `SELECT eb.bill_no AS doc_no,
             COALESCE(ic.doc_date::date, eb.tms_date) AS doc_date,
             eb.trip_branch AS branch_code,
             ic.sale_code
      FROM extra_bills eb
      LEFT JOIN LATERAL (
        SELECT x.doc_date, x.sale_code FROM ic_trans x
        WHERE x.doc_no = eb.bill_no ORDER BY x.doc_date LIMIT 1
      ) ic ON true
      WHERE COALESCE(ic.doc_date::date, eb.tms_date) IS NOT NULL
        AND COALESCE(ic.doc_date::date, eb.tms_date) <= ${toDateParam}::date
        AND ${getFixedYearSqlFilter("COALESCE(ic.doc_date::date, eb.tms_date)")}
        ${branchListSql ? `AND eb.trip_branch IN (${branchListSql})` : ""}`;
}

const LEDGER_BILL_ITEMS_SQL = `bill_items AS (
      SELECT d.doc_no AS bill_no, SUM(COALESCE(d.qty, 0))::numeric AS total_qty
      FROM ic_trans_detail d
      WHERE d.item_code NOT LIKE '97%'
        AND d.doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY d.doc_no
      UNION ALL
      SELECT it.bill_no,
             SUM(CASE WHEN COALESCE(it.delivered_qty, 0) = 0
                      THEN COALESCE(it.selected_qty, 0)
                      ELSE COALESCE(it.delivered_qty, 0) END)::numeric AS total_qty
      FROM public.odg_tms_detail_item it
      WHERE it.bill_no IN (SELECT doc_no FROM sale_bills)
        AND NOT EXISTS (
          SELECT 1 FROM ic_trans_detail d2
          WHERE d2.doc_no = it.bill_no AND d2.item_code NOT LIKE '97%'
        )
      GROUP BY it.bill_no
    )`;

// Daily-activity movement summary over a date range — a flow ledger for the
// delivery pipeline, expressed as: ຍອດຍົກມາ + ເປີດບິນ − ຈັດສົ່ງ = ຄົງເຫຼືອ.
//   ຄົງເຫຼືອ (remaining) — pending RIGHT NOW. MUST equal the bills-pending page,
//      so it is taken verbatim from getBillsPending (the canonical pending list),
//      NOT recomputed here — earlier recomputation inflated it badly.
//   ເປີດບິນ (opened)    — sale bills (trans_flag=44) opened in [from,to] by doc_date.
//   ຈັດສົ່ງ (delivered) — bills with a completed customer delivery (odg_tms_detail
//      status=1, bill level) whose final sent_end falls in [from,to]. Bill level,
//      not item level, so bills delivered without item-detail rows still count.
//   ຍອດຍົກມາ (carry_in) — DERIVED so the ledger balances: remaining + delivered −
//      opened (= pending at the start of the window). Keeps ຄົງເຫຼືອ exact.
// Quantities mirror the same buckets: remaining = canonical remaining_qty_total,
// opened = bill net qty (goods minus trans_flag=48 returns), delivered = units
// actually handed over. Returns are netted so a fully-returned bill drops out.
async function getReportDailyActivity(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  const branchList = scope.scoped
    ? scope.branchListSql
    : MONTHLY_DELIVERY_BRANCH_CODES.map((c) => `'${c}'`).join(", ");

  // ── ບິນທີ່ຍັງຄ້າງ "ຢູ່ຕອນນີ້" ຈາກລາຍການ canonical ──
  // ໃຊ້ເປັນຈຸດຢືນຂອງບັນຊີ ບໍ່ແມ່ນຄຳຕອບຂອງຊ່ອງ ຄົງເຫຼືອ ໂດຍກົງ: ບິນທີ່ບໍ່ຢູ່ໃນ
  // ລາຍການນີ້ແລ້ວ ຖືວ່າອອກຈາກຍອດ ແລ້ວຄ່ອຍລົງວັນທີວ່າອອກຕອນໃດ ຈຶ່ງເລືອກວັນທີ
  // ຫຍັງກໍ່ໄດ້ຄຳຕອບຂອງວັນນັ້ນຈິງ (ນິຍາມດຽວກັບ getDeliveryPerformance).
  const { getBillsPending, getDispatchedBillsSummary } = require("./bills.js");
  const { FIXED_YEAR_START, FIXED_YEAR_END } = require("../lib/fixed-year");
  const [pending, dispatched] = await Promise.all([
    getBillsPending(session, FIXED_YEAR_START, FIXED_YEAR_END, "all"),
    // ບິນທີ່ຈັດຖ້ຽວແລ້ວແຕ່ຍັງບໍ່ຮອດມືລູກຄ້າ — ບໍ່ຢູ່ໃນ ຄົງເຫຼືອ ເພາະ ERP ຕັ້ງ
    // check_status=1 ຕັ້ງແຕ່ວັນຈັດຖ້ຽວ. ຈັດຖ້ຽວລ່ວງໜ້າຈຶ່ງເຮັດໃຫ້ຍອດນີ້ຫຼຸດລົງ
    // ໂດຍທີ່ຍັງບໍ່ໄດ້ສົ່ງ — ສະແດງແຍກໄວ້ ຈຶ່ງບໍ່ຫາຍໄປງຽບໆ.
    getDispatchedBillsSummary(session),
  ]);
  const dispatchedByBranch = new Map(
    (dispatched.byBranch || []).map((r) => [String(r.branch_code || "").trim(), r])
  );
  const outstandingNow = Array.from(
    new Set(
      ((pending && pending.trans) || [])
        .map((row) => (row && row.doc_no ? String(row.doc_no) : ""))
        .filter(Boolean)
    )
  );

  // ── ບັນຊີເຄື່ອນໄຫວຄົບ 5 ຊ່ອງ ຕໍ່ສາຂາ ──
  const flowRows = await query(
    `WITH ${ledgerExtraBillsCte(branchList)},
    sale_bills AS (
      SELECT a.doc_no,
             b.doc_date::date AS doc_date,
             COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) AS branch_code
      FROM ic_trans_shipment a
      JOIN ic_trans b ON b.doc_no = a.doc_no
      LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.doc_no
      WHERE a.trans_flag = 44
        AND b.doc_date::date <= $2::date
        AND ${getFixedYearSqlFilter("a.doc_date")}
        AND COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) IN (${branchList})
      UNION ALL
      SELECT u.doc_no, u.doc_date, u.branch_code
      FROM (${ledgerExtraBillsArmSql()}) u
      UNION ALL
      SELECT po.doc_no, po.doc_date, po.branch_code
      FROM (${ledgerPendingOnlyArmSql(branchList)}) po
    ),
    ${LEDGER_BILL_ITEMS_SQL},
    returned AS (
      SELECT rd.ref_doc_no AS bill_no, SUM(ABS(COALESCE(rd.qty, 0)))::numeric AS returned_qty
      FROM ic_trans_detail rd
      JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
      WHERE rd.item_code NOT LIKE '97%'
        AND rd.ref_doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY rd.ref_doc_no
    ),
    del_dates AS (
      -- Bill-level completion: the last finished customer delivery for the bill.
      SELECT d.bill_no, MAX(d.sent_end) AS last_sent_end
      FROM public.odg_tms_detail d
      WHERE COALESCE(d.status, 0) = 1
        AND NULLIF(TRIM(d.forward_transport_code), '') IS NULL
        AND d.bill_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY d.bill_no
    ),
    -- ຈຳນວນສິນຄ້າທີ່ມອບຈິງ ແຍກຕາມວັນທີ່ຖ້ຽວນັ້ນສົ່ງສຳເລັດ (ບິນທະຍອຍສົ່ງ)
    del_units_day AS (
      SELECT item.bill_no, det.sent_end::date AS sent_on,
             SUM(CASE WHEN COALESCE(item.delivered_qty, 0) = 0
                      THEN COALESCE(item.selected_qty, 0)
                      ELSE COALESCE(item.delivered_qty, 0) END)::numeric AS units
      FROM public.odg_tms_detail_item item
      JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE COALESCE(det.status, 0) = 1
        AND NULLIF(TRIM(det.forward_transport_code), '') IS NULL
        AND item.bill_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY item.bill_no, det.sent_end::date
    ),
    del_units AS (
      SELECT bill_no,
             COALESCE(SUM(units), 0) AS units_all,
             COALESCE(SUM(units) FILTER (WHERE sent_on < $1::date), 0) AS units_before,
             COALESCE(SUM(units) FILTER (WHERE sent_on >= $1::date AND sent_on <= $2::date), 0) AS units_in,
             COALESCE(SUM(units) FILTER (WHERE sent_on <= $2::date), 0) AS units_to_end
      FROM del_units_day
      GROUP BY bill_no
    ),
    outstanding AS (
      SELECT DISTINCT o.bill_no FROM unnest($3::varchar[]) AS o(bill_no)
    ),
    credit AS (
      SELECT rd.ref_doc_no AS bill_no, MIN(r.doc_date)::date AS credited_on
      FROM ic_trans_detail rd
      JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
      WHERE rd.ref_doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY rd.ref_doc_no
    ),
    calc AS (
      SELECT sb.branch_code, sb.doc_date,
             (on_now.bill_no IS NOT NULL) AS is_outstanding,
             GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric AS net_total,
             -- ບິນທີ່ຍັງຄ້າງຢູ່ຕອນນີ້ ຍັງບໍ່ອອກຈາກຍອດ ເຖິງມີບາງຖ້ຽວສົ່ງໄປແລ້ວ
             CASE WHEN on_now.bill_no IS NOT NULL THEN NULL
                  ELSE dd.last_sent_end::date END AS completion_date,
             -- ອອກຈາກຍອດໂດຍບໍ່ໄດ້ສົ່ງ: ວັນໃບຫຼຸດໜີ້ ຫຼື ວັນເປີດບິນ
             CASE WHEN on_now.bill_no IS NOT NULL THEN NULL
                  WHEN dd.last_sent_end IS NOT NULL THEN NULL
                  ELSE COALESCE(cr.credited_on, sb.doc_date) END AS closed_other_date,
             -- ບິນທີ່ຂຶ້ນຫຼາຍຖ້ຽວ ມັກມີແຖວສິນຄ້າ "ເຕັມໃບ" ຢູ່ທຸກຖ້ຽວ (delivered_qty
             -- ຍັງເປັນ 0 ຈຶ່ງຖອຍໄປໃຊ້ selected_qty = ຈຳນວນທີ່ຂຶ້ນລົດ). ບວກກົງໆ
             -- ຈະໄດ້ຫຼາຍກວ່າຈຳນວນໃນບິນ — ວັດປີ 2026: 547 ບິນ ເກີນ 194,085 ອັນ
             -- ແລ້ວດັນໃຫ້ ປິດອື່ນ ຕິດລົບ. ຈຶ່ງຫຍໍ້ຕາມສ່ວນໃຫ້ລວມບໍ່ເກີນຈຳນວນໃນບິນ.
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_all, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_all, 0) END)::numeric AS units_all,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_before, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_before, 0) END)::numeric AS units_before,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_in, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_in, 0) END)::numeric AS units_in,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_to_end, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_to_end, 0) END)::numeric AS units_to_end
      FROM sale_bills sb
      LEFT JOIN bill_items bi ON bi.bill_no = sb.doc_no
      LEFT JOIN returned rt ON rt.bill_no = sb.doc_no
      LEFT JOIN del_dates dd ON dd.bill_no = sb.doc_no
      LEFT JOIN del_units du ON du.bill_no = sb.doc_no
      LEFT JOIN outstanding on_now ON on_now.bill_no = sb.doc_no
      LEFT JOIN credit cr ON cr.bill_no = sb.doc_no
    ),
    -- ຍົກມາ + ເປີດບິນ − ຈັດສົ່ງ − ປິດດ້ວຍທາງອື່ນ = ຄົງເຫຼືອ (ລົງຕົວທັງບິນ ແລະ ສິນຄ້າ)
    flags AS (
      SELECT branch_code, net_total,
        units_in AS sent_units,
        (net_total - units_before) AS carry_units,
        (net_total - units_to_end) AS open_units,
        (net_total - units_all) AS writeoff_units,
        (doc_date >= $1::date AND doc_date <= $2::date) AS is_opened,
        (completion_date >= $1::date AND completion_date <= $2::date) AS is_delivered,
        (closed_other_date >= $1::date AND closed_other_date <= $2::date) AS is_closed_other,
        (doc_date < $1::date
          AND (completion_date IS NULL OR completion_date >= $1::date)
          AND (closed_other_date IS NULL OR closed_other_date >= $1::date)) AS is_carry_in,
        (doc_date <= $2::date
          AND (completion_date IS NULL OR completion_date > $2::date)
          AND (closed_other_date IS NULL OR closed_other_date > $2::date)) AS is_remaining
      FROM calc
      -- ບິນທີ່ຍັງຄ້າງຢູ່ຕອນນີ້ ຕ້ອງນັບເຖິງແມ່ນຍັງບໍ່ມີແຖວສິນຄ້າ (ບິນມືທີ່ຫາກໍ່ສ້າງ
      -- ຢູ່ໜ້າ ບິນລໍຈັດຖ້ຽວ ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ) ບໍ່ດັ່ງນັ້ນ ຄົງເຫຼືອ ຈະໜ້ອຍກວ່າໜ້ານັ້ນ.
      WHERE net_total > 0 OR is_outstanding
    )
    SELECT branch_code,
      COUNT(*) FILTER (WHERE is_carry_in)::int AS carry_bills,
      COALESCE(SUM(carry_units) FILTER (WHERE is_carry_in), 0)::numeric AS carry_qty,
      COUNT(*) FILTER (WHERE is_opened)::int AS opened_bills,
      COALESCE(SUM(net_total) FILTER (WHERE is_opened), 0)::numeric AS opened_qty,
      COUNT(*) FILTER (WHERE is_delivered)::int AS delivered_bills,
      -- ບິນທະຍອຍສົ່ງ: ມີເຄື່ອງອອກໃນຊ່ວງ ແຕ່ບິນຍັງບໍ່ປິດ ຈຶ່ງບໍ່ນັບໃນ delivered_bills
      -- ແຕ່ຈຳນວນເຄື່ອງຂອງມັນຢູ່ໃນ delivered_qty — ບອກໄວ້ ບໍ່ດັ່ງນັ້ນລາຍການລະອຽດ
      -- ຈະມີແຖວຫຼາຍກວ່າຕົວເລກເທິງບັດ ໂດຍບໍ່ມີຄຳອະທິບາຍ.
      -- COALESCE ຈຳເປັນ: completion_date ເປັນ NULL ⇒ is_delivered ເປັນ NULL
      -- ແລ້ວ NOT NULL ກໍ່ຍັງ NULL ຈຶ່ງຖືກ FILTER ຕັດອອກໝົດ (ໄດ້ 0 ຕະຫຼອດ).
      COUNT(*) FILTER (WHERE COALESCE(is_delivered, false) = false AND sent_units > 0)::int AS partial_bills,
      COALESCE(SUM(sent_units), 0)::numeric AS delivered_qty,
      COUNT(*) FILTER (WHERE is_closed_other)::int AS closed_other_bills,
      COALESCE(SUM(writeoff_units) FILTER (WHERE is_closed_other OR is_delivered), 0)::numeric AS closed_other_qty,
      COUNT(*) FILTER (WHERE is_remaining)::int AS remaining_bills,
      COALESCE(SUM(open_units) FILTER (WHERE is_remaining), 0)::numeric AS remaining_qty
    FROM flags
    GROUP BY branch_code`,
    [fromDate, toDate, outstandingNow]
  );
  const flowByBranch = new Map(flowRows.map((r) => [r.branch_code, r]));

  const codes = scope.scoped ? scope.branches : MONTHLY_DELIVERY_BRANCH_CODES;
  // Pull live branch names from transport_type — the hardcoded
  // MONTHLY_DELIVERY_BRANCH_NAMES map is stale (02-0001 is "ຂົນສົ່ງໂອດ່ຽນ" now).
  const nameRows = codes.length
    ? await query(
        `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name_1
         FROM transport_type WHERE code = ANY($1::varchar[])`,
        [codes]
      )
    : [];
  const nameMap = new Map(nameRows.map((r) => [r.code, r.name_1]));

  const build = (code) => {
    const f = flowByBranch.get(code);
    const num = (key) => Number(f?.[key] ?? 0);
    return {
      branch_code: code,
      branch_name: nameMap.get(code) ?? MONTHLY_DELIVERY_BRANCH_NAMES[code] ?? code,
      carry_bills: num("carry_bills"),
      opened_bills: num("opened_bills"),
      delivered_bills: num("delivered_bills"),
      partial_bills: num("partial_bills"),
      closed_other_bills: num("closed_other_bills"),
      remaining_bills: num("remaining_bills"),
      carry_qty: num("carry_qty"),
      opened_qty: num("opened_qty"),
      delivered_qty: num("delivered_qty"),
      closed_other_qty: num("closed_other_qty"),
      remaining_qty: num("remaining_qty"),
      // ນອກເໜືອຈາກ ຄົງເຫຼືອ — ບໍ່ເອົາເຂົ້າສົມຜົນ ຈຶ່ງບໍ່ກະທົບຍອດເກົ່າ
      dispatched_bills: Number(dispatchedByBranch.get(code)?.bills ?? 0),
      dispatched_ahead: Number(dispatchedByBranch.get(code)?.scheduled_ahead ?? 0),
    };
  };
  const branches = codes.map((code) => build(code));
  const ACTIVITY_TOTAL_KEYS = [
    "carry_bills", "opened_bills", "delivered_bills", "partial_bills", "closed_other_bills", "remaining_bills",
    "carry_qty", "opened_qty", "delivered_qty", "closed_other_qty", "remaining_qty",
    "dispatched_bills", "dispatched_ahead",
  ];
  const total = branches.reduce(
    (acc, b) => {
      for (const key of ACTIVITY_TOTAL_KEYS) acc[key] += b[key];
      return acc;
    },
    Object.fromEntries(ACTIVITY_TOTAL_KEYS.map((key) => [key, 0]))
  );
  return { fromDate, toDate, branches, total };
}

// Same movement ledger as getReportDailyActivity — ຍອດຍົກມາ + ເປີດບິນ − ຈັດສົ່ງ
// = ຄົງເຫຼືອ — but bucketed by the SALE department that opened the bill instead
// of the transport branch that carries it, and returning bill counts AND
// product quantities side by side in one row (the branch report splits those
// across two pages).
//   ຄົງເຫຼືອ (remaining) — pending RIGHT NOW, taken verbatim from the canonical
//      getBillsPending list so the total matches the bills-pending page.
//   ເປີດບິນ (opened)     — sale bills (trans_flag=44) with doc_date in [from,to].
//   ຈັດສົ່ງ (delivered)  — bills whose final customer delivery (odg_tms_detail
//      status=1) completed in [from,to]; qty = units actually handed over.
//   ຍອດຍົກມາ (carry_in)  — DERIVED (remaining + delivered − opened) so the ledger
//      balances against the canonical ຄົງເຫຼືອ.
// The department label is derived exactly the way the pending list derives it
// (odg_employee → odg_department), so both sources fall into identical buckets.
// salesOnly (default) keeps just the sale departments — odg_department rows in
// division 200, i.e. ພະແນກຂາຍ* 201-208 — dropping production / service / office
// departments and bills whose salesperson has no department at all.
const UNASSIGNED_DEPARTMENT = "(ບໍ່ກຳນົດພະແນກ)";
const SALES_DIVISION_CODE = "200";

async function getReportDailyDepartment(
  session,
  fromDate,
  toDate,
  salesOnly = true,
  transportCode = ""
) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  // Branches this report may cover: the user's own when they are branch-scoped,
  // otherwise the three delivery branches the ledger is defined over.
  const allowedBranches = scope.scoped ? scope.branches : MONTHLY_DELIVERY_BRANCH_CODES;
  // ສາຂາຂົນສົ່ງ filter — ignored when it names a branch outside the caller's
  // scope, so the parameter can never widen what a branch user may see.
  const picked = String(transportCode ?? "").trim();
  const selectedBranch = allowedBranches.includes(picked) ? picked : "";
  const activeBranches = selectedBranch ? [selectedBranch] : allowedBranches;
  const quote = (c) => `'${String(c).replace(/'/g, "''")}'`;
  const branchList = activeBranches.map(quote).join(", ");
  // ລາຍຊື່ສາຂາທັງໝົດທີ່ຜູ້ໃຊ້ເຫັນໄດ້ — ໃຊ້ຕັດສິນວ່າສາຂາຂອງບິນເປັນສາຂາຂົນສົ່ງ
  // ແທ້ບໍ່ ຈຶ່ງບໍ່ປ່ຽນຄຳຕອບຕາມສາຂາທີ່ຖືກເລືອກຢູ່ຕົວກັ່ນຕອງ.
  const allowedList = allowedBranches.map(quote).join(", ");

  // Department master: gives the sales-division whitelist (matched by NAME,
  // because the pending list only carries the display name) and the code used
  // to order the rows the way the org chart does (201, 202, ...).
  const deptRows = await query(
    `SELECT department_code,
            COALESCE(NULLIF(TRIM(department_name_lo), ''), department_code) AS name,
            COALESCE(NULLIF(TRIM(division_code), ''), '') AS division_code
     FROM public.odg_department`
  );
  const codeByName = new Map(deptRows.map((r) => [r.name, r.department_code]));
  const salesNames = new Set(
    deptRows
      .filter((r) => r.division_code === SALES_DIVISION_CODE)
      .map((r) => r.name)
  );

  // ── ບິນທີ່ຍັງຄ້າງ "ຢູ່ຕອນນີ້" ຈາກລາຍການ canonical ──
  // ໃຊ້ເປັນຈຸດຢືນ (anchor) ຂອງບັນຊີ ບໍ່ແມ່ນເປັນຄຳຕອບຂອງຊ່ອງ ຄົງເຫຼືອ ໂດຍກົງ:
  // ບິນທີ່ບໍ່ຢູ່ໃນລາຍການນີ້ແລ້ວ ຖືວ່າ "ອອກຈາກຍອດແລ້ວ" ແລ້ວຄ່ອຍລົງວັນທີວ່າ
  // ອອກຕອນໃດ (ວັນສົ່ງສຳເລັດ ຫຼື ວັນໃບຫຼຸດໜີ້) — ນິຍາມດຽວກັບ
  // getDeliveryPerformance ຈຶ່ງເລືອກວັນທີຫຍັງກໍ່ໄດ້ຄຳຕອບຂອງວັນນັ້ນຈິງ.
  const { getBillsPending } = require("./bills.js");
  const { FIXED_YEAR_START, FIXED_YEAR_END } = require("../lib/fixed-year");
  const pending = await getBillsPending(session, FIXED_YEAR_START, FIXED_YEAR_END, "all");
  const outstandingNow = Array.from(
    new Set(
      ((pending && pending.trans) || [])
        .map((row) => (row && row.doc_no ? String(row.doc_no) : ""))
        .filter(Boolean)
    )
  );

  // ── ບັນຊີເຄື່ອນໄຫວຄົບ 5 ຊ່ອງ ຕໍ່ພະແນກ ──
  const flowRows = await query(
    `WITH ${ledgerExtraBillsCte(allowedList)},
    sale_bills AS (
      SELECT u.doc_no, u.doc_date,
             COALESCE(
               NULLIF(TRIM(od.department_name_lo), ''),
               NULLIF(TRIM(oe.department_code::text), ''),
               '${UNASSIGNED_DEPARTMENT}'
             ) AS department
      FROM (
        SELECT a.doc_no,
               b.doc_date::date AS doc_date,
               b.sale_code
        FROM ic_trans_shipment a
        JOIN ic_trans b ON b.doc_no = a.doc_no
        LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.doc_no
        WHERE a.trans_flag = 44
          AND b.doc_date::date <= $2::date
          AND ${getFixedYearSqlFilter("a.doc_date")}
          AND COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) IN (${branchList})
        UNION ALL
        SELECT x.doc_no, x.doc_date, x.sale_code
        FROM (${ledgerExtraBillsArmSql("$2", branchList)}) x
        UNION ALL
        SELECT po.doc_no, po.doc_date, po.sale_code
        FROM (${ledgerPendingOnlyArmSql(branchList, allowedList)}) po
      ) u
      LEFT JOIN public.odg_employee oe ON oe.employee_code = u.sale_code
      LEFT JOIN public.odg_department od ON od.department_code = oe.department_code
      ${salesOnly ? `WHERE TRIM(od.division_code) = '${SALES_DIVISION_CODE}'` : ""}
    ),
    ${LEDGER_BILL_ITEMS_SQL},
    returned AS (
      SELECT rd.ref_doc_no AS bill_no, SUM(ABS(COALESCE(rd.qty, 0)))::numeric AS returned_qty
      FROM ic_trans_detail rd
      JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
      WHERE rd.item_code NOT LIKE '97%'
        AND rd.ref_doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY rd.ref_doc_no
    ),
    del_dates AS (
      -- Bill-level completion: the last finished customer delivery for the bill.
      SELECT d.bill_no, MAX(d.sent_end) AS last_sent_end
      FROM public.odg_tms_detail d
      WHERE COALESCE(d.status, 0) = 1
        AND NULLIF(TRIM(d.forward_transport_code), '') IS NULL
        AND d.bill_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY d.bill_no
    ),
    -- ຈຳນວນສິນຄ້າທີ່ມອບຈິງ ແຍກຕາມ "ວັນທີ່ຖ້ຽວນັ້ນສົ່ງສຳເລັດ" — ບິນທະຍອຍສົ່ງ
    -- ຈຶ່ງລົງຍອດຢູ່ວັນທີ່ສົ່ງແທ້ ບໍ່ແມ່ນລວມກ້ອນດຽວຢູ່ວັນທີ່ບິນປິດ
    del_units_day AS (
      SELECT item.bill_no, det.sent_end::date AS sent_on,
             SUM(CASE WHEN COALESCE(item.delivered_qty, 0) = 0
                      THEN COALESCE(item.selected_qty, 0)
                      ELSE COALESCE(item.delivered_qty, 0) END)::numeric AS units
      FROM public.odg_tms_detail_item item
      JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE COALESCE(det.status, 0) = 1
        AND NULLIF(TRIM(det.forward_transport_code), '') IS NULL
        AND item.bill_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY item.bill_no, det.sent_end::date
    ),
    del_units AS (
      SELECT bill_no,
             COALESCE(SUM(units), 0) AS units_all,
             COALESCE(SUM(units) FILTER (WHERE sent_on < $1::date), 0) AS units_before,
             COALESCE(SUM(units) FILTER (WHERE sent_on >= $1::date AND sent_on <= $2::date), 0) AS units_in,
             COALESCE(SUM(units) FILTER (WHERE sent_on <= $2::date), 0) AS units_to_end
      FROM del_units_day
      GROUP BY bill_no
    ),
    outstanding AS (
      SELECT DISTINCT o.bill_no FROM unnest($3::varchar[]) AS o(bill_no)
    ),
    -- ບິນທີ່ຖືກຄືນຜ່ານໃບຫຼຸດໜີ້ (trans_flag = 48) — ໃຊ້ເປັນວັນທີ່ "ອອກຈາກຍອດ"
    -- ຂອງບິນທີ່ບໍ່ເຄີຍມີການສົ່ງສຳເລັດເລີຍ
    credit AS (
      SELECT rd.ref_doc_no AS bill_no, MIN(r.doc_date)::date AS credited_on
      FROM ic_trans_detail rd
      JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
      WHERE rd.ref_doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY rd.ref_doc_no
    ),
    calc AS (
      SELECT sb.department, sb.doc_date,
             (on_now.bill_no IS NOT NULL) AS is_outstanding,
             GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric AS net_total,
             -- ບິນທີ່ຍັງຄ້າງຢູ່ຕອນນີ້ ຍັງບໍ່ອອກຈາກຍອດ ຈຶ່ງບໍ່ມີວັນສຳເລັດ ເຖິງວ່າ
             -- ຈະມີບາງຖ້ຽວສົ່ງໄປແລ້ວ (ບິນທະຍອຍສົ່ງ) — ບໍ່ດັ່ງນັ້ນມັນຈະຫາຍ
             -- ອອກຈາກ ຄົງເຫຼືອ ທັງທີ່ຍັງມີເຄື່ອງຄ້າງສົ່ງ
             CASE WHEN on_now.bill_no IS NOT NULL THEN NULL
                  ELSE dd.last_sent_end::date END AS completion_date,
             -- ອອກຈາກຍອດໂດຍບໍ່ໄດ້ສົ່ງ: ວັນໃບຫຼຸດໜີ້ ຫຼື ຖ້າບໍ່ມີ ກໍ່ນັບແຕ່ວັນເປີດບິນ
             -- (ERP ບໍ່ເກັບປະຫວັດການປິດບິນ ຈຶ່ງບອກວັນທີ່ແທ້ບໍ່ໄດ້)
             CASE WHEN on_now.bill_no IS NOT NULL THEN NULL
                  WHEN dd.last_sent_end IS NOT NULL THEN NULL
                  ELSE COALESCE(cr.credited_on, sb.doc_date) END AS closed_other_date,
             -- ບິນທີ່ຂຶ້ນຫຼາຍຖ້ຽວ ມັກມີແຖວສິນຄ້າ "ເຕັມໃບ" ຢູ່ທຸກຖ້ຽວ (delivered_qty
             -- ຍັງເປັນ 0 ຈຶ່ງຖອຍໄປໃຊ້ selected_qty = ຈຳນວນທີ່ຂຶ້ນລົດ). ບວກກົງໆ
             -- ຈະໄດ້ຫຼາຍກວ່າຈຳນວນໃນບິນ — ວັດປີ 2026: 547 ບິນ ເກີນ 194,085 ອັນ
             -- ແລ້ວດັນໃຫ້ ປິດອື່ນ ຕິດລົບ. ຈຶ່ງຫຍໍ້ຕາມສ່ວນໃຫ້ລວມບໍ່ເກີນຈຳນວນໃນບິນ.
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_all, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_all, 0) END)::numeric AS units_all,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_before, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_before, 0) END)::numeric AS units_before,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_in, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_in, 0) END)::numeric AS units_in,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_to_end, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_to_end, 0) END)::numeric AS units_to_end
      FROM sale_bills sb
      LEFT JOIN bill_items bi ON bi.bill_no = sb.doc_no
      LEFT JOIN returned rt ON rt.bill_no = sb.doc_no
      LEFT JOIN del_dates dd ON dd.bill_no = sb.doc_no
      LEFT JOIN del_units du ON du.bill_no = sb.doc_no
      LEFT JOIN outstanding on_now ON on_now.bill_no = sb.doc_no
      LEFT JOIN credit cr ON cr.bill_no = sb.doc_no
    ),
    -- ບິນອອກຈາກຍອດໄດ້ 2 ທາງເທົ່ານັ້ນ ແລະ ບໍ່ຊ້ອນກັນ ຈຶ່ງໄດ້ສົມຜົນ
    --   ຍົກມາ + ເປີດບິນ − ຈັດສົ່ງ − ປິດດ້ວຍທາງອື່ນ = ຄົງເຫຼືອ
    flags AS (
      SELECT department, net_total,
        -- ໜ່ວຍຂອງບັນຊີນີ້ແມ່ນ "ສິນຄ້າທີ່ຍັງຕ້ອງສົ່ງ": ບິນເຂົ້າມາດ້ວຍຈຳນວນສຸດທິ,
        -- ຫຼຸດລົງທຸກຄັ້ງທີ່ສົ່ງ ແລະ ສ່ວນທີ່ເຫຼືອຄ້າງຕອນບິນອອກຈາກຍອດ ຖືເປັນ
        -- "ປິດດ້ວຍທາງອື່ນ" ຈຶ່ງບວກລົບແລ້ວລົງຕົວທັງຝັ່ງບິນ ແລະ ຝັ່ງສິນຄ້າ.
        units_in AS sent_units,
        (net_total - units_before) AS carry_units,
        (net_total - units_to_end) AS open_units,
        (net_total - units_all) AS writeoff_units,
        (doc_date >= $1::date AND doc_date <= $2::date) AS is_opened,
        (completion_date >= $1::date AND completion_date <= $2::date) AS is_delivered,
        (closed_other_date >= $1::date AND closed_other_date <= $2::date) AS is_closed_other,
        (doc_date < $1::date
          AND (completion_date IS NULL OR completion_date >= $1::date)
          AND (closed_other_date IS NULL OR closed_other_date >= $1::date)) AS is_carry_in,
        (doc_date <= $2::date
          AND (completion_date IS NULL OR completion_date > $2::date)
          AND (closed_other_date IS NULL OR closed_other_date > $2::date)) AS is_remaining
      FROM calc
      -- ບິນທີ່ຍັງຄ້າງຢູ່ຕອນນີ້ ຕ້ອງນັບເຖິງແມ່ນຍັງບໍ່ມີແຖວສິນຄ້າ (ບິນມືທີ່ຫາກໍ່ສ້າງ
      -- ຢູ່ໜ້າ ບິນລໍຈັດຖ້ຽວ ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ) ບໍ່ດັ່ງນັ້ນ ຄົງເຫຼືອ ຈະໜ້ອຍກວ່າໜ້ານັ້ນ.
      WHERE net_total > 0 OR is_outstanding
    )
    SELECT department,
      COUNT(*) FILTER (WHERE is_carry_in)::int AS carry_bills,
      COALESCE(SUM(carry_units) FILTER (WHERE is_carry_in), 0)::numeric AS carry_qty,
      COUNT(*) FILTER (WHERE is_opened)::int AS opened_bills,
      COALESCE(SUM(net_total) FILTER (WHERE is_opened), 0)::numeric AS opened_qty,
      COUNT(*) FILTER (WHERE is_delivered)::int AS delivered_bills,
      -- ບິນທະຍອຍສົ່ງ: ມີເຄື່ອງອອກໃນຊ່ວງ ແຕ່ບິນຍັງບໍ່ປິດ ຈຶ່ງບໍ່ນັບໃນ delivered_bills
      -- ແຕ່ຈຳນວນເຄື່ອງຂອງມັນຢູ່ໃນ delivered_qty — ບອກໄວ້ ບໍ່ດັ່ງນັ້ນລາຍການລະອຽດ
      -- ຈະມີແຖວຫຼາຍກວ່າຕົວເລກເທິງບັດ ໂດຍບໍ່ມີຄຳອະທິບາຍ.
      -- COALESCE ຈຳເປັນ: completion_date ເປັນ NULL ⇒ is_delivered ເປັນ NULL
      -- ແລ້ວ NOT NULL ກໍ່ຍັງ NULL ຈຶ່ງຖືກ FILTER ຕັດອອກໝົດ (ໄດ້ 0 ຕະຫຼອດ).
      COUNT(*) FILTER (WHERE COALESCE(is_delivered, false) = false AND sent_units > 0)::int AS partial_bills,
      -- ນັບສິນຄ້າທີ່ມອບໃນຊ່ວງນີ້ຂອງທຸກບິນ ລວມບິນທີ່ຍັງບໍ່ປິດ (ທະຍອຍສົ່ງ)
      COALESCE(SUM(sent_units), 0)::numeric AS delivered_qty,
      COUNT(*) FILTER (WHERE is_closed_other)::int AS closed_other_bills,
      COALESCE(SUM(writeoff_units) FILTER (WHERE is_closed_other OR is_delivered), 0)::numeric AS closed_other_qty,
      COUNT(*) FILTER (WHERE is_remaining)::int AS remaining_bills,
      COALESCE(SUM(open_units) FILTER (WHERE is_remaining), 0)::numeric AS remaining_qty
    FROM flags
    GROUP BY department`,
    [fromDate, toDate, outstandingNow]
  );
  const flowByDept = new Map(flowRows.map((r) => [r.department, r]));

  // A department shows up if it has movement in the window OR still has bills
  // pending — either way it belongs on the report. In sales-only mode every
  // sale department is listed even when it had no movement at all, so the
  // reader can see the zero rather than wonder whether it was dropped.
  const names = Array.from(
    new Set([...(salesOnly ? salesNames : []), ...flowByDept.keys()])
  ).sort((a, b) => {
    const ca = codeByName.get(a) ?? "zzz";
    const cb = codeByName.get(b) ?? "zzz";
    return ca.localeCompare(cb) || a.localeCompare(b, "lo");
  });

  const departments = names.map((name) => {
    const f = flowByDept.get(name);
    const num = (key) => Number(f?.[key] ?? 0);
    return {
      department: name,
      department_code: codeByName.get(name) ?? "",
      carry_bills: num("carry_bills"),
      opened_bills: num("opened_bills"),
      delivered_bills: num("delivered_bills"),
      partial_bills: num("partial_bills"),
      closed_other_bills: num("closed_other_bills"),
      remaining_bills: num("remaining_bills"),
      carry_qty: num("carry_qty"),
      opened_qty: num("opened_qty"),
      delivered_qty: num("delivered_qty"),
      closed_other_qty: num("closed_other_qty"),
      remaining_qty: num("remaining_qty"),
    };
  });

  const TOTAL_KEYS = [
    "carry_bills", "opened_bills", "delivered_bills", "partial_bills", "closed_other_bills", "remaining_bills",
    "carry_qty", "opened_qty", "delivered_qty", "closed_other_qty", "remaining_qty",
  ];
  const total = departments.reduce(
    (acc, d) => {
      for (const key of TOTAL_KEYS) acc[key] += d[key];
      return acc;
    },
    Object.fromEntries(TOTAL_KEYS.map((key) => [key, 0]))
  );
  // Branch picker options come from the query itself so the dropdown can never
  // offer a branch this report (or this user) doesn't cover.
  const branchNameRows = allowedBranches.length
    ? await query(
        `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name
         FROM transport_type WHERE code = ANY($1::varchar[])`,
        [allowedBranches]
      )
    : [];
  const branchNames = new Map(branchNameRows.map((r) => [r.code, r.name]));
  const branchOptions = allowedBranches.map((code) => ({
    code,
    name: branchNames.get(code) ?? MONTHLY_DELIVERY_BRANCH_NAMES[code] ?? code,
  }));

  return {
    fromDate,
    toDate,
    salesOnly,
    transportCode: selectedBranch,
    branchOptions,
    departments,
    total,
  };
}

// Bills behind one cell of the daily-activity report. The report only shows
// totals, so a figure that looks wrong is impossible to check — this returns
// the actual rows for a branch + bucket.
//
// bucket: opened | delivered | remaining. ຍອດຍົກມາ (carry) is DERIVED
// (remaining + delivered − opened) and has no bill list of its own.
//
// ⚠️ ນິຍາມທັງ 3 ຊ່ອງຕ້ອງເປັນສູດດຽວກັບ getReportDailyActivity /
// getReportDailyDepartment ບໍ່ດັ່ງນັ້ນກົດເບິ່ງແລ້ວຈຳນວນແຖວບໍ່ຕົງກັບຕົວເລກໃນບັດ.
// ກ່ອນນີ້ຊ່ອງ ຄົງເຫຼືອ ອ່ານລາຍການບິນຄ້າງ "ຢູ່ຕອນນີ້" ໂດຍກົງ ຈຶ່ງບໍ່ຕົງທຸກຄັ້ງທີ່
// ເບິ່ງວັນຍ້ອນຫຼັງ (19-08 ດອນຕິ້ວ: ບັດ 48 ທຽບລາຍການ 35). ຕອນເບິ່ງມື້ນີ້ສອງ
// ນິຍາມນີ້ໃຫ້ຄຳຕອບດຽວກັນຢູ່ແລ້ວ ເພາະບິນທີ່ຍັງຄ້າງບໍ່ມີວັນອອກຈາກຍອດ.
async function getReportDailyActivityBills(session, fromDate, toDate, branchCode, bucket, department) {
  // department (optional) narrows to one sale department — used by the
  // ແຍກຕາມພະແນກ report, which shows the same buckets split that way.
  const dept = String(department ?? "").trim();
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  const allowed = scope.scoped ? scope.branches : MONTHLY_DELIVERY_BRANCH_CODES;
  const branch = String(branchCode ?? "").trim();
  const quote = (c) => `'${String(c).replace(/'/g, "''")}'`;
  const branchList = (allowed.includes(branch) ? [branch] : allowed).map(quote).join(", ");
  const allowedList = allowed.map(quote).join(", ");
  const kind = ["opened", "delivered", "remaining"].includes(String(bucket))
    ? String(bucket)
    : "opened";

  // ບິນທີ່ຍັງຄ້າງຢູ່ຕອນນີ້ — ຈຸດຢືນອັນດຽວກັບບັດສະຫຼຸບ (ເບິ່ງຄຳອະທິບາຍທີ່ນັ້ນ)
  const { getBillsPending } = require("./bills.js");
  const { FIXED_YEAR_START, FIXED_YEAR_END } = require("../lib/fixed-year");
  const pending = await getBillsPending(session, FIXED_YEAR_START, FIXED_YEAR_END, "all");
  const outstandingNow = Array.from(
    new Set(
      ((pending && pending.trans) || [])
        .map((row) => (row && row.doc_no ? String(row.doc_no) : ""))
        .filter(Boolean)
    )
  );

  const bucketWhere = {
    opened: "c.doc_date BETWEEN $1::date AND $2::date",
    delivered: `(c.completion_date BETWEEN $1::date AND $2::date
        OR COALESCE(c.units_in, 0) > 0)`,
    remaining: `c.doc_date <= $2::date
        AND (c.completion_date IS NULL OR c.completion_date > $2::date)
        AND (c.closed_other_date IS NULL OR c.closed_other_date > $2::date)`,
  }[kind];
  // ໜ່ວຍຂອງແຕ່ລະຊ່ອງ ຄືກັບບັດ: ເປີດບິນ = ຈຳນວນສຸດທິຂອງບິນ, ຈັດສົ່ງ = ທີ່ມອບ
  // ໃນຊ່ວງນີ້, ຄົງເຫຼືອ = ສ່ວນທີ່ຍັງບໍ່ທັນມອບຮອດວັນສຸດທ້າຍຂອງຊ່ວງ.
  const bucketQty = {
    opened: "c.net_total",
    delivered: "c.units_in",
    remaining: "GREATEST(c.net_total - c.units_to_end, 0)",
  }[kind];
  const orderCol = kind === "delivered" ? "c.completion_date" : "c.doc_date";
  const params = dept
    ? [fromDate, toDate, outstandingNow, dept]
    : [fromDate, toDate, outstandingNow];

  return query(
    `WITH ${ledgerExtraBillsCte(allowedList)},
    sale_bills AS (
      SELECT a.doc_no,
             b.doc_date::date AS doc_date,
             COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) AS branch_code
      FROM ic_trans_shipment a
      JOIN ic_trans b ON b.doc_no = a.doc_no
      LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.doc_no
      WHERE a.trans_flag = 44
        AND b.doc_date::date <= $2::date
        AND ${getFixedYearSqlFilter("a.doc_date")}
        AND COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code) IN (${branchList})
      UNION ALL
      SELECT u.doc_no, u.doc_date, u.branch_code
      FROM (${ledgerExtraBillsArmSql("$2", branchList)}) u
      UNION ALL
      SELECT po.doc_no, po.doc_date, po.branch_code
      FROM (${ledgerPendingOnlyArmSql(branchList, allowedList)}) po
    ),
    ${LEDGER_BILL_ITEMS_SQL},
    bill_lines AS (
      SELECT bill_no, COUNT(*)::int AS item_count FROM (
        SELECT d.doc_no AS bill_no, d.item_code
        FROM ic_trans_detail d
        WHERE d.item_code NOT LIKE '97%' AND d.doc_no IN (SELECT doc_no FROM sale_bills)
        GROUP BY d.doc_no, d.item_code
        UNION
        SELECT it.bill_no, it.item_code
        FROM public.odg_tms_detail_item it
        WHERE it.bill_no IN (SELECT doc_no FROM sale_bills)
        GROUP BY it.bill_no, it.item_code
      ) x GROUP BY bill_no
    ),
    returned AS (
      SELECT rd.ref_doc_no AS bill_no, SUM(ABS(COALESCE(rd.qty, 0)))::numeric AS returned_qty
      FROM ic_trans_detail rd
      JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
      WHERE rd.item_code NOT LIKE '97%' AND rd.ref_doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY rd.ref_doc_no
    ),
    outstanding AS (
      SELECT DISTINCT o.bill_no FROM unnest($3::varchar[]) AS o(bill_no)
    ),
    del_dates AS (
      SELECT d.bill_no, MAX(d.sent_end) AS last_sent_end
      FROM public.odg_tms_detail d
      WHERE COALESCE(d.status, 0) = 1
        AND NULLIF(TRIM(d.forward_transport_code), '') IS NULL
        AND d.bill_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY d.bill_no
    ),
    del_units_day AS (
      SELECT item.bill_no, det.sent_end::date AS sent_on,
             SUM(CASE WHEN COALESCE(item.delivered_qty, 0) = 0
                      THEN COALESCE(item.selected_qty, 0)
                      ELSE COALESCE(item.delivered_qty, 0) END)::numeric AS units
      FROM public.odg_tms_detail_item item
      JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE COALESCE(det.status, 0) = 1
        AND NULLIF(TRIM(det.forward_transport_code), '') IS NULL
        AND item.bill_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY item.bill_no, det.sent_end::date
    ),
    del_units AS (
      SELECT bill_no,
             COALESCE(SUM(units), 0) AS units_all,
             COALESCE(SUM(units) FILTER (WHERE sent_on >= $1::date AND sent_on <= $2::date), 0) AS units_in,
             COALESCE(SUM(units) FILTER (WHERE sent_on <= $2::date), 0) AS units_to_end
      FROM del_units_day
      GROUP BY bill_no
    ),
    credit AS (
      SELECT rd.ref_doc_no AS bill_no, MIN(r.doc_date)::date AS credited_on
      FROM ic_trans_detail rd
      JOIN ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
      WHERE rd.ref_doc_no IN (SELECT doc_no FROM sale_bills)
      GROUP BY rd.ref_doc_no
    ),
    calc AS (
      SELECT sb.doc_no, sb.doc_date,
             (on_now.bill_no IS NOT NULL) AS is_outstanding,
             GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric AS net_total,
             CASE WHEN on_now.bill_no IS NOT NULL THEN NULL
                  ELSE dd.last_sent_end::date END AS completion_date,
             CASE WHEN on_now.bill_no IS NOT NULL THEN NULL
                  WHEN dd.last_sent_end IS NOT NULL THEN NULL
                  ELSE COALESCE(cr.credited_on, sb.doc_date) END AS closed_other_date,
             -- ບິນທີ່ຂຶ້ນຫຼາຍຖ້ຽວ ມັກມີແຖວສິນຄ້າ "ເຕັມໃບ" ຢູ່ທຸກຖ້ຽວ (delivered_qty
             -- ຍັງເປັນ 0 ຈຶ່ງຖອຍໄປໃຊ້ selected_qty = ຈຳນວນທີ່ຂຶ້ນລົດ). ບວກກົງໆ
             -- ຈະໄດ້ຫຼາຍກວ່າຈຳນວນໃນບິນ — ວັດປີ 2026: 547 ບິນ ເກີນ 194,085 ອັນ
             -- ແລ້ວດັນໃຫ້ ປິດອື່ນ ຕິດລົບ. ຈຶ່ງຫຍໍ້ຕາມສ່ວນໃຫ້ລວມບໍ່ເກີນຈຳນວນໃນບິນ.
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_in, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_in, 0) END)::numeric AS units_in,
             (CASE WHEN COALESCE(du.units_all, 0) > GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric
                    AND COALESCE(du.units_all, 0) > 0
                   THEN COALESCE(du.units_to_end, 0) * (GREATEST(COALESCE(bi.total_qty, 0) - COALESCE(rt.returned_qty, 0), 0)::numeric / du.units_all)
                   ELSE COALESCE(du.units_to_end, 0) END)::numeric AS units_to_end,
             COALESCE(bl.item_count, 0) AS item_count
      FROM sale_bills sb
      LEFT JOIN bill_items bi ON bi.bill_no = sb.doc_no
      LEFT JOIN bill_lines bl ON bl.bill_no = sb.doc_no
      LEFT JOIN returned rt ON rt.bill_no = sb.doc_no
      LEFT JOIN del_dates dd ON dd.bill_no = sb.doc_no
      LEFT JOIN del_units du ON du.bill_no = sb.doc_no
      LEFT JOIN outstanding on_now ON on_now.bill_no = sb.doc_no
      LEFT JOIN credit cr ON cr.bill_no = sb.doc_no
    )
    SELECT c.doc_no AS bill_no,
           to_char(c.doc_date, 'DD-MM-YYYY') AS doc_date,
           COALESCE(NULLIF(TRIM(cust.name_1), ''), NULLIF(TRIM(cc.cust_code), ''), '-') AS cust_name,
           ${customerAreaSql("cc.cust_code")} AS cust_area,
           COALESCE(NULLIF(TRIM(oe.fullname_lo), ''), NULLIF(TRIM(oe.nickname), ''), ic.sale_code, '') AS sale,
           -- ຕ້ອງເປັນສູດດຽວກັບ getReportDailyDepartment ບໍ່ດັ່ງນັ້ນຊ່ອງ
           -- "${UNASSIGNED_DEPARTMENT}" ກົດເບິ່ງແລ້ວບໍ່ມີແຖວ
           COALESCE(
             NULLIF(TRIM(od.department_name_lo), ''),
             NULLIF(TRIM(oe.department_code::text), ''),
             '${UNASSIGNED_DEPARTMENT}'
           ) AS department,
           ${bucketQty}::numeric AS qty,
           c.item_count,
           CASE WHEN c.completion_date BETWEEN $1::date AND $2::date
                THEN to_char(c.completion_date, 'DD-MM-YYYY')
                -- ມີເຄື່ອງອອກໃນຊ່ວງ ແຕ່ບິນຍັງບໍ່ປິດ = ທະຍອຍສົ່ງ. ບັດ "ຈັດສົ່ງ"
                -- ນັບຈຳນວນເຄື່ອງຂອງແຖວນີ້ ແຕ່ບໍ່ນັບເປັນບິນທີ່ປິດແລ້ວ.
                WHEN COALESCE(c.units_in, 0) > 0 AND c.completion_date IS NULL
                THEN 'ທະຍອຍສົ່ງ'
                WHEN c.completion_date IS NOT NULL
                THEN to_char(c.completion_date, 'DD-MM-YYYY')
                WHEN pb2.scheduled_date IS NOT NULL
                THEN 'ນັດ ' || to_char(pb2.scheduled_date, 'DD-MM-YYYY')
                ELSE '' END AS note
    FROM calc c
    -- ລູກຄ້າ: ເອົາຈາກໃບຂາຍກ່ອນ ແລະ ຖ້າບໍ່ມີ (ບິນໂອນ/ບິນນອກລະບົບ) ຈຶ່ງເອົາຈາກ TMS
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (SELECT NULLIF(TRIM(x.cust_code), '') FROM ic_trans_shipment x
          WHERE x.doc_no = c.doc_no AND x.trans_flag = 44 LIMIT 1),
        (SELECT NULLIF(TRIM(td.cust_code), '') FROM public.odg_tms_detail td
          WHERE td.bill_no = c.doc_no AND NULLIF(TRIM(td.cust_code), '') IS NOT NULL LIMIT 1)
      ) AS cust_code
    ) cc ON true
    LEFT JOIN LATERAL (
      SELECT x.sale_code FROM ic_trans x WHERE x.doc_no = c.doc_no ORDER BY x.doc_date LIMIT 1
    ) ic ON true
    LEFT JOIN public.odg_tms_pending_bill pb2 ON pb2.bill_no = c.doc_no
    LEFT JOIN ar_customer cust ON cust.code = cc.cust_code
    LEFT JOIN public.odg_employee oe ON oe.employee_code = ic.sale_code
    LEFT JOIN public.odg_department od ON od.department_code = oe.department_code
    WHERE (c.net_total > 0 OR c.is_outstanding)
      AND ${bucketWhere}
      ${dept ? `AND COALESCE(
             NULLIF(TRIM(od.department_name_lo), ''),
             NULLIF(TRIM(oe.department_code::text), ''),
             '${UNASSIGNED_DEPARTMENT}'
           ) = $4` : ""}
    ORDER BY ${orderCol}, c.doc_no`,
    params
  );
}

// Same three buckets as getReportDailyActivityBills, but exploded to one row
// per product line — what the dispatcher exports when they need to see the
// goods, not just the bill count.
async function getReportDailyActivityItems(session, fromDate, toDate, branchCode, bucket, department) {
  const bills = await getReportDailyActivityBills(session, fromDate, toDate, branchCode, bucket, department);
  const billNos = bills.map((b) => b.bill_no).filter(Boolean);
  if (billNos.length === 0) return [];
  const meta = new Map(bills.map((b) => [b.bill_no, b]));
  const rows = await query(
    `SELECT d.doc_no AS bill_no,
            d.item_code,
            MAX(d.item_name) AS item_name,
            SUM(COALESCE(d.qty, 0))::numeric AS qty,
            MAX(d.unit_code) AS unit_code
     FROM ic_trans_detail d
     WHERE d.doc_no = ANY($1::varchar[]) AND d.item_code NOT LIKE '97%'
     GROUP BY d.doc_no, d.item_code
     ORDER BY d.doc_no, d.item_code`,
    [billNos]
  );
  return rows.map((r) => {
    const b = meta.get(r.bill_no) ?? {};
    return {
      bill_no: r.bill_no,
      doc_date: b.doc_date ?? "",
      cust_name: b.cust_name ?? "",
      cust_area: b.cust_area ?? "",
      sale: b.sale ?? "",
      department: b.department ?? "",
      item_code: r.item_code,
      item_name: r.item_name,
      qty: Number(r.qty ?? 0),
      unit_code: r.unit_code ?? "",
      note: b.note ?? "",
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ລາຍງານປະສິດທິພາບການຈັດສົ່ງ (ຕໍ່ເດືອນ)
//
// ຕ່າງຈາກ getReportMonthlyDelivery ຢູ່ບ່ອນ: ອັນນີ້ຄິດເປັນ "ຍອດຍົກມາ →
// ເປີດໃນເດືອນ → ສົ່ງສຳເລັດ → ຍອດຍົກໄປ" ຄືບັນຊີ ແລະ ແຍກເວລານຳສົ່ງເປັນຊັ້ນ
// (≤24h / 24–48h / >48h) ແທນທີ່ຈະເປັນແຄ່ ທັນ/ບໍ່ທັນ.
//
// ສົມຜົນທີ່ຮັບປະກັນ: carry_in + opened − delivered = carry_out
// (ພິສູດໄດ້ຈາກນິຍາມ: ທຸກບິນທີ່ເປີດກ່ອນສິ້ນເດືອນ ຖືກແບ່ງເປັນ "ປິດແລ້ວກ່ອນ
// ຕົ້ນເດືອນ", "ປິດພາຍໃນເດືອນ" ຫຼື "ຍັງຄ້າງ" ໂດຍບໍ່ຊ້ອນກັນ)
//
// ຂໍ້ຕົກລົງທີ່ຕ້ອງຮູ້ກ່ອນອ່ານຕົວເລກ:
//  • ບິນ "ສຳເລັດ" = ມີຖ້ຽວທີ່ອະນຸມັດແລ້ວ ແລະ status=1 ຄັ້ງທຳອິດ (MIN(sent_end))
//    — ອັນດຽວກັບທີ່ getReportMonthlyDelivery ໃຊ້ ຈຶ່ງບໍ່ຂັດກັນລະຫວ່າງໜ້າ.
//    ບິນທະຍອຍສົ່ງຈຶ່ງນັບວ່າສຳເລັດຕັ້ງແຕ່ຖ້ຽວທຳອິດ ແລະ ຖືກລາຍງານແຍກຕ່າງຫາກ
//    ໃນ multi_leg_bills / short_bills.
//  • "ເວລາກຳນົດຈັດສົ່ງ" = odg_tms_pending_bill.scheduled_date (ນັດໂດຍຜູ້ຈັດ)
//    ຖ້າບໍ່ມີຈຶ່ງໃຊ້ date_logistic ຂອງຖ້ຽວທຳອິດ. ບໍ່ໃຊ້ ic_trans.send_date
//    ເພາະວັດແລ້ວ (2026-07: 2,288/2,288 ໃບ) ມັນເທົ່າກັບ doc_date ທຸກໃບ ຈຶ່ງເປັນ
//    ວັນເປີດບິນຊ້ຳ ບໍ່ແມ່ນວັນນັດ ແລະ ຈະເຮັດໃຫ້ 2 ຊຸດຕົວເລກຄືກັນໂດຍບໍ່ມີຄວາມໝາຍ.
//    ວັນນັດເປັນ "ວັນ" ບໍ່ແມ່ນ "ເວລາ" ຈຶ່ງທຽບຈາກ 00:00 ຂອງວັນນັ້ນ → ສົ່ງພາຍໃນ
//    ວັນທີ່ນັດ = ≤24h.
//  • scheduled_date ເກັບແຕ່ຄ່າຫຼ້າສຸດ: ບິນທີ່ຖືກເລື່ອນນັດຈະ "ທັນເວລາ" ຕາມນັດ
//    ໃໝ່ — ຈຶ່ງຕ້ອງອ່ານຄູ່ກັບ rescheduled_over_2.
//
// ⚠️ ຢ່າສ້າງກຸ່ມບິນຈາກ ic_trans_shipment.transport_code ຢ່າງດຽວ.
// ວັດຈາກຖານຂໍ້ມູນຈິງ (07/2026) ວິທີນັ້ນຫຼຸດບິນທີ່ສົ່ງສຳເລັດໄປ 452 ໃບ:
//   • 325 ໃບ ບໍ່ມີແຖວໃນ ic_trans_shipment ເລີຍ (ບິນມື/ບິນ custom/ບິນໂອນ)
//     ແຕ່ຖືກຈັດຖ້ຽວ ແລະ ສົ່ງສຳເລັດໂດຍ 3 ສາຂາ
//   • 91 ໃບ ລະຫັດໃນ shipment ເປັນ 02-0007 (ໂພນສະອາດ) ແຕ່ຜູ້ຈັດໂອນມາໃຫ້
//     ດອນຕິ້ວ/ໂອດ່ຽນ ຜ່ານ odg_tms_pending_bill.transport_code
//   • 34 ໃບ ເປັນ 02-0004 (ລູກຄ້າຮັບເອງ) / 02-0008 ໃນ ERP ແຕ່ຄວາມຈິງ 3 ສາຂາ
//     ເປັນຄົນສົ່ງ
// ຈຶ່ງສ້າງກຸ່ມຈາກ "ຝັ່ງການຈັດສົ່ງ" ແທນ: ສາຂາເຈົ້າຂອງບິນ = ສາຂາຂອງຖ້ຽວທີ່ສົ່ງ
// ສຳເລັດ (odg_tms.origin_transport_code) ຖ້າຍັງບໍ່ທັນຈັດຖ້ຽວຈຶ່ງໃຊ້ສາຂາທີ່
// ຜູ້ຈັດມອບໝາຍ (odg_tms_pending_bill.transport_code) ແລ້ວຈຶ່ງເປັນ shipment.
//
// ⚠️ ic_trans ມີ doc_no ຊ້ຳ (4,356 ໃບ ໃນປີ 2026 — ເອກະສານດຽວກັນ 2 trans_flag
// ເຊັ່ນ 70/72). LEFT JOIN ທຳມະດາຈະຄູນແຖວ ແລະ ດັນຍອດຂຶ້ນ (ວັດແລ້ວ +103 ໃບ
// ໃນເດືອນ 07). ຈຶ່ງດຶງດ້ວຍ LATERAL … LIMIT 1.
// ══════════════════════════════════════════════════════════════════════════
// ແຖວດິບ → ຮູບຮ່າງທີ່ໜ້າຈໍໃຊ້. ສົ່ງ null/undefined ມາ ໄດ້ bucket ສູນ.
function toPerfBucket(r) {
  const num = (value) => Number(value) || 0;
  return {
    carry_in: num(r?.carry_in),
    opened: num(r?.opened),
    delivered: num(r?.delivered),
    closed_other: num(r?.closed_other),
    carry_out: num(r?.carry_out),
    handled: num(r?.handled),
    /** ບິນທີ່ເປີດໃນຊ່ວງ ແລະ ຈົບພາຍໃນ 24 ຊມ — ຄູ່ກັບ opened ເປັນຕົວຫານ */
    opened_on_time_24h: num(r?.opened_on_time_24h),
    /** ບິນທີ່ເປີດໃນຊ່ວງ ແລະ ຍັງບໍ່ຮອດມືລູກຄ້າ */
    opened_pending: num(r?.opened_pending),
    from_open: {
      le_24h: num(r?.open_le24),
      h24_48: num(r?.open_24_48),
      gt_48h: num(r?.open_gt48),
    },
    from_schedule: {
      le_24h: num(r?.sched_le24),
      h24_48: num(r?.sched_24_48),
      gt_48h: num(r?.sched_gt48),
      no_schedule: num(r?.sched_none),
    },
    rescheduled_over_2: num(r?.rescheduled_over_2),
    jumped: { d1: num(r?.jumped_1d), d3: num(r?.jumped_3d), d7: num(r?.jumped_7d) },
    jumped_ready: {
      d1: num(r?.jumped_ready_1d),
      d3: num(r?.jumped_ready_3d),
      d7: num(r?.jumped_ready_7d),
    },
    multi_leg_bills: num(r?.multi_leg_bills),
    short_bills: num(r?.short_bills),
    cancelled_bills: num(r?.cancelled_bills),
    cancelled_legs: num(r?.cancelled_legs),
    avg_lead_open_h: r?.avg_lead_open_h == null ? null : Number(r.avg_lead_open_h),
    median_lead_open_h: r?.median_lead_open_h == null ? null : Number(r.median_lead_open_h),
  };
}

function emptyPerfBucket() {
  return toPerfBucket(null);
}

/**
 * ເລກບິນທີ່ "ສິນຄ້າຍັງບໍ່ຮອດມືລູກຄ້າ" ໃນຂະນະນີ້.
 *
 * ⚠️ ຢ່າຂຽນກົດນີ້ຂຶ້ນມາໃໝ່ໃນ SQL. ກົດຈິງມີຫຼາຍຊັ້ນ (check_status ຂອງ ERP,
 * ຈຳນວນຄົງເຫຼືອຫຼັງຫັກຂອງທີ່ lock ຢູ່ຖ້ຽວ, ໃບຫຼຸດໜີ້, ບິນບໍລິການທີ່ສົ່ງຊ້ຳໄດ້,
 * ບິນສົ່ງຕໍ່ສາຂາ) ແລະ ການຂຽນຄືນເຮັດໃຫ້ຍອດເກີນຄວາມຈິງເຖິງ 3 ເທົ່າ (207 ທຽບກັບ
 * 63 ທີ່ຖືກຕ້ອງ ວັດເມື່ອ 06/08/2026). ຈຶ່ງເອີ້ນໃຊ້ຟັງຊັນທີ່ໜ້າຈໍໃຊ້ຢູ່ແທ້ໆ:
 *
 *   ບິນລໍຈັດຖ້ຽວ (getBillsPending) ∪ ບິນທີ່ຢູ່ເທິງຖ້ຽວທີ່ຍັງບໍ່ຈົບ
 *
 * ຜົນຄື ຍອດຄົງເຫຼືອຂອງເດືອນປັດຈຸບັນຈະຕົງກັບໜ້າ /bills-pending ແລະ
 * /bills-inprogress ສະເໝີ ໂດຍບໍ່ມີທາງແຕກຕ່າງ.
 */
async function getOutstandingBillNos() {
  const { getBillsPending } = require("./bills");
  const { FIXED_YEAR_START, FIXED_YEAR_END } = require("../lib/fixed-year");
  const [pending, onTripRows] = await Promise.all([
    // ບໍ່ສົ່ງ session ໄປ — ຕ້ອງການທັງ 3 ສາຂາ ແລ້ວຄ່ອຍແບ່ງສາຂາດ້ວຍກົດຂອງລາຍງານເອງ
    getBillsPending({}, FIXED_YEAR_START, FIXED_YEAR_END, "all"),
    // ບິນທີ່ຢູ່ເທິງຖ້ຽວທີ່ຍັງບໍ່ຈົບ (ລໍອອກລົດ ຫຼື ກຳລັງສົ່ງ) — ຍັງບໍ່ຮອດມືລູກຄ້າ
    // ແຕ່ບໍ່ຂຶ້ນໜ້າ "ບິນລໍຈັດຖ້ຽວ" ເພາະຖືກຈັດຖ້ຽວແລ້ວ
    query(
      `SELECT DISTINCT d.bill_no
         FROM public.odg_tms_detail d
         JOIN public.odg_tms j ON j.doc_no = d.doc_no
        WHERE COALESCE(d.status, 0) NOT IN (1, 2)
          AND COALESCE(j.approve_status, 0) = 1
          AND COALESCE(j.job_status, 0) <> 4
          AND ${getFixedYearSqlFilter("d.doc_date")}`
    ),
  ]);
  const set = new Set();
  for (const bill of pending.trans ?? []) if (bill?.doc_no) set.add(String(bill.doc_no));
  for (const row of onTripRows) if (row?.bill_no) set.add(String(row.bill_no));
  return Array.from(set);
}

/**
 * ຂອບເວລາຂອງລາຍງານ — ຮັບໄດ້ 2 ແບບ ເພື່ອໃຫ້ 2 ໜ້າໃຊ້ query ອັນດຽວກັນ:
 *   "YYYY-MM"     ໜຶ່ງເດືອນເຕັມ (ໜ້າ /reports/delivery-performance, Dashboard)
 *   { from, to }  ຊ່ວງວັນທີ ລວມວັນທ້າຍ (ໜ້າ /reports/bi)
 */
function deliveryPeriodBounds(period) {
  if (period && typeof period === "object" && period.from && period.to) {
    const from = String(period.from).slice(0, 10);
    const to = String(period.to).slice(0, 10);
    return { start: from, next: addDays(to, 1), from, to, label: `${from}..${to}` };
  }
  const month = String(period ?? "");
  const next = getNextMonthStart(month);
  return { start: `${month}-01`, next, from: `${month}-01`, to: addDays(next, -1), label: month };
}

async function getDeliveryPerformance(session, period) {
  const scope = getBranchScope(session);
  const bounds = deliveryPeriodBounds(period);
  const monthStart = bounds.start;
  const nextMonthStart = bounds.next;
  // ຜູ້ໃຊ້ທີ່ຜູກກັບສາຂາ ເຫັນສະເພາະສາຂາຕົນ ແຕ່ບໍ່ເກີນ 3 ສາຂາ KPI
  const visibleBranches = scope.scoped
    ? MONTHLY_DELIVERY_BRANCH_CODES.filter((code) => scope.branches.includes(code))
    : MONTHLY_DELIVERY_BRANCH_CODES;
  if (visibleBranches.length === 0) {
    return {
      month: bounds.label,
      from: bounds.from,
      to: bounds.to,
      overall: emptyPerfBucket(),
      branches: [],
      departments: [],
    };
  }
  const branchCodeSql = visibleBranches.map((code) => `'${code}'`).join(",");
  const yearFilter = getFixedYearSqlFilter("d.doc_date");
  const outstandingNow = await getOutstandingBillNos();

  const rows = await query(
    `WITH params AS (
       SELECT $1::timestamp AS month_start, $2::timestamp AS next_month_start
     ),
     -- (ກ) ບິນທີ່ຖືກຈັດຖ້ຽວແລ້ວ — ຍຸບ "ຖ້ຽວ × ບິນ" ເປັນລະດັບບິນ ຄັ້ງດຽວທັງປີ.
     -- trip_branch = ສາຂາຂອງຖ້ຽວທີ່ສົ່ງສຳເລັດເປັນຄັ້ງທຳອິດ ຖ້າຍັງບໍ່ສຳເລັດ
     -- ຈຶ່ງເອົາສາຂາຂອງຖ້ຽວລ່າສຸດ.
     legs AS (
       SELECT d.bill_no,
         COUNT(*) FILTER (WHERE d.status = 1 AND d.sent_end IS NOT NULL)::int AS success_legs,
         COUNT(*) FILTER (
           WHERE COALESCE(d.status, 0) = 2
             AND COALESCE(d.sent_end, d.create_date_time_now) >= p.month_start
             AND COALESCE(d.sent_end, d.create_date_time_now) < p.next_month_start
         )::int AS cancelled_legs_in_month,
         MIN(d.sent_end) FILTER (WHERE d.status = 1) AS first_delivered_at,
         -- ບິນທະຍອຍສົ່ງ "ຮອດມືລູກຄ້າ" ຕອນຖ້ຽວສຸດທ້າຍ ບໍ່ແມ່ນຖ້ຽວທຳອິດ
         MAX(d.sent_end) FILTER (WHERE d.status = 1) AS last_delivered_at,
         MIN(d.date_logistic) AS first_logistic_date,
         MIN(d.doc_date) AS first_trip_date,
         COALESCE(
           (array_agg(j.origin_transport_code ORDER BY d.sent_end ASC NULLS LAST)
             FILTER (WHERE d.status = 1 AND NULLIF(TRIM(j.origin_transport_code), '') IS NOT NULL))[1],
           (array_agg(j.origin_transport_code ORDER BY d.create_date_time_now DESC)
             FILTER (WHERE NULLIF(TRIM(j.origin_transport_code), '') IS NOT NULL))[1]
         ) AS trip_branch
       FROM public.odg_tms_detail d
       JOIN public.odg_tms j ON j.doc_no = d.doc_no
       CROSS JOIN params p
       WHERE COALESCE(j.approve_status, 0) = 1
         AND ${yearFilter}
       GROUP BY d.bill_no
     ),
     -- (ຂ) ບິນຂາຍທີ່ມອບໝາຍໃຫ້ສາຂາ ແຕ່ຍັງບໍ່ທັນຖືກຈັດຖ້ຽວ — ຕ້ອງມີເພື່ອໃຫ້
     -- ຍອດຄ້າງ (carry_in / carry_out) ຄົບ. trans_flag=44 = ບິນຂາຍ, ອັນດຽວກັບ
     -- ທີ່ໜ້າ /bills-pending ໃຊ້ (ຕັດ RWSO/SRH ທີ່ບໍ່ແມ່ນວຽກຈັດສົ່ງອອກ).
     assigned AS (
       SELECT s.doc_no AS bill_no,
         COALESCE(NULLIF(TRIM(pb.transport_code), ''), NULLIF(TRIM(s.transport_code), '')) AS assigned_branch
       FROM public.ic_trans_shipment s
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = s.doc_no
       WHERE ${getFixedYearSqlFilter("s.doc_date")} AND s.trans_flag = 44
     ),
     bills AS (
       SELECT COALESCE(a.bill_no, lg.bill_no) AS bill_no,
         COALESCE(NULLIF(TRIM(lg.trip_branch), ''), a.assigned_branch) AS branch_code,
         lg.success_legs, lg.cancelled_legs_in_month, lg.first_delivered_at,
         lg.last_delivered_at, lg.first_logistic_date, lg.first_trip_date
       FROM assigned a
       FULL JOIN legs lg ON lg.bill_no = a.bill_no
     ),
     -- ບິນທີ່ "ຍັງບໍ່ຮອດມືລູກຄ້າ" ໃນຂະນະນີ້ — ມາຈາກຟັງຊັນທີ່ໜ້າຈໍໃຊ້ຢູ່
     -- (ເບິ່ງ getOutstandingBillNos) ບໍ່ແມ່ນກົດທີ່ຂຽນຄືນຢູ່ນີ້
     outstanding_now AS (
       SELECT DISTINCT o.bill_no FROM unnest($3::varchar[]) AS o(bill_no)
     ),
     -- ຈຳນວນຄັ້ງທີ່ "ວັນນັດ" ຖືກປ່ຽນຈິງ (ບໍ່ນັບຄັ້ງທຳອິດທີ່ຕັ້ງຄ່າ NULL → ວັນ)
     resched AS (
       SELECT bill_no,
         COUNT(*) FILTER (
           WHERE scheduled_date IS NOT NULL
             AND prev_date IS NOT NULL
             AND scheduled_date IS DISTINCT FROM prev_date
         )::int AS reschedule_count
       FROM (
         SELECT bill_no, scheduled_date,
           LAG(scheduled_date) OVER (PARTITION BY bill_no ORDER BY changed_at, id) AS prev_date
         FROM public.odg_tms_pending_bill_history
       ) h
       GROUP BY bill_no
     ),
     -- ບິນທີ່ປິດງານແລ້ວແຕ່ຈຳນວນສົ່ງ + ຈຳນວນຄືນສາງ ຍັງໜ້ອຍກວ່າທີ່ເບີກ
     -- (ນິຍາມດຽວກັນກັບໜ້າ /bills-partial)
     short_bills AS (
       SELECT i.bill_no
       FROM public.odg_tms_detail_item i
       JOIN public.odg_tms_detail d ON d.doc_no = i.doc_no AND d.bill_no = i.bill_no
       WHERE COALESCE(d.status, 0) = 1 AND ${yearFilter}
       GROUP BY i.bill_no
       HAVING SUM(COALESCE(i.delivered_qty, 0)) + SUM(COALESCE(i.returned_qty, 0))
            < SUM(COALESCE(i.selected_qty, 0))
     ),
     pool AS (
       SELECT
         b.bill_no,
         b.branch_code,
         -- ພະແນກເອົາຈາກທະບຽນຂອງ TMS (odg_employee → odg_department) ບ່ອນດຽວກັບ
         -- ລາຍງານ "ປະຈຳວັນ/ພະແນກ" ຈຶ່ງໄດ້ຊື່ ແລະ ສາຍງານ (division) ຊຸດດຽວກັນ.
         -- ຝ່າຍ ERP (erp_user/erp_department_list) ໃຫ້ພະແນກທີ່ບໍ່ແມ່ນຝ່າຍຂາຍ
         -- ນຳ (ບັນຊີ, HR) ເຊິ່ງບໍ່ແມ່ນເຈົ້າຂອງບິນຂົນສົ່ງ.
         COALESCE(NULLIF(TRIM(oe.department_code::text), ''), 'unknown') AS department_code,
         COALESCE(
           NULLIF(TRIM(od.department_name_lo::text), ''),
           NULLIF(TRIM(oe.department_code::text), ''),
           'ບໍ່ລະບຸພະແນກ'
         ) AS department_name,
         COALESCE(NULLIF(TRIM(od.division_code::text), ''), '') AS division_code,
         -- ເວລາເປີດບິນ: ic_trans (ເວລາລາວ) → ວັນທີ shipment → ວັນສ້າງບິນມື
         -- → ວັນຂອງຖ້ຽວທຳອິດ (ບິນໂອນທີ່ບໍ່ມີເອກະສານ ERP ເລີຍ)
         COALESCE(
           ${BILL_OPENED_AT},
           s.doc_date::timestamp,
           cb.created_at,
           b.first_trip_date::timestamp
         ) AS opened_at,
         -- ບິນທີ່ຍັງຄ້າງຢູ່ຕອນນີ້ = ຍັງບໍ່ອອກຈາກຍອດ ຈຶ່ງບໍ່ມີວັນສຳເລັດ/ວັນຫຼຸດອອກ.
         -- ບິນທີ່ອອກໄປແລ້ວ ຈຶ່ງລົງວັນທີວ່າອອກຕອນໃດ:
         --   ມີຖ້ຽວສົ່ງສຳເລັດ → ວັນຖ້ຽວສຸດທ້າຍ (ບິນທະຍອຍສົ່ງນັບຕອນຄົບ)
         CASE
           WHEN on_now.bill_no IS NOT NULL THEN NULL
           ELSE b.last_delivered_at
         END AS completed_at,
         -- ບໍ່ມີຖ້ຽວສົ່ງສຳເລັດເລີຍ ແຕ່ອອກຈາກຍອດແລ້ວ (ຄືນຜ່ານໃບຫຼຸດໜີ້ ຫຼື
         -- ຖືກປິດຢູ່ ERP) → ວັນໃບຫຼຸດໜີ້ ຖ້າບໍ່ມີຈຶ່ງນັບແຕ່ວັນເປີດບິນ ເພາະ ERP
         -- ບໍ່ເກັບປະຫວັດການປິດບິນ ຈຶ່ງບອກວັນທີ່ແທ້ບໍ່ໄດ້
         CASE
           WHEN on_now.bill_no IS NOT NULL THEN NULL
           WHEN b.last_delivered_at IS NOT NULL THEN NULL
           ELSE COALESCE(cr.credited_on::timestamp, ${BILL_OPENED_AT}, s.doc_date::timestamp)
         END AS closed_other_at,
         -- ວັນນັດ = ນັດຄັ້ງທຳອິດກ່ອນ (ນິຍາມກາງ firstPromiseSql) ບໍ່ດັ່ງນັ້ນບິນທີ່
         -- ຖືກເລື່ອນນັດຈະນັບເປັນ "ທັນເວລາ" ຕາມນັດໃໝ່ສະເໝີ ແລ້ວເປີເຊັນຢູ່ໜ້ານີ້
         -- ຈະສູງກວ່າໜ້າຫຼັກ/BI ທັງທີ່ວັດເລື່ອງດຽວກັນ.
         COALESCE(
           ${firstPromiseSql("b.bill_no")}::timestamp,
           pb.scheduled_date::timestamp,
           b.first_logistic_date::timestamp
         ) AS scheduled_at,
         COALESCE(NULLIF(TRIM(pb.action_status), ''), '') AS action_status,
         COALESCE(b.success_legs, 0) AS success_legs,
         COALESCE(b.cancelled_legs_in_month, 0) AS cancelled_legs_in_month,
         COALESCE(rs.reschedule_count, 0) AS reschedule_count,
         (sb.bill_no IS NOT NULL) AS is_short
       FROM bills b
       LEFT JOIN outstanding_now on_now ON on_now.bill_no = b.bill_no
       LEFT JOIN LATERAL (
         SELECT MIN(r.doc_date) AS credited_on
         FROM public.ic_trans_detail rd
         JOIN public.ic_trans r ON r.doc_no = rd.doc_no AND r.trans_flag = 48
         WHERE rd.ref_doc_no = b.bill_no
       ) cr ON true
       -- LATERAL … LIMIT 1: ic_trans ມີ doc_no ຊ້ຳ (ເບິ່ງໝາຍເຫດຫົວຟັງຊັນ)
       LEFT JOIN LATERAL (
         SELECT tt.doc_date, tt.doc_time, tt.sale_code FROM public.ic_trans tt
         WHERE tt.doc_no = b.bill_no ORDER BY tt.doc_date, tt.doc_time LIMIT 1
       ) t ON true
       -- ພະແນກຂອງພະນັກງານຂາຍທີ່ເປີດບິນ (ນິຍາມດຽວກັບ KPI ບໍລິຫານການຈັດສົ່ງ)
       LEFT JOIN public.odg_employee oe ON oe.employee_code = t.sale_code
       LEFT JOIN public.odg_department od ON od.department_code = oe.department_code
       LEFT JOIN public.ic_trans_shipment s ON s.doc_no = b.bill_no
       LEFT JOIN public.odg_tms_custom_bill cb ON cb.bill_no = b.bill_no
       LEFT JOIN resched rs ON rs.bill_no = b.bill_no
       LEFT JOIN short_bills sb ON sb.bill_no = b.bill_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = b.bill_no
       WHERE b.branch_code IN (${branchCodeSql})
     ),
     flagged AS (
       -- ບິນອອກຈາກຍອດຄ້າງດ້ວຍ 2 ທາງເທົ່ານັ້ນ ແລະ ບໍ່ຊ້ອນກັນ: ສົ່ງສຳເລັດ
       -- (completed_at) ຫຼື ຫຼຸດອອກ (closed_other_at) ຈຶ່ງໄດ້ສົມຜົນ
       -- carry_in + opened − delivered − closed_other = carry_out
       SELECT pool.*,
         (opened_at < p.month_start
            AND (completed_at IS NULL OR completed_at >= p.month_start)
            AND (closed_other_at IS NULL OR closed_other_at >= p.month_start)) AS is_carry_in,
         (opened_at >= p.month_start) AS is_opened,
         (completed_at IS NOT NULL AND completed_at >= p.month_start
            AND completed_at < p.next_month_start) AS is_delivered,
         (completed_at IS NULL AND closed_other_at IS NOT NULL
            AND closed_other_at >= p.month_start
            AND closed_other_at < p.next_month_start) AS is_closed_other,
         ((completed_at IS NULL OR completed_at >= p.next_month_start)
            AND (closed_other_at IS NULL OR closed_other_at >= p.next_month_start)) AS is_carry_out,
         EXTRACT(EPOCH FROM (completed_at - opened_at)) / 3600.0 AS lead_open_h,
         EXTRACT(EPOCH FROM (completed_at - scheduled_at)) / 3600.0 AS lead_sched_h,
         p.next_month_start
       FROM pool CROSS JOIN params p
       -- ບິນທີ່ຍັງບໍ່ເປີດກ່ອນສິ້ນເດືອນ ບໍ່ຢູ່ໃນຍອດຂອງເດືອນນີ້
       WHERE opened_at IS NOT NULL AND opened_at < p.next_month_start
     ),
     -- ບິນທີ່ຖືກລັດຄິວ: ມີບິນທີ່ "ເປີດຫຼັງ" (ສາຂາດຽວກັນ) ຖືກສົ່ງໄປກ່ອນແລ້ວ.
     -- min_done_newer = ເວລາສົ່ງສຳເລັດທຳອິດ ໃນບັນດາບິນທີ່ເປີດຫຼັງບິນນີ້.
     -- ORDER BY opened_at DESC ຈຶ່ງ "ແຖວກ່ອນໜ້າ" = ບິນທີ່ເປີດຫຼັງ.
     --
     -- ⚠️ ຕ້ອງເປັນ ROWS ບໍ່ແມ່ນ RANGE … EXCLUDE GROUP: ວັດແລ້ວ EXCLUDE GROUP
     -- ບັງຄັບໃຫ້ Postgres ຄິດ MIN ຄືນໃໝ່ທຸກແຖວ (O(n²)) ເຮັດໃຫ້ຄຳຂໍນີ້ໃຊ້ເວລາ
     -- 110 ວິນາທີ. ROWS ຄິດແບບສະສົມ O(n) ເຫຼືອ ~2 ວິ. ຜົນຕ່າງມີສະເພາະບິນທີ່
     -- ເປີດວິນາທີດຽວກັນເປັນເປະ ເຊິ່ງບໍ່ມີຜົນຕໍ່ຕົວເລກລວມ.
     queued AS (
       SELECT f.*,
         -- ວັນທີ່ເປີດບິນ — ໃຫ້ໜ້າຈໍແຈກແຈງເປັນລາຍວັນໄດ້ໂດຍບໍ່ຕ້ອງຄິດສູດຊ້ຳ
         CASE WHEN f.is_opened THEN f.opened_at::date END AS opened_day,
         MIN(completed_at) OVER (
           PARTITION BY branch_code ORDER BY opened_at DESC, bill_no
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS min_done_newer,
         -- ຈຸດອ້າງອີງເວລາ: ບິນທີ່ສົ່ງແລ້ວໃຊ້ເວລາສົ່ງ, ບິນທີ່ຍັງຄ້າງໃຊ້ສິ້ນເດືອນ
         LEAST(COALESCE(completed_at, next_month_start), next_month_start) AS ref_at
       FROM flagged f
     )
     SELECT
       CASE
         WHEN GROUPING(branch_code) = 0 THEN 'branch'
         WHEN GROUPING(department_code) = 0 THEN 'department'
         WHEN GROUPING(opened_day) = 0 THEN 'day'
         ELSE 'overall'
       END AS dimension,
       branch_code,
       department_code,
       to_char(opened_day, 'YYYY-MM-DD') AS opened_day,
       MAX(department_name) AS department_name,
       MAX(division_code) AS division_code,
       COUNT(*) FILTER (WHERE is_carry_in)::int AS carry_in,
       COUNT(*) FILTER (WHERE is_opened)::int AS opened,
       COUNT(*) FILTER (WHERE is_delivered)::int AS delivered,
       COUNT(*) FILTER (WHERE is_closed_other)::int AS closed_other,
       COUNT(*) FILTER (WHERE is_carry_out)::int AS carry_out,
       COUNT(*) FILTER (WHERE is_carry_in OR is_opened)::int AS handled,
       -- ບິນທີ່ "ເປີດໃນເດືອນ" ແລະ ສົ່ງຈົບພາຍໃນ 24 ຊມ ນັບແຕ່ເປີດບິນ — ໃຊ້ເປັນ
       -- ຕົວເສດຂອງ KPI ຢູ່ໜ້າ ລາຍງານປະຈຳເດືອນ ເຊິ່ງມີຕົວຫານເປັນ opened.
       -- ຕ້ອງມາຈາກຊຸດຂໍ້ມູນດຽວກັບ opened ບໍ່ດັ່ງນັ້ນອັດຕາຈະຕໍ່າກວ່າຄວາມຈິງ.
       COUNT(*) FILTER (WHERE is_opened AND lead_open_h IS NOT NULL AND lead_open_h <= 24)::int
         AS opened_on_time_24h,
       -- ບິນທີ່ເປີດໃນຊ່ວງ ແລະ ຍັງບໍ່ຮອດມືລູກຄ້າ — ຄູ່ກັບ opened ຄືກັນ
       COUNT(*) FILTER (WHERE is_opened AND completed_at IS NULL)::int AS opened_pending,
       COUNT(*) FILTER (WHERE is_delivered AND lead_open_h <= 24)::int AS open_le24,
       COUNT(*) FILTER (WHERE is_delivered AND lead_open_h > 24 AND lead_open_h <= 48)::int AS open_24_48,
       COUNT(*) FILTER (WHERE is_delivered AND lead_open_h > 48)::int AS open_gt48,
       COUNT(*) FILTER (WHERE is_delivered AND scheduled_at IS NOT NULL AND lead_sched_h <= 24)::int AS sched_le24,
       COUNT(*) FILTER (WHERE is_delivered AND scheduled_at IS NOT NULL AND lead_sched_h > 24 AND lead_sched_h <= 48)::int AS sched_24_48,
       COUNT(*) FILTER (WHERE is_delivered AND scheduled_at IS NOT NULL AND lead_sched_h > 48)::int AS sched_gt48,
       COUNT(*) FILTER (WHERE is_delivered AND scheduled_at IS NULL)::int AS sched_none,
       COUNT(*) FILTER (WHERE (is_carry_in OR is_opened) AND reschedule_count > 2)::int AS rescheduled_over_2,
       COUNT(*) FILTER (WHERE (is_carry_in OR is_opened) AND success_legs >= 2)::int AS multi_leg_bills,
       COUNT(*) FILTER (WHERE (is_carry_in OR is_opened) AND is_short)::int AS short_bills,
       -- ບິນທີ່ຖືກລັດຄິວ ຕາມເກນ N ວັນ (ບິນທີ່ເປີດຫຼັງ ຖືກສົ່ງກ່ອນເກີນ N ວັນ)
       COUNT(*) FILTER (
         WHERE (is_carry_in OR is_opened) AND min_done_newer IS NOT NULL
           AND min_done_newer + INTERVAL '1 day' < ref_at
       )::int AS jumped_1d,
       COUNT(*) FILTER (
         WHERE (is_carry_in OR is_opened) AND min_done_newer IS NOT NULL
           AND min_done_newer + INTERVAL '3 days' < ref_at
       )::int AS jumped_3d,
       COUNT(*) FILTER (
         WHERE (is_carry_in OR is_opened) AND min_done_newer IS NOT NULL
           AND min_done_newer + INTERVAL '7 days' < ref_at
       )::int AS jumped_7d,
       -- ສະເພາະບິນທີ່ຜູ້ຈັດໝາຍວ່າ "ຕິດຕໍ່ແລ້ວ/ພ້ອມສົ່ງ" ແຕ່ຍັງຖືກຂ້າມ
       COUNT(*) FILTER (
         WHERE (is_carry_in OR is_opened) AND action_status = 'contacted_ready'
           AND min_done_newer IS NOT NULL AND min_done_newer + INTERVAL '1 day' < ref_at
       )::int AS jumped_ready_1d,
       COUNT(*) FILTER (
         WHERE (is_carry_in OR is_opened) AND action_status = 'contacted_ready'
           AND min_done_newer IS NOT NULL AND min_done_newer + INTERVAL '3 days' < ref_at
       )::int AS jumped_ready_3d,
       COUNT(*) FILTER (
         WHERE (is_carry_in OR is_opened) AND action_status = 'contacted_ready'
           AND min_done_newer IS NOT NULL AND min_done_newer + INTERVAL '7 days' < ref_at
       )::int AS jumped_ready_7d,
       COUNT(*) FILTER (WHERE (is_carry_in OR is_opened) AND cancelled_legs_in_month > 0)::int AS cancelled_bills,
       COALESCE(SUM(cancelled_legs_in_month) FILTER (WHERE is_carry_in OR is_opened), 0)::int AS cancelled_legs,
       ROUND(AVG(lead_open_h) FILTER (WHERE is_delivered)::numeric, 2) AS avg_lead_open_h,
       ROUND(
         percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_open_h)
           FILTER (WHERE is_delivered)::numeric, 2
       ) AS median_lead_open_h
     FROM queued
     GROUP BY GROUPING SETS ((), (branch_code), (department_code), (opened_day))`,
    [monthStart, nextMonthStart, outstandingNow]
  );

  const branchNameRows = await query(
    `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name
     FROM transport_type
     WHERE code = ANY($1::text[])`,
    [MONTHLY_DELIVERY_BRANCH_CODES]
  );
  // ຊື່ຈາກ transport_type ມາກ່ອນ (02-0001 = "ຂົນສົ່ງໂອດ່ຽນ" ຕາມທີ່ຜູ້ໃຊ້ເອີ້ນ);
  // ຄ່າ hard-code ເປັນພຽງຕົວສຳຮອງເມື່ອຕາຕະລາງບໍ່ມີຊື່
  const branchNames = {
    ...MONTHLY_DELIVERY_BRANCH_NAMES,
    ...Object.fromEntries(branchNameRows.map((r) => [r.code, r.name])),
  };

  const overallRow = rows.find((r) => r.dimension === "overall");
  const branches = rows
    .filter((r) => r.dimension === "branch")
    .map((r) => {
      const code = String(r.branch_code || "").trim() || "unknown";
      return {
        branch_code: code,
        branch_name: branchNames[code] || code || "ບໍ່ລະບຸສາຂາ",
        ...toPerfBucket(r),
      };
    })
    .sort((a, b) => a.branch_code.localeCompare(b.branch_code));

  const departments = rows
    .filter((r) => r.dimension === "department")
    .map((r) => ({
      department_code: String(r.department_code || "").trim() || "unknown",
      department_name: String(r.department_name || "").trim() || "ບໍ່ລະບຸພະແນກ",
      // '200' = ສາຍງານຂາຍ — ພະແນກນອກສາຍນີ້ (ບັນຊີ, HR, ໄອທີ) ເປີດບິນໄດ້ແຕ່
      // ບໍ່ແມ່ນເຈົ້າຂອງວຽກຂົນສົ່ງ ຈຶ່ງໃຫ້ໜ້າຈໍເລືອກເອົາເອງວ່າຈະສະແດງບໍ່
      is_sales: String(r.division_code || "").trim() === "200",
      ...toPerfBucket(r),
    }))
    // ພະແນກທີ່ຮັບຜິດຊອບບິນຫຼາຍສຸດຂຶ້ນກ່ອນ
    .sort((a, b) => b.handled - a.handled || a.department_name.localeCompare(b.department_name));

  // ລາຍວັນ — ບິນທີ່ເປີດໃນແຕ່ລະວັນ ແລະ ສະຖານະຂອງມັນ. ດຶງມາຈາກບັນຊີດຽວກັນ
  // ຈຶ່ງບວກໄດ້ເທົ່າ opened ຂອງທັງເດືອນສະເໝີ.
  const daily = rows
    .filter((r) => r.dimension === "day" && r.opened_day)
    .map((r) => ({
      day: String(r.opened_day),
      day_label: `${String(r.opened_day).slice(8, 10)}/${String(r.opened_day).slice(5, 7)}`,
      opened: Number(r.opened) || 0,
      delivered: Number(r.delivered) || 0,
      pending: Math.max((Number(r.opened) || 0) - (Number(r.delivered) || 0), 0),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    month: bounds.label,
    from: bounds.from,
    to: bounds.to,
    daily,
    overall: toPerfBucket(overallRow),
    branches,
    departments,
  };
}

module.exports = {
  getReportDaily,
  getReportByDriver,
  getReportByCar,
  getReportByBill,
  getReportByTrip,
  getReportTripBills,
  getReportMonthlyCar,
  getReportMonthlyDriver,
  getReportMonthlyDelivery,
  getMonthlyDeliveryKpi,
  getDeliveryPerformance,
  getReportPendingDaily,
  getReportDeliveredDaily,
  getReportCancelledDaily,
  getReportDailyActivity,
  getReportDailyActivityBills,
  getReportDailyActivityItems,
  getReportDailyDepartment,
  getAttemptDeliveryItems,
};

const { query, queryOne } = require("../lib/db");
const {
  getFixedTodayDate,
  getFixedYearSqlFilter,
  FIXED_YEAR_START,
  FIXED_YEAR_END,
} = require("../lib/fixed-year");
const { getBillsPending } = require("./bills");
const { getDistanceMap } = require("./trip-distance");

// A wall-mounted screen polls every ~15s and several screens may hang in
// different rooms. Cache the whole payload briefly so N screens cost one set of
// queries, not N — the numbers are only ever "as of a few seconds ago" anyway.
const TV_CACHE_TTL_MS = 10_000;
const tvCache = new Map();

// The same status wording the web daily report uses. Two screens in one office
// must not name the same trip differently.
const TRIP_STATUS_SQL = `CASE
    WHEN COALESCE(t.approve_status,0) = 0 THEN 'ລໍຖ້າອະນຸມັດ'
    WHEN COALESCE(t.job_status,0) = 0 THEN 'ລໍຖ້າຈັດສົ່ງ'
    WHEN COALESCE(t.job_status,0) = 1 THEN 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ'
    WHEN COALESCE(t.job_status,0) = 2 THEN 'ກຳລັງຈັດສົ່ງ'
    WHEN COALESCE(t.job_status,0) = 3 THEN 'ຄົນຂັບປິດງານ'
    ELSE 'admin ປິດຖ້ຽວ'
  END`;

// A trip that has not closed a bill in this long is drifting; the screen turns
// it amber so the dispatcher notices without being told.
const STALL_MINUTES = 90;
// Vehicle GPS older than this means the tracker stopped reporting.
const GPS_STALE_MINUTES = 45;

// ຈໍນີ້ແມ່ນ monitor ວຽກປະຈຳວັນ ບໍ່ແມ່ນລາຍງານໜີ້ສະສົມ. ບິນທີ່ຊ້າເກີນ
// ຂອບເຂດນີ້ຖືວ່າເປັນໜີ້ເກົ່າ ບໍ່ແມ່ນວຽກທີ່ໄລ່ຕາມໄດ້ໃນມື້ນີ້ ຈຶ່ງແຍກອອກ
// ບໍ່ໃຫ້ມັນກົບຕົວເລກທີ່ຕ້ອງເຮັດ.
const CHASE_DAYS = 7;

// KPI: ບິນຕ້ອງຮອດມືລູກຄ້າພາຍໃນ 24 ຊົ່ວໂມງນັບແຕ່ວັນທີ່ຄວນສົ່ງ.
const KPI_HOURS = 24;

// ຈໍນີ້ຕິດຢູ່ຫ້ອງຈັດສົ່ງດອນຕິ້ວ ຈຶ່ງເບິ່ງສາຂາດຽວ. ຢາກເບິ່ງສາຂາອື່ນໃສ່
// ?branch=02-0001 (ໂອດ່ຽນ) ຫຼື ?branch=02-0003 (ປາກເຊ).
const DEFAULT_BRANCH = "02-0002";

async function getTvDashboard({ date = "", branch = "" } = {}) {
  const day = date || getFixedTodayDate();
  const branchCode = String(branch || DEFAULT_BRANCH).trim();
  const cacheKey = `${day}|${branchCode}`;
  const hit = tvCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TV_CACHE_TTL_MS) return hit.value;

  const params = [day];
  let branchClause = "";
  if (branchCode) {
    params.push(branchCode);
    branchClause = ` AND t.origin_transport_code = $${params.length}`;
  }

  const yearFilter = getFixedYearSqlFilter("t.doc_date");
  const branchList = `'${branchCode.replace(/'/g, "''")}'`;
  const scope = `t.date_logistic::date = $1::date AND ${yearFilter}${branchClause}`;

  const branchName = branchCode
    ? (
        await queryOne(
          `SELECT COALESCE(NULLIF(TRIM(name_1), ''), code) AS name
           FROM transport_type WHERE code = $1`,
          [branchCode]
        )
      )?.name || branchCode
    : "";

  // pool ມີ 10 connection ເທົ່ານັ້ນ ແລະ getBillsPending ຍິງພາຍໃນອີກຫຼາຍ
  // query — ຍິງທັງໝົດພ້ອມກັນຈະກິນ pool ໝົດຈົນ worker GPS ແລະ request
  // ອື່ນ connect ບໍ່ໄດ້. ຍິງເປັນຊຸດລະ 4 ແທນ.
  const __batches = [];
  __batches.push(...(await Promise.all([
      // ── ໜ້າ 1: ໂຕເລກໃຫຍ່ຂອງມື້ ──
      queryOne(
        `SELECT
           COUNT(DISTINCT t.doc_no)::int AS trips,
           COUNT(DISTINCT t.doc_no) FILTER (WHERE COALESCE(t.job_status,0) >= 2)::int AS trips_out,
           COUNT(DISTINCT t.doc_no) FILTER (WHERE COALESCE(t.job_status,0) >= 3)::int AS trips_closed,
           COUNT(d.bill_no)::int AS bills,
           COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
           COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled,
           COUNT(*) FILTER (WHERE COALESCE(d.status,0) NOT IN (1,2))::int AS pending
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         WHERE ${scope}`,
        params
      ),

      // ── ບິນທີ່ປິດພາຍໃນວັນນີ້ຈິງ ບໍ່ວ່າຈະເປັນຖ້ຽວຂອງວັນໃດ.
      //    ຖ້ຽວມື້ວານທີ່ຄົນຂັບປິດບິນມື້ນີ້ ຕ້ອງນັບເປັນວຽກຂອງມື້ນີ້ ──
      queryOne(
        `SELECT
           COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
           COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled
         FROM public.odg_tms_detail d
         JOIN odg_tms t ON t.doc_no = d.doc_no
         WHERE d.sent_end::date = $1::date AND ${yearFilter}${branchClause}`,
        params
      ),

      // ── ໜ້າ 2: ຖ້ຽວກຳລັງແລ່ນ ພ້ອມຄວາມຄືບໜ້າ ──
      query(
        `SELECT t.doc_no,
                COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                COALESCE(NULLIF(TRIM(rt.name), ''), t.delivery_route_code::text, '') AS route,
                COALESCE(NULLIF(TRIM(rd.name), ''), t.delivery_round_code::text, '') AS round,
                to_char(t.dispatch_started_at, 'HH24:MI') AS out_at,
                EXTRACT(EPOCH FROM (NOW() - t.dispatch_started_at)) AS out_seconds,
                COUNT(d.bill_no)::int AS bills,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
                to_char(MAX(d.sent_end), 'HH24:MI') AS last_at,
                EXTRACT(EPOCH FROM (NOW() - MAX(d.sent_end)))/60 AS idle_minutes,
                ${TRIP_STATUS_SQL} AS status_label,
                (SELECT ROUND((6371000 * 2 * asin(sqrt(
                    power(sin(radians(gc.lat::numeric - gf.start_lat::numeric) / 2), 2) +
                    cos(radians(gf.start_lat::numeric)) * cos(radians(gc.lat::numeric)) *
                    power(sin(radians(gc.lng::numeric - gf.start_lng::numeric) / 2), 2)
                  )))::numeric, 0)
                 FROM (
                   SELECT NULLIF(TRIM(lat), '')::numeric AS lat,
                          NULLIF(TRIM(lng), '')::numeric AS lng, car_code
                   FROM public.odg_tms_gps_current
                   WHERE NULLIF(TRIM(lat), '') IS NOT NULL
                 ) gc
                 CROSS JOIN (
                   SELECT NULLIF(TRIM(start_lat), '')::numeric AS start_lat,
                          NULLIF(TRIM(start_lng), '')::numeric AS start_lng
                   FROM public.odg_tms_geofence
                   WHERE transport_code = ${branchList}
                     AND NULLIF(TRIM(start_lat), '') IS NOT NULL
                   LIMIT 1
                 ) gf
                 WHERE gc.car_code = t.car::text
                 LIMIT 1) AS from_base_m,
                t.car::text AS car_code
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         LEFT JOIN public.odg_tms_car car ON car.code::text = t.car::text
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         LEFT JOIN public.odg_tms_delivery_route rt ON rt.code::text = t.delivery_route_code::text
         LEFT JOIN public.odg_tms_delivery_round rd ON rd.code::text = t.delivery_round_code::text
         WHERE ${scope} AND COALESCE(t.job_status,0) = 2
         GROUP BY t.doc_no, car.name_1, t.car, dv.name_1, t.driver,
                  rt.name, t.delivery_route_code, rd.name, t.delivery_round_code,
                  t.dispatch_started_at, t.approve_status, t.job_status
         ORDER BY t.dispatch_started_at NULLS LAST, t.doc_no`,
        params
      ),

      // ── ໜ້າ 3: ອະນຸມັດແລ້ວແຕ່ຍັງບໍ່ອອກ / ຍັງບໍ່ອະນຸມັດ ──
      query(
        `SELECT t.doc_no,
                COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                COALESCE(NULLIF(TRIM(rt.name), ''), t.delivery_route_code::text, '') AS route,
                COUNT(d.bill_no)::int AS bills,
                COALESCE(t.job_status, 0)::int AS job_status,
                COALESCE(t.approve_status, 0)::int AS approve_status,
                ${TRIP_STATUS_SQL} AS status_label
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         LEFT JOIN public.odg_tms_car car ON car.code::text = t.car::text
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         LEFT JOIN public.odg_tms_delivery_route rt ON rt.code::text = t.delivery_route_code::text
         WHERE ${scope} AND COALESCE(t.job_status,0) < 2
         GROUP BY t.doc_no, car.name_1, t.car, dv.name_1, t.driver,
                  rt.name, t.delivery_route_code, t.job_status, t.approve_status
         ORDER BY t.doc_no`,
        params
      ),
  ])));
  __batches.push(...(await Promise.all([

      // ── ໜ້າ 3: ຖ້ຽວຄ້າງປິດຈາກມື້ກ່ອນ — ວຽກທີ່ຕົກຄ້າງຂ້າມວັນ ──
      query(
        `SELECT t.doc_no,
                to_char(t.date_logistic, 'DD/MM') AS day,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car,
                (CURRENT_DATE - t.date_logistic::date)::int AS days_open,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) NOT IN (1,2))::int AS open_bills
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         LEFT JOIN public.odg_tms_car car ON car.code::text = t.car::text
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         WHERE COALESCE(t.job_status,0) BETWEEN 1 AND 2
           AND t.date_logistic::date < $1::date
           AND t.date_logistic::date >= $1::date - INTERVAL '30 days'
           AND ${yearFilter}${branchClause}
         GROUP BY t.doc_no, t.date_logistic, dv.name_1, t.driver, car.name_1, t.car
         ORDER BY days_open DESC, t.doc_no
         LIMIT 12`,
        params
      ),

      // ── ໜ້າ 3: ບິນຍົກເລີກມື້ນີ້ ພ້ອມເຫດຜົນ ──
      query(
        `SELECT d.bill_no,
                COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '-') AS cust_name,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                COALESCE(NULLIF(TRIM(d.remark), ''), '-') AS reason,
                to_char(d.sent_end, 'HH24:MI') AS at
         FROM public.odg_tms_detail d
         JOIN odg_tms t ON t.doc_no = d.doc_no
         LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         WHERE d.sent_end::date = $1::date
           AND COALESCE(d.status,0) = 2
           AND ${yearFilter}${branchClause}
         ORDER BY d.sent_end DESC NULLS LAST
         LIMIT 12`,
        params
      ),

      // ── ແຖບແລ່ນ: ບິນທີ່ຫາກໍສຳເລັດ ──
      query(
        `SELECT d.bill_no,
                COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '-') AS cust_name,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                to_char(d.sent_end, 'HH24:MI') AS at
         FROM public.odg_tms_detail d
         JOIN odg_tms t ON t.doc_no = d.doc_no
         LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         WHERE d.sent_end::date = $1::date
           AND COALESCE(d.status,0) = 1
           AND ${yearFilter}${branchClause}
         ORDER BY d.sent_end DESC
         LIMIT 12`,
        params
      ),

      // ── ໜ້າ 4: ຕຳແໜ່ງລົດສົດ. Tracker ລາຍງານຕາມຄັນລົດ,
      //    ຈຶ່ງກັ່ນດ້ວຍຖ້ຽວເປີດຂອງສາຂານີ້
      //    ເພື່ອບໍ່ໃຫ້ລົດຈາກປາກເຊ/ໂອດ່ຽນປົນໃນຈໍດອນຕິ້ວ. ──
      query(
        `SELECT g.car_code, g.car_name,
                NULLIF(TRIM(g.lat), '')::numeric AS lat,
                NULLIF(TRIM(g.lng), '')::numeric AS lng,
                COALESCE(NULLIF(TRIM(g.speed), '')::numeric, 0) AS speed,
                COALESCE(g.address, '') AS address,
                to_char(NULLIF(TRIM(g.recorded_at), '')::timestamp, 'HH24:MI') AS at,
                EXTRACT(EPOCH FROM (NOW() - NULLIF(TRIM(g.recorded_at), '')::timestamp))/60 AS age_minutes
         FROM public.odg_tms_gps_current g
         WHERE NULLIF(TRIM(g.lat), '') IS NOT NULL
           AND NULLIF(TRIM(g.lng), '') IS NOT NULL
           AND NULLIF(TRIM(g.recorded_at), '') IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM public.odg_tms_car branch_car
             WHERE NULLIF(TRIM(branch_car.code::text), '') = NULLIF(TRIM(g.car_code), '')
               AND COALESCE(NULLIF(TRIM(branch_car.transport_code), ''), '') = ${branchList}
           )
         ORDER BY NULLIF(TRIM(g.recorded_at), '')::timestamp DESC
         LIMIT 60`,
        []
      ),
  ])));
  __batches.push(...(await Promise.all([

      // ── ໜ້າ 4: ຈຸດຂອງແຕ່ລະຖ້ຽວ ຈາກບິນລ່າສຸດທີ່ປິດພ້ອມພິກັດ.
      //    ເຄື່ອງ tracker ຕິດບໍ່ຄົບທຸກຄັນ ຈຶ່ງໃຊ້ບ່ອນທີ່ຄົນຂັບກົດສົ່ງສຳເລັດ
      //    ເປັນຫຼັກຖານວ່າລົດຢູ່ໃສ ແລະ ຄືບໜ້າໄປທາງໃດ ──
      query(
        `SELECT DISTINCT ON (t.doc_no)
                t.doc_no,
                COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                NULLIF(TRIM(d.lat), '')::numeric AS lat,
                NULLIF(TRIM(d.lng), '')::numeric AS lng,
                to_char(d.sent_end, 'HH24:MI') AS at,
                EXTRACT(EPOCH FROM (NOW() - d.sent_end))/60 AS age_minutes,
                COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '') AS cust_name,
                COALESCE(t.job_status, 0)::int AS job_status
         FROM public.odg_tms_detail d
         JOIN odg_tms t ON t.doc_no = d.doc_no
         LEFT JOIN public.odg_tms_car car ON car.code::text = t.car::text
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
         WHERE ${scope}
           AND COALESCE(d.status,0) = 1
           AND NULLIF(TRIM(d.lat), '') IS NOT NULL
           AND NULLIF(TRIM(d.lng), '') IS NOT NULL
           AND d.sent_end IS NOT NULL
         ORDER BY t.doc_no, d.sent_end DESC`,
        params
      ),

      // ── ຫຼັງເສັ້ນທາງຂອງແຕ່ລະຄັນ. ວັນນຶ່ງມີເປັນພັນຈຸດ ຈຶ່ງເກັບຕົວຢ່າງລົງ
      //    ~150 ຈຸດຕໍ່ຄັນ — ພຽງພໍໃຫ້ເສັ້ນຄົມເທິງຈໍ ໂດຍບໍ່ສົ່ງຂໍ້ມູນໜັກທຸກ 15 ວິນາທີ ──
      query(
        `WITH pts AS (
           SELECT g.car_code, g.car_name, g.recorded_at,
                  g.lat, g.lng,
                  ROW_NUMBER() OVER (PARTITION BY g.car_code ORDER BY g.recorded_at) AS rn,
                  COUNT(*) OVER (PARTITION BY g.car_code) AS total
           FROM public.odg_tms_gps_realtime_log g
           WHERE g.recorded_at::date = $1::date
             AND g.lat IS NOT NULL AND g.lng IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.odg_tms_car branch_car
               WHERE NULLIF(TRIM(branch_car.code::text), '') = NULLIF(TRIM(g.car_code), '')
                 AND COALESCE(NULLIF(TRIM(branch_car.transport_code), ''), '') = ${branchList}
             )
         )
         SELECT car_code,
                MAX(car_name) AS car_name,
                json_agg(json_build_array(lat, lng) ORDER BY recorded_at) AS points
         FROM pts
         WHERE rn % GREATEST(1, (total / 150)::int) = 0
         GROUP BY car_code`,
        [day]
      ),

      // ── ໜ້າ 5: ອັນດັບຄົນຂັບຂອງມື້ ──
      query(
        `SELECT COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS name,
                COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car,
                COUNT(DISTINCT t.doc_no)::int AS trips,
                COUNT(d.bill_no)::int AS bills,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
         LEFT JOIN public.odg_tms_car car ON car.code::text = t.car::text
         WHERE ${scope} AND NULLIF(TRIM(t.driver), '') IS NOT NULL
         GROUP BY dv.name_1, t.driver, car.name_1, t.car
         ORDER BY delivered DESC, bills DESC
         LIMIT 14`,
        params
      ),

      // ── ບິນຄ້າງສົ່ງ: ເອີ້ນຟັງຊັນດຽວກັບໜ້າ bills-pending.
      //
      //    ຂຽນ SQL ເອງແລ້ວຜິດມາແລ້ວ — `check_status = 0` ບໍ່ໄດ້ໝາຍວ່າຍັງບໍ່ສົ່ງ
      //    (ບິນທີ່ສົ່ງແລ້ວ 1,828 ບິນຍັງເປັນ 0 ຢູ່). ກົດເກນຈິງແມ່ນ "ຍັງເຫຼືອ
      //    ຈຳນວນທີ່ຕ້ອງສົ່ງ" ບວກກັບການຕັດບິນໂອນ/ບິນບໍລິການອອກ ເຊິ່ງຢູ່ໃນ
      //    getBillsPending ໝົດແລ້ວ. ເອີ້ນມັນຈຶ່ງຮັບປະກັນວ່າຈໍກັບໜ້າ pending
      //    ບອກເລກດຽວກັນສະເໝີ.
  ])));
  __batches.push(...(await Promise.all([

      // ── ບິນທີ່ຈັດເຂົ້າຖ້ຽວແລ້ວ ແຕ່ຄົນຂັບຍັງບໍ່ໄດ້ສົ່ງ ──
      queryOne(
        `SELECT COUNT(*)::int AS bills
         FROM public.odg_tms_detail d
         JOIN odg_tms t ON t.doc_no = d.doc_no
         WHERE COALESCE(d.status, 0) NOT IN (1, 2)
           AND ${yearFilter}
           AND COALESCE(NULLIF(TRIM(t.origin_transport_code), ''), '') IN (${branchList})`,
        []
      ),
  ])));
  __batches.push(
    await getBillsPending({}, FIXED_YEAR_START, FIXED_YEAR_END, branchCode)
  );
  const [totals, doneToday, trips, notStarted, alerts, cancelled, feed, vehicles, tripPoints, trails, drivers, scheduledOpen, pendingRaw] = __batches;

  // Fleet availability follows the selected transport branch in the car
  // master. A car is busy while it belongs to any open trip (job_status 0–2).
  const fleet = await queryOne(
    `SELECT
       (SELECT COUNT(*)::int
        FROM public.odg_tms_car c
        WHERE NULLIF(TRIM(c.code::text), '') IS NOT NULL
          AND COALESCE(NULLIF(TRIM(c.transport_code), ''), '') = ${branchList}) AS total,
       (SELECT COUNT(DISTINCT NULLIF(TRIM(t.car::text), ''))::int
        FROM public.odg_tms t
        JOIN public.odg_tms_car c ON c.code::text = t.car::text
        WHERE COALESCE(t.job_status, 0) BETWEEN 0 AND 2
          AND NULLIF(TRIM(t.car::text), '') IS NOT NULL
          AND COALESCE(NULLIF(TRIM(c.transport_code), ''), '') = ${branchList}
          AND ${getFixedYearSqlFilter("t.doc_date")}) AS busy`
  );

  // ເວລາເປີດບິນແທ້ — `getBillsPending` ຄືນ doc_date ເປັນຂໍ້ຄວາມ DD-MM-YYYY
  // ບໍ່ມີເວລາ ແລະ ບາງບິນ scheduled_date ຕ່າງຈາກວັນເປີດບິນຫຼາຍເດືອນ.
  // KPI ນັບຈາກເວລາທີ່ພະນັກງານຂາຍເປີດບິນ ຈຶ່ງຕ້ອງດຶງ doc_date + doc_time ມາເອງ.
  const pendingBillNos = Array.isArray(pendingRaw?.trans)
    ? pendingRaw.trans.map((row) => row.doc_no).filter(Boolean)
    : [];
  const openedAt = new Map();
  if (pendingBillNos.length > 0) {
    const openedRows = await query(
      `SELECT doc_no,
              (doc_date + COALESCE(NULLIF(TRIM(doc_time), '')::time, '00:00'::time))
                AS opened_at
       FROM ic_trans
       WHERE doc_no = ANY($1::varchar[]) AND doc_date IS NOT NULL`,
      [pendingBillNos]
    );
    for (const row of openedRows) {
      if (row.opened_at) openedAt.set(row.doc_no, new Date(row.opened_at).getTime());
    }
  }

  const int = (row, key) => Number(row?.[key] ?? 0);
  const mins = (value) =>
    value === null || value === undefined ? null : Math.max(0, Math.round(Number(value)));

  // Which running trips are worth staring at: no bill closed for a long while,
  // or nothing closed at all long after leaving the warehouse.
  // "ຊັກຊ້າ" is measured against the clock, so it only means anything while the
  // day is still running. Opening the screen on a past date must not paint every
  // trip red just because the day ended weeks ago.
  const isLiveDay = day === getFixedTodayDate();
  // ໄລຍະທາງມາຈາກເລກໄມລ໌ຂອງ tracker (ຈົດຕອນອອກ ລົບກັບເລກດຽວນີ້)
  // ບໍ່ແມ່ນບວກຈາກຈຸດ GPS — ເບິ່ງເຫດຜົນໃນ trip-distance.js
  const distanceByTrip = await getDistanceMap(trips.map((row) => row.doc_no));

  // ຈັງຫວະການສົ່ງລວມຂອງມື້ນີ້ — ໃຊ້ຄາດເວລາໃຫ້ຖ້ຽວທີ່ຍັງບໍ່ທັນສົ່ງບິນໃດເລີຍ
  // ເພາະຖ້ຽວນັ້ນຍັງບໍ່ມີຈັງຫວະຂອງຕົນເອງໃຫ້ຄິດ.
  let fleetSeconds = 0;
  let fleetDelivered = 0;
  for (const row of trips) {
    const delivered = Number(row.delivered ?? 0);
    const seconds = Number(row.out_seconds ?? 0);
    if (delivered > 0 && seconds > 0) {
      fleetSeconds += seconds;
      fleetDelivered += delivered;
    }
  }
  const fleetPace = fleetDelivered > 0 ? fleetSeconds / fleetDelivered : null;

  const runningTrips = trips.map((row) => {
    const idle = mins(row.idle_minutes);
    // ວິນາທີ ບໍ່ແມ່ນນາທີ — ຈໍນັບເວລາເດີນຕໍ່ເອງລະຫວ່າງການດຶງຂໍ້ມູນ
    const outSeconds =
      row.out_seconds === null || row.out_seconds === undefined
        ? null
        : Math.max(0, Math.round(Number(row.out_seconds)));
    const out = outSeconds === null ? null : Math.round(outSeconds / 60);
    const delivered = Number(row.delivered ?? 0);
    const bills = Number(row.bills ?? 0);
    const sinceProgress = idle ?? out;
    let state = "ok";
    if (delivered >= bills && bills > 0) state = "done";
    else if (isLiveDay && sinceProgress !== null && sinceProgress >= STALL_MINUTES)
      state = "stalled";
    // ຄາດເວລາສຳເລັດ: ຈັງຫວະຂອງຖ້ຽວນີ້ເອງກ່ອນ ຖ້າຍັງບໍ່ມີຈຶ່ງໃຊ້ຈັງຫວະລວມ
    const remaining = Math.max(0, bills - delivered);
    const pace = delivered > 0 && outSeconds ? outSeconds / delivered : fleetPace;
    const etaSeconds =
      remaining > 0 && pace ? Math.round(pace * remaining) : remaining === 0 ? 0 : null;
    const km = distanceByTrip.get(row.doc_no);

    return {
      doc_no: row.doc_no,
      car: row.car,
      eta_seconds: etaSeconds,
      from_base_m:
        row.from_base_m === null || row.from_base_m === undefined
          ? null
          : Number(row.from_base_m),
      distance_km: km === undefined ? null : Math.round(km * 10) / 10,
      driver: row.driver,
      route: row.route,
      round: row.round,
      out_at: row.out_at,
      out_minutes: out,
      out_seconds: outSeconds,
      bills,
      delivered,
      last_at: row.last_at,
      idle_minutes: idle,
      status_label: row.status_label,
      state,
    };
  });

  const payload = {
    date: day,
    branch: branchCode,
    branch_name: branchName,
    live: isLiveDay,
    // Stamped server-side so a screen can show how stale its own copy is even
    // when the browser clock is wrong (they usually are, on kiosk boxes).
    generated_at: new Date().toISOString(),
    fleet: {
      total: int(fleet, "total"),
      busy: int(fleet, "busy"),
      available: Math.max(0, int(fleet, "total") - int(fleet, "busy")),
    },
    totals: {
      trips: int(totals, "trips"),
      // ນັບຈາກເວລາປິດບິນຈິງ — ວຽກທີ່ສຳເລັດ "ພາຍໃນວັນນີ້"
      delivered_today: int(doneToday, "delivered"),
      cancelled_today: int(doneToday, "cancelled"),
      trips_out: int(totals, "trips_out"),
      trips_closed: int(totals, "trips_closed"),
      bills: int(totals, "bills"),
      delivered: int(totals, "delivered"),
      cancelled: int(totals, "cancelled"),
      pending: int(totals, "pending"),
    },
    running: runningTrips,
    not_started: notStarted.map((row) => ({
      doc_no: row.doc_no,
      car: row.car,
      driver: row.driver,
      route: row.route,
      bills: Number(row.bills ?? 0),
      job_status: Number(row.job_status ?? 0),
      approved: Number(row.approve_status ?? 0) > 0,
      status_label: row.status_label,
    })),
    open_trips: alerts.map((row) => ({
      doc_no: row.doc_no,
      day: row.day,
      driver: row.driver,
      car: row.car,
      days_open: Number(row.days_open ?? 0),
      open_bills: Number(row.open_bills ?? 0),
    })),
    cancelled: cancelled.map((row) => ({
      bill_no: row.bill_no,
      cust_name: row.cust_name,
      driver: row.driver,
      reason: row.reason,
      at: row.at,
    })),
    feed: feed.map((row) => ({
      bill_no: row.bill_no,
      cust_name: row.cust_name,
      driver: row.driver,
      at: row.at,
    })),
    trip_points: tripPoints.map((row) => {
      const age = mins(row.age_minutes);
      return {
        doc_no: row.doc_no,
        car: row.car,
        driver: row.driver,
        lat: Number(row.lat),
        lng: Number(row.lng),
        at: row.at,
        age_minutes: age,
        cust_name: row.cust_name,
        running: Number(row.job_status ?? 0) === 2,
      };
    }),
    // ບິນຄ້າງສົ່ງ ແລະ KPI 24 ຊົ່ວໂມງ — ຄິດຈາກລາຍການດຽວກັບໜ້າ bills-pending
    ...(() => {
      const rows = Array.isArray(pendingRaw?.trans) ? pendingRaw.trans : [];
      const today = new Date(`${day}T00:00:00`);
      const dayMs = 86_400_000;
      // ວັນທີ່ຄວນສົ່ງ: ວັນທີ່ຜູ້ຈັດຖ້ຽວກຳນົດໄວ້ ຖ້າບໍ່ມີໃຫ້ໃຊ້ວັນເປີດບິນ
      const dueOf = (row) => {
        const raw =
          row.scheduled_date ||
          row.send_date ||
          (row.doc_date ? row.doc_date.split("-").reverse().join("-") : "");
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
      };
      const lateDays = (due) =>
        due ? Math.round((today - new Date(`${due}T00:00:00`)) / dayMs) : 0;

      // ທຸກບິນຕ້ອງຢູ່ໃນລາຍການ — ຍອດລວມຂອງລາຍການຕ້ອງເທົ່າກັບຈຳນວນບິນຄ້າງ
      // ພໍດີ ບໍ່ດັ່ງນັ້ນຄົນເບິ່ງຈະຖາມວ່າບິນທີ່ຂາດໄປຢູ່ໃສ.
      const byDue = new Map();
      let noDue = 0;
      let onTime = 0;
      const kpiMs = KPI_HOURS * 3_600_000;
      for (const row of rows) {
        const opened = openedAt.get(row.doc_no);
        if (opened !== undefined && Date.now() - opened <= kpiMs) onTime += 1;
        const due = dueOf(row);
        if (!due) {
          noDue += 1;
          continue;
        }
        const bucket = byDue.get(due) ?? { bills: 0, days_late: lateDays(due) };
        bucket.bills += 1;
        byDue.set(due, bucket);
      }

      // ຈໍໃສ່ໄດ້ປະມານ 8 ແຖວ. ວັນທີ່ຫຼ້າສຸດສະແດງແຍກ ສ່ວນທີ່ເກົ່າກວ່ານັ້ນ
      // ລວມເປັນແຖວດຽວ — ຍັງນັບຄົບ ແຕ່ບໍ່ດັນແຖວອື່ນຕົກຈໍ.
      const MAX_ROWS = 7;
      const sorted = [...byDue.entries()]
        .filter(([, bucket]) => bucket.days_late >= 0)
        .sort((a, b) => a[1].days_late - b[1].days_late);
      const todoRows = [];
      const label = (due) => `${due.slice(8, 10)}/${due.slice(5, 7)}`;
      const recent = sorted.slice(0, MAX_ROWS);
      const older = sorted.slice(MAX_ROWS);
      for (const [due, bucket] of recent) {
        todoRows.push({
          due_label: label(due),
          days_late: bucket.days_late,
          bills: bucket.bills,
        });
      }
      todoRows.sort((a, b) => b.days_late - a.days_late);
      if (older.length > 0) {
        const oldest = older[older.length - 1];
        todoRows.unshift({
          due_label: `ກ່ອນ ${label(older[0][0])}`,
          days_late: oldest[1].days_late,
          bills: older.reduce((sum, [, bucket]) => sum + bucket.bills, 0),
        });
      }
      if (noDue > 0) {
        todoRows.push({ due_label: "ບໍ່ມີວັນສົ່ງ", days_late: 0, bills: noDue });
      }

      const scheduled = int(scheduledOpen, "bills");
      const total = rows.length + scheduled;
      const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
      return {
        workload: {
          kpi_hours: KPI_HOURS,
          total,
          unscheduled: rows.length,
          scheduled,
          on_time: onTime,
          late: total - onTime,
          on_time_percent: pct(onTime, total),
          late_percent: pct(total - onTime, total),
        },
        todo: todoRows,
        // ລາຍບິນທີ່ເລີຍກຳນົດແລ້ວ — ໜ້າສະຫຼຸບບອກແຕ່ຈຳນວນ ຄົນຈັດຖ້ຽວ
        // ຍັງຕ້ອງໄປເປີດຄອມຫາຕໍ່ວ່າແມ່ນບິນໃດ. ໜ້ານີ້ປິດຊ່ອງນັ້ນ.
        late_bills: rows
          .map((row) => {
            const due = dueOf(row);
            return {
              bill_no: row.doc_no,
              cust_name: String(row.cust_name || row.cust_code || "-"),
              area: String(row.cust_area || ""),
              due_label: due ? `${due.slice(8, 10)}/${due.slice(5, 7)}` : "-",
              days_late: due ? lateDays(due) : 0,
              // ນາທີທີ່ເລີຍເສັ້ນຕາຍ (ວັນຄວນສົ່ງ + KPI). ຈໍເອົາໄປບວກເວລາ
              // ທີ່ຜ່ານໄປເອງ ຈຶ່ງບອກເວລາຈິງ ບໍ່ແມ່ນປັດເປັນວັນ.
              // ນັບຈາກເວລາເປີດບິນ + KPI ບໍ່ແມ່ນຈາກວັນທີ່ວາງແຜນສົ່ງ
              late_minutes: openedAt.has(row.doc_no)
                ? Math.round(
                    (Date.now() -
                      (openedAt.get(row.doc_no) + KPI_HOURS * 3_600_000)) /
                      60_000
                  )
                : null,
              has_due: Boolean(due),
            };
          })
          .filter((row) => (row.late_minutes ?? 0) > 0)
          .sort((a, b) => (b.late_minutes ?? 0) - (a.late_minutes ?? 0))
          .slice(0, 40),
      };
    })(),
    trails: trails
      .map((row) => ({
        car_code: row.car_code,
        car_name: row.car_name,
        points: Array.isArray(row.points)
          ? row.points
              .map((p) => [Number(p[0]), Number(p[1])])
              .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
          : [],
      }))
      // ສອງຈຸດຂຶ້ນໄປຈຶ່ງເປັນເສັ້ນໄດ້
      .filter((row) => row.points.length > 1),
    drivers: drivers.map((row) => {
      const bills = Number(row.bills ?? 0);
      const delivered = Number(row.delivered ?? 0);
      return {
        name: row.name,
        car: row.car,
        trips: Number(row.trips ?? 0),
        bills,
        delivered,
        cancelled: Number(row.cancelled ?? 0),
        percent: bills > 0 ? Math.round((delivered / bills) * 100) : 0,
      };
    }),
    vehicles: vehicles.map((row) => {
      const age = mins(row.age_minutes);
      return {
        car_code: row.car_code,
        car_name: row.car_name,
        lat: Number(row.lat),
        lng: Number(row.lng),
        speed: Number(row.speed ?? 0),
        address: row.address || "",
        at: row.at,
        age_minutes: age,
        moving: Number(row.speed ?? 0) > 5,
        stale: age !== null && age >= GPS_STALE_MINUTES,
      };
    }),
  };

  tvCache.set(cacheKey, { at: Date.now(), value: payload });
  return payload;
}

module.exports = { getTvDashboard };

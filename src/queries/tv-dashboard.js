const { query, queryOne } = require("../lib/db");
const { getFixedTodayDate, getFixedYearSqlFilter } = require("../lib/fixed-year");

// A wall-mounted screen polls every ~15s and several screens may hang in
// different rooms. Cache the whole payload briefly so N screens cost one set of
// queries, not N — the numbers are only ever "as of a few seconds ago" anyway.
const TV_CACHE_TTL_MS = 10_000;
const tvCache = new Map();

// A trip that has not closed a bill in this long is drifting; the screen turns
// it amber so the dispatcher notices without being told.
const STALL_MINUTES = 90;
// Vehicle GPS older than this means the tracker stopped reporting.
const GPS_STALE_MINUTES = 45;

async function getTvDashboard({ date = "", branch = "" } = {}) {
  const day = date || getFixedTodayDate();
  const branchCode = String(branch || "").trim();
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
  const scope = `t.date_logistic::date = $1::date AND ${yearFilter}${branchClause}`;

  const [totals, trips, notStarted, alerts, cancelled, feed, vehicles] =
    await Promise.all([
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

      // ── ໜ້າ 2: ຖ້ຽວກຳລັງແລ່ນ ພ້ອມຄວາມຄືບໜ້າ ──
      query(
        `SELECT t.doc_no,
                COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car,
                COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
                COALESCE(NULLIF(TRIM(rt.name), ''), t.delivery_route_code::text, '') AS route,
                COALESCE(NULLIF(TRIM(rd.name), ''), t.delivery_round_code::text, '') AS round,
                to_char(t.dispatch_started_at, 'HH24:MI') AS out_at,
                EXTRACT(EPOCH FROM (NOW() - t.dispatch_started_at))/60 AS out_minutes,
                COUNT(d.bill_no)::int AS bills,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
                to_char(MAX(d.sent_end), 'HH24:MI') AS last_at,
                EXTRACT(EPOCH FROM (NOW() - MAX(d.sent_end)))/60 AS idle_minutes,
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
                  t.dispatch_started_at
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
                COALESCE(t.approve_status, 0)::int AS approve_status
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
         WHERE ${scope} AND COALESCE(d.status,0) = 2
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
         WHERE ${scope} AND COALESCE(d.status,0) = 1 AND d.sent_end IS NOT NULL
         ORDER BY d.sent_end DESC
         LIMIT 12`,
        params
      ),

      // ── ໜ້າ 4: ຕຳແໜ່ງລົດສົດ. ບໍ່ຜູກກັບ scope ຂອງຖ້ຽວ ເພາະ tracker
      //    ລາຍງານຕາມຄັນລົດ ບໍ່ແມ່ນຕາມຖ້ຽວ ──
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
         ORDER BY NULLIF(TRIM(g.recorded_at), '')::timestamp DESC
         LIMIT 60`,
        []
      ),
    ]);

  const int = (row, key) => Number(row?.[key] ?? 0);
  const mins = (value) =>
    value === null || value === undefined ? null : Math.max(0, Math.round(Number(value)));

  // Which running trips are worth staring at: no bill closed for a long while,
  // or nothing closed at all long after leaving the warehouse.
  // "ຊັກຊ້າ" is measured against the clock, so it only means anything while the
  // day is still running. Opening the screen on a past date must not paint every
  // trip red just because the day ended weeks ago.
  const isLiveDay = day === getFixedTodayDate();
  const runningTrips = trips.map((row) => {
    const idle = mins(row.idle_minutes);
    const out = mins(row.out_minutes);
    const delivered = Number(row.delivered ?? 0);
    const bills = Number(row.bills ?? 0);
    const sinceProgress = idle ?? out;
    let state = "ok";
    if (delivered >= bills && bills > 0) state = "done";
    else if (isLiveDay && sinceProgress !== null && sinceProgress >= STALL_MINUTES)
      state = "stalled";
    return {
      doc_no: row.doc_no,
      car: row.car,
      driver: row.driver,
      route: row.route,
      round: row.round,
      out_at: row.out_at,
      out_minutes: out,
      bills,
      delivered,
      last_at: row.last_at,
      idle_minutes: idle,
      state,
    };
  });

  const payload = {
    date: day,
    branch: branchCode,
    live: isLiveDay,
    // Stamped server-side so a screen can show how stale its own copy is even
    // when the browser clock is wrong (they usually are, on kiosk boxes).
    generated_at: new Date().toISOString(),
    totals: {
      trips: int(totals, "trips"),
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

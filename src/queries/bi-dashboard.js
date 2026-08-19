// ແຫຼ່ງຂໍ້ມູນຂອງໜ້າ /reports/bi — Dashboard ພາບລວມການຂົນສົ່ງແບບ 1 ໜ້າຈໍ.
//
// ຫຼັກການ: ໜ້ານີ້ບໍ່ຄິດສູດໃໝ່ຂອງມັນເອງ. ຕົວເລກທຸກໂຕດຶງມາຈາກຄຳນິຍາມທີ່ໜ້າອື່ນ
// ໃຊ້ຢູ່ແລ້ວ ເພື່ອບໍ່ໃຫ້ຜູ້ບໍລິຫານເຫັນ 2 ຕົວເລກທີ່ບໍ່ກົງກັນຢູ່ 2 ໜ້າ:
//   • ອັດຕາສົ່ງທັນເວລາ = ນິຍາມດຽວກັບ kpi-alert.js (ສົ່ງສຳເລັດພາຍໃນວັນນັດ)
//   • ຍອດຄ້າງ / ສົ່ງສຳເລັດ / ຍົກເລີກ = getDeliveryPerformance() ໃນ reports.js
//   • ໄລຍະທາງ = odg_tms_gps_daily (rollup) ບໍ່ແມ່ນສະແກນ ping ດິບ
//   • ພື້ນທີ່ບັນທຸກ = buildUtilizationReport() ໃນ actions/trip-volume.ts
//
// ⚠️ ຕົ້ນທຶນ: ລະບົບບັນທຶກສະເພາະ "ຄ່ານ້ຳມັນ" (odg_tms_fuel_log). ຄ່າຄົນຂັບ,
// ຄ່າຜ່ານທາງ, ຄ່າສ້ອມແປງ ແລະ ຄ່າຈ້າງລົດນອກ ຍັງບໍ່ມີບ່ອນເກັບໃນ TMS ຈຶ່ງບໍ່ໄດ້
// ຄິດເຂົ້າໃນ "ຕົ້ນທຶນ/ຖ້ຽວ" ແລະ "ຕົ້ນທຶນ/ກມ". ໜ້າຈໍຕ້ອງບອກຂໍ້ຈຳກັດນີ້ໃຫ້ຊັດ.
"use strict";

const { query, queryOne } = require("../lib/db");
const { getBranchScope, branchFilterJob, getNextMonthStart } = require("./helpers");
const { MIN_PLAUSIBLE_LITERS, MAX_PLAUSIBLE_LITERS } = require("../lib/fuel-sanity");

// ໄລຍະທາງ 1 ຖ້ຽວ ທີ່ອ່ານຈາກເລກໄມລ໌ດ້ວຍມື — ນອກຊ່ວງນີ້ຖືວ່າພິມຜິດ ບໍ່ແມ່ນຖ້ຽວຈິງ.
const MAX_TRIP_ODOMETER_KM = 2000;

/**
 * "ລົດຂົນສົ່ງ" — ບ່ອນດຽວທີ່ນິຍາມ ໃຊ້ຮ່ວມກັນທັງ 3 ພາກ (ການໃຊ້ລົດ, ໄລຍະທາງ
 * GPS ແລະ ປະສິດທິພາບນ້ຳມັນ) ເພື່ອໃຫ້ 3 ພາກນັບລົດຊຸດດຽວກັນສະເໝີ.
 *
 * ຕົວຕັດສິນແມ່ນ transport_code (ສາຂາທີ່ລົດສັງກັດ). odg_tms_car ຍັງເກັບ
 * ພາຫະນະທີ່ບໍ່ແມ່ນລົດຂົນສົ່ງນຳ — Forklift (transport_code = '') ແລະ ລົດທີ່
 * ຕິດ tracker ໄວ້ແຕ່ບໍ່ໄດ້ຜູກສາຂາ (transport_code IS NULL, ບໍ່ມີຖ້ຽວທັງປີ).
 * ຖ້າບໍ່ຕັດອອກ ຈຳນວນລົດຈະບວມ ແລະ ໄລຍະທາງກອງລົດຈະເກີນຄວາມຈິງ ~26%
 * (ວັດເມື່ອ 2026-08-19: 17,946 ກມ → 13,274 ກມ).
 */
const IS_TRANSPORT_CAR = `NULLIF(BTRIM(transport_code), '') IS NOT NULL`;

/** ເງື່ອນໄຂເລືອກລົດຂົນສົ່ງ ບວກຂອບເຂດສາຂາຂອງຜູ້ໃຊ້ */
function transportCarWhere(scope, paramIndex) {
  return scope.scoped
    ? `WHERE ${IS_TRANSPORT_CAR} AND transport_code = ANY($${paramIndex})`
    : `WHERE ${IS_TRANSPORT_CAR}`;
}

// miles_start / miles_end ເປັນ varchar (ຄົນຂັບພິມເອງ) — ຕັດຕົວອັກສອນອອກກ່ອນ
// ແປງເປັນຕົວເລກ ບໍ່ດັ່ງນັ້ນ query ລົ້ມທັງອັນຍ້ອນ 1 ແຖວທີ່ມີ "km" ຕິດມາ.
const odoNum = (col) => `NULLIF(regexp_replace(COALESCE(${col}, ''), '[^0-9.]', '', 'g'), '')::numeric`;

const monthRange = (month) => [`${month}-01`, getNextMonthStart(month)];

/** ຈຳນວນວັນໃນເດືອນ ຄິດດ້ວຍ string ລ້ວນໆ ບໍ່ແຕະ Date ຂອງເຄື່ອງ */
function daysInMonth(month) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

// ────────────────────────────────────────────────────────────────────────
// (1) ແກ່ນລາຍເດືອນ — ຖ້ຽວ, ບິນສົ່ງສຳເລັດ, ອັດຕາທັນເວລາ, ກມ, ຄ່ານ້ຳມັນ.
// ໃຊ້ຊ້ຳທັງເດືອນນີ້, ເດືອນກ່ອນ (ສຳລັບ "ທຽບເດືອນກ່ອນ") ແລະ ແນວໂນ້ມ 12 ເດືອນ.
// ────────────────────────────────────────────────────────────────────────

/**
 * ຖ້ຽວທີ່ອະນຸມັດແລ້ວໃນເດືອນ + ໄມລ໌ທີ່ຄົນຂັບບັນທຶກ.
 * @param {string} month YYYY-MM
 */
async function getTripCore(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const row = await queryOne(
    `SELECT
       COUNT(*)::int AS trips,
       COUNT(DISTINCT a.car)::int AS active_cars,
       COUNT(DISTINCT a.driver)::int AS active_drivers,
       COUNT(DISTINCT (a.car, a.doc_date::date))::int AS car_days,
       COALESCE(SUM(
         CASE WHEN ${odoNum("a.miles_end")} > ${odoNum("a.miles_start")}
               AND ${odoNum("a.miles_end")} - ${odoNum("a.miles_start")} <= ${MAX_TRIP_ODOMETER_KM}
              THEN ${odoNum("a.miles_end")} - ${odoNum("a.miles_start")} END
       ), 0)::float AS odometer_km,
       COUNT(*) FILTER (
         WHERE ${odoNum("a.miles_end")} > ${odoNum("a.miles_start")}
           AND ${odoNum("a.miles_end")} - ${odoNum("a.miles_start")} <= ${MAX_TRIP_ODOMETER_KM}
       )::int AS trips_with_odometer
     FROM public.odg_tms a
     WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
       AND COALESCE(a.approve_status, 0) = 1
       ${branchFilterJob(scope, "a")}`,
    [start, next]
  );
  return {
    trips: Number(row?.trips) || 0,
    active_cars: Number(row?.active_cars) || 0,
    active_drivers: Number(row?.active_drivers) || 0,
    car_days: Number(row?.car_days) || 0,
    odometer_km: Number(row?.odometer_km) || 0,
    trips_with_odometer: Number(row?.trips_with_odometer) || 0,
  };
}

/**
 * ບິນທີ່ສົ່ງເຖິງມືລູກຄ້າໃນເດືອນ ແລະ ອັດຕາທັນເວລາ.
 *
 * "ທັນເວລາ" = ວັນທີ່ສົ່ງສຳເລັດ ≤ ວັນນັດ. ວັນນັດເອົາຕາມລຳດັບ: ວັນນັດທີ່ຜູ້ຈັດ
 * ຕັ້ງໄວ້ (odg_tms_pending_bill.scheduled_date) → ວັນສົ່ງໃນບິນຂາຍ
 * (ic_trans.send_date) → ວັນທີ່ບິນ. ນິຍາມດຽວກັນກັບ kpi-alert.js.
 */
async function getDeliveryCore(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const row = await queryOne(
    `WITH legs AS (
       SELECT d.bill_no,
         d.sent_end::date AS delivered_on,
         COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) AS due_date
       FROM public.odg_tms_detail d
       JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       WHERE d.status = 1
         AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
         ${branchFilterJob(scope, "a")}
     )
     SELECT
       COUNT(*)::int AS drops,
       COUNT(DISTINCT bill_no)::int AS bills,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL AND delivered_on <= due_date)::int AS on_time,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL AND delivered_on > due_date)::int AS late,
       COUNT(*) FILTER (WHERE due_date IS NULL)::int AS no_due
     FROM legs`,
    [start, next]
  );
  const drops = Number(row?.drops) || 0;
  const measurable = drops - (Number(row?.no_due) || 0);
  return {
    drops,
    bills: Number(row?.bills) || 0,
    on_time: Number(row?.on_time) || 0,
    late: Number(row?.late) || 0,
    no_due: Number(row?.no_due) || 0,
    on_time_pct: measurable > 0 ? ((Number(row?.on_time) || 0) / measurable) * 100 : 0,
  };
}

/**
 * ໄລຍະທາງລວມຈາກ GPS rollup.
 *
 * ⚠️ ບວກຢູ່ລະດັບ imei ບໍ່ແມ່ນລະດັບລົດ — ມີລົດ 2 ຄັນທີ່ຜູກ imei ດຽວກັນ ຖ້າ
 * join ຜ່ານ odg_tms_car ກ່ອນບວກ ໄລຍະທາງຂອງ tracker ນັ້ນຈະຖືກນັບ 2 ເທື່ອ.
 */
async function getGpsCore(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const params = [start, next];
  if (scope.scoped) params.push(scope.branches);
  // ນັບສະເພາະ tracker ທີ່ຕິດຢູ່ລົດຂົນສົ່ງ — ມີ tracker ຢູ່ໃນ gps_daily ທີ່ບໍ່ຢູ່
  // ໃນຕາຕະລາງລົດເລີຍ ແລະ ຕິດຢູ່ພາຫະນະທີ່ບໍ່ແມ່ນລົດຂົນສົ່ງ.
  const row = await queryOne(
    `SELECT
       COALESCE(SUM(distance_km), 0)::float AS distance_km,
       COUNT(DISTINCT imei)::int AS trackers,
       COUNT(*) FILTER (WHERE distance_km > 5)::int AS active_car_days,
       COALESCE(SUM(moving_seconds), 0)::float AS moving_seconds,
       COALESCE(SUM(stopped_seconds), 0)::float AS stopped_seconds
     FROM public.odg_tms_gps_daily
     WHERE usage_date >= $1::date AND usage_date < $2::date
       AND imei IN (
         SELECT NULLIF(BTRIM(imei), '') FROM public.odg_tms_car
         ${transportCarWhere(scope, 3)}
       )`,
    params
  );
  return {
    distance_km: Number(row?.distance_km) || 0,
    trackers: Number(row?.trackers) || 0,
    active_car_days: Number(row?.active_car_days) || 0,
    moving_seconds: Number(row?.moving_seconds) || 0,
    stopped_seconds: Number(row?.stopped_seconds) || 0,
  };
}

/** ຄ່ານ້ຳມັນລວມຂອງເດືອນ ແລະ ການແຍກຕາມຮູບແບບຈ່າຍ */
async function getFuelCore(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const params = [start, next];
  let branchClause = "";
  if (scope.scoped) {
    params.push(scope.branches);
    branchClause = `AND (transport_code = ANY($3) OR transport_code IS NULL)`;
  }
  // ແຖວທີ່ຊ່ອງ liters ຖືກປ້ອນເປັນຈຳນວນເງິນ (ບັນຫາຂໍ້ມູນທີ່ຮູ້ຢູ່ແລ້ວ) ຖືກແຍກ
  // ອອກຈາກຍອດລິດ ແຕ່ຍອດ "ເງິນ" ຂອງມັນຍັງນັບ — ໃບບິນນັ້ນຈ່າຍເງິນຈິງ.
  const [totals, byType] = await Promise.all([
    queryOne(
      `SELECT
         COUNT(*)::int AS refills,
         COALESCE(SUM(amount), 0)::float AS amount,
         COALESCE(SUM(liters) FILTER (WHERE liters BETWEEN ${MIN_PLAUSIBLE_LITERS} AND ${MAX_PLAUSIBLE_LITERS}), 0)::float AS liters,
         COUNT(*) FILTER (WHERE liters > ${MAX_PLAUSIBLE_LITERS})::int AS suspect_rows
       FROM public.odg_tms_fuel_log
       WHERE fuel_date >= $1::date AND fuel_date < $2::date ${branchClause}`,
      params
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(fuel_type), ''), 'unspecified') AS fuel_type,
              COUNT(*)::int AS refills,
              COALESCE(SUM(amount), 0)::float AS amount
       FROM public.odg_tms_fuel_log
       WHERE fuel_date >= $1::date AND fuel_date < $2::date ${branchClause}
       GROUP BY 1
       ORDER BY 3 DESC`,
      params
    ),
  ]);
  return {
    refills: Number(totals?.refills) || 0,
    amount: Number(totals?.amount) || 0,
    liters: Number(totals?.liters) || 0,
    suspect_rows: Number(totals?.suspect_rows) || 0,
    by_type: byType.map((r) => ({
      fuel_type: r.fuel_type,
      refills: Number(r.refills) || 0,
      amount: Number(r.amount) || 0,
    })),
  };
}

/** ໜຶ່ງເດືອນຄົບຊຸດ — ໃຊ້ທັງເດືອນທີ່ເລືອກ ແລະ ເດືອນກ່ອນ ເພື່ອທຽບກັນ */
async function getMonthSnapshot(session, month) {
  const [trips, delivery, gps, fuel] = await Promise.all([
    getTripCore(session, month),
    getDeliveryCore(session, month),
    getGpsCore(session, month),
    getFuelCore(session, month),
  ]);
  // ໄລຍະທາງທີ່ເອົາມາຄິດຕົ້ນທຶນ/ກມ: GPS ກ່ອນ ເພາະຄຸມທຸກຄັນທີ່ມີ tracker;
  // ຖ້າເດືອນນັ້ນ GPS ຍັງບໍ່ມີຂໍ້ມູນ ຈຶ່ງຖອຍໄປໃຊ້ເລກໄມລ໌ທີ່ຄົນຂັບບັນທຶກ.
  const km = gps.distance_km > 0 ? gps.distance_km : trips.odometer_km;
  const kmSource = gps.distance_km > 0 ? "gps" : trips.odometer_km > 0 ? "odometer" : "none";
  return {
    month,
    trips,
    delivery,
    gps,
    fuel,
    km,
    km_source: kmSource,
    cost_per_trip: trips.trips > 0 ? fuel.amount / trips.trips : 0,
    cost_per_km: km > 0 ? fuel.amount / km : 0,
    cost_per_drop: delivery.drops > 0 ? fuel.amount / delivery.drops : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────
// (2) ແນວໂນ້ມອັດຕາສົ່ງທັນເວລາ ລາຍເດືອນ ພາຍໃນປີ
// ────────────────────────────────────────────────────────────────────────

async function getOnTimeTrend(session, year) {
  const scope = getBranchScope(session);
  const rows = await query(
    `WITH legs AS (
       SELECT to_char(d.sent_end, 'YYYY-MM') AS month,
         d.sent_end::date AS delivered_on,
         COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) AS due_date
       FROM public.odg_tms_detail d
       JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       WHERE d.status = 1
         AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND d.sent_end >= $1::date AND d.sent_end < $2::date
         ${branchFilterJob(scope, "a")}
     )
     SELECT month,
       COUNT(*)::int AS drops,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL)::int AS measurable,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL AND delivered_on <= due_date)::int AS on_time
     FROM legs
     GROUP BY month
     ORDER BY month`,
    [`${year}-01-01`, `${year + 1}-01-01`]
  );
  return rows.map((r) => {
    const measurable = Number(r.measurable) || 0;
    const onTime = Number(r.on_time) || 0;
    return {
      month: r.month,
      drops: Number(r.drops) || 0,
      on_time: onTime,
      on_time_pct: measurable > 0 ? (onTime / measurable) * 100 : 0,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// (3) ຖ້ຽວ ແລະ ສາຍທາງ
// ────────────────────────────────────────────────────────────────────────

/** ຖ້ຽວແຍກຕາມມື້ຂອງອາທິດ (1 = ຈັນ … 7 = ອາທິດ) */
async function getTripsByWeekday(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const rows = await query(
    `SELECT EXTRACT(ISODOW FROM a.doc_date)::int AS dow, COUNT(*)::int AS trips
     FROM public.odg_tms a
     WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
       AND COALESCE(a.approve_status, 0) = 1
       ${branchFilterJob(scope, "a")}
     GROUP BY 1`,
    [start, next]
  );
  const byDow = new Map(rows.map((r) => [Number(r.dow), Number(r.trips) || 0]));
  return Array.from({ length: 7 }, (_, i) => ({ dow: i + 1, trips: byDow.get(i + 1) ?? 0 }));
}

/**
 * ສາຍທາງທີ່ໃຊ້ຫຼາຍທີ່ສຸດ ພ້ອມອັດຕາທັນເວລາຂອງແຕ່ລະສາຍ.
 * ຖ້ຽວທີ່ບໍ່ໄດ້ຕິດສາຍທາງ ຖືກລວມເປັນແຖວດຽວ "ບໍ່ໄດ້ລະບຸສາຍ" ບໍ່ຖິ້ມຖິ້ມ
 * ບໍ່ດັ່ງນັ້ນຍອດຖ້ຽວໃນຕາຕະລາງນີ້ຈະບໍ່ກົງກັບຍອດຖ້ຽວຂ້າງເທິງ.
 */
async function getRouteAnalysis(session, month, limit = 8) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const rows = await query(
    `WITH trips AS (
       SELECT a.doc_no,
         COALESCE(NULLIF(TRIM(a.delivery_route_code), ''), '—') AS route_code
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         ${branchFilterJob(scope, "a")}
     ),
     trip_counts AS (
       SELECT route_code, COUNT(*)::int AS trips FROM trips GROUP BY route_code
     ),
     -- ນັບ leg ຜ່ານ doc_no ຂອງແຕ່ລະຖ້ຽວ. ຖ້າ join ດ້ວຍ route_code ຜົນຄື
     -- ຖ້ຽວ × leg ຂອງທັງສາຍ (cartesian) ແລ້ວຍອດຈຸດສົ່ງຈະບວມເປັນຮ້ອຍເທົ່າ.
     leg_counts AS (
       SELECT t.route_code,
         COUNT(*) FILTER (WHERE d.status = 1 AND d.sent_end IS NOT NULL)::int AS drops,
         COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled,
         COUNT(*) FILTER (
           WHERE d.status = 1 AND d.sent_end IS NOT NULL
             AND COALESCE(pb.scheduled_date::date, ic.send_date::date, d.bill_date::date) IS NOT NULL
         )::int AS measurable,
         COUNT(*) FILTER (
           WHERE d.status = 1 AND d.sent_end IS NOT NULL
             AND d.sent_end::date <= COALESCE(pb.scheduled_date::date, ic.send_date::date, d.bill_date::date)
         )::int AS on_time
       FROM trips t
       JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN public.ic_trans ic ON ic.doc_no = d.bill_no
       GROUP BY t.route_code
     )
     SELECT tc.route_code,
       COALESCE(NULLIF(TRIM(r.name), ''), tc.route_code) AS route_name,
       COALESCE(r.distance_km, 0)::float AS route_km,
       tc.trips,
       COALESCE(lc.drops, 0)::int AS drops,
       COALESCE(lc.on_time, 0)::int AS on_time,
       COALESCE(lc.measurable, 0)::int AS measurable,
       COALESCE(lc.cancelled, 0)::int AS cancelled
     FROM trip_counts tc
     LEFT JOIN leg_counts lc ON lc.route_code = tc.route_code
     LEFT JOIN public.odg_tms_delivery_route r ON r.code = tc.route_code
     ORDER BY tc.trips DESC, tc.route_code
     LIMIT ${Number(limit) || 8}`,
    [start, next]
  );
  return rows.map((r) => {
    const measurable = Number(r.measurable) || 0;
    const onTime = Number(r.on_time) || 0;
    const trips = Number(r.trips) || 0;
    return {
      route_code: r.route_code,
      route_name: r.route_name,
      route_km: Number(r.route_km) || 0,
      trips,
      drops: Number(r.drops) || 0,
      cancelled: Number(r.cancelled) || 0,
      drops_per_trip: trips > 0 ? (Number(r.drops) || 0) / trips : 0,
      on_time_pct: measurable > 0 ? (onTime / measurable) * 100 : null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// (4) ການໃຊ້ລົດ
// ────────────────────────────────────────────────────────────────────────

/**
 * ລົດທັງໝົດ vs ລົດທີ່ອອກຖ້ຽວໃນເດືອນ.
 *
 * "ອັດຕາການໃຊ້" = ວັນ-ຄັນ ທີ່ມີຖ້ຽວ ÷ (ຈຳນວນລົດທັງໝົດ × ວັນໃນເດືອນ).
 * ບໍ່ແມ່ນ % ຂອງພື້ນທີ່ບັນທຸກ — ອັນນັ້ນຢູ່ພາກ "ການໃຊ້ພື້ນທີ່ບັນທຸກ".
 */
async function getVehicleUtilization(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const [fleetRow, usedRow] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS total_cars
       FROM public.odg_tms_car ${transportCarWhere(scope, 1)}`,
      scope.scoped ? [scope.branches] : []
    ),
    queryOne(
      `SELECT COUNT(DISTINCT a.car)::int AS used_cars,
              COUNT(DISTINCT (a.car, a.doc_date::date))::int AS car_days
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         AND NULLIF(TRIM(a.car), '') IS NOT NULL
         ${branchFilterJob(scope, "a")}`,
      [start, next]
    ),
  ]);
  const totalCars = Number(fleetRow?.total_cars) || 0;
  const usedCars = Number(usedRow?.used_cars) || 0;
  const carDays = Number(usedRow?.car_days) || 0;
  const days = daysInMonth(month);
  return {
    total_cars: totalCars,
    used_cars: usedCars,
    idle_cars: Math.max(0, totalCars - usedCars),
    car_days: carDays,
    days_in_month: days,
    utilization_pct: totalCars > 0 && days > 0 ? (carDays / (totalCars * days)) * 100 : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────
// (5) ປະສິດທິພາບນ້ຳມັນ ລາຍຄັນ
// ────────────────────────────────────────────────────────────────────────

/**
 * ກມ/ລິດ ລາຍຄັນ = ໄລຍະທາງ GPS ຂອງ tracker ຄັນນັ້ນ ÷ ລິດທີ່ຕື່ມ.
 *
 * ⚠️ ສອງຂໍ້ຄວນລະວັງ ທີ່ໜ້າຈໍຕ້ອງສະແດງ:
 *   • ແຖວ fuel_log ທີ່ຊ່ອງ liters ຖືກປ້ອນເປັນເງິນ ຖືກຕັດອອກຈາກໂຕຫານ
 *   • ລົດທີ່ແບ່ງ imei ກັນ (dup_imei = true) ໄດ້ໄລຍະທາງເຕັມຂອງ tracker
 *     ທັງສອງຄັນ ຈຶ່ງ ກມ/ລິດ ຂອງມັນເຊື່ອບໍ່ໄດ້
 */
async function getFuelEfficiency(session, month, limit = 12) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const params = [start, next];
  let fuelBranch = "";
  if (scope.scoped) {
    params.push(scope.branches);
    fuelBranch = `AND (f.transport_code = ANY($3) OR f.transport_code IS NULL)`;
  }
  const rows = await query(
    `WITH cars AS (
       SELECT c.code, COALESCE(NULLIF(TRIM(c.name_1), ''), c.code) AS car_name,
              NULLIF(TRIM(c.imei), '') AS imei
       FROM public.odg_tms_car c
       WHERE NULLIF(BTRIM(c.transport_code), '') IS NOT NULL
         ${scope.scoped ? `AND c.transport_code = ANY($3)` : ""}
     ),
     dup AS (
       SELECT imei FROM cars WHERE imei IS NOT NULL GROUP BY imei HAVING COUNT(*) > 1
     ),
     gps AS (
       SELECT imei, SUM(distance_km)::float AS distance_km
       FROM public.odg_tms_gps_daily
       WHERE usage_date >= $1::date AND usage_date < $2::date
       GROUP BY imei
     ),
     fuel AS (
       SELECT COALESCE(m.code, TRIM(f.car::text)) AS car_code,
         COALESCE(SUM(f.liters) FILTER (
           WHERE f.liters BETWEEN ${MIN_PLAUSIBLE_LITERS} AND ${MAX_PLAUSIBLE_LITERS}), 0)::float AS liters,
         COALESCE(SUM(f.amount), 0)::float AS amount,
         COUNT(*)::int AS refills,
         COUNT(*) FILTER (WHERE f.liters > ${MAX_PLAUSIBLE_LITERS})::int AS suspect_rows
       FROM public.odg_tms_fuel_log f
       LEFT JOIN LATERAL (
         SELECT c.code FROM public.odg_tms_car c
         WHERE TRIM(c.code::text) = TRIM(f.car::text)
            OR upper(TRIM(c.name_1::text)) = upper(TRIM(f.car::text))
         ORDER BY (TRIM(c.code::text) = TRIM(f.car::text)) DESC
         LIMIT 1
       ) m ON TRUE
       WHERE f.fuel_date >= $1::date AND f.fuel_date < $2::date
         AND NULLIF(TRIM(f.car::text), '') IS NOT NULL
         ${fuelBranch}
       GROUP BY 1
     ),
     trips AS (
       SELECT a.car, COUNT(*)::int AS trips
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         ${branchFilterJob(scope, "a")}
       GROUP BY a.car
     )
     SELECT c.code AS car_code, c.car_name,
       COALESCE(g.distance_km, 0)::float AS distance_km,
       COALESCE(fl.liters, 0)::float AS liters,
       COALESCE(fl.amount, 0)::float AS amount,
       COALESCE(fl.refills, 0)::int AS refills,
       COALESCE(fl.suspect_rows, 0)::int AS suspect_rows,
       COALESCE(tr.trips, 0)::int AS trips,
       (c.imei IS NOT NULL AND EXISTS (SELECT 1 FROM dup WHERE dup.imei = c.imei)) AS dup_imei
     FROM cars c
     LEFT JOIN gps g ON g.imei = c.imei
     LEFT JOIN fuel fl ON fl.car_code = c.code
     LEFT JOIN trips tr ON tr.car = c.code
     WHERE COALESCE(g.distance_km, 0) > 0 OR COALESCE(fl.amount, 0) > 0 OR COALESCE(tr.trips, 0) > 0
     ORDER BY COALESCE(g.distance_km, 0) DESC
     LIMIT ${Number(limit) || 12}`,
    params
  );
  return rows.map((r) => {
    const km = Number(r.distance_km) || 0;
    const liters = Number(r.liters) || 0;
    const amount = Number(r.amount) || 0;
    return {
      car_code: r.car_code,
      car_name: r.car_name,
      trips: Number(r.trips) || 0,
      distance_km: km,
      liters,
      amount,
      refills: Number(r.refills) || 0,
      suspect_rows: Number(r.suspect_rows) || 0,
      dup_imei: r.dup_imei === true,
      km_per_liter: liters > 0 && km > 0 ? km / liters : null,
      cost_per_km: km > 0 && amount > 0 ? amount / km : null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// (6) ຄວາມຜິດປົກກະຕິ — ສາເຫດທີ່ສົ່ງບໍ່ສຳເລັດ
// ────────────────────────────────────────────────────────────────────────

/** ປ້າຍພາສາລາວຂອງ cancel_reason_code — ຄ່າທີ່ບໍ່ຮູ້ຈັກຄືນ code ດິບ */
const CANCEL_REASON_LABEL = {
  shop_closed: "ຮ້ານປິດ",
  customer_away: "ລູກຄ້າບໍ່ຢູ່",
  too_late: "ໄປບໍ່ທັນເວລາ",
  truck_full: "ລົດເຕັມ",
  goods_issue: "ສິນຄ້າມີບັນຫາ",
  wrong_address: "ທີ່ຢູ່ບໍ່ຖືກ",
  customer_refused: "ລູກຄ້າປະຕິເສດ",
  other: "ອື່ນໆ",
};

async function getExceptions(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const [totals, reasons] = await Promise.all([
    queryOne(
      `WITH legs AS (
         SELECT d.status, d.cancel_reason_code, d.reschedule_date, d.sent_end,
           COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) AS due_date
         FROM public.odg_tms_detail d
         JOIN public.odg_tms a ON a.doc_no = d.doc_no
         LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
         LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
         WHERE COALESCE(a.approve_status, 0) = 1
           AND COALESCE(d.sent_end, d.create_date_time_now) >= $1::timestamp
           AND COALESCE(d.sent_end, d.create_date_time_now) < $2::timestamp
           ${branchFilterJob(scope, "a")}
       )
       SELECT COUNT(*)::int AS legs,
         COUNT(*) FILTER (WHERE status = 1 AND sent_end IS NOT NULL
                            AND due_date IS NOT NULL AND sent_end::date > due_date)::int AS late,
         COUNT(*) FILTER (WHERE COALESCE(status, 0) = 2)::int AS cancelled,
         COUNT(*) FILTER (WHERE reschedule_date IS NOT NULL)::int AS rescheduled
       FROM legs`,
      [start, next]
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(d.cancel_reason_code), ''), 'unspecified') AS reason_code,
              COUNT(*)::int AS legs
       FROM public.odg_tms_detail d
       JOIN public.odg_tms a ON a.doc_no = d.doc_no
       WHERE COALESCE(d.status, 0) = 2
         AND COALESCE(a.approve_status, 0) = 1
         AND COALESCE(d.sent_end, d.create_date_time_now) >= $1::timestamp
         AND COALESCE(d.sent_end, d.create_date_time_now) < $2::timestamp
         ${branchFilterJob(scope, "a")}
       GROUP BY 1
       ORDER BY 2 DESC`,
      [start, next]
    ),
  ]);
  const legs = Number(totals?.legs) || 0;
  const items = [
    { key: "late", label: "ສົ່ງຊ້າກວ່າວັນນັດ", count: Number(totals?.late) || 0 },
    { key: "cancelled", label: "ສົ່ງບໍ່ສຳເລັດ / ຍົກເລີກ", count: Number(totals?.cancelled) || 0 },
    { key: "rescheduled", label: "ຖືກເລື່ອນວັນສົ່ງ", count: Number(totals?.rescheduled) || 0 },
  ].map((item) => ({ ...item, pct: legs > 0 ? (item.count / legs) * 100 : 0 }));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return {
    legs,
    total,
    total_pct: legs > 0 ? (total / legs) * 100 : 0,
    items,
    reasons: reasons.map((r) => ({
      reason_code: r.reason_code,
      label:
        r.reason_code === "unspecified"
          ? "ບໍ່ໄດ້ລະບຸສາເຫດ"
          : CANCEL_REASON_LABEL[r.reason_code] ?? r.reason_code,
      legs: Number(r.legs) || 0,
    })),
  };
}

module.exports = {
  CANCEL_REASON_LABEL,
  getMonthSnapshot,
  getOnTimeTrend,
  getTripsByWeekday,
  getRouteAnalysis,
  getVehicleUtilization,
  getFuelEfficiency,
  getExceptions,
};

// ແຫຼ່ງຂໍ້ມູນຂອງໜ້າ /reports/bi — Dashboard ພາບລວມການຂົນສົ່ງແບບ 1 ໜ້າຈໍ.
//
// ຫຼັກການ: ໜ້ານີ້ບໍ່ຄິດສູດໃໝ່ຂອງມັນເອງ. ຕົວເລກທຸກໂຕດຶງມາຈາກຄຳນິຍາມທີ່ໜ້າອື່ນ
// ໃຊ້ຢູ່ແລ້ວ ເພື່ອບໍ່ໃຫ້ຜູ້ບໍລິຫານເຫັນ 2 ຕົວເລກທີ່ບໍ່ກົງກັນຢູ່ 2 ໜ້າ:
//   • ອັດຕາສົ່ງທັນເວລາ = ນິຍາມດຽວກັບ kpi-alert.js (ສົ່ງສຳເລັດພາຍໃນວັນນັດ)
//   • ຍອດຄ້າງ / ສົ່ງສຳເລັດ / ຍົກເລີກ = getDeliveryPerformance() ໃນ reports.js
//   • ໄລຍະທາງ = odg_tms_gps_daily (rollup) ບໍ່ແມ່ນສະແກນ ping ດິບ
//   • ພື້ນທີ່ບັນທຸກ = buildUtilizationReport() ໃນ actions/trip-volume.ts
//
// ທຸກ slice ຮັບ `carCode` ໄດ້ (ຫວ່າງ/null = ທຸກຄັນ) ເພື່ອໃຫ້ໜ້າຈໍກັ່ນຕອງລົງ
// ລົດຄັນດຽວໄດ້. ຂໍ້ຍົກເວັ້ນມີແຕ່ getDeliveryPerformance() ໃນ reports.js ເພາະ
// ມັນນັບຢູ່ລະດັບ "ບິນ" ບໍ່ແມ່ນລະດັບ "ຖ້ຽວ" ຈຶ່ງບໍ່ມີມິຕິລົດໃຫ້ກັ່ນຕອງ.
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
 * "ລົດຂົນສົ່ງ" — ບ່ອນດຽວທີ່ນິຍາມ ໃຊ້ຮ່ວມກັນທຸກພາກ (ການໃຊ້ລົດ, ໄລຍະທາງ GPS,
 * ປະສິດທິພາບນ້ຳມັນ ແລະ ລາຍການໃນ dropdown) ເພື່ອໃຫ້ທຸກພາກນັບລົດຊຸດດຽວກັນ.
 *
 * ຕົວຕັດສິນແມ່ນ transport_code (ສາຂາທີ່ລົດສັງກັດ). odg_tms_car ຍັງເກັບ
 * ພາຫະນະທີ່ບໍ່ແມ່ນລົດຂົນສົ່ງນຳ — Forklift (transport_code = '') ແລະ ລົດທີ່
 * ຕິດ tracker ໄວ້ແຕ່ບໍ່ໄດ້ຜູກສາຂາ (transport_code IS NULL, ບໍ່ມີຖ້ຽວທັງປີ).
 * ຖ້າບໍ່ຕັດອອກ ຈຳນວນລົດຈະບວມ ແລະ ໄລຍະທາງກອງລົດຈະເກີນຄວາມຈິງ ~26%
 * (ວັດເມື່ອ 2026-08-19: 17,946 ກມ → 13,274 ກມ).
 */
const IS_TRANSPORT_CAR = `NULLIF(BTRIM(transport_code), '') IS NOT NULL`;

// miles_start / miles_end ເປັນ varchar (ຄົນຂັບພິມເອງ) — ຕັດຕົວອັກສອນອອກກ່ອນ
// ແປງເປັນຕົວເລກ ບໍ່ດັ່ງນັ້ນ query ລົ້ມທັງອັນຍ້ອນ 1 ແຖວທີ່ມີ "km" ຕິດມາ.
const odoNum = (col) => `NULLIF(regexp_replace(COALESCE(${col}, ''), '[^0-9.]', '', 'g'), '')::numeric`;

const monthRange = (month) => [`${month}-01`, getNextMonthStart(month)];

/** ຄ່າ carCode ທີ່ໃຊ້ໄດ້ຈິງ ຫຼື null ຖ້າ "ທຸກຄັນ" */
function cleanCar(carCode) {
  const value = String(carCode ?? "").trim();
  return value || null;
}

/**
 * ຕົວສ້າງ placeholder ຂອງ query — ຍູ້ຄ່າໃສ່ params ແລ້ວຄືນ `$n`.
 *
 * ຂຽນເປັນຕົວຊ່ວຍເພາະແຕ່ລະ slice ມີເງື່ອນໄຂທາງເລືອກ 2 ອັນ (ສາຂາ + ລົດ) —
 * ຖ້າຂຽນ `$3` ຕາຍຕົວ ການເພີ່ມເງື່ອນໄຂໃໝ່ຈະເລື່ອນເລກຂອງທຸກອັນທີ່ຕາມມາ.
 */
function makeParams(initial = []) {
  const params = [...initial];
  return {
    params,
    add(value) {
      params.push(value);
      return `$${params.length}`;
    },
  };
}

/** ຈຳນວນວັນໃນເດືອນ ຄິດດ້ວຍ string ລ້ວນໆ ບໍ່ແຕະ Date ຂອງເຄື່ອງ */
function daysInMonth(month) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

// ────────────────────────────────────────────────────────────────────────
// (0) ລາຍການລົດ ສຳລັບ dropdown ກັ່ນຕອງ
// ────────────────────────────────────────────────────────────────────────

/**
 * ລົດຂົນສົ່ງທັງໝົດທີ່ຜູ້ໃຊ້ເຫັນໄດ້ ພ້ອມຈຳນວນຖ້ຽວໃນເດືອນທີ່ເລືອກ.
 * ຈຳນວນຖ້ຽວມີໄວ້ໃຫ້ໜ້າຈໍເອົາລົດທີ່ບໍ່ໄດ້ແລ່ນເດືອນນັ້ນລົງລຸ່ມ.
 */
async function listTransportCars(session, month) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const p = makeParams([start, next]);
  const branchClause = scope.scoped ? `AND c.transport_code = ANY(${p.add(scope.branches)})` : "";
  const rows = await query(
    `SELECT c.code,
       COALESCE(NULLIF(TRIM(c.name_1), ''), c.code) AS name,
       COALESCE(c.transport_code, '') AS transport_code,
       COALESCE(NULLIF(TRIM(c.car_type), ''), '') AS car_type,
       (SELECT COUNT(*) FROM public.odg_tms a
         WHERE a.car = c.code
           AND a.doc_date >= $1::date AND a.doc_date < $2::date
           AND COALESCE(a.approve_status, 0) = 1)::int AS trips
     FROM public.odg_tms_car c
     WHERE NULLIF(BTRIM(c.transport_code), '') IS NOT NULL ${branchClause}
     ORDER BY trips DESC, name`,
    p.params
  );
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    transport_code: r.transport_code,
    car_type: r.car_type,
    trips: Number(r.trips) || 0,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// (1) ແກ່ນລາຍເດືອນ — ຖ້ຽວ, ບິນສົ່ງສຳເລັດ, ອັດຕາທັນເວລາ, ກມ, ຄ່ານ້ຳມັນ.
// ໃຊ້ຊ້ຳທັງເດືອນນີ້, ເດືອນກ່ອນ (ສຳລັບ "ທຽບເດືອນກ່ອນ") ແລະ ແນວໂນ້ມ 12 ເດືອນ.
// ────────────────────────────────────────────────────────────────────────

/**
 * ຖ້ຽວທີ່ອະນຸມັດແລ້ວໃນເດືອນ + ໄມລ໌ທີ່ຄົນຂັບບັນທຶກ.
 * @param {string} month YYYY-MM
 * @param {string|null} [carCode] ຫວ່າງ = ທຸກຄັນ
 */
async function getTripCore(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
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
       ${carClause}
       ${branchFilterJob(scope, "a")}`,
    p.params
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
async function getDeliveryCore(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
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
         ${carClause}
         ${branchFilterJob(scope, "a")}
     )
     SELECT
       COUNT(*)::int AS drops,
       COUNT(DISTINCT bill_no)::int AS bills,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL AND delivered_on <= due_date)::int AS on_time,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL AND delivered_on > due_date)::int AS late,
       COUNT(*) FILTER (WHERE due_date IS NULL)::int AS no_due
     FROM legs`,
    p.params
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
 * ນັບສະເພາະ tracker ທີ່ຕິດຢູ່ລົດຂົນສົ່ງ — ໃນ gps_daily ມີ tracker ທີ່ບໍ່ຢູ່ໃນ
 * ຕາຕະລາງລົດເລີຍ ແລະ ທີ່ຕິດຢູ່ພາຫະນະທີ່ບໍ່ແມ່ນລົດຂົນສົ່ງ.
 */
async function getGpsCore(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const fleetClauses = [IS_TRANSPORT_CAR];
  if (scope.scoped) fleetClauses.push(`transport_code = ANY(${p.add(scope.branches)})`);
  if (car) fleetClauses.push(`code = ${p.add(car)}`);
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
         WHERE ${fleetClauses.join(" AND ")}
       )`,
    p.params
  );
  return {
    distance_km: Number(row?.distance_km) || 0,
    trackers: Number(row?.trackers) || 0,
    active_car_days: Number(row?.active_car_days) || 0,
    moving_seconds: Number(row?.moving_seconds) || 0,
    stopped_seconds: Number(row?.stopped_seconds) || 0,
  };
}

/**
 * ຄ່ານ້ຳມັນລວມຂອງເດືອນ ແລະ ການແຍກຕາມຮູບແບບຈ່າຍ.
 *
 * ຊ່ອງ odg_tms_fuel_log.car ບາງແຖວເກັບ "ລະຫັດລົດ" ບາງແຖວເກັບ "ຊື່ລົດ" ຈຶ່ງ
 * ຕ້ອງທຽບທັງສອງແບບ ບໍ່ດັ່ງນັ້ນການກັ່ນຕອງລາຍຄັນຈະຫຼຸດໃບບິນໄປເຄິ່ງໜຶ່ງ.
 */
async function getFuelCore(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const clauses = [`fuel_date >= $1::date`, `fuel_date < $2::date`];
  if (scope.scoped) {
    clauses.push(`(transport_code = ANY(${p.add(scope.branches)}) OR transport_code IS NULL)`);
  }
  if (car) {
    const ref = p.add(car);
    clauses.push(
      `(TRIM(car::text) = ${ref}
        OR EXISTS (SELECT 1 FROM public.odg_tms_car c
                    WHERE c.code = ${ref}
                      AND upper(TRIM(c.name_1::text)) = upper(TRIM(odg_tms_fuel_log.car::text))))`
    );
  }
  // ນັບສະເພາະນ້ຳມັນຂອງລົດຂົນສົ່ງ — ບໍ່ດັ່ງນັ້ນນ້ຳມັນຂອງ Forklift ແລະ ພາຫະນະ
  // ທີ່ຍັງບໍ່ໄດ້ຜູກສາຂາ ຈະດັນ "ຄ່ານ້ຳມັນ/ຖ້ຽວ" ແລະ "ຄ່ານ້ຳມັນ/ກມ" ໃຫ້ສູງເກີນຈິງ
  // (ວັດ 2026-08: 5,658,400 ກີບ ≈ 9%). ຍອດທີ່ຕັດອອກຍັງຄືນໄປໃຫ້ໜ້າຈໍສະແດງ
  // ບໍ່ໄດ້ລຶບຖິ້ມງຽບໆ — ສ່ວນຫຼາຍແມ່ນລົດທີ່ລືມຕັ້ງສາຂາ.
  const IS_FLEET_ROW = `EXISTS (
    SELECT 1 FROM public.odg_tms_car c
     WHERE NULLIF(BTRIM(c.transport_code), '') IS NOT NULL
       AND (TRIM(c.code::text) = TRIM(odg_tms_fuel_log.car::text)
         OR upper(TRIM(c.name_1::text)) = upper(TRIM(odg_tms_fuel_log.car::text))))`;
  const where = clauses.join(" AND ");
  // ແຖວທີ່ຊ່ອງ liters ຖືກປ້ອນເປັນຈຳນວນເງິນ (ບັນຫາຂໍ້ມູນທີ່ຮູ້ຢູ່ແລ້ວ) ຖືກແຍກ
  // ອອກຈາກຍອດລິດ ແຕ່ຍອດ "ເງິນ" ຂອງມັນຍັງນັບ — ໃບບິນນັ້ນຈ່າຍເງິນຈິງ.
  const [totals, byType] = await Promise.all([
    queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE ${IS_FLEET_ROW})::int AS refills,
         COALESCE(SUM(amount) FILTER (WHERE ${IS_FLEET_ROW}), 0)::float AS amount,
         COALESCE(SUM(liters) FILTER (
           WHERE ${IS_FLEET_ROW} AND liters BETWEEN ${MIN_PLAUSIBLE_LITERS} AND ${MAX_PLAUSIBLE_LITERS}), 0)::float AS liters,
         COUNT(*) FILTER (WHERE ${IS_FLEET_ROW} AND liters > ${MAX_PLAUSIBLE_LITERS})::int AS suspect_rows,
         COALESCE(SUM(amount) FILTER (WHERE NOT ${IS_FLEET_ROW}), 0)::float AS excluded_amount,
         COUNT(*) FILTER (WHERE NOT ${IS_FLEET_ROW})::int AS excluded_refills
       FROM public.odg_tms_fuel_log
       WHERE ${where}`,
      p.params
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(fuel_type), ''), 'unspecified') AS fuel_type,
              COUNT(*)::int AS refills,
              COALESCE(SUM(amount), 0)::float AS amount
       FROM public.odg_tms_fuel_log
       WHERE ${where} AND ${IS_FLEET_ROW}
       GROUP BY 1
       ORDER BY 3 DESC`,
      p.params
    ),
  ]);
  return {
    refills: Number(totals?.refills) || 0,
    amount: Number(totals?.amount) || 0,
    liters: Number(totals?.liters) || 0,
    suspect_rows: Number(totals?.suspect_rows) || 0,
    excluded_amount: Number(totals?.excluded_amount) || 0,
    excluded_refills: Number(totals?.excluded_refills) || 0,
    by_type: byType.map((r) => ({
      fuel_type: r.fuel_type,
      refills: Number(r.refills) || 0,
      amount: Number(r.amount) || 0,
    })),
  };
}

/** ໜຶ່ງເດືອນຄົບຊຸດ — ໃຊ້ທັງເດືອນທີ່ເລືອກ ແລະ ເດືອນກ່ອນ ເພື່ອທຽບກັນ */
async function getMonthSnapshot(session, month, carCode) {
  const [trips, delivery, gps, fuel] = await Promise.all([
    getTripCore(session, month, carCode),
    getDeliveryCore(session, month, carCode),
    getGpsCore(session, month, carCode),
    getFuelCore(session, month, carCode),
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

async function getOnTimeTrend(session, year, carCode) {
  const scope = getBranchScope(session);
  const car = cleanCar(carCode);
  const p = makeParams([`${year}-01-01`, `${year + 1}-01-01`]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
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
         ${carClause}
         ${branchFilterJob(scope, "a")}
     )
     SELECT month,
       COUNT(*)::int AS drops,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL)::int AS measurable,
       COUNT(*) FILTER (WHERE due_date IS NOT NULL AND delivered_on <= due_date)::int AS on_time
     FROM legs
     GROUP BY month
     ORDER BY month`,
    p.params
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
async function getTripsByWeekday(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const rows = await query(
    `SELECT EXTRACT(ISODOW FROM a.doc_date)::int AS dow, COUNT(*)::int AS trips
     FROM public.odg_tms a
     WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
       AND COALESCE(a.approve_status, 0) = 1
       ${carClause}
       ${branchFilterJob(scope, "a")}
     GROUP BY 1`,
    p.params
  );
  const byDow = new Map(rows.map((r) => [Number(r.dow), Number(r.trips) || 0]));
  return Array.from({ length: 7 }, (_, i) => ({ dow: i + 1, trips: byDow.get(i + 1) ?? 0 }));
}

/**
 * ສາຍທາງທີ່ໃຊ້ຫຼາຍທີ່ສຸດ ພ້ອມອັດຕາທັນເວລາຂອງແຕ່ລະສາຍ.
 * ຖ້ຽວທີ່ບໍ່ໄດ້ຕິດສາຍທາງ ຖືກລວມເປັນແຖວດຽວ "ບໍ່ໄດ້ລະບຸສາຍ" ບໍ່ຖິ້ມຖິ້ມ
 * ບໍ່ດັ່ງນັ້ນຍອດຖ້ຽວໃນຕາຕະລາງນີ້ຈະບໍ່ກົງກັບຍອດຖ້ຽວຂ້າງເທິງ.
 */
async function getRouteAnalysis(session, month, limit = 8, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const rows = await query(
    `WITH trips AS (
       SELECT a.doc_no,
         COALESCE(NULLIF(TRIM(a.delivery_route_code), ''), '—') AS route_code
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         ${carClause}
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
    p.params
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
 * ເມື່ອກັ່ນຕອງລົດຄັນດຽວ ໂຕຫານກາຍເປັນ 1 ຄັນ × ວັນໃນເດືອນ ຈຶ່ງອ່ານໄດ້ວ່າ
 * "ຄັນນີ້ອອກຖ້ຽວ ຈັກ % ຂອງວັນໃນເດືອນ".
 */
async function getVehicleUtilization(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);

  const fleetP = makeParams([]);
  const fleetClauses = [IS_TRANSPORT_CAR];
  if (scope.scoped) fleetClauses.push(`transport_code = ANY(${fleetP.add(scope.branches)})`);
  if (car) fleetClauses.push(`code = ${fleetP.add(car)}`);

  const usedP = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${usedP.add(car)}` : "";

  const [fleetRow, usedRow] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS total_cars
       FROM public.odg_tms_car WHERE ${fleetClauses.join(" AND ")}`,
      fleetP.params
    ),
    queryOne(
      `SELECT COUNT(DISTINCT a.car)::int AS used_cars,
              COUNT(DISTINCT (a.car, a.doc_date::date))::int AS car_days
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         AND NULLIF(TRIM(a.car), '') IS NOT NULL
         ${carClause}
         ${branchFilterJob(scope, "a")}`,
      usedP.params
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
async function getFuelEfficiency(session, month, limit = 12, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClauses = [`NULLIF(BTRIM(c.transport_code), '') IS NOT NULL`];
  let fuelBranch = "";
  if (scope.scoped) {
    // ຕົວດຽວກັນຖືກໃຊ້ 2 ບ່ອນ (ຕາຕະລາງລົດ ແລະ ໃບບິນນ້ຳມັນ) — ຈຶ່ງເກັບ
    // placeholder ໄວ້ ບໍ່ຍູ້ຄ່າຊ້ຳ
    const ref = p.add(scope.branches);
    carClauses.push(`c.transport_code = ANY(${ref})`);
    fuelBranch = `AND (f.transport_code = ANY(${ref}) OR f.transport_code IS NULL)`;
  }
  if (car) carClauses.push(`c.code = ${p.add(car)}`);
  const rows = await query(
    `WITH cars AS (
       SELECT c.code, COALESCE(NULLIF(TRIM(c.name_1), ''), c.code) AS car_name,
              NULLIF(TRIM(c.imei), '') AS imei
       FROM public.odg_tms_car c
       WHERE ${carClauses.join(" AND ")}
     ),
     dup AS (
       SELECT imei FROM public.odg_tms_car
       WHERE NULLIF(TRIM(imei), '') IS NOT NULL
       GROUP BY imei HAVING COUNT(*) > 1
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
    p.params
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

async function getExceptions(session, month, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = monthRange(month);
  const car = cleanCar(carCode);
  const totalsP = makeParams([start, next]);
  const totalsCar = car ? `AND a.car = ${totalsP.add(car)}` : "";
  const reasonsP = makeParams([start, next]);
  const reasonsCar = car ? `AND a.car = ${reasonsP.add(car)}` : "";
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
           ${totalsCar}
           ${branchFilterJob(scope, "a")}
       )
       SELECT COUNT(*)::int AS legs,
         COUNT(*) FILTER (WHERE status = 1 AND sent_end IS NOT NULL
                            AND due_date IS NOT NULL AND sent_end::date > due_date)::int AS late,
         COUNT(*) FILTER (WHERE COALESCE(status, 0) = 2)::int AS cancelled,
         COUNT(*) FILTER (WHERE reschedule_date IS NOT NULL)::int AS rescheduled
       FROM legs`,
      totalsP.params
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
         ${reasonsCar}
         ${branchFilterJob(scope, "a")}
       GROUP BY 1
       ORDER BY 2 DESC`,
      reasonsP.params
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
  listTransportCars,
  getMonthSnapshot,
  getOnTimeTrend,
  getTripsByWeekday,
  getRouteAnalysis,
  getVehicleUtilization,
  getFuelEfficiency,
  getExceptions,
};

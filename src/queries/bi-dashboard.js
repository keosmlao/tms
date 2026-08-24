// ແຫຼ່ງຂໍ້ມູນຂອງໜ້າ /reports/bi — Dashboard ພາບລວມການຂົນສົ່ງແບບ 1 ໜ້າຈໍ.
//
// ຫຼັກການ: ໜ້ານີ້ບໍ່ຄິດສູດໃໝ່ຂອງມັນເອງ. ຕົວເລກທຸກໂຕດຶງມາຈາກຄຳນິຍາມທີ່ໜ້າອື່ນ
// ໃຊ້ຢູ່ແລ້ວ ເພື່ອບໍ່ໃຫ້ຜູ້ບໍລິຫານເຫັນ 2 ຕົວເລກທີ່ບໍ່ກົງກັນຢູ່ 2 ໜ້າ:
//   • ອັດຕາສົ່ງທັນເວລາ = deliveryDueDateSql() ໃນ helpers.js — ອັນດຽວກັບ
//     ໜ້າຫຼັກ, ຄະແນນຄົນຂັບ ແລະ kpi-alert.js (ສົ່ງສຳເລັດພາຍໃນວັນນັດຄັ້ງທຳອິດ)
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
const {
  getBranchScope,
  branchFilterJob,
  deliveryDueDateSql,
  firstPromiseSql,
} = require("./helpers");
const { addDays } = require("../lib/lao-date");
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

// ວັນນັດທີ່ເອົາມາວັດ "ສົ່ງທັນເວລາ" — ນິຍາມກາງຢູ່ helpers.js (deliveryDueDateSql)
// ເພື່ອໃຫ້ໜ້ານີ້, ໜ້າຫຼັກ, ຄະແນນຄົນຂັບ ແລະ ແຈ້ງເຕືອນ KPI ໃຊ້ສູດດຽວກັນ.
const dueDateSql = deliveryDueDateSql;

/**
 * ຊ່ວງວັນທີທີ່ທຸກ slice ຂອງໜ້ານີ້ໃຊ້ຮ່ວມກັນ.
 *
 * range = { from, to } ເປັນ YYYY-MM-DD ແລະ **ລວມວັນທ້າຍ (to) ນຳ** ຕາມທີ່ຜູ້ໃຊ້
 * ເຂົ້າໃຈ. SQL ຢູ່ນີ້ທຽບແບບ `>= start AND < next` ໝົດ (ບໍ່ໃຊ້ BETWEEN) ເພາະ
 * ບາງຖັນເປັນ timestamp — ຖ້າໃຊ້ BETWEEN ຈະຕົກແຖວຂອງວັນສຸດທ້າຍທີ່ມີເວລາຕິດມາ.
 */
function rangeBounds(range) {
  const from = String(range?.from ?? "").slice(0, 10);
  const to = String(range?.to ?? "").slice(0, 10);
  return [from, addDays(to, 1)];
}

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

/** ຈຳນວນວັນໃນຊ່ວງ (ລວມທັງສອງທ້າຍ) — Date.UTC ລ້ວນໆ ບໍ່ແຕະ TZ ຂອງເຄື່ອງ */
function rangeDays(range) {
  const [start, next] = rangeBounds(range);
  const ms = Date.parse(`${next}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

// ────────────────────────────────────────────────────────────────────────
// (0) ລາຍການລົດ ສຳລັບ dropdown ກັ່ນຕອງ
// ────────────────────────────────────────────────────────────────────────

/**
 * ລົດຂົນສົ່ງທັງໝົດທີ່ຜູ້ໃຊ້ເຫັນໄດ້ ພ້ອມຈຳນວນຖ້ຽວໃນຊ່ວງທີ່ເລືອກ.
 * ຈຳນວນຖ້ຽວມີໄວ້ໃຫ້ໜ້າຈໍເອົາລົດທີ່ບໍ່ໄດ້ແລ່ນໃນຊ່ວງນັ້ນລົງລຸ່ມ.
 */
/**
 * ສາຂາຂົນສົ່ງທີ່ໃຫ້ເລືອກໃນ filter — ອ່ານຈາກທະບຽນລົດ (ສາຂາທີ່ມີລົດ = ສາຂາທີ່
 * ອອກຖ້ຽວໄດ້) ຈຶ່ງບໍ່ຕ້ອງສະແກນຕາຕະລາງຖ້ຽວທັງປີ. ຜູ້ໃຊ້ທີ່ຜູກສາຂາ ເຫັນສະເພາະ
 * ສາຂາຕົນ ຄືກັບຄຳຖາມອື່ນໃນໜ້ານີ້.
 */
async function listTransportBranches(session) {
  const scope = getBranchScope(session);
  const p = makeParams([]);
  const branchClause = scope.scoped ? `AND c.transport_code = ANY(${p.add(scope.branches)})` : "";
  const rows = await query(
    `SELECT c.transport_code AS code,
       COALESCE(NULLIF(TRIM(tt.name_1), ''), c.transport_code) AS name,
       COUNT(*)::int AS cars
     FROM public.odg_tms_car c
     LEFT JOIN transport_type tt ON tt.code = c.transport_code
     WHERE NULLIF(BTRIM(c.transport_code), '') IS NOT NULL ${branchClause}
     GROUP BY 1, 2
     ORDER BY name`,
    p.params
  );
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    cars: Number(r.cars) || 0,
  }));
}

async function listTransportCars(session, range) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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
// (1) ແກ່ນຂອງຊ່ວງ — ຖ້ຽວ, ບິນສົ່ງສຳເລັດ, ອັດຕາທັນເວລາ, ກມ, ຄ່ານ້ຳມັນ.
// ໃຊ້ຊ້ຳທັງຊ່ວງທີ່ເລືອກ ແລະ ຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນ (ສຳລັບ "ທຽບຊ່ວງກ່ອນ").
// ────────────────────────────────────────────────────────────────────────

/**
 * ຖ້ຽວທີ່ອະນຸມັດແລ້ວໃນຊ່ວງ + ໄມລ໌ທີ່ຄົນຂັບບັນທຶກ.
 * @param {{from: string, to: string}} range ຊ່ວງວັນທີ (ລວມ to)
 * @param {string|null} [carCode] ຫວ່າງ = ທຸກຄັນ
 */
async function getTripCore(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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
 * ບິນທີ່ສົ່ງເຖິງມືລູກຄ້າໃນຊ່ວງ ແລະ ອັດຕາທັນເວລາ.
 *
 * "ທັນເວລາ" = ວັນທີ່ສົ່ງສຳເລັດ ≤ ວັນນັດ. ວັນນັດເອົາຕາມລຳດັບ: ວັນນັດທີ່ຜູ້ຈັດ
 * ຕັ້ງໄວ້ (odg_tms_pending_bill.scheduled_date) → ວັນສົ່ງໃນບິນຂາຍ
 * (ic_trans.send_date) → ວັນທີ່ບິນ. ນິຍາມດຽວກັນກັບ kpi-alert.js.
 */
async function getDeliveryCore(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const row = await queryOne(
    `WITH legs AS (
       SELECT d.bill_no,
         d.sent_end::date AS delivered_on,
         ${dueDateSql("d.bill_no", "pb", "t", "d")} AS due_date,
         ${firstPromiseSql("d.bill_no")} AS first_promise,
         (SELECT COUNT(*) FROM public.odg_tms_pending_bill_history h2
           WHERE h2.bill_no = d.bill_no AND h2.scheduled_date IS NOT NULL)::int AS promise_writes
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
       COUNT(*) FILTER (WHERE due_date IS NULL)::int AS no_due,
       -- ຄວາມໜ້າເຊື່ອຖືຂອງຕົວວັດ: ວັດຈາກນັດເດີມໄດ້ຈັກຈຸດ ແລະ ຖືກເລື່ອນນັດຈັກບິນ
       COUNT(*) FILTER (WHERE first_promise IS NOT NULL)::int AS from_first_promise,
       COUNT(DISTINCT bill_no) FILTER (WHERE promise_writes > 1)::int AS rescheduled_bills
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
    from_first_promise: Number(row?.from_first_promise) || 0,
    rescheduled_bills: Number(row?.rescheduled_bills) || 0,
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
async function getGpsCore(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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
 * ຄ່ານ້ຳມັນລວມຂອງຊ່ວງ ແລະ ການແຍກຕາມຮູບແບບຈ່າຍ.
 *
 * ຊ່ອງ odg_tms_fuel_log.car ບາງແຖວເກັບ "ລະຫັດລົດ" ບາງແຖວເກັບ "ຊື່ລົດ" ຈຶ່ງ
 * ຕ້ອງທຽບທັງສອງແບບ ບໍ່ດັ່ງນັ້ນການກັ່ນຕອງລາຍຄັນຈະຫຼຸດໃບບິນໄປເຄິ່ງໜຶ່ງ.
 */
async function getFuelCore(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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

/** ໜຶ່ງຊ່ວງຄົບຊຸດ — ໃຊ້ທັງຊ່ວງທີ່ເລືອກ ແລະ ຊ່ວງກ່ອນໜ້າ ເພື່ອທຽບກັນ */
async function getRangeSnapshot(session, range, carCode) {
  const [trips, delivery, gps, fuel] = await Promise.all([
    getTripCore(session, range, carCode),
    getDeliveryCore(session, range, carCode),
    getGpsCore(session, range, carCode),
    getFuelCore(session, range, carCode),
  ]);
  // ໄລຍະທາງທີ່ເອົາມາຄິດຕົ້ນທຶນ/ກມ: GPS ກ່ອນ ເພາະຄຸມທຸກຄັນທີ່ມີ tracker;
  // ຖ້າຊ່ວງນັ້ນ GPS ຍັງບໍ່ມີຂໍ້ມູນ ຈຶ່ງຖອຍໄປໃຊ້ເລກໄມລ໌ທີ່ຄົນຂັບບັນທຶກ.
  const km = gps.distance_km > 0 ? gps.distance_km : trips.odometer_km;
  const kmSource = gps.distance_km > 0 ? "gps" : trips.odometer_km > 0 ? "odometer" : "none";
  return {
    from: range.from,
    to: range.to,
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
         ${dueDateSql("d.bill_no", "pb", "t", "d")} AS due_date
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
async function getTripsByWeekday(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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
async function getRouteAnalysis(session, range, limit = 8, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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
             AND ${dueDateSql("d.bill_no", "pb", "ic", "d")} IS NOT NULL
         )::int AS measurable,
         COUNT(*) FILTER (
           WHERE d.status = 1 AND d.sent_end IS NOT NULL
             AND d.sent_end::date <= ${dueDateSql("d.bill_no", "pb", "ic", "d")}
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
 * ລົດທັງໝົດ vs ລົດທີ່ອອກຖ້ຽວໃນຊ່ວງທີ່ເລືອກ.
 *
 * "ອັດຕາການໃຊ້" = ວັນ-ຄັນ ທີ່ມີຖ້ຽວ ÷ (ຈຳນວນລົດທັງໝົດ × ວັນໃນຊ່ວງ).
 * ບໍ່ແມ່ນ % ຂອງພື້ນທີ່ບັນທຸກ — ອັນນັ້ນຢູ່ພາກ "ການໃຊ້ພື້ນທີ່ບັນທຸກ".
 * ເມື່ອກັ່ນຕອງລົດຄັນດຽວ ໂຕຫານກາຍເປັນ 1 ຄັນ × ວັນໃນຊ່ວງ ຈຶ່ງອ່ານໄດ້ວ່າ
 * "ຄັນນີ້ອອກຖ້ຽວ ຈັກ % ຂອງວັນໃນຊ່ວງ".
 */
async function getVehicleUtilization(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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
  const days = rangeDays(range);
  return {
    total_cars: totalCars,
    used_cars: usedCars,
    idle_cars: Math.max(0, totalCars - usedCars),
    car_days: carDays,
    days: days,
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
async function getFuelEfficiency(session, range, limit = 12, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
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

async function getExceptions(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const totalsP = makeParams([start, next]);
  const totalsCar = car ? `AND a.car = ${totalsP.add(car)}` : "";
  const reasonsP = makeParams([start, next]);
  const reasonsCar = car ? `AND a.car = ${reasonsP.add(car)}` : "";
  const [totals, reasons] = await Promise.all([
    queryOne(
      `WITH legs AS (
         SELECT d.status, d.cancel_reason_code, d.reschedule_date, d.sent_end,
           ${dueDateSql("d.bill_no", "pb", "t", "d")} AS due_date
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

// ────────────────────────────────────────────────────────────────────────
// (9.1) ເສັ້ນເວລາລາຍວັນ — ພໍເລືອກຊ່ວງວັນທີໄດ້ ກໍ່ຕ້ອງເຫັນວ່າມື້ໃດຕົກມື້ໃດພຸ່ງ
// ────────────────────────────────────────────────────────────────────────

/**
 * ຖ້ຽວ / ຈຸດສົ່ງ / ກມ / ຄ່ານ້ຳມັນ ແຍກຕາມວັນຈິງໃນຊ່ວງທີ່ເລືອກ.
 *
 * generate_series ເຮັດໃຫ້ວັນທີ່ບໍ່ມີງານກໍ່ຍັງມີແຖວ (ຄ່າ 0) — ບໍ່ດັ່ງນັ້ນວັນພັກ
 * ຈະຫາຍໄປຈາກກຣາຟ ແລ້ວເສັ້ນຈະເບິ່ງຄືວ່າແລ່ນຕໍ່ເນື່ອງທັງທີ່ຈິງແລ້ວຢຸດ.
 */
async function getDailyTrend(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);

  const p = makeParams([start, next]);
  const tripCar = car ? `AND a.car = ${p.add(car)}` : "";
  const gpsFleet = [IS_TRANSPORT_CAR];
  if (scope.scoped) gpsFleet.push(`c.transport_code = ANY(${p.add(scope.branches)})`);
  if (car) gpsFleet.push(`c.code = ${p.add(car)}`);
  const fuelClauses = [];
  if (scope.scoped) fuelClauses.push(`(l.transport_code = ANY(${p.add(scope.branches)}) OR l.transport_code IS NULL)`);
  if (car) {
    const ref = p.add(car);
    fuelClauses.push(
      `(TRIM(l.car::text) = ${ref}
        OR EXISTS (SELECT 1 FROM public.odg_tms_car c2
                    WHERE c2.code = ${ref}
                      AND upper(TRIM(c2.name_1::text)) = upper(TRIM(l.car::text))))`
    );
  }
  const fuelExtra = fuelClauses.length ? `AND ${fuelClauses.join(" AND ")}` : "";

  const rows = await query(
    `WITH days AS (
       SELECT generate_series($1::date, $2::date - 1, interval '1 day')::date AS day
     )
     -- ຄືນເປັນ text: ຊັ້ນ db ແປງແຖວດ້ວຍ JSON ຈຶ່ງເຮັດໃຫ້ຊະນິດ date ກາຍເປັນ
     -- ເວລາ UTC ແລ້ວເລື່ອນວັນໄປ 1 ມື້ຢູ່ເຄື່ອງ +07
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
       (SELECT COUNT(*) FROM public.odg_tms a
         WHERE a.doc_date::date = d.day
           AND COALESCE(a.approve_status, 0) = 1
           ${tripCar}
           ${branchFilterJob(scope, "a")})::int AS trips,
       (SELECT COUNT(*) FROM public.odg_tms_detail dd
          JOIN public.odg_tms a ON a.doc_no = dd.doc_no
         WHERE dd.status = 1 AND dd.sent_end::date = d.day
           AND COALESCE(a.approve_status, 0) = 1
           ${tripCar}
           ${branchFilterJob(scope, "a")})::int AS drops,
       (SELECT COALESCE(SUM(g.distance_km), 0) FROM public.odg_tms_gps_daily g
         WHERE g.usage_date = d.day
           AND g.imei IN (SELECT NULLIF(BTRIM(c.imei), '') FROM public.odg_tms_car c
                           WHERE ${gpsFleet.join(" AND ")}))::float AS km,
       (SELECT COALESCE(SUM(l.amount), 0) FROM public.odg_tms_fuel_log l
         WHERE l.fuel_date = d.day
           ${fuelExtra}
           AND EXISTS (SELECT 1 FROM public.odg_tms_car c3
                        WHERE NULLIF(BTRIM(c3.transport_code), '') IS NOT NULL
                          AND (TRIM(c3.code::text) = TRIM(l.car::text)
                            OR upper(TRIM(c3.name_1::text)) = upper(TRIM(l.car::text)))))::float AS fuel
     FROM days d
     ORDER BY d.day`,
    p.params
  );
  return rows.map((r) => ({
    day: String(r.day).slice(0, 10),
    trips: Number(r.trips) || 0,
    drops: Number(r.drops) || 0,
    km: Number(r.km) || 0,
    fuel: Number(r.fuel) || 0,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// (9.2) ມິຕິທີ່ຂາດໄປ — ຄົນຂັບ, ສາຂາ, ລູກຄ້າ
// ────────────────────────────────────────────────────────────────────────

/** ຄົນຂັບລາຍຄົນ — ຖ້ຽວ, ຈຸດສົ່ງ ແລະ ອັດຕາທັນເວລາ (ນິຍາມດຽວກັບພາກ ③) */
async function getDriverPerformance(session, range, limit = 12, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const rows = await query(
    `WITH trips AS (
       SELECT a.driver, COUNT(*)::int AS trips
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         AND NULLIF(TRIM(a.driver), '') IS NOT NULL
         ${carClause}
         ${branchFilterJob(scope, "a")}
       GROUP BY a.driver
     ),
     -- ນັບສະເພາະຈຸດທີ່ສົ່ງສຳເລັດ ເປັນຖານຂອງ "ທັນເວລາ"; ຈຸດທີ່ຍົກເລີກນັບແຍກ
     -- ບໍ່ດັ່ງນັ້ນຖານຫານຈະນ້ອຍກວ່າຕົວເລກເທິງ ແລ້ວອອກມາເກີນ 100%
     legs AS (
       SELECT a.driver,
         COUNT(*) FILTER (WHERE d.status = 1 AND d.sent_end IS NOT NULL)::int AS drops,
         COUNT(*) FILTER (
           WHERE d.status = 1 AND d.sent_end IS NOT NULL
             AND ${dueDateSql("d.bill_no", "pb", "t", "d")} IS NOT NULL
             AND d.sent_end::date <= ${dueDateSql("d.bill_no", "pb", "t", "d")}
         )::int AS on_time,
         COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled
       FROM public.odg_tms_detail d
       JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       WHERE COALESCE(a.approve_status, 0) = 1
         AND COALESCE(d.sent_end, d.create_date_time_now) >= $1::timestamp
         AND COALESCE(d.sent_end, d.create_date_time_now) < $2::timestamp
         AND NULLIF(TRIM(a.driver), '') IS NOT NULL
         ${carClause}
         ${branchFilterJob(scope, "a")}
       GROUP BY a.driver
     )
     SELECT tr.driver AS code,
       COALESCE(NULLIF(TRIM(dv.name_1), ''), tr.driver) AS name,
       tr.trips,
       COALESCE(lg.drops, 0)::int AS drops,
       COALESCE(lg.on_time, 0)::int AS on_time,
       COALESCE(lg.cancelled, 0)::int AS cancelled
     FROM trips tr
     LEFT JOIN legs lg ON lg.driver = tr.driver
     LEFT JOIN public.odg_tms_driver dv ON dv.code = tr.driver
     ORDER BY tr.trips DESC, name
     LIMIT ${Number(limit) || 12}`,
    p.params
  );
  return rows.map((r) => {
    const drops = Number(r.drops) || 0;
    const cancelled = Number(r.cancelled) || 0;
    const measurable = drops;
    const onTime = Number(r.on_time) || 0;
    const trips = Number(r.trips) || 0;
    return {
      code: r.code,
      name: r.name,
      trips,
      drops,
      cancelled,
      drops_per_trip: trips > 0 ? drops / trips : 0,
      on_time_pct: measurable > 0 ? (onTime / measurable) * 100 : null,
    };
  });
}

/**
 * ສາຂາລາຍແຫ່ງ — ຖ້ຽວ, ຈຸດສົ່ງ ແລະ ອັດຕາທັນເວລາ.
 *
 * ⚠️ ເຫັນໄດ້ສະເພາະສາຂາທີ່ login ນີ້ມີສິດ (branch_codes) — ຜູ້ໃຊ້ທີ່ບໍ່ຜູກສາຂາ
 * ຈຶ່ງເຫັນຄົບທຸກແຫ່ງ. ໜ້າຈໍຕ້ອງບອກຈຳນວນສາຂາທີ່ນັບ ບໍ່ດັ່ງນັ້ນຈະເຂົ້າໃຈວ່າ
 * ບໍລິສັດມີພຽງເທົ່ານີ້.
 */
async function getBranchBreakdown(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const rows = await query(
    `WITH trips AS (
       SELECT COALESCE(NULLIF(TRIM(a.origin_transport_code), ''), '(ບໍ່ລະບຸສາຂາ)') AS branch_code,
         COUNT(*)::int AS trips,
         COUNT(DISTINCT a.car)::int AS cars
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         ${carClause}
         ${branchFilterJob(scope, "a")}
       GROUP BY 1
     ),
     legs AS (
       SELECT COALESCE(NULLIF(TRIM(a.origin_transport_code), ''), '(ບໍ່ລະບຸສາຂາ)') AS branch_code,
         COUNT(*)::int AS drops,
         COUNT(*) FILTER (
           WHERE ${dueDateSql("d.bill_no", "pb", "t", "d")} IS NOT NULL
             AND d.sent_end::date <= ${dueDateSql("d.bill_no", "pb", "t", "d")}
         )::int AS on_time
       FROM public.odg_tms_detail d
       JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN public.ic_trans t ON t.doc_no = d.bill_no
       WHERE d.status = 1 AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
         ${carClause}
         ${branchFilterJob(scope, "a")}
       GROUP BY 1
     )
     SELECT tr.branch_code,
       COALESCE(NULLIF(TRIM(tt.name_1), ''), tr.branch_code) AS branch_name,
       tr.trips, tr.cars,
       COALESCE(lg.drops, 0)::int AS drops,
       COALESCE(lg.on_time, 0)::int AS on_time
     FROM trips tr
     LEFT JOIN legs lg ON lg.branch_code = tr.branch_code
     LEFT JOIN transport_type tt ON tt.code = tr.branch_code
     ORDER BY tr.trips DESC`,
    p.params
  );
  return rows.map((r) => {
    const drops = Number(r.drops) || 0;
    return {
      branch_code: r.branch_code,
      branch_name: r.branch_name,
      trips: Number(r.trips) || 0,
      cars: Number(r.cars) || 0,
      drops,
      on_time_pct: drops > 0 ? ((Number(r.on_time) || 0) / drops) * 100 : null,
    };
  });
}

/** ລູກຄ້າທີ່ໃຊ້ຖ້ຽວຫຼາຍທີ່ສຸດ ພ້ອມຈຳນວນຈຸດທີ່ສົ່ງຊ້າ */
async function getTopCustomers(session, range, limit = 10, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const rows = await query(
    `SELECT COALESCE(NULLIF(TRIM(cu.name_1), ''), NULLIF(TRIM(t.cust_code), ''), '(ບໍ່ລະບຸລູກຄ້າ)') AS customer,
       COUNT(*)::int AS drops,
       COUNT(DISTINCT d.bill_no)::int AS bills,
       COUNT(*) FILTER (
         WHERE ${dueDateSql("d.bill_no", "pb", "t", "d")} IS NOT NULL
           AND d.sent_end::date > ${dueDateSql("d.bill_no", "pb", "t", "d")}
       )::int AS late
     FROM public.odg_tms_detail d
     JOIN public.odg_tms a ON a.doc_no = d.doc_no
     LEFT JOIN LATERAL (
       SELECT tt.cust_code, tt.send_date FROM public.ic_trans tt
       WHERE tt.doc_no = d.bill_no ORDER BY tt.doc_date, tt.doc_time LIMIT 1
     ) t ON true
     LEFT JOIN public.ar_customer cu ON cu.code = t.cust_code
     LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
     WHERE d.status = 1 AND d.sent_end IS NOT NULL
       AND COALESCE(a.approve_status, 0) = 1
       AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
       ${carClause}
       ${branchFilterJob(scope, "a")}
     GROUP BY 1
     ORDER BY 2 DESC
     LIMIT ${Number(limit) || 10}`,
    p.params
  );
  return rows.map((r) => ({
    customer: r.customer,
    drops: Number(r.drops) || 0,
    bills: Number(r.bills) || 0,
    late: Number(r.late) || 0,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// (9.3) ຄວາມປອດໄພ ແລະ ການໃຊ້ລົດຈິງ — ມາຈາກ rollup GPS ທີ່ມີຢູ່ແລ້ວ
// ────────────────────────────────────────────────────────────────────────

/**
 * ຄວາມໄວ ແລະ ຊົ່ວໂມງຂັບ ລາຍຄັນ.
 *
 * odg_tms_gps_daily ເກັບ max_speed ແລະ moving_seconds ໄວ້ທຸກວັນຢູ່ແລ້ວ ແຕ່ບໍ່
 * ມີໜ້າໃດເອົາມາໃຊ້ — ວັດ 2026-08 ພົບຄັນໜຶ່ງແຕະ 101 ກມ/ຊມ. ບວກຢູ່ລະດັບ imei
 * ຄືກັບ getGpsCore ເພື່ອບໍ່ໃຫ້ tracker ທີ່ຜູກ 2 ຄັນຖືກນັບຊ້ຳ.
 */
async function getFleetActivity(session, range, limit = 12, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const fleetClauses = [IS_TRANSPORT_CAR];
  if (scope.scoped) fleetClauses.push(`transport_code = ANY(${p.add(scope.branches)})`);
  if (car) fleetClauses.push(`code = ${p.add(car)}`);
  const rows = await query(
    `WITH fleet AS (
       SELECT NULLIF(BTRIM(imei), '') AS imei,
              COALESCE(NULLIF(TRIM(name_1), ''), code) AS car_name
       FROM public.odg_tms_car
       WHERE ${fleetClauses.join(" AND ")} AND NULLIF(BTRIM(imei), '') IS NOT NULL
     ),
     -- 1 imei = 1 ແຖວ ກ່ອນ join ຊື່ລົດ ບໍ່ດັ່ງນັ້ນ tracker ທີ່ຜູກ 2 ຄັນຖືກນັບ 2 ເທື່ອ
     daily AS (
       SELECT g.imei,
              COUNT(*) FILTER (WHERE g.distance_km > 5)::int AS active_days,
              COALESCE(SUM(g.distance_km), 0)::float AS km,
              COALESCE(SUM(g.moving_seconds), 0)::float AS moving_seconds,
              COALESCE(MAX(g.max_speed), 0)::float AS max_speed,
              COALESCE(AVG(NULLIF(g.max_speed, 0)), 0)::float AS avg_daily_max_speed
       FROM public.odg_tms_gps_daily g
       WHERE g.usage_date >= $1::date AND g.usage_date < $2::date
         AND g.imei IN (SELECT imei FROM fleet)
       GROUP BY g.imei
     )
     SELECT (SELECT string_agg(f.car_name, ' / ' ORDER BY f.car_name) FROM fleet f WHERE f.imei = d.imei) AS car_name,
            d.active_days, d.km, d.moving_seconds, d.max_speed, d.avg_daily_max_speed
     FROM daily d
     ORDER BY d.max_speed DESC
     LIMIT ${Number(limit) || 12}`,
    p.params
  );
  return rows.map((r) => {
    const movingHours = (Number(r.moving_seconds) || 0) / 3600;
    const km = Number(r.km) || 0;
    return {
      car_name: r.car_name,
      active_days: Number(r.active_days) || 0,
      km,
      moving_hours: movingHours,
      max_speed: Number(r.max_speed) || 0,
      avg_daily_max_speed: Number(r.avg_daily_max_speed) || 0,
      km_per_hour: movingHours > 0 ? km / movingHours : null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// (10) ເວລາ — ຖ້ຽວໜຶ່ງກິນເວລາເທົ່າໃດ ແລະ ໝົດໄປກັບຫຍັງ
// ────────────────────────────────────────────────────────────────────────

/**
 * ໂປຣໄຟລ໌ເວລາຂອງຖ້ຽວ ແລະ ຈຸດສົ່ງ.
 *
 * ຂໍ້ມູນມີຄົບຢູ່ແລ້ວແຕ່ບໍ່ເຄີຍຖືກເອົາມາໃຊ້: odg_tms.dispatch_started_at ກັບ
 * job_close ໃຫ້ຄວາມຍາວຂອງຖ້ຽວ, odg_tms_detail.checkin_at ກັບ sent_end ໃຫ້
 * ເວລາທີ່ໃຊ້ຢູ່ໜ້າຮ້ານລູກຄ້າ. ສອງອັນນີ້ຕອບຄຳຖາມ "ເປັນຫຍັງມື້ໜຶ່ງເຮັດໄດ້ພຽງ
 * ເທົ່ານີ້" ໄດ້ໂດຍກົງ ເຊິ່ງຕົວເລກ ຖ້ຽວ/ກມ ຕອບບໍ່ໄດ້.
 *
 * ⚠️ ຄ່າ p90 ຂອງເວລາຢູ່ໜ້າຮ້ານ ວັດແລ້ວສູງເຖິງ 3 ຊົ່ວໂມງ (2026-08) — ອາດແມ່ນ
 * ຄົນຂັບກົດ check-in ແຕ່ຫົວແຖວແລ້ວຄ່ອຍທະຍອຍປິດ ບໍ່ແມ່ນລໍຢູ່ໜ້າຮ້ານແທ້ ຈຶ່ງ
 * ໜ້າຈໍຕ້ອງບອກວ່ານັບແຕ່ຈຸດໃດຫາຈຸດໃດ.
 */
async function getTimingProfile(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);

  const tripP = makeParams([start, next]);
  const tripCar = car ? `AND a.car = ${tripP.add(car)}` : "";
  const dropP = makeParams([start, next]);
  const dropCar = car ? `AND a.car = ${dropP.add(car)}` : "";
  const hourP = makeParams([start, next]);
  const hourCar = car ? `AND a.car = ${hourP.add(car)}` : "";

  const [trip, drop, hours] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS trips,
         COUNT(*) FILTER (WHERE a.dispatch_started_at IS NOT NULL AND a.job_close IS NOT NULL)::int AS measured,
         COALESCE(AVG(EXTRACT(EPOCH FROM (a.job_close - a.dispatch_started_at)) / 3600.0)
                  FILTER (WHERE a.job_close > a.dispatch_started_at), 0)::float AS avg_hours,
         COALESCE(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (a.job_close - a.dispatch_started_at)) / 3600.0
         ) FILTER (WHERE a.job_close > a.dispatch_started_at), 0)::float AS median_hours
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         ${tripCar}
         ${branchFilterJob(scope, "a")}`,
      tripP.params
    ),
    queryOne(
      `SELECT COUNT(*)::int AS drops,
         COUNT(*) FILTER (WHERE d.checkin_at IS NOT NULL)::int AS measured,
         COALESCE(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (d.sent_end - d.checkin_at)) / 60.0
         ) FILTER (WHERE d.sent_end > d.checkin_at), 0)::float AS median_minutes,
         COALESCE(percentile_cont(0.9) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (d.sent_end - d.checkin_at)) / 60.0
         ) FILTER (WHERE d.sent_end > d.checkin_at), 0)::float AS p90_minutes
       FROM public.odg_tms_detail d
       JOIN public.odg_tms a ON a.doc_no = d.doc_no
       WHERE d.status = 1 AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
         ${dropCar}
         ${branchFilterJob(scope, "a")}`,
      dropP.params
    ),
    query(
      `SELECT EXTRACT(HOUR FROM a.dispatch_started_at)::int AS hour, COUNT(*)::int AS trips
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         AND a.dispatch_started_at IS NOT NULL
         ${hourCar}
         ${branchFilterJob(scope, "a")}
       GROUP BY 1
       ORDER BY 1`,
      hourP.params
    ),
  ]);

  const byHour = new Map(hours.map((r) => [Number(r.hour), Number(r.trips) || 0]));
  const hourRows = hours.map((r) => Number(r.hour));
  // ສະແດງສະເພາະຊ່ວງໂມງທີ່ມີການອອກລົດຈິງ — ຖ້າແຜ່ 0–23 ໝົດ ແທ່ງຈະບາງຈົນອ່ານບໍ່ອອກ
  const firstHour = hourRows.length ? Math.min(...hourRows) : 0;
  const lastHour = hourRows.length ? Math.max(...hourRows) : 0;
  const dispatchHours = [];
  for (let h = firstHour; h <= lastHour; h += 1) {
    dispatchHours.push({ hour: h, trips: byHour.get(h) ?? 0 });
  }

  return {
    trips: Number(trip?.trips) || 0,
    trips_measured: Number(trip?.measured) || 0,
    avg_trip_hours: Number(trip?.avg_hours) || 0,
    median_trip_hours: Number(trip?.median_hours) || 0,
    drops: Number(drop?.drops) || 0,
    drops_measured: Number(drop?.measured) || 0,
    median_stop_minutes: Number(drop?.median_minutes) || 0,
    p90_stop_minutes: Number(drop?.p90_minutes) || 0,
    dispatch_hours: dispatchHours,
  };
}

// ────────────────────────────────────────────────────────────────────────
// (10.5) ເງິນເກັບປາຍທາງ (COD) — ເກັບຂໍ້ມູນຢູ່ແລ້ວ ແຕ່ບໍ່ເຄີຍມີໃຜເບິ່ງ
// ────────────────────────────────────────────────────────────────────────

/**
 * ຍອດ COD ທີ່ຕ້ອງເກັບ ທຽບກັບຍອດທີ່ບັນທຶກວ່າເກັບແລ້ວ.
 *
 * odg_tms_detail ເກັບ cod_amount / collected_amount / collected_at /
 * payment_method ຢູ່ລະດັບຈຸດສົ່ງແລ້ວ ແຕ່ບໍ່ມີລາຍງານໃດເອົາມາລວມ. ວັດ 2026-08
 * ພົບ 76 ຈຸດມີ COD 2.1 ລ້ານກີບ ແຕ່ບັນທຶກວ່າເກັບແລ້ວພຽງ 1.5 ແສນ — ຍັງບອກບໍ່ໄດ້
 * ວ່າ "ບໍ່ໄດ້ເກັບ" ຫຼື "ເກັບແລ້ວແຕ່ບໍ່ໄດ້ບັນທຶກ" ຈຶ່ງສະແດງທັງສອງເລກຄູ່ກັນ
 * ແລະ ນັບຈຸດທີ່ບໍ່ມີການບັນທຶກໄວ້ຕ່າງຫາກ ບໍ່ໄປສະຫຼຸບແທນຜູ້ໃຊ້.
 */
async function getCodSummary(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);
  const p = makeParams([start, next]);
  const carClause = car ? `AND a.car = ${p.add(car)}` : "";
  const row = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(d.cod_amount, 0) > 0)::int AS drops,
       COALESCE(SUM(d.cod_amount) FILTER (WHERE COALESCE(d.cod_amount, 0) > 0), 0)::float AS expected,
       COALESCE(SUM(d.collected_amount) FILTER (WHERE COALESCE(d.cod_amount, 0) > 0), 0)::float AS collected,
       COUNT(*) FILTER (WHERE COALESCE(d.cod_amount, 0) > 0
                          AND COALESCE(d.collected_amount, 0) = 0)::int AS unrecorded_drops,
       COALESCE(SUM(d.cod_amount) FILTER (WHERE COALESCE(d.cod_amount, 0) > 0
                          AND COALESCE(d.collected_amount, 0) = 0), 0)::float AS unrecorded_amount,
       COUNT(*) FILTER (WHERE COALESCE(d.cod_amount, 0) > 0
                          AND COALESCE(d.collected_amount, 0) > 0
                          AND d.collected_amount < d.cod_amount)::int AS short_drops
     FROM public.odg_tms_detail d
     JOIN public.odg_tms a ON a.doc_no = d.doc_no
     WHERE d.status = 1 AND d.sent_end IS NOT NULL
       AND COALESCE(a.approve_status, 0) = 1
       AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
       ${carClause}
       ${branchFilterJob(scope, "a")}`,
    p.params
  );
  const expected = Number(row?.expected) || 0;
  const collected = Number(row?.collected) || 0;
  return {
    drops: Number(row?.drops) || 0,
    expected,
    collected,
    unrecorded_drops: Number(row?.unrecorded_drops) || 0,
    unrecorded_amount: Number(row?.unrecorded_amount) || 0,
    short_drops: Number(row?.short_drops) || 0,
    collected_pct: expected > 0 ? (collected / expected) * 100 : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────
// (11) ຄວາມຄົບຖ້ວນຂອງຂໍ້ມູນ — ບອກວ່າຕົວເລກຂ້າງເທິງຂາດຫຍັງໄປ
// ────────────────────────────────────────────────────────────────────────

/**
 * ຊ່ອງຫວ່າງທີ່ເຮັດໃຫ້ຕົວເລກໃນລາຍງານນີ້ຕ່ຳ ຫຼື ສູງກວ່າຄວາມຈິງ.
 *
 * ເປັນຫຍັງຕ້ອງມີ: ຜູ້ອ່ານເຫັນ "ກມ/ຖ້ຽວ" ຫຼື "ຄ່ານ້ຳມັນ/ກມ" ແລ້ວເຊື່ອເລີຍ ທັງທີ່
 * ບາງຄັນບໍ່ມີ GPS, ບາງຄັນແລ່ນໂດຍບໍ່ມີໃບຈັດຖ້ຽວ ແລະ ບາງຄັນຍັງບໍ່ຜູກສາຂາ ຈຶ່ງ
 * ຫຼຸດອອກຈາກທຸກຕົວເລກທີ່ກັ່ນຕອງຕາມສາຂາ. ວັດ 2026-08-19 (1–19 ສິງຫາ) ພົບ
 * ລົດ 1 ຄັນແລ່ນ 18 ຖ້ຽວແຕ່ບໍ່ມີ GPS ເລີຍ ແລະ ຄ່ານ້ຳມັນ 5.6 ລ້ານກີບຕົກອອກ.
 */
async function getDataQuality(session, range, carCode) {
  const scope = getBranchScope(session);
  const [start, next] = rangeBounds(range);
  const car = cleanCar(carCode);

  const tripsP = makeParams([start, next]);
  const tripsCar = car ? `AND a.car = ${tripsP.add(car)}` : "";

  const gpsP = makeParams([start, next]);
  const gpsFleet = [IS_TRANSPORT_CAR];
  if (scope.scoped) gpsFleet.push(`c.transport_code = ANY(${gpsP.add(scope.branches)})`);
  if (car) gpsFleet.push(`c.code = ${gpsP.add(car)}`);

  const [tripNoGps, gpsNoTrip, noBranch, unapproved] = await Promise.all([
    // ① ລົດທີ່ອອກຖ້ຽວ ແຕ່ GPS ບໍ່ໄດ້ບັນທຶກໄລຍະທາງເລີຍ → ໄລຍະທາງກອງລົດຂາດ
    query(
      `SELECT COALESCE(NULLIF(TRIM(c.name_1), ''), a.car) AS car_name,
              COUNT(*)::int AS trips,
              (NULLIF(BTRIM(c.imei), '') IS NOT NULL) AS has_imei
       FROM public.odg_tms a
       LEFT JOIN public.odg_tms_car c ON c.code = a.car
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) = 1
         AND NULLIF(TRIM(a.car), '') IS NOT NULL
         ${tripsCar}
         ${branchFilterJob(scope, "a")}
         AND NOT EXISTS (
           SELECT 1 FROM public.odg_tms_gps_daily g
           WHERE g.imei = NULLIF(BTRIM(c.imei), '')
             AND g.usage_date >= $1::date AND g.usage_date < $2::date
             AND g.distance_km > 0
         )
       GROUP BY 1, 3
       ORDER BY 2 DESC`,
      tripsP.params
    ),
    // ② ລົດທີ່ແລ່ນຕາມ GPS ແຕ່ບໍ່ມີໃບຈັດຖ້ຽວເລີຍ → ວຽກທີ່ລະບົບບໍ່ເຫັນ
    query(
      `SELECT COALESCE(NULLIF(TRIM(c.name_1), ''), c.code) AS car_name,
              ROUND(SUM(g.distance_km))::int AS km
       FROM public.odg_tms_gps_daily g
       JOIN public.odg_tms_car c ON NULLIF(BTRIM(c.imei), '') = g.imei
       WHERE g.usage_date >= $1::date AND g.usage_date < $2::date
         AND ${gpsFleet.join(" AND ")}
         AND NOT EXISTS (
           SELECT 1 FROM public.odg_tms a
           WHERE a.car = c.code
             AND a.doc_date >= $1::date AND a.doc_date < $2::date
             AND COALESCE(a.approve_status, 0) = 1
         )
       GROUP BY 1
       HAVING SUM(g.distance_km) >= 50
       ORDER BY 2 DESC`,
      gpsP.params
    ),
    // ③ ລົດທີ່ຍັງບໍ່ຜູກສາຂາ ແຕ່ມີການເຄື່ອນໄຫວ → ຫຼຸດອອກຈາກທຸກຕົວເລກລາຍສາຂາ
    query(
      `SELECT COALESCE(NULLIF(TRIM(c.name_1), ''), c.code) AS car_name,
              COALESCE(f.refills, 0)::int AS refills,
              COALESCE(f.amount, 0)::float AS amount
       FROM public.odg_tms_car c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS refills, SUM(l.amount)::float AS amount
         FROM public.odg_tms_fuel_log l
         WHERE l.fuel_date >= $1::date AND l.fuel_date < $2::date
           AND (TRIM(l.car::text) = TRIM(c.code::text)
             OR upper(TRIM(l.car::text)) = upper(TRIM(c.name_1::text)))
       ) f ON true
       WHERE NULLIF(BTRIM(c.transport_code), '') IS NULL
         AND COALESCE(f.refills, 0) > 0
       ORDER BY 3 DESC`,
      [start, next]
    ),
    // ④ ໃບຈັດຖ້ຽວທີ່ຍັງລໍອະນຸມັດ → ບໍ່ຖືກນັບຢູ່ບ່ອນໃດເລີຍ
    queryOne(
      `SELECT COUNT(*)::int AS jobs
       FROM public.odg_tms a
       WHERE a.doc_date >= $1::date AND a.doc_date < $2::date
         AND COALESCE(a.approve_status, 0) <> 1
         ${branchFilterJob(scope, "a")}`,
      [start, next]
    ),
  ]);

  const toName = (rows, extra) => rows.map(extra);
  return {
    trips_without_gps: toName(tripNoGps, (r) => ({
      car_name: r.car_name,
      trips: Number(r.trips) || 0,
      has_imei: Boolean(r.has_imei),
    })),
    gps_without_trips: toName(gpsNoTrip, (r) => ({
      car_name: r.car_name,
      km: Number(r.km) || 0,
    })),
    cars_without_branch: toName(noBranch, (r) => ({
      car_name: r.car_name,
      refills: Number(r.refills) || 0,
      amount: Number(r.amount) || 0,
    })),
    unapproved_jobs: Number(unapproved?.jobs) || 0,
  };
}

module.exports = {
  CANCEL_REASON_LABEL,
  listTransportBranches,
  listTransportCars,
  getRangeSnapshot,
  getOnTimeTrend,
  getTripsByWeekday,
  getRouteAnalysis,
  getVehicleUtilization,
  getFuelEfficiency,
  getExceptions,
  getDailyTrend,
  getDriverPerformance,
  getBranchBreakdown,
  getTopCustomers,
  getFleetActivity,
  getTimingProfile,
  getCodSummary,
  getDataQuality,
};

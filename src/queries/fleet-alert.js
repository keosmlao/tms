// ແຈ້ງເຕືອນລົດຜ່ານ LINE ຫາພະນັກງານສາຂາ.
//
// ເຕືອນ 2 ຢ່າງ:
//  1. ລົດທີ່ອອກຖ້ຽວແລ້ວ ຈອດດັບເຄື່ອງເກີນ 30 ນາທີ
//  2. ລົດອອກຈາກສາງໄປແລ້ວ ແຕ່ຄົນຂັບຍັງບໍ່ກົດ "ເລີ່ມຈັດສົ່ງ"
//
// ຕ່າງຈາກ remindUnstartedDispatches ໃນ push.js ທີ່ເຕືອນ "ຄົນຂັບ" ຜ່ານ push
// ເມື່ອເບີກເຄື່ອງແລ້ວ 5 ນາທີ — ອັນນີ້ເຕືອນ "ຫົວໜ້າ" ຜ່ານ LINE ແລະ ໃຊ້ GPS
// ເປັນຫຼັກຖານວ່າລົດອອກຈາກສາງໄປຈິງ ບໍ່ແມ່ນພຽງເວລາຜ່ານໄປ.
//
// ວັດຈາກຖານຂໍ້ມູນຈິງ (2026-08-01):
//  - engine_state '0' = ຈອດດັບເຄື່ອງ ('1' = ຕິດເຄື່ອງ); engine_state_since
//    ມີຄົບ 21/21 ຄັນ ຈຶ່ງຄິດເວລາຈອດໄດ້
//  - odg_tms_geofence ມີພິກັດສາງແຕ່ 02-0002 ດອນຕິ້ວ — ສາຂາອື່ນຈະບໍ່ເຕືອນ
//    ຂໍ້ 2 ຈົນກວ່າຈະຕື່ມພິກັດ (ເປັນການຕັ້ງຄ່າຂໍ້ມູນ ບໍ່ແມ່ນໂຄ້ດ)
//  - ສາຂາ 02-0002 ມີພະນັກງານທີ່ມີ line_id 11 ຄົນ
const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const { getSetting } = require("./settings");
const { sendLineText } = require("../lib/line");

// ຄ່າຕັ້ງຕົ້ນ — ປັບໄດ້ທີ່ ຕັ້ງຄ່າ › ແຈ້ງເຕືອນລົດ (fleet.parked_minutes,
// fleet.left_base_metres)
const PARKED_MINUTES = 30;
// ອອກຈາກສາງໄກເທົ່າໃດຈຶ່ງນັບວ່າ "ອອກໄປແລ້ວ" — ລານສາງກວ້າງ ແລະ GPS ມີ
// ຄວາມຄາດເຄື່ອນ ຈຶ່ງຕ້ອງໄກພໍສົມຄວນ ບໍ່ດັ່ງນັ້ນລົດຈອດຢູ່ລານກໍ່ຈະເຕືອນ.
// ວັດຈາກຂໍ້ມູນຈິງ (2026-08-01): ລົດຈອດໃນລານຢູ່ຫ່າງ 24 ມ ສ່ວນລົດທີ່ອອກໄປ
// ໃກ້ສຸດຢູ່ 2,046 ມ — 500 ຈຶ່ງແຍກສອງກໍລະນີໄດ້ຢ່າງປອດໄພ
const LEFT_BASE_METRES = 500;

// ຄວາມໄວທີ່ຖືວ່າ "ຂັບໄວ" (ກມ/ຊມ). ວັດຈາກ gps_current ຕອນຂຽນ: ໄວສຸດຂອງ
// ກອງລົດແມ່ນ 51 — 80 ຈຶ່ງບໍ່ເຕືອນຂອງທຳມະດາ ແຕ່ຈັບຄົນຂັບໄວແທ້ໄດ້.
const SPEED_LIMIT_KMH = 80;

// ຈອດຫ່າງຈາກ "ຈຸດຈອດທີ່ຄວນ" (ຈຸດສົ່ງ ຫຼື ສາງ) ເກີນເທົ່າໃດຈຶ່ງຜິດປົກກະຕິ.
// 300 ມ ເຜື່ອໄວ້ໃຫ້ຈອດແຄມທາງ / ລານຈອດຂອງຮ້ານ ແລະ ຄວາມຄາດເຄື່ອນ GPS.
const OFF_POINT_METRES = 300;

/**
 * ອ່ານເກນຈາກ setting ຖ້າຕັ້ງໄວ້ ບໍ່ດັ່ງນັ້ນໃຊ້ຄ່າຕັ້ງຕົ້ນ.
 *
 * ຕ້ອງກວດຂໍ້ຄວາມຫວ່າງກ່ອນ ເພາະ Number("") = 0 ບໍ່ແມ່ນ NaN — ຖ້າບໍ່ກວດ
 * setting ທີ່ຍັງບໍ່ໄດ້ຕັ້ງຈະກາຍເປັນຄ່າຕ່ຳສຸດ (5 ນທ) ແທນຄ່າຕັ້ງຕົ້ນ (30 ນທ)
 * ແລ້ວເຕືອນຖີ່ກວ່າທີ່ຄວນຫຼາຍເທົ່າ.
 */
function intSetting(raw, fallback, min, max) {
  const text = String(raw ?? "").trim();
  if (text === "") return fallback;
  const n = Number(text);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// ລົດ tracker ຜູກກັບ odg_tms_car ດ້ວຍ code ຫຼື imei — ຈຶ່ງຕ້ອງລອງທັງສອງ
// ຄືກັບທີ່ tv-dashboard.js ເຮັດ
const GPS_JOIN = `
  LEFT JOIN public.odg_tms_gps_current g
    ON NULLIF(TRIM(g.car_code), '') = NULLIF(TRIM(t.car::text), '')
    OR NULLIF(TRIM(g.imei), '') = (
         SELECT NULLIF(TRIM(c2.imei), '')
         FROM public.odg_tms_car c2
         WHERE c2.code::text = t.car::text
         LIMIT 1
       )`;

const TRIP_FIELDS = `
  t.doc_no,
  NULLIF(TRIM(t.car::text), '') AS car_code,
  COALESCE(NULLIF(TRIM(car.name_1), ''), t.car::text, '-') AS car_name,
  COALESCE(NULLIF(TRIM(dv.name_1), ''), t.driver::text, '-') AS driver,
  COALESCE(NULLIF(TRIM(t.origin_transport_code), ''), '') AS transport_code,
  COALESCE(NULLIF(TRIM(g.address), ''), '') AS address`;

const TRIP_JOINS = `
  FROM odg_tms t
  LEFT JOIN public.odg_tms_car car ON car.code::text = t.car::text
  LEFT JOIN public.odg_tms_driver dv ON dv.code::text = t.driver::text
  ${GPS_JOIN}`;

/** ລົດທີ່ອອກຖ້ຽວແລ້ວ (job_status = 2) ແຕ່ຈອດດັບເຄື່ອງເກີນເກນທີ່ຕັ້ງ. */
async function findParkedTooLong(day, minutes = PARKED_MINUTES) {
  return query(
    `SELECT ${TRIP_FIELDS},
            TRIM(g.engine_state_since) AS since,
            FLOOR(EXTRACT(EPOCH FROM (
              LOCALTIMESTAMP - NULLIF(TRIM(g.engine_state_since), '')::timestamp
            )) / 60)::int AS minutes
     ${TRIP_JOINS}
     WHERE t.date_logistic::date = $1::date
       AND ${getFixedYearSqlFilter("t.doc_date")}
       AND COALESCE(t.approve_status, 0) = 1
       AND COALESCE(t.job_status, 0) = 2
       AND TRIM(COALESCE(g.engine_state, '')) = '0'
       AND NULLIF(TRIM(g.engine_state_since), '') IS NOT NULL
       AND LOCALTIMESTAMP - NULLIF(TRIM(g.engine_state_since), '')::timestamp
           >= ($2 || ' minutes')::interval
     ORDER BY minutes DESC`,
    [day, String(minutes)]
  );
}

/**
 * ລົດອອກຈາກສາງເກີນ LEFT_BASE_METRES ແຕ່ຖ້ຽວຍັງບໍ່ຖືກກົດ "ເລີ່ມຈັດສົ່ງ".
 *
 * ຕ້ອງໃຊ້ CTE ເພາະໄລຍະຫ່າງເປັນຄ່າທີ່ຄິດຂຶ້ນ ຈຶ່ງອ້າງໃນ WHERE ຊັ້ນດຽວກັນບໍ່ໄດ້.
 */
async function findLeftWithoutStart(day, metres = LEFT_BASE_METRES) {
  return query(
    `WITH candidate AS (
       SELECT ${TRIP_FIELDS},
              ROUND(6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(
                  NULLIF(TRIM(g.lat), '')::numeric - NULLIF(TRIM(f.start_lat), '')::numeric
                ) / 2), 2)
                + COS(RADIANS(NULLIF(TRIM(f.start_lat), '')::numeric))
                  * COS(RADIANS(NULLIF(TRIM(g.lat), '')::numeric))
                  * POWER(SIN(RADIANS(
                      NULLIF(TRIM(g.lng), '')::numeric - NULLIF(TRIM(f.start_lng), '')::numeric
                    ) / 2), 2)
              )))::int AS metres
       ${TRIP_JOINS}
       JOIN public.odg_tms_geofence f
         ON NULLIF(TRIM(f.transport_code), '') = NULLIF(TRIM(t.origin_transport_code), '')
        AND NULLIF(TRIM(f.start_lat), '') IS NOT NULL
        AND NULLIF(TRIM(f.start_lng), '') IS NOT NULL
       WHERE t.date_logistic::date = $1::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         AND COALESCE(t.approve_status, 0) = 1
         AND COALESCE(t.job_status, 0) < 2
         AND NULLIF(TRIM(g.lat), '') IS NOT NULL
         AND NULLIF(TRIM(g.lng), '') IS NOT NULL
     )
     SELECT * FROM candidate WHERE metres >= $2 ORDER BY metres DESC`,
    [day, metres]
  );
}

/**
 * ຈຸດທີ່ລົດ "ຄວນ" ຢູ່ໄດ້ຂອງຖ້ຽວໜຶ່ງ: ຈຸດສົ່ງທີ່ຍັງບໍ່ປິດ + ໝຸດສາງຂອງສາຂາ.
 *
 * ໃຊ້ຮ່ວມກັນລະຫວ່າງ "ຈອດບໍ່ຕົງຈຸດ" ແລະ "ອອກນອກເສັ້ນທາງ" — ສອງອັນນີ້ຕ່າງກັນ
 * ແຕ່ເງື່ອນໄຂຄວາມໄວ ແລະ ໄລຍະ ບໍ່ແມ່ນນິຍາມຂອງ "ຈຸດທີ່ຄວນຢູ່".
 *
 * ⚠️ ບໍ່ມີເສັ້ນທາງທີ່ວາງແຜນໄວ້ (polyline) ໃນລະບົບ ຈຶ່ງວັດ "ນອກເສັ້ນທາງ"
 * ບໍ່ໄດ້ຢ່າງແທ້ຈິງ. ສິ່ງທີ່ວັດໄດ້ຄື **ໄລຍະຫ່າງຈາກຈຸດທີ່ຄວນຢູ່ໃກ້ທີ່ສຸດ**
 * ເຊິ່ງພຽງພໍສຳລັບຈັບ "ລົດໄປທາງອື່ນ" ແຕ່ຢ່າຕັ້ງເກນຕ່ຳເກີນ ບໍ່ດັ່ງນັ້ນຖ້ຽວ
 * ທາງໄກ (ປາກເຊ) ຈະເຕືອນຕະຫຼອດທາງ.
 */
const NEAREST_POINT_SQL = `
  LEAST(
    COALESCE((
      SELECT MIN(ROUND(6371000 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(acd.latitude::numeric - NULLIF(TRIM(g.lat), '')::numeric) / 2), 2)
        + COS(RADIANS(NULLIF(TRIM(g.lat), '')::numeric))
          * COS(RADIANS(acd.latitude::numeric))
          * POWER(SIN(RADIANS(acd.longitude::numeric - NULLIF(TRIM(g.lng), '')::numeric) / 2), 2)
      )))::int)
      FROM public.odg_tms_detail d
      JOIN public.ar_customer_detail acd ON acd.ar_code = d.cust_code
      WHERE d.doc_no = t.doc_no
        AND COALESCE(d.status, 0) NOT IN (1, 2)
        AND acd.latitude IS NOT NULL AND acd.longitude IS NOT NULL
        AND acd.latitude::numeric <> 0 AND acd.longitude::numeric <> 0
    ), 2147483647),
    COALESCE((
      SELECT ROUND(6371000 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(
          NULLIF(TRIM(f.start_lat), '')::numeric - NULLIF(TRIM(g.lat), '')::numeric
        ) / 2), 2)
        + COS(RADIANS(NULLIF(TRIM(g.lat), '')::numeric))
          * COS(RADIANS(NULLIF(TRIM(f.start_lat), '')::numeric))
          * POWER(SIN(RADIANS(
              NULLIF(TRIM(f.start_lng), '')::numeric - NULLIF(TRIM(g.lng), '')::numeric
            ) / 2), 2)
      )))::int
      FROM public.odg_tms_geofence f
      WHERE NULLIF(TRIM(f.transport_code), '') = NULLIF(TRIM(t.origin_transport_code), '')
        AND NULLIF(TRIM(f.start_lat), '') ~ '^-?[0-9.]+$'
        AND NULLIF(TRIM(f.start_lng), '') ~ '^-?[0-9.]+$'
    ), 2147483647)
  )`;

/** ຂັບເກີນຄວາມໄວທີ່ກຳນົດ ໃນຂະນະທີ່ຖ້ຽວກຳລັງແລ່ນ. */
async function findSpeeding(day, limitKmh = SPEED_LIMIT_KMH) {
  return query(
    `SELECT ${TRIP_FIELDS},
            NULLIF(TRIM(g.speed), '')::numeric AS speed,
            TRIM(COALESCE(g.recorded_at, '')) AS seen_at
     ${TRIP_JOINS}
     WHERE t.date_logistic::date = $1::date
       AND ${getFixedYearSqlFilter("t.doc_date")}
       AND COALESCE(t.approve_status, 0) = 1
       AND COALESCE(t.job_status, 0) = 2
       AND TRIM(COALESCE(g.speed, '')) ~ '^[0-9.]+$'
       AND NULLIF(TRIM(g.speed), '')::numeric > $2
     ORDER BY speed DESC`,
    [day, limitKmh]
  );
}

/** ຈອດດັບເຄື່ອງດົນ **ແລະ** ບໍ່ໄດ້ຈອດຢູ່ຈຸດສົ່ງ ຫຼື ສາງ. */
async function findParkedOffPoint(day, minutes, metres = OFF_POINT_METRES) {
  return query(
    `WITH candidate AS (
       SELECT ${TRIP_FIELDS},
              TRIM(g.engine_state_since) AS since,
              FLOOR(EXTRACT(EPOCH FROM (
                LOCALTIMESTAMP - NULLIF(TRIM(g.engine_state_since), '')::timestamp
              )) / 60)::int AS minutes,
              ${NEAREST_POINT_SQL} AS metres
       ${TRIP_JOINS}
       WHERE t.date_logistic::date = $1::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         AND COALESCE(t.approve_status, 0) = 1
         AND COALESCE(t.job_status, 0) = 2
         AND TRIM(COALESCE(g.engine_state, '')) = '0'
         AND NULLIF(TRIM(g.engine_state_since), '') IS NOT NULL
         AND NULLIF(TRIM(g.lat), '') ~ '^-?[0-9.]+$'
         AND NULLIF(TRIM(g.lng), '') ~ '^-?[0-9.]+$'
         AND LOCALTIMESTAMP - NULLIF(TRIM(g.engine_state_since), '')::timestamp
             >= ($2 || ' minutes')::interval
     )
     -- 2147483647 = ບໍ່ມີຈຸດໃດໃຫ້ທຽບເລີຍ (ລູກຄ້າບໍ່ໄດ້ປັກໝຸດ ແລະ ສາຂາບໍ່ໄດ້
     -- ປັກໝຸດ) — ບໍ່ຮູ້ກໍ່ຢ່າເຕືອນ ດີກວ່າເຕືອນຜິດ.
     SELECT * FROM candidate
      WHERE metres >= $3 AND metres < 2147483647
      ORDER BY minutes DESC`,
    [day, String(minutes), metres]
  );
}

/** ກຳລັງແລ່ນ ແຕ່ຢູ່ໄກຈາກທຸກຈຸດສົ່ງ ແລະ ໄກຈາກສາງ. */
async function findOffRoute(day, metres) {
  return query(
    `WITH candidate AS (
       SELECT ${TRIP_FIELDS},
              NULLIF(TRIM(g.speed), '')::numeric AS speed,
              ${NEAREST_POINT_SQL} AS metres
       ${TRIP_JOINS}
       WHERE t.date_logistic::date = $1::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         AND COALESCE(t.approve_status, 0) = 1
         AND COALESCE(t.job_status, 0) = 2
         AND NULLIF(TRIM(g.lat), '') ~ '^-?[0-9.]+$'
         AND NULLIF(TRIM(g.lng), '') ~ '^-?[0-9.]+$'
         AND TRIM(COALESCE(g.speed, '')) ~ '^[0-9.]+$'
         AND NULLIF(TRIM(g.speed), '')::numeric > 5
     )
     SELECT * FROM candidate
      WHERE metres >= $2 AND metres < 2147483647
      ORDER BY metres DESC`,
    [day, metres]
  );
}

/**
 * ພະນັກງານຂອງສາຂາທີ່ມີ line_id.
 *
 * logistic_code ບາງແຖວເກັບຫຼາຍສາຂາຄັ່ນດ້ວຍຈຸດ (ວັດແລ້ວ: '1102,1104') ຈຶ່ງ
 * ຕ້ອງແຍກເປັນລາຍການກ່ອນທຽບ ບໍ່ແມ່ນທຽບຂໍ້ຄວາມກົງໆ.
 */
async function findRecipients(transportCode) {
  const code = String(transportCode ?? "").trim();
  if (!code) return [];
  const rows = await query(
    `SELECT DISTINCT NULLIF(TRIM(u.line_id::text), '') AS line_id
       FROM public.erp_user u
      WHERE NULLIF(TRIM(u.line_id::text), '') IS NOT NULL
        AND $1 = ANY(string_to_array(REPLACE(COALESCE(u.logistic_code, ''), ' ', ''), ','))`,
    [code]
  );
  return rows.map((r) => r.line_id).filter(Boolean);
}

function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} ນາທີ`;
  return `${Math.floor(m / 60)} ຊມ ${String(m % 60).padStart(2, "0")} ນທ`;
}

function buildAlert(kind, row) {
  if (kind === "parked") {
    return {
      // ຈອດຮອບໃໝ່ໄດ້ since ໃໝ່ ຈຶ່ງເປັນເຫດການໃໝ່ — ຮອບເກົ່າບໍ່ສົ່ງຊ້ຳ
      alertKey: `${row.car_code}|${row.since}`,
      minutes: Number(row.minutes ?? 0),
      message:
        `🅿️ ລົດຈອດດົນ\n` +
        `ລົດ ${row.car_name} · ຄົນຂັບ ${row.driver}\n` +
        `ຖ້ຽວ ${row.doc_no}\n` +
        `ຈອດດັບເຄື່ອງມາແລ້ວ ${fmtDuration(row.minutes)}` +
        (row.address ? `\nຢູ່ ${row.address}` : ""),
    };
  }
  if (kind === "speeding") {
    return {
      // ຄັນລະເທື່ອຕໍ່ຊົ່ວໂມງ — gps_current ເປັນພາບຖ່າຍ ຖ້າຈອງດ້ວຍເວລາຈຸດ
      // ມັນຈະເຕືອນທຸກຮອບ cron ຕະຫຼອດທີ່ລົດຍັງແລ່ນໄວ.
      alertKey: `${row.car_code}|${String(row.seen_at ?? "").slice(0, 13)}`,
      minutes: null,
      message:
        `🚨 ຂັບໄວເກີນກຳນົດ\n` +
        `ລົດ ${row.car_name} · ຄົນຂັບ ${row.driver}\n` +
        `ຖ້ຽວ ${row.doc_no}\n` +
        `ຄວາມໄວ ${Math.round(Number(row.speed ?? 0))} ກມ/ຊມ` +
        (row.address ? `\nຢູ່ ${row.address}` : ""),
    };
  }
  if (kind === "parked_off_point") {
    return {
      alertKey: `${row.car_code}|${row.since}`,
      minutes: Number(row.minutes ?? 0),
      message:
        `📍 ຈອດບໍ່ຕົງຈຸດຈອດ\n` +
        `ລົດ ${row.car_name} · ຄົນຂັບ ${row.driver}\n` +
        `ຖ້ຽວ ${row.doc_no}\n` +
        `ຈອດດັບເຄື່ອງ ${fmtDuration(row.minutes)} ຫ່າງຈາກຈຸດສົ່ງ/ສາງ ` +
        `${(Number(row.metres ?? 0) / 1000).toFixed(1)} ກມ` +
        (row.address ? `\nຢູ່ ${row.address}` : ""),
    };
  }
  if (kind === "off_route") {
    return {
      // ຄັນລະເທື່ອຕໍ່ຊົ່ວໂມງ ຄືກັນກັບຂັບໄວ — ບໍ່ດັ່ງນັ້ນລົດທີ່ແລ່ນທາງໄກ
      // ຈະຍິງທຸກຮອບ cron.
      alertKey: `${row.car_code}|${String(row.seen_at ?? "").slice(0, 13)}`,
      minutes: null,
      message:
        `🧭 ລົດອອກນອກເສັ້ນທາງ\n` +
        `ລົດ ${row.car_name} · ຄົນຂັບ ${row.driver}\n` +
        `ຖ້ຽວ ${row.doc_no}\n` +
        `ຫ່າງຈາກຈຸດສົ່ງ/ສາງ ໃກ້ສຸດ ` +
        `${(Number(row.metres ?? 0) / 1000).toFixed(1)} ກມ` +
        (row.address ? `\nຢູ່ ${row.address}` : ""),
    };
  }
  return {
    // ຖ້ຽວໜຶ່ງເຕືອນເທື່ອດຽວ — ພໍກົດເລີ່ມແລ້ວກໍ່ຫຼຸດອອກຈາກເງື່ອນໄຂເອງ
    alertKey: String(row.doc_no),
    minutes: null,
    message:
      `🚚 ອອກຈາກສາງແຕ່ຍັງບໍ່ກົດ "ເລີ່ມຈັດສົ່ງ"\n` +
      `ລົດ ${row.car_name} · ຄົນຂັບ ${row.driver}\n` +
      `ຖ້ຽວ ${row.doc_no}\n` +
      `ຫ່າງຈາກສາງ ${(Number(row.metres ?? 0) / 1000).toFixed(1)} ກມ` +
      (row.address ? `\nຢູ່ ${row.address}` : ""),
  };
}

/**
 * ຈອງສິດສົ່ງ — ຂຽນ log ກ່ອນສົ່ງ. ຖ້າມີແຖວຢູ່ແລ້ວແປວ່າເຄີຍສົ່ງແລ້ວ ຈຶ່ງຂ້າມ.
 *
 * ຂຽນກ່ອນສົ່ງ ບໍ່ແມ່ນຫຼັງສົ່ງ ເພື່ອກັນ cron 2 ຮອບຊ້ອນກັນສົ່ງຄືນ — ຖ້າສົ່ງລົ້ມ
 * ຈຶ່ງລຶບແຖວອອກໃຫ້ຮອບໜ້າລອງໃໝ່.
 */
async function claim(kind, alert, row) {
  const res = await query(
    `INSERT INTO public.odg_tms_fleet_alert_log
       (kind, alert_key, car_code, doc_no, transport_code, minutes, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (kind, alert_key) DO NOTHING
     RETURNING id`,
    [
      kind,
      alert.alertKey,
      row.car_code ?? null,
      row.doc_no ?? null,
      row.transport_code ?? null,
      alert.minutes,
      alert.message,
    ]
  );
  return res[0]?.id ?? null;
}

async function ensureFleetAlertSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS public.odg_tms_fleet_alert_log (
       id bigserial PRIMARY KEY,
       kind character varying(30) NOT NULL,
       alert_key character varying(200) NOT NULL,
       car_code character varying(50),
       doc_no character varying(50),
       transport_code character varying(25),
       minutes integer,
       message text,
       recipients integer,
       sent_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
     )`
  );
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_alert_once
       ON public.odg_tms_fleet_alert_log (kind, alert_key)`
  );
}

/**
 * ກວດ ແລະ ສົ່ງແຈ້ງເຕືອນ. ຮຽກຈາກ cron ທຸກໆ 5 ນາທີ.
 *
 * ປິດໄວ້ເປັນຄ່າຕັ້ງຕົ້ນ (fleet.alert_enabled) ເພາະສົ່ງຫາຄົນຈິງ — ຕ້ອງເປີດເອງ
 * ຫຼັງກວດຂໍ້ຄວາມ ແລະ ລາຍຊື່ຜູ້ຮັບແລ້ວ.
 */
async function evaluateFleetAlerts({ day, dryRun = false } = {}) {
  const [enabled, rawMinutes, rawMetres, rawSpeed, rawOffPoint, rawOffRoute] =
    await Promise.all([
      getSetting("fleet.alert_enabled", "0"),
      getSetting("fleet.parked_minutes", ""),
      getSetting("fleet.left_base_metres", ""),
      getSetting("fleet.speed_limit_kmh", ""),
      getSetting("fleet.off_point_metres", ""),
      // ບໍ່ມີຄ່າຕັ້ງຕົ້ນ — ຫວ່າງ = ປິດ. ບໍ່ມີເສັ້ນທາງທີ່ວາງແຜນໄວ້ໃນລະບົບ
      // ຈຶ່ງເກນນີ້ຂຶ້ນກັບແຕ່ລະສາຂາຫຼາຍ (ດອນຕິ້ວ ກັບ ປາກເຊ ບໍ່ຄືກັນ) —
      // ບັງຄັບໃຫ້ຜູ້ດູແລຕັ້ງເອງ ດີກວ່າເປີດເອງແລ້ວເຕືອນຜິດທັງມື້.
      getSetting("fleet.off_route_km", ""),
    ]);
  const isOn = enabled === "1" || enabled === "true";
  if (!isOn && !dryRun) return { skipped: true, reason: "alert_disabled" };

  const minutes = intSetting(rawMinutes, PARKED_MINUTES, 5, 480);
  const metres = intSetting(rawMetres, LEFT_BASE_METRES, 100, 5000);
  const speedLimit = intSetting(rawSpeed, SPEED_LIMIT_KMH, 30, 200);
  const offPointMetres = intSetting(rawOffPoint, OFF_POINT_METRES, 100, 5000);
  const offRouteKm = String(rawOffRoute ?? "").trim()
    ? intSetting(rawOffRoute, 0, 1, 500)
    : 0;

  await ensureFleetAlertSchema();
  const today =
    day || (await queryOne(`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS d`))?.d;

  const [parked, left, speeding, offPoint, offRoute] = await Promise.all([
    findParkedTooLong(today, minutes),
    findLeftWithoutStart(today, metres),
    findSpeeding(today, speedLimit),
    findParkedOffPoint(today, minutes, offPointMetres),
    offRouteKm > 0 ? findOffRoute(today, offRouteKm * 1000) : Promise.resolve([]),
  ]);

  // ຈອດບໍ່ຕົງຈຸດ ເປັນເລື່ອງດຽວກັນກັບ ຈອດດົນ ແຕ່ບອກເຫດຜົນຫຼາຍກວ່າ — ຄັນທີ່
  // ເຂົ້າທັງສອງເງື່ອນໄຂ ສົ່ງແຕ່ອັນທີ່ລະອຽດກວ່າ ບໍ່ດັ່ງນັ້ນຫົວໜ້າໄດ້ສອງ
  // ຂໍ້ຄວາມກ່ຽວກັບການຈອດຄັ້ງດຽວກັນ.
  const offPointCars = new Set(offPoint.map((r) => `${r.car_code}|${r.since}`));

  const found = [
    ...parked
      .filter((row) => !offPointCars.has(`${row.car_code}|${row.since}`))
      .map((row) => ({ kind: "parked", row })),
    ...offPoint.map((row) => ({ kind: "parked_off_point", row })),
    ...left.map((row) => ({ kind: "left_no_start", row })),
    ...speeding.map((row) => ({ kind: "speeding", row })),
    ...offRoute.map((row) => ({ kind: "off_route", row })),
  ];

  const sent = [];
  const skipped = [];
  const recipientCache = new Map();

  for (const { kind, row } of found) {
    const alert = buildAlert(kind, row);
    if (dryRun) {
      sent.push({ kind, alert_key: alert.alertKey, message: alert.message });
      continue;
    }

    const id = await claim(kind, alert, row);
    if (!id) {
      skipped.push({ kind, alert_key: alert.alertKey, reason: "already_sent" });
      continue;
    }

    const code = row.transport_code ?? "";
    if (!recipientCache.has(code)) recipientCache.set(code, await findRecipients(code));
    const to = recipientCache.get(code);
    if (to.length === 0) {
      // ບໍ່ມີຜູ້ຮັບ = ສົ່ງບໍ່ໄດ້ ບໍ່ແມ່ນສົ່ງແລ້ວ — ລຶບການຈອງອອກ ບໍ່ດັ່ງນັ້ນ
      // ພໍຕັ້ງ line_id ໃຫ້ພະນັກງານແລ້ວ ເຫດການນີ້ຈະບໍ່ມີວັນຖືກສົ່ງ
      await query(`DELETE FROM public.odg_tms_fleet_alert_log WHERE id = $1`, [id]);
      skipped.push({ kind, alert_key: alert.alertKey, reason: "no_recipient" });
      continue;
    }

    const results = await Promise.all(
      to.map((lineId) =>
        sendLineText(lineId, alert.message).then(
          () => true,
          (err) => {
            console.warn("[fleet-alert] line send failed:", err?.message ?? err);
            return false;
          }
        )
      )
    );
    const ok = results.filter(Boolean).length;
    if (ok === 0) {
      await query(`DELETE FROM public.odg_tms_fleet_alert_log WHERE id = $1`, [id]);
      skipped.push({ kind, alert_key: alert.alertKey, reason: "send_failed" });
      continue;
    }
    await query(
      `UPDATE public.odg_tms_fleet_alert_log SET recipients = $2 WHERE id = $1`,
      [id, ok]
    );
    sent.push({ kind, alert_key: alert.alertKey, recipients: ok });
  }

  return {
    day: today,
    dry_run: dryRun,
    thresholds: { parked_minutes: minutes, left_base_metres: metres },
    scanned: { parked: parked.length, left_no_start: left.length },
    sent,
    skipped,
  };
}

module.exports = {
  PARKED_MINUTES,
  LEFT_BASE_METRES,
  evaluateFleetAlerts,
  ensureFleetAlertSchema,
  findParkedTooLong,
  findLeftWithoutStart,
  findRecipients,
};

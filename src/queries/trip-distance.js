const { query, queryOne } = require("../lib/db");

/**
 * ໄລຍະທາງຂອງແຕ່ລະຖ້ຽວ ຈາກເລກໄມລ໌ຂອງ tracker.
 *
 * ວິທີ: ຈົດເລກໄມລ໌ສະສົມຂອງລົດຕອນຄົນຂັບກົດ "ເລີ່ມຈັດສົ່ງ" ແລະ ຈົດອີກເທື່ອ
 * ຕອນກົດ "ປິດຖ້ຽວ" — ຜົນຕ່າງຄືໄລຍະທີ່ແລ່ນຈິງ.
 *
 * ບໍ່ບວກໄລຍະຈາກຈຸດ GPS ເພາະ tracker ສົ່ງທຸກ 20 ວິນາທີ — ແລ່ນ 60 ກມ/ຊມ
 * ຈະຫ່າງກັນ 333 ແມັດຕໍ່ຈຸດ ຈຶ່ງຕັດໂຄ້ງ ແລະ ໄດ້ໄລຍະໜ້ອຍກວ່າຈິງ; ແລະ ຖ້າ
 * worker ຂາດຕອນ ໄລຍະຈະຫຼຸດລົງໂດຍບໍ່ມີໃຜຮູ້. ເລກໄມລ໌ນັບຢູ່ໃນຕົວລົດເອງ
 * ຈຶ່ງບໍ່ສົນວ່າເຮົາເກັບຂໍ້ມູນຄົບຫຼືບໍ່.
 */

// tracker ສົ່ງເລກໄມລ໌ເປັນແມັດ (ເຊັ່ນ 178,560,348 = 178,560 ກມ)
const METRES_PER_KM = 1000;

// ເລກໄມລ໌ຂ້າມແບບຜິດປົກກະຕິ = tracker ຖືກປ່ຽນ/ຣີເຊັດ ບໍ່ແມ່ນລົດແລ່ນຈິງ
const MAX_TRIP_KM = 2000;

let schemaReady = null;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS public.odg_tms_trip_distance (
        doc_no varchar PRIMARY KEY,
        car_code varchar,
        start_at timestamp without time zone,
        start_mileage numeric,
        start_recorded_at varchar,
        end_at timestamp without time zone,
        end_mileage numeric,
        end_recorded_at varchar,
        distance_km numeric,
        source varchar
      )
    `);
  })();
  return schemaReady;
}

/**
 * ລະຫັດລົດຂອງຖ້ຽວ. ແອັບບໍ່ໄດ້ສົ່ງ car_code ມາທຸກຄຳສັ່ງ ຈຶ່ງອ່ານຈາກຖ້ຽວເອງ
 * ເມື່ອບໍ່ມີ — ບໍ່ດັ່ງນັ້ນຈຸດເລີ່ມນັບໄລຍະຈະຫາຍໄປງຽບໆ.
 */
async function resolveCar(docNo, carCode) {
  const given = String(carCode || "").trim();
  if (given) return given;
  const row = await queryOne(
    `SELECT COALESCE(NULLIF(TRIM(car), ''), '') AS car FROM odg_tms WHERE doc_no = $1`,
    [docNo]
  );
  return String(row?.car || "").trim();
}

/** ເລກໄມລ໌ຫຼ້າສຸດຂອງລົດຄັນນີ້ຈາກ tracker. ບໍ່ມີ tracker ຈະໄດ້ null. */
async function readMileage(carCode) {
  const code = String(carCode || "").trim();
  if (!code) return null;
  const row = await queryOne(
    `SELECT NULLIF(TRIM(mileage), '')::numeric AS mileage,
            COALESCE(recorded_at, '') AS recorded_at
     FROM public.odg_tms_gps_current
     WHERE car_code = $1 AND NULLIF(TRIM(mileage), '') IS NOT NULL
     LIMIT 1`,
    [code]
  );
  if (!row || row.mileage === null) return null;
  return { mileage: Number(row.mileage), recordedAt: row.recorded_at };
}

/**
 * ຈົດເລກໄມລ໌ຕອນເລີ່ມຈັດສົ່ງ.
 *
 * ຖ້າຖ້ຽວນີ້ຈົດໄວ້ແລ້ວຈະບໍ່ຂຽນທັບ — ຄົນຂັບກົດ "ເລີ່ມຈັດສົ່ງ" ຊ້ຳໄດ້ ແລະ
 * ການຂຽນທັບຈະເຮັດໃຫ້ໄລຍະທີ່ແລ່ນໄປແລ້ວຫາຍ.
 */
async function captureStart(docNo, carCode) {
  const car = await resolveCar(docNo, carCode);
  const reading = await readMileage(car);
  if (!reading) return null;
  await ensureSchema();
  await query(
    `INSERT INTO public.odg_tms_trip_distance
       (doc_no, car_code, start_at, start_mileage, start_recorded_at, source)
     VALUES ($1, $2, LOCALTIMESTAMP(0), $3, $4, 'tracker')
     ON CONFLICT (doc_no) DO NOTHING`,
    [docNo, car, reading.mileage, reading.recordedAt]
  );
  return reading.mileage;
}

/** ຈົດເລກໄມລ໌ຕອນປິດຖ້ຽວ ແລ້ວຄິດໄລຍະ. */
async function captureEnd(docNo, carCode) {
  const car = await resolveCar(docNo, carCode);
  const reading = await readMileage(car);
  if (!reading) return null;
  await ensureSchema();
  const row = await queryOne(
    `UPDATE public.odg_tms_trip_distance
     SET end_at = LOCALTIMESTAMP(0),
         end_mileage = $2,
         end_recorded_at = $3,
         distance_km = CASE
           WHEN start_mileage IS NOT NULL AND $2 >= start_mileage
             AND ($2 - start_mileage) / ${METRES_PER_KM} <= ${MAX_TRIP_KM}
           THEN ROUND((($2 - start_mileage) / ${METRES_PER_KM})::numeric, 1)
           ELSE NULL
         END
     WHERE doc_no = $1
     RETURNING distance_km`,
    [docNo, reading.mileage, reading.recordedAt]
  );
  return row?.distance_km ?? null;
}

/**
 * ໄລຍະຂອງຖ້ຽວທີ່ກຳລັງແລ່ນ = ເລກໄມລ໌ດຽວນີ້ − ເລກໄມລ໌ຕອນອອກ.
 * ຖ້ຽວທີ່ປິດແລ້ວໃຊ້ຄ່າທີ່ບັນທຶກໄວ້.
 */
async function getDistanceMap(docNos) {
  const list = (docNos ?? []).filter(Boolean);
  if (list.length === 0) return new Map();
  await ensureSchema();
  const rows = await query(
    `SELECT td.doc_no,
            COALESCE(
              td.distance_km,
              CASE
                WHEN td.start_mileage IS NOT NULL
                  AND NULLIF(TRIM(g.mileage), '')::numeric >= td.start_mileage
                  AND (NULLIF(TRIM(g.mileage), '')::numeric - td.start_mileage)
                      / ${METRES_PER_KM} <= ${MAX_TRIP_KM}
                THEN ROUND(
                  ((NULLIF(TRIM(g.mileage), '')::numeric - td.start_mileage)
                   / ${METRES_PER_KM})::numeric, 1)
              END
            ) AS distance_km
     FROM public.odg_tms_trip_distance td
     LEFT JOIN public.odg_tms_gps_current g ON g.car_code = td.car_code
     WHERE td.doc_no = ANY($1::varchar[])`,
    [list]
  );
  const map = new Map();
  for (const row of rows) {
    if (row.distance_km !== null && row.distance_km !== undefined) {
      map.set(row.doc_no, Number(row.distance_km));
    }
  }
  return map;
}

/**
 * ຕື່ມໄລຍະທາງຍ້ອນຫຼັງ ຈາກຮ່ອງຮອຍ GPS ຂອງຖ້ຽວທີ່ຜ່ານມາ.
 *
 * ຖ້ຽວເກົ່າບໍ່ມີເລກໄມລ໌ຈົດໄວ້ (ຕາຕະລາງຮ່ອງຮອຍບໍ່ໄດ້ເກັບ mileage) ຈຶ່ງຕ້ອງ
 * ບວກໄລຍະຈຸດຕໍ່ຈຸດດ້ວຍ haversine. ວິທີນີ້ໄດ້ໄລຍະ **ໜ້ອຍກວ່າຈິງ** ເພາະ
 * tracker ສົ່ງທຸກ 20 ວິນາທີ ຈຶ່ງຕັດໂຄ້ງ — ບັນທຶກ source='trail' ໄວ້ໃຫ້ຮູ້
 * ວ່າເລກຊຸດນີ້ຄົນລະວິທີກັບ source='tracker' ແລະ ທຽບກັນກົງໆບໍ່ໄດ້.
 */
async function backfillFromTrail({ limit = 500, dryRun = false } = {}) {
  await ensureSchema();
  const rows = await query(
    `WITH pts AS (
       SELECT t.doc_no, t.car::text AS car_code, g.recorded_at, g.lat, g.lng,
              LAG(g.lat) OVER (PARTITION BY t.doc_no ORDER BY g.recorded_at) AS plat,
              LAG(g.lng) OVER (PARTITION BY t.doc_no ORDER BY g.recorded_at) AS plng
       FROM odg_tms t
       JOIN public.odg_tms_gps_realtime_log g
         ON g.car_code = t.car::text
        AND g.recorded_at >= t.dispatch_started_at
        AND g.recorded_at <= t.job_close
       WHERE t.dispatch_started_at IS NOT NULL
         AND t.job_close IS NOT NULL
         AND g.lat IS NOT NULL AND g.lng IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.odg_tms_trip_distance td WHERE td.doc_no = t.doc_no
         )
     )
     SELECT doc_no, MAX(car_code) AS car_code,
            MIN(recorded_at) AS start_at, MAX(recorded_at) AS end_at,
            ROUND(SUM(
              6371 * 2 * asin(sqrt(
                power(sin(radians(lat - plat) / 2), 2) +
                cos(radians(plat)) * cos(radians(lat)) *
                power(sin(radians(lng - plng) / 2), 2)
              ))
            )::numeric, 1) AS km
     FROM pts
     WHERE plat IS NOT NULL
     GROUP BY doc_no
     HAVING SUM(
       6371 * 2 * asin(sqrt(
         power(sin(radians(lat - plat) / 2), 2) +
         cos(radians(plat)) * cos(radians(lat)) *
         power(sin(radians(lng - plng) / 2), 2)
       ))
     ) BETWEEN 0.1 AND ${MAX_TRIP_KM}
     ORDER BY doc_no DESC
     LIMIT ${Number(limit) || 500}`
  );
  if (dryRun || rows.length === 0) return { found: rows.length, written: 0, rows };
  let written = 0;
  for (const row of rows) {
    const inserted = await query(
      `INSERT INTO public.odg_tms_trip_distance
         (doc_no, car_code, start_at, end_at, distance_km, source)
       VALUES ($1, $2, $3, $4, $5, 'trail')
       ON CONFLICT (doc_no) DO NOTHING
       RETURNING doc_no`,
      [row.doc_no, row.car_code, row.start_at, row.end_at, row.km]
    );
    written += inserted.length;
  }
  return { found: rows.length, written, rows };
}

module.exports = {
  ensureSchema,
  captureStart,
  captureEnd,
  getDistanceMap,
  backfillFromTrail,
};

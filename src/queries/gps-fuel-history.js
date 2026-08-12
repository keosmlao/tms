// ດຶງລະດັບນ້ຳມັນ (%) ຍ້ອນຫຼັງຈາກ provider ມາໃສ່ odg_tms_gps_realtime_log.
//
// ເປັນຫຍັງຕ້ອງມີແຍກຕ່າງຫາກຈາກ backfillGpsLog: ຕົວນັ້ນ "ຂ້າມມື້ທີ່ມີຈຸດຢູ່ແລ້ວ"
// ແລະ INSERT ຂອງມັນເປັນ ON CONFLICT DO NOTHING. ແຖວ GPS ສ່ວນໃຫຍ່ຖືກເກັບໄວ້
// ກ່ອນທີ່ຖັນ fuel_percent ຈະມີ ຈຶ່ງເປັນ NULL ໝົດ ແລະ ຈະບໍ່ມີວັນຖືກຕື່ມ.
// ຢູ່ນີ້ໃຊ້ DO UPDATE ສະເພາະຖັນ fuel_percent — ບໍ່ແຕະ lat/lng/speed ຂອງເດີມ.
//
// ⚠️ provider ຈຳກັດອັດຕາການເອີ້ນ (ພົບ HTTP 429 ແທ້ຕອນທົດສອບ) ຈຶ່ງເອີ້ນເທື່ອລະຄັນ
// ບໍ່ຍິງພ້ອມກັນ ແລະ ຂ້າມມື້ທີ່ຕື່ມຄົບແລ້ວ.
"use strict";

const { pool, query, queryOne } = require("../lib/db");
const { clampFuelPercent } = require("../lib/fuel-sanity");

/**
 * ຂຽນຄ່າ % ລົງແຖວທີ່ມີຢູ່ (ຈັບຄູ່ດ້ວຍ imei + recorded_at) ຫຼື ເພີ່ມແຖວໃໝ່ຖ້າຍັງບໍ່ມີ.
 * @param {Array<{imei:string,car_code?:string,car_name?:string,lat:number,lng:number,speed:number,heading:number,recorded_at:string,oil:unknown}>} rows
 * @returns {Promise<number>} ຈຳນວນແຖວທີ່ມີຄ່າ % ຂຽນລົງ
 */
async function upsertFuelPercent(rows) {
  const usable = (Array.isArray(rows) ? rows : []).filter(
    (r) => clampFuelPercent(r.oil) !== null && String(r.recorded_at ?? "").trim()
  );
  if (usable.length === 0) return 0;

  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < usable.length; i += BATCH) {
    const batch = usable.slice(i, i + BATCH);
    const values = [];
    const params = [];
    for (const r of batch) {
      const b = params.length;
      values.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`
      );
      params.push(
        String(r.imei ?? "").trim(),
        String(r.car_code ?? "").trim(),
        String(r.car_name ?? "").trim(),
        Number.isFinite(Number(r.lat)) ? Number(r.lat) : null,
        Number.isFinite(Number(r.lng)) ? Number(r.lng) : null,
        Number.isFinite(Number(r.speed)) ? Number(r.speed) : null,
        Number.isFinite(Number(r.heading)) ? Number(r.heading) : null,
        String(r.recorded_at).trim(),
        clampFuelPercent(r.oil)
      );
    }
    const res = await pool.query(
      `INSERT INTO public.odg_tms_gps_realtime_log
         (imei, car_code, car_name, lat, lng, speed, heading, recorded_at, fuel_percent)
       VALUES ${values.join(",")}
       ON CONFLICT (imei, recorded_at) DO UPDATE SET
         fuel_percent = EXCLUDED.fuel_percent`,
      params
    );
    written += res.rowCount || 0;
  }
  return written;
}

/** ມື້ນີ້ຄັນນີ້ ຕື່ມ % ຄົບແລ້ວບໍ່? ໃຊ້ຂ້າມການເອີ້ນ provider ຊ້ຳ. */
async function dayHasFuel(imei, day) {
  const row = await queryOne(
    `SELECT 1 AS ok FROM public.odg_tms_gps_realtime_log
     WHERE imei = $1
       AND recorded_at >= $2::date
       AND recorded_at <  ($2::date + INTERVAL '1 day')
       AND fuel_percent IS NOT NULL
     LIMIT 1`,
    [imei, day]
  );
  return Boolean(row);
}

/**
 * ດຶງ % ຍ້ອນຫຼັງໃຫ້ທຸກຄັນ ໃນຊ່ວງວັນທີທີ່ໃຫ້ມາ.
 * @param {string[]} days ລາຍການວັນ YYYY-MM-DD
 * @param {{onProgress?: Function, force?: boolean}} [opts]
 */
async function backfillFuelPercent(days, opts = {}) {
  const { fetchGpsHistoryOneDay } = require("./gps-usage.js");
  const cars = await query(
    `SELECT code, name_1, imei FROM public.odg_tms_car
     WHERE COALESCE(imei, '') <> '' ORDER BY code`
  );
  let fetched = 0;
  let skipped = 0;
  let written = 0;
  let errors = 0;

  for (const car of cars) {
    for (const day of days) {
      try {
        if (!opts.force && (await dayHasFuel(car.imei, day))) {
          skipped++;
          continue;
        }
        const { points } = await fetchGpsHistoryOneDay(car.imei, day);
        fetched++;
        const rows = points.map((p) => ({
          imei: car.imei,
          car_code: car.code,
          car_name: car.name_1,
          lat: p.lat,
          lng: p.lng,
          speed: p.speed,
          heading: p.heading,
          recorded_at: p.recordedAt,
          oil: p.oil,
        }));
        const n = await upsertFuelPercent(rows);
        written += n;
        if (opts.onProgress) opts.onProgress({ car, day, written: n });
      } catch (err) {
        errors++;
        console.error(
          `[gps-fuel-history] ${car.code} ${day} ລົ້ມ:`,
          err?.message ?? err
        );
      }
    }
  }
  return { cars: cars.length, days: days.length, fetched, skipped, written, errors };
}

module.exports = {
  upsertFuelPercent,
  backfillFuelPercent,
  dayHasFuel,
};

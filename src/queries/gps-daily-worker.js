const { query } = require("../lib/db");
const { FIXED_YEAR_START, getFixedTodayDate } = require("../lib/fixed-year");
const { ensureSchema, getExistingDays, insertDay } = require("./gps-day-store");

// We reuse the single-day fetcher from gps-usage so the URL format stays:
//   /exporter/log/getHistory/{imei}/{YYYYMMDD}
const gpsUsage = require("./gps-usage");

// ==================== Helpers ====================

function enumerateDays(from, to) {
  const out = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

async function getCarsWithImei() {
  return query(
    `SELECT code, name_1, imei FROM public.odg_tms_car
     WHERE imei IS NOT NULL AND btrim(imei) <> ''
     ORDER BY name_1 ASC, code ASC`
  );
}

// ==================== Worker ====================

let timer = null;
let running = false;

async function runTick() {
  if (running) {
    console.log("[gps-day] previous tick still running, skip");
    return;
  }
  running = true;
  const started = Date.now();
  try {
    await ensureSchema();

    const fromDate = process.env.GPS_DAILY_FROM_DATE || FIXED_YEAR_START;
    const toDate = getFixedTodayDate();
    const allDays = enumerateDays(fromDate, toDate);

    const cars = await getCarsWithImei();
    if (cars.length === 0) {
      console.log("[gps-day] no cars with imei; skip");
      return;
    }

    console.log(
      `[gps-day] tick cars=${cars.length} range=${fromDate}..${toDate} days=${allDays.length}`
    );

    let fetchedTotal = 0;
    let skippedTotal = 0;
    let errorsTotal = 0;

    for (const car of cars) {
      try {
        const imei = String(car.imei).trim();
        const already = await getExistingDays(imei, fromDate, toDate);
        const missing = allDays.filter((d) => !already.has(d));
        skippedTotal += allDays.length - missing.length;

        if (missing.length === 0) continue;

        console.log(
          `[gps-day] imei=${imei} code=${car.code} missing=${missing.length}/${allDays.length}`
        );

        for (const day of missing) {
          try {
            const { points } = await gpsUsage.fetchGpsHistoryOneDay(imei, day);
            await insertDay({
              imei,
              car_code: car.code,
              car_name: car.name_1,
              usage_date: day,
              points,
            });
            fetchedTotal += 1;
          } catch (err) {
            errorsTotal += 1;
            console.error(
              `[gps-day] fetch/insert failed imei=${imei} date=${day}:`,
              err?.message ?? err
            );
          }
        }
      } catch (err) {
        errorsTotal += 1;
        console.error(
          `[gps-day] car failed imei=${car.imei}:`,
          err?.message ?? err
        );
      }
    }

    const elapsed = Date.now() - started;
    console.log(
      `[gps-day] tick done fetched=${fetchedTotal} skipped=${skippedTotal} errors=${errorsTotal} elapsed=${elapsed}ms`
    );
  } catch (err) {
    console.error("[gps-day] tick failed:", err?.message ?? err);
  } finally {
    running = false;
  }
}

function startWorker(options = {}) {
  if (timer) return;
  const intervalMs = Number(
    options.intervalMs ??
      process.env.GPS_DAILY_INTERVAL_MS ??
      60 * 60 * 1000
  );
  const initialDelayMs = Number(
    options.initialDelayMs ??
      process.env.GPS_DAILY_INITIAL_DELAY_MS ??
      30_000
  );

  const fromDate = process.env.GPS_DAILY_FROM_DATE || FIXED_YEAR_START;
  console.log(
    `[gps-day] worker starting from=${fromDate} interval=${intervalMs}ms initial_delay=${initialDelayMs}ms`
  );

  setTimeout(() => void runTick(), initialDelayMs);
  timer = setInterval(() => void runTick(), intervalMs);
}

function stopWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startWorker,
  stopWorker,
  runTick,
};

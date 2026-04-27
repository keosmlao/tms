// In-process backfill runner with shared state.
// Runs backfillGpsLog in a loop with sleep between iterations until either:
//   - all (car × day) pairs are present in odg_tms_gps_realtime_log
//   - max iterations reached
//   - stop signal received
//
// Exposes start / stop / status for HTTP endpoints.

const { backfillGpsLog } = require("./gps-usage");
const { query } = require("../lib/db");

let state = freshState();

function freshState() {
  return {
    status: "idle", // idle | running | stopping | done | failed
    started_at: null,
    finished_at: null,
    fromDate: null,
    toDate: null,
    car_code: null,
    iteration: 0,
    max_iterations: 0,
    last_iteration_summary: null,
    total_inserted: 0,
    total_errors: 0,
    last_error: null,
    next_run_at: null, // ISO string when next iteration will start
    cars_progress: [], // [{ code, name, days_done, days_total }]
    log: [], // recent log lines (capped)
  };
}

function pushLog(line) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  state.log.push(`[${ts}] ${line}`);
  if (state.log.length > 200) state.log.shift();
}

async function refreshCarsProgress() {
  try {
    const rows = await query(`
      SELECT
        c.code, c.name_1 AS name, c.imei,
        COUNT(DISTINCT DATE(l.recorded_at))::int AS days_done
      FROM public.odg_tms_car c
      LEFT JOIN public.odg_tms_gps_realtime_log l
        ON l.imei = c.imei
       AND l.recorded_at >= $1::date
       AND l.recorded_at <  ($2::date + INTERVAL '1 day')
      WHERE c.imei IS NOT NULL AND btrim(c.imei) <> ''
      GROUP BY c.code, c.name_1, c.imei
      ORDER BY c.name_1`,
      [state.fromDate, state.toDate]
    );
    const totalDays = computeDayCount(state.fromDate, state.toDate);
    state.cars_progress = rows.map((r) => ({
      code: r.code,
      name: r.name,
      imei: r.imei,
      days_done: Number(r.days_done) || 0,
      days_total: totalDays,
    }));
  } catch (err) {
    pushLog(`progress check failed: ${err?.message ?? err}`);
  }
}

function computeDayCount(fromDate, toDate) {
  const a = new Date(fromDate + "T00:00:00Z").getTime();
  const b = new Date(toDate + "T00:00:00Z").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

function isComplete() {
  if (state.cars_progress.length === 0) return false;
  return state.cars_progress.every((c) => c.days_done >= c.days_total);
}

async function runLoop() {
  try {
    for (let i = 1; i <= state.max_iterations; i++) {
      if (state.status === "stopping") {
        pushLog("stop requested — exiting loop");
        break;
      }
      state.iteration = i;
      pushLog(`iteration ${i}/${state.max_iterations} starting`);

      const summary = await backfillGpsLog(
        state.fromDate,
        state.toDate,
        state.car_code,
        {
          onProgress: ({ car, day, inserted }) => {
            pushLog(`  ${car.code} ${day} +${inserted}`);
          },
        }
      );
      state.last_iteration_summary = summary;
      state.total_inserted += summary.inserted_points;
      state.total_errors += summary.errors;
      pushLog(
        `iteration ${i} done inserted=${summary.inserted_points} errors=${summary.errors} fetched_days=${summary.fetched_days} skipped_days=${summary.skipped_days}`
      );

      await refreshCarsProgress();

      if (isComplete()) {
        pushLog("✓ all cars × days complete — stopping");
        break;
      }

      if (i >= state.max_iterations) {
        pushLog("max iterations reached — stopping");
        break;
      }

      // If nothing was fetched this iteration, sleep longer (rate limit cooldown)
      const cooldownMs =
        summary.errors > 0 || summary.fetched_days === 0 ? 5 * 60_000 : 30_000;
      const wakeAt = new Date(Date.now() + cooldownMs);
      state.next_run_at = wakeAt.toISOString();
      pushLog(
        `cooldown ${Math.round(cooldownMs / 1000)}s before iteration ${i + 1} (fetched=${summary.fetched_days} errors=${summary.errors})`
      );
      await sleep(cooldownMs);
      state.next_run_at = null;
    }

    state.status = "done";
    state.finished_at = new Date().toISOString();
    await refreshCarsProgress();
    pushLog("runner finished");
  } catch (err) {
    state.status = "failed";
    state.last_error = err?.message ?? String(err);
    state.finished_at = new Date().toISOString();
    pushLog(`FAILED: ${state.last_error}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function start({ fromDate, toDate, carCode, maxIterations }) {
  if (state.status === "running") {
    return { ok: false, message: "Backfill already running" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || "")) {
    return { ok: false, message: "Invalid fromDate (YYYY-MM-DD)" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate || "")) {
    return { ok: false, message: "Invalid toDate (YYYY-MM-DD)" };
  }
  state = freshState();
  state.status = "running";
  state.started_at = new Date().toISOString();
  state.fromDate = fromDate;
  state.toDate = toDate;
  state.car_code = carCode || null;
  state.max_iterations = Math.max(1, Math.min(50, Number(maxIterations) || 20));
  pushLog(
    `starting fromDate=${fromDate} toDate=${toDate} car=${carCode || "(all)"} maxIter=${state.max_iterations}`
  );
  // Fire-and-forget — we don't await runLoop() so the HTTP request returns immediately.
  void runLoop();
  return { ok: true, message: "Backfill started", state: getStatus() };
}

function stop() {
  if (state.status !== "running") {
    return { ok: false, message: `Not running (status=${state.status})` };
  }
  state.status = "stopping";
  pushLog("stop signal received");
  return { ok: true, message: "Stop requested" };
}

function getStatus() {
  return {
    status: state.status,
    started_at: state.started_at,
    finished_at: state.finished_at,
    fromDate: state.fromDate,
    toDate: state.toDate,
    car_code: state.car_code,
    iteration: state.iteration,
    max_iterations: state.max_iterations,
    total_inserted: state.total_inserted,
    total_errors: state.total_errors,
    last_iteration_summary: state.last_iteration_summary,
    last_error: state.last_error,
    next_run_at: state.next_run_at,
    cars_progress: state.cars_progress,
    is_complete: isComplete(),
    log_tail: state.log.slice(-50),
  };
}

module.exports = { start, stop, getStatus };

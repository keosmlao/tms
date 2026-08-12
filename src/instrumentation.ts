/**
 * Next.js instrumentation hook — runs once per server process at startup.
 *
 * This is where the GPS realtime worker is started. Without it the vehicle
 * trail table (`odg_tms_gps_realtime_log`) was only written as a side effect of
 * somebody opening the tracking pages, so it went stale for days at a time and
 * trip distance could not be calculated at all.
 *
 * Set GPS_REALTIME_LOG_ENABLED=false to stop a process from polling the tracker
 * provider — needed when the app runs as several instances, since every one of
 * them would otherwise hit the provider on the same 20s cycle.
 */
export async function register() {
  // The hook also runs on the edge runtime, where timers and `pg` do not exist.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.GPS_REALTIME_LOG_ENABLED ?? "true").toLowerCase() === "false") {
    console.log("[instrumentation] gps realtime worker disabled by env");
    return;
  }
  if (!process.env.GPS_TRACKER_USER || !process.env.GPS_TRACKER_PASS) {
    console.warn(
      "[instrumentation] GPS_TRACKER_USER/PASS missing — realtime worker not started"
    );
    return;
  }
  try {
    const { startWorker } = await import("@/queries/gps-realtime-log.js");
    startWorker();
  } catch (error) {
    // A failed worker must never stop the web app from serving.
    console.error(
      "[instrumentation] failed to start gps realtime worker:",
      error instanceof Error ? error.message : error
    );
  }

  // Rolls the raw trail up into per-day distance. Summing a month of raw pings
  // at request time took 4.8–11.5s; from the rollup it is milliseconds.
  try {
    const { startWorker } = await import("@/queries/gps-daily-rollup.js");
    startWorker();
  } catch (error) {
    console.error(
      "[instrumentation] failed to start gps daily rollup worker:",
      error instanceof Error ? error.message : error
    );
  }
}

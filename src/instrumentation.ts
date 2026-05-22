// Runs once when the Next.js server boots. Starts background workers that
// keep the GPS DB caches fresh so user-facing pages can render instantly from
// cache instead of waiting on live provider calls.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.GPS_REALTIME_WORKER_DISABLED === "1") {
    console.log("[instrumentation] GPS realtime worker disabled by env");
    return;
  }
  // Survive dev HMR module reloads.
  const g = globalThis as { __tmsGpsWorkerStarted?: boolean };
  if (g.__tmsGpsWorkerStarted) return;
  g.__tmsGpsWorkerStarted = true;
  try {
    // Single worker fills both odg_tms_gps_current (latest position) and
    // odg_tms_gps_realtime_log (historical points) per tick.
    const { startWorker } = await import("./queries/gps-realtime-log.js");
    startWorker();
    console.log("[instrumentation] GPS realtime-log worker started");
  } catch (err) {
    g.__tmsGpsWorkerStarted = false;
    console.error(
      "[instrumentation] failed to start GPS realtime-log worker:",
      err instanceof Error ? err.message : err
    );
  }
}

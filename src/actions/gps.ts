"use server";

import { requireSession } from "./_helpers";
import gpsBackfillRunner from "@/queries/gps-backfill-runner.js";
import {
  fetchGpsObjectList as svcFetchGpsObjectList,
  syncGpsDay as svcSyncGpsDay,
  syncGpsRange as svcSyncGpsRange,
  getGpsUsageSummary as svcGetGpsUsageSummary,
  getGpsUsageDaily as svcGetGpsUsageDaily,
  getGpsUsageTrack as svcGetGpsUsageTrack,
  getCarsWithGps as svcGetCarsWithGps,
  probeGpsHistory as svcProbeGpsHistory,
} from "@/queries/gps-usage.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getGpsObjectList() {
  await requireSession();
  return svcFetchGpsObjectList();
}

export async function getGpsCars() {
  await requireSession();
  return svcGetCarsWithGps();
}

export async function getGpsProbe(imei: string, date: string) {
  await requireSession();
  return svcProbeGpsHistory(imei, date);
}

export async function syncGpsDay(date: string) {
  await requireSession();
  const d = date.trim();
  if (!DATE_RE.test(d)) throw new Error("Invalid date (expected YYYY-MM-DD)");
  try {
    return await svcSyncGpsDay(d);
  } catch (err: any) {
    console.error(`[gps-sync-day] ${d} failed`, err);
    return {
      date: d,
      synced: 0,
      skipped: 0,
      errors: 1,
      cars: [],
      error: err?.message ?? String(err),
    };
  }
}

export async function syncGpsRange(
  fromDate: string,
  toDate: string,
  carCode?: string
) {
  await requireSession();
  const f = fromDate.trim();
  const t = toDate.trim();
  if (!DATE_RE.test(f) || !DATE_RE.test(t)) {
    throw new Error("Invalid date (expected YYYY-MM-DD)");
  }
  try {
    return await svcSyncGpsRange(f, t, carCode?.trim() || undefined);
  } catch (err: any) {
    console.error(`[gps-sync-range] ${f}..${t} failed`, err);
    return {
      fromDate: f,
      toDate: t,
      total_cars: 0,
      synced_cars: 0,
      total_days: 0,
      total_points: 0,
      fetched_days: 0,
      errors: 1,
      cars: [],
      error: err?.message ?? String(err),
    };
  }
}

export async function getGpsUsageSummary(
  fromDate: string,
  toDate: string,
  carCode?: string
) {
  await requireSession();
  return svcGetGpsUsageSummary(fromDate, toDate, carCode);
}

export async function getGpsUsageDaily(
  fromDate: string,
  toDate: string,
  imei: string
) {
  await requireSession();
  return svcGetGpsUsageDaily(fromDate, toDate, imei);
}

export async function getGpsUsageTrack(imei: string, date: string) {
  await requireSession();
  return svcGetGpsUsageTrack(imei, date);
}

// Backfill runner (in-memory state)
export async function startGpsBackfill(
  fromDate: string,
  toDate: string,
  carCode?: string,
  maxIterations?: number
) {
  await requireSession();
  const result = gpsBackfillRunner.start({
    fromDate,
    toDate,
    carCode,
    maxIterations,
  });
  if (!result.ok) throw new Error(result.message);
  return result;
}

export async function getGpsBackfillStatus() {
  await requireSession();
  return gpsBackfillRunner.getStatus();
}

export async function stopGpsBackfill() {
  await requireSession();
  const result = gpsBackfillRunner.stop();
  if (!result.ok) throw new Error(result.message);
  return result;
}

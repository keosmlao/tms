"use server";

import { requireSession } from "./_helpers";
import {
  trackBill as svcTrackBill,
  getGpsRealtime as svcGetGpsRealtime,
  getLocations as svcGetLocations,
} from "@/queries/tracking.js";
import { getCurrentAll as svcGetCurrentAll } from "@/queries/gps-current.js";

export async function trackBill(search: string) {
  const s = await requireSession();
  return svcTrackBill(s, search);
}

export async function getGpsRealtime(imei: string) {
  await requireSession();
  return svcGetGpsRealtime(imei);
}

export async function getGpsRealtimeAll() {
  await requireSession();
  return svcGetCurrentAll();
}

export async function getLocations(search?: string) {
  const s = await requireSession();
  return svcGetLocations(s, search);
}

"use server";

import { requireSession } from "./_helpers";
import {
  trackBill as svcTrackBill,
  searchActiveDeliveryBills as svcSearchActiveDeliveryBills,
  getGpsRealtime as svcGetGpsRealtime,
  getGpsRealtimeAll as svcGetGpsRealtimeAllLive,
  getLocations as svcGetLocations,
  getPhoneTrackingJobs as svcGetPhoneTrackingJobs,
  getPhoneFleet as svcGetPhoneFleet,
  getPhoneTrail as svcGetPhoneTrail,
} from "@/queries/tracking.js";
import {
  getCurrentAll as svcGetCurrentAll,
  getCurrentAllLean as svcGetCurrentAllLean,
} from "@/queries/gps-current.js";

export async function trackBill(search: string) {
  const s = await requireSession();
  return svcTrackBill(s, search);
}

export async function searchActiveDeliveryBills(query?: string) {
  const s = await requireSession();
  return svcSearchActiveDeliveryBills(s, query ?? "");
}

export async function getGpsRealtime(imei: string) {
  await requireSession();
  return svcGetGpsRealtime(imei);
}

export async function getGpsRealtimeAll() {
  await requireSession();
  return svcGetCurrentAll();
}

// Bypasses DB cache and hits the provider /getRealTime endpoint directly per
// car. Slow (~1.2s per car due to rate limit) but always fresh.
export async function getGpsRealtimeAllLive() {
  await requireSession();
  return svcGetGpsRealtimeAllLive();
}

// Lean DB-cache read: skips active_job LATERAL join and daily distance query.
// For pages that only need lat/lng/speed/recorded_at.
export async function getGpsRealtimeAllLean() {
  await requireSession();
  return svcGetCurrentAllLean();
}

export async function getLocations(search?: string) {
  const s = await requireSession();
  return svcGetLocations(s, search);
}

// Phone-collected tracking: list trips that have device GPS points.
export async function getPhoneTrackingJobs() {
  const s = await requireSession();
  return svcGetPhoneTrackingJobs(s);
}

// Fleet view: latest phone fix per trip, for the all-phones-on-one-map page.
export async function getPhoneFleet() {
  const s = await requireSession();
  return svcGetPhoneFleet(s);
}

// Full ordered trail + telemetry + device info for one trip.
export async function getPhoneTrail(docNo: string) {
  const s = await requireSession();
  return svcGetPhoneTrail(s, docNo);
}

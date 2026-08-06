"use server";

import { requireSession } from "./_helpers";
import {
  getDashboardData as svc,
  getDashboardSummary as svcSummary,
  getDashboardKpi as svcKpi,
  getDashboardDeliveryPerformance as svcDeliveryPerformance,
  getDashboardPending as svcPending,
  getDashboardActivity as svcActivity,
} from "@/queries/dashboard.js";
import { getDriverLeaderboard as svcDriverLeaderboard } from "@/queries/driver-leaderboard.js";

export async function getDashboardData(force = false) {
  const s = await requireSession();
  return svc(s, force);
}

// Progressive slices — the dashboard page fetches these three in parallel and
// renders each section as its slice lands (summary ~fast, kpi ~medium,
// pending ~slow). force=true bypasses the per-slice cache (manual refresh).
export async function getDashboardSummary(force = false) {
  const s = await requireSession();
  return svcSummary(s, force);
}

export async function getDashboardKpi(force = false) {
  const s = await requireSession();
  return svcKpi(s, force);
}

// ປະສິດທິພາບການຈັດສົ່ງຂອງເດືອນປັດຈຸບັນ — ຊຸດດຽວກັບໜ້າ
// /reports/delivery-performance ພຽງແຕ່ຕຶງເດືອນໄວ້ທີ່ "ເດືອນນີ້".
export async function getDashboardDeliveryPerformance(force = false) {
  const s = await requireSession();
  return svcDeliveryPerformance(s, force);
}

export async function getDashboardPending(force = false) {
  const s = await requireSession();
  return svcPending(s, force);
}

// Activity lists (in-progress / waiting / delivered-pending-close) — loaded
// separately so the dashboard core renders first and these stream in.
export async function getDashboardActivity() {
  const s = await requireSession();
  return svcActivity(s);
}

export async function getDriverLeaderboard(period: "today" | "month" | "year" = "month") {
  const s = await requireSession();
  return svcDriverLeaderboard(s, period);
}

"use server";

import { requireSession } from "./_helpers";
import {
  getDashboardData as svc,
  getDashboardActivity as svcActivity,
} from "@/queries/dashboard.js";
import { getDriverLeaderboard as svcDriverLeaderboard } from "@/queries/driver-leaderboard.js";

export async function getDashboardData() {
  const s = await requireSession();
  return svc(s);
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

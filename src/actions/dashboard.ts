"use server";

import { requireSession } from "./_helpers";
import { getDashboardData as svc } from "@/queries/dashboard.js";
import { getDriverLeaderboard as svcDriverLeaderboard } from "@/queries/driver-leaderboard.js";

export async function getDashboardData() {
  const s = await requireSession();
  return svc(s);
}

export async function getDriverLeaderboard(period: "today" | "month" | "year" = "month") {
  const s = await requireSession();
  return svcDriverLeaderboard(s, period);
}

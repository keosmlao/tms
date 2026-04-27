"use server";

import { requireSession } from "./_helpers";
import { getDashboardData as svc } from "@/queries/dashboard.js";

export async function getDashboardData() {
  const s = await requireSession();
  return svc(s);
}

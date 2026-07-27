"use server";

import { requireDispatchAccess, requireSession } from "./_helpers";
import {
  getPickupVarianceList as svcGetPickupVarianceList,
  acknowledgePickupVariance as svcAcknowledgePickupVariance,
  getOpenPickupVarianceCount as svcGetOpenPickupVarianceCount,
} from "@/queries/pickup-variance.js";

export async function getPickupVarianceList(
  fromDate: string,
  toDate: string,
  status: "open" | "acknowledged" | "all" = "open"
) {
  const s = await requireSession();
  return svcGetPickupVarianceList(s, fromDate, toDate, status);
}

// Acknowledging is dispatch work, not something a sales login should do.
export async function acknowledgePickupVariance(docNo: string, billNo: string) {
  const s = await requireDispatchAccess();
  return svcAcknowledgePickupVariance(s, docNo, billNo);
}

export async function getOpenPickupVarianceCount() {
  const s = await requireSession();
  return svcGetOpenPickupVarianceCount(s);
}

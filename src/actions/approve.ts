"use server";

import { requireSession } from "./_helpers";
import {
  getApproveList as svcGetApproveList,
  approveJob as svcApproveJob,
  getApproveReport as svcGetApproveReport,
} from "@/queries/approve.js";

export async function getApproveList() {
  const s = await requireSession();
  return svcGetApproveList(s);
}

export async function approveJob(docNo: string) {
  const s = await requireSession();
  return svcApproveJob(s, docNo);
}

export async function getApproveReport(fromDate: string, toDate: string) {
  const s = await requireSession();
  return svcGetApproveReport(s, fromDate, toDate);
}

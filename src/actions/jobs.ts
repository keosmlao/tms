"use server";

import { requireSession } from "./_helpers";
import {
  getJobs as svcGetJobs,
  createJob as svcCreateJob,
  deleteJob as svcDeleteJob,
  closeJob as svcCloseJob,
  getJobInit as svcGetJobInit,
  getJobAddPageData as svcGetJobAddPageData,
  getJobBillsWithProducts as svcGetJobBillsWithProducts,
  addBillToDraft as svcAddBillToDraft,
  removeBillFromDraft as svcRemoveBillFromDraft,
  searchBills as svcSearchBills,
} from "@/queries/jobs.js";

export async function getJobs() {
  const s = await requireSession();
  return svcGetJobs(s);
}

export async function createJob(data: unknown) {
  const s = await requireSession();
  return svcCreateJob(s, data);
}

export async function deleteJob(docNo: string) {
  await requireSession();
  return svcDeleteJob(docNo);
}

export async function closeJob(docNo: string) {
  const s = await requireSession();
  return svcCloseJob(s, docNo);
}

export async function getJobInit() {
  const s = await requireSession();
  return svcGetJobInit(s);
}

export async function getJobAddPageData() {
  const s = await requireSession();
  return svcGetJobAddPageData(s);
}

export async function getJobBillsWithProducts(docNo: string) {
  await requireSession();
  return svcGetJobBillsWithProducts(docNo);
}

// Draft / search bills (logically part of job creation flow)
export async function addBillToDraft(data: unknown) {
  const s = await requireSession();
  return svcAddBillToDraft(s, data);
}

export async function removeBillFromDraft(billNo: string) {
  const s = await requireSession();
  return svcRemoveBillFromDraft(s, billNo);
}

export async function searchBills(q: string) {
  const s = await requireSession();
  return svcSearchBills(s, q);
}

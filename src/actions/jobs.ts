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
  searchBillsForJob as svcSearchBillsForJob,
  addBillsToJob as svcAddBillsToJob,
  getJobsClosedByDriver as svcGetJobsClosedByDriver,
  getJobsClosed as svcGetJobsClosed,
  getJobsWaitingReceive as svcGetJobsWaitingReceive,
  getJobsWaitingPickup as svcGetJobsWaitingPickup,
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

export interface AddBillsToJobItem {
  item_code: string;
  item_name?: string;
  qty?: number;
  selectedQty: number;
  unit_code?: string;
}
export interface AddBillsToJobEntry {
  bill_no: string;
  items?: AddBillsToJobItem[];
}

export async function addBillsToJob(
  docNo: string,
  bills: AddBillsToJobEntry[] | string[]
) {
  await requireSession();
  return svcAddBillsToJob(docNo, bills);
}

export async function searchBillsForJob(query: string, excludeDocNo?: string) {
  await requireSession();
  return svcSearchBillsForJob(query, excludeDocNo);
}

export async function getJobsClosedByDriver(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetJobsClosedByDriver(s, fromDate, toDate);
}

export async function getJobsClosed(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetJobsClosed(s, fromDate, toDate);
}

export async function getJobsWaitingReceive(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetJobsWaitingReceive(s, fromDate, toDate);
}

export async function getJobsWaitingPickup(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetJobsWaitingPickup(s, fromDate, toDate);
}

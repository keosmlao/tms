"use server";

import { requireSession, requireDispatchAccess } from "./_helpers";
import {
  getJobs as svcGetJobs,
  createJob as svcCreateJob,
  updateJob as svcUpdateJob,
  getJobForEdit as svcGetJobForEdit,
  deleteJob as svcDeleteJob,
  closeJob as svcCloseJob,
  getJobInit as svcGetJobInit,
  getJobAddPageData as svcGetJobAddPageData,
  getJobBillsWithProducts as svcGetJobBillsWithProducts,
  getJobPrintData as svcGetJobPrintData,
  addBillToDraft as svcAddBillToDraft,
  removeBillFromDraft as svcRemoveBillFromDraft,
  searchBills as svcSearchBills,
  searchBillsForJob as svcSearchBillsForJob,
  addBillsToJob as svcAddBillsToJob,
  getJobsClosedByDriver as svcGetJobsClosedByDriver,
  getJobsClosed as svcGetJobsClosed,
  getJobsWaitingReceive as svcGetJobsWaitingReceive,
  getJobsWaitingPickup as svcGetJobsWaitingPickup,
  listPickupReadyJobs as svcListPickupReadyJobs,
  moveBillToJob as svcMoveBillToJob,
} from "@/queries/jobs.js";

export async function getJobs() {
  const s = await requireSession();
  return svcGetJobs(s);
}

export async function createJob(data: unknown) {
  const s = await requireDispatchAccess();
  return svcCreateJob(s, data);
}

export async function updateJob(docNo: string, data: unknown) {
  const s = await requireDispatchAccess();
  return svcUpdateJob(s, docNo, data);
}

export async function getJobForEdit(docNo: string) {
  await requireDispatchAccess();
  return svcGetJobForEdit(docNo);
}

export async function deleteJob(docNo: string) {
  await requireDispatchAccess();
  return svcDeleteJob(docNo);
}

export async function closeJob(docNo: string) {
  const s = await requireDispatchAccess();
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

export async function getJobPrintData(docNo: string) {
  await requireSession();
  return svcGetJobPrintData(docNo);
}

// Draft / search bills (logically part of job creation flow)
export async function addBillToDraft(data: unknown) {
  const s = await requireDispatchAccess();
  return svcAddBillToDraft(s, data);
}

export async function removeBillFromDraft(billNo: string) {
  const s = await requireDispatchAccess();
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
  await requireDispatchAccess();
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

export async function listPickupReadyJobs(excludeDocNo?: string) {
  const s = await requireSession();
  return svcListPickupReadyJobs(s, excludeDocNo);
}

export async function moveBillToJob(
  sourceDocNo: string,
  billNo: string,
  destDocNo: string
) {
  await requireDispatchAccess();
  return svcMoveBillToJob(sourceDocNo, billNo, destDocNo);
}

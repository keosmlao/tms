"use server";

import { requireSession } from "./_helpers";
import {
  getAvailableBills as svcGetAvailableBills,
  getAvailableBillsWithProducts as svcGetAvailableBillsWithProducts,
  getAvailableBillProducts as svcGetAvailableBillProducts,
  getBillsPending as svcGetBillsPending,
  updateBillTransport as svcUpdateBillTransport,
  getBillProducts as svcGetBillProducts,
  getBillsWaitingSent as svcGetBillsWaitingSent,
  getBillsWaitingSentDetails as svcGetBillsWaitingSentDetails,
  getBillsInProgress as svcGetBillsInProgress,
  getBillCompleteList as svcGetBillCompleteList,
} from "@/queries/bills.js";

export async function getAvailableBills() {
  const s = await requireSession();
  return svcGetAvailableBills(s);
}

export async function getAvailableBillsWithProducts() {
  const s = await requireSession();
  return svcGetAvailableBillsWithProducts(s);
}

export async function getAvailableBillProducts(docNo: string) {
  await requireSession();
  return svcGetAvailableBillProducts(docNo);
}

export async function getBillsPending(
  fromDate: string,
  toDate: string,
  transportCode: string
) {
  const s = await requireSession();
  return svcGetBillsPending(s, fromDate, toDate, transportCode);
}

export async function updateBillTransport(docNo: string, transportCode: string) {
  await requireSession();
  return svcUpdateBillTransport(docNo, transportCode);
}

export async function getBillProducts(docNo: string) {
  await requireSession();
  return svcGetBillProducts(docNo);
}

export async function getBillsWaitingSent() {
  const s = await requireSession();
  return svcGetBillsWaitingSent(s);
}

export async function getBillsWaitingSentDetails(docNo: string) {
  await requireSession();
  return svcGetBillsWaitingSentDetails(docNo);
}

export async function getBillsInProgress() {
  const s = await requireSession();
  return svcGetBillsInProgress(s);
}

export async function getBillCompleteList(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetBillCompleteList(s, fromDate, toDate);
}

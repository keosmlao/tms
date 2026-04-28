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
  getBillsCancelledList as svcGetBillsCancelledList,
  getBillsPartialList as svcGetBillsPartialList,
} from "@/queries/bills.js";
import {
  getPendingBillSchedule as svcGetPendingBillSchedule,
  upsertPendingBillSchedule as svcUpsertPendingBillSchedule,
} from "@/queries/pending-bill.js";
import {
  getBillTodos as svcGetBillTodos,
  createBillTodo as svcCreateBillTodo,
  setBillTodoDone as svcSetBillTodoDone,
  deleteBillTodo as svcDeleteBillTodo,
} from "@/queries/bill-todo.js";

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

export async function getBillsCancelledList(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetBillsCancelledList(s, fromDate, toDate);
}

export async function getBillsPartialList(fromDate?: string, toDate?: string) {
  const s = await requireSession();
  return svcGetBillsPartialList(s, fromDate, toDate);
}

export async function getPendingBillSchedule(billNo: string) {
  await requireSession();
  return svcGetPendingBillSchedule(billNo);
}

export async function upsertPendingBillSchedule(input: {
  bill_no: string;
  scheduled_date?: string | null;
  remark?: string | null;
  action_status?: string | null;
}) {
  const s = await requireSession();
  return svcUpsertPendingBillSchedule({
    billNo: input.bill_no,
    scheduledDate: input.scheduled_date ?? null,
    remark: input.remark ?? null,
    actionStatus: input.action_status ?? null,
    userCode: (s as { code?: string })?.code,
  });
}

export async function getBillTodos(billNo: string) {
  await requireSession();
  return svcGetBillTodos(billNo);
}

export async function createBillTodo(input: {
  bill_no: string;
  summary: string;
  deadline?: string | null;
}) {
  const s = await requireSession();
  return svcCreateBillTodo({
    billNo: input.bill_no,
    summary: input.summary,
    deadline: input.deadline ?? null,
    userCode: (s as { code?: string })?.code,
  });
}

export async function setBillTodoDone(input: { id: number | string; done: boolean }) {
  const s = await requireSession();
  return svcSetBillTodoDone({
    id: input.id,
    done: input.done,
    userCode: (s as { code?: string })?.code,
  });
}

export async function deleteBillTodo(id: number | string) {
  await requireSession();
  return svcDeleteBillTodo(id);
}

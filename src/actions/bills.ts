"use server";

import { requireSession } from "./_helpers";
import {
  getAvailableBills as svcGetAvailableBills,
  getAvailableBillsWithProducts as svcGetAvailableBillsWithProducts,
  getAvailableBillProducts as svcGetAvailableBillProducts,
  searchManualPendingBills as svcSearchManualPendingBills,
  addManualPendingBill as svcAddManualPendingBill,
  removeManualPendingBill as svcRemoveManualPendingBill,
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

export async function searchManualPendingBills(q: string) {
  await requireSession();
  return svcSearchManualPendingBills(q);
}

export async function addManualPendingBill(input: {
  bill_no: string;
  scheduled_date: string;
  delivery_round_code: string;
  delivery_route_code?: string | null;
  remark?: string | null;
  source_type?: string | null;
}) {
  const s = await requireSession();
  return svcAddManualPendingBill({
    billNo: input.bill_no,
    scheduledDate: input.scheduled_date,
    deliveryRoundCode: input.delivery_round_code,
    deliveryRouteCode: input.delivery_route_code ?? null,
    remark: input.remark ?? null,
    sourceType: input.source_type ?? null,
    userCode: (s as { code?: string; usercode?: string })?.code ?? (s as { usercode?: string })?.usercode,
  });
}

export async function removeManualPendingBill(billNo: string) {
  await requireSession();
  return svcRemoveManualPendingBill(billNo);
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
  delivery_route_code?: string | null;
  delivery_round_code?: string | null;
}) {
  const s = await requireSession();
  const current = await svcGetPendingBillSchedule(input.bill_no);
  const has = (key: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, key);
  return svcUpsertPendingBillSchedule({
    billNo: input.bill_no,
    scheduledDate: has("scheduled_date") ? input.scheduled_date ?? null : current?.scheduled_date ?? null,
    remark: has("remark") ? input.remark ?? null : current?.remark ?? null,
    actionStatus: has("action_status") ? input.action_status ?? null : current?.action_status ?? null,
    deliveryRouteCode: has("delivery_route_code")
      ? input.delivery_route_code ?? null
      : current?.delivery_route_code ?? null,
    deliveryRoundCode: has("delivery_round_code")
      ? input.delivery_round_code ?? null
      : current?.delivery_round_code ?? null,
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

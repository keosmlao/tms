"use server";

import { requireDispatchAccess, requireSession } from "./_helpers";
import {
  listTripDrafts as svcListTripDrafts,
  getTripDraftBills as svcGetTripDraftBills,
  getTripDraftCandidates as svcGetTripDraftCandidates,
  createTripDraft as svcCreateTripDraft,
  updateTripDraft as svcUpdateTripDraft,
  deleteTripDraft as svcDeleteTripDraft,
  addBillsToTripDraft as svcAddBillsToTripDraft,
  removeBillFromTripDraft as svcRemoveBillFromTripDraft,
  setTripDraftBillOptions as svcSetTripDraftBillOptions,
  dispatchTripDraft as svcDispatchTripDraft,
  listDraftedBillNos as svcListDraftedBillNos,
} from "@/queries/trip-draft.js";

// ຮ່າງຖ້ຽວ — planning stage before a real trip. Reading is open to any signed-in
// user; every mutation is dispatch work, so it goes through requireDispatchAccess.

// No arguments = every outstanding draft (the default board). dateTo defaults
// to dateFrom, so a single-day view is just one argument.
export async function listTripDrafts(dateFrom = "", dateTo?: string) {
  const s = await requireSession();
  return svcListTripDrafts(s, dateFrom, dateTo ?? dateFrom);
}

export async function listDraftedBillNos() {
  await requireSession();
  return svcListDraftedBillNos();
}

export async function getTripDraftBills(draftId: number) {
  await requireSession();
  return svcGetTripDraftBills(draftId);
}

export async function getTripDraftCandidates(
  dateLogistic: string,
  transportCode = ""
) {
  const s = await requireSession();
  return svcGetTripDraftCandidates(s, dateLogistic, transportCode);
}

export async function createTripDraft(input: {
  dateLogistic: string;
  originTransportCode?: string;
  deliveryRouteCode: string;
  deliveryRoundCode: string;
  /** ບັງຄັບ — ບໍ່ມີລົດ ຄິດພື້ນທີ່ບັນທຸກບໍ່ໄດ້ */
  car: string;
  remark?: string;
}) {
  const s = await requireDispatchAccess();
  return svcCreateTripDraft(s, input);
}

export async function updateTripDraft(
  draftId: number,
  patch: Record<string, unknown>
) {
  const s = await requireDispatchAccess();
  return svcUpdateTripDraft(s, draftId, patch);
}

export async function deleteTripDraft(draftId: number) {
  const s = await requireDispatchAccess();
  return svcDeleteTripDraft(s, draftId);
}

export async function addBillsToTripDraft(
  draftId: number,
  billNos: string[],
  items?: unknown[]
) {
  const s = await requireDispatchAccess();
  return svcAddBillsToTripDraft(s, draftId, billNos, items);
}

export async function removeBillFromTripDraft(draftId: number, billNo: string) {
  await requireDispatchAccess();
  return svcRemoveBillFromTripDraft(draftId, billNo);
}

export async function setTripDraftBillOptions(
  draftId: number,
  billNo: string,
  options: Record<string, unknown>
) {
  await requireDispatchAccess();
  return svcSetTripDraftBillOptions(draftId, billNo, options);
}

// ພ້ອມອອກ: turns the draft into a real trip through the normal createJob path.
export async function dispatchTripDraft(
  draftId: number,
  crew: { car?: string; driver?: string; workers?: string[] }
) {
  const s = await requireDispatchAccess();
  return svcDispatchTripDraft(s, draftId, crew);
}

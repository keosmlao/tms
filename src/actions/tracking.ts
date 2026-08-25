"use server";

import { requireSession } from "./_helpers";
import {
  trackBill as svcTrackBill,
  getSalesBillTrackingList as svcGetSalesBillTrackingList,
  getSalesDeliveredBillTrackingList as svcGetSalesDeliveredBillTrackingList,
  trackSalesBill as svcTrackSalesBill,
  searchActiveDeliveryBills as svcSearchActiveDeliveryBills,
  getGpsRealtime as svcGetGpsRealtime,
  getGpsRealtimeAll as svcGetGpsRealtimeAllLive,
  getLocations as svcGetLocations,
  getPhoneTrackingJobs as svcGetPhoneTrackingJobs,
  getPhoneFleet as svcGetPhoneFleet,
  getPhoneTrail as svcGetPhoneTrail,
  getDailyOpenedBillsForSales as svcGetDailyOpenedBillsForSales,
  getSalesTransportBranches as svcGetSalesTransportBranches,
  getBranchStaffForNotify as svcGetBranchStaffForNotify,
  isSalesBillInScope as svcIsSalesBillInScope,
} from "@/queries/tracking.js";
import {
  getCurrentAll as svcGetCurrentAll,
  getCurrentAllLean as svcGetCurrentAllLean,
} from "@/queries/gps-current.js";
import {
  getPendingBillSchedule as svcGetPendingBillSchedule,
  upsertPendingBillSchedule as svcUpsertPendingBillSchedule,
} from "@/queries/pending-bill.js";
import {
  addFollowers as svcAddFollowers,
  postChatterMessage as svcPostChatterMessage,
} from "@/queries/chatter.js";
import { coerceDateToFixedYear, getFixedTodayDate } from "@/lib/fixed-year";
import { SalesDailyBillsQuery, SalesScheduleSave } from "@/lib/sales-schemas";
import { userError } from "@/lib/action-error";

export async function trackBill(search: string) {
  const s = await requireSession();
  return svcTrackBill(s, search);
}

export async function getSalesBillTrackingList(input?: {
  fromDate?: string;
  toDate?: string;
  search?: string;
}) {
  const s = await requireSession();
  return svcGetSalesBillTrackingList(s, input ?? {});
}

// Completed-delivery tracking list for sales ("ບິນສົ່ງສຳເລັດ"), used to send
// customers a tracking link. Driven by the delivery ledger (status=1) so it
// shows every genuinely-delivered bill — including manual/transfer bills and
// bills delivered in a later month than they were billed.
export async function getSalesDeliveredBillTrackingList(input?: {
  fromDate?: string;
  toDate?: string;
  search?: string;
}) {
  const s = await requireSession();
  return svcGetSalesDeliveredBillTrackingList(s, input ?? {});
}

export async function trackSalesBill(billNo: string) {
  const s = await requireSession();
  return svcTrackSalesBill(s, billNo);
}

export async function searchActiveDeliveryBills(query?: string) {
  const s = await requireSession();
  return svcSearchActiveDeliveryBills(s, query ?? "");
}

export async function getGpsRealtime(imei: string) {
  await requireSession();
  return svcGetGpsRealtime(imei);
}

export async function getGpsRealtimeAll() {
  await requireSession();
  return svcGetCurrentAll();
}

// Bypasses DB cache and hits the provider /getRealTime endpoint directly per
// car. Slow (~1.2s per car due to rate limit) but always fresh.
export async function getGpsRealtimeAllLive() {
  await requireSession();
  return svcGetGpsRealtimeAllLive();
}

// Lean DB-cache read: skips active_job LATERAL join and daily distance query.
// For pages that only need lat/lng/speed/recorded_at.
export async function getGpsRealtimeAllLean() {
  await requireSession();
  return svcGetCurrentAllLean();
}

export async function getLocations(search?: string) {
  const s = await requireSession();
  return svcGetLocations(s, search);
}

// Phone-collected tracking: list trips that have device GPS points.
export async function getPhoneTrackingJobs() {
  const s = await requireSession();
  return svcGetPhoneTrackingJobs(s);
}

// Fleet view: latest phone fix per trip, for the all-phones-on-one-map page.
export async function getPhoneFleet() {
  const s = await requireSession();
  return svcGetPhoneFleet(s);
}

// Full ordered trail + telemetry + device info for one trip.
export async function getPhoneTrail(docNo: string) {
  const s = await requireSession();
  return svcGetPhoneTrail(s, docNo);
}

// ---- ເບີດບິນປະຈຳວັນ (Daily opened bills, sales-facing) ----

// List of bills the salesperson opened on `date` (default today), so they can
// set the delivery date + transport branch. Scoped by sales role server-side.
export async function getDailyOpenedBillsForSales(input?: {
  date?: string;
  search?: string;
}) {
  const s = await requireSession();
  const parsed = SalesDailyBillsQuery.safeParse(input ?? {});
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "invalid query");
  }
  const date = parsed.data.date
    ? coerceDateToFixedYear(parsed.data.date)
    : getFixedTodayDate();
  return svcGetDailyOpenedBillsForSales(s, { date, search: parsed.data.search });
}

// Selectable internal-delivery transport branches for the date/branch editor.
export async function getSalesTransportBranches() {
  await requireSession();
  return svcGetSalesTransportBranches();
}

// YYYY-MM-DD -> DD-MM-YYYY for chatter/return display.
function toDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

// Save a bill's delivery date + transport branch (sales). Records the change
// (preserving dispatch-owned fields — never promotes to "ພ້ອມຈັດສົ່ງ"), then
// posts an Odoo-style chatter note and notifies the chosen branch's staff.
export async function saveSalesBillSchedule(input: {
  bill_no: string;
  scheduled_date?: string | null;
  transport_code?: string | null;
}) {
  const s = await requireSession();
  const parsed = SalesScheduleSave.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "invalid input");
  }
  const billNo = parsed.data.bill_no;

  // Defence-in-depth: a direct POST bypasses the list filter, so re-check scope.
  const inScope = await svcIsSalesBillInScope(s, billNo);
  if (!inScope) throw new Error("Forbidden");

  const scheduledDate = parsed.data.scheduled_date
    ? coerceDateToFixedYear(parsed.data.scheduled_date)
    : null;
  const transportCode = parsed.data.transport_code ?? null;
  const userCode = s.usercode;

  // Merge: override only date + branch; preserve action_status / remark / route /
  // round from the current row. Not touching action_status is what keeps the bill
  // out of the dispatch "ready" queue.
  const current = await svcGetPendingBillSchedule(billNo);

  // Lock: once the transport/dispatch side has engaged with the bill (contact
  // status / route / round — fields sales never sets), sales may no longer change
  // the delivery date or branch. Authoritative server-side guard (the UI also
  // disables the editors).
  const lockedByDispatch =
    !!current?.action_status?.trim() ||
    !!current?.delivery_route_code?.trim() ||
    !!current?.delivery_round_code?.trim();
  if (lockedByDispatch) {
    throw userError("ບິນນີ້ຖືກຝ່າຍຂົນສົ່ງແກ້ໄຂແລ້ວ — ແກ້ວັນຈັດສົ່ງ/ສາຂາບໍ່ໄດ້");
  }

  const result = await svcUpsertPendingBillSchedule({
    billNo,
    scheduledDate,
    transportCode,
    remark: current?.remark ?? null,
    actionStatus: current?.action_status ?? null,
    deliveryRouteCode: current?.delivery_route_code ?? null,
    deliveryRoundCode: current?.delivery_round_code ?? null,
    userCode,
  });

  // Resolve branch display name server-side (for the note + the returned row).
  let branchName = "";
  if (transportCode) {
    const branches = (await svcGetSalesTransportBranches()) as {
      code: string;
      name_1: string;
    }[];
    branchName = branches.find((b) => b.code === transportCode)?.name_1 ?? transportCode;
  }

  // Audit trail (correct usercode, unlike bills.upsertPendingBillSchedule).
  try {
    const { recordAudit } = await import("@/queries/audit-log.js");
    await recordAudit({
      action: "pending_bill.sales_schedule",
      entityType: "bill",
      entityId: billNo,
      userCode,
      changes: {
        old: {
          scheduled_date: current?.scheduled_date ?? null,
          transport_code: current?.transport_code ?? null,
        },
        new: { scheduled_date: scheduledDate, transport_code: transportCode },
      },
    });
  } catch {
    /* audit is best-effort */
  }

  // Chatter (Odoo-style): add the branch's staff as followers, then post a
  // human-readable note. postChatterMessage resolves followers fresh, so the
  // branch staff are notified by this very message (in-app push + LINE).
  const parts: string[] = [];
  if (scheduledDate) parts.push(`📅 ກຳນົດວັນຈັດສົ່ງ ${toDisplayDate(scheduledDate)}`);
  if (transportCode) parts.push(`🏢 ສາຂາ ${branchName}`);
  if (parts.length > 0) {
    try {
      if (transportCode) {
        const staff = (await svcGetBranchStaffForNotify(transportCode)) as {
          code: string;
          name: string;
        }[];
        if (staff.length > 0) {
          await svcAddFollowers({ model: "bill", recordId: billNo, users: staff });
        }
      }
      await svcPostChatterMessage({
        model: "bill",
        recordId: billNo,
        body: parts.join(" · "),
        msgType: "comment",
        mentions: undefined,
        attachmentData: undefined,
        attachmentName: undefined,
        authorCode: userCode,
        authorName: s.username,
      });
    } catch (err) {
      console.warn(
        "[sales-schedule] chatter notify failed:",
        (err as Error)?.message ?? err
      );
    }
  }

  return {
    success: true,
    bill_no: billNo,
    scheduled_date: scheduledDate,
    scheduled_date_display: scheduledDate ? toDisplayDate(scheduledDate) : "",
    transport_code: transportCode ?? "",
    transport_name: branchName,
    removed: (result as { removed?: boolean })?.removed ?? false,
  };
}

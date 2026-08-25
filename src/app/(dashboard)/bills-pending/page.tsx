"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  FaBars,
  FaBox,
  FaBoxOpen,
  FaCalendar,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaEllipsisH,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFileInvoice,
  FaLayerGroup,
  FaMapMarkerAlt,
  FaPencilAlt,
  FaPhone,
  FaPlus,
  FaPrint,
  FaRoute,
  FaSearch,
  FaSortAmountDown,
  FaSortAmountUp,
  FaSpinner,
  FaStickyNote,
  FaTimes,
  FaTrash,
  FaTruck,
  FaCopy,
  FaWhatsapp,
  FaLine,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { addDays } from "@/lib/lao-date";
import { Actions } from "@/lib/api";
import { BillItemsModal, BillVolumeTag, useBillVolumes } from "@/components/bill-volume";
import {
  PendingBillScheduleDialog,
  type PendingScheduleDefaults,
} from "@/components/pending-bill-schedule-dialog";
import {
  PendingBillLocationDialog,
  type PendingLocationDefaults,
} from "@/components/pending-bill-location-dialog";
import Chatter from "@/components/Chatter";
import { PendingRoutePanel } from "@/components/pending-route-panel";
import { printBillLocationQr } from "@/lib/print-bill-location-qr";
import { userErrorMessage } from "@/lib/action-error";
// Ported from server actions: getBillProducts, getBillsPending, updateBillTransport

interface TimeUse {
  days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number;
  Days?: number; Hours?: number; Minutes?: number; Seconds?: number;
}

export interface Bill {
  row_num: number;
  doc_no: string;
  doc_date: string;
  send_date?: string | null;
  send_date_display?: string | null;
  transport_name: string;
  sale: string;
  department: string;
  transport: string;
  // ບ້ານ · ເມືອງ · ແຂວງ of the customer (joined from the ERP area codes).
  cust_area?: string;
  cust_village?: string;
  cust_district?: string;
  cust_province?: string;
  transport_code?: string;
  time_open: string;
  time_use: TimeUse | null;
  time_use_send?: TimeUse | null;
  remaining_count: number;
  remaining_qty_total: number;
  total_qty_total?: number;
  delivered_qty_total?: number;
  partial_delivery?: boolean;
  scheduled_date?: string | null;
  scheduled_date_display?: string | null;
  scheduled_date_overridden?: boolean;
  sales_remark?: string;
  schedule_remark?: string;
  action_status?: string;
  delivery_route_code?: string;
  delivery_round_code?: string;
  schedule_updated_at?: string | null;
  schedule_updated_by?: string;
  reschedule_count?: number;
  cancelled_delivery?: boolean;
  cancelled_delivery_job?: string;
  cancelled_delivery_at?: string | null;
  cancelled_delivery_remark?: string;
  cancelled_delivery_driver?: string;
  cancelled_delivery_car?: string;
  cancelled_secs_ago?: number;
  manual_pending_bill?: boolean;
  source_trans_flag?: number;
  source_type?: string;
  todo_pending_count?: number;
  todo_done_count?: number;
  todo_earliest_deadline?: string | null;
  todo_earliest_deadline_display?: string | null;
  planned_lat?: string | null;
  planned_lng?: string | null;
  // "planned" = ຄົນປັກໝຸດເອງ · "last_delivery" = ເອົາຈາກຄັ້ງທີ່ສົ່ງຫຼ້າສຸດ
  // ຂອງລູກຄ້າຄົນນີ້ · "customer" = ພິກັດໃນທະບຽນລູກຄ້າ
  location_source?: string;
  last_lat?: string | null;
  last_lng?: string | null;
  last_delivery_bill?: string;
  last_delivery_at_display?: string;
  cust_code?: string | null;
  cust_name?: string | null;
  cust_phone?: string | null;
  salesperson_phone?: string | null;
  cust_line?: string | null;
  salesperson_line?: string | null;
  sent_rounds?: number;
  last_sent_at?: string;
  cust_lat?: string | null;
  cust_lng?: string | null;
  source_format?: string;
  is_pos_settled?: boolean;
  // Forwarded INTO this branch from another branch's "ສົ່ງສາຂາ" leg — awaiting
  // onward delivery to the customer from here.
  incoming_forwarded?: boolean;
  forward_from_transport_code?: string;
  forward_from_transport_name?: string;
  forwarded_at?: string;
  // Multi-warehouse bill spanning several branches: the parent row lists the
  // legs handed to other branches; a leg row names its parent instead.
  branch_legs?: Array<{
    bill_no: string;
    transport_code: string;
    transport_name: string;
    remark?: string;
    scheduled_date_display?: string | null;
    on_open_trip?: boolean;
    delivered?: boolean;
  }>;
  parent_bill_no?: string;
  // ບິນເກັບເງິນປາຍທາງ (ERP doc_format_code ຂຶ້ນຕົ້ນ 'COD') — ຍອດທີ່ຄົນຂັບຕ້ອງເກັບ
  cod_amount?: number;
}

interface DeliveryRound {
  code: string;
  name: string;
  time_label?: string;
}

interface DeliveryRoute {
  code: string;
  name: string;
  origin?: string;
  destination?: string;
  waypoints?: Array<string | { name?: string; lat?: number | null; lng?: number | null }>;
  distance_km?: number;
}

interface ManualPendingBill {
  doc_no: string;
  doc_date: string;
  cust_code: string;
  cust_name: string;
  cust_area?: string;
  telephone: string;
  count_item: number;
  source_trans_flag: number;
  source_type?: string;
  scheduled_date?: string | null;
  scheduled_date_display?: string | null;
  delivery_route_code?: string;
  delivery_round_code?: string;
  delivery_round_name?: string;
  delivery_round_time_label?: string;
  transport_code?: string;
}

// Transport code that marks a bill as "customer picks up themselves" — no
// delivery dispatch needed. Master data already treats '02-0004' this way: the
// dashboard counts it as a pickup (not logistic) and getBillsPending excludes
// it from the contact queue, so assigning it here drops the bill off this list.
const SELF_PICKUP_TRANSPORT_CODE = "02-0004";

// A bill whose delivery (receive) date has been changed MORE THAN this many
// times is flagged red in the queue — repeated reschedules signal a problem
// bill (customer keeps postponing / can't receive). "ເກີນ 2 ເທື່ອ".
const RESCHEDULE_RED_THRESHOLD = 2;

// Flat state model — action_status combines contact result + reason:
//   ຍັງບໍ່ເຖິງເວລາ uses send_date more than 3 days from today.
//   ຕ້ອງໂທຫາລູກຄ້າ uses missing/overdue/today/tomorrow scheduled_date.
//     ├── ບໍ່ຕິດຕໍ່             (action_status = null)
//     ├── ພະນັກງານຂາຍຍັງບໍ່ແຈ້ງ  (action_status = "sales_not_notified")
//     ├── ຕິດຕໍ່ບໍ່ໄດ້           (action_status = "contact_failed")
//     ├── ລູກຄ້າເລື່ອນວັນຮັບ     (action_status = "customer_postponed")
//     ├── ລູກຄ້າປະຕິເສດ/ຍົກເລີກ (action_status = "customer_cancelled")
//     ├── ພ້ອມຮັບ              (action_status = "contacted_ready")
//     └── ຕາຕະລາງການຈັດສົ່ງ    (action_status = "delivery_scheduled")
// ຕາຕະລາງການຈັດສົ່ງ = ນັດວັນສົ່ງໄວ້ລ່ວງໜ້າ (ເຄື່ອງຕ່າງແຂວງ / ເຄື່ອງລູກຄ້າ ທີ່ນັດ
// ສົ່ງມື້ຕໍ່ໄປ). ຕ້ອງການພຽງ "ວັນທີຈັດສົ່ງ" ເທົ່ານັ້ນ — ບໍ່ຕ້ອງເສັ້ນທາງ/ຮອບ ຈຶ່ງ
// ຍັງບໍ່ນັບເປັນ dispatch-ready. ບິນຈະຢູ່ຂັ້ນ 2.2 "ຍັງບໍ່ຮອດວັນສົ່ງ" ຈົນຮອດວັນນັດ.
const ACTION_STATUSES = [
  { key: "sales_not_notified", label: "ພະນັກງານຂາຍຍັງບໍ່ແຈ້ງ", color: "slate" },
  { key: "contact_failed", label: "ຕິດຕໍ່ບໍ່ໄດ້", color: "rose" },
  { key: "customer_postponed", label: "ລູກຄ້າເລື່ອນວັນຮັບ", color: "amber" },
  { key: "customer_cancelled", label: "ລູກຄ້າປະຕິເສດ/ຍົກເລີກ", color: "slate" },
  { key: "contacted_ready", label: "ພ້ອມຮັບ", color: "emerald" },
  { key: "delivery_scheduled", label: "ຕາຕະລາງການຈັດສົ່ງ", color: "sky" },
] as const;

const ACTION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  sales_not_notified: { label: "ພະນັກງານຂາຍຍັງບໍ່ແຈ້ງ", color: "slate" },
  contact_failed: { label: "ຕິດຕໍ່ບໍ່ໄດ້", color: "rose" },
  customer_postponed: { label: "ລູກຄ້າເລື່ອນວັນຮັບ", color: "amber" },
  customer_cancelled: { label: "ລູກຄ້າປະຕິເສດ/ຍົກເລີກ", color: "slate" },
  contacted_ready: { label: "ພ້ອມຮັບ", color: "emerald" },
  delivery_scheduled: { label: "ຕາຕະລາງການຈັດສົ່ງ", color: "sky" },
};

// ບວກມື້ໃສ່ວັນທີ ໂດຍຄ້າງໄວ້ໃນປີທີ່ຕຶງ (FIXED_YEAR) — ໃຊ້ກັບປຸ່ມດ່ວນ "ມື້ອື່ນ"
// ຂອງຕາຕະລາງການຈັດສົ່ງ ຈຶ່ງບໍ່ໄດ້ວັນທີທີ່ເກີນ min/max ຂອງ input.
function addDaysInFixedYear(date: string, days: number): string {
  const iso = addDays(date, days);
  if (iso < FIXED_YEAR_START) return FIXED_YEAR_START;
  if (iso > FIXED_YEAR_END) return FIXED_YEAR_END;
  return iso;
}

// ── ວັນທີ / ວັນຮັບ ──
// ຕາຕະລາງຈັດກຸ່ມຕາມ "ວັນຮັບ" ຈຶ່ງຕ້ອງມີຊື່ວັນ ແລະ ໄລຍະຫ່າງເປັນມື້ ເພື່ອໃຫ້
// ຜູ້ຈັດຖ້ຽວອ່ານຫົວກຸ່ມແວັບດຽວແລ້ວຮູ້ວ່າ "ມື້ອື່ນຕ້ອງຈັດຈັກບິນ".
const LAO_WEEKDAYS = ["ອາທິດ", "ຈັນ", "ອັງຄານ", "ພຸດ", "ພະຫັດ", "ສຸກ", "ເສົາ"];

function laoWeekday(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return LAO_WEEKDAYS[new Date(ms).getUTCDay()] ?? "";
}

/** ຈຳນວນມື້ຈາກ `fromIso` ຫາ `toIso` (ບວກ = ອະນາຄົດ, ລົບ = ຜ່ານມາແລ້ວ). */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function relDayLabel(diff: number): string {
  if (diff === 0) return "ມື້ນີ້";
  if (diff === 1) return "ມື້ອື່ນ";
  if (diff === 2) return "ມື້ຮື";
  if (diff > 0) return `ອີກ ${diff} ມື້`;
  return `ຊ້າ ${Math.abs(diff)} ມື້`;
}

// ວິໄນເລື່ອງສີ: ໜຶ່ງແຖວ ໜຶ່ງສີເນັ້ນ (= ສີສະຖານະ). ປ້າຍປະກອບ (POS / ທະຍອຍ /
// ພິເສດ / ສົ່ງມາຈາກສາຂາ) ເປັນສີເທົາໝົດ — ເຫຼືອສີແດງໄວ້ໃຫ້ "ຍົກເລີກ" ແລະ
// "ປ່ຽນວັນຮັບ n×" ເທົ່ານັ້ນ ຈຶ່ງເຫັນຂອງຜິດປົກກະຕິແຕ່ໄກ.
const NEUTRAL_BADGE =
  "inline-flex items-center rounded bg-slate-500/10 px-1 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400";

// ຊ່ອງທີ່ກົດແກ້ໄດ້ (ເສັ້ນທາງ / ຮອບສົ່ງ) — ຂີດເສັ້ນປະໃຕ້ເມື່ອມີຄ່າ ແລະ ຂຶ້ນ
// "+ ເລືອກ..." ສີ teal ເມື່ອຫວ່າງ ຈຶ່ງເບິ່ງອອກວ່າກົດແກ້ໄດ້ ບໍ່ແມ່ນຂໍ້ຄວາມທຳມະດາ.
function PlanCellButton({
  value,
  placeholder,
  title,
  onClick,
}: {
  value: string;
  placeholder: string;
  title: string;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded px-1 -mx-1 text-[10px] font-medium transition-colors cursor-pointer ${
        value
          ? "text-slate-700 underline decoration-dotted decoration-slate-400/60 underline-offset-2 hover:text-teal-600 dark:text-slate-200 dark:hover:text-teal-400"
          : "text-teal-600 hover:underline dark:text-teal-400"
      }`}
    >
      <span className="truncate">{value || placeholder}</span>
      <FaPencilAlt size={7} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
    </button>
  );
}

// ໂມງນັບຂຶ້ນລະດັບວິນາທີ — ມີ interval ຂອງຕົນເອງ ຈຶ່ງບໍ່ບັງຄັບໃຫ້ໜ້າທັງໜ້າ
// (ຮວມທັງຕາຕະລາງເປັນຮ້ອຍແຖວ) re-render ທຸກໆວິນາທີ.
function LiveElapsed({ baseSecs }: { baseSecs: number }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor(baseSecs)));
  useEffect(() => {
    setSecs(Math.max(0, Math.floor(baseSecs)));
    const i = setInterval(() => setSecs((v) => v + 1), 1000);
    return () => clearInterval(i);
  }, [baseSecs]);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s.toString().padStart(2, "0")}s`);
  return <>{parts.join(" ")}</>;
}

// Per-branch colour so each bill's delivery branch is scannable in the
// "all branches" view. Falls back to neutral for unknown / extra codes.
const BRANCH_BADGE: Record<string, string> = {
  "02-0001": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "02-0002": "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "02-0003": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

function BranchBadge({ code, name }: { code?: string; name?: string }) {
  const label = (name || code || "").trim();
  if (!label) return null;
  const cls =
    (code && BRANCH_BADGE[code]) ||
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}
      title={`ສາຂາ: ${label}`}
    >
      <FaTruck size={8} />
      {label}
    </span>
  );
}

function formatRoutePath(route: DeliveryRoute) {
  return [route.origin, ...(route.waypoints ?? []), route.destination]
    .map((item) =>
      String(item && typeof item === "object" ? item.name ?? "" : item ?? "").trim()
    )
    .filter(Boolean)
    .join(" → ");
}

// Streamlined work queue. The contact-state / scheduling-state subdivisions
// still live in action_status + delivery_round_code, but for queue filtering
// the dispatcher only cares about three buckets:
//   need_action — anything not dispatch-ready that's inside the contact window
//                 (replaces old call/uncontacted/problem/cancelled_job tabs)
//   ready       — fully scheduled, contacted, route + round assigned
//   future      — send_date is more than N days away
//   all         — escape hatch
type QueueFilter = "need_action" | "ready" | "future" | "all";

// Three workflow states surfaced on the bill card. Anything missing data
// (date / route / round / contact) collapses to "in_progress" — the editable
// chips below the status pill show what's still missing.
// The dispatcher's mental model of the bill journey:
//   1)    not_contacted   — first touch hasn't happened yet (or failed/postponed)
//   2.1)  sales_pending   — contacted, but salesperson hasn't supplied delivery date
//   2.2)  scheduled_wait  — date+route+round set, but the date is still in the future
//   2.3)  ready           — date+route+round set, scheduled_date is today or earlier
//   problem               — bill was cancelled (driver or customer); off the happy path
// The "all" key is a UI escape hatch to show every bill regardless of step.
type StepKey = "not_contacted" | "sales_pending" | "scheduled_wait" | "ready" | "problem";

export interface Transport {
  code: string;
  name_1: string;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

// ── Theme ──
// Theme variables no longer needed for inline accordion styling

// One source of truth for the "set delivery point + print QR" actions.
// Rendered in 3 visual variants so the table (desktop/mobile)
// and detail drawer all share the same logic instead of copy-pasting it.
function BillLocationActions({
  bill,
  variant,
  onEdit,
  onDone,
}: {
  bill: Bill;
  variant: "icon" | "label" | "drawer" | "menu";
  onEdit: (bill: Bill) => void;
  // ເອີ້ນຫຼັງກົດ — ໃຊ້ໃຫ້ເມນູ "⋯" ຂອງແຖວປິດຕົວເອງ
  onDone?: () => void;
}) {
  const hasPlannedCoords = Boolean(
    (bill.planned_lat ?? "").toString().trim() && (bill.planned_lng ?? "").toString().trim()
  );
  // ພິກັດໃນທະບຽນລູກຄ້າສ່ວນຫຼາຍເປັນ 0 — ຢ່ານັບວ່າ "ມີຈຸດ" ບໍ່ດັ່ງນັ້ນ QR
  // ຈະພາຄົນຂັບໄປຈຸດ 0,0 ກາງມະຫາສະໝຸດ
  const isUsableCoord = (v: unknown) => {
    const t = (v ?? "").toString().trim();
    return t !== "" && !["0", "0.0", "0.000000"].includes(t) && Number(t) !== 0;
  };
  const custLoc = isUsableCoord(bill.cust_lat) && isUsableCoord(bill.cust_lng);
  // ໝຸດຈາກຄັ້ງກ່ອນຖືກຕື່ມໃສ່ planned_* ໃຫ້ແລ້ວຈາກຝັ່ງ server ຈຶ່ງໃຊ້ງານໄດ້ເລີຍ
  // ແຕ່ຕ້ອງສະແດງໃຫ້ຕ່າງກັບໝຸດທີ່ຄົນປັກເອງ — ຄົນຈັດຖ້ຽວຄວນຮູ້ວ່າອັນໃດຍັງບໍ່ທັນຢືນຢັນ
  const inherited = bill.location_source === "last_delivery";
  const planned = hasPlannedCoords && !inherited;
  const hasAnyLoc = hasPlannedCoords || custLoc;
  const inheritedFrom = [bill.last_delivery_bill, bill.last_delivery_at_display]
    .filter(Boolean)
    .join(" · ");
  const editTitle = planned
    ? "ແກ້ຈຸດຈັດສົ່ງ"
    : inherited
    ? `ຈຸດສົ່ງຄັ້ງກ່ອນ${inheritedFrom ? ` (${inheritedFrom})` : ""} — ກົດເພື່ອຢືນຢັນ ຫຼື ແກ້`
    : custLoc
    ? "ໃຊ້/ປ່ຽນຈຸດທີ່ບັນທຶກໄວ້ໃນຂໍ້ມູນລູກຄ້າ"
    : "ກຳນົດຈຸດຈັດສົ່ງ";

  const handleEdit = (e: ReactMouseEvent) => {
    e.stopPropagation();
    onEdit(bill);
    onDone?.();
  };
  const handlePrint = (e: ReactMouseEvent) => {
    e.stopPropagation();
    const lat = (hasPlannedCoords ? bill.planned_lat : bill.cust_lat) ?? "";
    const lng = (hasPlannedCoords ? bill.planned_lng : bill.cust_lng) ?? "";
    void printBillLocationQr({
      billNo: bill.doc_no,
      custName: bill.cust_name ?? null,
      lat,
      lng,
    }).catch((err) => alert(userErrorMessage(err, "ພິມບໍ່ສຳເລັດ")));
    onDone?.();
  };

  // ລາຍການໃນເມນູ "⋯" ຂອງແຖວຕາຕະລາງ — ຂໍ້ຄວາມເຕັມແຖວ ບໍ່ແມ່ນ icon
  if (variant === "menu") {
    return (
      <>
        <button
          type="button"
          onClick={handleEdit}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <FaMapMarkerAlt
            size={10}
            className={`shrink-0 ${
              planned
                ? "text-emerald-600 dark:text-emerald-400"
                : inherited
                ? "text-amber-600 dark:text-amber-400"
                : custLoc
                ? "text-sky-600 dark:text-sky-400"
                : "text-slate-400"
            }`}
          />
          <span className="truncate">{editTitle}</span>
        </button>
        {hasAnyLoc && (
          <button
            type="button"
            onClick={handlePrint}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <FaPrint size={10} className="shrink-0 text-slate-400" />
            ພິມ QR ຈຸດສົ່ງ
          </button>
        )}
      </>
    );
  }

  if (variant === "icon") {
    return (
      <>
        <button
          onClick={handleEdit}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
            planned
              ? "text-emerald-600 bg-emerald-100/80 hover:bg-emerald-200 dark:bg-emerald-900/30"
              : inherited
              ? "text-amber-600 bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-900/30"
              : custLoc
              ? "text-sky-600 bg-sky-100/80 hover:bg-sky-200 dark:bg-sky-900/30"
              : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          title={editTitle}
        >
          <FaMapMarkerAlt size={10} />
        </button>
        {hasAnyLoc && (
          <button
            onClick={handlePrint}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="ພິມ QR ຈຸດສົ່ງ"
          >
            <FaPrint size={10} />
          </button>
        )}
      </>
    );
  }

  if (variant === "label") {
    return (
      <>
        <button
          onClick={handleEdit}
          className={`px-2 py-1 rounded border text-[9px] font-semibold cursor-pointer ${
            planned
              ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : inherited
              ? "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : custLoc
              ? "border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          <FaMapMarkerAlt size={8} className="inline mr-0.5" />{" "}
          {planned ? "ຈຸດສົ່ງ" : inherited ? "ຄັ້ງກ່ອນ" : custLoc ? "ຈຸດລູກຄ້າ" : "ຈຸດສົ່ງ"}
        </button>
        {hasAnyLoc && (
          <button
            onClick={handlePrint}
            className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[9px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <FaPrint size={8} className="inline mr-0.5" /> QR
          </button>
        )}
      </>
    );
  }

  if (variant === "drawer") {
    return (
      <>
        {hasAnyLoc && (
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <FaPrint size={12} />
            ພິມ QR
          </button>
        )}
        <button
          type="button"
          onClick={handleEdit}
          className="flex-1 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <FaMapMarkerAlt size={12} />
          ປັກໝຸດຈຸດຈັດສົ່ງ
        </button>
      </>
    );
  }

  // No other variants — "chip" (the old kanban card) was removed with the
  // kanban view; the table and drawer cover every render path now.
  return null;
}

interface ScheduleHistoryRow {
  scheduled_date_display: string;
  remark: string;
  action_status: string;
  delivery_route_code: string;
  delivery_round_code: string;
  changed_by: string;
  changed_at: string;
}

export default function BillsPendingClient() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [allBranches, setAllBranches] = useState<Transport[]>([]);
  const [fromDate] = useState(FIXED_YEAR_START);
  const [toDate] = useState(FIXED_YEAR_END);
  const [transportCode, setTransportCode] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  // ທີ່ຢູ່ລູກຄ້າ: ເລືອກແຂວງກ່ອນ ແລ້ວຈຶ່ງເມືອງ (ລາຍການເມືອງຂຶ້ນກັບແຂວງທີ່ເລືອກ).
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedTransport, setSelectedTransport] = useState("");
  const [updating, setUpdating] = useState(false);
  const [tick, setTick] = useState(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  // ບິນທີ່ຈັດຖ້ຽວແລ້ວຫາຍອອກຈາກລາຍການນີ້ຕັ້ງແຕ່ວັນຈັດຖ້ຽວ (ERP ຕັ້ງ check_status=1)
  // ບໍ່ແມ່ນວັນສົ່ງ — ຈັດຖ້ຽວລ່ວງໜ້າຈຶ່ງເຮັດໃຫ້ຍອດຄ້າງເບິ່ງຄືຫຼຸດລົງທັງທີ່ຍັງບໍ່ໄດ້ສົ່ງ.
  // ສະແດງຈຳນວນນັ້ນໄວ້ຂ້າງໆ ພ້ອມທາງລັດໄປຄິວລໍຖ້າຈັດສົ່ງ.
  const [dispatched, setDispatched] = useState<{
    bills: number;
    scheduled_ahead: number;
  } | null>(null);
  const [productsByDoc, setProductsByDoc] = useState<Record<string, Product[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [scheduleBill, setScheduleBill] = useState<{ billNo: string; defaults: PendingScheduleDefaults } | null>(null);
  const [locationBill, setLocationBill] = useState<{ billNo: string; defaults: PendingLocationDefaults } | null>(null);
  const [queueFilter] = useState<QueueFilter>("all");
  const [statusMenu, setStatusMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [routeMenu, setRouteMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [roundMenu, setRoundMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  // Keyed `${billNo}:${target}` while a LINE push is in flight, so each button
  // shows its own spinner without blocking the others.
  const [sendingLine, setSendingLine] = useState<string | null>(null);
  const [deliveryRoutes, setDeliveryRoutes] = useState<DeliveryRoute[]>([]);
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([]);
  const [notYetDays, setNotYetDays] = useState(3);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  // "search" = pick an existing bill (ໂອນ 72 / service); "custom" = type a
  // free-form ອື່ນໆ bill that doesn't exist anywhere in the system.
  const [manualMode, setManualMode] = useState<"search" | "custom">("search");
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<ManualPendingBill[]>([]);
  const [manualSelected, setManualSelected] = useState<ManualPendingBill | null>(null);
  const [customName, setCustomName] = useState("");
  const [customPhone, setCustomPhone] = useState("");
  const [customItems, setCustomItems] = useState<
    Array<{ item_name: string; qty: string; unit_code: string }>
  >([{ item_name: "", qty: "1", unit_code: "ອັນ" }]);
  const [manualDate, setManualDate] = useState(getFixedTodayDate());
  const [manualRound, setManualRound] = useState("");
  const [manualRoute, setManualRoute] = useState("");
  const [manualTransport, setManualTransport] = useState("");
  const [manualRemark, setManualRemark] = useState("");
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [removingManualBillNo, setRemovingManualBillNo] = useState<string | null>(null);
  const [selectedBillNos, setSelectedBillNos] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"" | "mark_ready" | "set_round" | "set_date">("");
  const [bulkRound, setBulkRound] = useState("");
  const [bulkDate, setBulkDate] = useState(getFixedTodayDate());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [activeStep, setActiveStep] = useState<StepKey>("not_contacted");
  const didInitStepRef = useRef(false);
  const [quickFilter, setQuickFilter] = useState<"all" | "pos" | "partial" | "manual">("all");
  // ຄວາມແໜ້ນຂອງແຖວ ແລະ ການຈັດກຸ່ມຕາມວັນຮັບ — ຈື່ໄວ້ໃນ localStorage ເພື່ອບໍ່ໃຫ້
  // ຜູ້ໃຊ້ຕ້ອງຕັ້ງຄືນທຸກເທື່ອທີ່ເປີດໜ້າ
  const [density, setDensity] = useState<"compact" | "normal">("normal");
  const [grouped, setGrouped] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [drawerBill, setDrawerBill] = useState<Bill | null>(null);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const today = getFixedTodayDate();
  const tomorrow = addDays(today, 1);
  const notYetThresholdDate = addDays(today, notYetDays);

  // ຕາຕະລາງບໍ່ສະແດງວິນາທີອີກຕໍ່ໄປ (ອາຍຸບິນເປັນ "4 ມື້" / "13 ຊມ") ຈຶ່ງເຕັ້ນ
  // ນາທີລະເທື່ອພໍ — ບໍ່ໃຫ້ໜ້າທັງໜ້າ re-render ທຸກໆວິນາທີ. ບ່ອນທີ່ຕ້ອງການ
  // ວິນາທີຈິງໆ (ໃນ drawer) ໃຊ້ <LiveElapsed /> ທີ່ມີ interval ຂອງຕົນເອງ.
  useEffect(() => { const i = setInterval(() => setTick((v) => v + 60), 60000); return () => clearInterval(i); }, []);

  // ຈື່ຄ່າ density / grouping ຈາກເທື່ອກ່ອນ
  useEffect(() => {
    if (typeof window === "undefined") return;
    const d = window.localStorage.getItem("bills-pending:density");
    if (d === "compact" || d === "normal") setDensity(d);
    if (window.localStorage.getItem("bills-pending:grouped") === "0") setGrouped(false);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bills-pending:density", density);
  }, [density]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bills-pending:grouped", grouped ? "1" : "0");
  }, [grouped]);
  // Fetch on mount — replaces the Next.js server component that used to preload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchBills(); }, []);

  // Opened from the draft page's bill pool with ?add=1 — jump straight into the
  // manual-bill form instead of making the dispatcher hunt for the button.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("add") !== "1") return;
    openManualModal();
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync drawerBill with bills list when state updates (e.g. status changes)
  useEffect(() => {
    if (drawerBill) {
      const updated = bills.find((b) => b.doc_no === drawerBill.doc_no);
      if (updated) {
        setDrawerBill(updated);
      } else {
        setDrawerBill(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills]);

  // ປະຫວັດການສົ່ງຂອງບິນ — ບິນທີ່ທະຍອຍສົ່ງຫຼາຍຮອບເບິ່ງບໍ່ອອກວ່າຜ່ານຫຍັງມາແດ່
  const [deliveryHistory, setDeliveryHistory] = useState<{
    rounds: Array<{
      round: number;
      doc_no: string;
      day: string;
      driver: string;
      car: string;
      status: number;
      closed_at: string | null;
      remark: string;
      loaded: number;
      delivered: number;
    }>;
    ordered: number;
    delivered: number;
    remaining: number;
  } | null>(null);
  useEffect(() => {
    const billNo = drawerBill?.doc_no;
    if (!billNo) {
      setDeliveryHistory(null);
      return;
    }
    let active = true;
    Actions.getBillDeliveryHistory(billNo)
      .then((data) => {
        if (active) setDeliveryHistory(data as typeof deliveryHistory);
      })
      .catch(() => {
        if (active) setDeliveryHistory(null);
      });
    return () => {
      active = false;
    };
  }, [drawerBill?.doc_no]);

  // Load the schedule change history whenever a different bill's drawer opens.
  useEffect(() => {
    const billNo = drawerBill?.doc_no;
    if (!billNo) {
      setScheduleHistory([]);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    Actions.getPendingBillScheduleHistory(billNo)
      .then((rows) => {
        if (active) setScheduleHistory((rows ?? []) as ScheduleHistoryRow[]);
      })
      .catch(() => {
        if (active) setScheduleHistory([]);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [drawerBill?.doc_no]);

  // Load delivery rounds once for the round selector + filter chips
  useEffect(() => {
    void Actions.listDeliveryRounds(true)
      .then((data) => setDeliveryRounds((data ?? []) as DeliveryRound[]))
      .catch(() => setDeliveryRounds([]));
    void Actions.listDeliveryRoutes(true)
      .then((data) => setDeliveryRoutes((data ?? []) as DeliveryRoute[]))
      .catch(() => setDeliveryRoutes([]));
    void Actions.getTransportBranches()
      .then((data) => setAllBranches((data ?? []) as Transport[]))
      .catch(() => setAllBranches([]));
  }, []);

  useEffect(() => {
    void Actions.getNotifySettings()
      .then((settings) => {
        const raw = Number((settings as { "pending.not_yet_days"?: string })["pending.not_yet_days"] ?? 3);
        const days = Number.isFinite(raw) ? Math.max(0, Math.min(30, Math.trunc(raw))) : 3;
        setNotYetDays(days);
      })
      .catch(() => setNotYetDays(3));
  }, []);

  const fmtQty = (v: number) => {
    if (!Number.isFinite(v)) return "0";
    return Math.abs(v % 1) < 0.000001
      ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const baseSec = (t: TimeUse | null | undefined) => {
    if (!t) return 0;
    return (Number(t.days ?? t.Days ?? 0) || 0) * 86400 + (Number(t.hours ?? t.Hours ?? 0) || 0) * 3600 + (Number(t.minutes ?? t.Minutes ?? 0) || 0) * 60 + (Number(t.seconds ?? t.Seconds ?? 0) || 0);
  };

  // ອາຍຸບິນແບບຫຍໍ້ — ຄວາມລະອຽດຫຼາຍສຸດແມ່ນນາທີ. ວິນາທີບໍ່ມີໃຜໃຊ້ ແຕ່ເຮັດໃຫ້
  // ຕາເລື່ອນຫາເລກທີ່ຕ້ອງການບໍ່ໄດ້ ແລະ ບັງຄັບ re-render ທຸກໆວິນາທີ.
  const fmtAge = (t: TimeUse | null | undefined) => {
    if (!t) return null;
    const s = baseSec(t) + tick;
    if (s <= 0) return null;
    const d = Math.floor(s / 86400);
    if (d >= 1) return `${d} ມື້`;
    const h = Math.floor(s / 3600);
    if (h >= 1) return `${h} ຊມ`;
    return `${Math.max(1, Math.floor(s / 60))} ນທ`;
  };

  const deptList = [...new Set(bills.map((b) => b.department).filter(Boolean))].sort();
  const provinceList = [
    ...new Set(bills.map((b) => b.cust_province).filter((v): v is string => !!v)),
  ].sort((a, b) => a.localeCompare(b, "lo"));
  // Districts are scoped to the chosen province so the list stays short
  // (77 districts nationwide, roughly ten per province).
  const districtList = [
    ...new Set(
      bills
        .filter((b) => provinceFilter === "all" || b.cust_province === provinceFilter)
        .map((b) => b.cust_district)
        .filter((v): v is string => !!v)
    ),
  ].sort((a, b) => a.localeCompare(b, "lo"));

  const isNotYetTime = (b: Bill): boolean => {
    const d = b.send_date;
    if (!d) return false;
    return d > notYetThresholdDate;
  };

  // A bill is "dispatch-ready" once admin has scheduled it (date + round) AND
  // marked it as customer-ready. Mirrors the SCHEDULED_BILL_JOIN gate that
  // backend uses to surface bills in /jobs/add.
  const isDispatchReady = (b: Bill): boolean => {
    if (!b.scheduled_date_overridden) return false;
    if (!b.delivery_route_code?.trim()) return false;
    if (!b.delivery_round_code?.trim()) return false;
    return b.action_status === "contacted_ready";
  };

  const openScheduleDialog = (b: Bill) => {
    setScheduleBill({
      billNo: b.doc_no,
      defaults: {
        scheduled_date: b.scheduled_date ?? null,
        remark: b.schedule_remark ?? null,
        updated_at: b.schedule_updated_at ?? null,
        updated_by: b.schedule_updated_by ?? null,
      },
    });
  };

  const openLocationDialog = (b: Bill) => {
    setLocationBill({
      billNo: b.doc_no,
      defaults: {
        planned_lat: b.planned_lat ?? null,
        planned_lng: b.planned_lng ?? null,
        cust_lat: b.cust_lat ?? null,
        cust_lng: b.cust_lng ?? null,
      },
    });
  };

  // "need_action" = anything in the contact window that isn't dispatch-ready
  // (combines old call/uncontacted/problem/cancelled_job tabs). Bills with
  // send_date far in the future stay parked under "future" instead.
  const needsAction = (b: Bill): boolean => {
    if (isNotYetTime(b)) return false;
    return !isDispatchReady(b);
  };

  const kw = searchText.trim().toLowerCase();
  const filtered = bills.filter((b) => {
    if (departmentFilter !== "all" && b.department !== departmentFilter) return false;
    if (provinceFilter !== "all" && b.cust_province !== provinceFilter) return false;
    if (districtFilter !== "all" && b.cust_district !== districtFilter) return false;

    // queueFilter is legacy (kept for the manual-add code path, fixed to
    // "all"); the visible status filtering is now the tab bar (activeStep).
    if (queueFilter === "need_action" && !needsAction(b)) return false;
    if (queueFilter === "ready" && !isDispatchReady(b)) return false;
    if (queueFilter === "future" && !isNotYetTime(b)) return false;

    // Quick filters
    if (quickFilter === "pos" && !b.is_pos_settled) return false;
    if (quickFilter === "partial" && !b.partial_delivery) return false;
    if (quickFilter === "manual" && !b.manual_pending_bill) return false;

    if (!kw) return true;
    return [
      b.doc_no,
      b.doc_date,
      b.transport_name,
      b.sale,
      b.department,
      b.transport,
      b.cust_area,
      b.sales_remark,
      b.time_open,
      b.partial_delivery ? "ກຳລັງທະຍອຍສົ່ງ partial delivery" : "",
      b.cancelled_delivery ? "ຍົກເລີກຈັດສົ່ງ cancelled delivery" : "",
      b.cancelled_delivery_job,
      b.cancelled_delivery_remark,
      b.cancelled_delivery_at,
    ].filter(Boolean).join(" ").toLowerCase().includes(kw);
  });

  // ບໍລິມາດຂອງບິນທີ່ເຫັນຢູ່ໜ້ານີ້ — ດຶງເປັນກ້ອນດຽວ
  const billVolumes = useBillVolumes(filtered.map((b) => b.doc_no));
  const [detailBill, setDetailBill] = useState<{ billNo: string; custName: string } | null>(null);

  // Sort by delivery date (scheduled_date — overridden value or send_date
  // fallback). Bills missing a date sink to the end.
  const sortKey = (b: Bill) => b.scheduled_date ?? "9999-12-31";

  const sorted = [...filtered].sort((a, b) => {
    const dateCmp = sortOrder === "asc"
      ? sortKey(a).localeCompare(sortKey(b))
      : sortKey(b).localeCompare(sortKey(a));
    if (dateCmp !== 0) return dateCmp;
    return sortOrder === "asc" ? baseSec(a.time_use) - baseSec(b.time_use) : baseSec(b.time_use) - baseSec(a.time_use);
  });

  const fetchBills = async () => {
    setLoading(true); setTick(0);
    try {
      const data = await Actions.getBillsPending(fromDate, toDate, transportCode);
      setBills((data.trans || []) as Bill[]);
      setTransports((data.listtrans || []) as Transport[]);
      setDrawerBill(null); setProductsByDoc({});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleProducts = async (docNo: string) => {
    const bill = bills.find((b) => b.doc_no === docNo);
    if (!bill) return;
    setDrawerBill(bill);
    if (productsByDoc[docNo]) return;
    setLoadingDoc(docNo);
    try {
      const data = await Actions.getBillProducts(docNo);
      setProductsByDoc((c) => ({ ...c, [docNo]: data as Product[] }));
    } catch { setProductsByDoc((c) => ({ ...c, [docNo]: [] })); }
    finally { setLoadingDoc(null); }
  };

  const openModal = (b: Bill) => { setSelectedBill(b); setSelectedTransport(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setSelectedBill(null); setSelectedTransport(""); };

  const handleUpdate = async () => {
    if (!selectedBill || !selectedTransport) return;
    setUpdating(true);
    try {
      await Actions.updateBillTransport(selectedBill.doc_no, selectedTransport);
      const selfPickup = selectedTransport === SELF_PICKUP_TRANSPORT_CODE;
      const name = selfPickup
        ? "ລູກຄ້າຮັບເອງ"
        : transports.find((t) => t.code === selectedTransport)?.name_1 ?? selectedBill.transport;
      // Self-pickup bills leave the contact queue entirely (getBillsPending
      // filters out '02-0004'), so drop the row locally to match a refetch
      // instead of leaving a stale entry behind.
      const remove = selfPickup || (transportCode !== "all" && selectedTransport !== transportCode);
      setBills((c) => c.map((b) => b.doc_no === selectedBill.doc_no ? { ...b, transport: name } : b).filter((b) => !remove || b.doc_no !== selectedBill.doc_no));
      closeModal();
    } finally { setUpdating(false); }
  };

  const openManualModal = () => {
    setManualModalOpen(true);
    setManualMode("search");
    setManualSearch("");
    setManualResults([]);
    setManualSelected(null);
    setManualDate(tomorrow);
    setManualRound("");
    setManualRoute("");
    setManualTransport("");
    setManualRemark("");
    setCustomName("");
    setCustomPhone("");
    setCustomItems([{ item_name: "", qty: "1", unit_code: "ອັນ" }]);
  };

  const closeManualModal = () => {
    if (manualSaving) return;
    setManualModalOpen(false);
    setManualSelected(null);
  };

  const searchManualBills = async () => {
    const q = manualSearch.trim();
    if (q.length < 2) return;
    setManualSearching(true);
    try {
      const data = await Actions.searchManualPendingBills(q);
      setManualResults((data ?? []) as ManualPendingBill[]);
      setManualSelected(null);
    } catch (e) {
      console.error(e);
      setManualResults([]);
    } finally {
      setManualSearching(false);
    }
  };

  const normalizedCustomItems = () =>
    customItems
      .map((item) => ({
        item_name: item.item_name.trim(),
        qty: Number(item.qty),
        unit_code: item.unit_code.trim() || "ອັນ",
      }))
      .filter((item) => item.item_name && Number.isFinite(item.qty) && item.qty > 0);

  // ຂົນສົ່ງ (delivery branch) is required for custom bills — the pending queue
  // is branch-scoped, so a custom bill with no branch would never show up.
  const canSaveCustom =
    customName.trim().length > 0 &&
    normalizedCustomItems().length > 0 &&
    Boolean(manualDate) &&
    Boolean(manualRound) &&
    Boolean(manualTransport);

  const saveCustomBill = async () => {
    if (!canSaveCustom || manualSaving) return;
    setManualSaving(true);
    try {
      await Actions.createCustomPendingBill({
        cust_name: customName.trim(),
        telephone: customPhone.trim() || null,
        items: normalizedCustomItems(),
        scheduled_date: manualDate,
        delivery_round_code: manualRound,
        delivery_route_code: manualRoute || null,
        transport_code: manualTransport,
        remark: manualRemark,
      });
      setManualModalOpen(false);
      await fetchBills();
    } catch (e) {
      console.error(e);
    } finally {
      setManualSaving(false);
    }
  };

  const saveManualBill = async () => {
    if (!manualSelected || !manualDate || !manualRound) return;
    setManualSaving(true);
    try {
      await Actions.addManualPendingBill({
        bill_no: manualSelected.doc_no,
        scheduled_date: manualDate,
        delivery_round_code: manualRound,
        delivery_route_code: manualRoute || null,
        transport_code: manualTransport || null,
        remark: manualRemark,
        source_type: manualSelected.source_type ?? null,
      });
      setManualModalOpen(false);
      setManualSelected(null);
      await fetchBills();
    } catch (e) {
      console.error(e);
    } finally {
      setManualSaving(false);
    }
  };

  const toggleSelectBill = (billNo: string) => {
    setSelectedBillNos((current) => {
      const next = new Set(current);
      if (next.has(billNo)) next.delete(billNo);
      else next.add(billNo);
      return next;
    });
  };

  const clearSelection = () => setSelectedBillNos(new Set());

  const applyBulkAction = async () => {
    const billNos = Array.from(selectedBillNos);
    if (billNos.length === 0 || !bulkAction) return;
    setBulkSaving(true);
    try {
      if (bulkAction === "mark_ready") {
        await Actions.bulkUpdatePendingBills({ bill_nos: billNos, action_status: "contacted_ready" });
      } else if (bulkAction === "set_round") {
        if (!bulkRound) return;
        await Actions.bulkUpdatePendingBills({ bill_nos: billNos, delivery_round_code: bulkRound });
      } else if (bulkAction === "set_date") {
        if (!bulkDate) return;
        await Actions.bulkUpdatePendingBills({ bill_nos: billNos, scheduled_date: bulkDate });
      }
      clearSelection();
      setBulkAction("");
      await fetchBills();
    } catch (e) {
      console.error(e);
    } finally {
      setBulkSaving(false);
    }
  };

  const removeManualBill = async (billNo: string) => {
    // A branch leg ("BILL#02-xxxx") is not deleted — its items go back to the
    // parent bill so the home branch delivers them.
    const isLeg = billNo.includes("#");
    const prompt = isLeg
      ? `ຄືນ ${billNo} ໃຫ້ບິນແມ່ — ສາຂາຕົ້ນທາງຈະຈັດສົ່ງສ່ວນນີ້ເອງ?`
      : `ລົບ ${billNo} ອອກຈາກລາຍການລໍຖ້າຈັດຖ້ຽວ?`;
    if (!window.confirm(prompt)) return;
    setRemovingManualBillNo(billNo);
    try {
      await Actions.removeManualPendingBill(billNo);
      setBills((current) => current.filter((bill) => bill.doc_no !== billNo));
      setDrawerBill((current) => (current?.doc_no === billNo ? null : current));
    } catch (e) {
      console.error(e);
      window.alert(userErrorMessage(e, String(e)));
    } finally {
      setRemovingManualBillNo(null);
    }
  };

  // wa.me click-to-chat link. Mirrors the server normalizePhone (src/lib/whatsapp.js):
  // strip non-digits, keep an existing country code, else drop a leading 0 and
  // prepend Laos's 856. No message is pre-filled — the dispatcher types it in.
  const whatsappUrl = (raw?: string | null) => {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (!digits) return "";
    const intl =
      digits.length >= 11 || (digits.length >= 10 && digits[0] !== "0")
        ? digits
        : "856" + (digits.startsWith("0") ? digits.slice(1) : digits);
    return `https://wa.me/${intl}`;
  };

  // Push a LINE message about this bill to the customer or salesperson via the
  // bot (their stored line_id is a bot user-id — see sendBillContactLine).
  const sendLine = async (billNo: string, target: "customer" | "salesperson") => {
    const key = `${billNo}:${target}`;
    setSendingLine(key);
    try {
      const res = (await Actions.sendBillContactLine(billNo, target)) as {
        success?: boolean;
        skipped?: boolean;
        error?: string;
        message?: string;
      };
      if (res?.success) {
        alert("ສົ່ງ LINE ສຳເລັດແລ້ວ ✓");
      } else if (res?.error === "no_line") {
        alert(res.message ?? "ບໍ່ມີ LINE");
      } else if (res?.skipped) {
        alert("ລະບົບ LINE ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ (ບໍ່ມີ token)");
      } else {
        alert("ສົ່ງ LINE ບໍ່ສຳເລັດ");
      }
    } catch (e) {
      alert(userErrorMessage(e, "ສົ່ງ LINE ບໍ່ສຳເລັດ"));
    } finally {
      setSendingLine(null);
    }
  };

  const inputCls = "w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all";
  // Same look as inputCls but WITHOUT w-full — for flex rows where each input
  // sets its own width (w-full otherwise wins over w-14/w-16 in the CSS).
  const itemRowInputCls = "px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all";

  // ── Workflow steps ──
  // Step labels and tone for the workflow stepper. The numeric prefixes ("1",
  // "2.1", ...) mirror the dispatcher's documented process so the UI maps 1:1
  // to how they think about the queue.
  const STEP_META: Record<StepKey, { number: string; title: string; description: string; color: string; ring: string; headBg: string; headText: string; dot: string }> = {
    not_contacted: {
      number: "1",
      title: "ຍັງບໍ່ຕິດຕໍ່",
      description: "ຕ້ອງໂທຫາລູກຄ້າ",
      color: "rose",
      ring: "ring-rose-500/40",
      headBg: "bg-rose-500/10",
      headText: "text-rose-700 dark:text-rose-400",
      dot: "bg-rose-500",
    },
    sales_pending: {
      number: "2.1",
      title: "ພະນັກຂາຍຍັງບໍ່ບອກວັນສົ່ງ",
      description: "ຕິດຕໍ່ແລ້ວ ແຕ່ຍັງບໍ່ມີວັນ/ເສັ້ນທາງ/ຮອບ",
      color: "amber",
      ring: "ring-amber-500/40",
      headBg: "bg-amber-500/10",
      headText: "text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    scheduled_wait: {
      number: "2.2",
      title: "ຍັງບໍ່ຮອດວັນສົ່ງ",
      description: "ກຳນົດຄົບ ລໍຖ້າວັນຮັບ",
      color: "sky",
      ring: "ring-sky-500/40",
      headBg: "bg-sky-500/10",
      headText: "text-sky-700 dark:text-sky-400",
      dot: "bg-sky-500",
    },
    ready: {
      number: "2.3",
      title: "ພ້ອມຈັດຖ້ຽວ",
      description: "ຮອດວັນແລ້ວ ພ້ອມສົ່ງ",
      color: "emerald",
      ring: "ring-emerald-500/40",
      headBg: "bg-emerald-500/10",
      headText: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    problem: {
      number: "!",
      title: "ມີບັນຫາ",
      description: "ຍົກເລີກ / ປະຕິເສດ",
      color: "slate",
      ring: "ring-slate-500/40",
      headBg: "bg-slate-500/10",
      headText: "text-slate-700 dark:text-slate-300",
      dot: "bg-slate-500",
    },
  };
  // STEP_ORDER drives the visible stepper. "problem" is appended after so it
  // reads as a side-channel rather than a step on the happy path.
  const STEP_ORDER: StepKey[] = ["not_contacted", "sales_pending", "scheduled_wait", "ready"];

  // Map a bill to its current workflow step. The order matters — earlier
  // checks override later ones (e.g., a cancelled bill is "problem" even
  // if it also has a scheduled date).
  const billStep = (b: Bill): StepKey => {
    if (b.cancelled_delivery) return "problem";
    if (b.action_status === "customer_cancelled") return "problem";
    if (!b.action_status || b.action_status === "contact_failed" || b.action_status === "customer_postponed") {
      return "not_contacted";
    }
    if (b.action_status === "sales_not_notified") return "sales_pending";
    // ນັດວັນສົ່ງໄວ້ລ່ວງໜ້າ — ລໍຖ້າຮອດວັນນັດ. ພໍຮອດວັນ (ຫຼືເລີຍວັນ) ຕົກລົງມາຂັ້ນ
    // 2.1 ເພື່ອໃຫ້ຜູ້ຈັດຖ້ຽວຕື່ມເສັ້ນທາງ/ຮອບ ແລ້ວປ່ຽນເປັນ "ພ້ອມຮັບ".
    if (b.action_status === "delivery_scheduled") {
      if (b.scheduled_date && b.scheduled_date > today) return "scheduled_wait";
      return "sales_pending";
    }
    if (b.action_status === "contacted_ready") {
      const planComplete = !!b.scheduled_date_overridden && !!b.delivery_route_code?.trim() && !!b.delivery_round_code?.trim();
      if (!planComplete) return "sales_pending";
      if (b.scheduled_date && b.scheduled_date > today) return "scheduled_wait";
      return "ready";
    }
    return "not_contacted";
  };

  const billsByStep: Record<StepKey, Bill[]> = {
    not_contacted: [],
    sales_pending: [],
    scheduled_wait: [],
    ready: [],
    problem: [],
  };
  for (const b of sorted) {
    billsByStep[billStep(b)].push(b);
  }

  const stepTotals: Record<StepKey, { count: number; qty: number }> = {
    not_contacted: { count: 0, qty: 0 },
    sales_pending: { count: 0, qty: 0 },
    scheduled_wait: { count: 0, qty: 0 },
    ready: { count: 0, qty: 0 },
    problem: { count: 0, qty: 0 },
  };
  for (const key of [...STEP_ORDER, "problem" as StepKey]) {
    for (const b of billsByStep[key]) {
      stepTotals[key].count += Number(b.remaining_count) || 0;
      stepTotals[key].qty += Number(b.remaining_qty_total) || 0;
    }
  }

  // On first data load, jump to the first status tab that actually has bills
  // so the dispatcher doesn't land on an empty tab.
  useEffect(() => {
    if (didInitStepRef.current || bills.length === 0) return;
    const firstWithBills = [...STEP_ORDER, "problem" as StepKey].find(
      (s) => billsByStep[s].length > 0
    );
    if (firstWithBills) {
      setActiveStep(firstWithBills);
      didInitStepRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills]);

  useEffect(() => {
    void (Actions.getDispatchedBillsSummary() as Promise<{
      totals: { bills: number; scheduled_ahead: number };
    }>)
      .then((data) => setDispatched(data?.totals ?? null))
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-5">
      {/* ສາຍທີ່ແນະນຳ + ແຜນທີ່ — ຕອບ "ບິນນີ້ເຂົ້າສາຍໃດ" ແລະ "ມັນຢູ່ໃສ"
          ໂດຍບໍ່ຕ້ອງເປີດບິນເທື່ອລະໃບ */}
      <PendingRoutePanel billNos={filtered.map((b) => b.doc_no)} />

      {/* ── Header + filters (consolidated control card) ── */}
      <div className="glass rounded-xl overflow-hidden">
        {/* Title strip + summary + actions */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200/40 dark:border-white/5 bg-gradient-to-r from-teal-500/10 to-transparent">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 shrink-0">
            <FaFileInvoice size={15} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-800 dark:text-white leading-tight truncate">ບິນຄ້າງຕິດຕໍ່ລູກຄ້າ</h1>
            <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 truncate">
              ກວດບິນຄ້າງສົ່ງທີ່ຮອດກຳນົດ/ລ່ວງໜ້າ ເພື່ອບັນທຶກຜົນຕິດຕໍ່, ວັນຮັບ ແລະຮອບສົ່ງ
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
              ພົບ <span className="font-bold text-teal-600 dark:text-teal-400">{filtered.length}</span> ບິນ
            </span>
            {dispatched && dispatched.bills > 0 && (
              <a
                href="/bills-waitingsent"
                title="ບິນເຫຼົ່ານີ້ຖືກຈັດຖ້ຽວແລ້ວ ຈຶ່ງບໍ່ຢູ່ໃນລາຍການນີ້ ແຕ່ຍັງບໍ່ຮອດມືລູກຄ້າ"
                className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap hover:bg-sky-500/20 transition-colors"
              >
                ຈັດຖ້ຽວແລ້ວ ລໍສົ່ງ <span className="font-bold">{dispatched.bills}</span> ບິນ
                {dispatched.scheduled_ahead > 0 && ` (ລ່ວງໜ້າ ${dispatched.scheduled_ahead})`}
              </a>
            )}
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="ປ່ຽນລຳດັບການຈັດຮຽງ"
            >
              {sortOrder === "asc" ? <><FaSortAmountUp size={10} /> ໃກ້ສຸດກ່ອນ</> : <><FaSortAmountDown size={10} /> ໄກສຸດກ່ອນ</>}
            </button>
            <button
              type="button"
              onClick={() => setGrouped((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                grouped
                  ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400"
                  : "border-slate-200/60 bg-white/60 text-slate-600 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
              title="ຈັດກຸ່ມແຖວຕາມວັນຮັບ"
            >
              <FaLayerGroup size={10} /> ຈັດກຸ່ມວັນຮັບ
            </button>
            <button
              type="button"
              onClick={() => setDensity((d) => (d === "compact" ? "normal" : "compact"))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                density === "compact"
                  ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400"
                  : "border-slate-200/60 bg-white/60 text-slate-600 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
              title="ສະຫຼັບຄວາມແໜ້ນຂອງແຖວ — ໂໝດຫຍໍ້ເຫັນໄດ້ຫຼາຍບິນຕໍ່ໜ້າຈໍ"
            >
              <FaBars size={10} /> {density === "compact" ? "ຫຍໍ້" : "ປົກກະຕິ"}
            </button>
            <button
              type="button"
              onClick={openManualModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 cursor-pointer"
            >
              <FaPlus size={10} />
              ເພີ່ມບິນໂອນ (72)
            </button>
          </div>
        </div>

        {/* Filter row + quick chips */}
        <div className="p-3 space-y-2.5">
          <form onSubmit={(e) => { e.preventDefault(); void fetchBills(); }} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ຄົ້ນຫາ ເລກບິນ, ລູກຄ້າ, ຂາຍ..." className={`${inputCls} pl-8`} />
            </div>
            <select value={transportCode} onChange={(e) => setTransportCode(e.target.value)} className={`${inputCls} sm:w-44`}>
              <option value="all">ຂົນສົ່ງ: ທັງໝົດ</option>
              {transports.map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}
            </select>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={`${inputCls} sm:w-44`}>
              <option value="all">ພະແນກ: ທັງໝົດ</option>
              {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={provinceFilter}
              onChange={(e) => {
                setProvinceFilter(e.target.value);
                // A district from the previous province would hide every row.
                setDistrictFilter("all");
              }}
              className={`${inputCls} sm:w-44`}
            >
              <option value="all">ແຂວງ: ທັງໝົດ</option>
              {provinceList.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className={`${inputCls} sm:w-40`}>
              <option value="all">ເມືອງ: ທັງໝົດ</option>
              {districtList.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 transition-colors bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 cursor-pointer shrink-0">
              {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
              ຄົ້ນຫາ
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">ດ່ວນ:</span>
            {([
              { key: "all" as const, label: "ທັງໝົດ" },
              { key: "pos" as const, label: "ບິນ POS" },
              { key: "partial" as const, label: "ທະຍອຍສົ່ງ" },
              { key: "manual" as const, label: "ບິນເພີ່ມພິເສດ" },
            ]).map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setQuickFilter(chip.key)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border cursor-pointer ${
                  quickFilter === chip.key
                    ? "bg-teal-500/15 border-teal-500/30 text-teal-600 dark:text-teal-400"
                    : "bg-white/30 dark:bg-white/5 border-slate-200/50 dark:border-white/5 text-slate-500 hover:bg-slate-500/10 dark:text-slate-400"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status tabs — pick one status to view (replaces the stacked sections) */}
      {filtered.length > 0 && !loading && (
        <div className="flex border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 rounded-lg p-1 gap-1 overflow-x-auto">
          {[...STEP_ORDER, "problem" as StepKey].map((step) => {
            const meta = STEP_META[step];
            const isActive = activeStep === step;
            const count = billsByStep[step].length;
            return (
              <button
                key={step}
                type="button"
                onClick={() => setActiveStep(step)}
                className={`flex-1 min-w-[110px] py-1.5 px-2 rounded-md text-center transition-all cursor-pointer ${
                  isActive
                    ? `${meta.headBg} ${meta.headText} ring-1 ring-current/25 shadow-xs`
                    : "text-slate-500 hover:bg-slate-500/10"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  <span className="truncate text-[11px] font-bold">{meta.title}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-extrabold tabular-nums ${
                      isActive ? "bg-white/60 dark:bg-black/20" : "bg-slate-500/10 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </div>
                <div className="hidden sm:block text-[9px] font-medium opacity-60 mt-0.5 truncate">
                  {meta.description}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="rounded-lg border border-slate-200/60 dark:border-white/[0.06] bg-white dark:bg-slate-900 p-16 text-center">
          <FaSpinner className="animate-spin text-2xl mx-auto mb-3 text-teal-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">ກຳລັງໂຫຼດ...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200/60 dark:border-white/[0.06] bg-white dark:bg-slate-900 p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <FaFileInvoice className="text-slate-400 dark:text-slate-500 text-xl" />
          </div>
          <p className="text-sm text-slate-500">{kw ? "ບໍ່ພົບຂໍ້ມູນ" : "ບໍ່ມີຂໍ້ມູນ"}</p>
        </div>
      ) : (
        <>
          {/* Bulk-action toolbar (visible when bills are selected) */}
          {selectedBillNos.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 shadow-md dark:border-teal-800 dark:bg-teal-950/50">
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                ເລືອກແລ້ວ {selectedBillNos.size} ບິນ
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[10px] text-teal-600 hover:underline cursor-pointer"
              >
                ລ້າງ
              </button>
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value as typeof bulkAction)}
                className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-xs dark:border-teal-700 dark:bg-slate-900"
              >
                <option value="">-- ເລືອກການກະທຳ --</option>
                <option value="mark_ready">ໝາຍວ່າພ້ອມຮັບ</option>
                <option value="set_round">ກຳນົດຮອບສົ່ງ</option>
                <option value="set_date">ກຳນົດວັນສົ່ງ</option>
              </select>
              {bulkAction === "set_round" && (
                <select
                  value={bulkRound}
                  onChange={(e) => setBulkRound(e.target.value)}
                  className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-xs dark:border-teal-700 dark:bg-slate-900"
                >
                  <option value="">-- ເລືອກຮອບ --</option>
                  {deliveryRounds.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name} {r.time_label ? `(${r.time_label})` : ""}
                    </option>
                  ))}
                </select>
              )}
              {bulkAction === "set_date" && (
                <input
                  type="date"
                  value={bulkDate}
                  min={FIXED_YEAR_START}
                  max={FIXED_YEAR_END}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-xs dark:border-teal-700 dark:bg-slate-900"
                />
              )}
              <button
                type="button"
                onClick={() => void applyBulkAction()}
                disabled={
                  bulkSaving ||
                  !bulkAction ||
                  (bulkAction === "set_round" && !bulkRound) ||
                  (bulkAction === "set_date" && !bulkDate)
                }
                className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                {bulkSaving ? <FaSpinner className="animate-spin" size={10} /> : <FaCheck size={10} />}
                ນຳໃຊ້
              </button>
            </div>
          )}

          {/* ═══════ TABLE VIEW ═══════ */}
          <div className="space-y-3">
              {(() => {
                const step = activeStep;
                const meta = STEP_META[step];
                const stepBills = billsByStep[step];
                const totals = stepTotals[step];

                // Step color map for left-border
                const borderColor: Record<string, string> = {
                  not_contacted: "border-l-rose-500",
                  sales_pending: "border-l-amber-500",
                  scheduled_wait: "border-l-sky-500",
                  ready: "border-l-emerald-500",
                  problem: "border-l-slate-400",
                };
                const dotColor: Record<string, string> = {
                  not_contacted: "bg-rose-500",
                  sales_pending: "bg-amber-500",
                  scheduled_wait: "bg-sky-500",
                  ready: "bg-emerald-500",
                  problem: "bg-slate-400",
                };

                // 7 ຖັນ (ຈາກເກົ່າ 9): checkbox · ເລກບິນ · ລູກຄ້າ · ສະຖານະ ·
                // ເສັ້ນທາງ+ຮອບ · ຈຳນວນ · ຄຳສັ່ງ. ຖັນ 1-2 ເປັນ sticky ຈຶ່ງກຳນົດ
                // ຄວາມກວ້າງຖັນທຳອິດເປັນ 36px ໃຫ້ກົງກັບ `left-9` ຂອງຖັນທີສອງ.
                const COLS = "grid-cols-[36px_minmax(200px,1.1fr)_minmax(190px,1.5fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(96px,0.5fr)_84px]";
                const compact = density === "compact";

                // ຈັດກຸ່ມຕາມວັນຮັບ — `sorted` ຮຽງຕາມ scheduled_date ຢູ່ແລ້ວ
                // ບິນວັນດຽວກັນຈຶ່ງຕິດກັນ ພຽງແຕ່ຕັດເປັນກ້ອນເມື່ອວັນປ່ຽນ.
                const dayGroups: Array<{ key: string; date: string | null; display: string; bills: Bill[] }> = [];
                for (const b of stepBills) {
                  const key = grouped ? b.scheduled_date || "__none__" : "__all__";
                  const last = dayGroups[dayGroups.length - 1];
                  if (last && last.key === key) {
                    last.bills.push(b);
                    continue;
                  }
                  dayGroups.push({
                    key,
                    date: b.scheduled_date || null,
                    display: b.scheduled_date_display || b.scheduled_date || "",
                    bills: [b],
                  });
                }

                const toggleGroup = (key: string) =>
                  setCollapsedGroups((cur) => {
                    const next = new Set(cur);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });

                const allSelected = stepBills.length > 0 && stepBills.every((b) => selectedBillNos.has(b.doc_no));
                const someSelected = stepBills.some((b) => selectedBillNos.has(b.doc_no));
                const toggleSelectAllInStep = () =>
                  setSelectedBillNos((cur) => {
                    const next = new Set(cur);
                    for (const b of stepBills) {
                      if (allSelected) next.delete(b.doc_no);
                      else next.add(b.doc_no);
                    }
                    return next;
                  });

                return (
                  <section className="rounded-xl border border-slate-200/60 dark:border-white/[0.06] bg-white dark:bg-slate-900 overflow-hidden">
                    {/* Active status header — coloured to match the active tab */}
                    <div className={`w-full flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] ${meta.headBg}`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${dotColor[step] ?? "bg-slate-400"}`} />
                      <span className={`text-sm font-bold ${meta.headText}`}>{meta.title}</span>
                      <span className="hidden sm:inline text-[10px] text-slate-400 dark:text-slate-500">
                        {meta.description}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="rounded-full bg-white/70 dark:bg-black/25 px-2 py-0.5 text-[11px] font-extrabold text-slate-700 dark:text-slate-100 tabular-nums">
                          {stepBills.length} ບິນ
                        </span>
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                          {fmtQty(totals.qty)} ໜ່ວຍ
                        </span>
                      </span>
                    </div>

                    {/* ── ຕາຕະລາງ: ຫົວຕາຕະລາງ sticky + ຖັນເລກບິນ sticky ──
                        ໃຊ້ `overflow-auto` (ບໍ່ແມ່ນ `overflow-x-auto` ຢ່າງດຽວ) ເພາະ
                        position:sticky ຕ້ອງມີ scroll container ຂອງຕົນເອງ ຈຶ່ງຈະ
                        ຄ້າງຫົວຕາຕະລາງໄວ້ຕອນເລື່ອນລົງໄດ້. */}
                    <div className="max-h-[calc(100vh-16rem)] overflow-auto">
                        {/* Table header */}
                        <div className={`hidden md:grid ${COLS} sticky top-0 z-20 h-8 items-stretch border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-white/[0.06] dark:bg-slate-800 dark:text-slate-400`}>
                          <div className="sticky left-0 z-[1] flex items-center justify-center bg-slate-50 px-2 dark:bg-slate-800">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                              onChange={toggleSelectAllInStep}
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                              title="ເລືອກ / ຍົກເລີກທັງໝົດໃນສະຖານະນີ້"
                            />
                          </div>
                          <div className="sticky left-9 z-[1] flex items-center bg-slate-50 px-3 dark:bg-slate-800">ເລກບິນ · ວັນຮັບ</div>
                          <div className="flex items-center px-3">ລູກຄ້າ</div>
                          <div className="flex items-center px-3">ສະຖານະ</div>
                          <div className="flex items-center px-3">ເສັ້ນທາງ · ຮອບສົ່ງ</div>
                          <div className="flex items-center justify-end px-3">ຈຳນວນ</div>
                          <div className="flex items-center justify-center px-2">ຄຳສັ່ງ</div>
                        </div>

                        {/* Empty state when this status has no bills */}
                        {stepBills.length === 0 && (
                          <div className="px-4 py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                            ບໍ່ມີບິນໃນສະຖານະນີ້
                          </div>
                        )}

                        {/* ແຕ່ລະກຸ່ມ = ໜຶ່ງວັນຮັບ (ຫຼືກ້ອນດຽວເມື່ອປິດການຈັດກຸ່ມ) */}
                        {dayGroups.map((g, gi) => {
                          const groupKey = `${step}:${g.key}`;
                          const collapsed = grouped && collapsedGroups.has(groupKey);
                          const groupQty = g.bills.reduce((s, b) => s + (Number(b.remaining_qty_total) || 0), 0);
                          const groupDiff = g.date ? daysBetween(today, g.date) : null;

                          return (
                            <div key={`${g.key}-${gi}`}>
                              {/* ຫົວກຸ່ມຄ້າງໃຕ້ຫົວຕາຕະລາງ (top-8) — ຢູ່ມືຖືບໍ່ມີ
                                  ຫົວຕາຕະລາງ ຈຶ່ງຄ້າງທີ່ top-0 */}
                              {grouped && (
                                <div className="sticky top-0 z-[15] flex items-center gap-2 border-b border-slate-200/80 bg-slate-100/95 px-3 py-1.5 backdrop-blur-sm md:top-8 dark:border-white/10 dark:bg-slate-800/95">
                                  <button
                                    type="button"
                                    onClick={() => toggleGroup(groupKey)}
                                    className="flex h-4 w-4 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                    title={collapsed ? "ຂະຫຍາຍ" : "ຫຍໍ້ກຸ່ມ"}
                                  >
                                    {collapsed ? <FaChevronRight size={8} /> : <FaChevronDown size={8} />}
                                  </button>
                                  <span className="text-[11px] font-bold text-slate-700 tabular-nums dark:text-slate-200">
                                    {g.date ? `ຮັບ ${g.display} · ວັນ${laoWeekday(g.date)}` : "ຍັງບໍ່ມີວັນຮັບ"}
                                  </span>
                                  {groupDiff !== null && (
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                        groupDiff < 0
                                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                          : groupDiff === 0
                                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                          : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                                      }`}
                                    >
                                      {relDayLabel(groupDiff)}
                                    </span>
                                  )}
                                  <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                                    {g.bills.length} ບິນ · {fmtQty(groupQty)} ໜ່ວຍ
                                  </span>
                                </div>
                              )}

                              {!collapsed && g.bills.map((bill, idx) => {
                          const contactMeta = bill.action_status ? ACTION_STATUS_MAP[bill.action_status] : null;
                          const roundName = bill.delivery_round_code
                            ? deliveryRounds.find((r) => r.code === bill.delivery_round_code)?.name ?? bill.delivery_round_code
                            : "";
                          const routeName = bill.delivery_route_code
                            ? deliveryRoutes.find((r) => r.code === bill.delivery_route_code)?.name ?? bill.delivery_route_code
                            : "";
                          const isActive = drawerBill?.doc_no === bill.doc_no;
                          const isEven = idx % 2 === 0;
                          const age = fmtAge(bill.time_use);
                          const schedDiff = bill.scheduled_date ? daysBetween(today, bill.scheduled_date) : null;
                          const overdue = schedDiff !== null && schedDiff < 0;
                          const rescheduled = (bill.reschedule_count ?? 0) > RESCHEDULE_RED_THRESHOLD;
                          const vol = billVolumes[bill.doc_no];
                          // ເຊື່ອງປ້າຍ "? m³" ຕອນຍັງບໍ່ຮູ້ຂະໜາດ — ເປັນສິ່ງລົບກວນລ້ວນໆ
                          const volShown = vol && vol.m3 > 0 ? vol : undefined;
                          // ຖັນ sticky ຊ້ອນທັບແຖວທີ່ເລື່ອນຢູ່ໃຕ້ ຈຶ່ງຕ້ອງໃຊ້ພື້ນທຶບ (ບໍ່ໂປ່ງໃສ)
                          const cellBg = isActive
                            ? "bg-teal-50 dark:bg-teal-950"
                            : isEven
                            ? "bg-white dark:bg-slate-900"
                            : "bg-slate-50 dark:bg-slate-950";
                          const stickyCell = `${cellBg} group-hover:bg-teal-50 dark:group-hover:bg-teal-950`;

                          return (
                            <div
                              key={bill.doc_no}
                              onClick={() => void toggleProducts(bill.doc_no)}
                              className={`group border-l-[3px] cursor-pointer transition-colors duration-150 ${cellBg} ${
                                isActive ? "border-l-teal-500" : borderColor[step] ?? "border-l-slate-300"
                              } hover:bg-teal-50 dark:hover:bg-teal-950`}
                            >
                              {/* Desktop row */}
                              <div className={`hidden md:grid ${COLS} items-center border-b border-slate-100 dark:border-white/[0.03] ${compact ? "min-h-[34px]" : "min-h-[48px]"}`}>
                                {/* Checkbox */}
                                <div className={`sticky left-0 z-[1] flex self-stretch items-center justify-center px-2 ${stickyCell}`} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedBillNos.has(bill.doc_no)}
                                    onChange={() => toggleSelectBill(bill.doc_no)}
                                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                  />
                                </div>

                                {/* ເລກບິນ + ປ້າຍ · ແຖວທີສອງ = ວັນຮັບ / ອາຍຸບິນ */}
                                <div className={`sticky left-9 z-[1] flex min-w-0 flex-col justify-center gap-0.5 self-stretch px-3 py-1 ${stickyCell}`}>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      title={bill.doc_no}
                                      className={`shrink-0 whitespace-nowrap font-mono text-xs font-bold ${
                                        isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-800 dark:text-slate-100"
                                      }`}
                                    >
                                      {bill.doc_no}
                                    </span>
                                    {bill.is_pos_settled && <span className={NEUTRAL_BADGE}>POS</span>}
                                    {Number(bill.cod_amount ?? 0) > 0 && (
                                      <span
                                        className="shrink-0 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                        title={`ເກັບເງິນປາຍທາງ ${Number(bill.cod_amount).toLocaleString("en-US")} ກີບ — ຄົນຂັບຕ້ອງເກັບເງິນຕອນສົ່ງ`}
                                      >
                                        💰 COD {Number(bill.cod_amount).toLocaleString("en-US")}
                                      </span>
                                    )}
                                    {bill.partial_delivery && <span className={NEUTRAL_BADGE}>ທະຍອຍ</span>}
                                    {bill.manual_pending_bill && !bill.parent_bill_no && <span className={NEUTRAL_BADGE}>ພິເສດ</span>}
                                    {bill.parent_bill_no && (
                                      <span
                                        className={NEUTRAL_BADGE}
                                        title={`ສ່ວນຂອງບິນ ${bill.parent_bill_no} ທີ່ຢູ່ສາງສາຂານີ້ — ສາຂານີ້ນັດວັນ ແລະ ຈັດຖ້ຽວເອງ`}
                                      >
                                        🔀 ຈາກ {bill.parent_bill_no}
                                      </span>
                                    )}
                                    {(bill.branch_legs?.length ?? 0) > 0 && (
                                      <span
                                        className={NEUTRAL_BADGE}
                                        title={(bill.branch_legs ?? [])
                                          .map(
                                            (leg) =>
                                              `${leg.bill_no} → ${leg.transport_name || leg.transport_code}${
                                                leg.on_open_trip ? " (ຢູ່ໃນຖ້ຽວ)" : leg.scheduled_date_display ? ` (ນັດ ${leg.scheduled_date_display})` : " (ລໍຖ້ານັດວັນ)"
                                              }`
                                          )
                                          .join("\n")}
                                      >
                                        🔀 ແຍກໄປ {(bill.branch_legs ?? []).map((leg) => leg.transport_name || leg.transport_code).join(", ")}
                                      </span>
                                    )}
                                    {bill.incoming_forwarded && (
                                      <span
                                        className={NEUTRAL_BADGE}
                                        title={`ສົ່ງມາຈາກສາຂາ ${bill.forward_from_transport_name || bill.forward_from_transport_code || "ສາຂາອື່ນ"}${bill.forwarded_at ? ` · ${bill.forwarded_at}` : ""} — ໃຫ້ຈັດສົ່ງຕໍ່ຫາລູກຄ້າ`}
                                      >
                                        ⇄ ສາຂາ
                                      </span>
                                    )}
                                    {(bill.sent_rounds ?? 0) > 0 && (
                                      <span
                                        className={NEUTRAL_BADGE}
                                        title={`ສົ່ງມາແລ້ວ ${bill.sent_rounds} ຮອບ${bill.last_sent_at ? ` · ຫຼ້າສຸດ ${bill.last_sent_at}` : ""}`}
                                      >
                                        🔁 {bill.sent_rounds}
                                      </span>
                                    )}
                                    {transportCode === "all" && (
                                      <BranchBadge code={bill.transport_code} name={bill.transport} />
                                    )}
                                    {bill.cancelled_delivery && (
                                      <span
                                        className="inline-flex items-center rounded bg-rose-100 px-1 py-0.5 text-[9px] font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
                                        title={`ຍົກເລີກ${bill.cancelled_delivery_at ? ` ${bill.cancelled_delivery_at}` : ""}${bill.cancelled_delivery_remark ? ` · ${bill.cancelled_delivery_remark}` : ""}`}
                                      >
                                        ຍົກເລີກ
                                      </span>
                                    )}
                                  </div>
                                  {!compact && (
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); openScheduleDialog(bill); }}
                                        title="ກົດເພື່ອປ່ຽນວັນຮັບ"
                                        className={`cursor-pointer transition-colors hover:text-teal-600 dark:hover:text-teal-400 ${
                                          overdue || rescheduled
                                            ? "font-bold text-rose-600 underline decoration-dotted underline-offset-2 dark:text-rose-400"
                                            : bill.scheduled_date_display
                                            ? "font-semibold text-slate-700 underline decoration-dotted decoration-slate-400/60 underline-offset-2 dark:text-slate-200"
                                            : "text-teal-600 dark:text-teal-400"
                                        }`}
                                      >
                                        {bill.scheduled_date_display ? `ຮັບ ${bill.scheduled_date_display}` : "+ ກຳນົດວັນຮັບ"}
                                        {bill.scheduled_date_overridden && <span className="ml-0.5 text-amber-500">*</span>}
                                      </button>
                                      {schedDiff !== null && (
                                        <span className={overdue ? "font-bold text-rose-600 dark:text-rose-400" : "text-slate-400"}>
                                          {relDayLabel(schedDiff)}
                                        </span>
                                      )}
                                      {age && (
                                        <span className="text-slate-400" title={`ເປີດບິນ ${bill.time_open || bill.doc_date}`}>
                                          ⏱ {age}
                                        </span>
                                      )}
                                      {rescheduled && (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 font-bold text-rose-700 dark:text-rose-400" title={`ປ່ຽນວັນຮັບແລ້ວ ${bill.reschedule_count} ເທື່ອ`}>
                                          <FaExclamationTriangle size={8} className="shrink-0" />
                                          {bill.reschedule_count}×
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* ລູກຄ້າ — ທີ່ຢູ່ ແລະ ໝາຍເຫດຫຍໍ້ເປັນ icon + tooltip */}
                                <div className="min-w-0 px-3 py-1">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200" title={bill.transport_name}>
                                      {bill.transport_name}
                                    </span>
                                    {bill.cust_area && (
                                      <span className="shrink-0 text-slate-300 dark:text-slate-600" title={`ທີ່ຢູ່ລູກຄ້າ: ${bill.cust_area}`}>
                                        <FaMapMarkerAlt size={9} />
                                      </span>
                                    )}
                                    {bill.sales_remark && (
                                      <span className="shrink-0 text-amber-500" title={`ໝາຍເຫດບິນຂາຍ: ${bill.sales_remark}`}>
                                        <FaStickyNote size={9} />
                                      </span>
                                    )}
                                  </div>
                                  {!compact && (
                                    <div
                                      className="truncate text-[10px] text-slate-400 dark:text-slate-500"
                                      title={[bill.sale, bill.department, bill.transport, bill.cust_area].filter(Boolean).join(" · ")}
                                    >
                                      {[bill.sale, bill.department, bill.transport].filter(Boolean).join(" · ")}
                                    </div>
                                  )}
                                </div>

                                {/* ສະຖານະ — ສີເນັ້ນອັນດຽວຂອງແຖວ */}
                                <div className="px-3 py-1" onClick={(e) => { e.stopPropagation(); }}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setStatusMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                    className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                                      contactMeta?.color === "emerald"
                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400"
                                        : contactMeta?.color === "rose"
                                        ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-400"
                                        : contactMeta?.color === "amber"
                                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400"
                                        : contactMeta?.color === "sky"
                                        ? "bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-400"
                                        : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                                    }`}
                                  >
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                      contactMeta?.color === "emerald" ? "bg-emerald-500" :
                                      contactMeta?.color === "rose" ? "bg-rose-500" :
                                      contactMeta?.color === "amber" ? "bg-amber-500" :
                                      contactMeta?.color === "sky" ? "bg-sky-500" :
                                      "bg-slate-400"
                                    }`} />
                                    <span className="truncate">{contactMeta?.label ?? "ບໍ່ຕິດຕໍ່"}</span>
                                    <FaChevronDown size={7} className="shrink-0 opacity-50" />
                                  </button>
                                </div>

                                {/* ເສັ້ນທາງ + ຮອບສົ່ງ — ຕັ້ງພ້ອມກັນຢູ່ແລ້ວ ຈຶ່ງລວມເປັນຖັນດຽວ */}
                                <div
                                  className={`min-w-0 px-3 py-1 ${compact ? "flex items-center gap-1 truncate" : "flex flex-col items-start gap-0.5"}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <PlanCellButton
                                    value={routeName}
                                    placeholder="+ ເສັ້ນທາງ"
                                    title={routeName ? `ເສັ້ນທາງ: ${routeName}` : "ກຳນົດເສັ້ນທາງ"}
                                    onClick={(e) => { e.stopPropagation(); setRouteMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                  />
                                  {compact && <span className="shrink-0 text-slate-300 dark:text-slate-600">·</span>}
                                  <PlanCellButton
                                    value={roundName}
                                    placeholder="+ ຮອບສົ່ງ"
                                    title={roundName ? `ຮອບສົ່ງ: ${roundName}` : "ກຳນົດຮອບສົ່ງ"}
                                    onClick={(e) => { e.stopPropagation(); setRoundMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                  />
                                </div>

                                {/* ຈຳນວນ */}
                                <div className="px-3 py-1 text-right">
                                  <span className="text-xs font-bold text-slate-800 tabular-nums dark:text-slate-100">
                                    {fmtQty(bill.remaining_qty_total)}
                                  </span>
                                  {!compact && (
                                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-slate-400 tabular-nums">
                                      <span>{bill.remaining_count} ລາຍ</span>
                                      {volShown && (
                                        <span onClick={(e) => e.stopPropagation()}>
                                          <BillVolumeTag
                                            v={volShown}
                                            onClick={() =>
                                              setDetailBill({ billNo: bill.doc_no, custName: bill.cust_name ?? "" })
                                            }
                                          />
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {!compact && bill.partial_delivery && (bill.total_qty_total ?? 0) > 0 && (
                                    <div className="text-[9px] text-slate-400 tabular-nums" title="ສົ່ງແລ້ວ / ທັງໝົດ">
                                      {fmtQty(bill.delivered_qty_total ?? 0)} / {fmtQty(bill.total_qty_total ?? 0)}
                                    </div>
                                  )}
                                </div>

                                {/* ຄຳສັ່ງ — ປຸ່ມຫຼັກ 1 ອັນ ທີ່ເຫຼືອຢູ່ໃນເມນູ "⋯" */}
                                <div className="flex items-center justify-center gap-1 px-2" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openModal(bill); }}
                                    className="flex h-6 w-6 items-center justify-center rounded bg-teal-600 text-white transition-colors hover:bg-teal-700 cursor-pointer"
                                    title="ປ່ຽນສາຍສົ່ງ"
                                  >
                                    <FaExchangeAlt size={9} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setRowMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 opacity-50 transition-all hover:bg-slate-500/10 hover:text-slate-600 group-hover:opacity-100 dark:hover:text-slate-200 cursor-pointer"
                                    title="ຄຳສັ່ງອື່ນ"
                                  >
                                    <FaEllipsisH size={10} />
                                  </button>
                                </div>
                              </div>

                              {/* Mobile row */}
                              <div className="space-y-1 border-b border-slate-100 px-3 py-2.5 md:hidden dark:border-white/[0.03]">
                                <div className="flex flex-wrap items-center gap-2">
                                  <label onClick={(e) => e.stopPropagation()} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={selectedBillNos.has(bill.doc_no)}
                                      onChange={() => toggleSelectBill(bill.doc_no)}
                                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                    />
                                  </label>
                                  <span
                                    title={bill.doc_no}
                                    className={`shrink-0 whitespace-nowrap font-mono text-xs font-bold ${isActive ? "text-teal-600" : "text-slate-800 dark:text-slate-100"}`}
                                  >
                                    {bill.doc_no}
                                  </span>
                                  {bill.is_pos_settled && <span className={NEUTRAL_BADGE}>POS</span>}
                                  {bill.partial_delivery && <span className={NEUTRAL_BADGE}>ທະຍອຍ</span>}
                                  {transportCode === "all" && (
                                    <BranchBadge code={bill.transport_code} name={bill.transport} />
                                  )}
                                  {bill.cancelled_delivery && (
                                    <span className="rounded bg-rose-100 px-1 py-0.5 text-[9px] font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">ຍົກເລີກ</span>
                                  )}
                                  <span className="ml-auto shrink-0 text-xs font-bold text-slate-800 tabular-nums dark:text-slate-100">
                                    {fmtQty(bill.remaining_qty_total)} <span className="text-[10px] font-medium text-slate-400">ໜ່ວຍ</span>
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                    {bill.transport_name}
                                  </span>
                                  {bill.sales_remark && (
                                    <span className="shrink-0 text-amber-500" title={`ໝາຍເຫດບິນຂາຍ: ${bill.sales_remark}`}>
                                      <FaStickyNote size={9} />
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setStatusMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold cursor-pointer ${
                                      contactMeta?.color === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                      contactMeta?.color === "rose" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" :
                                      contactMeta?.color === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                      contactMeta?.color === "sky" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400" :
                                      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                    }`}
                                  >
                                    <FaPhone size={7} />
                                    {contactMeta?.label ?? "ບໍ່ຕິດຕໍ່"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openScheduleDialog(bill); }}
                                    className={`text-[10px] tabular-nums cursor-pointer ${
                                      overdue || rescheduled
                                        ? "font-bold text-rose-600 dark:text-rose-400"
                                        : bill.scheduled_date_display
                                        ? "font-semibold text-slate-600 dark:text-slate-300"
                                        : "font-semibold text-teal-600 dark:text-teal-400"
                                    }`}
                                  >
                                    {bill.scheduled_date_display ? `ຮັບ ${bill.scheduled_date_display}` : "+ ກຳນົດວັນຮັບ"}
                                    {schedDiff !== null ? ` · ${relDayLabel(schedDiff)}` : ""}
                                  </button>
                                  {rescheduled && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                                      <FaExclamationTriangle size={7} />
                                      {bill.reschedule_count}×
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
                                  <PlanCellButton
                                    value={routeName}
                                    placeholder="+ ເສັ້ນທາງ"
                                    title={routeName ? `ເສັ້ນທາງ: ${routeName}` : "ກຳນົດເສັ້ນທາງ"}
                                    onClick={(e) => { e.stopPropagation(); setRouteMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                  />
                                  <PlanCellButton
                                    value={roundName}
                                    placeholder="+ ຮອບສົ່ງ"
                                    title={roundName ? `ຮອບສົ່ງ: ${roundName}` : "ກຳນົດຮອບສົ່ງ"}
                                    onClick={(e) => { e.stopPropagation(); setRoundMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                  />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openModal(bill); }}
                                    className="ml-auto rounded bg-teal-600 px-2 py-1 text-[9px] font-semibold text-white cursor-pointer"
                                  >
                                    <FaExchangeAlt size={8} className="mr-0.5 inline" /> ປ່ຽນ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setRowMenu({ billNo: bill.doc_no, anchor: e.currentTarget }); }}
                                    className="rounded border border-slate-200 px-2 py-1 text-[9px] font-semibold text-slate-500 dark:border-white/10 dark:text-slate-300 cursor-pointer"
                                  >
                                    <FaEllipsisH size={8} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                              })}
                            </div>
                          );
                        })}
                      </div>
                  </section>
                );
              })()}
            </div>
        </>
      )}

      {/* ── Modal ── */}
      {modalOpen && selectedBill && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative glass-heavy glow-primary rounded-lg w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/20 dark:border-white/5 bg-teal-500/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-600 dark:bg-teal-500">
                  <FaExchangeAlt className="text-white" size={12} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">ປ່ຽນຂົນສົ່ງ</h3>
                  <p className="text-[11px] text-slate-500">{selectedBill.doc_no}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                <FaTimes size={12} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="glass-subtle rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">ລູກຄ້າ</span><span className="font-medium text-slate-700 text-right">{selectedBill.transport_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">ຂົນສົ່ງ</span><span className="font-medium text-slate-700 text-right">{selectedBill.transport || "-"}</span></div>
                {selectedBill.sales_remark && (
                  <div className="border-t border-slate-200/50 pt-1.5">
                    <span className="text-slate-500">ໝາຍເຫດບິນຂາຍ</span>
                    <p className="mt-0.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700">
                      {selectedBill.sales_remark}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <FaTruck className="inline mr-1 text-slate-400" size={10} />ເລືອກຂົນສົ່ງໃໝ່
                </label>
                <select value={selectedTransport} onChange={(e) => setSelectedTransport(e.target.value)} className={inputCls}>
                  <option value="">-- ເລືອກ --</option>
                  {(allBranches.length > 0 ? allBranches : transports)
                    .filter((t) => t.code !== SELF_PICKUP_TRANSPORT_CODE)
                    .map((t) => <option key={t.code} value={t.code}>🚚 {t.name_1}</option>)}
                  <option value={SELF_PICKUP_TRANSPORT_CODE}>🙋 ລູກຄ້າຮັບເອງ</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 dark:border-white/5 bg-white/30 dark:bg-white/5">
              <button onClick={closeModal} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ຍົກເລີກ</button>
              <button onClick={() => void handleUpdate()} disabled={!selectedTransport || updating} className="px-4 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600">
                {updating ? <FaSpinner className="animate-spin" size={10} /> : <FaExchangeAlt size={10} />}
                ຢືນຢັນ
              </button>
            </div>
          </div>
        </div>
      )}

      {manualModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeManualModal} />
          <div className="relative glass-heavy glow-primary rounded-lg w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/20 dark:border-white/5 bg-teal-500/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-600 dark:bg-teal-500">
                  <FaPlus className="text-white" size={12} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">ເພີ່ມບິນເຂົ້າລໍຖ້າຈັດຖ້ຽວ</h3>
                  <p className="text-[11px] text-slate-500">ຄົ້ນຫາບິນໂອນ (72), ບິນສູນບໍລິການ ຫຼື ເພີ່ມບິນອື່ນໆທີ່ບໍ່ມີໃນລະບົບ</p>
                </div>
              </div>
              <button onClick={closeManualModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                <FaTimes size={12} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Mode switch: pick an existing bill vs type a free-form ອື່ນໆ bill */}
              <div className="flex rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-white/5 p-1 gap-1">
                {([
                  { key: "search" as const, label: "ຄົ້ນຫາບິນໃນລະບົບ" },
                  { key: "custom" as const, label: "ເພີ່ມບິນອື່ນໆ (ບໍ່ມີໃນລະບົບ)" },
                ]).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setManualMode(mode.key)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                      manualMode === mode.key
                        ? "bg-teal-600 text-white dark:bg-teal-500"
                        : "text-slate-500 hover:bg-slate-500/10 dark:text-slate-400"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {manualMode === "search" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void searchManualBills();
                  }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder="ຄົ້ນຫາເລກບິນ, ລະຫັດ ຫຼື ຊື່ລູກຄ້າ..."
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={manualSearching || manualSearch.trim().length < 2}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500"
                  >
                    {manualSearching ? <FaSpinner className="animate-spin" size={10} /> : <FaSearch size={10} />}
                    ຄົ້ນຫາ
                  </button>
                </form>
              )}

              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                {manualMode === "custom" ? (
                  <div className="space-y-3 rounded-lg border border-slate-200/50 bg-white/40 p-3 dark:border-white/10 dark:bg-white/5">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        ຊື່ລູກຄ້າ / ຜູ້ຮັບ <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="ຊື່ລູກຄ້າ ຫຼື ຜູ້ຮັບເຄື່ອງ..."
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ເບີໂທ</label>
                      <input
                        type="tel"
                        value={customPhone}
                        onChange={(e) => setCustomPhone(e.target.value)}
                        placeholder="020..."
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        ລາຍການເຄື່ອງ <span className="text-rose-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {customItems.map((item, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={item.item_name}
                              onChange={(e) =>
                                setCustomItems((current) =>
                                  current.map((it, i) => (i === index ? { ...it, item_name: e.target.value } : it))
                                )
                              }
                              placeholder={`ລາຍການ ${index + 1}...`}
                              className={`${itemRowInputCls} flex-1 min-w-0`}
                            />
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) =>
                                setCustomItems((current) =>
                                  current.map((it, i) => (i === index ? { ...it, qty: e.target.value } : it))
                                )
                              }
                              className={`${itemRowInputCls} w-14 shrink-0 text-center`}
                              title="ຈຳນວນ"
                            />
                            <input
                              type="text"
                              value={item.unit_code}
                              onChange={(e) =>
                                setCustomItems((current) =>
                                  current.map((it, i) => (i === index ? { ...it, unit_code: e.target.value } : it))
                                )
                              }
                              className={`${itemRowInputCls} w-16 shrink-0 text-center`}
                              title="ຫົວໜ່ວຍ"
                            />
                            <button
                              type="button"
                              onClick={() => setCustomItems((current) => current.filter((_, i) => i !== index))}
                              disabled={customItems.length <= 1}
                              className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                              title="ລົບລາຍການ"
                            >
                              <FaTrash size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomItems((current) => [...current, { item_name: "", qty: "1", unit_code: "ອັນ" }])
                        }
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-teal-400/60 px-3 py-1.5 text-[11px] font-semibold text-teal-600 hover:bg-teal-500/10 dark:text-teal-400 transition-colors cursor-pointer"
                      >
                        <FaPlus size={9} />
                        ເພີ່ມລາຍການ
                      </button>
                    </div>
                    <div className="rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] text-sky-700 dark:text-sky-400">
                      ລະບົບຈະອອກເລກບິນ OTH-XXXX ໃຫ້ອັດຕະໂນມັດ. ຕ້ອງເລືອກ “ຂົນສົ່ງ” (ສາຂາຈັດສົ່ງ) ຈຶ່ງບັນທຶກໄດ້.
                    </div>
                  </div>
                ) : (
                <div className="min-h-[220px] rounded-lg border border-slate-200/50 bg-white/40 p-2 dark:border-white/10 dark:bg-white/5">
                  {manualResults.length === 0 ? (
                    <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-slate-400">
                      <FaFileInvoice className="mb-2 text-xl opacity-60" />
                      <p className="text-xs">ຄົ້ນຫາບິນໂອນ (72) ຫຼືບິນສູນບໍລິການ</p>
                    </div>
                  ) : (
                    <div className="max-h-[300px] space-y-2 overflow-y-auto">
                      {manualResults.map((bill) => {
                        const active = manualSelected?.doc_no === bill.doc_no;
                        return (
                          <button
                            key={bill.doc_no}
                            type="button"
                            onClick={() => {
                              setManualSelected(bill);
                              if (bill.scheduled_date) setManualDate(bill.scheduled_date);
                              if (bill.delivery_round_code) setManualRound(bill.delivery_round_code);
                              if (bill.delivery_route_code) setManualRoute(bill.delivery_route_code);
                              if (bill.transport_code) setManualTransport(bill.transport_code);
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                              active
                                ? "border-teal-500 bg-teal-500/10"
                                : "border-slate-200/60 bg-white/50 hover:border-teal-300 dark:border-white/10 dark:bg-white/5"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{bill.doc_no}</span>
                              <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                {bill.source_type === "odservice.tb_product"
                                  ? "ບໍລິການ"
                                  : bill.source_type === "custom"
                                  ? "ອື່ນໆ"
                                  : `ປະເພດ ${bill.source_trans_flag}`}
                              </span>
                              <span className="ml-auto text-[10px] text-slate-500">{bill.count_item} ລາຍການ</span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-500">
                              {bill.cust_name || bill.cust_code} · {bill.doc_date}
                            </p>
                            {bill.cust_area && (
                              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                                📍 {bill.cust_area}
                              </p>
                            )}
                            {(bill.scheduled_date_display || bill.delivery_round_name) && (
                              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                                ເຄີຍກຳນົດ: {bill.scheduled_date_display || "-"} {bill.delivery_round_name ? `· ${bill.delivery_round_name}` : ""}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}

                <div className="space-y-3 rounded-lg border border-slate-200/50 bg-white/40 p-3 dark:border-white/10 dark:bg-white/5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ວັນຈັດສົ່ງ</label>
                    <input
                      type="date"
                      value={manualDate}
                      min={FIXED_YEAR_START}
                      max={FIXED_YEAR_END}
                      onChange={(e) => setManualDate(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ຮອບຈັດສົ່ງ</label>
                    <select value={manualRound} onChange={(e) => setManualRound(e.target.value)} className={inputCls}>
                      <option value="">-- ເລືອກຮອບ --</option>
                      {deliveryRounds.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}{r.time_label ? ` (${r.time_label})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ສາຍທາງ</label>
                    <select value={manualRoute} onChange={(e) => setManualRoute(e.target.value)} className={inputCls}>
                      <option value="">-- ບໍ່ກຳນົດ --</option>
                      {deliveryRoutes.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      ຂົນສົ່ງ {manualMode === "custom" && <span className="text-rose-500">*</span>}
                    </label>
                    <select value={manualTransport} onChange={(e) => setManualTransport(e.target.value)} className={inputCls}>
                      <option value="">-- ບໍ່ກຳນົດ --</option>
                      {transports.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.name_1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ໝາຍເຫດ</label>
                    <textarea
                      value={manualRemark}
                      onChange={(e) => setManualRemark(e.target.value)}
                      rows={3}
                      placeholder="ບັນທຶກເພີ່ມເຕີມ..."
                      className={inputCls}
                    />
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                    ເມື່ອບັນທຶກ ບິນຈະເຂົ້າສະຖານະ “ພ້ອມຮັບ” ແລະສະແດງໃນ “ພ້ອມຈັດຖ້ຽວ”.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/20 dark:border-white/5 bg-white/30 dark:bg-white/5">
              <p className="truncate text-[11px] text-slate-500">
                {manualMode === "custom"
                  ? "ບິນອື່ນໆ: ໃສ່ຊື່ລູກຄ້າ, ລາຍການ, ຂົນສົ່ງ ແລະ ຮອບກ່ອນບັນທຶກ"
                  : manualSelected
                  ? `ເລືອກ: ${manualSelected.doc_no}`
                  : "ເລືອກບິນກ່ອນບັນທຶກ"}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={closeManualModal} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ຍົກເລີກ</button>
                <button
                  onClick={() => void (manualMode === "custom" ? saveCustomBill() : saveManualBill())}
                  disabled={
                    manualSaving ||
                    (manualMode === "custom"
                      ? !canSaveCustom
                      : !manualSelected || !manualDate || !manualRound)
                  }
                  className="px-4 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
                >
                  {manualSaving ? <FaSpinner className="animate-spin" size={10} /> : <FaCheck size={10} />}
                  ບັນທຶກ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PendingBillScheduleDialog
        open={scheduleBill !== null}
        billNo={scheduleBill?.billNo ?? null}
        initial={scheduleBill?.defaults ?? null}
        onClose={() => setScheduleBill(null)}
        onSaved={() => void fetchBills()}
      />

      <PendingBillLocationDialog
        open={locationBill !== null}
        billNo={locationBill?.billNo ?? null}
        initial={locationBill?.defaults ?? null}
        onClose={() => setLocationBill(null)}
        onSaved={() => void fetchBills()}
      />

      <StatusMenu
        billNo={statusMenu?.billNo ?? null}
        currentStatus={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.action_status ?? ""
            : ""
        }
        currentDate={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.scheduled_date ?? null
            : null
        }
        currentRoute={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.delivery_route_code ?? ""
            : ""
        }
        currentRound={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.delivery_round_code ?? ""
            : ""
        }
        currentRemark={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.schedule_remark ?? ""
            : ""
        }
        currentTransport={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.transport_code ?? ""
            : ""
        }
        routes={deliveryRoutes}
        rounds={deliveryRounds}
        transports={allBranches.length > 0 ? allBranches : transports}
        anchorEl={statusMenu?.anchor ?? null}
        onClose={() => setStatusMenu(null)}
        onSaved={() => void fetchBills()}
      />

      <RoundMenu
        billNo={roundMenu?.billNo ?? null}
        currentRound={
          roundMenu
            ? bills.find((b) => b.doc_no === roundMenu.billNo)?.delivery_round_code ?? ""
            : ""
        }
        rounds={deliveryRounds}
        anchorEl={roundMenu?.anchor ?? null}
        onClose={() => setRoundMenu(null)}
        onSaved={() => void fetchBills()}
      />

      <RouteMenu
        billNo={routeMenu?.billNo ?? null}
        currentRoute={
          routeMenu
            ? bills.find((b) => b.doc_no === routeMenu.billNo)?.delivery_route_code ?? ""
            : ""
        }
        routes={deliveryRoutes}
        anchorEl={routeMenu?.anchor ?? null}
        onClose={() => setRouteMenu(null)}
        onSaved={() => void fetchBills()}
      />

      <RowActionsMenu
        bill={rowMenu ? bills.find((b) => b.doc_no === rowMenu.billNo) ?? null : null}
        anchorEl={rowMenu?.anchor ?? null}
        onClose={() => setRowMenu(null)}
        onEditLocation={openLocationDialog}
        onSchedule={openScheduleDialog}
        onRemove={(billNo) => void removeManualBill(billNo)}
        removing={removingManualBillNo === rowMenu?.billNo}
      />

      {/* Sliding Side Drawer for Product Details & Bill Info */}
      {drawerBill && (
        <div className="fixed inset-0 z-[1200] overflow-hidden">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setDrawerBill(null)}
          />
          <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex sm:pl-16">
            <div className="w-screen max-w-xl">
              <div className="h-full flex flex-col bg-white dark:bg-[#04182a] shadow-2xl border-l border-slate-200/50 dark:border-white/5 animate-slideInRight">
                
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-teal-500/10 to-transparent border-b border-slate-200/50 dark:border-white/5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                          ລາຍລະອຽດບິນ: <span className="font-mono text-teal-600 dark:text-teal-400">{drawerBill.doc_no}</span>
                        </h2>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(drawerBill.doc_no);
                          }}
                          className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded transition-colors cursor-pointer"
                          title="ຄັດລອກເລກບິນ"
                        >
                          <FaCopy size={11} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        ສ້າງວັນທີ: {drawerBill.doc_date} · ພະແນກ: {drawerBill.department || "-"}
                      </p>
                    </div>
                    <button
                      onClick={() => setDrawerBill(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <FaTimes size={14} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 py-6 overflow-y-auto px-6 space-y-6">
                  
                  {/* Customer Info Card */}
                  <div className="bg-slate-500/[0.03] dark:bg-white/[0.015] border border-slate-200/50 dark:border-white/5 rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FaTruck size={12} className="text-teal-600 dark:text-teal-400" />
                      ຂໍ້ມູນລູກຄ້າ & ການຂົນສົ່ງ
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                      <div className="col-span-2">
                        <span className="text-slate-400 block mb-0.5">ເລກບິນ</span>
                        <span className="font-mono font-bold text-teal-700 dark:text-teal-400">{drawerBill.doc_no}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">ລະຫັດລູກຄ້າ</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{drawerBill.cust_code || "-"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">ສາຍສົ່ງ / ສາຂາ</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <FaTruck size={10} className="text-slate-400 shrink-0" />
                          {drawerBill.transport || "-"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block mb-0.5">ຊື່ລູກຄ້າ</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 break-words leading-snug">
                          {drawerBill.transport_name || "-"}
                        </span>
                      </div>
                      {drawerBill.cust_name && drawerBill.cust_name !== drawerBill.transport_name && (
                        <div className="col-span-2">
                          <span className="text-slate-400 block mb-0.5">ຊື່ລົງທະບຽນ (ລະບົບ)</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 break-words leading-snug">
                            {drawerBill.cust_name}
                          </span>
                        </div>
                      )}
                      {drawerBill.cust_area && (
                        <div className="col-span-2">
                          <span className="text-slate-400 block mb-0.5">ທີ່ຢູ່ (ບ້ານ · ເມືອງ · ແຂວງ)</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 break-words leading-snug flex items-start gap-1">
                            <FaMapMarkerAlt size={10} className="mt-1 shrink-0 text-slate-400" />
                            {drawerBill.cust_area}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400 block mb-0.5">ເບີໂທຮ້ານຄ້າ</span>
                        {drawerBill.cust_phone ? (
                          <a
                            href={`tel:${drawerBill.cust_phone}`}
                            className="font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1 hover:underline break-all"
                          >
                            <FaPhone size={10} className="text-slate-400 shrink-0" />
                            {drawerBill.cust_phone}
                          </a>
                        ) : (
                          <span className="font-semibold text-slate-400">-</span>
                        )}
                        {(drawerBill.cust_phone || drawerBill.cust_line) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {drawerBill.cust_phone && (
                              <a
                                href={whatsappUrl(drawerBill.cust_phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-500/20 dark:text-green-400 transition-colors"
                              >
                                <FaWhatsapp size={11} /> WhatsApp
                              </a>
                            )}
                            {drawerBill.cust_line && (
                              <button
                                type="button"
                                onClick={() => sendLine(drawerBill.doc_no, "customer")}
                                disabled={sendingLine === `${drawerBill.doc_no}:customer`}
                                className="inline-flex items-center gap-1 rounded-md bg-[#06C755]/10 px-2 py-1 text-[10px] font-semibold text-[#06C755] hover:bg-[#06C755]/20 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {sendingLine === `${drawerBill.doc_no}:customer` ? <FaSpinner size={11} className="animate-spin" /> : <FaLine size={11} />}
                                ສົ່ງ LINE
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">ເບີໂທພະນັກງານຂາຍ</span>
                        {drawerBill.salesperson_phone ? (
                          <a
                            href={`tel:${drawerBill.salesperson_phone}`}
                            className="font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1 hover:underline break-all"
                          >
                            <FaPhone size={10} className="text-slate-400 shrink-0" />
                            {drawerBill.salesperson_phone}
                          </a>
                        ) : (
                          <span className="font-semibold text-slate-400">-</span>
                        )}
                        {(drawerBill.salesperson_phone || drawerBill.salesperson_line) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {drawerBill.salesperson_phone && (
                              <a
                                href={whatsappUrl(drawerBill.salesperson_phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-500/20 dark:text-green-400 transition-colors"
                              >
                                <FaWhatsapp size={11} /> WhatsApp
                              </a>
                            )}
                            {drawerBill.salesperson_line && (
                              <button
                                type="button"
                                onClick={() => sendLine(drawerBill.doc_no, "salesperson")}
                                disabled={sendingLine === `${drawerBill.doc_no}:salesperson`}
                                className="inline-flex items-center gap-1 rounded-md bg-[#06C755]/10 px-2 py-1 text-[10px] font-semibold text-[#06C755] hover:bg-[#06C755]/20 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {sendingLine === `${drawerBill.doc_no}:salesperson` ? <FaSpinner size={11} className="animate-spin" /> : <FaLine size={11} />}
                                ສົ່ງ LINE
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {drawerBill.sales_remark && (
                        <div className="col-span-2 border-t border-slate-200/50 pt-2 dark:border-white/5">
                          <span className="text-slate-400 block mb-1">ໝາຍເຫດບິນຂາຍ</span>
                          <p className="rounded-lg border border-amber-500/15 bg-amber-500/10 p-2.5 text-[11px] font-medium leading-relaxed text-amber-800 dark:text-amber-300">
                            {drawerBill.sales_remark}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cancelled-delivery details */}
                  {drawerBill.cancelled_delivery && (
                    <div className="bg-rose-500/[0.04] border border-rose-300/50 dark:border-rose-800/50 rounded-xl p-4 space-y-3">
                      <h3 className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FaTimes size={12} /> ຍົກເລີກຈັດສົ່ງ
                        {(drawerBill.cancelled_secs_ago ?? 0) > 0 && (
                          <span className="ml-auto text-[10px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                            ⏱ ຍົກເລີກມາ <LiveElapsed baseSecs={drawerBill.cancelled_secs_ago ?? 0} />
                          </span>
                        )}
                      </h3>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div>
                          <span className="text-slate-400 block mb-0.5">ເລກຖ່ຽວລົດ</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{drawerBill.cancelled_delivery_job || "-"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">ຜູ່ຈັດສົ່ງ</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 break-words leading-snug">
                            {drawerBill.cancelled_delivery_driver || "-"}
                            {drawerBill.cancelled_delivery_car ? ` · ${drawerBill.cancelled_delivery_car}` : ""}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-400 block mb-0.5">ເວລາຍົກເລີກ</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{drawerBill.cancelled_delivery_at || "-"}</span>
                        </div>
                        {drawerBill.cancelled_delivery_remark && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block mb-0.5">ໝາຍເຫດ</span>
                            <p className="text-[11px] italic text-rose-700/90 dark:text-rose-300/90 bg-rose-500/5 border border-rose-500/10 rounded-lg p-2">&quot;{drawerBill.cancelled_delivery_remark}&quot;</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Flow Status & Planning */}
                  <div className="bg-slate-500/[0.03] dark:bg-white/[0.015] border border-slate-200/50 dark:border-white/5 rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FaClock size={12} className="text-teal-600 dark:text-teal-400" />
                      ສະຖານະ ແລະ ແຜນຈັດສົ່ງ
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Action status */}
                      <div className="col-span-2">
                        <span className="text-slate-400 block mb-1 text-xs">ສະຖານະການຕິດຕໍ່</span>
                        <button
                          type="button"
                          onClick={(e) => setStatusMenu({ billNo: drawerBill.doc_no, anchor: e.currentTarget })}
                          className="w-full flex items-center justify-between rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-white/5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-500 dark:hover:border-teal-400 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              drawerBill.action_status === "contacted_ready" ? "bg-emerald-500" :
                              drawerBill.action_status === "contact_failed" ? "bg-rose-500" :
                              drawerBill.action_status === "customer_postponed" ? "bg-amber-500" :
                              drawerBill.action_status === "delivery_scheduled" ? "bg-sky-500" :
                              "bg-slate-400"
                            }`} />
                            {drawerBill.action_status ? ACTION_STATUS_MAP[drawerBill.action_status]?.label : "ຍັງບໍ່ໄດ້ຕິດຕໍ່"}
                          </span>
                          <FaChevronDown size={8} className="opacity-60" />
                        </button>
                      </div>

                      {/* Scheduled Date */}
                      <div>
                        <span className="text-slate-400 block mb-1 text-xs">ວັນຮັບສິນຄ້າ</span>
                        <button
                          type="button"
                          onClick={() => openScheduleDialog(drawerBill)}
                          className={`w-full flex items-center justify-between rounded-lg border bg-white/40 dark:bg-white/5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                            (drawerBill.reschedule_count ?? 0) > RESCHEDULE_RED_THRESHOLD
                              ? "border-rose-400/60 dark:border-rose-500/50 text-rose-700 dark:text-rose-400 hover:border-rose-500"
                              : "border-slate-200/50 dark:border-white/5 text-slate-700 dark:text-slate-200 hover:border-teal-500 dark:hover:border-teal-400"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <FaCalendar size={10} className="text-slate-400" />
                            {drawerBill.scheduled_date_display || "ກຳນົດວັນຮັບ"}
                          </span>
                          <FaChevronDown size={8} className="opacity-60" />
                        </button>
                        {(drawerBill.reschedule_count ?? 0) > RESCHEDULE_RED_THRESHOLD && (
                          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                            <FaExclamationTriangle size={11} className="shrink-0" />
                            ປ່ຽນວັນຮັບແລ້ວ {drawerBill.reschedule_count} ເທື່ອ — ກວດສອບກັບລູກຄ້າ
                          </div>
                        )}
                      </div>

                      {/* Delivery Round */}
                      <div>
                        <span className="text-slate-400 block mb-1 text-xs">ຮອບຈັດສົ່ງ</span>
                        <button
                          type="button"
                          onClick={(e) => setRoundMenu({ billNo: drawerBill.doc_no, anchor: e.currentTarget })}
                          className="w-full flex items-center justify-between rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-white/5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-500 dark:hover:border-teal-400 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <FaClock size={10} className="text-slate-400" />
                            {drawerBill.delivery_round_code
                              ? deliveryRounds.find((r) => r.code === drawerBill.delivery_round_code)?.name ?? drawerBill.delivery_round_code
                              : "ເລືອກຮອບສົ່ງ"}
                          </span>
                          <FaChevronDown size={8} className="opacity-60" />
                        </button>
                      </div>

                      {/* Delivery Route */}
                      <div className="col-span-2">
                        <span className="text-slate-400 block mb-1 text-xs">ເສັ້ນທາງຈັດສົ່ງ</span>
                        <button
                          type="button"
                          onClick={(e) => setRouteMenu({ billNo: drawerBill.doc_no, anchor: e.currentTarget })}
                          className="w-full flex items-center justify-between rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-white/5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-500 dark:hover:border-teal-400 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <FaRoute size={10} className="text-slate-400" />
                            {drawerBill.delivery_route_code
                              ? deliveryRoutes.find((r) => r.code === drawerBill.delivery_route_code)?.name ?? drawerBill.delivery_route_code
                              : "ເລືອກເສັ້ນທາງ"}
                          </span>
                          <FaChevronDown size={8} className="opacity-60" />
                        </button>
                      </div>
                    </div>

                    {/* Remarks / Log */}
                    {drawerBill.schedule_remark && (
                      <div className="border-t border-slate-200/50 dark:border-white/5 pt-3">
                        <span className="text-slate-400 block mb-1 text-xs">ໝາຍເຫດການວາງແຜນ</span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5">
                          "{drawerBill.schedule_remark}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ປະຫວັດການສົ່ງ — ບິນທີ່ທະຍອຍສົ່ງຫຼາຍຮອບ */}
                  {deliveryHistory && deliveryHistory.rounds.length > 0 && (
                    <div className="bg-slate-500/[0.03] dark:bg-white/[0.015] border border-slate-200/50 dark:border-white/5 rounded-xl p-4 space-y-3">
                      <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FaTruck size={12} className="text-teal-600 dark:text-teal-400" />
                        ປະຫວັດການສົ່ງ ({deliveryHistory.rounds.length} ຮອບ)
                      </h3>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          ສັ່ງ{" "}
                          <b className="text-slate-700 dark:text-slate-200">
                            {deliveryHistory.ordered.toLocaleString()}
                          </b>
                        </span>
                        <span>
                          ສົ່ງແລ້ວ{" "}
                          <b className="text-teal-600 dark:text-teal-400">
                            {deliveryHistory.delivered.toLocaleString()}
                          </b>
                        </span>
                        <span>
                          ຍັງເຫຼືອ{" "}
                          <b className="text-amber-600 dark:text-amber-400">
                            {deliveryHistory.remaining.toLocaleString()}
                          </b>
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {deliveryHistory.rounds.map((round) => (
                          <div
                            key={round.doc_no}
                            className="flex items-start gap-2.5 rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-white/5 px-2.5 py-1.5"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600/10 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                              {round.round}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                {round.day} · {round.driver}
                                {round.car !== "-" && ` · ${round.car}`}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">
                                ຖ້ຽວ {round.doc_no}
                                {round.closed_at && ` · ປິດ ${round.closed_at}`}
                                {round.remark && ` · ${round.remark}`}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                {round.delivered.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                ຂຶ້ນລົດ {round.loaded.toLocaleString()}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 self-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                round.status === 1
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : round.status === 2
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              }`}
                            >
                              {round.status === 1
                                ? "ສຳເລັດ"
                                : round.status === 2
                                  ? "ຍົກເລີກ"
                                  : "ກຳລັງສົ່ງ"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Schedule change history */}
                  <div className="bg-slate-500/[0.03] dark:bg-white/[0.015] border border-slate-200/50 dark:border-white/5 rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FaClock size={12} className="text-teal-600 dark:text-teal-400" />
                      ປະຫວັດການປ່ຽນວັນຈັດສົ່ງ
                    </h3>
                    {historyLoading ? (
                      <p className="flex items-center gap-2 text-xs text-slate-400">
                        <FaSpinner className="animate-spin" size={11} /> ກຳລັງໂຫຼດ...
                      </p>
                    ) : scheduleHistory.length === 0 ? (
                      <p className="text-xs text-slate-400">ຍັງບໍ່ມີປະຫວັດການປ່ຽນແປງ</p>
                    ) : (
                      <ol className="space-y-3">
                        {scheduleHistory.map((h, idx) => {
                          const meta = h.action_status ? ACTION_STATUS_MAP[h.action_status] : null;
                          return (
                            <li key={idx} className="relative pl-4 border-l-2 border-teal-500/30">
                              <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-teal-500" />
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                  <FaCalendar size={9} className="inline mr-1 text-slate-400" />
                                  {h.scheduled_date_display || "—"}
                                </span>
                                {meta && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300">
                                    {meta.label}
                                  </span>
                                )}
                              </div>
                              {h.remark && (
                                <p className="mt-0.5 text-[11px] italic text-slate-500 dark:text-slate-400">&quot;{h.remark}&quot;</p>
                              )}
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                {h.changed_at}{h.changed_by ? ` · ${h.changed_by}` : ""}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>

                  {/* Products Table inside Drawer */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FaBox size={12} className="text-teal-600 dark:text-teal-400" />
                        ລາຍການສິນຄ້າ
                      </h3>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-400">
                        ເຫຼືອ {fmtQty(drawerBill.remaining_qty_total)} ໜ່ວຍ
                      </span>
                    </div>

                    {/* Partial-delivery breakdown: total ordered / already sent / remaining */}
                    {drawerBill.partial_delivery && (drawerBill.total_qty_total ?? 0) > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-slate-500/5 border border-slate-200/50 dark:border-white/5 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wide">ທັງໝົດ</p>
                          <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{fmtQty(drawerBill.total_qty_total ?? 0)}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-wide">ສົ່ງແລ້ວ</p>
                          <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{fmtQty(drawerBill.delivered_qty_total ?? 0)}</p>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wide">ຄົງເຫຼືອ</p>
                          <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">{fmtQty(drawerBill.remaining_qty_total)}</p>
                        </div>
                      </div>
                    )}

                    {loadingDoc === drawerBill.doc_no ? (
                      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-12">
                        <FaSpinner className="animate-spin" size={14} /> ກຳລັງໂຫຼດລາຍການສິນຄ້າ...
                      </div>
                    ) : productsByDoc[drawerBill.doc_no]?.length === 0 ? (
                      <div className="flex flex-col items-center py-12 text-slate-400 border border-dashed border-slate-200 dark:border-white/5 rounded-xl">
                        <FaBoxOpen size={24} className="mb-2 opacity-50" />
                        <p className="text-xs">ບໍ່ມີສິນຄ້າໃນບິນນີ້</p>
                      </div>
                    ) : (
                      <div className="border border-slate-200/50 dark:border-white/5 rounded-xl overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-500/[0.02] dark:bg-white/[0.01] border-b border-slate-200/50 dark:border-white/5 text-slate-400 text-[10px] uppercase font-bold">
                            <tr>
                              <th className="py-2.5 pl-4 pr-1 w-8">#</th>
                              <th className="py-2.5 px-2">ລະຫັດ</th>
                              <th className="py-2.5 px-2">ຊື່ສິນຄ້າ</th>
                              <th className="py-2.5 px-2 text-right">ຈຳນວນ</th>
                              <th className="py-2.5 pl-2 pr-4">ໜ່ວຍ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/40 dark:divide-white/[0.03]">
                            {(productsByDoc[drawerBill.doc_no] ?? []).map((p, pi) => (
                              <tr key={`${drawerBill.doc_no}-${p.item_code}-${pi}`} className="hover:bg-slate-500/[0.02] dark:hover:bg-white/[0.01]">
                                <td className="py-2 pl-4 pr-1 text-slate-400">{pi + 1}</td>
                                <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{p.item_code}</td>
                                <td className="py-2 px-2 text-slate-700 dark:text-slate-200 font-semibold">{p.item_name}</td>
                                <td className="py-2 px-2 text-right">
                                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    {p.qty}
                                  </span>
                                </td>
                                <td className="py-2 pl-2 pr-4 text-slate-400">{p.unit_code}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Chatter — discussion / internal notes on this bill */}
                  <Chatter model="bill" recordId={drawerBill.doc_no} />
                </div>

                {/* Footer buttons: print QR + set delivery point */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-white/[0.01] border-t border-slate-200/50 dark:border-white/5 flex gap-2">
                  <BillLocationActions bill={drawerBill} variant="drawer" onEdit={openLocationDialog} />
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {detailBill && (
        <BillItemsModal
          billNo={detailBill.billNo}
          custName={detailBill.custName}
          onClose={() => setDetailBill(null)}
        />
      )}
    </div>
  );
}

// ເມນູ "⋯" ຂອງແຖວ — ເກັບຄຳສັ່ງລອງ (ຈຸດຈັດສົ່ງ / QR / ວັນຮັບ / ລົບ) ໄວ້ບ່ອນດຽວ
// ຈຶ່ງເຫຼືອປຸ່ມຫຼັກອັນດຽວຢູ່ໜ້າຕາຕະລາງ.
function RowActionsMenu({
  bill,
  anchorEl,
  onClose,
  onEditLocation,
  onSchedule,
  onRemove,
  removing,
}: {
  bill: Bill | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onEditLocation: (bill: Bill) => void;
  onSchedule: (bill: Bill) => void;
  onRemove: (billNo: string) => void;
  removing: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const open = bill !== null && anchorEl !== null;

  useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const w = 230;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.right - w));
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, anchorEl, onClose]);

  if (!open || !pos || !bill) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[1300] w-[230px] overflow-hidden rounded-lg border border-slate-200/40 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#062338]"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        type="button"
        onClick={() => { onSchedule(bill); onClose(); }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
      >
        <FaCalendar size={10} className="shrink-0 text-slate-400" />
        ກຳນົດ / ປ່ຽນວັນຮັບ
      </button>
      <BillLocationActions bill={bill} variant="menu" onEdit={onEditLocation} onDone={onClose} />
      {bill.manual_pending_bill && (
        <button
          type="button"
          disabled={removing}
          onClick={() => { onRemove(bill.doc_no); onClose(); }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
        >
          {removing ? <FaSpinner size={10} className="shrink-0 animate-spin" /> : <FaTrash size={10} className="shrink-0" />}
          {bill.parent_bill_no ? "ຄືນໃຫ້ບິນແມ່ (ສາຂາຕົ້ນທາງຈັດເອງ)" : "ລົບອອກຈາກລາຍການ"}
        </button>
      )}
    </div>
  );
}

function RouteMenu({
  billNo,
  currentRoute,
  routes,
  anchorEl,
  onClose,
  onSaved,
}: {
  billNo: string | null;
  currentRoute: string;
  routes: DeliveryRoute[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const open = billNo !== null && anchorEl !== null;

  useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const w = 340;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left));
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, anchorEl, onClose]);

  const apply = async (routeCode: string | null) => {
    if (!billNo) return;
    setSaving(true);
    try {
      await Actions.upsertPendingBillSchedule({
        bill_no: billNo,
        delivery_route_code: routeCode,
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !pos) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[1300] w-[min(340px,calc(100vw-16px))] overflow-hidden rounded-lg border border-slate-200/40 bg-white shadow-xl dark:border-white/10 dark:bg-[#062338]"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between border-b border-slate-200/30 bg-white/70 px-3 py-2 dark:border-white/5 dark:bg-white/5">
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
          ກຳນົດເສັ້ນທາງຂົນສົ່ງ
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
        >
          <FaTimes size={9} />
        </button>
      </div>
      <div className="max-h-[320px] space-y-1 overflow-y-auto p-2">
        {routes.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-slate-400">
            ບໍ່ມີເສັ້ນທາງ ກະລຸນາຕັ້ງຄ່າທີ່ /manage/delivery-routes
          </p>
        ) : (
          routes.map((r) => {
            const active = currentRoute === r.code;
            const path = formatRoutePath(r);
            return (
              <button
                key={r.code}
                type="button"
                disabled={saving}
                onClick={() => apply(r.code)}
                className={`w-full rounded px-2.5 py-2 text-left text-[11px] transition-colors ${
                  active
                    ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-400"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  <FaRoute size={10} className="shrink-0 text-teal-600 dark:text-teal-400" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  {active && <FaCheck size={9} className="shrink-0" />}
                </span>
                {path && (
                  <span className="mt-1 block truncate pl-5 text-[10px] text-slate-400">
                    {path}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      {currentRoute && (
        <div className="border-t border-slate-200/30 bg-white/50 px-3 py-2 dark:border-white/5 dark:bg-white/5">
          <button
            type="button"
            disabled={saving}
            onClick={() => apply(null)}
            className="w-full rounded px-2 py-1.5 text-[11px] text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
          >
            <FaTrash className="mr-1.5 inline" size={9} />
            ລ້າງເສັ້ນທາງ
          </button>
        </div>
      )}
    </div>
  );
}

function RoundMenu({
  billNo,
  currentRound,
  rounds,
  anchorEl,
  onClose,
  onSaved,
}: {
  billNo: string | null;
  currentRound: string;
  rounds: DeliveryRound[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const open = billNo !== null && anchorEl !== null;

  useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const w = 240;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left));
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, anchorEl, onClose]);

  const apply = async (roundCode: string | null) => {
    if (!billNo) return;
    setSaving(true);
    try {
      await Actions.upsertPendingBillSchedule({
        bill_no: billNo,
        delivery_round_code: roundCode,
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !pos) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[1300] w-[240px] glass rounded-lg shadow-xl border border-slate-200/40 dark:border-white/10 overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-3 py-2 bg-white/40 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
          ກຳນົດຮອບສົ່ງ
        </p>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
        >
          <FaTimes size={9} />
        </button>
      </div>
      <div className="p-2 space-y-1 max-h-[260px] overflow-y-auto">
        {rounds.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-slate-400">ບໍ່ມີຮອບສົ່ງ</p>
        ) : (
          rounds.map((r) => {
            const active = currentRound === r.code;
            return (
              <button
                key={r.code}
                type="button"
                disabled={saving}
                onClick={() => apply(r.code)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
                  active
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40"
                    : "text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="flex-1 truncate">{r.name}</span>
                {r.time_label && (
                  <span className="text-[9px] text-slate-400">{r.time_label}</span>
                )}
                {active && <FaCheck size={9} />}
              </button>
            );
          })
        )}
      </div>
      {currentRound && (
        <div className="px-3 py-2 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5">
          <button
            type="button"
            disabled={saving}
            onClick={() => apply(null)}
            className="w-full px-2 py-1.5 rounded text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
          >
            <FaTrash className="inline mr-1.5" size={9} />
            ລ້າງຮອບ
          </button>
        </div>
      )}
    </div>
  );
}

function StatusMenu({
  billNo,
  currentStatus,
  currentDate,
  currentRoute,
  currentRound,
  currentRemark,
  currentTransport,
  routes,
  rounds,
  transports,
  anchorEl,
  onClose,
  onSaved,
}: {
  billNo: string | null;
  currentStatus: string;
  currentDate: string | null;
  currentRoute: string;
  currentRound: string;
  currentRemark: string;
  currentTransport: string;
  routes: DeliveryRoute[];
  rounds: DeliveryRound[];
  transports: Transport[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pickedStatus, setPickedStatus] = useState<string>("");
  const [pickedDate, setPickedDate] = useState<string>("");
  const [pickedRoute, setPickedRoute] = useState<string>("");
  const [pickedRound, setPickedRound] = useState<string>("");
  const [pickedTransport, setPickedTransport] = useState<string>("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = billNo !== null && anchorEl !== null;
  const todayForPlan = getFixedTodayDate();
  const tomorrowForPlan = addDaysInFixedYear(todayForPlan, 1);
  // ປະຕິທິນຂອງ "ຕາຕະລາງການຈັດສົ່ງ" — ເປີດໃຫ້ອັດຕະໂນມັດພໍກົດເລືອກສະຖານະ
  const scheduleDateRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPickedStatus(currentStatus ?? "");
    setPickedDate(currentDate ?? "");
    setPickedRoute(currentRoute ?? "");
    setPickedRound(currentRound ?? "");
    setPickedTransport(currentTransport ?? "");
    setRemark(currentRemark ?? "");
    setError(null);
  }, [open, currentStatus, currentDate, currentRoute, currentRound, currentRemark, currentTransport]);

  useEffect(() => {
    if (!open || pickedStatus !== "contacted_ready") return;
    setPickedDate((v) => v || todayForPlan);
  }, [open, pickedStatus, todayForPlan]);

  // ຕາຕະລາງການຈັດສົ່ງ: ຄ່າເລີ່ມຕົ້ນ = ມື້ຕໍ່ໄປ (ເຄື່ອງຕ່າງແຂວງ / ເຄື່ອງລູກຄ້າ
  // ນັດສົ່ງມື້ອື່ນ) ແລ້ວເດັ້ງປະຕິທິນຂຶ້ນມາໃຫ້ເລືອກທັນທີ.
  useEffect(() => {
    if (!open || pickedStatus !== "delivery_scheduled") return;
    setPickedDate((v) => v || tomorrowForPlan);
    const input = scheduleDateRef.current;
    if (!input) return;
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // showPicker() ຕ້ອງການ user activation — ຖ້າ browser ບໍ່ຍອມ ກໍກົດເອງໄດ້
    }
  }, [open, pickedStatus, tomorrowForPlan]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const save = async (clear = false) => {
    if (!billNo) return;
    if (!clear && pickedStatus === "contacted_ready") {
      if (!pickedDate) {
        setError("ກະລຸນາເລືອກວັນຮັບ");
        return;
      }
      if (!pickedRoute) {
        setError("ກະລຸນາເລືອກເສັ້ນທາງ");
        return;
      }
      if (!pickedRound) {
        setError("ກະລຸນາເລືອກຮອບສົ່ງ");
        return;
      }
    }
    // ຕາຕະລາງການຈັດສົ່ງ ຕ້ອງການພຽງວັນທີ — ເສັ້ນທາງ/ຮອບ ຄ່ອຍຕື່ມຕອນປ່ຽນເປັນ ພ້ອມຮັບ
    if (!clear && pickedStatus === "delivery_scheduled" && !pickedDate) {
      setError("ກະລຸນາເລືອກວັນທີຈັດສົ່ງ");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await Actions.upsertPendingBillSchedule({
        bill_no: billNo,
        action_status: clear ? null : pickedStatus || null,
        scheduled_date:
          !clear && (pickedStatus === "contacted_ready" || pickedStatus === "delivery_scheduled")
            ? pickedDate
            : undefined,
        delivery_route_code: !clear && pickedStatus === "contacted_ready" ? pickedRoute : undefined,
        delivery_round_code: !clear && pickedStatus === "contacted_ready" ? pickedRound : undefined,
        transport_code: !clear && pickedStatus === "contacted_ready" ? (pickedTransport || null) : undefined,
        remark: clear ? null : remark.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ປິດ"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-modal-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-2xl dark:border-white/10 dark:bg-[#062338]"
      >
      <div className="px-4 py-3 bg-white/80 dark:bg-white/5 border-b border-slate-200/60 dark:border-white/5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            ບັນທຶກຜົນຕິດຕໍ່
          </p>
          <p id="status-modal-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">
            ສະຖານະບິນ {billNo}
          </p>
        </div>
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-100 flex items-center justify-center"
        >
          <FaTimes size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          ສະຖານະການຕິດຕໍ່ / ເຫດຜົນ
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => setPickedStatus("")}
          className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
            !pickedStatus
              ? "bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/40"
              : "text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          ບໍ່ຕິດຕໍ່
          {!pickedStatus && <FaCheck size={9} className="ml-auto" />}
        </button>
        {ACTION_STATUSES.map((s) => {
          const active = pickedStatus === s.key;
          const activeClass: Record<string, string> = {
            rose: "bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/40",
            amber: "bg-amber-500/15 text-amber-800 dark:text-amber-400 ring-1 ring-amber-500/40",
            slate: "bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/40",
            emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40",
            sky: "bg-sky-500/15 text-sky-700 dark:text-sky-400 ring-1 ring-sky-500/40",
          };
          const dotClass: Record<string, string> = {
            rose: "bg-rose-500",
            amber: "bg-amber-500",
            slate: "bg-slate-500",
            emerald: "bg-emerald-500",
            sky: "bg-sky-500",
          };
          return (
            <button
              key={s.key}
              type="button"
              disabled={saving}
              onClick={() => setPickedStatus(s.key)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
                active
                  ? activeClass[s.color] ?? activeClass.slate
                  : "text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${dotClass[s.color] ?? dotClass.slate}`} />
              {s.label}
              {active && <FaCheck size={9} className="ml-auto" />}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-3 pb-3 border-t border-slate-200/60 dark:border-white/5">
        {pickedStatus === "delivery_scheduled" && (
          <div className="mb-2 rounded-lg border border-sky-500/20 bg-sky-500/10 p-2 space-y-2">
            <p className="text-[10px] font-semibold text-sky-700 dark:text-sky-400">
              ຕາຕະລາງການຈັດສົ່ງ · ນັດວັນສົ່ງລ່ວງໜ້າ (ເຄື່ອງຕ່າງແຂວງ / ເຄື່ອງລູກຄ້າ)
            </p>
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <FaCalendar className="inline mr-1" size={9} /> ວັນທີຈັດສົ່ງ
              </span>
              <input
                ref={scheduleDateRef}
                type="date"
                value={pickedDate}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(e) => setPickedDate(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {
                    // ບາງ browser ບໍ່ຮອງຮັບ showPicker — ກົດໄອຄອນປະຕິທິນເອງໄດ້
                  }
                }}
                disabled={saving}
                className="w-full glass-input rounded-md px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {[
                { label: "ມື້ນີ້", value: todayForPlan },
                { label: "ມື້ອື່ນ", value: tomorrowForPlan },
                { label: "ມະຮືນ", value: addDaysInFixedYear(todayForPlan, 2) },
              ].map((q) => (
                <button
                  key={q.value}
                  type="button"
                  disabled={saving}
                  onClick={() => setPickedDate(q.value)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    pickedDate === q.value
                      ? "bg-sky-500 text-white"
                      : "bg-white/60 text-sky-700 hover:bg-white dark:bg-white/10 dark:text-sky-300 dark:hover:bg-white/20"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              ບັນທຶກແລ້ວບິນຈະໄປຢູ່ຂັ້ນ &quot;ຍັງບໍ່ຮອດວັນສົ່ງ&quot; ຈົນຮອດວັນນັດ — ພໍຮອດວັນ
              ຄ່ອຍປ່ຽນເປັນ &quot;ພ້ອມຮັບ&quot; ເພື່ອຕື່ມເສັ້ນທາງ ແລະ ຮອບສົ່ງ.
            </p>
          </div>
        )}
        {pickedStatus === "contacted_ready" && (
          <div className="mb-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 space-y-2">
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              ວາງແຜນສົ່ງ
            </p>
            <div className="grid grid-cols-1 gap-2">
              <label className="block">
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  <FaCalendar className="inline mr-1" size={9} /> ວັນຮັບ
                </span>
                <input
                  type="date"
                  value={pickedDate}
                  min={FIXED_YEAR_START}
                  max={FIXED_YEAR_END}
                  onChange={(e) => setPickedDate(e.target.value)}
                  disabled={saving}
                  className="w-full glass-input rounded-md px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  <FaRoute className="inline mr-1" size={9} /> ເສັ້ນທາງ
                </span>
                <select
                  value={pickedRoute}
                  onChange={(e) => setPickedRoute(e.target.value)}
                  disabled={saving}
                  className="w-full glass-input rounded-md px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200"
                >
                  <option value="">— ເລືອກເສັ້ນທາງ —</option>
                  {routes.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                      {formatRoutePath(r) ? ` · ${formatRoutePath(r)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  <FaClock className="inline mr-1" size={9} /> ຮອບສົ່ງ
                </span>
                <select
                  value={pickedRound}
                  onChange={(e) => setPickedRound(e.target.value)}
                  disabled={saving}
                  className="w-full glass-input rounded-md px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200"
                >
                  <option value="">— ເລືອກຮອບ —</option>
                  {rounds.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                      {r.time_label ? ` · ${r.time_label}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  <FaTruck className="inline mr-1" size={9} /> ຂົນສົ່ງ
                </span>
                <select
                  value={pickedTransport}
                  onChange={(e) => setPickedTransport(e.target.value)}
                  disabled={saving}
                  className="w-full glass-input rounded-md px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200"
                >
                  <option value="">— ຄ່າເລີ່ມຕົ້ນ —</option>
                  {transports.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name_1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          <FaStickyNote className="inline mr-1" size={9} /> ໝາຍເຫດ
        </label>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          rows={2}
          placeholder="ເຫດຜົນ ຫຼື ບັນທຶກສ້ວນ..."
          className="w-full glass-input rounded-md px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200 resize-none"
        />
        {error && (
          <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/80 dark:bg-white/5 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={saving || (!currentStatus && !currentRemark)}
          onClick={() => void save(true)}
          className="px-3 py-2 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 inline-flex items-center gap-1"
          title="ລ້າງສະຖານະ + ໝາຍເຫດ"
        >
          <FaTrash size={8} /> ລ້າງ
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving ? <FaSpinner className="animate-spin" size={9} /> : <FaCheck size={9} />}
          ບັນທຶກ
        </button>
      </div>
      </section>
    </div>
  );
}

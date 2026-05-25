"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaBox,
  FaBoxOpen,
  FaCalendar,
  FaCheck,
  FaCheckSquare,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFileInvoice,
  FaMapMarkerAlt,
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
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusStatGrid } from "@/components/status-page-shell";
import {
  PendingBillScheduleDialog,
  type PendingScheduleDefaults,
} from "@/components/pending-bill-schedule-dialog";
import {
  PendingBillLocationDialog,
  type PendingLocationDefaults,
} from "@/components/pending-bill-location-dialog";
import { BillTodoPopover } from "@/components/bill-todo-popover";
import { printBillLocationQr } from "@/lib/print-bill-location-qr";
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
  time_open: string;
  time_use: TimeUse | null;
  remaining_count: number;
  remaining_qty_total: number;
  partial_delivery?: boolean;
  scheduled_date?: string | null;
  scheduled_date_display?: string | null;
  scheduled_date_overridden?: boolean;
  schedule_remark?: string;
  action_status?: string;
  delivery_route_code?: string;
  delivery_round_code?: string;
  schedule_updated_at?: string | null;
  schedule_updated_by?: string;
  cancelled_delivery?: boolean;
  cancelled_delivery_job?: string;
  cancelled_delivery_at?: string | null;
  cancelled_delivery_remark?: string;
  manual_pending_bill?: boolean;
  source_trans_flag?: number;
  source_type?: string;
  todo_pending_count?: number;
  todo_done_count?: number;
  todo_earliest_deadline?: string | null;
  todo_earliest_deadline_display?: string | null;
  planned_lat?: string | null;
  planned_lng?: string | null;
  cust_code?: string | null;
  cust_name?: string | null;
  cust_lat?: string | null;
  cust_lng?: string | null;
  source_format?: string;
  is_pos_settled?: boolean;
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

// Flat state model — action_status combines contact result + reason:
//   ຍັງບໍ່ເຖິງເວລາ uses send_date more than 3 days from today.
//   ຕ້ອງໂທຫາລູກຄ້າ uses missing/overdue/today/tomorrow scheduled_date.
//     ├── ບໍ່ຕິດຕໍ່             (action_status = null)
//     ├── ພະນັກງານຂາຍຍັງບໍ່ແຈ້ງ  (action_status = "sales_not_notified")
//     ├── ຕິດຕໍ່ບໍ່ໄດ້           (action_status = "contact_failed")
//     ├── ລູກຄ້າເລື່ອນວັນຮັບ     (action_status = "customer_postponed")
//     ├── ລູກຄ້າປະຕິເສດ/ຍົກເລີກ (action_status = "customer_cancelled")
//     └── ພ້ອມຮັບ              (action_status = "contacted_ready")
const ACTION_STATUSES = [
  { key: "sales_not_notified", label: "ພະນັກງານຂາຍຍັງບໍ່ແຈ້ງ", color: "slate" },
  { key: "contact_failed", label: "ຕິດຕໍ່ບໍ່ໄດ້", color: "rose" },
  { key: "customer_postponed", label: "ລູກຄ້າເລື່ອນວັນຮັບ", color: "amber" },
  { key: "customer_cancelled", label: "ລູກຄ້າປະຕິເສດ/ຍົກເລີກ", color: "slate" },
  { key: "contacted_ready", label: "ພ້ອມຮັບ", color: "emerald" },
] as const;

const ACTION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  sales_not_notified: { label: "ພະນັກງານຂາຍຍັງບໍ່ແຈ້ງ", color: "slate" },
  contact_failed: { label: "ຕິດຕໍ່ບໍ່ໄດ້", color: "rose" },
  customer_postponed: { label: "ລູກຄ້າເລື່ອນວັນຮັບ", color: "amber" },
  customer_cancelled: { label: "ລູກຄ້າປະຕິເສດ/ຍົກເລີກ", color: "slate" },
  contacted_ready: { label: "ພ້ອມຮັບ", color: "emerald" },
};

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
type WorkflowKey = "ready" | "in_progress" | "problem";

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
const T = {
  primary: "#2F65AB",
  primaryLight: "#E8EFF8",
  primaryDark: "#1E4A82",
  accent: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
} as const;

export default function BillsPendingClient() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [allBranches, setAllBranches] = useState<Transport[]>([]);
  const [fromDate, setFromDate] = useState(FIXED_YEAR_START);
  const [toDate, setToDate] = useState(FIXED_YEAR_END);
  const [transportCode, setTransportCode] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedTransport, setSelectedTransport] = useState("");
  const [updating, setUpdating] = useState(false);
  const [tick, setTick] = useState(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [productsByDoc, setProductsByDoc] = useState<Record<string, Product[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [scheduleBill, setScheduleBill] = useState<{ billNo: string; defaults: PendingScheduleDefaults } | null>(null);
  const [locationBill, setLocationBill] = useState<{ billNo: string; defaults: PendingLocationDefaults } | null>(null);
  const [todoOpen, setTodoOpen] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [queueFilter] = useState<QueueFilter>("all");
  const [statusMenu, setStatusMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [routeMenu, setRouteMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [roundMenu, setRoundMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [deliveryRoutes, setDeliveryRoutes] = useState<DeliveryRoute[]>([]);
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([]);
  const [notYetDays, setNotYetDays] = useState(3);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<ManualPendingBill[]>([]);
  const [manualSelected, setManualSelected] = useState<ManualPendingBill | null>(null);
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
  // Kanban view mode + drag state. The "happy" view shows the 4 workflow
  // steps as columns; the "problem" view collapses to a single column for
  // cancelled / rejected bills.
  const [viewMode, setViewMode] = useState<"happy" | "problem">("happy");
  const [dragBill, setDragBill] = useState<string | null>(null);
  const [dragOverStep, setDragOverStep] = useState<StepKey | null>(null);
  const [collapsedSteps, setCollapsedSteps] = useState<Set<StepKey>>(new Set());
  const today = getFixedTodayDate();
  const addDays = (date: string, days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const tomorrow = addDays(today, 1);
  const notYetThresholdDate = addDays(today, notYetDays);

  useEffect(() => { const i = setInterval(() => setTick((v) => v + 1), 1000); return () => clearInterval(i); }, []);
  // Fetch on mount — replaces the Next.js server component that used to preload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchBills(); }, []);

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

  const fmtDur = (t: TimeUse | null | undefined) => {
    if (!t) return null;
    const s = baseSec(t) + tick;
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = [];
    if (d > 0) p.push(`${d}d`);
    if (h > 0) p.push(`${h}h`);
    if (m > 0) p.push(`${m}m`);
    p.push(`${sec.toString().padStart(2, "0")}s`);
    return p.join(" ");
  };

  const deptList = [...new Set(bills.map((b) => b.department).filter(Boolean))].sort();

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
  const dispatchReadyCount = bills.filter(isDispatchReady).length;

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

  // "problem" status reasons — bill is in a known bad state the dispatcher
  // has to follow up on, distinct from "just missing data" (in_progress).
  const PROBLEM_STATUSES: ReadonlySet<string> = new Set([
    "contact_failed",
    "customer_postponed",
    "customer_cancelled",
  ]);

  const workflowKey = (b: Bill): WorkflowKey => {
    if (isDispatchReady(b)) return "ready";
    if (b.cancelled_delivery) return "problem";
    if (b.action_status && PROBLEM_STATUSES.has(b.action_status)) return "problem";
    return "in_progress";
  };

  const workflowCopy: Record<WorkflowKey, { title: string; tone: string }> = {
    ready: { title: "ພ້ອມຈັດຖ້ຽວ", tone: "emerald" },
    in_progress: { title: "ກຳລັງດຳເນີນການ", tone: "amber" },
    problem: { title: "ຕ້ອງຕິດຕາມ", tone: "rose" },
  };

  // Progress checklist shown under in-progress bills so dispatchers can see
  // at a glance what's still missing (contact / date / route / round).
  type ChecklistKey = "contact" | "date" | "route" | "round";
  const workflowChecklist = (b: Bill): Record<ChecklistKey, boolean> => ({
    contact: b.action_status === "contacted_ready",
    date: Boolean(b.scheduled_date_overridden),
    route: Boolean(b.delivery_route_code?.trim()),
    round: Boolean(b.delivery_round_code?.trim()),
  });

  // Future bills sit outside the action queue — the dispatcher will pick them
  // up closer to send_date.
  const futureCount = bills.filter(isNotYetTime).length;

  // "need_action" = anything in the contact window that isn't dispatch-ready
  // (combines old call/uncontacted/problem/cancelled_job tabs). Bills with
  // send_date far in the future stay parked under "future" instead.
  const needsAction = (b: Bill): boolean => {
    if (isNotYetTime(b)) return false;
    return !isDispatchReady(b);
  };
  const needActionCount = bills.filter(needsAction).length;

  const kw = searchText.trim().toLowerCase();
  const filtered = bills.filter((b) => {
    if (departmentFilter !== "all" && b.department !== departmentFilter) return false;

    // Column-based filtering happens at render time (Kanban grid). queueFilter
    // kept as legacy for the existing manual-add code path; new code uses
    // focusCol to optionally narrow to a single column on small screens.
    if (queueFilter === "need_action" && !needsAction(b)) return false;
    if (queueFilter === "ready" && !isDispatchReady(b)) return false;
    if (queueFilter === "future" && !isNotYetTime(b)) return false;

    if (!kw) return true;
    return [
      b.doc_no,
      b.doc_date,
      b.transport_name,
      b.sale,
      b.department,
      b.transport,
      b.time_open,
      b.partial_delivery ? "ກຳລັງທະຍອຍສົ່ງ partial delivery" : "",
      b.cancelled_delivery ? "ຍົກເລີກຈັດສົ່ງ cancelled delivery" : "",
      b.cancelled_delivery_job,
      b.cancelled_delivery_remark,
      b.cancelled_delivery_at,
    ].filter(Boolean).join(" ").toLowerCase().includes(kw);
  });

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
      setExpandedDoc(null); setProductsByDoc({});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleProducts = async (docNo: string) => {
    if (expandedDoc === docNo) { setExpandedDoc(null); return; }
    setExpandedDoc(docNo);
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
      const name = transports.find((t) => t.code === selectedTransport)?.name_1 ?? selectedBill.transport;
      const remove = transportCode !== "all" && selectedTransport !== transportCode;
      setBills((c) => c.map((b) => b.doc_no === selectedBill.doc_no ? { ...b, transport: name } : b).filter((b) => !remove || b.doc_no !== selectedBill.doc_no));
      closeModal();
    } finally { setUpdating(false); }
  };

  const openManualModal = () => {
    setManualModalOpen(true);
    setManualSearch("");
    setManualResults([]);
    setManualSelected(null);
    setManualDate(tomorrow);
    setManualRound("");
    setManualRoute("");
    setManualTransport("");
    setManualRemark("");
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
      setViewMode("happy");
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
    if (!window.confirm(`ລົບ ${billNo} ອອກຈາກລາຍການລໍຖ້າຈັດຖ້ຽວ?`)) return;
    setRemovingManualBillNo(billNo);
    try {
      await Actions.removeManualPendingBill(billNo);
      setBills((current) => current.filter((bill) => bill.doc_no !== billNo));
      setExpandedDoc((current) => (current === billNo ? null : current));
    } catch (e) {
      console.error(e);
    } finally {
      setRemovingManualBillNo(null);
    }
  };

  // ── Summary counts ──
  const totalQty = filtered.reduce((s, b) => s + (Number(b.remaining_qty_total) || 0), 0);
  const durColor = (t: TimeUse | null) => {
    const s = baseSec(t) + tick;
    if (s >= 4 * 3600) return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    if (s >= 2 * 3600) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  };

  const inputCls = "w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all";

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

  // Drop handler: maps the destination step to a backend action.
  //   not_contacted: clear action_status — resets the bill to its initial state.
  //   sales_pending: open StatusMenu so the dispatcher records the sub-status
  //                  (sales_not_notified vs contacted_ready w/o full plan).
  //   ready:         open StatusMenu — forces date/route/round capture before
  //                  the bill flips to "contacted_ready".
  //   scheduled_wait / problem: read-only — derived from data, not drop targets.
  const handleDropOnStep = async (billNo: string, step: StepKey, anchor: HTMLElement) => {
    const bill = bills.find((b) => b.doc_no === billNo);
    if (!bill) return;
    const currentStep = billStep(bill);
    if (currentStep === step) return;
    if (step === "scheduled_wait" || step === "problem") return;
    if (step === "sales_pending" || step === "ready") {
      setStatusMenu({ billNo, anchor });
      return;
    }
    if (step === "not_contacted") {
      try {
        await Actions.upsertPendingBillSchedule({ bill_no: billNo, action_status: null });
        await fetchBills();
      } catch (e) {
        console.error("[handleDropOnStep]", e);
      }
    }
  };

  const toggleCollapsedStep = (step: StepKey) => {
    setCollapsedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="Pending ຕິດຕໍ່ລູກຄ້າ"
        subtitle="ກວດບິນຄ້າງສົ່ງທີ່ຮອດກຳນົດ ຫຼືລ່ວງໜ້າ 1 ວັນ ເພື່ອບັນທຶກຜົນຕິດຕໍ່, ວັນພ້ອມຮັບ ແລະຮອບສົ່ງ"
        icon={<FaFileInvoice />}
        tone="teal"
      />

      <StatusStatGrid
        stats={[
          { label: "ຕ້ອງດຳເນີນການ", value: needActionCount, icon: <FaExclamationTriangle />, tone: "teal" },
          { label: "ພ້ອມຈັດຖ້ຽວ", value: dispatchReadyCount, icon: <FaCheckSquare />, tone: "sky" },
          { label: "ລ່ວງໜ້າ", value: futureCount, icon: <FaCalendar />, tone: "amber" },
          { label: "ຈຳນວນເຫຼືອ", value: fmtQty(totalQty), icon: <FaBoxOpen />, tone: "orange" },
        ]}
      />

      {/* ── Filters ── */}
      <div className="glass rounded-lg p-4">
        <form onSubmit={(e) => { e.preventDefault(); void fetchBills(); }} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 items-end">
          <div className="col-span-2 md:col-span-4 xl:col-span-2">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຄົ້ນຫາ</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ເລກບິນ, ລູກຄ້າ, ຂາຍ..." className={`${inputCls} pl-8`} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Send date ຈາກ</label>
            <input type="date" value={fromDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Send date ຫາ</label>
            <input type="date" value={toDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຂົນສົ່ງ</label>
            <select value={transportCode} onChange={(e) => setTransportCode(e.target.value)} className={inputCls}>
              <option value="all">ທັງໝົດ</option>
              {transports.map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ພະແນກ</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={inputCls}>
              <option value="all">ທັງໝົດ</option>
              {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <button type="submit" disabled={loading} className="w-full px-4 py-2 text-white rounded-lg text-xs font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500">
              {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
              ຄົ້ນຫາ
            </button>
          </div>
        </form>
      </div>

      {/* ── Toolbar: count + happy/problem view switch + sort + add ── */}
      <div className="glass rounded-lg p-1.5 flex flex-wrap gap-1.5 items-center">
        <span className="px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
          ພົບ <span className="font-bold text-slate-700 dark:text-slate-100">{filtered.length}</span> ບິນ
        </span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <button
          type="button"
          onClick={() => setViewMode("happy")}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
            viewMode === "happy"
              ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
          }`}
          title="ສະແດງ 4 ຂັ້ນຕອນຫຼັກ"
        >
          ຂັ້ນຕອນຫຼັກ
          <span className={`min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${viewMode === "happy" ? "bg-white/25" : "bg-slate-500/15"}`}>
            {STEP_ORDER.reduce((s, k) => s + billsByStep[k].length, 0)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("problem")}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
            viewMode === "problem"
              ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
          }`}
          title="ບິນຍົກເລີກ / ປະຕິເສດ"
        >
          <FaExclamationTriangle size={9} />
          ມີບັນຫາ
          <span className={`min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${viewMode === "problem" ? "bg-white/25" : "bg-slate-500/15"}`}>
            {billsByStep.problem.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md glass px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
          title="ປ່ຽນລຳດັບການຈັດຮຽງ"
        >
          {sortOrder === "asc" ? <><FaSortAmountUp size={10} /> ໃກ້ສຸດກ່ອນ</> : <><FaSortAmountDown size={10} /> ໄກສຸດກ່ອນ</>}
        </button>
        <button
          type="button"
          onClick={openManualModal}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
        >
          <FaPlus size={10} />
          ເພີ່ມບິນ 56/72
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="glass rounded-lg p-16 text-center">
          <FaSpinner className="animate-spin text-2xl mx-auto mb-3 text-teal-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">ກຳລັງໂຫຼດ...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-lg p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-500/10 flex items-center justify-center mx-auto mb-3">
            <FaFileInvoice className="text-slate-400 dark:text-slate-500 text-xl" />
          </div>
          <p className="text-sm text-slate-500">{kw ? "ບໍ່ພົບຂໍ້ມູນ" : "ບໍ່ມີຂໍ້ມູນ"}</p>
        </div>
      ) : (
        <>
          {/* Bulk-action toolbar (visible when bills are selected) */}
          {selectedBillNos.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 shadow-md dark:border-teal-800 dark:bg-teal-950/50">
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                ເລືອກແລ້ວ {selectedBillNos.size} ບິນ
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[10px] text-teal-600 hover:underline"
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
                className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                {bulkSaving ? <FaSpinner className="animate-spin" size={10} /> : <FaCheck size={10} />}
                ນຳໃຊ້
              </button>
            </div>
          )}

          {/* Kanban grid */}
          {/* In "happy" mode each workflow step (1, 2.1, 2.2, 2.3) is a column. */}
          {/* In "problem" mode one full-width column lists cancelled/rejected. */}
          <div className={`grid gap-3 ${
            viewMode === "happy" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1"
          }`}>
            {(viewMode === "happy" ? STEP_ORDER : ["problem" as StepKey]).map((step) => {
              const meta = STEP_META[step];
              const stepBills = billsByStep[step];
              const collapsed = collapsedSteps.has(step);
              const isDropTarget = dragOverStep === step;
              const dropDisabled = step === "scheduled_wait" || step === "problem";
              const totals = stepTotals[step];
              return (
                <section
                  key={step}
                  onDragOver={(e) => {
                    if (dropDisabled || !dragBill) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverStep !== step) setDragOverStep(step);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setDragOverStep((prev) => (prev === step ? null : prev));
                    }
                  }}
                  onDrop={(e) => {
                    if (dropDisabled || !dragBill) return;
                    e.preventDefault();
                    const billNo = dragBill;
                    setDragBill(null);
                    setDragOverStep(null);
                    void handleDropOnStep(billNo, step, e.currentTarget);
                  }}
                  className={`flex flex-col rounded-lg border transition-colors ${
                    isDropTarget && !dropDisabled
                      ? `ring-2 ${meta.ring} border-transparent ${meta.headBg}`
                      : "border-slate-200/50 dark:border-white/5 bg-white/30 dark:bg-white/[0.02]"
                  }`}
                >
                  {/* Column header */}
                  <header className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-slate-200/40 dark:border-white/5 ${meta.headBg}`}>
                    <span className={`text-[10px] font-mono font-bold rounded px-1.5 py-0.5 ${meta.headText} bg-white/40 dark:bg-white/[0.05]`}>
                      {meta.number}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleCollapsedStep(step)}
                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                    >
                      {collapsed ? <FaChevronRight size={9} className="text-slate-400" /> : <FaChevronDown size={9} className="text-slate-400" />}
                      <div className="min-w-0">
                        <p className={`text-[12px] font-bold leading-tight truncate ${meta.headText}`}>
                          {meta.title}
                        </p>
                        <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight truncate">
                          {meta.description}
                        </p>
                      </div>
                    </button>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-extrabold leading-none text-slate-700 dark:text-slate-100">
                        {stepBills.length}
                      </div>
                      <div className="text-[9px] text-amber-700 dark:text-amber-400 font-bold leading-tight">
                        {fmtQty(totals.qty)} qty
                      </div>
                    </div>
                  </header>

                  {/* Column body */}
                  {!collapsed && (
                    <div className="flex-1 p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-340px)] overflow-y-auto">
                      {stepBills.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-[11px] text-slate-400">
                          <FaBoxOpen size={20} className="mb-1 opacity-40" />
                          <p>{dropDisabled ? "ບໍ່ມີບິນ" : (dragBill ? "ວາງທີ່ນີ້ເພື່ອປ່ຽນຂັ້ນຕອນ" : "ບໍ່ມີບິນ")}</p>
                        </div>
                      ) : (
                        <>
                          {stepBills.map((bill) => {
                      const exp = expandedDoc === bill.doc_no;
                      const prods = productsByDoc[bill.doc_no] ?? [];
                      const overdue = !!bill.scheduled_date && bill.scheduled_date < today;
                      const wasDeliveryCancelled = Boolean(bill.cancelled_delivery);
                      const workflow = workflowKey(bill);
                      const workflowMeta = workflowCopy[workflow];
                      const contactMeta = bill.action_status ? ACTION_STATUS_MAP[bill.action_status] : null;
                      const roundName = bill.delivery_round_code
                        ? deliveryRounds.find((r) => r.code === bill.delivery_round_code)?.name ?? bill.delivery_round_code
                        : "";
                      const routeName = bill.delivery_route_code
                        ? deliveryRoutes.find((r) => r.code === bill.delivery_route_code)?.name ?? bill.delivery_route_code
                        : "";
                      const workflowTone: Record<string, string> = {
                        emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        amber: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                        sky: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
                        slate: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                        rose: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
                      };
                      const chipBase = "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors";
                      const chipDone = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15";
                      const chipTodo = "border-slate-300/50 bg-white/40 text-slate-600 hover:bg-slate-500/10 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
                      // Inline "x" button styling — appended directly next to
                      // a filled chip so dispatchers can clear route/round/date
                      // without opening the dropdown. The chip itself loses
                      // its right rounding so they read as a single tag.
                      const chipClear =
                        "inline-flex items-center justify-center rounded-r-md border border-l-0 border-rose-300/40 bg-rose-50/40 px-1.5 py-1 text-rose-500 hover:bg-rose-500/15 hover:text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/[0.06] dark:text-rose-400";
                      const clearScheduleField = async (
                        billNo: string,
                        field: "delivery_route_code" | "delivery_round_code" | "scheduled_date"
                      ) => {
                        try {
                          await Actions.upsertPendingBillSchedule({
                            bill_no: billNo,
                            [field]: null,
                          });
                          await fetchBills();
                        } catch (e) {
                          console.error("[clearScheduleField]", e);
                        }
                      };
                      const canPlanDelivery = true;
                      const checklist = workflowChecklist(bill);
                      const workflowToneCls = workflowTone[workflowMeta.tone];
                      return (
                        <article
                          key={bill.doc_no}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", bill.doc_no);
                            setDragBill(bill.doc_no);
                          }}
                          onDragEnd={() => {
                            setDragBill(null);
                            setDragOverStep(null);
                          }}
                          className={`rounded-lg border transition-all overflow-hidden cursor-grab active:cursor-grabbing ${
                            dragBill === bill.doc_no ? "opacity-50" : ""
                          } ${
                            exp
                              ? wasDeliveryCancelled
                                ? "border-rose-500/50 ring-1 ring-rose-500/30 bg-rose-500/[0.06]"
                                : "border-teal-500/40 ring-1 ring-teal-500/30 bg-teal-500/[0.04]"
                              : wasDeliveryCancelled
                              ? "border-rose-400/60 dark:border-rose-500/40 bg-rose-500/[0.06] hover:border-rose-500/80 hover:bg-rose-500/[0.09]"
                              : overdue
                              ? "border-rose-300/40 dark:border-rose-500/20 bg-white/40 dark:bg-white/[0.02] hover:border-rose-300/70 hover:bg-rose-500/[0.03]"
                              : "border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] hover:border-teal-300/50 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:shadow-sm"
                          }`}
                        >
                          {/* Header row — ID, status, qty, actions. Customer/sale moves to its own line below. */}
                          <div className="flex items-center gap-2 px-3 py-2">
                            <label
                              className="flex items-center cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                              title="ເລືອກສຳລັບ bulk action"
                            >
                              <input
                                type="checkbox"
                                checked={selectedBillNos.has(bill.doc_no)}
                                onChange={() => toggleSelectBill(bill.doc_no)}
                                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                            </label>

                            <button
                              onClick={() => void toggleProducts(bill.doc_no)}
                              className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
                            >
                              {exp ? <FaChevronDown size={10} style={{ color: T.primary }} /> : <FaChevronRight size={10} className="text-slate-400" />}
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" style={{ color: exp ? T.primary : undefined }}>
                                {bill.doc_no}
                              </span>
                            </button>

                            {bill.is_pos_settled && (
                              <span
                                className="inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400"
                                title="ບິນຈາກ POS — ຮັບເງິນແລ້ວ"
                              >
                                POS
                              </span>
                            )}

                            <div
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${workflowToneCls}`}
                              title={workflowMeta.title}
                            >
                              {workflow === "ready" ? <FaCheckSquare size={9} /> : workflow === "problem" ? <FaExclamationTriangle size={9} /> : <FaClock size={9} />}
                              <span>{workflowMeta.title}</span>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                              <div className="text-right hidden sm:block">
                                <div className="text-xs font-bold text-amber-700 dark:text-amber-400 leading-tight">
                                  {fmtQty(bill.remaining_qty_total)} <span className="text-[10px] font-medium">qty</span>
                                </div>
                                <div className="text-[10px] text-slate-500 leading-tight">{bill.remaining_count} ລາຍການ</div>
                              </div>

                              {bill.time_use && (
                                <span
                                  className={`hidden md:inline-flex items-center justify-center w-7 h-7 rounded-md border ${durColor(bill.time_use)}`}
                                  title={`ຄ້າງ ${fmtDur(bill.time_use)}`}
                                >
                                  <FaClock size={11} />
                                </span>
                              )}

                              <button
                                onClick={(e) => setTodoOpen({ billNo: bill.doc_no, anchor: e.currentTarget })}
                                className={`relative inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                                  bill.todo_pending_count && bill.todo_earliest_deadline && bill.todo_earliest_deadline < today
                                    ? "text-rose-600 bg-rose-500/10 hover:bg-rose-500/20"
                                    : bill.todo_pending_count && bill.todo_earliest_deadline === today
                                    ? "text-amber-600 bg-amber-500/10 hover:bg-amber-500/20"
                                    : bill.todo_pending_count
                                    ? "text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20"
                                    : "text-slate-400 hover:bg-slate-500/10"
                                }`}
                                title="ກິດຈະກຳ"
                              >
                                <FaStickyNote size={11} />
                                {(bill.todo_pending_count ?? 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                                    {bill.todo_pending_count}
                                  </span>
                                )}
                              </button>

                              <button
                                onClick={() => openModal(bill)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white transition-colors bg-teal-600 hover:bg-teal-700 dark:bg-teal-500"
                                title="ປ່ຽນສາຍສົ່ງ"
                              >
                                <FaExchangeAlt size={10} />
                              </button>

                              {bill.manual_pending_bill && (
                                <button
                                  type="button"
                                  onClick={() => void removeManualBill(bill.doc_no)}
                                  disabled={removingManualBillNo === bill.doc_no}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-rose-600 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400"
                                  title="ລົບອອກຈາກລາຍການລໍຖ້າຈັດຖ້ຽວ"
                                >
                                  {removingManualBillNo === bill.doc_no ? (
                                    <FaSpinner className="animate-spin" size={10} />
                                  ) : (
                                    <FaTrash size={10} />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Customer line — name, salesperson, department, transport, send date in one calm row. */}
                          <div className="px-3 pb-2 -mt-0.5 text-xs text-slate-600 dark:text-slate-300 truncate" title={bill.transport_name}>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{bill.transport_name}</span>
                            <span className="text-slate-400 dark:text-slate-500"> · </span>
                            <span>Send {bill.send_date_display ?? bill.doc_date}</span>
                            {bill.sale && (
                              <>
                                <span className="text-slate-400 dark:text-slate-500"> · </span>
                                <span>{bill.sale}</span>
                              </>
                            )}
                            {bill.department && (
                              <>
                                <span className="text-slate-400 dark:text-slate-500"> · </span>
                                <span className="text-slate-500">{bill.department}</span>
                              </>
                            )}
                            {bill.transport && (
                              <>
                                <span className="text-slate-400 dark:text-slate-500"> · </span>
                                <span className="inline-flex items-center gap-1"><FaTruck size={9} className="text-slate-400" /> {bill.transport}</span>
                              </>
                            )}
                          </div>

                          {wasDeliveryCancelled && (
                            <div className="border-t border-rose-500/20 bg-rose-500/10 px-3 py-2">
                              <div className="flex flex-wrap items-start gap-2 text-[10px] text-rose-700 dark:text-rose-300">
                                <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-600 px-2 py-1 font-bold text-white">
                                  <FaExclamationTriangle size={9} />
                                  ເຄີຍຖືກຍົກເລີກຈັດສົ່ງ
                                </span>
                                {bill.cancelled_delivery_at && (
                                  <span className="rounded-md bg-rose-500/10 px-2 py-1 font-semibold">
                                    {bill.cancelled_delivery_at}
                                  </span>
                                )}
                                {bill.cancelled_delivery_job && (
                                  <span className="rounded-md bg-rose-500/10 px-2 py-1 font-semibold">
                                    ຖ້ຽວ {bill.cancelled_delivery_job}
                                  </span>
                                )}
                                {bill.cancelled_delivery_remark && (
                                  <span className="flex min-w-0 items-start gap-1 rounded-md bg-white/50 px-2 py-1 font-semibold dark:bg-white/5">
                                    <FaStickyNote size={9} className="mt-0.5 shrink-0" />
                                    <span className="truncate" title={bill.cancelled_delivery_remark}>
                                      {bill.cancelled_delivery_remark}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Workflow panel — progress checklist + editable scheduling chips. */}
                          <div className="border-t border-slate-200/30 bg-white/30 px-3 py-2 dark:border-white/5 dark:bg-white/[0.02]">
                            {workflow !== "ready" && (
                              <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                                <span className="font-semibold uppercase tracking-wider text-slate-400">ຄົງເຫຼືອ:</span>
                                {([
                                  { key: "contact" as const, label: "ຕິດຕໍ່", done: checklist.contact },
                                  { key: "date" as const, label: "ວັນຮັບ", done: checklist.date },
                                  { key: "route" as const, label: "ເສັ້ນທາງ", done: checklist.route },
                                  { key: "round" as const, label: "ຮອບ", done: checklist.round },
                                ]).map((step) => (
                                  <span
                                    key={step.key}
                                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
                                      step.done
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                        : "bg-slate-500/10 text-slate-500"
                                    }`}
                                  >
                                    {step.done ? <FaCheck size={7} /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
                                    {step.label}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => setStatusMenu({ billNo: bill.doc_no, anchor: e.currentTarget })}
                                className={`${chipBase} ${
                                  contactMeta?.color === "emerald"
                                    ? chipDone
                                    : contactMeta?.color === "rose"
                                    ? "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-400"
                                    : contactMeta?.color === "amber"
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                                    : contactMeta
                                    ? "border-slate-500/30 bg-slate-500/10 text-slate-700 hover:bg-slate-500/15 dark:text-slate-300"
                                    : chipTodo
                                }`}
                                title="ບັນທຶກ ຫຼືແກ້ຜົນການຕິດຕໍ່"
                              >
                                <FaPhone size={9} />
                                {contactMeta?.label ?? "ຍັງບໍ່ບັນທຶກການຕິດຕໍ່"}
                                <FaChevronDown size={7} className="opacity-60" />
                              </button>
                              <span className="inline-flex">
                                <button
                                  type="button"
                                  disabled={!canPlanDelivery}
                                  onClick={() => {
                                    if (canPlanDelivery) openScheduleDialog(bill);
                                  }}
                                  className={`${chipBase} ${bill.scheduled_date_overridden ? "rounded-r-none" : ""} ${
                                    !canPlanDelivery
                                      ? "cursor-not-allowed border-slate-200/60 bg-slate-100/60 text-slate-400 dark:border-white/5 dark:bg-white/[0.03]"
                                      : bill.scheduled_date_display
                                      ? chipDone
                                      : chipTodo
                                  }`}
                                  title={canPlanDelivery ? "ກຳນົດ ຫຼືແກ້ວັນທີ່ລູກຄ້າພ້ອມຮັບ" : "ຕ້ອງຕັ້ງສະຖານະເປັນ ພ້ອມຮັບ ກ່ອນ"}
                                >
                                  <FaCalendar size={9} />
                                  {canPlanDelivery
                                    ? bill.scheduled_date_display ? bill.scheduled_date_display : "ກຳນົດວັນຮັບ"
                                    : "ວັນຮັບ: ລໍຖ້າພ້ອມຮັບ"}
                                  {bill.scheduled_date_overridden && <span className="text-amber-600 dark:text-amber-400">(ແກ້)</span>}
                                  {canPlanDelivery && !bill.scheduled_date_overridden && <FaChevronDown size={7} className="opacity-60" />}
                                </button>
                                {bill.scheduled_date_overridden && canPlanDelivery && (
                                  <button
                                    type="button"
                                    onClick={() => void clearScheduleField(bill.doc_no, "scheduled_date")}
                                    className={chipClear}
                                    title="ລົບວັນທີ່ກຳນົດ — ກັບໄປໃຊ້ send_date ຂອງບິນ"
                                  >
                                    <FaTimes size={8} />
                                  </button>
                                )}
                              </span>
                              <span className="inline-flex">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    setRouteMenu({ billNo: bill.doc_no, anchor: e.currentTarget });
                                  }}
                                  className={`${chipBase} ${bill.delivery_route_code ? "rounded-r-none" : ""} ${
                                    bill.delivery_route_code
                                      ? chipDone
                                      : chipTodo
                                  }`}
                                  title="ກຳນົດ ຫຼືແກ້ເສັ້ນທາງຂົນສົ່ງ"
                                >
                                  <FaRoute size={9} />
                                  {routeName || "ເລືອກເສັ້ນທາງ"}
                                  {!bill.delivery_route_code && <FaChevronDown size={7} className="opacity-60" />}
                                </button>
                                {bill.delivery_route_code && (
                                  <button
                                    type="button"
                                    onClick={() => void clearScheduleField(bill.doc_no, "delivery_route_code")}
                                    className={chipClear}
                                    title="ລົບເສັ້ນທາງທີ່ກຳນົດ"
                                  >
                                    <FaTimes size={8} />
                                  </button>
                                )}
                              </span>
                              <span className="inline-flex">
                                <button
                                  type="button"
                                  disabled={!canPlanDelivery}
                                  onClick={(e) => {
                                    if (canPlanDelivery) setRoundMenu({ billNo: bill.doc_no, anchor: e.currentTarget });
                                  }}
                                  className={`${chipBase} ${bill.delivery_round_code && canPlanDelivery ? "rounded-r-none" : ""} ${
                                    !canPlanDelivery
                                      ? "cursor-not-allowed border-slate-200/60 bg-slate-100/60 text-slate-400 dark:border-white/5 dark:bg-white/[0.03]"
                                      : bill.delivery_round_code
                                      ? chipDone
                                      : chipTodo
                                  }`}
                                  title={canPlanDelivery ? "ກຳນົດ ຫຼືແກ້ຮອບສົ່ງ" : "ຕ້ອງຕັ້ງສະຖານະເປັນ ພ້ອມຮັບ ກ່ອນ"}
                                >
                                  <FaClock size={9} />
                                  {canPlanDelivery ? roundName || "ເລືອກຮອບສົ່ງ" : "ຮອບ: ລໍຖ້າພ້ອມຮັບ"}
                                  {canPlanDelivery && !bill.delivery_round_code && <FaChevronDown size={7} className="opacity-60" />}
                                </button>
                                {bill.delivery_round_code && canPlanDelivery && (
                                  <button
                                    type="button"
                                    onClick={() => void clearScheduleField(bill.doc_no, "delivery_round_code")}
                                    className={chipClear}
                                    title="ລົບຮອບສົ່ງທີ່ກຳນົດ"
                                  >
                                    <FaTimes size={8} />
                                  </button>
                                )}
                              </span>
                              {(() => {
                                const planned = (bill.planned_lat ?? "").toString().trim() && (bill.planned_lng ?? "").toString().trim();
                                const custLoc = (bill.cust_lat ?? "").toString().trim() && (bill.cust_lng ?? "").toString().trim();
                                // Surface either: planned (set by dispatcher) or fallback to
                                // the customer's stored location. The dialog handles editing.
                                const hasAnyLoc = Boolean(planned || custLoc);
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openLocationDialog(bill)}
                                      className={`${chipBase} ${planned ? chipDone : custLoc ? "border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-400" : chipTodo}`}
                                      title={planned ? "ແກ້ຈຸດຈັດສົ່ງ" : custLoc ? "ໃຊ້/ປ່ຽນຈຸດທີ່ບັນທຶກໄວ້ໃນຂໍ້ມູນລູກຄ້າ" : "ກຳນົດຈຸດຈັດສົ່ງສຳລັບໃຫ້ຄົນຂັບນຳທາງ"}
                                    >
                                      <FaMapMarkerAlt size={9} />
                                      {planned ? "ຈຸດສົ່ງ" : custLoc ? "ຈຸດລູກຄ້າ" : "ກຳນົດຈຸດສົ່ງ"}
                                    </button>
                                    {hasAnyLoc && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const lat = (planned ? bill.planned_lat : bill.cust_lat) ?? "";
                                          const lng = (planned ? bill.planned_lng : bill.cust_lng) ?? "";
                                          void printBillLocationQr({
                                            billNo: bill.doc_no,
                                            custName: bill.cust_name ?? null,
                                            lat,
                                            lng,
                                          }).catch((e) => alert(e instanceof Error ? e.message : "Print ບໍ່ສຳເລັດ"));
                                        }}
                                        className="inline-flex items-center justify-center rounded-md border border-slate-300/40 bg-white/60 px-1.5 py-1 text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/10"
                                        title="ພິມ QR ຈຸດສົ່ງ ເພື່ອແນບກັບບິນ"
                                      >
                                        <FaPrint size={10} />
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Footer — only render when there's something worth saying. */}
                          {(bill.partial_delivery || bill.manual_pending_bill || bill.schedule_remark) && (
                            <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-t border-slate-200/30 dark:border-white/5 bg-slate-500/[0.03] dark:bg-white/[0.015]">
                              {bill.partial_delivery && (
                                <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                                  ກຳລັງທະຍອຍສົ່ງ
                                </span>
                              )}

                              {bill.manual_pending_bill && (
                                <span className="inline-flex items-center rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">
                                  {bill.source_type === "odservice.tb_product"
                                    ? "ສູນບໍລິການ"
                                    : `ic_trans flag ${bill.source_trans_flag ?? "56/72"}`}
                                </span>
                              )}

                              {bill.schedule_remark && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300" title={bill.schedule_remark}>
                                  <FaStickyNote size={9} className="text-amber-500 shrink-0" />
                                  <span className="truncate max-w-[260px]">{bill.schedule_remark}</span>
                                </span>
                              )}

                              {/* Mobile-only qty fallback */}
                              <span className="sm:hidden inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 ml-auto">
                                {fmtQty(bill.remaining_qty_total)} qty · {bill.remaining_count} ລາຍການ
                              </span>
                            </div>
                          )}

                          {/* Expanded products */}
                          {exp && (
                            <div className="border-t border-slate-200/30 dark:border-white/5 bg-white/40 dark:bg-white/5">
                              <div className="px-3 py-1.5 flex items-center justify-between bg-teal-500/10 border-b border-slate-200/30 dark:border-white/5">
                                <span className="text-[11px] font-bold flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                                  <FaBox size={10} />
                                  ສິນຄ້າ ({fmtQty(bill.remaining_qty_total)} qty / {prods.length} ລາຍການ)
                                </span>
                                <button
                                  onClick={() => setExpandedDoc(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                >
                                  <FaTimes size={9} />
                                </button>
                              </div>
                              {loadingDoc === bill.doc_no ? (
                                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-6">
                                  <FaSpinner className="animate-spin" size={11} /> ກຳລັງໂຫຼດ...
                                </div>
                              ) : prods.length === 0 ? (
                                <div className="flex flex-col items-center py-6 text-slate-400">
                                  <FaBoxOpen size={20} className="mb-1 opacity-50" />
                                  <p className="text-[11px]">ບໍ່ມີສິນຄ້າ</p>
                                </div>
                              ) : (
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="border-b border-slate-200/30 dark:border-white/5 text-slate-500 dark:text-slate-400">
                                      <th className="text-left py-1.5 pl-3 pr-1 font-medium w-6">#</th>
                                      <th className="text-left py-1.5 px-1 font-medium">ລະຫັດ</th>
                                      <th className="text-left py-1.5 px-1 font-medium">ຊື່ສິນຄ້າ</th>
                                      <th className="text-right py-1.5 px-1 font-medium">ຈຳນວນ</th>
                                      <th className="text-left py-1.5 pl-1 pr-3 font-medium">ຫົວໜ່ວຍ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {prods.map((p, pi) => (
                                      <tr key={`${bill.doc_no}-${p.item_code}-${pi}`} className="border-b border-slate-200/20 dark:border-white/5 last:border-0 hover:bg-white/30 dark:hover:bg-white/5">
                                        <td className="py-1.5 pl-3 pr-1 text-slate-400">{pi + 1}</td>
                                        <td className="py-1.5 px-1 font-mono text-[9px] text-slate-500">{p.item_code}</td>
                                        <td className="py-1.5 px-1 text-slate-700 dark:text-slate-200 font-medium">{p.item_name}</td>
                                        <td className="py-1.5 px-1 text-right">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">{p.qty}</span>
                                        </td>
                                        <td className="py-1.5 pl-1 pr-3 text-slate-500">{p.unit_code}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </article>
                      );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {modalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <FaTruck className="inline mr-1 text-slate-400" size={10} />ເລືອກຂົນສົ່ງໃໝ່
                </label>
                <select value={selectedTransport} onChange={(e) => setSelectedTransport(e.target.value)} className={inputCls}>
                  <option value="">-- ເລືອກ --</option>
                  {(allBranches.length > 0 ? allBranches : transports).map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeManualModal} />
          <div className="relative glass-heavy glow-primary rounded-lg w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/20 dark:border-white/5 bg-teal-500/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-600 dark:bg-teal-500">
                  <FaPlus className="text-white" size={12} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">ເພີ່ມບິນເຂົ້າລໍຖ້າຈັດຖ້ຽວ</h3>
                  <p className="text-[11px] text-slate-500">ຄົ້ນຈາກ ic_trans 56/72/44/48 ແລະ odservice.tb_product</p>
                </div>
              </div>
              <button onClick={closeManualModal} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                <FaTimes size={12} />
              </button>
            </div>

            <div className="p-5 space-y-4">
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

              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="min-h-[220px] rounded-lg border border-slate-200/50 bg-white/40 p-2 dark:border-white/10 dark:bg-white/5">
                  {manualResults.length === 0 ? (
                    <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-slate-400">
                      <FaFileInvoice className="mb-2 text-xl opacity-60" />
                      <p className="text-xs">ຄົ້ນຫາບິນ ic_trans 56/72 ຫຼືບິນສູນບໍລິການ</p>
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
                                {bill.source_type === "odservice.tb_product" ? "service" : `flag ${bill.source_trans_flag}`}
                              </span>
                              <span className="ml-auto text-[10px] text-slate-500">{bill.count_item} ລາຍການ</span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-500">
                              {bill.cust_name || bill.cust_code} · {bill.doc_date}
                            </p>
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
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">ຂົນສົ່ງ</label>
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
                {manualSelected ? `ເລືອກ: ${manualSelected.doc_no}` : "ເລືອກບິນກ່ອນບັນທຶກ"}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={closeManualModal} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ຍົກເລີກ</button>
                <button
                  onClick={() => void saveManualBill()}
                  disabled={!manualSelected || !manualDate || !manualRound || manualSaving}
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

      <BillTodoPopover
        open={todoOpen !== null}
        billNo={todoOpen?.billNo ?? null}
        anchorEl={todoOpen?.anchor ?? null}
        onClose={() => setTodoOpen(null)}
        onChanged={() => void fetchBills()}
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
        routes={deliveryRoutes}
        rounds={deliveryRounds}
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
      className="fixed z-[80] w-[min(340px,calc(100vw-16px))] overflow-hidden rounded-lg border border-slate-200/40 bg-white shadow-xl dark:border-white/10 dark:bg-[#0d1822]"
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
      className="fixed z-50 w-[240px] glass rounded-lg shadow-xl border border-slate-200/40 dark:border-white/10 overflow-hidden"
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
  routes,
  rounds,
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
  routes: DeliveryRoute[];
  rounds: DeliveryRound[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pickedStatus, setPickedStatus] = useState<string>("");
  const [pickedDate, setPickedDate] = useState<string>("");
  const [pickedRoute, setPickedRoute] = useState<string>("");
  const [pickedRound, setPickedRound] = useState<string>("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = billNo !== null && anchorEl !== null;
  const todayForPlan = getFixedTodayDate();

  useEffect(() => {
    if (!open) return;
    setPickedStatus(currentStatus ?? "");
    setPickedDate(currentDate ?? "");
    setPickedRoute(currentRoute ?? "");
    setPickedRound(currentRound ?? "");
    setRemark(currentRemark ?? "");
    setError(null);
  }, [open, currentStatus, currentDate, currentRoute, currentRound, currentRemark]);

  useEffect(() => {
    if (!open || pickedStatus !== "contacted_ready") return;
    setPickedDate((v) => v || todayForPlan);
  }, [open, pickedStatus, todayForPlan]);

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
    setSaving(true);
    setError(null);
    try {
      await Actions.upsertPendingBillSchedule({
        bill_no: billNo,
        action_status: clear ? null : pickedStatus || null,
        scheduled_date: !clear && pickedStatus === "contacted_ready" ? pickedDate : undefined,
        delivery_route_code: !clear && pickedStatus === "contacted_ready" ? pickedRoute : undefined,
        delivery_round_code: !clear && pickedStatus === "contacted_ready" ? pickedRound : undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close status modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-modal-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0d1822]"
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
          };
          const dotClass: Record<string, string> = {
            rose: "bg-rose-500",
            amber: "bg-amber-500",
            slate: "bg-slate-500",
            emerald: "bg-emerald-500",
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

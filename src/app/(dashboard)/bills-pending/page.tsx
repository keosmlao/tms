"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaBox,
  FaBoxOpen,
  FaCalendar,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFileInvoice,
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
import { BillTodoPopover } from "@/components/bill-todo-popover";
// Ported from server actions: getBillProducts, getBillsPending, updateBillTransport

interface TimeUse {
  days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number;
  Days?: number; Hours?: number; Minutes?: number; Seconds?: number;
}

export interface Bill {
  row_num: number;
  doc_no: string;
  doc_date: string;
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
  schedule_updated_at?: string | null;
  schedule_updated_by?: string;
  todo_pending_count?: number;
  todo_done_count?: number;
  todo_earliest_deadline?: string | null;
  todo_earliest_deadline_display?: string | null;
}

const ACTION_STATUSES = [
  { key: "waiting_contact", label: "ລໍຖ້າຕິດຕໍ່ລູກຄ້າ", color: "amber" },
  { key: "cannot_contact", label: "ຕິດຕໍ່ບໍ່ໄດ້", color: "rose" },
  { key: "not_due_yet", label: "ຍັງບໍ່ຮອດກຳນົດ", color: "sky" },
  { key: "customer_postponed", label: "ລູກຄ້າຂໍເລື່ອນ", color: "orange" },
] as const;
type ActionStatusKey = (typeof ACTION_STATUSES)[number]["key"];

const ACTION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  waiting_contact: { label: "ລໍຖ້າຕິດຕໍ່ລູກຄ້າ", color: "amber" },
  cannot_contact: { label: "ຕິດຕໍ່ບໍ່ໄດ້", color: "rose" },
  not_due_yet: { label: "ຍັງບໍ່ຮອດກຳນົດ", color: "sky" },
  customer_postponed: { label: "ລູກຄ້າຂໍເລື່ອນ", color: "orange" },
};

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
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [productsByDoc, setProductsByDoc] = useState<Record<string, Product[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [scheduleBill, setScheduleBill] = useState<{ billNo: string; defaults: PendingScheduleDefaults } | null>(null);
  const [todoOpen, setTodoOpen] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const [statusTab, setStatusTab] = useState<ActionStatusKey | "all" | "none">("all");
  const [statusMenu, setStatusMenu] = useState<{ billNo: string; anchor: HTMLElement } | null>(null);
  const perPage = 20;
  const today = getFixedTodayDate();

  useEffect(() => { const i = setInterval(() => setTick((v) => v + 1), 1000); return () => clearInterval(i); }, []);
  // Fetch on mount — replaces the Next.js server component that used to preload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchBills(); }, []);

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

  // Count bills per action_status so each tab can show a badge.
  const statusCounts = bills.reduce(
    (acc, b) => {
      const k = b.action_status?.trim() || "none";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const kw = searchText.trim().toLowerCase();
  const filtered = bills.filter((b) => {
    if (departmentFilter !== "all" && b.department !== departmentFilter) return false;
    if (statusTab !== "all") {
      const cur = b.action_status?.trim() || "none";
      if (cur !== statusTab) return false;
    }
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
    ].filter(Boolean).join(" ").toLowerCase().includes(kw);
  });

  // Group/sort by the delivery date (scheduled_date — overridden value or
  // send_date fallback). Bills missing a date go to the end of the list.
  const groupKey = (b: Bill) => b.scheduled_date_display ?? "—";
  const sortKey = (b: Bill) => b.scheduled_date ?? "9999-12-31";

  const sorted = [...filtered].sort((a, b) => {
    const dateCmp = sortOrder === "asc"
      ? sortKey(a).localeCompare(sortKey(b))
      : sortKey(b).localeCompare(sortKey(a));
    if (dateCmp !== 0) return dateCmp;
    return sortOrder === "asc" ? baseSec(a.time_use) - baseSec(b.time_use) : baseSec(b.time_use) - baseSec(a.time_use);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paged = sorted.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Per-date totals across the full filtered set, so the group header shows
  // meaningful numbers even when a date spans multiple pages.
  const dateTotals = filtered.reduce<Record<string, { count: number; qty: number }>>((acc, b) => {
    const key = groupKey(b);
    const prev = acc[key] ?? { count: 0, qty: 0 };
    acc[key] = {
      count: prev.count + (Number(b.remaining_count) || 0),
      qty: prev.qty + (Number(b.remaining_qty_total) || 0),
    };
    return acc;
  }, {});

  const fetchBills = async () => {
    setLoading(true); setTick(0); setCurrentPage(1);
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

  // ── Summary counts ──
  const totalQty = filtered.reduce((s, b) => s + (Number(b.remaining_qty_total) || 0), 0);
  const totalItems = filtered.reduce((s, b) => s + (Number(b.remaining_count) || 0), 0);
  const partialDeliveryCount = filtered.filter((b) => b.partial_delivery).length;

  const durColor = (t: TimeUse | null) => {
    const s = baseSec(t) + tick;
    if (s >= 4 * 3600) return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    if (s >= 2 * 3600) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  };

  const inputCls = "w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all";

  // ── Timeline groups ──
  type TimelineStatus = "overdue" | "today" | "future" | "none";
  type TimelineGroup = {
    key: string;
    date: string | null;
    status: TimelineStatus;
    bills: Bill[];
    totalCount: number;
    totalQty: number;
  };

  const timelineGroups: TimelineGroup[] = [];
  for (const b of paged) {
    const key = groupKey(b);
    let g = timelineGroups[timelineGroups.length - 1];
    if (!g || g.key !== key) {
      const date = b.scheduled_date ?? null;
      let status: TimelineStatus = "none";
      if (date) {
        if (date < today) status = "overdue";
        else if (date === today) status = "today";
        else status = "future";
      }
      g = { key, date, status, bills: [], totalCount: 0, totalQty: 0 };
      timelineGroups.push(g);
    }
    g.bills.push(b);
  }
  for (const g of timelineGroups) {
    const t = dateTotals[g.key] ?? { count: 0, qty: 0 };
    g.totalCount = t.count;
    g.totalQty = t.qty;
  }

  const relativeLabel = (date: string | null, status: TimelineStatus): string | null => {
    if (status === "today") return "ມື້ນີ້";
    if (status === "none" || !date) return null;
    const d1 = new Date(date + "T00:00:00").getTime();
    const d0 = new Date(today + "T00:00:00").getTime();
    const diff = Math.round((d1 - d0) / 86400000);
    if (status === "overdue") return `ຊ້າ ${Math.abs(diff)} ມື້`;
    if (diff === 1) return "ມື້ອື່ນ";
    if (diff <= 7) return `ອີກ ${diff} ມື້`;
    return null;
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ລາຍການລໍຖ້າຈັດສົ່ງ"
        subtitle="ບິນທີ່ລໍຖ້າການຈັດສົ່ງ"
        icon={<FaFileInvoice />}
        tone="teal"
      />

      <StatusStatGrid
        stats={[
          { label: "ບິນທັງໝົດ", value: filtered.length, icon: <FaFileInvoice />, tone: "teal" },
          { label: "ຈຳນວນເຫຼືອ", value: fmtQty(totalQty), icon: <FaBoxOpen />, tone: "amber" },
          { label: "ລາຍການເຫຼືອ", value: totalItems, icon: <FaBox />, tone: "sky" },
          { label: "ທະຍອຍສົ່ງ", value: partialDeliveryCount, icon: <FaExchangeAlt />, tone: "orange" },
        ]}
      />

      {/* ── Filters ── */}
      <div className="glass rounded-lg p-4">
        <form onSubmit={(e) => { e.preventDefault(); void fetchBills(); }} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 items-end">
          <div className="col-span-2 md:col-span-4 xl:col-span-2">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຄົ້ນຫາ</label>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <input type="text" value={searchText} onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }} placeholder="ເລກບິນ, ລູກຄ້າ, ຂາຍ..." className={`${inputCls} pl-8`} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຈາກ</label>
            <input type="date" value={fromDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຫາ</label>
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
            <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }} className={inputCls}>
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

      {/* ── Status tabs ── */}
      <div className="glass rounded-lg p-1.5 flex flex-wrap gap-1">
        {(
          [
            { key: "all", label: "ທັງໝົດ", count: bills.length, color: "slate" },
            ...ACTION_STATUSES.map((s) => ({
              key: s.key,
              label: s.label,
              count: statusCounts[s.key] ?? 0,
              color: s.color,
            })),
            { key: "none", label: "ຍັງບໍ່ໄດ້ໝາຍ", count: statusCounts.none ?? 0, color: "slate" },
          ] as const
        ).map((tab) => {
          const active = statusTab === tab.key;
          const colorMap: Record<string, string> = {
            slate: active
              ? "bg-slate-700 text-white"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-500/10",
            rose: active
              ? "bg-rose-600 text-white"
              : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10",
            amber: active
              ? "bg-amber-600 text-white"
              : "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
            sky: active
              ? "bg-sky-600 text-white"
              : "text-sky-600 dark:text-sky-400 hover:bg-sky-500/10",
            emerald: active
              ? "bg-emerald-600 text-white"
              : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10",
          };
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatusTab(tab.key as ActionStatusKey | "all" | "none");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 ${colorMap[tab.color]}`}
            >
              {tab.label}
              <span
                className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  active ? "bg-white/25 text-white" : "bg-slate-500/10"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
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
          {/* Sort + count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">ພົບ <span className="font-bold text-slate-700 dark:text-slate-200">{filtered.length}</span> ລາຍການ · {timelineGroups.length} ວັນ</p>
            <button onClick={() => { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); setCurrentPage(1); }} className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
              {sortOrder === "asc" ? <><FaSortAmountUp size={11} /> ໃກ້ສຸດກ່ອນ</> : <><FaSortAmountDown size={11} /> ໄກສຸດກ່ອນ</>}
            </button>
          </div>

          {/* Timeline */}
          <div className="relative pl-7 sm:pl-10">
            <div className="absolute left-[10px] sm:left-[14px] top-2 bottom-2 w-px bg-gradient-to-b from-teal-500/40 via-slate-300/40 dark:via-white/10 to-transparent" aria-hidden />

            {timelineGroups.map((g) => {
              const markerBg =
                g.status === "overdue" ? "bg-rose-500"
                : g.status === "today" ? "bg-emerald-500"
                : g.status === "future" ? "bg-teal-500"
                : "bg-slate-400";
              const headLabelColor =
                g.status === "overdue" ? "text-rose-700 dark:text-rose-400"
                : g.status === "today" ? "text-emerald-700 dark:text-emerald-400"
                : g.status === "none" ? "text-slate-500 dark:text-slate-400"
                : "text-slate-800 dark:text-slate-100";
              const relPillCls =
                g.status === "overdue" ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/30"
                : g.status === "today" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                : "bg-teal-500/10 text-teal-700 dark:text-teal-400 ring-1 ring-teal-500/20";
              const rel = relativeLabel(g.date, g.status);

              return (
                <section key={g.key} className="relative pb-6 last:pb-0">
                  {/* Marker */}
                  <span className={`absolute left-[2px] sm:left-[6px] top-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full ring-4 ring-white dark:ring-slate-900 flex items-center justify-center shadow ${markerBg}`}>
                    {g.status === "overdue" && <FaExclamationTriangle size={8} className="text-white" />}
                    {g.status === "today" && (
                      <span className="absolute inset-0 rounded-full bg-emerald-400/50 animate-ping" aria-hidden />
                    )}
                  </span>

                  {/* Group header */}
                  <header className="mb-2.5 flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                    <h3 className={`text-sm font-bold ${headLabelColor}`}>
                      {g.key === "—" ? "ບໍ່ໄດ້ກຳນົດວັນສົ່ງ" : `ວັນສົ່ງ ${g.key}`}
                    </h3>
                    {rel && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${relPillCls}`}>
                        {rel}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-auto sm:ml-0">
                      <span className="font-bold text-amber-700 dark:text-amber-400">{fmtQty(g.totalQty)} qty</span>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{g.totalCount} ລາຍການ</span>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-medium">{g.bills.length} ບິນ</span>
                    </span>
                  </header>

                  {/* Bill cards */}
                  <div className="space-y-2">
                    {g.bills.map((bill) => {
                      const exp = expandedDoc === bill.doc_no;
                      const prods = productsByDoc[bill.doc_no] ?? [];
                      const overdue = !!bill.scheduled_date && bill.scheduled_date < today;
                      return (
                        <article
                          key={bill.doc_no}
                          className={`rounded-lg border transition-all overflow-hidden ${
                            exp
                              ? "border-teal-500/40 ring-1 ring-teal-500/30 bg-teal-500/[0.04]"
                              : overdue
                              ? "border-rose-300/40 dark:border-rose-500/20 bg-white/40 dark:bg-white/[0.02] hover:border-rose-300/70 hover:bg-rose-500/[0.03]"
                              : "border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] hover:border-teal-300/50 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:shadow-sm"
                          }`}
                        >
                          {/* Main row */}
                          <div className="flex items-stretch">
                            <button
                              onClick={() => void toggleProducts(bill.doc_no)}
                              className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-500/5 transition-colors flex-shrink-0 border-r border-slate-200/40 dark:border-white/5"
                            >
                              {exp ? <FaChevronDown size={9} style={{ color: T.primary }} /> : <FaChevronRight size={9} className="text-slate-400" />}
                              <span className="text-left">
                                <span className="block text-[12px] font-bold leading-tight" style={{ color: exp ? T.primary : undefined }}>
                                  {bill.doc_no}
                                </span>
                                <span className="block text-[9px] text-slate-500 leading-tight mt-0.5">{bill.doc_date}</span>
                              </span>
                            </button>

                            <div className="flex-1 min-w-0 px-3 py-2 self-center">
                              <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate" title={bill.transport_name}>
                                {bill.transport_name}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                {bill.sale && <span>{bill.sale}</span>}
                                {bill.department && (
                                  <>
                                    {bill.sale && <span className="text-slate-300 dark:text-slate-600">·</span>}
                                    <span className="px-1.5 py-px rounded-full bg-slate-500/10 text-[9px]">{bill.department}</span>
                                  </>
                                )}
                                {bill.transport && (
                                  <>
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <span className="inline-flex items-center gap-1 truncate"><FaTruck size={8} className="text-slate-400" /> {bill.transport}</span>
                                  </>
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 px-3 py-2 self-center flex-shrink-0">
                              <div className="text-right hidden sm:block">
                                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 leading-tight">{fmtQty(bill.remaining_qty_total)} qty</div>
                                <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{bill.remaining_count} ລາຍການ</div>
                              </div>

                              {bill.time_use && (
                                <span className={`hidden md:inline-flex items-center px-2 py-1 rounded text-[10px] font-bold font-mono border ${durColor(bill.time_use)}`}>
                                  {fmtDur(bill.time_use)}
                                </span>
                              )}

                              <button
                                onClick={(e) => setTodoOpen({ billNo: bill.doc_no, anchor: e.currentTarget })}
                                className={`relative inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
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
                                <FaClock size={11} />
                                {(bill.todo_pending_count ?? 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">
                                    {bill.todo_pending_count}
                                  </span>
                                )}
                              </button>

                              <button
                                onClick={() => openModal(bill)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white transition-colors bg-teal-600 hover:bg-teal-700 dark:bg-teal-500"
                              >
                                <FaExchangeAlt className="inline mr-1" size={9} />ປ່ຽນ
                              </button>
                            </div>
                          </div>

                          {/* Footer row */}
                          <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-t border-slate-200/30 dark:border-white/5 bg-slate-500/[0.03] dark:bg-white/[0.015]">
                            <button
                              type="button"
                              onClick={(e) => setStatusMenu({ billNo: bill.doc_no, anchor: e.currentTarget })}
                              title="ປ່ຽນສະຖານະ"
                            >
                              {bill.action_status && ACTION_STATUS_MAP[bill.action_status] ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    ACTION_STATUS_MAP[bill.action_status].color === "rose"
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                      : ACTION_STATUS_MAP[bill.action_status].color === "amber"
                                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                      : ACTION_STATUS_MAP[bill.action_status].color === "orange"
                                      ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
                                      : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                                  }`}
                                >
                                  {ACTION_STATUS_MAP[bill.action_status].label}
                                  <FaChevronDown size={7} className="opacity-60" />
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-slate-500 border border-dashed border-slate-300 dark:border-slate-600 hover:bg-slate-500/5">
                                  + ໝາຍສະຖານະ
                                </span>
                              )}
                            </button>

                            {bill.partial_delivery && (
                              <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                                ກຳລັງທະຍອຍສົ່ງ
                              </span>
                            )}

                            {bill.schedule_remark && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300" title={bill.schedule_remark}>
                                <FaStickyNote size={9} className="text-amber-500 shrink-0" />
                                <span className="truncate max-w-[260px]">{bill.schedule_remark}</span>
                              </span>
                            )}

                            {/* Mobile-only fallbacks */}
                            <span className="sm:hidden inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                              {fmtQty(bill.remaining_qty_total)} qty · {bill.remaining_count} ລາຍການ
                            </span>
                            {bill.time_use && (
                              <span className={`md:hidden inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${durColor(bill.time_use)}`}>
                                {fmtDur(bill.time_use)}
                              </span>
                            )}

                            <button
                              onClick={() =>
                                setScheduleBill({
                                  billNo: bill.doc_no,
                                  defaults: {
                                    scheduled_date: bill.scheduled_date ?? null,
                                    remark: bill.schedule_remark ?? "",
                                    updated_by: bill.schedule_updated_by ?? "",
                                    updated_at: bill.schedule_updated_at ?? null,
                                  },
                                })
                              }
                              className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors ${
                                bill.scheduled_date_display
                                  ? "text-slate-500 hover:text-slate-700 hover:bg-slate-500/10 dark:text-slate-400 dark:hover:text-slate-200"
                                  : "text-amber-600 dark:text-amber-400 font-semibold hover:bg-amber-500/10"
                              }`}
                              title="ກຳນົດ/ແກ້ໄຂ ວັນຈັດສົ່ງ"
                            >
                              <FaCalendar size={9} />
                              {bill.scheduled_date_display ? "ແກ້ໄຂວັນສົ່ງ" : "ກຳນົດວັນສົ່ງ"}
                              {bill.scheduled_date_overridden && (
                                <span className="text-amber-600 dark:text-amber-400">(ແກ້)</span>
                              )}
                            </button>
                          </div>

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
                  </div>
                </section>
              );
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="glass rounded-lg flex items-center justify-between px-4 py-2.5">
              <p className="text-[11px] text-slate-500">
                {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, sorted.length)} / {sorted.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage((v) => Math.max(1, v - 1))} disabled={currentPage === 1} className="px-2.5 py-1 text-[11px] font-medium rounded glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">ກ່ອນ</button>
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === pages || Math.abs(p - currentPage) <= 2)
                  .map((p, i, arr) => (
                    <span key={p}>
                      {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-slate-400">...</span>}
                      <button onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${p === currentPage ? "text-white bg-teal-600 dark:bg-teal-500" : "glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5"}`}>{p}</button>
                    </span>
                  ))}
                <button onClick={() => setCurrentPage((v) => Math.min(pages, v + 1))} disabled={currentPage === pages} className="px-2.5 py-1 text-[11px] font-medium rounded glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">ຕໍ່ໄປ</button>
              </div>
            </div>
          )}
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
                  {transports.map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}
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

      <PendingBillScheduleDialog
        open={scheduleBill !== null}
        billNo={scheduleBill?.billNo ?? null}
        initial={scheduleBill?.defaults ?? null}
        onClose={() => setScheduleBill(null)}
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
        currentRemark={
          statusMenu
            ? bills.find((b) => b.doc_no === statusMenu.billNo)?.schedule_remark ?? ""
            : ""
        }
        anchorEl={statusMenu?.anchor ?? null}
        onClose={() => setStatusMenu(null)}
        onSaved={() => void fetchBills()}
      />
    </div>
  );
}

function StatusMenu({
  billNo,
  currentStatus,
  currentRemark,
  anchorEl,
  onClose,
  onSaved,
}: {
  billNo: string | null;
  currentStatus: string;
  currentRemark: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickedStatus, setPickedStatus] = useState<string>("");
  const [remark, setRemark] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const open = billNo !== null && anchorEl !== null;

  useEffect(() => {
    if (!open) return;
    setPickedStatus(currentStatus ?? "");
    setRemark(currentRemark ?? "");
  }, [open, currentStatus, currentRemark]);

  useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const w = 280;
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

  const save = async (clear = false) => {
    if (!billNo) return;
    setSaving(true);
    try {
      await Actions.upsertPendingBillSchedule({
        bill_no: billNo,
        action_status: clear ? null : pickedStatus || null,
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

  if (!open || !pos) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[280px] glass rounded-lg shadow-xl border border-slate-200/40 dark:border-white/10 overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-3 py-2 bg-white/40 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
          ສະຖານະບິນ
        </p>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
        >
          <FaTimes size={9} />
        </button>
      </div>

      <div className="p-2 space-y-1">
        {ACTION_STATUSES.map((s) => {
          const active = pickedStatus === s.key;
          return (
            <button
              key={s.key}
              type="button"
              disabled={saving}
              onClick={() => setPickedStatus(s.key)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors ${
                active
                  ? s.color === "rose"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/40"
                    : s.color === "amber"
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 ring-1 ring-amber-500/40"
                    : "bg-sky-500/15 text-sky-700 dark:text-sky-400 ring-1 ring-sky-500/40"
                  : "text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  s.color === "rose"
                    ? "bg-rose-500"
                    : s.color === "amber"
                    ? "bg-amber-500"
                    : "bg-sky-500"
                }`}
              />
              {s.label}
              {active && <FaCheck size={9} className="ml-auto" />}
            </button>
          );
        })}
      </div>

      <div className="px-3 pt-1 pb-2 border-t border-slate-200/30 dark:border-white/5">
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
      </div>

      <div className="px-3 py-2 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={saving || (!currentStatus && !currentRemark)}
          onClick={() => void save(true)}
          className="px-2 py-1 text-[11px] font-semibold rounded text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 inline-flex items-center gap-1"
          title="ລ້າງສະຖານະ + ໝາຍເຫດ"
        >
          <FaTrash size={8} /> ລ້າງ
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
          className="px-3 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 inline-flex items-center gap-1"
        >
          {saving ? <FaSpinner className="animate-spin" size={9} /> : <FaCheck size={9} />}
          ບັນທຶກ
        </button>
      </div>
    </div>
  );
}

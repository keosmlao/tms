"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  FaBox,
  FaBoxOpen,
  FaBuilding,
  FaCalendar,
  FaChevronDown,
  FaChevronRight,
  FaFileExcel,
  FaFileInvoice,
  FaListUl,
  FaSearch,
  FaSpinner,
  FaTruck,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { exportToExcel } from "@/lib/excel-export";

export interface AttemptItem {
  item_code: string;
  item_name: string;
  qty: number | string;
  selected_qty: number | string;
  delivered_qty: number | string;
  unit_code: string;
}

// Shared row shape for all three daily-status reports. The pending report
// supplies the "remaining_*" fields; the delivered/cancelled reports leave
// them at zero and surface item_count + finished_time instead.
export interface StatusRow {
  // Date dimension
  primary_date: string;       // YYYY-MM-DD (sortable)
  primary_date_display: string; // DD-MM-YYYY (rendered)
  finished_time?: string;     // delivered/cancelled only — HH:MM
  // Group dimensions
  department: string;
  transport_code: string;
  transport: string;
  // Bill identity
  doc_no: string;
  bill_no?: string;
  customer: string;
  sale: string;
  // Driver/car (delivered/cancelled only)
  car?: string;
  driver?: string;
  // Counts
  item_count: number;
  remaining_count?: number;
  remaining_qty_total?: number;
  // Pending-only metadata
  scheduled_date_display?: string;
  action_status?: string;
  // Cancel-only
  remark?: string;
}

export interface StatusReportData {
  rows: StatusRow[];
  days: string[];
  departments: string[];
  transports: string[];
  totals: { bills: number; items: number };
}

type GroupBy = "date_dept_transport" | "department" | "transport" | "trip";

interface Props {
  /** Page title shown in the hero */
  title: string;
  /** One-line subtitle under the title */
  subtitle: string;
  /** Hero icon (overlays the rounded badge) */
  icon: React.ReactNode;
  /** Tailwind hue used for hero accents + primary buttons */
  tone: "amber" | "emerald" | "rose";
  /** Excel filename prefix (date suffix appended automatically) */
  filenamePrefix: string;
  /** Loader: server action returning the per-bill rows */
  fetcher: (fromDate: string, toDate: string) => Promise<StatusReportData>;
  /** True for pending report — adds the "ກຳນົດສົ່ງ" column + remaining qty */
  showRemaining?: boolean;
  /** True for delivered/cancelled — adds finished_time + driver column */
  showFinished?: boolean;
  /** True for cancelled — surfaces the cancel remark column */
  showRemark?: boolean;
  /** Optional fetcher for the per-bill detail (item list). When supplied,
   *  rows become expandable and clicking them lazy-loads + caches items. */
  fetchDetails?: (row: StatusRow) => Promise<AttemptItem[]>;
}

const TONE_CLASSES: Record<Props["tone"], { hero: string; ribbon: string; primary: string; chip: string }> = {
  amber: {
    hero: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    ribbon: "bg-amber-500/10",
    primary: "bg-amber-600 hover:bg-amber-700",
    chip: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  },
  emerald: {
    hero: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
    ribbon: "bg-emerald-500/10",
    primary: "bg-emerald-600 hover:bg-emerald-700",
    chip: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  },
  rose: {
    hero: "from-rose-500/20 to-pink-500/20 ring-rose-300/30 text-rose-100",
    ribbon: "bg-rose-500/10",
    primary: "bg-rose-600 hover:bg-rose-700",
    chip: "bg-rose-600/15 text-rose-700 dark:text-rose-400",
  },
};

function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}

export function DailyStatusReport({
  title,
  subtitle,
  icon,
  tone,
  filenamePrefix,
  fetcher,
  showRemaining = false,
  showFinished = false,
  showRemark = false,
  fetchDetails,
}: Props) {
  const tc = TONE_CLASSES[tone];
  const [data, setData] = useState<StatusReportData | null>(null);
  const [fromDate, setFromDate] = useState(() => getFixedTodayDate());
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>("date_dept_transport");
  const [searchText, setSearchText] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [transportFilter, setTransportFilter] = useState<string>("all");
  // Expand state keyed by `${doc_no}|${bill_no}` so a bill that appears in
  // multiple trip rows toggles independently.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [itemsByKey, setItemsByKey] = useState<Record<string, AttemptItem[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const detailKey = (r: StatusRow) => `${r.doc_no}|${r.bill_no ?? ""}`;
  const toggleDetails = async (row: StatusRow) => {
    if (!fetchDetails) return;
    const key = detailKey(row);
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (itemsByKey[key]) return;
    setLoadingKey(key);
    try {
      const items = await fetchDetails(row);
      setItemsByKey((c) => ({ ...c, [key]: items ?? [] }));
    } catch (e) {
      console.error(e);
      setItemsByKey((c) => ({ ...c, [key]: [] }));
    } finally {
      setLoadingKey(null);
    }
  };

  const fetchData = () => {
    setLoading(true);
    fetcher(fromDate, toDate)
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = searchText.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (deptFilter !== "all" && r.department !== deptFilter) return false;
      if (transportFilter !== "all" && r.transport !== transportFilter) return false;
      if (!q) return true;
      return (
        r.doc_no.toLowerCase().includes(q) ||
        (r.bill_no ?? "").toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.transport.toLowerCase().includes(q)
      );
    });
  }, [data, searchText, deptFilter, transportFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; sub: string; bills: number; items: number; rows: StatusRow[] }>();
    for (const r of filteredRows) {
      let key: string;
      let label: string;
      let sub: string;
      if (groupBy === "department") {
        key = r.department;
        label = r.department;
        sub = "ພະແນກ";
      } else if (groupBy === "transport") {
        key = r.transport;
        label = r.transport;
        sub = "ຂົນສົ່ງ";
      } else if (groupBy === "trip") {
        // Group by trip number (doc_no): one box per trip listing all bills
        // dispatched in it. Useful when a trip carried multiple bills.
        key = r.doc_no;
        label = `ຖ້ຽວ ${r.doc_no} · ${r.transport}${r.driver ? ` · ${r.driver}` : ""}`;
        sub = "ຖ້ຽວ";
      } else {
        key = `${r.primary_date_display}|${r.department}|${r.transport}`;
        label = `${r.primary_date_display} · ${r.department} · ${r.transport}`;
        sub = "ວັນ · ພະແນກ · ຂົນສົ່ງ";
      }
      const g = map.get(key) ?? { label, sub, bills: 0, items: 0, rows: [] };
      g.bills += 1;
      g.items += r.item_count;
      g.rows.push(r);
      map.set(key, g);
    }
    return Array.from(map.entries()).map(([key, g]) => ({ key, ...g }));
  }, [filteredRows, groupBy]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.bills += 1;
        acc.items += r.item_count;
        return acc;
      },
      { bills: 0, items: 0 }
    );
  }, [filteredRows]);

  const handleExport = () => {
    if (filteredRows.length === 0) return;
    type ExcelRow = {
      no: number;
      date: string;
      time: string;
      department: string;
      transport: string;
      bill_no: string;
      doc_no: string;
      customer: string;
      sale: string;
      car: string;
      driver: string;
      scheduled_date: string;
      item_count: number;
      remaining_count: number;
      remark: string;
    };
    const allColumns: { key: keyof ExcelRow; header: string; width?: number }[] = [
      { key: "no", header: "#", width: 6 },
      { key: "date", header: "ວັນທີ", width: 14 },
      ...(showFinished ? [{ key: "time" as const, header: "ເວລາ", width: 8 }] : []),
      { key: "department", header: "ພະແນກ", width: 22 },
      { key: "transport", header: "ຂົນສົ່ງ", width: 22 },
      { key: "bill_no", header: "ເລກບິນ", width: 16 },
      { key: "doc_no", header: "ເລກຖ້ຽວ", width: 16 },
      { key: "customer", header: "ລູກຄ້າ", width: 30 },
      { key: "sale", header: "ພະນັກງານຂາຍ", width: 18 },
      ...(showFinished
        ? [
            { key: "car" as const, header: "ລົດ", width: 14 },
            { key: "driver" as const, header: "ຄົນຂັບ", width: 18 },
          ]
        : []),
      ...(showRemaining
        ? [{ key: "scheduled_date" as const, header: "ກຳນົດສົ່ງ", width: 14 }]
        : []),
      { key: "item_count", header: "ລາຍການ", width: 10 },
      ...(showRemaining
        ? [{ key: "remaining_count" as const, header: "ເຫຼືອ", width: 10 }]
        : []),
      ...(showRemark ? [{ key: "remark" as const, header: "ໝາຍເຫດ", width: 30 }] : []),
    ];
    exportToExcel<ExcelRow>(
      `${filenamePrefix}_${fromDate}_to_${toDate}`,
      filteredRows.map((r, i) => ({
        no: i + 1,
        date: r.primary_date_display,
        time: r.finished_time ?? "",
        department: r.department,
        transport: r.transport,
        bill_no: r.bill_no ?? r.doc_no,
        doc_no: r.bill_no ? r.doc_no : "",
        customer: r.customer,
        sale: r.sale,
        car: r.car ?? "",
        driver: r.driver ?? "",
        scheduled_date: r.scheduled_date_display ?? "",
        item_count: r.item_count,
        remaining_count: r.remaining_count ?? 0,
        remark: r.remark ?? "",
      })),
      allColumns
    );
  };

  const dateColLabel = showFinished ? "ວັນສຳເລັດ" : "ວັນຈັດສົ່ງ";

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-lg bg-[#003260] p-5 shadow-xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 10%, #f6921e 0%, transparent 35%), radial-gradient(circle at 90% 80%, #5ea9e4 0%, transparent 35%)",
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              {icon}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                {subtitle}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                {title}
              </h1>
            </div>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${tc.hero} backdrop-blur border border-white/10 px-3 py-1.5 ring-1 text-[11px]`}>
                <span className="opacity-80">ບິນທັງໝົດ</span>
                <span className="font-bold text-white tabular-nums">{fmtNum(filteredTotals.bills)}</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500/20 to-cyan-500/20 backdrop-blur border border-white/10 px-3 py-1.5 ring-1 ring-sky-300/30 text-[11px] text-sky-100">
                <span className="opacity-80">ລາຍການ</span>
                <span className="font-bold text-white tabular-nums">{fmtNum(filteredTotals.items)}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filter form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchData();
        }}
        className="glass rounded-lg p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar size={10} /> ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar size={10} /> ຫາວັນທີ
            </label>
            <input
              type="date"
              value={toDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg ${tc.primary} px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-colors`}
            >
              {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
              ດຶງຂໍ້ມູນ
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || !data || filteredRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-colors"
              title="Export to Excel"
            >
              <FaFileExcel size={12} /> Excel
            </button>
          </div>
        </div>
      </form>

      {/* Grouping + filters */}
      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg glass p-1">
            {([
              { key: "date_dept_transport" as const, label: "ວັນ × ພະແນກ × ຂົນສົ່ງ" },
              { key: "department" as const, label: "ພະແນກ" },
              { key: "transport" as const, label: "ຂົນສົ່ງ" },
              { key: "trip" as const, label: "ຖ້ຽວ" },
            ]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setGroupBy(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  groupBy === opt.key
                    ? "glass-heavy"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg glass-input px-3 py-1.5 text-xs"
          >
            <option value="all">ທຸກພະແນກ</option>
            {data.departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={transportFilter}
            onChange={(e) => setTransportFilter(e.target.value)}
            className="rounded-lg glass-input px-3 py-1.5 text-xs"
          >
            <option value="all">ທຸກຂົນສົ່ງ</option>
            {data.transports.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ຄົ້ນຫາ: ເລກບິນ, ລູກຄ້າ..."
              className="w-full pl-9 pr-3 py-1.5 glass-input rounded-lg text-xs"
            />
          </div>
        </div>
      )}

      {/* Body */}
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 rounded-lg glass">
          <FaSpinner className="animate-spin text-amber-500" size={14} />
          <span className="text-sm text-slate-500">ກຳລັງໂຫຼດ...</span>
        </div>
      ) : !data || filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <FaListUl className="text-slate-300 text-3xl mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ບໍ່ມີຂໍ້ມູນ</p>
          <p className="text-xs text-slate-400 mt-1">ລອງປ່ຽນຊ່ວງວັນທີ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.key} className="rounded-lg glass overflow-hidden">
              <div className={`px-5 py-3 ${tc.ribbon} border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{g.sub}</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{g.label}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-full ${tc.chip} px-2.5 py-0.5 text-[10px] font-bold tabular-nums`}>
                    <FaFileInvoice size={9} /> {fmtNum(g.bills)} ບິນ
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                    <FaBoxOpen size={9} /> {fmtNum(g.items)} ລາຍການ
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/30 dark:bg-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200/30 dark:border-white/5">
                      {fetchDetails && <th className="px-3 py-2 text-left w-8" />}
                      <th className="px-3 py-2 text-left w-10">#</th>
                      <th className="px-3 py-2 text-left">ບິນ</th>
                      {groupBy !== "trip" && <th className="px-3 py-2 text-left">ຖ້ຽວ</th>}
                      <th className="px-3 py-2 text-left">ລູກຄ້າ</th>
                      {groupBy !== "department" && (
                        <th className="px-3 py-2 text-left">ພະແນກ</th>
                      )}
                      {groupBy !== "transport" && (
                        <th className="px-3 py-2 text-left">ຂົນສົ່ງ</th>
                      )}
                      {showFinished && <th className="px-3 py-2 text-left">ຄົນຂັບ</th>}
                      <th className="px-3 py-2 text-left">{dateColLabel}</th>
                      {showRemark && <th className="px-3 py-2 text-left">ໝາຍເຫດ</th>}
                      <th className="px-3 py-2 text-right">ລາຍການ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                    {g.rows.map((r, i) => {
                      const key = detailKey(r);
                      const isOpen = expandedKey === key;
                      const isLoading = loadingKey === key;
                      const items = itemsByKey[key];
                      const colSpan =
                        (fetchDetails ? 1 : 0) +
                        4 + // #, bill, customer, date, items
                        (groupBy !== "trip" ? 1 : 0) + // trip column
                        (groupBy !== "department" ? 1 : 0) +
                        (groupBy !== "transport" ? 1 : 0) +
                        (showFinished ? 1 : 0) +
                        (showRemark ? 1 : 0);
                      return (
                        <Fragment key={`${r.doc_no}-${r.bill_no ?? "_"}-${i}`}>
                          <tr
                            className={`${fetchDetails ? "cursor-pointer" : ""} hover:bg-white/30 dark:hover:bg-white/5 ${
                              isOpen ? `${tc.ribbon}` : ""
                            }`}
                            onClick={() => toggleDetails(r)}
                          >
                            {fetchDetails && (
                              <td className="px-3 py-2 text-slate-400">
                                {isLoading ? (
                                  <FaSpinner className="animate-spin" size={10} />
                                ) : isOpen ? (
                                  <FaChevronDown size={10} />
                                ) : (
                                  <FaChevronRight size={10} />
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2 text-[10px] text-slate-400 tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2 text-xs font-bold text-slate-900 dark:text-white">
                              {r.bill_no || r.doc_no}
                            </td>
                            {groupBy !== "trip" && (
                              <td className="px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                                {r.bill_no ? r.doc_no : "-"}
                              </td>
                            )}
                            <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-200 truncate max-w-[200px]" title={r.customer}>
                              {r.customer}
                            </td>
                            {groupBy !== "department" && (
                              <td className="px-3 py-2 text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <FaBuilding size={9} className="text-emerald-500" />
                                  {r.department}
                                </span>
                              </td>
                            )}
                            {groupBy !== "transport" && (
                              <td className="px-3 py-2 text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <FaTruck size={9} className="text-sky-500" />
                                  {r.transport}
                                </span>
                              </td>
                            )}
                            {showFinished && (
                              <td className="px-3 py-2 text-xs text-slate-600">
                                {r.driver ?? "-"}
                              </td>
                            )}
                            <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                              {r.primary_date_display}
                              {r.finished_time && (
                                <span className="ml-1 text-[10px] text-slate-400">{r.finished_time}</span>
                              )}
                            </td>
                            {showRemark && (
                              <td className="px-3 py-2 text-xs text-slate-600 truncate max-w-[200px]" title={r.remark}>
                                {r.remark || "-"}
                              </td>
                            )}
                            <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                              {fmtNum(r.item_count)}
                            </td>
                          </tr>
                          {fetchDetails && isOpen && (
                            <tr className={tc.ribbon}>
                              <td colSpan={colSpan} className="px-5 py-3">
                                {isLoading ? (
                                  <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                    <FaSpinner className="animate-spin" size={11} /> ກຳລັງໂຫຼດລາຍລະອຽດ...
                                  </div>
                                ) : !items || items.length === 0 ? (
                                  <div className="text-xs text-slate-400 py-2">ບໍ່ມີລາຍການສິນຄ້າ</div>
                                ) : (
                                  <div className="rounded-md border border-slate-200/40 dark:border-white/5 bg-white/60 dark:bg-white/5 divide-y divide-slate-200/30 dark:divide-white/5">
                                    {items.map((p, pi) => {
                                      const sent = Number(p.selected_qty ?? p.qty ?? 0);
                                      const delivered = Number(p.delivered_qty ?? 0);
                                      // Cancelled bills: every line is rejected; otherwise compare delivered vs sent.
                                      const isCancelled = tone === "rose";
                                      const allDelivered = !isCancelled && delivered > 0 && delivered >= sent;
                                      const partial = !isCancelled && delivered > 0 && delivered < sent;
                                      const qtyColor = isCancelled
                                        ? "text-rose-500"
                                        : allDelivered
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : partial
                                            ? "text-amber-600 dark:text-amber-400"
                                            : "text-slate-600 dark:text-slate-300";
                                      const display = (delivered > 0 && delivered !== sent)
                                        ? `${delivered}/${sent}`
                                        : sent;
                                      return (
                                        <div key={`${p.item_code}-${pi}`} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
                                          <FaBox size={9} className={
                                            allDelivered ? "text-emerald-500"
                                            : partial ? "text-amber-500"
                                            : isCancelled ? "text-rose-500"
                                            : "text-slate-400"
                                          } />
                                          <span className="text-[10px] text-slate-400 tabular-nums w-6">{pi + 1}</span>
                                          <span className="font-mono text-[10px] text-slate-500">{p.item_code}</span>
                                          <span className={`flex-1 truncate ${
                                            isCancelled ? "text-rose-600/80 line-through" : "text-slate-700 dark:text-slate-300"
                                          }`} title={p.item_name}>
                                            {p.item_name || p.item_code}
                                          </span>
                                          <span className={`tabular-nums font-semibold ${qtyColor}`}>
                                            {typeof display === "number" ? display.toLocaleString("en-US") : display}
                                          </span>
                                          <span className="text-[10px] text-slate-400 shrink-0">{p.unit_code}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

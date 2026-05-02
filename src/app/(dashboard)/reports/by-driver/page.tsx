"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendar,
  FaChartBar,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaIdCard,
  FaListUl,
  FaMapMarkerAlt,
  FaPhone,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTruck,
  FaUser,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { WhatsappLink, buildBillWhatsappMessage } from "@/components/whatsapp-link";
// Ported from server actions: getJobBillsWithProducts, getReportByDriver

// ==================== Types ====================

interface Driver {
  code: string;
  name_1: string;
}

interface ReportItem {
  doc_date: string;
  doc_no: string;
  car: string;
  driver: string;
  item_bill: number;
  status: string;
  job_code: string;
  job_status?: number;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

interface BillDetail {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  count_item: number;
  telephone: string;
  products: Product[];
}

// ==================== Helpers ====================

const STATUS_TONES: Record<number, { bg: string; dot: string }> = {
  0: { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  1: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  2: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  3: { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  4: { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
};
const DEFAULT_TONE = { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" };

function inferStatusTone(status: string, jobStatus?: number) {
  if (jobStatus != null && STATUS_TONES[jobStatus]) return STATUS_TONES[jobStatus];
  if (status.includes("ສຳເລັດ") || status.includes("ປິດງານ")) return STATUS_TONES[3];
  if (status.includes("ກຳລັງ")) return STATUS_TONES[2];
  if (status.includes("ຮັບ")) return STATUS_TONES[1];
  if (status.includes("ລໍ")) return STATUS_TONES[0];
  if (status.includes("admin")) return STATUS_TONES[4];
  return DEFAULT_TONE;
}

// ==================== UI pieces ====================

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "teal" | "emerald" | "amber" | "sky";
}) {
  const palette = {
    teal: "from-teal-500/20 to-teal-400/20 ring-teal-300/30 text-teal-100",
    emerald: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
    amber: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    sky: "from-sky-500/20 to-cyan-500/20 ring-sky-300/30 text-sky-100",
  }[color];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${palette} backdrop-blur border border-white/10 px-3 py-1.5 ring-1 text-[11px]`}
    >
      <span className="opacity-80">{label}</span>
      <span className="font-bold text-white tabular-nums">{value}</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  caption,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: "teal" | "sky" | "amber" | "emerald";
  caption?: string;
}) {
  const palette = {
    teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  }[color];
  return (
    <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums truncate ${palette.text}`}>{value}</p>
        {caption && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{caption}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg ${palette.bg} ${palette.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

// ==================== Main ====================

export default function ByDriverReportPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fromDate, setFromDate] = useState(() => getFixedTodayDate());
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [billDetails, setBillDetails] = useState<BillDetail[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    Actions.getReportByDriver(fromDate, toDate)
      .then((data) => setDrivers((data.drivers || []) as Driver[]))
      .catch(console.error);
  }, [fromDate, toDate]);

  const fetchItems = () => {
    if (!driverId) return;
    setLoading(true);
    setSearched(true);
    setCurrentPage(1);
    setExpandedDoc(null);
    Actions.getReportByDriver(fromDate, toDate, driverId)
      .then((data) => setItems((data.listitem || []) as ReportItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const toggleBillDetails = async (docNo: string) => {
    if (expandedDoc === docNo) {
      setExpandedDoc(null);
      setBillDetails([]);
      return;
    }
    setExpandedDoc(docNo);
    setLoadingBills(true);
    try {
      const data = await Actions.getJobBillsWithProducts(docNo);
      setBillDetails(data as BillDetail[]);
    } catch (e) {
      console.error(e);
      setBillDetails([]);
    } finally {
      setLoadingBills(false);
    }
  };

  const selectedDriver = useMemo(() => drivers.find((d) => d.code === driverId), [drivers, driverId]);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.doc_no.toLowerCase().includes(q) ||
        i.car?.toLowerCase().includes(q) ||
        i.status?.toLowerCase().includes(q)
    );
  }, [items, searchText]);

  const stats = useMemo(() => {
    const total = items.length;
    const totalBills = items.reduce((sum, i) => sum + Number(i.item_bill || 0), 0);
    const completed = items.filter(
      (i) => (typeof i.job_status === "number" && i.job_status >= 3) ||
        i.status.includes("ສຳເລັດ") || i.status.includes("ປິດງານ")
    ).length;
    const inProgress = items.filter(
      (i) => (typeof i.job_status === "number" && (i.job_status === 1 || i.job_status === 2)) ||
        i.status.includes("ກຳລັງ") || i.status.includes("ຮັບ")
    ).length;
    return { total, totalBills, completed, inProgress };
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / perPage));
  const pagedItems = filteredItems.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <div className="space-y-5">
      {/* ========== HERO ========== */}
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 sm:p-6 shadow-xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 10%, #a78bfa 0%, transparent 35%), radial-gradient(circle at 90% 80%, #60a5fa 0%, transparent 35%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <FaUser className="text-sky-300" size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                Driver Performance Report
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">ລາຍງານຕາມຄົນຂັບລົດ</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ເບິ່ງປະຫວັດການຈັດສົ່ງຂອງຄົນຂັບແຕ່ລະຄົນຕາມຊ່ວງວັນທີ
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <StatBadge label="ຖ້ຽວ" value={stats.total} color="sky" />
              <StatBadge label="ບິນ" value={stats.totalBills} color="sky" />
              <StatBadge label="ກຳລັງສົ່ງ" value={stats.inProgress} color="amber" />
              <StatBadge label="ສຳເລັດ" value={stats.completed} color="emerald" />
            </div>
          )}
        </div>
      </div>

      {/* ========== FILTER FORM ========== */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchItems();
        }}
        className="glass rounded-lg p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 items-end">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar size={10} className="text-slate-400" />
              ຈາກວັນທີ
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
              <FaCalendar size={10} className="text-slate-400" />
              ຫາວັນທີ
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
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaIdCard size={10} className="text-slate-400" />
              ຄົນຂັບ
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            >
              <option value="">-- ເລືອກຄົນຂັບ --</option>
              {drivers.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name_1}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!driverId || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </div>
      </form>

      {/* ========== SELECTED DRIVER BANNER ========== */}
      {selectedDriver && items.length > 0 && (
        <div className="rounded-lg glass-subtle p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg glass flex items-center justify-center">
              <FaUser className="text-sky-600 dark:text-sky-400" size={14} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500 dark:text-sky-400">ຄົນຂັບ</p>
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {selectedDriver.name_1} <span className="text-slate-400 font-mono text-xs">· {selectedDriver.code}</span>
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            {fromDate} → {toDate}
          </p>
        </div>
      )}

      {/* ========== RESULTS ========== */}
      {!searched ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <div className="w-14 h-14 rounded-lg bg-sky-500/10 flex items-center justify-center mb-3">
            <FaChartBar className="text-sky-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700">ເລືອກຄົນຂັບເພື່ອເບິ່ງລາຍງານ</p>
          <p className="text-xs text-slate-400 mt-1">ກຳນົດຊ່ວງວັນທີ ແລ້ວເລືອກຄົນຂັບ ແລ້ວກົດຄົ້ນຫາ</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 rounded-lg glass">
          <FaSpinner className="animate-spin text-teal-500" size={14} />
          <span className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <div className="w-14 h-14 rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
            <FaListUl className="text-slate-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700">ບໍ່ມີຂໍ້ມູນ</p>
          <p className="text-xs text-slate-400 mt-1">ລອງປ່ຽນຊ່ວງວັນທີ ຫຼື ເລືອກຄົນຂັບອື່ນ</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="ຖ້ຽວທັງໝົດ"
              value={stats.total}
              icon={<FaRoute size={12} />}
              color="teal"
            />
            <SummaryCard
              label="ບິນທັງໝົດ"
              value={stats.totalBills}
              icon={<FaBoxOpen size={12} />}
              color="sky"
            />
            <SummaryCard
              label="ກຳລັງສົ່ງ"
              value={stats.inProgress}
              icon={<FaClock size={12} />}
              color="amber"
            />
            <SummaryCard
              label="ສຳເລັດ"
              value={stats.completed}
              icon={<FaCheckCircle size={12} />}
              color="emerald"
            />
          </div>

          {/* Sub-search */}
          <div className="relative">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
            <input
              type="text"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="ຄົ້ນຫາໃນຜົນ: ເລກຖ້ຽວ, ລົດ, ສະຖານະ..."
              className="w-full pl-9 pr-9 py-2.5 glass-input rounded-lg text-sm"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label="Clear"
              >
                <FaTimes size={10} />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Journey Log</p>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍການຖ້ຽວ</h2>
              </div>
              <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                {filteredItems.length} / {items.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2.5 text-left w-8" aria-label="Expand" />
                    <th className="px-3 py-2.5 text-left w-10">#</th>
                    <th className="px-3 py-2.5 text-left">ວັນທີ</th>
                    <th className="px-3 py-2.5 text-left">ເລກທີ</th>
                    <th className="px-3 py-2.5 text-left">ລົດ</th>
                    <th className="px-3 py-2.5 text-left">ຄົນຂັບ</th>
                    <th className="px-3 py-2.5 text-center">ບິນ</th>
                    <th className="px-3 py-2.5 text-left">ສະຖານະ</th>
                    <th className="px-3 py-2.5 text-left">ວັນທີປິດ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                  {pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-400">
                        ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map((item, index) => {
                      const tone = inferStatusTone(item.status, item.job_status);
                      const isExpanded = expandedDoc === item.doc_no;
                      const rowNumber = (currentPage - 1) * perPage + index + 1;
                      return (
                        <Fragment key={item.doc_no}>
                          <tr
                            className={`transition-colors cursor-pointer ${
                              isExpanded ? "bg-teal-500/5" : "hover:bg-white/30 dark:hover:bg-white/5"
                            }`}
                            onClick={() => toggleBillDetails(item.doc_no)}
                          >
                            <td className="px-3 py-3 w-8">
                              <span
                                className={`inline-flex w-6 h-6 rounded-md items-center justify-center transition-colors ${
                                  isExpanded ? "bg-teal-500/10 text-teal-600 dark:text-teal-400" : "text-slate-400"
                                }`}
                              >
                                {isExpanded ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                                {rowNumber}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600 text-xs">{item.doc_date}</td>
                            <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">{item.doc_no}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                <FaTruck size={10} className="text-sky-500" />
                                <span className="font-medium truncate">{item.car || "-"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                <FaIdCard size={10} className="text-sky-500" />
                                <span className="truncate">{item.driver || "-"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold tabular-nums">
                                {item.item_bill}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${tone.bg}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                                {item.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500">{item.job_code || "-"}</td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-white/20 dark:bg-white/5">
                              <td colSpan={9} className="px-4 pb-4 pt-2 border-t border-slate-200/30 dark:border-white/5">
                                {loadingBills ? (
                                  <div className="flex items-center justify-center gap-2 py-5">
                                    <FaSpinner className="animate-spin text-teal-500" size={13} />
                                    <span className="text-xs text-slate-500">ກຳລັງໂຫຼດລາຍລະອຽດ...</span>
                                  </div>
                                ) : billDetails.length === 0 ? (
                                  <p className="py-5 text-center text-xs text-slate-400">ບໍ່ມີລາຍການບິນ</p>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                                      <FaBoxOpen size={11} className="text-teal-500" />
                                      ລາຍການບິນ ({billDetails.length})
                                    </p>
                                    <div className="grid gap-2">
                                      {billDetails.map((bill, bi) => (
                                        <div key={bill.bill_no} className="rounded-lg glass overflow-hidden">
                                          <div className="flex items-center justify-between gap-2 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 px-3 py-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/10 text-[10px] font-bold text-teal-600 dark:text-teal-400 shrink-0">
                                                {bi + 1}
                                              </span>
                                              <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{bill.bill_no}</p>
                                                <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                                                  <FaMapMarkerAlt size={8} className="text-slate-400" />
                                                  {bill.bill_date} · {bill.cust_name || bill.cust_code}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {bill.telephone && (
                                                <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                                                  <FaPhone size={8} />
                                                  {bill.telephone}
                                                  <WhatsappLink
                                                    phone={bill.telephone}
                                                    message={buildBillWhatsappMessage({
                                                      billNo: bill.bill_no,
                                                      customerName: bill.cust_name,
                                                      trackingUrl: `/track?bill=${encodeURIComponent(bill.bill_no)}`,
                                                    })}
                                                  />
                                                </span>
                                              )}
                                              <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                                                {bill.count_item}
                                              </span>
                                            </div>
                                          </div>
                                          {bill.products.length > 0 && (
                                            <div className="p-2">
                                              <table className="w-full text-[10px]">
                                                <thead>
                                                  <tr className="text-slate-400 border-b border-slate-200/30 dark:border-white/5">
                                                    <th className="text-left py-1 pl-2 pr-1 font-medium w-6">#</th>
                                                    <th className="text-left py-1 px-1 font-medium">ລະຫັດ</th>
                                                    <th className="text-left py-1 px-1 font-medium">ຊື່ສິນຄ້າ</th>
                                                    <th className="text-right py-1 px-1 font-medium">ຈຳນວນ</th>
                                                    <th className="text-left py-1 pl-1 pr-2 font-medium">ຫົວໜ່ວຍ</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {bill.products.map((p, pi) => (
                                                    <tr key={`${bill.bill_no}-${p.item_code}-${pi}`} className="border-b border-slate-200/20 dark:border-white/5 last:border-0">
                                                      <td className="py-1 pl-2 pr-1 text-slate-400">{pi + 1}</td>
                                                      <td className="py-1 px-1 font-mono text-[9px] text-slate-500">{p.item_code}</td>
                                                      <td className="py-1 px-1 text-slate-700">{p.item_name}</td>
                                                      <td className="py-1 px-1 text-right font-semibold text-teal-600 tabular-nums">{p.qty}</td>
                                                      <td className="py-1 pl-1 pr-2 text-slate-500">{p.unit_code}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200/30 dark:border-white/5">
                <p className="text-[11px] text-slate-500">
                  ສະແດງ {(currentPage - 1) * perPage + 1}-
                  {Math.min(currentPage * perPage, filteredItems.length)} ຈາກ {filteredItems.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ກ່ອນ
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .map((p, i, arr) => (
                      <span key={p} className="inline-flex items-center">
                        {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-slate-400">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                            p === currentPage
                              ? "bg-teal-600 text-white shadow-sm"
                              : "glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ຕໍ່ໄປ
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

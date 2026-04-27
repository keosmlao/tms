"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBan,
  FaBoxOpen,
  FaCalendar,
  FaCheckCircle,
  FaClock,
  FaFileInvoice,
  FaIdCard,
  FaListUl,
  FaPlay,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTruck,
  FaUserTie,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getReportByBill

// ==================== Types ====================

interface ReportItem {
  doc_date: string;
  doc_no: string;
  bill_no: string;
  cust_code: string;
  status_trans: string;
  car: string;
  driver: string;
  count_item: number;
  remark: string;
  recipt_job: string;
  sent_start: string;
  sent_end: string;
}

type PhaseFilter = "all" | "waiting" | "inprogress" | "done" | "cancel";

// ==================== Helpers ====================

function classifyBill(status: string): Exclude<PhaseFilter, "all"> {
  if (status.includes("ສຳເລັດ")) return "done";
  if (status.includes("ຍົກເລີກ")) return "cancel";
  if (status.includes("ກຳລັງ")) return "inprogress";
  return "waiting";
}

const PHASE_STYLE: Record<Exclude<PhaseFilter, "all">, { bg: string; dot: string; label: string }> = {
  waiting: { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "ລໍຖ້າ" },
  inprogress: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500", label: "ກຳລັງສົ່ງ" },
  done: { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "ສຳເລັດ" },
  cancel: { bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400", dot: "bg-rose-500", label: "ຍົກເລີກ" },
};

// ==================== UI pieces ====================

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "teal" | "emerald" | "amber" | "sky" | "rose";
}) {
  const palette = {
    teal: "from-teal-500/20 to-teal-400/20 ring-teal-300/30 text-teal-100",
    emerald: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
    amber: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    sky: "from-sky-500/20 to-cyan-500/20 ring-sky-300/30 text-sky-100",
    rose: "from-rose-500/20 to-pink-500/20 ring-rose-300/30 text-rose-100",
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
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "teal" | "amber" | "sky" | "emerald" | "rose";
}) {
  const palette = {
    teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  }[color];
  return (
    <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${palette.text}`}>{value.toLocaleString("en-US")}</p>
      </div>
      <div className={`w-10 h-10 rounded-lg ${palette.bg} ${palette.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

// ==================== Main ====================

export default function ByBillReportPage() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fromDate, setFromDate] = useState(() => getFixedTodayDate());
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 25;

  const fetchItems = () => {
    setLoading(true);
    setCurrentPage(1);
    Actions.getReportByBill(fromDate, toDate)
      .then((data) => setItems(data as ReportItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    let waiting = 0,
      inprogress = 0,
      done = 0,
      cancel = 0;
    for (const item of items) {
      const phase = classifyBill(item.status_trans);
      if (phase === "waiting") waiting++;
      else if (phase === "inprogress") inprogress++;
      else if (phase === "done") done++;
      else cancel++;
    }
    return { total: items.length, waiting, inprogress, done, cancel };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && classifyBill(item.status_trans) !== filter) return false;
      if (!q) return true;
      return (
        item.doc_no.toLowerCase().includes(q) ||
        item.bill_no.toLowerCase().includes(q) ||
        item.cust_code?.toLowerCase().includes(q) ||
        item.car?.toLowerCase().includes(q) ||
        item.driver?.toLowerCase().includes(q)
      );
    });
  }, [items, searchText, filter]);

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
              <FaFileInvoice className="text-sky-300" size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                Bill Delivery Report
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">ລາຍງານການຈັດສົ່ງຕາມບິນ</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ເບິ່ງຂັ້ນຕອນການຈັດສົ່ງຂອງແຕ່ລະບິນ ຈາກຮັບຖ້ຽວຫາປິດງານ
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <StatBadge label="ບິນ" value={stats.total} color="sky" />
              <StatBadge label="ລໍ" value={stats.waiting} color="amber" />
              <StatBadge label="ກຳລັງ" value={stats.inprogress} color="sky" />
              <StatBadge label="ສຳເລັດ" value={stats.done} color="emerald" />
              <StatBadge label="ຍົກເລີກ" value={stats.cancel} color="rose" />
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
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
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
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </div>
      </form>

      {/* ========== BODY ========== */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 rounded-lg glass">
          <FaSpinner className="animate-spin text-teal-500" size={14} />
          <span className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <div className="w-14 h-14 rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
            <FaListUl className="text-slate-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ບໍ່ມີຂໍ້ມູນ</p>
          <p className="text-xs text-slate-400 mt-1">ລອງປ່ຽນຊ່ວງວັນທີ ແລ້ວຄົ້ນຫາໃໝ່</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <SummaryCard label="ບິນທັງໝົດ" value={stats.total} icon={<FaBoxOpen size={12} />} color="teal" />
            <SummaryCard label="ລໍຖ້າ" value={stats.waiting} icon={<FaClock size={12} />} color="amber" />
            <SummaryCard label="ກຳລັງສົ່ງ" value={stats.inprogress} icon={<FaPlay size={12} />} color="sky" />
            <SummaryCard label="ສຳເລັດ" value={stats.done} icon={<FaCheckCircle size={12} />} color="emerald" />
            <SummaryCard label="ຍົກເລີກ" value={stats.cancel} icon={<FaBan size={12} />} color="rose" />
          </div>

          {/* Search + filter tabs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
              <input
                type="text"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="ຄົ້ນຫາ: ເລກບິນ, ເລກຖ້ຽວ, ລູກຄ້າ, ລົດ, ຄົນຂັບ..."
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

            <div className="inline-flex items-center gap-1 rounded-lg glass p-1">
              {([
                { key: "all" as const, label: "ທັງໝົດ", count: stats.total },
                { key: "waiting" as const, label: "ລໍ", count: stats.waiting },
                { key: "inprogress" as const, label: "ກຳລັງ", count: stats.inprogress },
                { key: "done" as const, label: "ສຳເລັດ", count: stats.done },
                { key: "cancel" as const, label: "ຍົກເລີກ", count: stats.cancel },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setFilter(opt.key);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    filter === opt.key ? "glass-heavy glow-primary text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                      filter === opt.key ? "bg-teal-500/20 text-teal-600 dark:text-teal-400" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Bill Journey</p>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍການບິນ</h2>
              </div>
              <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                {filteredItems.length} / {items.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2.5 text-left w-10">#</th>
                    <th className="px-3 py-2.5 text-left">ວັນທີ</th>
                    <th className="px-3 py-2.5 text-left">ເລກບິນ / ຖ້ຽວ</th>
                    <th className="px-3 py-2.5 text-left">ລູກຄ້າ</th>
                    <th className="px-3 py-2.5 text-left">ລົດ / ຄົນຂັບ</th>
                    <th className="px-3 py-2.5 text-left">ສະຖານະ</th>
                    <th className="px-3 py-2.5 text-left">ຂັ້ນຕອນ</th>
                    <th className="px-3 py-2.5 text-left">ໝາຍເຫດ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                  {pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">
                        ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map((item, index) => {
                      const phase = classifyBill(item.status_trans);
                      const style = PHASE_STYLE[phase];
                      return (
                        <tr key={`${item.doc_no}-${item.bill_no}`} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors align-top">
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                              {(currentPage - 1) * perPage + index + 1}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">{item.doc_date}</td>
                          <td className="px-3 py-3">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{item.bill_no}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.doc_no}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-200">{item.cust_code || "-"}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5 text-xs text-slate-700">
                              <FaTruck size={10} className="text-sky-500" />
                              <span className="font-medium truncate">{item.car || "-"}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                              <FaUserTie size={9} className="text-sky-500" />
                              <span className="truncate">{item.driver || "-"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${style.bg}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                              {item.status_trans}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <FaIdCard size={8} className="text-amber-500" />
                                ຮັບຖ້ຽວ: <span className="font-medium text-slate-700">{item.recipt_job || "-"}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <FaPlay size={8} className="text-sky-500" />
                                ເລີ່ມ: <span className="font-medium text-slate-700">{item.sent_start || "-"}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <FaCheckCircle size={8} className="text-emerald-500" />
                                ສຳເລັດ: <span className="font-medium text-slate-700">{item.sent_end || "-"}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600 max-w-[200px]">
                            {item.remark ? (
                              <span className="block truncate" title={item.remark}>
                                {item.remark}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
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
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

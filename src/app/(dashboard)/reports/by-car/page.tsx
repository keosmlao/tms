"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendar,
  FaCheckCircle,
  FaChartBar,
  FaClock,
  FaIdCard,
  FaListUl,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTruck,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getReportByCar

interface Car {
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

// ==================== Helpers ====================

const STATUS_TONES: Record<number, { bg: string; dot: string }> = {
  0: { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  1: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  2: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  3: { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  4: { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
};
const DEFAULT_STATUS_TONE = { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" };

function inferStatusTone(status: string, jobStatus?: number) {
  if (jobStatus != null && STATUS_TONES[jobStatus]) return STATUS_TONES[jobStatus];
  if (status.includes("ສຳເລັດ") || status.includes("ປິດງານ")) return STATUS_TONES[3];
  if (status.includes("ກຳລັງ")) return STATUS_TONES[2];
  if (status.includes("ຮັບ")) return STATUS_TONES[1];
  if (status.includes("ລໍ")) return STATUS_TONES[0];
  return DEFAULT_STATUS_TONE;
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

// ==================== Main ====================

export default function ByCarReportPage() {
  const [cars, setCars] = useState<Car[]>([]);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fromDate, setFromDate] = useState(() => getFixedTodayDate());
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [carId, setCarId] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    Actions.getReportByCar(fromDate, toDate)
      .then((data) => setCars((data.cars || []) as Car[]))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchItems = () => {
    if (!carId) return;
    setLoading(true);
    setSearched(true);
    Actions.getReportByCar(fromDate, toDate, carId)
      .then((data) => setItems((data.listitem || []) as ReportItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const selectedCar = useMemo(() => cars.find((c) => c.code === carId), [cars, carId]);

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

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.doc_no.toLowerCase().includes(q) ||
        i.driver?.toLowerCase().includes(q) ||
        i.status?.toLowerCase().includes(q)
    );
  }, [items, searchText]);

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
              <FaChartBar className="text-sky-300" size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                Car Utilisation Report
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">ລາຍງານຕາມລົດ</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ເບິ່ງການໃຊ້ລົດແຕ່ລະຄັນໃນຊ່ວງວັນທີທີ່ເລືອກ
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
              <FaTruck size={10} className="text-slate-400" />
              ລົດ
            </label>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            >
              <option value="">ເລືອກລົດ...</option>
              {cars.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_1} · {c.code}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!carId || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </div>
      </form>

      {/* ========== STATUS BANNER / SUMMARY ========== */}
      {selectedCar && items.length > 0 && (
        <div className="rounded-lg glass-subtle p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg glass flex items-center justify-center">
              <FaTruck className="text-sky-600 dark:text-sky-400" size={14} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500 dark:text-sky-400">ກຳລັງສະແດງລົດ</p>
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {selectedCar.name_1} <span className="text-slate-400 font-mono text-xs">· {selectedCar.code}</span>
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
            <FaTruck className="text-sky-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700">ເລືອກລົດເພື່ອເບິ່ງລາຍງານ</p>
          <p className="text-xs text-slate-400 mt-1">ກຳນົດຊ່ວງວັນທີ ແລ້ວເລືອກລົດ ແລ້ວກົດຄົ້ນຫາ</p>
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
          <p className="text-xs text-slate-400 mt-1">ລອງປ່ຽນຊ່ວງວັນທີ ຫຼື ເລືອກລົດອື່ນ</p>
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
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ຄົ້ນຫາໃນຜົນ: ເລກຖ້ຽວ, ຄົນຂັບ, ສະຖານະ..."
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
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">
                        ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, index) => {
                      const tone = inferStatusTone(item.status, item.job_status);
                      return (
                        <tr key={item.doc_no} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                              {index + 1}
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
  color: "teal" | "sky" | "amber" | "emerald";
}) {
  const palette = {
    teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  }[color];
  return (
    <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${palette.text}`}>{value.toLocaleString("en-US")}</p>
      </div>
      <div className={`w-10 h-10 rounded-lg ${palette.bg} ${palette.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

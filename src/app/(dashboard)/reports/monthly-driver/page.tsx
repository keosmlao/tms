"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaChartBar,
  FaCrown,
  FaListUl,
  FaMedal,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrophy,
  FaUser,
  FaUserSlash,
} from "react-icons/fa";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getReportMonthlyDriver

interface MonthlyItem {
  driver: string;
  driver_code: string;
  qty: number;
  month: string;
  year: string;
}

type StatusFilter = "all" | "active" | "idle";

const LAO_MONTHS = [
  "ມັງກອນ",
  "ກຸມພາ",
  "ມີນາ",
  "ເມສາ",
  "ພຶດສະພາ",
  "ມິຖຸນາ",
  "ກໍລະກົດ",
  "ສິງຫາ",
  "ກັນຍາ",
  "ຕຸລາ",
  "ພະຈິກ",
  "ທັນວາ",
];

function formatMonthLabel(month: string) {
  const [year, m] = month.split("-");
  const idx = Number(m) - 1;
  if (idx >= 0 && idx < LAO_MONTHS.length) return `${LAO_MONTHS[idx]} ${year}`;
  return month;
}

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
  caption,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: "teal" | "amber" | "sky" | "emerald" | "slate";
  caption?: string;
}) {
  const palette = {
    teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
    slate: { bg: "bg-slate-500/10", text: "text-slate-500 dark:text-slate-400" },
  }[color];
  return (
    <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums truncate ${palette.text}`}>{value}</p>
        {caption && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{caption}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg ${palette.bg} ${palette.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

function RankBadge({ rank, qty }: { rank: number; qty: number }) {
  if (qty === 0) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-500/10 text-slate-400 text-xs font-bold tabular-nums">
        –
      </span>
    );
  }
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-amber-300 to-yellow-500 text-white shadow-sm">
        <FaCrown size={11} />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm">
        <FaMedal size={11} />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-orange-300 to-amber-500 text-white shadow-sm">
        <FaMedal size={11} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-500/10 text-slate-500 dark:text-slate-400 text-xs font-bold tabular-nums">
      {rank}
    </span>
  );
}

// ==================== Main ====================

export default function MonthlyDriverPage() {
  const [items, setItems] = useState<MonthlyItem[]>([]);
  const [monthly, setMonthly] = useState(getFixedTodayMonth());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const fetchItems = () => {
    setLoading(true);
    Actions.getReportMonthlyDriver(monthly)
      .then((data) => setItems(data as MonthlyItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rankedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const qtyDiff = Number(b.qty) - Number(a.qty);
      if (qtyDiff !== 0) return qtyDiff;
      return a.driver.localeCompare(b.driver);
    });
  }, [items]);

  const stats = useMemo(() => {
    const totalWorkers = items.length;
    const activeWorkers = items.filter((i) => Number(i.qty) > 0).length;
    const idleWorkers = totalWorkers - activeWorkers;
    const totalTrips = items.reduce((sum, i) => sum + Number(i.qty || 0), 0);
    const maxQty = items.reduce((max, i) => Math.max(max, Number(i.qty || 0)), 0);
    const avg = activeWorkers > 0 ? totalTrips / activeWorkers : 0;
    return { totalWorkers, activeWorkers, idleWorkers, totalTrips, maxQty, avg };
  }, [items]);

  const topDriver = rankedItems.find((i) => Number(i.qty) > 0);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rankedItems.filter((item) => {
      if (filter === "active" && Number(item.qty) === 0) return false;
      if (filter === "idle" && Number(item.qty) > 0) return false;
      if (!q) return true;
      return (
        item.driver.toLowerCase().includes(q) ||
        item.driver_code?.toLowerCase().includes(q)
      );
    });
  }, [rankedItems, searchText, filter]);

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
                Monthly Driver Utilisation
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">ຄົນຂັບປະຈຳເດືອນ</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ສະແດງພະນັກງານຂົນສົ່ງທຸກຄົນ ພ້ອມຈັດອັນດັບການນຳໃຊ້ໃນແຕ່ລະເດືອນ
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <StatBadge label="ທັງໝົດ" value={stats.totalWorkers} color="sky" />
              <StatBadge label="ມີຖ້ຽວ" value={stats.activeWorkers} color="emerald" />
              <StatBadge label="ວ່າງ" value={stats.idleWorkers} color="rose" />
              <StatBadge label="ເດືອນ" value={formatMonthLabel(monthly)} color="sky" />
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
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendarAlt size={10} className="text-slate-400" />
              ເລືອກເດືອນ
            </label>
            <input
              type="month"
              value={monthly}
              min={FIXED_MONTH_MIN}
              max={FIXED_MONTH_MAX}
              onChange={(e) => setMonthly(e.target.value)}
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
          <p className="text-sm font-semibold text-slate-700">ບໍ່ພົບຂໍ້ມູນພະນັກງານຂົນສົ່ງ</p>
          <p className="text-xs text-slate-400 mt-1">ກະລຸນາກວດສອບຂໍ້ມູນພະນັກງານໃນລະບົບ</p>
        </div>
      ) : (
        <>
          {/* Top driver spotlight + summary */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {topDriver ? (
              <div className="lg:col-span-2 relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border border-amber-200 p-4 shadow-sm">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/40 rounded-full blur-2xl" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white flex items-center justify-center shadow-lg shrink-0">
                    <FaTrophy size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                      ຄົນຂັບເກັ່ງສຸດ
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900 truncate">{topDriver.driver}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <FaRoute size={9} className="text-amber-500" />
                        <span className="font-bold text-amber-700 tabular-nums">{topDriver.qty}</span> ຖ້ຽວ
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="tabular-nums">
                        {stats.totalTrips > 0
                          ? Math.round((Number(topDriver.qty) / stats.totalTrips) * 100)
                          : 0}
                        % ຂອງທັງໝົດ
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="lg:col-span-2 rounded-lg border border-slate-100 bg-slate-50/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center">
                  <FaUserSlash size={14} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ຄົນຂັບເກັ່ງສຸດ</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">ຍັງບໍ່ມີຄົນຂັບເຮັດຖ້ຽວໃນເດືອນນີ້</p>
                </div>
              </div>
            )}
            <SummaryCard
              label="ຖ້ຽວລວມ"
              value={stats.totalTrips.toLocaleString("en-US")}
              icon={<FaRoute size={12} />}
              color="emerald"
              caption={
                stats.activeWorkers > 0
                  ? `ສະເລ່ຍ ${stats.avg.toFixed(1)} ຖ້ຽວ/ຄົນ`
                  : "ຍັງບໍ່ມີຖ້ຽວໃນເດືອນນີ້"
              }
            />
            <SummaryCard
              label="ມີຖ້ຽວ / ວ່າງ"
              value={`${stats.activeWorkers} / ${stats.idleWorkers}`}
              icon={<FaUser size={12} />}
              color="sky"
              caption={`ພະນັກງານທັງໝົດ ${stats.totalWorkers} ຄົນ`}
            />
          </div>

          {/* Search + filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ຄົ້ນຫາຄົນຂັບ ຫຼື ລະຫັດພະນັກງານ..."
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
                { key: "all" as const, label: "ທັງໝົດ", count: stats.totalWorkers },
                { key: "active" as const, label: "ມີຖ້ຽວ", count: stats.activeWorkers },
                { key: "idle" as const, label: "ວ່າງ", count: stats.idleWorkers },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFilter(opt.key)}
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

          {/* Leaderboard */}
          <div className="overflow-hidden rounded-lg glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Leaderboard</p>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຈັດອັນດັບຄົນຂັບ</h2>
              </div>
              <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                {filteredItems.length} / {items.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2.5 text-left w-16">ອັນດັບ</th>
                    <th className="px-4 py-2.5 text-left">ຄົນຂັບ / ພະນັກງານ</th>
                    <th className="px-4 py-2.5 text-left">ການນຳໃຊ້</th>
                    <th className="px-4 py-2.5 text-right w-28">ຖ້ຽວ</th>
                    <th className="px-4 py-2.5 text-right w-20">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400">
                        ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const qty = Number(item.qty || 0);
                      const rank = qty > 0 ? rankedItems.findIndex((r) => r.driver_code === item.driver_code) + 1 : 0;
                      const pctOfMax = stats.maxQty > 0 ? (qty / stats.maxQty) * 100 : 0;
                      const pctOfTotal = stats.totalTrips > 0 ? (qty / stats.totalTrips) * 100 : 0;
                      const isIdle = qty === 0;
                      const barColor = isIdle
                        ? "bg-slate-200"
                        : rank === 1
                          ? "bg-gradient-to-r from-amber-400 to-yellow-500"
                          : rank === 2
                            ? "bg-gradient-to-r from-slate-300 to-slate-400"
                            : rank === 3
                              ? "bg-gradient-to-r from-orange-300 to-amber-500"
                              : "bg-gradient-to-r from-teal-400 to-sky-500";
                      return (
                        <tr
                          key={item.driver_code}
                          className={`transition-colors ${isIdle ? "opacity-75" : ""} hover:bg-white/30 dark:hover:bg-white/5`}
                        >
                          <td className="px-4 py-3">
                            <RankBadge rank={rank} qty={qty} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  isIdle ? "bg-slate-500/10 text-slate-400" : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                                }`}
                              >
                                <FaUser size={12} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.driver}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{item.driver_code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-full max-w-[260px]">
                              <div className="h-2 bg-slate-500/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                  style={{ width: `${Math.max(pctOfMax, isIdle ? 0 : 3)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isIdle ? (
                              <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 text-xs font-bold tabular-nums">
                                0
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold tabular-nums">
                                {qty}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                            {isIdle ? <span className="text-slate-300">—</span> : <span className="text-slate-500">{pctOfTotal.toFixed(1)}%</span>}
                          </td>
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

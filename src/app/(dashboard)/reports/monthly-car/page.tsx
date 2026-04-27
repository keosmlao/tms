"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaChartBar,
  FaCrown,
  FaListUl,
  FaMedal,
  FaRoute,
  FaSatelliteDish,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrophy,
  FaTruck,
} from "react-icons/fa";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import { Actions } from "@/lib/api";

interface MonthlyItem {
  car: string;
  car_code: string;
  imei: string;
  qty: number;
  month: string;
  year: string;
}

type GpsFilter = "all" | "with-gps" | "without-gps";

function hasGps(item: MonthlyItem) {
  return item.imei.trim().length > 0;
}

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
    sky: "from-sky-500/20 to-cyan-500/20 ring-sky-300/30 text-sky-100",
    emerald: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
    amber: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    teal: "from-teal-500/20 to-teal-400/20 ring-teal-300/30 text-teal-100",
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
  color: "teal" | "amber" | "sky" | "emerald";
  caption?: string;
}) {
  const palette = {
    teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  }[color];

  return (
    <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums truncate ${palette.text}`}>{value}</p>
        {caption && <p className="mt-0.5 text-[10px] text-slate-400">{caption}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg ${palette.bg} ${palette.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
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

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
        active
          ? "bg-sky-600 text-white shadow-sm"
          : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white/20" : "bg-slate-100"}`}>
        {count}
      </span>
    </button>
  );
}

export default function MonthlyCarPage() {
  const [items, setItems] = useState<MonthlyItem[]>([]);
  const [monthly, setMonthly] = useState(getFixedTodayMonth());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [gpsFilter, setGpsFilter] = useState<GpsFilter>("all");

  const fetchItems = () => {
    setLoading(true);
    Actions.getReportMonthlyCar(monthly)
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
      const diff = Number(b.qty || 0) - Number(a.qty || 0);
      if (diff !== 0) return diff;
      return a.car.localeCompare(b.car);
    });
  }, [items]);

  const stats = useMemo(() => {
    const totalCars = items.length;
    const totalTrips = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const maxQty = items.reduce((max, item) => Math.max(max, Number(item.qty || 0)), 0);
    const avg = totalCars > 0 ? totalTrips / totalCars : 0;
    const gpsItems = items.filter(hasGps);
    const gpsCars = gpsItems.length;
    const gpsTrips = gpsItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const nonGpsCars = totalCars - gpsCars;
    const gpsCoverage = totalTrips > 0 ? (gpsTrips / totalTrips) * 100 : 0;
    return {
      totalCars,
      totalTrips,
      maxQty,
      avg,
      gpsCars,
      gpsTrips,
      nonGpsCars,
      gpsCoverage,
    };
  }, [items]);

  const topCar = rankedItems[0];
  const topGpsCar = rankedItems.find(hasGps) ?? null;

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rankedItems.filter((item) => {
      const gpsMatched =
        gpsFilter === "all" ||
        (gpsFilter === "with-gps" && hasGps(item)) ||
        (gpsFilter === "without-gps" && !hasGps(item));
      if (!gpsMatched) return false;
      if (!keyword) return true;
      return (
        item.car.toLowerCase().includes(keyword) ||
        item.car_code.toLowerCase().includes(keyword) ||
        item.imei.toLowerCase().includes(keyword)
      );
    });
  }, [gpsFilter, rankedItems, searchText]);

  const gpsFilterCounts = useMemo(() => {
    const withGps = rankedItems.filter(hasGps).length;
    return {
      all: rankedItems.length,
      withGps,
      withoutGps: rankedItems.length - withGps,
    };
  }, [rankedItems]);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 sm:p-6 shadow-xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 10%, #38bdf8 0%, transparent 35%), radial-gradient(circle at 90% 80%, #a78bfa 0%, transparent 35%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <FaChartBar className="text-sky-300" size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                Monthly Fleet Utilisation
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                ນຳໃຊ້ລົດປະຈຳເດືອນ
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-300">
                ສະຫຼຸບການນຳໃຊ້ລົດ ແລະ ແຍກສະຖານະຕາມລົດທີ່ຕິດ GPS
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <StatBadge label="ລົດ" value={stats.totalCars} color="sky" />
              <StatBadge label="ຖ້ຽວ" value={stats.totalTrips} color="emerald" />
              <StatBadge label="GPS" value={stats.gpsCars} color="sky" />
              <StatBadge label="Coverage" value={`${stats.gpsCoverage.toFixed(1)}%`} color="amber" />
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
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
              onChange={(event) => setMonthly(event.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </div>
      </form>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 rounded-lg glass">
          <FaSpinner className="animate-spin text-sky-500" size={14} />
          <span className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <div className="w-14 h-14 rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
            <FaListUl className="text-slate-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700">ບໍ່ມີຂໍ້ມູນໃນເດືອນນີ້</p>
          <p className="text-xs text-slate-400 mt-1">ລອງເລືອກເດືອນອື່ນ</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {topCar && (
              <div className="lg:col-span-2 relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border border-amber-200 p-4 shadow-sm">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/40 rounded-full blur-2xl" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white flex items-center justify-center shadow-lg shrink-0">
                    <FaTrophy size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                      ລົດນຳໃຊ້ຫຼາຍທີ່ສຸດ
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900 truncate">{topCar.car}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <FaRoute size={9} className="text-amber-500" />
                        <span className="font-bold text-amber-700 tabular-nums">{topCar.qty}</span> ຖ້ຽວ
                      </span>
                      {hasGps(topCar) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 font-medium text-sky-700">
                          <FaSatelliteDish size={9} />
                          {topCar.imei}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <SummaryCard
              label="ລົດທັງໝົດ"
              value={stats.totalCars}
              icon={<FaTruck size={12} />}
              color="sky"
              caption="ຈຳນວນລົດທີ່ມີການນຳໃຊ້"
            />
            <SummaryCard
              label="ຖ້ຽວລວມ"
              value={stats.totalTrips.toLocaleString("en-US")}
              icon={<FaRoute size={12} />}
              color="emerald"
              caption={`ສະເລ່ຍ ${stats.avg.toFixed(1)} ຖ້ຽວ/ຄັນ`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2 rounded-lg border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-teal-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                  <FaBroadcastTower size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500">
                    ສະຫຼຸບຕາມ GPS
                  </p>
                  {topGpsCar ? (
                    <>
                      <p className="mt-1 text-lg font-bold text-slate-900 truncate">{topGpsCar.car}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        IMEI: <span className="font-mono font-semibold text-sky-700">{topGpsCar.imei}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-700">
                          <FaRoute size={9} />
                          {topGpsCar.qty} ຖ້ຽວ
                        </span>
                        <Link
                           href={`/tracking/map?imei=${encodeURIComponent(topGpsCar.imei)}`}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100 hover:bg-sky-50"
                        >
                          <FaSatelliteDish size={9} />
                          ເບິ່ງ GPS
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        ບໍ່ພົບລົດທີ່ຕິດ GPS ໃນເດືອນນີ້
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        ກວດສອບ IMEI ໃນໜ້າຈັດການລົດເພື່ອໃຫ້ລາຍງານນີ້ແຍກ GPS ໄດ້
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <SummaryCard
              label="ລົດມີ GPS"
              value={stats.gpsCars}
              icon={<FaSatelliteDish size={12} />}
              color="sky"
              caption={`${stats.nonGpsCars} ຄັນບໍ່ມີ GPS`}
            />
            <SummaryCard
              label="ຖ້ຽວຕາມ GPS"
              value={stats.gpsTrips.toLocaleString("en-US")}
              icon={<FaBroadcastTower size={12} />}
              color="sky"
              caption={`${stats.gpsCoverage.toFixed(1)}% ຂອງຖ້ຽວທັງໝົດ`}
            />
            <SummaryCard
              label="ບໍ່ມີ GPS"
              value={stats.nonGpsCars}
              icon={<FaTruck size={12} />}
              color="amber"
              caption="ລົດທີ່ຍັງບໍ່ຜູກ IMEI"
            />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ຄົ້ນຫາລົດ, ລະຫັດລົດ, IMEI..."
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

            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="ທັງໝົດ"
                count={gpsFilterCounts.all}
                active={gpsFilter === "all"}
                onClick={() => setGpsFilter("all")}
              />
              <FilterChip
                label="ມີ GPS"
                count={gpsFilterCounts.withGps}
                active={gpsFilter === "with-gps"}
                onClick={() => setGpsFilter("with-gps")}
              />
              <FilterChip
                label="ບໍ່ມີ GPS"
                count={gpsFilterCounts.withoutGps}
                active={gpsFilter === "without-gps"}
                onClick={() => setGpsFilter("without-gps")}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Leaderboard</p>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">
                  ຈັດອັນດັບການນຳໃຊ້ລົດຕາມ GPS
                </h2>
              </div>
              <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                {filteredItems.length} / {items.length}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2.5 text-left w-16">ອັນດັບ</th>
                    <th className="px-4 py-2.5 text-left">ລົດ</th>
                    <th className="px-4 py-2.5 text-left w-44">GPS / IMEI</th>
                    <th className="px-4 py-2.5 text-left">ການນຳໃຊ້</th>
                    <th className="px-4 py-2.5 text-right w-28">ຖ້ຽວ</th>
                    <th className="px-4 py-2.5 text-right w-20">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">
                        ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ ຫຼື filter
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, index) => {
                      const rank =
                        rankedItems.findIndex(
                          (row) => row.car_code === item.car_code && row.imei === item.imei
                        ) + 1;
                      const qty = Number(item.qty || 0);
                      const pctOfMax = stats.maxQty > 0 ? (qty / stats.maxQty) * 100 : 0;
                      const pctOfTotal = stats.totalTrips > 0 ? (qty / stats.totalTrips) * 100 : 0;
                      const barColor =
                        rank === 1
                          ? "bg-gradient-to-r from-amber-400 to-yellow-500"
                          : rank === 2
                            ? "bg-gradient-to-r from-slate-300 to-slate-400"
                            : rank === 3
                              ? "bg-gradient-to-r from-orange-300 to-amber-500"
                              : "bg-gradient-to-r from-sky-400 to-teal-500";

                      return (
                        <tr key={`${item.car_code}-${index}`} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <RankBadge rank={rank} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                                <FaTruck size={12} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {item.car}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">{item.car_code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {hasGps(item) ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                                  <FaSatelliteDish size={9} />
                                  ມີ GPS
                                </span>
                                <p className="font-mono text-[11px] text-slate-500">{item.imei}</p>
                                <Link
                                   href={`/tracking/map?imei=${encodeURIComponent(item.imei)}`}
                                  className="text-[10px] font-semibold text-sky-600 hover:text-sky-700"
                                >
                                  ເປີດແຜນທີ່ GPS
                                </Link>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                <FaSatelliteDish size={9} />
                                ບໍ່ມີ GPS
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-full max-w-[260px]">
                              <div className="h-2 bg-slate-500/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                  style={{ width: `${pctOfMax}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                              hasGps(item)
                                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                            }`}>
                              {qty}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-slate-500 tabular-nums">
                            {pctOfTotal.toFixed(1)}%
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

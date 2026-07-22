"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaCarSide,
  FaChartLine,
  FaClock,
  FaDownload,
  FaGasPump,
  FaMapMarkedAlt,
  FaRedo,
  FaRoute,
  FaSpinner,
  FaTachometerAlt,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";

interface GpsUsageSummary {
  imei: string;
  car_code: string;
  car_name: string;
  days_count: number;
  active_days: number;
  distance_km: number;
  max_speed: number;
  avg_speed: number;
  moving_seconds: number;
  stopped_seconds: number;
  points_count: number;
  last_synced: string;
  max_daily_km?: number;
  min_daily_km?: number;
  avg_daily_km?: number;
  max_daily_km_date?: string;
  min_daily_km_date?: string;
}

function endOfMonth(monthly: string) {
  const [year, month] = monthly.split("-").map(Number);
  const date = new Date(year, month, 0);
  return `${monthly}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthTitle(monthly: string) {
  const [year, month] = monthly.split("-");
  return `${month}/${year}`;
}

function n(value: number | null | undefined, digits = 0) {
  const num = Number(value ?? 0);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtKm(value: number | null | undefined, digits = 1) {
  return `${n(value, digits)} km`;
}

function fmtHours(seconds: number | null | undefined) {
  const sec = Math.max(0, Number(seconds ?? 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h <= 0) return `${m}ນ`;
  return `${h}ຊ ${m}ນ`;
}

function pct(value: number, digits = 1) {
  return `${n(value, digits)}%`;
}

function downloadCsv(rows: GpsUsageSummary[], monthly: string) {
  const header = [
    "ລົດ",
    "ລະຫັດລົດ",
    "IMEI",
    "Actual distance",
    "Active days",
    "Total days",
    "Utilization %",
    "Moving time",
    "Idle/Stopped time",
    "Average speed",
    "Max speed",
    "Avg km/day",
    "Max daily km",
    "Min daily km",
    "GPS points",
  ];
  const csvRows = rows.map((r) => {
    const utilization = r.days_count > 0 ? (r.active_days / r.days_count) * 100 : 0;
    return [
      r.car_name,
      r.car_code,
      r.imei,
      n(r.distance_km, 3),
      r.active_days,
      r.days_count,
      n(utilization, 2),
      fmtHours(r.moving_seconds),
      fmtHours(r.stopped_seconds),
      n(r.avg_speed, 1),
      n(r.max_speed, 1),
      n(r.avg_daily_km ?? 0, 3),
      n(r.max_daily_km ?? 0, 3),
      n(r.min_daily_km ?? 0, 3),
      r.points_count,
    ];
  });
  const lines = [header, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${lines}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gps-monthly-summary_${monthly}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function GpsMonthlySummaryPage() {
  const [monthly, setMonthly] = useState(getFixedTodayMonth());
  const [rows, setRows] = useState<GpsUsageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fromDate = `${monthly}-01`;
  const toDate = endOfMonth(monthly);

  const loadCached = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await Actions.getGpsUsageSummaryCached(fromDate, toDate);
      setRows((data ?? []) as GpsUsageSummary[]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "ໂຫຼດຂໍ້ມູນ GPS ບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const refreshFromProvider = async () => {
    setRefreshing(true);
    setError("");
    try {
      const data = await Actions.getGpsUsageSummary(fromDate, toDate, undefined, { fillMissing: true });
      setRows((data ?? []) as GpsUsageSummary[]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Sync GPS ບໍ່ສຳເລັດ");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => Number(b.distance_km || 0) - Number(a.distance_km || 0)),
    [rows]
  );

  const totals = useMemo(() => {
    const cars = rows.length;
    const activeCars = rows.filter((r) => Number(r.distance_km || 0) > 0).length;
    const distance = rows.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
    const moving = rows.reduce((sum, r) => sum + Number(r.moving_seconds || 0), 0);
    const stopped = rows.reduce((sum, r) => sum + Number(r.stopped_seconds || 0), 0);
    const points = rows.reduce((sum, r) => sum + Number(r.points_count || 0), 0);
    const activeDays = rows.reduce((sum, r) => sum + Number(r.active_days || 0), 0);
    const days = rows.reduce((sum, r) => sum + Number(r.days_count || 0), 0);
    const maxSpeed = rows.reduce((max, r) => Math.max(max, Number(r.max_speed || 0)), 0);
    const avgSpeedRows = rows.filter((r) => Number(r.avg_speed || 0) > 0);
    const avgSpeed =
      avgSpeedRows.length > 0
        ? avgSpeedRows.reduce((sum, r) => sum + Number(r.avg_speed || 0), 0) / avgSpeedRows.length
        : 0;
    return {
      cars,
      activeCars,
      distance,
      moving,
      stopped,
      points,
      activeDays,
      days,
      utilization: days > 0 ? (activeDays / days) * 100 : 0,
      maxSpeed,
      avgSpeed,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 text-white shadow-xl">
        <div className="relative p-5 md:p-7">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-teal-100">
                <FaMapMarkedAlt /> GPS Monthly Summary
              </div>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">
                ລາຍງານ GPS ປະຈຳເດືອນ
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                ສະຫຼຸບຕາມແບບ Excel: Route/Time, Utilization, KPI ແລະຂໍ້ມູນຄວາມໄວຂອງລົດ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-semibold backdrop-blur">
                <FaCalendarAlt className="text-teal-200" />
                <input
                  type="month"
                  value={monthly}
                  min={FIXED_MONTH_MIN}
                  max={FIXED_MONTH_MAX}
                  onChange={(e) => setMonthly(e.target.value)}
                  className="bg-transparent text-white outline-none [color-scheme:dark]"
                />
              </label>
              <button
                type="button"
                onClick={refreshFromProvider}
                disabled={refreshing || loading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-400 px-4 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <FaSpinner className="animate-spin" /> : <FaRedo />}
                Sync GPS
              </button>
              <button
                type="button"
                onClick={() => downloadCsv(sortedRows, monthly)}
                disabled={sortedRows.length === 0}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaDownload />
                CSV
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<FaCarSide />} label="ລົດມີ GPS" value={`${totals.activeCars}/${totals.cars}`} hint={`ເດືອນ ${monthTitle(monthly)}`} tone="teal" />
        <MetricCard icon={<FaRoute />} label="Actual distance" value={fmtKm(totals.distance)} hint="ລວມລະຍະທາງ GPS" tone="sky" />
        <MetricCard icon={<FaClock />} label="Driving hours" value={fmtHours(totals.moving)} hint={`Idle/Stopped ${fmtHours(totals.stopped)}`} tone="emerald" />
        <MetricCard icon={<FaChartLine />} label="Utilization" value={pct(totals.utilization)} hint={`${n(totals.activeDays)} active days / ${n(totals.days)} days`} tone="amber" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">ຕາຕະລາງລົດ / GPS Summary</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ຂໍ້ມູນມາຈາກ GPS cache ຂອງ TMS: {fromDate} ຫາ {toDate}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Pill icon={<FaTachometerAlt />} label={`Avg speed ${n(totals.avgSpeed, 1)} km/h`} />
            <Pill icon={<FaTachometerAlt />} label={`Max speed ${n(totals.maxSpeed, 1)} km/h`} />
            <Pill icon={<FaMapMarkedAlt />} label={`${n(totals.points)} GPS points`} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm font-semibold text-slate-500">
            <FaSpinner className="animate-spin" /> ກຳລັງໂຫຼດ GPS summary…
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <FaMapMarkedAlt size={22} />
            </div>
            <p className="mt-4 font-bold text-slate-700 dark:text-slate-200">ຍັງບໍ່ມີຂໍ້ມູນ GPS ຂອງເດືອນນີ້</p>
            <p className="mt-1 text-sm text-slate-500">ກົດ Sync GPS ເພື່ອດຶງຂໍ້ມູນ ຫຼືເລືອກເດືອນອື່ນ.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  <th className="px-4 py-3">ລົດ</th>
                  <th className="px-4 py-3">IMEI</th>
                  <th className="px-4 py-3 text-right">Actual km</th>
                  <th className="px-4 py-3 text-right">Active days</th>
                  <th className="px-4 py-3 text-right">Utilization</th>
                  <th className="px-4 py-3 text-right">Moving</th>
                  <th className="px-4 py-3 text-right">Idle/Stopped</th>
                  <th className="px-4 py-3 text-right">Avg speed</th>
                  <th className="px-4 py-3 text-right">Max speed</th>
                  <th className="px-4 py-3 text-right">Avg km/day</th>
                  <th className="px-4 py-3 text-right">Max daily</th>
                  <th className="px-4 py-3 text-right">Min daily</th>
                  <th className="px-4 py-3 text-right">GPS points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedRows.map((row) => {
                  const utilization = row.days_count > 0 ? (row.active_days / row.days_count) * 100 : 0;
                  return (
                    <tr key={`${row.imei}-${row.car_code}`} className="transition hover:bg-teal-50/50 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{row.car_name || row.car_code || "-"}</div>
                        <div className="text-xs text-slate-400">{row.car_code || "-"}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.imei}</td>
                      <td className="px-4 py-3 text-right font-bold text-teal-600 dark:text-teal-300">{fmtKm(row.distance_km)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{row.active_days}/{row.days_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100">{pct(utilization)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtHours(row.moving_seconds)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtHours(row.stopped_seconds)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{n(row.avg_speed, 1)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-300">{n(row.max_speed, 1)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtKm(row.avg_daily_km ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtKm(row.max_daily_km ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtKm(row.min_daily_km ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{n(row.points_count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoPanel
          title="KPI ຕາມແບບ Excel"
          items={[
            ["Fleet Utilization", "Active days ÷ Total days"],
            ["Actual distance", "GPS distance"],
            ["Idle Time", "Stopped seconds / Engine idle approximation"],
            ["Average km/day", "Distance ÷ active days"],
            ["Speed insight", "Average speed / Max speed"],
          ]}
        />
        <InfoPanel
          title="Fuel / Driver scoring"
          items={[
            ["Fuel consumed (L)", "ຕ້ອງຕໍ່ຈາກໜ້ານ້ຳມັນ ຫຼື GPS fuel sensor"],
            ["km/L", "Distance ÷ Fuel consumed"],
            ["Fuel cost/km", "Fuel cost ÷ Distance"],
            ["Driver safety score", "ຈະຄິດຈາກ speeding / harsh braking / rapid acceleration"],
            ["Route compliance", "ຈະຄິດຫຼັງຈາກມີ planned route distance"],
          ]}
          icon={<FaGasPump />}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "teal" | "sky" | "emerald" | "amber";
}) {
  const palette = {
    teal: "text-teal-600 bg-teal-500/10 dark:text-teal-300",
    sky: "text-sky-600 bg-sky-500/10 dark:text-sky-300",
    emerald: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-300",
    amber: "text-amber-600 bg-amber-500/10 dark:text-amber-300",
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette}`}>{icon}</div>
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {icon}
      {label}
    </span>
  );
}

function InfoPanel({
  title,
  items,
  icon,
}: {
  title: string;
  items: Array<[string, string]>;
  icon?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
        {icon ?? <FaChartLine />}
        {title}
      </h3>
      <div className="mt-4 space-y-2">
        {items.map(([name, formula]) => (
          <div key={name} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/50">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{name}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formula}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

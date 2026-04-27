"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  FaBackward,
  FaCalendarAlt,
  FaChartLine,
  FaClock,
  FaForward,
  FaMap,
  FaParking,
  FaPause,
  FaPlay,
  FaRedo,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTachometerAlt,
  FaTimes,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  FIXED_YEAR_END,
  FIXED_YEAR_START,
  getFixedTodayDate,
} from "@/lib/fixed-year";

// ==================== Types ====================
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

interface GpsUsageDaily {
  usage_date: string;
  usage_date_display: string;
  imei: string;
  car_code: string;
  car_name: string;
  first_time: string | null;
  last_time: string | null;
  distance_km: number;
  max_speed: number;
  avg_speed: number;
  moving_seconds: number;
  stopped_seconds: number;
  points_count: number;
  synced_at: string | null;
}

interface GpsUsageTrackPoint {
  t: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
}

interface GpsUsageTrack {
  header: GpsUsageDaily | null;
  points: GpsUsageTrackPoint[];
}

// ==================== Leaflet loader ====================
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LeafletMap = {
  setView: (latlng: [number, number], zoom?: number) => LeafletMap;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};
type LeafletPolyline = {
  addTo: (map: LeafletMap) => LeafletPolyline;
  remove: () => void;
  getBounds: () => unknown;
};
type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  remove: () => void;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  setIcon?: (icon: unknown) => void;
};
type LeafletApi = {
  map: (el: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (
    url: string,
    options?: Record<string, unknown>
  ) => { addTo: (map: LeafletMap) => unknown };
  polyline: (
    latlngs: Array<[number, number]>,
    options?: Record<string, unknown>
  ) => LeafletPolyline;
  marker: (
    latlng: [number, number],
    options?: Record<string, unknown>
  ) => LeafletMarker;
  divIcon: (options: Record<string, unknown>) => unknown;
  latLngBounds: (corners: Array<[number, number]>) => unknown;
};

function getLeaflet(): LeafletApi | undefined {
  return (window as unknown as { L?: LeafletApi }).L;
}

function useLeafletReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!document.querySelector(`link[data-leaflet]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.dataset.leaflet = "1";
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[data-src="${LEAFLET_JS}"]`)) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.async = true;
    s.dataset.src = LEAFLET_JS;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ==================== Utils ====================
function fmtSec(sec: number) {
  if (!sec) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ຊ ${m}ນ`;
  return `${m}ນ`;
}
function fmtKm(km: number) {
  return km.toFixed(1);
}

function isValidYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function speedColor(speed: number): string {
  if (speed <= 3) return "#64748b"; // slate — stopped
  if (speed <= 20) return "#10b981"; // emerald — slow
  if (speed <= 50) return "#3b82f6"; // sky — normal
  if (speed <= 80) return "#f59e0b"; // amber — fast
  return "#ef4444"; // rose — very fast
}

function speedLabel(speed: number): string {
  if (speed <= 3) return "ຈອດ";
  if (speed <= 20) return "ຊ້າ";
  if (speed <= 50) return "ປົກກະຕິ";
  if (speed <= 80) return "ໄວ";
  return "ເລັ່ງ";
}

function timeToSec(t: string): number {
  const parts = t.split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

function secToHm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 24-bucket array: total km driven per hour of day from track points
function hourlyDistance(
  points: Array<{ t: string; lat: number; lng: number; speed: number }>
): number[] {
  const hours = new Array(24).fill(0);
  if (points.length < 2) return hours;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const h = Number(curr.t.slice(0, 2)) || 0;
    const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
    const dLng = ((curr.lng - prev.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((prev.lat * Math.PI) / 180) *
        Math.cos((curr.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const dKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    hours[Math.min(23, Math.max(0, h))] += dKm;
  }
  return hours;
}

function getApiErrorMessage(err: unknown, fallback: string) {
  const axiosErr = err as {
    response?: { data?: { error?: string } };
    message?: string;
  };
  return axiosErr?.response?.data?.error ?? axiosErr?.message ?? fallback;
}

function TrackMetricCard({
  icon,
  label,
  value,
  accentClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200/70 bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="truncate text-sm font-bold text-slate-800 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}


interface GpsCarOption {
  code: string;
  name_1: string;
  imei: string;
}

interface GpsRealtime {
  imei: string;
  lat: string;
  lng: string;
  speed: string;
  heading: string;
  recorded_at: string;
  car_name: string;
  car_code: string;
  address: string;
}

type RealtimeStatus = "moving" | "stopped" | "offline";

function realtimeStatus(r: GpsRealtime | undefined): RealtimeStatus {
  if (!r) return "offline";
  const hasFix = r.lat && r.lng;
  if (!hasFix) return "offline";
  const s = Number(r.speed);
  return Number.isFinite(s) && s > 0 ? "moving" : "stopped";
}

function relativeTime(value: string): string {
  if (!value) return "";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return value;
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ==================== Main Page ====================
export default function GpsUsagePage() {
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [carCode, setCarCode] = useState("");
  const [searchText, setSearchText] = useState("");
  const [gpsCars, setGpsCars] = useState<GpsCarOption[]>([]);

  const [summary, setSummary] = useState<GpsUsageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [dailyByImei, setDailyByImei] = useState<Record<string, GpsUsageDaily[]>>(
    {}
  );
  const [dailyLoading, setDailyLoading] = useState<string | null>(null);

  const [realtimeByImei, setRealtimeByImei] = useState<
    Record<string, GpsRealtime>
  >({});
  const [realtimeFetchedAt, setRealtimeFetchedAt] = useState<Date | null>(null);

  const fetchRealtime = useCallback(async () => {
    try {
      const data = (await Actions.getGpsRealtimeAll()) as GpsRealtime[];
      const map: Record<string, GpsRealtime> = {};
      for (const r of data) map[r.imei] = r;
      setRealtimeByImei(map);
      setRealtimeFetchedAt(new Date());
    } catch (err) {
      console.error("realtime fetch failed", err);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!isValidYmd(fromDate) || !isValidYmd(toDate)) {
      setError("ກະລຸນາເລືອກວັນທີໃຫ້ຄົບ");
      setSummary([]);
      return;
    }
    if (fromDate > toDate) {
      setError("ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ");
      setSummary([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await Actions.getGpsUsageSummary(
        fromDate,
        toDate,
        carCode || undefined
      );
      setSummary(data as GpsUsageSummary[]);
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, "ດຶງຂໍ້ມູນບໍ່ສຳເລັດ"));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, carCode]);

  useEffect(() => {
    void fetchSummary();
    Actions.getGpsCars()
      .then((data) => setGpsCars(data as GpsCarOption[]))
      .catch(console.error);
    void fetchRealtime();
    const id = window.setInterval(() => void fetchRealtime(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = async (imei: string) => {
    if (expanded === imei) {
      setExpanded(null);
      return;
    }
    setExpanded(imei);
    if (!dailyByImei[imei]) {
      setDailyLoading(imei);
      try {
        const data = await Actions.getGpsUsageDaily(fromDate, toDate, imei);
        setDailyByImei((prev) => ({ ...prev, [imei]: data as GpsUsageDaily[] }));
      } catch (err) {
        console.error(err);
      } finally {
        setDailyLoading(null);
      }
    }
  };

  const filteredSummary = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return summary;
    return summary.filter(
      (row) =>
        (row.car_name ?? "").toLowerCase().includes(q) ||
        (row.car_code ?? "").toLowerCase().includes(q) ||
        (row.imei ?? "").toLowerCase().includes(q)
    );
  }, [summary, searchText]);

  const totals = useMemo(() => {
    return summary.reduce(
      (acc, row) => {
        acc.distance_km += Number(row.distance_km) || 0;
        acc.moving_seconds += Number(row.moving_seconds) || 0;
        acc.stopped_seconds += Number(row.stopped_seconds) || 0;
        acc.active_days += Number(row.active_days) || 0;
        return acc;
      },
      { distance_km: 0, moving_seconds: 0, stopped_seconds: 0, active_days: 0 }
    );
  }, [summary]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 shadow-xl">
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <FaChartLine className="text-teal-300" size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300">
                GPS Daily Usage
              </p>
              <h1 className="text-xl font-bold text-white leading-tight">
                ສະຫຼຸບການນຳໃຊ້ລົດຈາກ GPS
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-300">
                ດຶງປະຫວັດ GPS ຈາກ provider ເກັບໃສ່ DB ແລະສະແດງ
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fetchSummary();
        }}
        className="glass rounded-lg p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendarAlt size={10} className="text-slate-400" />
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
              <FaCalendarAlt size={10} className="text-slate-400" />
              ເຖິງວັນທີ
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
              ລະຫັດລົດ ({gpsCars.length} ຄັນມີ GPS)
            </label>
            <select
              value={carCode}
              onChange={(e) => setCarCode(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            >
              <option value="">ທຸກຄັນ</option>
              {gpsCars.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_1 || c.code} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <FaSpinner className="animate-spin" size={11} />
            ) : (
              <FaSearch size={11} />
            )}
            ຄົ້ນຫາ
          </button>
        </div>
      </form>

      {/* Totals */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              ລົດ
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-teal-600">
              {summary.length}
            </p>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              ໄລຍະທາງລວມ
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600">
              {fmtKm(totals.distance_km)} km
            </p>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              ເວລາແລ່ນລວມ
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-sky-600">
              {fmtSec(totals.moving_seconds)}
            </p>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              ເວລາຈອດລວມ
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-600">
              {fmtSec(totals.stopped_seconds)}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <FaSearch
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
          size={12}
        />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="ຄົ້ນຫາຊື່ລົດ / ລະຫັດ / IMEI..."
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
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Fleet Usage
            </p>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">
              ສະຫຼຸບຕາມລົດ
            </h2>
          </div>
          <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 tabular-nums">
            {filteredSummary.length} / {summary.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2.5 text-left">ລົດ</th>
                <th className="px-4 py-2.5 text-left">IMEI</th>
                <th className="px-4 py-2.5 text-left">
                  ປະຈຸບັນ
                  {realtimeFetchedAt && (
                    <span className="ml-1 font-normal text-[9px] text-slate-400">
                      ({realtimeFetchedAt.toLocaleTimeString("lo-LA", { hour12: false })})
                    </span>
                  )}
                </th>
                <th className="px-4 py-2.5 text-right" title="ນັບສະເພາະວັນທີ່ມີການເຄື່ອນໄຫວເກີນ 5 km">
                  <div className="flex flex-col items-end leading-tight">
                    <span>ວັນ active</span>
                    <span className="text-[9px] font-normal text-slate-400">{">"} 5 km</span>
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right">ໄລຍະທາງ (km)</th>
                <th className="px-4 py-2.5 text-right" title="ສະເພາະວັນທີ່ແລ່ນເກີນ 5 km">
                  <div className="flex flex-col items-end leading-tight">
                    <span>ສູງສຸດ/ວັນ</span>
                    <span className="text-[9px] font-normal text-emerald-500/70">km</span>
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right" title="ສະເພາະວັນທີ່ແລ່ນເກີນ 5 km">
                  <div className="flex flex-col items-end leading-tight">
                    <span>ຕ່ຳສຸດ/ວັນ</span>
                    <span className="text-[9px] font-normal text-rose-500/70">km</span>
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right" title="ສະເພາະວັນທີ່ແລ່ນເກີນ 5 km">
                  <div className="flex flex-col items-end leading-tight">
                    <span>ສະເລ່ຍ/ວັນ</span>
                    <span className="text-[9px] font-normal text-sky-500/70">km</span>
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right">max (km/h)</th>
                <th className="px-4 py-2.5 text-right">ແລ່ນ</th>
                <th className="px-4 py-2.5 text-right">ຈອດ</th>
                <th className="px-4 py-2.5 text-left">Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center">
                    <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <FaSpinner className="animate-spin" size={12} />
                      ກຳລັງໂຫຼດ...
                    </div>
                  </td>
                </tr>
              ) : filteredSummary.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-10 text-center text-xs text-slate-400"
                  >
                    {error ??
                      "ບໍ່ມີຂໍ້ມູນ. ກົດ Sync GPS ເພື່ອດຶງປະຫວັດຈາກ provider."}
                  </td>
                </tr>
              ) : (
                filteredSummary.map((row) => {
                  const isOpen = expanded === row.imei;
                  const daily = dailyByImei[row.imei] ?? [];
                  return (
                    <Fragment key={row.imei}>
                      <tr
                        className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(row.imei)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
                              <FaTruck size={12} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {row.car_name || "-"}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {row.car_code}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                          {row.imei}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const rt = realtimeByImei[row.imei];
                            const status = realtimeStatus(rt);
                            const dotColor =
                              status === "moving"
                                ? "bg-emerald-500"
                                : status === "stopped"
                                  ? "bg-amber-500"
                                  : "bg-slate-400";
                            const label =
                              status === "moving"
                                ? `${rt?.speed ?? "0"} km/h`
                                : status === "stopped"
                                  ? "ຈອດ"
                                  : "ອອບລາຍ";
                            const labelColor =
                              status === "moving"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : status === "stopped"
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-slate-500";
                            return (
                              <div className="flex flex-col gap-0.5 min-w-[130px]">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`h-2 w-2 rounded-full ${dotColor} ${
                                      status === "moving" ? "animate-pulse" : ""
                                    }`}
                                  />
                                  <span
                                    className={`text-xs font-semibold tabular-nums ${labelColor}`}
                                  >
                                    {label}
                                  </span>
                                  {rt?.recorded_at && (
                                    <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
                                      {relativeTime(rt.recorded_at)}
                                    </span>
                                  )}
                                </div>
                                {rt?.address && (
                                  <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                    {rt.address}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                          {row.active_days}/{row.days_count}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center justify-end min-w-[80px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold tabular-nums">
                            {fmtKm(row.distance_km)}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
                          title={
                            row.max_daily_km_date
                              ? `ວັນທີ ${row.max_daily_km_date}`
                              : undefined
                          }
                        >
                          {row.max_daily_km != null && row.max_daily_km > 0 ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span>
                                {fmtKm(row.max_daily_km)}{" "}
                                <span className="text-[10px] font-normal text-emerald-500/70">km</span>
                              </span>
                              {row.max_daily_km_date && (
                                <span className="text-[9px] font-normal text-slate-400">
                                  {row.max_daily_km_date.slice(5)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-xs font-bold tabular-nums text-rose-700 dark:text-rose-400"
                          title={
                            row.min_daily_km_date
                              ? `ວັນທີ ${row.min_daily_km_date}`
                              : undefined
                          }
                        >
                          {row.min_daily_km != null && row.min_daily_km > 0 ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span>
                                {fmtKm(row.min_daily_km)}{" "}
                                <span className="text-[10px] font-normal text-rose-500/70">km</span>
                              </span>
                              {row.min_daily_km_date && (
                                <span className="text-[9px] font-normal text-slate-400">
                                  {row.min_daily_km_date.slice(5)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-bold tabular-nums text-sky-700 dark:text-sky-400">
                          {row.avg_daily_km != null && row.avg_daily_km > 0 ? (
                            <span>
                              {fmtKm(row.avg_daily_km)}{" "}
                              <span className="text-[10px] font-normal text-sky-500/70">km</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-amber-600">
                          {row.max_speed.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-sky-600">
                          {fmtSec(row.moving_seconds)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-slate-500">
                          {fmtSec(row.stopped_seconds)}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-400">
                          {row.last_synced || "-"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td
                            colSpan={12}
                            className="px-4 py-3 bg-slate-50 dark:bg-slate-800/30"
                          >
                            {dailyLoading === row.imei ? (
                              <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
                                <FaSpinner className="animate-spin" size={11} />
                                ກຳລັງໂຫຼດປະຫວັດ...
                              </div>
                            ) : daily.length === 0 ? (
                              <div className="text-center py-4 text-xs text-slate-400">
                                ບໍ່ມີຂໍ້ມູນໃນຊ່ວງນີ້
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200/50">
                                      <th className="px-2 py-1.5 text-left">
                                        ວັນທີ
                                      </th>
                                      <th className="px-2 py-1.5 text-left">
                                        ເຮີ່ມ
                                      </th>
                                      <th className="px-2 py-1.5 text-left">
                                        ສິ້ນສຸດ
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        ໄລຍະ (km)
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        max
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        ແລ່ນ
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        ຈອດ
                                      </th>
                                      <th className="px-2 py-1.5 text-right">
                                        ຈຸດ
                                      </th>
                                      <th className="px-2 py-1.5 text-right" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {daily.map((d) => (
                                      <tr
                                        key={d.usage_date}
                                        className="border-b border-slate-100 dark:border-white/5"
                                      >
                                        <td className="px-2 py-1.5 font-semibold text-slate-700 dark:text-slate-200">
                                          {d.usage_date_display}
                                        </td>
                                        <td className="px-2 py-1.5 tabular-nums text-slate-600">
                                          {d.first_time ?? "-"}
                                        </td>
                                        <td className="px-2 py-1.5 tabular-nums text-slate-600">
                                          {d.last_time ?? "-"}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">
                                          {fmtKm(d.distance_km)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-amber-600">
                                          {d.max_speed.toFixed(0)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-sky-600">
                                          {fmtSec(d.moving_seconds)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                                          {fmtSec(d.stopped_seconds)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                                          {d.points_count}
                                        </td>
                                        <td className="px-2 py-1.5 text-right">
                                          {d.points_count === 0 ? (
                                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-500/10 text-slate-400 px-2 py-1 text-[10px] font-semibold opacity-50 cursor-not-allowed">
                                              <FaMap size={9} />
                                              ແຜນທີ່
                                            </span>
                                          ) : (
                                            <Link
                                               href={`/tracking/gps-usage/track?imei=${encodeURIComponent(row.imei)}&date=${encodeURIComponent(d.usage_date)}&car=${encodeURIComponent(row.car_name ?? "")}`}
                                              onClick={(event) => event.stopPropagation()}
                                              className="inline-flex items-center gap-1 rounded-lg bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 px-2 py-1 text-[10px] font-semibold"
                                            >
                                              <FaMap size={9} />
                                              ແຜນທີ່
                                            </Link>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
      </div>

    </div>
  );
}

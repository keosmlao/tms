"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FaAngleLeft,
  FaCalendarAlt,
  FaClock,
  FaMap,
  FaParking,
  FaPause,
  FaPlay,
  FaRedo,
  FaRoute,
  FaSpinner,
  FaTachometerAlt,
} from "react-icons/fa";
import { Actions } from "@/lib/api";

// ==================== Types ====================
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

const PLAY_SPEED_OPTIONS = [
  { key: "normal", label: "ປົກກະຕິ", value: 10 },
  { key: "1x", label: "1x", value: 10 },
  { key: "2x", label: "2x", value: 20 },
  { key: "4x", label: "4x", value: 40 },
  { key: "8x", label: "8x", value: 80 },
  { key: "16x", label: "16x", value: 160 },
  { key: "64x", label: "64x", value: 640 },
] as const;

type PlaySpeedKey = (typeof PLAY_SPEED_OPTIONS)[number]["key"];

// ==================== Leaflet ====================
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

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTrackPoint(point: unknown): GpsUsageTrackPoint | null {
  if (!point || typeof point !== "object") return null;
  const raw = point as Partial<GpsUsageTrackPoint>;
  const lat = finiteNumber(raw.lat);
  const lng = finiteNumber(raw.lng);
  if (lat === null || lng === null) return null;
  return {
    t: typeof raw.t === "string" ? raw.t : "",
    lat,
    lng,
    speed: finiteNumber(raw.speed) ?? 0,
    heading: finiteNumber(raw.heading) ?? 0,
  };
}

function normalizeTrack(data: unknown): GpsUsageTrack {
  if (!data || typeof data !== "object") {
    return { header: null, points: [] };
  }
  const raw = data as Partial<GpsUsageTrack>;
  const points = Array.isArray(raw.points)
    ? raw.points.flatMap((point) => {
        const normalized = normalizeTrackPoint(point);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    header: raw.header ?? null,
    points,
  };
}

function clampPointIndex(index: number, pointCount: number): number {
  if (pointCount <= 0) return 0;
  return Math.min(pointCount - 1, Math.max(0, Math.floor(index)));
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

// ==================== Helpers ====================
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
function speedColor(speed: number): string {
  if (speed <= 3) return "#64748b";
  if (speed <= 20) return "#10b981";
  if (speed <= 50) return "#3b82f6";
  if (speed <= 80) return "#f59e0b";
  return "#ef4444";
}
function speedLabel(speed: number): string {
  if (speed <= 3) return "ຈອດ";
  if (speed <= 20) return "ຊ້າ";
  if (speed <= 50) return "ປົກກະຕິ";
  if (speed <= 80) return "ໄວ";
  return "ເລັ່ງ";
}
function findPlaybackStartIndex(points: GpsUsageTrackPoint[]): number {
  const idx = points.findIndex((point, pointIndex) => {
    if (point.speed > 3) return true;
    if (pointIndex === 0) return false;
    const prev = points[pointIndex - 1];
    return (
      Math.abs(point.lat - prev.lat) > 0.00008 ||
      Math.abs(point.lng - prev.lng) > 0.00008
    );
  });
  return idx >= 0 ? idx : 0;
}
function buildCarCursorHtml(heading: number): string {
  return `<div class="gps-cursor"><div class="gps-cursor-pulse"></div><div class="gps-cursor-car" style="transform:rotate(${heading}deg)"><svg viewBox="0 0 14 20" width="18" height="24"><g fill="white" stroke="rgba(15,23,42,0.35)" stroke-width="0.7" stroke-linejoin="round"><rect x="1" y="0.5" width="12" height="19" rx="3" ry="3.5"/></g><rect x="2.5" y="3" width="9" height="5" rx="1" fill="rgba(15,23,42,0.55)"/><rect x="2.5" y="12" width="9" height="5" rx="1" fill="rgba(15,23,42,0.35)"/><rect x="2" y="8.5" width="10" height="0.8" fill="rgba(255,255,255,0.5)"/><rect x="2" y="10.7" width="10" height="0.8" fill="rgba(255,255,255,0.5)"/></svg></div></div>`;
}

function hourlyDistance(points: GpsUsageTrackPoint[]): number[] {
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

function MetricCard({
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
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {label}
          </p>
          <p className="truncate text-sm font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ==================== Page ====================
export default function GpsUsageTrackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const imei = searchParams.get("imei") ?? "";
  const date = searchParams.get("date") ?? "";
  const carName = searchParams.get("car") ?? "";

  const leafletReady = useLeafletReady();
  const [track, setTrack] = useState<GpsUsageTrack | null>(null);
  const [loading, setLoading] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const shadowRef = useRef<LeafletPolyline | null>(null);
  const segmentsRef = useRef<LeafletPolyline[]>([]);
  const progressRef = useRef<LeafletPolyline | null>(null);
  const startMarkerRef = useRef<LeafletMarker | null>(null);
  const endMarkerRef = useRef<LeafletMarker | null>(null);
  const cursorMarkerRef = useRef<LeafletMarker | null>(null);
  const liveMarkerRef = useRef<LeafletMarker | null>(null);
  const followStateRef = useRef<{
    lat: number;
    lng: number;
    followedAt: number;
  } | null>(null);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playSpeedKey, setPlaySpeedKey] = useState<PlaySpeedKey>("normal");
  const floatIndexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const playSpeed =
    PLAY_SPEED_OPTIONS.find((option) => option.key === playSpeedKey)?.value ??
    10;

  // Live realtime position
  const [livePos, setLivePos] = useState<{
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    recordedAt: string;
    address: string;
  } | null>(null);
  const [liveFetchedAt, setLiveFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!imei || !date) return;
    let ignore = false;
    setLoading(true);
    setCurrentIndex(0);
    floatIndexRef.current = 0;
    setIsPlaying(false);
    Actions.getGpsUsageTrack(imei, date)
      .then((data) => {
        if (ignore) return;
        const nextTrack = normalizeTrack(data);
        const startIndex = findPlaybackStartIndex(nextTrack.points);
        floatIndexRef.current = startIndex;
        setCurrentIndex(startIndex);
        setTrack(nextTrack);
      })
      .catch(console.error)
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [imei, date]);

  // Init map
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return;
    const L = getLeaflet();
    if (!L) return;
    // Use SVG renderer (default) — Canvas renderer crashes with
    // "Cannot read properties of undefined (reading 'x')" when polylines
    // are added before the canvas's _bounds is initialized.
    // Our point count is downsampled to ≤2000, so SVG is plenty fast.
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView([17.9757, 102.6331], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [leafletReady]);

  // Build segments + markers when track loads.
  // We defer to next frame after invalidateSize so the SVG renderer's
  // internal _bounds is computed from a correctly-sized container.
  // Otherwise, addTo(map) on the first polyline crashes inside _clipPoints
  // with "Cannot read properties of undefined (reading 'x')".
  useEffect(() => {
    const map = mapRef.current;
    const L = getLeaflet();
    if (!map || !L || !track) return;

    map.invalidateSize();

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;

      shadowRef.current?.remove();
    segmentsRef.current.forEach((s) => s.remove());
    segmentsRef.current = [];
    progressRef.current?.remove();
    startMarkerRef.current?.remove();
    endMarkerRef.current?.remove();
    cursorMarkerRef.current?.remove();
    shadowRef.current = null;
    progressRef.current = null;
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    cursorMarkerRef.current = null;
    followStateRef.current = null;

    // Defensive: skip points with bad coords (NaN / null) to avoid Leaflet
    // Bounds.js crashing inside fitBounds.
    const pts = track.points.filter(
      (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)
    );
    if (pts.length === 0) return;

    const latlngs: Array<[number, number]> = pts.map((p) => [p.lat, p.lng]);

    const shadow = L.polyline(latlngs, {
      color: "#0f172a",
      weight: 11,
      opacity: 0.14,
      fill: false,
      interactive: false,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    shadowRef.current = shadow;

    if (pts.length >= 2) {
      let runStart = 0;
      let runColor = speedColor((pts[0].speed + pts[1].speed) / 2);
      const pushRun = (start: number, end: number, color: string) => {
        if (end <= start) return;
        const slice = latlngs.slice(start, end + 1);
        const seg = L.polyline(slice, {
          color,
          weight: 5,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);
        segmentsRef.current.push(seg);
      };
      for (let i = 1; i < pts.length; i++) {
        const c = speedColor((pts[i - 1].speed + pts[i].speed) / 2);
        if (c !== runColor) {
          pushRun(runStart, i - 1, runColor);
          runStart = i - 1;
          runColor = c;
        }
      }
      pushRun(runStart, pts.length - 1, runColor);
    }

    const progress = L.polyline([latlngs[0]], {
      color: "#a855f7",
      weight: 5.5,
      opacity: 0.95,
      fill: false,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(map);
    progressRef.current = progress;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const startIcon = L.divIcon({
      html: `<div class="gps-pin gps-pin-start"><div class="gps-pin-dot"></div></div>`,
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const endIcon = L.divIcon({
      html: `<div class="gps-pin gps-pin-end"><div class="gps-pin-dot"></div></div>`,
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    startMarkerRef.current = L.marker([first.lat, first.lng], {
      icon: startIcon,
    }).addTo(map);
    endMarkerRef.current = L.marker([last.lat, last.lng], {
      icon: endIcon,
    }).addTo(map);

    const cursorIcon = L.divIcon({
      html: buildCarCursorHtml(first.heading || 0),
      className: "",
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
    cursorMarkerRef.current = L.marker([first.lat, first.lng], {
      icon: cursorIcon,
      interactive: false,
      zIndexOffset: 1000,
    } as Record<string, unknown>).addTo(map);

    // Single point can't form valid bounds — center on it instead.
    if (pts.length === 1) {
      map.setView([first.lat, first.lng], 15);
    } else {
      try {
        map.fitBounds(shadow.getBounds(), { padding: [60, 60], maxZoom: 13 });
      } catch (err) {
        console.warn("[gps-track] fitBounds failed, falling back to setView", err);
        map.setView([first.lat, first.lng], 13);
      }
    }
      setTimeout(() => map.invalidateSize(), 120);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [track]);

  // Update cursor + progress on index change
  useEffect(() => {
    const map = mapRef.current;
    const L = getLeaflet();
    const cursor = cursorMarkerRef.current;
    if (!map || !L || !cursor || !track) return;
    const pts = track.points;
    const safeIndex = clampPointIndex(currentIndex, pts.length);
    const p = pts[safeIndex];
    if (!p) return;
    cursor.setLatLng([p.lat, p.lng]);
    const cursorIcon = L.divIcon({
      html: buildCarCursorHtml(p.heading || 0),
      className: "",
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
    cursor.setIcon?.(cursorIcon);

    const progress = progressRef.current;
    if (progress) {
      progress.remove();
      const slice = pts
        .slice(0, safeIndex + 1)
        .map((pt) => [pt.lat, pt.lng] as [number, number]);
      if (slice.length >= 1) {
        const next = L.polyline(slice, {
          color: "#a855f7",
          weight: 5.5,
          opacity: 0.95,
          fill: false,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);
        progressRef.current = next;
      }
    }

    if (isPlaying && p.speed > 3) {
      const prevFollow = followStateRef.current;
      const now = performance.now();
      const movedEnough =
        !prevFollow ||
        Math.abs(p.lat - prevFollow.lat) > 0.00025 ||
        Math.abs(p.lng - prevFollow.lng) > 0.00025;
      const staleEnough = !prevFollow || now - prevFollow.followedAt > 420;
      if (movedEnough || staleEnough) {
        map.setView([p.lat, p.lng]);
        followStateRef.current = {
          lat: p.lat,
          lng: p.lng,
          followedAt: now,
        };
      }
    } else if (!isPlaying) {
      followStateRef.current = null;
    }
  }, [currentIndex, isPlaying, track]);

  // Invalidate size on mount to handle layout
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 250);
    return () => clearTimeout(id);
  }, [leafletReady]);

  // Fetch live realtime position for this imei every 30s
  useEffect(() => {
    if (!imei) return;
    let stop = false;
    const fetchIt = async () => {
      try {
        const r = (await Actions.getGpsRealtime(imei)) as
          | {
              imei: string;
              lat: string;
              lng: string;
              speed: string;
              heading: string;
              recorded_at: string;
              address: string;
            }
          | null;
        if (stop) return;
        setLiveFetchedAt(new Date());
        if (!r) {
          setLivePos(null);
          return;
        }
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setLivePos(null);
          return;
        }
        setLivePos({
          lat,
          lng,
          speed: Number(r.speed) || 0,
          heading: Number(r.heading) || 0,
          recordedAt: r.recorded_at ?? "",
          address: r.address ?? "",
        });
      } catch (err) {
        console.error("live realtime failed", err);
      }
    };
    void fetchIt();
    const id = window.setInterval(fetchIt, 30_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [imei]);

  // Render/update live marker
  useEffect(() => {
    const map = mapRef.current;
    const L = getLeaflet();
    if (!map || !L) return;
    liveMarkerRef.current?.remove();
    liveMarkerRef.current = null;
    if (!livePos) return;
    const icon = L.divIcon({
      html: `<div class="gps-live-marker"><div class="gps-live-pulse"></div><div class="gps-live-dot"><svg viewBox="0 0 24 24" fill="white" width="11" height="11"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg></div></div>`,
      className: "",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    liveMarkerRef.current = L.marker([livePos.lat, livePos.lng], {
      icon,
      interactive: false,
      zIndexOffset: 950,
    } as Record<string, unknown>).addTo(map);
  }, [livePos]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !track || track.points.length === 0) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      floatIndexRef.current += playSpeed * dt;
      const maxIdx = track.points.length - 1;
      if (floatIndexRef.current >= maxIdx) {
        floatIndexRef.current = maxIdx;
        setCurrentIndex(maxIdx);
        setIsPlaying(false);
        return;
      }
      setCurrentIndex(Math.floor(floatIndexRef.current));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, playSpeed, track]);

  const togglePlay = () => {
    if (!track || track.points.length === 0) return;
    const startIndex = findPlaybackStartIndex(track.points);
    if (currentIndex >= track.points.length - 1) {
      floatIndexRef.current = startIndex;
      setCurrentIndex(startIndex);
    }
    setIsPlaying((p) => !p);
  };

  const restart = () => {
    const startIndex = findPlaybackStartIndex(track?.points ?? []);
    floatIndexRef.current = startIndex;
    setCurrentIndex(startIndex);
    setIsPlaying(false);
  };

  const header = track?.header;
  const pts = track?.points ?? [];
  const pointCount = pts.length;
  const safeCurrentIndex = clampPointIndex(currentIndex, pointCount);
  const currentPoint = pts[safeCurrentIndex];
  const progressPct =
    pointCount > 1 ? (safeCurrentIndex / (pointCount - 1)) * 100 : 0;
  const hoursChartRaw = hourlyDistance(pts);
  // Trim leading/trailing empty hours — show only the active range
  const firstActive = hoursChartRaw.findIndex((v) => v > 0);
  const lastActive = (() => {
    for (let i = hoursChartRaw.length - 1; i >= 0; i--) {
      if (hoursChartRaw[i] > 0) return i;
    }
    return -1;
  })();
  const hoursChart: Array<{ hour: number; km: number }> =
    firstActive === -1
      ? []
      : hoursChartRaw
          .slice(firstActive, lastActive + 1)
          .map((km, i) => ({ hour: firstActive + i, km }));
  const hoursMax = Math.max(1, ...hoursChart.map((h) => h.km));

  const speedLegendItems = [
    { color: "#64748b", label: "ຈອດ", range: "≤3" },
    { color: "#10b981", label: "ຊ້າ", range: "4-20" },
    { color: "#3b82f6", label: "ປົກກະຕິ", range: "21-50" },
    { color: "#f59e0b", label: "ໄວ", range: "51-80" },
    { color: "#ef4444", label: "ເລັ່ງ", range: "81+" },
  ];

  if (!imei || !date) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-slate-500">ຂາດ imei ຫຼື date</p>
        <Link
           href="/tracking/gps-usage"
          className="mt-3 rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600"
        >
          ກັບໄປໜ້າສະຫຼຸບ
        </Link>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .gps-track-page .leaflet-container {
          background: linear-gradient(180deg, #e8eef8 0%, #dbe7f5 100%);
        }
        .gps-track-page .leaflet-control-attribution {
          border-radius: 999px 0 0 0;
          background: rgba(255, 255, 255, 0.88);
          padding: 4px 10px;
          backdrop-filter: blur(10px);
        }
        .gps-pin {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        }
        .gps-pin-dot { width: 12px; height: 12px; border-radius: 50%; background: white; }
        .gps-pin-start { background: #10b981; border: 3px solid white; }
        .gps-pin-end { background: #ef4444; border: 3px solid white; }
        .gps-cursor {
          position: relative;
          width: 42px; height: 42px;
          display: flex; align-items: center; justify-content: center;
        }
        .gps-cursor-pulse {
          position: absolute; inset: 6px;
          border-radius: 50%;
          background: rgba(168, 85, 247, 0.35);
          animation: gps-cursor-pulse 1.6s ease-out infinite;
        }
        @keyframes gps-cursor-pulse {
          0% { transform: scale(0.7); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .gps-cursor-car {
          position: relative;
          width: 30px; height: 30px;
          background: linear-gradient(135deg, #a855f7, #6366f1);
          border: 2.5px solid white;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.55);
          transition: transform 180ms ease-out;
        }
        .gps-cursor-car svg {
          display: block;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
        }
        .gps-live-marker {
          position: relative;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
        }
        .gps-live-pulse {
          position: absolute; inset: 2px;
          border-radius: 50%;
          background: rgba(6, 182, 212, 0.45);
          animation: gps-live-pulse 1.4s ease-out infinite;
        }
        @keyframes gps-live-pulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2.3); opacity: 0; }
        }
        .gps-live-dot {
          position: relative;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #06b6d4, #0891b2);
          border: 2.5px solid white;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 3px 10px rgba(6, 182, 212, 0.6);
        }
        .gps-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%;
          height: 6px;
          background: transparent;
        }
        .gps-slider::-webkit-slider-runnable-track {
          height: 6px; border-radius: 999px;
          background: linear-gradient(to right,
            #a855f7 0%, #a855f7 var(--p, 0%),
            rgba(255,255,255,0.15) var(--p, 0%), rgba(255,255,255,0.15) 100%);
        }
        .gps-slider::-moz-range-track {
          height: 6px; border-radius: 999px;
          background: linear-gradient(to right,
            #a855f7 0%, #a855f7 var(--p, 0%),
            rgba(255,255,255,0.15) var(--p, 0%), rgba(255,255,255,0.15) 100%);
        }
        .gps-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: white; border: 3px solid #a855f7;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          cursor: pointer;
          margin-top: -5px;
        }
        .gps-slider::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: white; border: 3px solid #a855f7;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          cursor: pointer;
        }
      `}</style>
      <div className="gps-track-page -m-4 h-[calc(100vh-6.5rem)] flex flex-col bg-slate-950 overflow-hidden">
        {/* HEADER */}
        <div className="shrink-0 bg-[#0b1b18] border-b border-white/10">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => router.push("/tracking/gps-usage")}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition-colors shrink-0"
            >
              <FaAngleLeft size={11} />
              ກັບຄືນ
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-lg shadow-sky-900/10 shrink-0">
              <FaMap size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {carName && (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
                    {carName}
                  </span>
                )}
                <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-teal-300">
                  IMEI {imei}
                </span>
              </div>
              <h1 className="truncate text-lg font-bold text-white">
                ເສັ້ນທາງ {header?.usage_date ?? date}
              </h1>
            </div>
          </div>

          {header && (
            <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-3 lg:grid-cols-6 sm:px-5">
              <MetricCard
                icon={<FaRoute size={12} className="text-teal-300" />}
                label="Distance"
                value={`${fmtKm(header.distance_km)} km`}
                accentClass="bg-teal-500/20"
              />
              <MetricCard
                icon={<FaTachometerAlt size={12} className="text-amber-300" />}
                label="Max"
                value={`${header.max_speed.toFixed(0)} km/h`}
                accentClass="bg-amber-500/20"
              />
              <MetricCard
                icon={<FaClock size={12} className="text-emerald-300" />}
                label="Moving"
                value={fmtSec(header.moving_seconds)}
                accentClass="bg-emerald-500/20"
              />
              <MetricCard
                icon={<FaParking size={12} className="text-slate-300" />}
                label="Stopped"
                value={fmtSec(header.stopped_seconds)}
                accentClass="bg-slate-500/20"
              />
              <MetricCard
                icon={<FaCalendarAlt size={12} className="text-sky-300" />}
                label="Time"
                value={
                  header.first_time && header.last_time
                    ? `${header.first_time}-${header.last_time}`
                    : "-"
                }
                accentClass="bg-sky-500/20"
              />
              <MetricCard
                icon={<FaMap size={12} className="text-sky-300" />}
                label="Points"
                value={pointCount.toLocaleString("en-US")}
                accentClass="bg-sky-500/20"
              />
            </div>
          )}
        </div>

        {/* MAIN: map + sidebar */}
        <div className="relative flex flex-1 min-h-0">
          <div className="relative flex-1 bg-slate-900">
            <div ref={mapContainerRef} className="absolute inset-0" />

            {currentPoint && (
              <div className="pointer-events-none absolute left-4 top-4 z-[410] flex flex-col gap-2">
                <div className="rounded-lg border border-white/15 bg-slate-900/85 px-3.5 py-2.5 shadow-xl backdrop-blur-md min-w-[160px]">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                    Current
                  </p>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-mono text-lg font-bold text-white tabular-nums">
                      {currentPoint.t}
                    </span>
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                      style={{
                        backgroundColor: `${speedColor(currentPoint.speed)}33`,
                        color: speedColor(currentPoint.speed),
                      }}
                    >
                      {speedLabel(currentPoint.speed)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-200">
                    <FaTachometerAlt
                      size={11}
                      style={{ color: speedColor(currentPoint.speed) }}
                    />
                    <span className="font-semibold tabular-nums">
                      {currentPoint.speed.toFixed(0)}
                    </span>
                    <span className="text-[10px] text-slate-400">km/h</span>
                  </div>
                </div>

                {header && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1.5 backdrop-blur">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950" />
                      <span className="text-[10px] text-slate-400">ເລີ່ມ</span>
                      <span className="ml-auto font-mono text-[11px] font-semibold text-white">
                        {header.first_time ?? "-"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1.5 backdrop-blur">
                      <span className="h-2 w-2 rounded-full bg-rose-400 ring-2 ring-rose-950" />
                      <span className="text-[10px] text-slate-400">ສິ້ນສຸດ</span>
                      <span className="ml-auto font-mono text-[11px] font-semibold text-white">
                        {header.last_time ?? "-"}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 backdrop-blur-md min-w-[180px]">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                    </span>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                      Live
                    </p>
                    {liveFetchedAt && (
                      <span className="ml-auto text-[9px] text-cyan-300/70 tabular-nums">
                        {liveFetchedAt.toLocaleTimeString("lo-LA", {
                          hour12: false,
                        })}
                      </span>
                    )}
                  </div>
                  {livePos ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-cyan-100 tabular-nums">
                          {livePos.speed.toFixed(0)}
                        </span>
                        <span className="text-[10px] text-cyan-300/70">
                          km/h
                        </span>
                        {livePos.recordedAt && (
                          <span className="ml-auto font-mono text-[10px] text-cyan-200/80">
                            {livePos.recordedAt.slice(11, 16) ||
                              livePos.recordedAt}
                          </span>
                        )}
                      </div>
                      {livePos.address && (
                        <p className="mt-1 text-[10px] text-cyan-100/80 leading-snug line-clamp-2">
                          {livePos.address}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-cyan-200/70">
                      ບໍ່ໄດ້ຮັບສັນຍານ
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute right-4 top-4 z-[410] rounded-lg border border-white/10 bg-slate-900/85 px-3 py-2 shadow-xl backdrop-blur-md">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                ຄວາມໄວ (km/h)
              </p>
              <div className="flex flex-col gap-1">
                {speedLegendItems.map((it) => (
                  <div
                    key={it.label}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <span
                      className="inline-block h-1 w-5 rounded-full"
                      style={{ backgroundColor: it.color }}
                    />
                    <span className="text-slate-200">{it.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-slate-500">
                      {it.range}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {(loading || !leafletReady) && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-full bg-slate-900/95 px-4 py-2 shadow-md">
                  <FaSpinner
                    className="animate-spin text-sky-400"
                    size={14}
                  />
                  <span className="text-xs text-slate-200">ກຳລັງໂຫຼດ...</span>
                </div>
              </div>
            )}
            {!loading && track && track.points.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-lg border border-white/10 bg-slate-900/90 px-4 py-3 shadow-md text-center">
                  <p className="text-xs font-semibold text-slate-200">
                    ບໍ່ມີຂໍ້ມູນ GPS ໃນວັນນີ້
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="hidden md:flex w-[240px] flex-col border-l border-white/10 bg-slate-950/95 shrink-0">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                ໄລຍະທາງ / ຊົ່ວໂມງ
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                ການເຄື່ອນໄຫວແຍກຕາມຊົ່ວໂມງ
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {hoursChart.length === 0 ? (
                <div className="px-2 py-6 text-center text-[11px] text-slate-500">
                  ບໍ່ມີການເຄື່ອນໄຫວ
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {hoursChart.map(({ hour, km }) => {
                    const pct = (km / hoursMax) * 100;
                    const isActive = currentPoint
                      ? Number(currentPoint.t.slice(0, 2)) === hour
                      : false;
                    return (
                      <div
                        key={hour}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                          isActive ? "bg-sky-500/20" : ""
                        }`}
                      >
                        <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-500">
                          {String(hour).padStart(2, "0")}
                        </span>
                        <div className="relative flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          {km > 0 && (
                            <div
                              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500"
                              style={{ width: `${Math.max(6, pct)}%` }}
                            />
                          )}
                        </div>
                        <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-400">
                          {km > 0 ? km.toFixed(1) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* PLAYBACK CONTROLS */}
        <div className="shrink-0 border-t border-white/10 bg-slate-950/95 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={restart}
              disabled={pointCount === 0}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-40 transition-colors"
              title="ເລີ່ມໃໝ່"
            >
              <FaRedo size={12} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={pointCount === 0}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-lg shadow-sky-900/10 hover:shadow-xl hover:shadow-sky-500/50 transition-all disabled:opacity-40"
              title={isPlaying ? "ຢຸດ" : "ຫຼິ້ນ"}
            >
              {isPlaying ? <FaPause size={13} /> : <FaPlay size={13} />}
            </button>

            <div className="flex-1 flex items-center gap-3">
              <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums min-w-[60px]">
                {currentPoint?.t ?? "--:--:--"}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, pointCount - 1)}
                value={safeCurrentIndex}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setIsPlaying(false);
                  floatIndexRef.current = v;
                  setCurrentIndex(v);
                }}
                className="gps-slider flex-1"
                style={{ "--p": `${progressPct}%` } as React.CSSProperties}
                disabled={pointCount === 0}
              />
              <span className="font-mono text-xs text-slate-500 tabular-nums min-w-[60px] text-right">
                {pts[pts.length - 1]?.t ?? "--:--:--"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/5 p-1">
              {PLAY_SPEED_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPlaySpeedKey(m.key)}
                  className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                    playSpeedKey === m.key
                      ? "bg-sky-500 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

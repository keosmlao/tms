"use client";

import { useEffect, useRef, useState } from "react";
import { Actions } from "@/lib/api";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => unknown;
  panTo: (latlng: [number, number], options?: Record<string, unknown>) => unknown;
  getZoom: () => number;
  on: (events: string, fn: () => void) => unknown;
  remove: () => unknown;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => unknown;
};
type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => LeafletMarker;
  bindPopup: (html: string) => LeafletMarker;
  setIcon: (icon: unknown) => LeafletMarker;
  remove: () => unknown;
};
type LeafletApi = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (
    url: string,
    opts?: Record<string, unknown>
  ) => { addTo: (m: LeafletMap) => unknown };
  marker: (
    latlng: [number, number],
    opts?: Record<string, unknown>
  ) => LeafletMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
  latLngBounds: (corners: Array<[number, number]>) => unknown;
};

function getL(): LeafletApi | undefined {
  return (window as unknown as { L?: LeafletApi }).L;
}

function useLeafletReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!document.querySelector("link[data-leaflet]")) {
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

function makeIcon(L: LeafletApi, opts: { color: string; emoji: string; ring?: string }) {
  return L.divIcon({
    className: "tms-live-marker",
    html: `<div style="
      background:${opts.color};
      color:white;
      width:36px;height:36px;
      border-radius:50%;
      box-shadow:0 0 0 4px ${opts.ring ?? "rgba(255,255,255,0.6)"}, 0 4px 10px rgba(0,0,0,0.2);
      display:flex;align-items:center;justify-content:center;
      font-size:18px;
    ">${opts.emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// Inject the pulse keyframes once. The live car marker has a radar ring that
// continuously expands+fades so it visibly "blinks" even when standing still.
function ensureCarStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("tms-car-style")) return;
  const s = document.createElement("style");
  s.id = "tms-car-style";
  s.textContent = `
    @keyframes tms-car-pulse {
      0%   { transform: scale(0.6); opacity: 0.75; }
      70%  { transform: scale(2.4); opacity: 0;    }
      100% { transform: scale(2.4); opacity: 0;    }
    }
    .tms-car-wrap { position: relative; width: 40px; height: 40px; }
    .tms-car-ring {
      position: absolute; inset: 0; border-radius: 50%;
      background: rgba(14,165,233,0.45);
      animation: tms-car-pulse 1.6s ease-out infinite;
    }
    .tms-car-body {
      position: absolute; inset: 4px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; background: #0ea5e9; color: #fff; font-size: 18px;
      box-shadow: 0 0 0 3px rgba(255,255,255,0.85), 0 4px 10px rgba(0,0,0,0.3);
    }
  `;
  document.head.appendChild(s);
}

// Animated truck marker. We don't rotate the emoji (it reads upside-down at
// many headings); the radar ring conveys "live" instead.
function makeCarIcon(L: LeafletApi) {
  return L.divIcon({
    className: "tms-live-car",
    html: `<div class="tms-car-wrap">
      <div class="tms-car-ring"></div>
      <div class="tms-car-body">🚚</div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

interface Pos {
  lat: number;
  lng: number;
}

/**
 * Car position carrying optional freshness metadata so the map can tell the
 * user whether the GPS fix is live, stale, or absent — a blank map otherwise
 * reads as "broken". `trackBill` returns these fields; the public fetcher may
 * omit them (treated as unknown freshness).
 */
type CarPos = Pos & {
  recorded_at?: string;
  age_seconds?: number;
  heading?: number;
};

// How often we poll for a fresh fix. The driver app buffers GPS ~every 3s, so
// match that cadence for a near-live feel.
const POLL_MS = 3_000;

// Older than this → the fix is considered stale (driver app stopped sending or
// lost signal).
const STALE_AFTER_SECONDS = 180;

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} ວິ`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} ນທີ`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ຊມ`;
  return `${Math.round(seconds / 86400)} ມື້`;
}

export function TrackingLiveMap({
  billNo,
  initialCar,
  start,
  end,
  carName,
  refreshFn,
}: {
  billNo: string;
  initialCar: CarPos | null;
  start: Pos | null;
  end: Pos | null;
  carName: string;
  /**
   * Optional override that returns the latest car position. Defaults to the
   * authenticated `Actions.trackBill` call used in the admin dashboard. The
   * public customer page injects a public-endpoint fetcher instead.
   */
  refreshFn?: () => Promise<CarPos | null>;
}) {
  const ready = useLeafletReady();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const carMarkerRef = useRef<LeafletMarker | null>(null);
  // The marker's currently-rendered position (mid-animation), distinct from the
  // latest target `car`, so each new fix tweens smoothly from where it sits.
  const carDisplayRef = useRef<Pos | null>(initialCar);
  const rafRef = useRef<number | null>(null);
  // Auto-recentre on the car until the user drags the map away themselves.
  const followRef = useRef(true);
  const [car, setCar] = useState<CarPos | null>(initialCar);
  const [refreshing, setRefreshing] = useState(false);

  // Build the map once Leaflet is available + container is mounted.
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = getL();
    if (!L) return;
    ensureCarStyle();

    const center: [number, number] = car
      ? [car.lat, car.lng]
      : start
      ? [start.lat, start.lng]
      : end
      ? [end.lat, end.lng]
      : [17.9757, 102.6331];
    // Interactive map: the user can zoom/pan to watch the vehicle move. We
    // auto-follow the car until the user drags away to explore (then we stop
    // re-centring so we don't fight them).
    const map = L.map(containerRef.current, {
      center,
      zoom: car ? 15 : 13,
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
      dragging: true,
    });
    mapRef.current = map;
    map.on("dragstart", () => {
      followRef.current = false;
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    if (start) {
      L.marker([start.lat, start.lng], {
        icon: makeIcon(L, { color: "#3b82f6", emoji: "🏁" }),
      })
        .addTo(map)
        .bindPopup("ຈຸດເລີ່ມຈັດສົ່ງ");
    }
    if (end) {
      L.marker([end.lat, end.lng], {
        icon: makeIcon(L, { color: "#10b981", emoji: "📍" }),
      })
        .addTo(map)
        .bindPopup("ຈຸດສົ່ງສຳເລັດ");
    }
    if (car) {
      const m = L.marker([car.lat, car.lng], { icon: makeCarIcon(L) })
        .addTo(map)
        .bindPopup(carName);
      carMarkerRef.current = m;
      carDisplayRef.current = { lat: car.lat, lng: car.lng };
    }

    // Fit all markers if more than one location.
    const corners: Array<[number, number]> = [];
    if (start) corners.push([start.lat, start.lng]);
    if (end) corners.push([end.lat, end.lng]);
    if (car) corners.push([car.lat, car.lng]);
    if (corners.length >= 2) {
      const b = L.latLngBounds(corners);
      map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      carMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Animate the car marker toward each new fix and keep the map centred on it,
  // so the vehicle visibly glides between the 3s polls instead of teleporting.
  useEffect(() => {
    const L = getL();
    const map = mapRef.current;
    if (!ready || !L || !map || !car) return;

    // First fix → drop the marker and centre on it immediately.
    if (!carMarkerRef.current) {
      const m = L.marker([car.lat, car.lng], { icon: makeCarIcon(L) })
        .addTo(map)
        .bindPopup(carName);
      carMarkerRef.current = m;
      carDisplayRef.current = { lat: car.lat, lng: car.lng };
      map.setView([car.lat, car.lng], Math.max(map.getZoom?.() ?? 15, 15));
      return;
    }

    const from = carDisplayRef.current ?? { lat: car.lat, lng: car.lng };
    const to = { lat: car.lat, lng: car.lng };
    // Nothing moved → skip the tween (still pulses via CSS).
    if (Math.abs(from.lat - to.lat) < 1e-7 && Math.abs(from.lng - to.lng) < 1e-7) {
      return;
    }

    const DURATION = 1500; // ms — comfortably under the 3s poll interval
    const startedAt = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / DURATION);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const lat = from.lat + (to.lat - from.lat) * ease;
      const lng = from.lng + (to.lng - from.lng) * ease;
      carMarkerRef.current?.setLatLng([lat, lng]);
      carDisplayRef.current = { lat, lng };
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    if (followRef.current) {
      map.panTo([to.lat, to.lng], { animate: true, duration: 1.2 });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [car, ready, carName]);

  // Poll for fresh GPS every few seconds (POLL_MS).
  useEffect(() => {
    if (!billNo) return;
    let cancelled = false;
    const tick = async () => {
      setRefreshing(true);
      try {
        let next: CarPos | null = null;
        if (refreshFn) {
          next = await refreshFn();
        } else {
          const data = (await Actions.trackBill(billNo)) as
            | { car_position?: CarPos | null }
            | null;
          next = data?.car_position ?? null;
        }
        if (cancelled) return;
        if (next && Number.isFinite(next.lat) && Number.isFinite(next.lng)) {
          setCar(next);
        }
      } catch (e) {
        console.warn("[live-map] refresh failed:", e);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [billNo, refreshFn]);

  // Google Maps deep-link — prefers car-to-destination directions, then car
  // position, then start/end. Returns null when there's nothing locatable.
  const gmapsUrl = (() => {
    if (car && end) {
      return `https://www.google.com/maps/dir/?api=1&origin=${car.lat},${car.lng}&destination=${end.lat},${end.lng}`;
    }
    if (start && end) {
      return `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}`;
    }
    const target = car || end || start;
    if (target) return `https://www.google.com/maps?q=${target.lat},${target.lng}`;
    return null;
  })();

  // GPS status drives the header badge AND the empty-map overlay. A blank map
  // with a green "Live" badge (the old behaviour) reads as broken — make the
  // real state explicit: live fix / stale fix / no fix yet.
  const ageSeconds = car?.age_seconds;
  const isStale =
    !!car && typeof ageSeconds === "number" && ageSeconds > STALE_AFTER_SECONDS;
  const gpsStatus: "loading" | "live" | "stale" | "none" = refreshing
    ? "loading"
    : !car
    ? "none"
    : isStale
    ? "stale"
    : "live";
  const badge = {
    loading: {
      cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
      label: "ກຳລັງໂຫຼດ...",
    },
    live: {
      cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500 animate-pulse",
      label: "Live",
    },
    stale: {
      cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
      label:
        typeof ageSeconds === "number"
          ? `GPS ເກົ່າ (${formatAge(ageSeconds)})`
          : "GPS ເກົ່າ",
    },
    none: {
      cls: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
      dot: "bg-slate-400",
      label: "ລໍຖ້າສັນຍານ GPS",
    },
  }[gpsStatus];

  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <span>🗺️</span>
          </div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">
            ແຜນທີ່ສົດ
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {car?.recorded_at && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
              ອັບເດດ: {car.recorded_at}
            </span>
          )}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${badge.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
          {gmapsUrl && (
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors inline-flex items-center gap-1"
              title="ເປີດໃນ Google Maps"
            >
              <span>🌐</span>
              Google Maps
            </a>
          )}
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full h-[420px] z-0" />
        {gpsStatus === "none" && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-900/30 backdrop-blur-[1px] pointer-events-none">
            <div className="pointer-events-auto max-w-xs text-center px-5 py-4 rounded-xl bg-white/95 dark:bg-slate-800/95 shadow-lg border border-slate-200/60 dark:border-white/10">
              <div className="text-2xl mb-1">📡</div>
              <div className="text-sm font-bold text-slate-800 dark:text-white">
                ຍັງບໍ່ມີສັນຍານ GPS ຈາກມືຖືຄົນຂັບ
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                ຕຳແໜ່ງຈະປາກົດເມື່ອຄົນຂັບເປີດ app ແລະ ເລີ່ມການເດີນທາງ.
                ກວດທຸກ 3 ວິ.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

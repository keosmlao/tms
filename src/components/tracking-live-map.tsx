"use client";

import { useEffect, useRef, useState } from "react";
import { Actions } from "@/lib/api";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => unknown;
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

interface Pos {
  lat: number;
  lng: number;
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
  initialCar: Pos | null;
  start: Pos | null;
  end: Pos | null;
  carName: string;
  /**
   * Optional override that returns the latest car position. Defaults to the
   * authenticated `Actions.trackBill` call used in the admin dashboard. The
   * public customer page injects a public-endpoint fetcher instead.
   */
  refreshFn?: () => Promise<Pos | null>;
}) {
  const ready = useLeafletReady();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const carMarkerRef = useRef<LeafletMarker | null>(null);
  const [car, setCar] = useState<Pos | null>(initialCar);
  const [refreshing, setRefreshing] = useState(false);

  // Build the map once Leaflet is available + container is mounted.
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = getL();
    if (!L) return;

    const center: [number, number] = car
      ? [car.lat, car.lng]
      : start
      ? [start.lat, start.lng]
      : end
      ? [end.lat, end.lng]
      : [17.9757, 102.6331];
    const map = L.map(containerRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    });
    mapRef.current = map;
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
      const m = L.marker([car.lat, car.lng], {
        icon: makeIcon(L, { color: "#0ea5e9", emoji: "🚚" }),
      })
        .addTo(map)
        .bindPopup(carName);
      carMarkerRef.current = m;
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

  // Update or create the car marker whenever its position changes.
  useEffect(() => {
    const L = getL();
    const map = mapRef.current;
    if (!ready || !L || !map || !car) return;
    if (carMarkerRef.current) {
      carMarkerRef.current.setLatLng([car.lat, car.lng]);
    } else {
      const m = L.marker([car.lat, car.lng], {
        icon: makeIcon(L, { color: "#0ea5e9", emoji: "🚚" }),
      })
        .addTo(map)
        .bindPopup(carName);
      carMarkerRef.current = m;
    }
  }, [car, ready, carName]);

  // Poll for fresh GPS every 20s.
  useEffect(() => {
    if (!billNo) return;
    let cancelled = false;
    const tick = async () => {
      setRefreshing(true);
      try {
        let next: Pos | null = null;
        if (refreshFn) {
          next = await refreshFn();
        } else {
          const data = (await Actions.trackBill(billNo)) as
            | { car_position?: Pos | null }
            | null;
          next = data?.car_position ?? null;
        }
        if (cancelled) return;
        if (next && Number.isFinite(next.lat) && Number.isFinite(next.lng)) {
          setCar({ lat: next.lat, lng: next.lng });
        }
      } catch (e) {
        console.warn("[live-map] refresh failed:", e);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    const id = setInterval(tick, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [billNo, refreshFn]);

  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <span>🗺️</span>
          </div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">
            ແຜນທີ່ສົດ
          </h2>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
            refreshing
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              refreshing ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
            }`}
          />
          {refreshing ? "ກຳລັງໂຫຼດ..." : "Live"}
        </span>
      </div>
      <div ref={containerRef} className="w-full h-[420px] z-0" />
    </div>
  );
}

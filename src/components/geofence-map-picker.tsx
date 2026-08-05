"use client";

import { useEffect, useRef } from "react";

// Click-to-place picker for the per-branch geofence. Same CDN Leaflet loader
// as the other maps. Click the map to drop the point for whichever mode is
// active (start/end); each point shows its radius circle so the admin can see
// the catchment. Markers are draggable for fine adjustment.
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LatLng = [number, number];
type LeafletEvt = { latlng: { lat: number; lng: number } };
type LeafletLayer = {
  addTo: (m: unknown) => LeafletLayer;
  bindTooltip: (h: string, opts?: Record<string, unknown>) => LeafletLayer;
  on: (ev: string, fn: (e: LeafletEvt) => void) => LeafletLayer;
  setLatLng: (ll: LatLng) => LeafletLayer;
  setRadius: (r: number) => LeafletLayer;
  remove: () => unknown;
};
type LeafletMap = {
  remove: () => unknown;
  setView: (ll: LatLng, z: number) => unknown;
  on: (ev: string, fn: (e: LeafletEvt) => void) => unknown;
};
type LeafletApi = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LeafletMap) => unknown };
  marker: (ll: LatLng, opts?: Record<string, unknown>) => LeafletLayer;
  circle: (ll: LatLng, opts?: Record<string, unknown>) => LeafletLayer;
  divIcon: (opts: Record<string, unknown>) => unknown;
};

function getL(): LeafletApi | undefined {
  return (window as unknown as { L?: LeafletApi }).L;
}
function ensureLeaflet(onReady: () => void) {
  if (!document.querySelector("link[data-leaflet]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    link.dataset.leaflet = "1";
    document.head.appendChild(link);
  }
  if (getL()) return onReady();
  const existing = document.querySelector(`script[data-src="${LEAFLET_JS}"]`);
  if (existing) return existing.addEventListener("load", onReady, { once: true });
  const s = document.createElement("script");
  s.src = LEAFLET_JS;
  s.async = true;
  s.dataset.src = LEAFLET_JS;
  s.addEventListener("load", onReady, { once: true });
  document.head.appendChild(s);
}
function pin(L: LeafletApi, color: string, emoji: string) {
  return L.divIcon({
    className: "tms-geo-pin",
    html: `<div style="background:${color};color:#fff;width:30px;height:30px;border-radius:50%;
      box-shadow:0 0 0 4px rgba(255,255,255,0.7),0 3px 8px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;font-size:15px;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export interface Pt {
  lat: string;
  lng: string;
}

export function GeofenceMapPicker({
  start,
  end,
  radius,
  mode,
  onPick,
}: {
  start: Pt;
  end: Pt;
  radius: number;
  mode: "start" | "end";
  onPick: (kind: "start" | "end", lat: string, lng: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LeafletLayer[]>([]);
  // Keep the latest mode/onPick reachable from the once-bound click handler.
  const modeRef = useRef(mode);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    modeRef.current = mode;
    onPickRef.current = onPick;
  }, [mode, onPick]);

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    ensureLeaflet(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = getL();
      if (!L) return;
      const s = toLatLng(start);
      const center: LatLng = s ?? toLatLng(end) ?? [17.9757, 102.6331];
      const map = L.map(containerRef.current, { center, zoom: 15 });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (e) => {
        onPickRef.current(modeRef.current, e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
      });
      draw(L, map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the two points + radius circles whenever they change.
  useEffect(() => {
    const L = getL();
    const map = mapRef.current;
    if (L && map) draw(L, map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.lat, start.lng, end.lat, end.lng, radius]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  function draw(L: LeafletApi, map: LeafletMap) {
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];
    const add = (pt: Pt, color: string, emoji: string, label: string, kind: "start" | "end") => {
      const ll = toLatLng(pt);
      if (!ll) return;
      const circle = L.circle(ll, {
        radius,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.12,
      }).addTo(map);
      const marker = L.marker(ll, { icon: pin(L, color, emoji), draggable: true })
        .addTo(map)
        .bindTooltip(label);
      marker.on("dragend", (e) => {
        const p = e as unknown as { target: { getLatLng: () => { lat: number; lng: number } } };
        const c = p.target.getLatLng();
        onPickRef.current(kind, c.lat.toFixed(6), c.lng.toFixed(6));
      });
      layersRef.current.push(circle, marker);
    };
    add(start, "#2c6fb6", "🏁", "ຈຸດເລີ່ມ", "start");
    add(end, "#10b981", "📍", "ຈຸດສິ້ນສຸດ", "end");
  }

  return <div ref={containerRef} className="w-full h-[420px] z-0 rounded-lg overflow-hidden" />;
}

function toLatLng(p: Pt): LatLng | null {
  const la = Number(p.lat);
  const ln = Number(p.lng);
  return p.lat && p.lng && Number.isFinite(la) && Number.isFinite(ln) ? [la, ln] : null;
}

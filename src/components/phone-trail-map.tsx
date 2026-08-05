"use client";

import { useEffect, useRef } from "react";

// Self-contained Leaflet loader, same CDN approach as tracking-live-map.tsx —
// raw Leaflet via <script>, no react-leaflet. This map draws the full ordered
// trail (a polyline) for one trip. On a live trip it updates incrementally as
// new points arrive — the line extends and the latest marker hops forward
// without rebuilding the map, so the user's zoom/pan is preserved.
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LatLng = [number, number];
type LeafletMap = {
  remove: () => unknown;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => unknown;
  setView: (latlng: LatLng, zoom: number) => unknown;
};
type LeafletLayer = {
  addTo: (m: LeafletMap | LeafletLayer) => LeafletLayer;
  bindPopup: (h: string) => LeafletLayer;
  setLatLng: (latlng: LatLng) => LeafletLayer;
  setLatLngs: (latlngs: LatLng[]) => LeafletLayer;
  clearLayers: () => LeafletLayer;
  remove: () => unknown;
};
type LeafletApi = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LeafletMap) => unknown };
  marker: (latlng: LatLng, opts?: Record<string, unknown>) => LeafletLayer;
  circleMarker: (latlng: LatLng, opts?: Record<string, unknown>) => LeafletLayer;
  polyline: (latlngs: LatLng[], opts?: Record<string, unknown>) => LeafletLayer;
  layerGroup: () => LeafletLayer;
  divIcon: (opts: Record<string, unknown>) => unknown;
  latLngBounds: (corners: LatLng[]) => unknown;
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
  if (getL()) {
    onReady();
    return;
  }
  const existing = document.querySelector(`script[data-src="${LEAFLET_JS}"]`);
  if (existing) {
    existing.addEventListener("load", onReady, { once: true });
    return;
  }
  const s = document.createElement("script");
  s.src = LEAFLET_JS;
  s.async = true;
  s.dataset.src = LEAFLET_JS;
  s.addEventListener("load", onReady, { once: true });
  document.head.appendChild(s);
}

function pinIcon(L: LeafletApi, color: string, emoji: string, pulse = false) {
  const ring = pulse
    ? `box-shadow:0 0 0 4px rgba(16,185,129,0.35),0 3px 8px rgba(0,0,0,0.25);animation:tmsTrailPulse 1.4s ease-out infinite;`
    : `box-shadow:0 0 0 4px rgba(255,255,255,0.7),0 3px 8px rgba(0,0,0,0.25);`;
  return L.divIcon({
    className: "tms-trail-pin",
    html: `<div style="background:${color};color:#fff;width:30px;height:30px;border-radius:50%;${ring}
      display:flex;align-items:center;justify-content:center;font-size:15px;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export interface TrailPoint {
  lat: string;
  lng: string;
  recorded_at: string;
  speed: string;
  battery: string;
}

export function PhoneTrailMap({
  points,
  tripKey,
  live = false,
}: {
  points: TrailPoint[];
  /** Identifies the trip; when it changes the map fully rebuilds + refits. */
  tripKey: string;
  /** Active trip — the latest marker pulses to read as "live". */
  live?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const lineRef = useRef<LeafletLayer | null>(null);
  const dotsRef = useRef<LeafletLayer | null>(null);
  const headRef = useRef<LeafletLayer | null>(null); // latest-position marker
  const builtKeyRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet(() => {
      if (cancelled || !containerRef.current) return;
      const L = getL();
      if (!L) return;

      const coords: LatLng[] = points
        .map((p) => [Number(p.lat), Number(p.lng)] as LatLng)
        .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));

      const sameTrip = builtKeyRef.current === tripKey && mapRef.current;

      // ---- Incremental update: same trip, just new points ----
      if (sameTrip && coords.length > 0) {
        lineRef.current?.setLatLngs(coords);
        redrawDots(L, dotsRef.current, points, coords);
        const last = coords[coords.length - 1];
        if (headRef.current) headRef.current.setLatLng(last);
        return; // keep the user's current zoom/pan
      }

      // ---- Full (re)build: first render or trip changed ----
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const center: LatLng = coords[0] ?? [17.9757, 102.6331];
      const map = L.map(containerRef.current, { center, zoom: 14 });
      mapRef.current = map;
      builtKeyRef.current = tripKey;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      if (coords.length === 0) return;

      lineRef.current = L.polyline(coords, { color: "#24abdb", weight: 4, opacity: 0.85 }).addTo(map);
      dotsRef.current = L.layerGroup().addTo(map);
      redrawDots(L, dotsRef.current, points, coords);

      const first = coords[0];
      const last = coords[coords.length - 1];
      L.marker(first, { icon: pinIcon(L, "#2c6fb6", "🏁") })
        .addTo(map)
        .bindPopup(`ເລີ່ມ: ${points[0].recorded_at}`);
      headRef.current = L.marker(last, {
        icon: pinIcon(L, live ? "#10b981" : "#24abdb", live ? "🟢" : "📍", live),
      })
        .addTo(map)
        .bindPopup(`ລ່າສຸດ: ${points[points.length - 1].recorded_at}`);

      if (coords.length >= 2) {
        map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17 });
      } else {
        map.setView(first, 16);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [points, tripKey, live]);

  // Tear the map down only when the component unmounts.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <style>{`@keyframes tmsTrailPulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)}70%{box-shadow:0 0 0 14px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}`}</style>
      <div ref={containerRef} className="w-full h-[520px] z-0 rounded-lg overflow-hidden" />
    </>
  );
}

// Thin out intermediate fixes to ~120 dots so long trips stay readable, then
// (re)populate the dots layer group.
function redrawDots(
  L: LeafletApi,
  group: LeafletLayer | null,
  points: TrailPoint[],
  coords: LatLng[]
) {
  if (!group) return;
  group.clearLayers();
  const step = Math.max(1, Math.floor(coords.length / 120));
  for (let i = 0; i < coords.length; i += step) {
    const p = points[i];
    L.circleMarker(coords[i], {
      radius: 3,
      color: "#1489ba",
      weight: 1,
      fillColor: "#4bc7ef",
      fillOpacity: 0.9,
    })
      .addTo(group)
      .bindPopup(
        `<b>${p.recorded_at}</b><br/>` +
          `${p.speed ? `ໄວ: ${p.speed}<br/>` : ""}` +
          `${p.battery ? `ແບັດ: ${p.battery}%` : ""}`
      );
  }
}

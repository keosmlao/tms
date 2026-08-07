"use client";

import { useEffect, useRef } from "react";
import { hasCoords, type RouteStop } from "@/lib/route-geometry";

// Click-to-place picker for a whole delivery route: origin, each waypoint and
// the destination, drawn in travel order and joined by a line. Same CDN Leaflet
// loader as the other maps on the dashboard.
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

type LatLng = [number, number];
type LeafletEvt = { latlng: { lat: number; lng: number } };
type LeafletLayer = {
  addTo: (m: unknown) => LeafletLayer;
  bindTooltip: (h: string, opts?: Record<string, unknown>) => LeafletLayer;
  on: (ev: string, fn: (e: LeafletEvt) => void) => LeafletLayer;
  remove: () => unknown;
};
type LeafletMap = {
  remove: () => unknown;
  setView: (ll: LatLng, z: number) => unknown;
  fitBounds: (b: LatLng[], opts?: Record<string, unknown>) => unknown;
  invalidateSize: () => unknown;
  on: (ev: string, fn: (e: LeafletEvt) => void) => unknown;
};
type LeafletApi = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (
    url: string,
    opts?: Record<string, unknown>
  ) => { addTo: (m: LeafletMap) => unknown };
  marker: (ll: LatLng, opts?: Record<string, unknown>) => LeafletLayer;
  polyline: (lls: LatLng[], opts?: Record<string, unknown>) => LeafletLayer;
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
  const script = document.createElement("script");
  script.src = LEAFLET_JS;
  script.async = true;
  script.dataset.src = LEAFLET_JS;
  script.addEventListener("load", onReady, { once: true });
  document.head.appendChild(script);
}

/** Which stop the next map click will place. -1 = origin, -2 = destination,
 *  0..n = that waypoint. Matches the indices the editor already uses. */
export const ORIGIN_INDEX = -1;
export const DESTINATION_INDEX = -2;

function pinIcon(L: LeafletApi, color: string, label: string, active: boolean) {
  return L.divIcon({
    className: "tms-route-pin",
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50%;
      box-shadow:0 0 0 ${active ? 5 : 3}px ${active ? "rgba(13,148,136,0.45)" : "rgba(255,255,255,0.75)"},0 3px 8px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function RouteMapPicker({
  stops,
  activeIndex,
  onPick,
  drivingPath,
  readOnly = false,
  className = "h-[420px]",
}: {
  /** Origin, waypoints and destination in travel order. */
  stops: RouteStop[];
  /** Stop a map click assigns to (see ORIGIN_INDEX / DESTINATION_INDEX). */
  activeIndex: number;
  onPick: (index: number, lat: number, lng: number) => void;
  /** Road geometry from OSRM. When present it is drawn as the solid route and
   *  the straight-line link between pins drops to a faint guide. */
  drivingPath?: Array<[number, number]>;
  /** View-only: no click-to-place, no dragging (the list's map preview). */
  readOnly?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LeafletLayer[]>([]);
  // The map click handler is bound once, so it reads the live values here
  // instead of closing over the first render's props.
  const activeRef = useRef(activeIndex);
  const onPickRef = useRef(onPick);
  const stopsRef = useRef(stops);
  const drivingRef = useRef(drivingPath);
  const readOnlyRef = useRef(readOnly);
  // Fit the view to the route the first time it has something to show, then
  // leave the admin's pan/zoom alone.
  const fittedRef = useRef(false);

  useEffect(() => {
    activeRef.current = activeIndex;
    onPickRef.current = onPick;
    stopsRef.current = stops;
    drivingRef.current = drivingPath;
    readOnlyRef.current = readOnly;
  }, [activeIndex, onPick, stops, drivingPath, readOnly]);

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = getL();
      if (!L) return;
      const first = stopsRef.current.find(hasCoords);
      const center: LatLng = first
        ? [first.lat as number, first.lng as number]
        : [17.9757, 102.6331]; // Vientiane
      const map = L.map(containerRef.current, { center, zoom: first ? 11 : 6 });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (e) => {
        if (readOnlyRef.current) return;
        onPickRef.current(
          activeRef.current,
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6))
        );
      });
      draw(L, map);
      // The map is created inside a modal that animates in; without this the
      // tiles render into a zero-height box and the map looks broken.
      setTimeout(() => map.invalidateSize(), 120);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const L = getL();
    const map = mapRef.current;
    if (L && map) draw(L, map);
  }, [stops, activeIndex, drivingPath, readOnly]);

  // A freshly calculated road route is what the user asked to see — frame it,
  // overriding the "leave their pan/zoom alone" rule that applies otherwise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drivingPath || drivingPath.length < 2) return;
    map.fitBounds(drivingPath, { padding: [40, 40] });
  }, [drivingPath]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  function draw(L: LeafletApi, map: LeafletMap) {
    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const current = stopsRef.current;
    const line: LatLng[] = [];

    current.forEach((stop, position) => {
      if (!hasCoords(stop)) return;
      const ll: LatLng = [stop.lat as number, stop.lng as number];
      line.push(ll);
      const isOrigin = position === 0;
      const isDestination = position === current.length - 1;
      // Editor index for this position: origin/destination have their own
      // sentinels, waypoints are 0-based within the waypoint array.
      const index = isOrigin
        ? ORIGIN_INDEX
        : isDestination
        ? DESTINATION_INDEX
        : position - 1;
      const color = isOrigin ? "#0d9488" : isDestination ? "#e11d48" : "#f59e0b";
      const label = isOrigin ? "A" : isDestination ? "B" : `${position}`;
      const marker = L.marker(ll, {
        icon: pinIcon(L, color, label, index === activeRef.current),
        draggable: !readOnlyRef.current,
      })
        .addTo(map)
        .bindTooltip(stop.name.trim() || (isOrigin ? "ຕົ້ນທາງ" : isDestination ? "ປາຍທາງ" : `ທາງຜ່ານ ${position}`));
      marker.on("dragend", (e) => {
        const dragged = e as unknown as {
          target: { getLatLng: () => { lat: number; lng: number } };
        };
        const point = dragged.target.getLatLng();
        onPickRef.current(
          index,
          Number(point.lat.toFixed(6)),
          Number(point.lng.toFixed(6))
        );
      });
      layersRef.current.push(marker);
    });

    const driving = drivingRef.current;
    const hasDriving = Array.isArray(driving) && driving.length > 1;
    if (line.length > 1) {
      // With a road route on screen, the pin-to-pin line becomes a faint guide
      // so the two are never mistaken for each other.
      layersRef.current.push(
        L.polyline(line, {
          color: "#0d9488",
          weight: hasDriving ? 1.5 : 3,
          opacity: hasDriving ? 0.3 : 0.75,
          dashArray: "6 6",
        }).addTo(map)
      );
    }
    if (hasDriving) {
      layersRef.current.push(
        L.polyline(driving, {
          color: "#2563eb",
          weight: 5,
          opacity: 0.85,
        }).addTo(map)
      );
    }
    const bounds = hasDriving ? driving : line;
    if (!fittedRef.current && bounds.length > 0) {
      fittedRef.current = true;
      if (bounds.length === 1) map.setView(bounds[0], 12);
      else map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  return (
    <div
      ref={containerRef}
      className={`w-full ${className} z-0 rounded-lg overflow-hidden`}
    />
  );
}

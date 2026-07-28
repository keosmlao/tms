"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * ແຜນທີ່ລົດສົດ ສຳລັບຈໍ TV.
 *
 * ໝຸດວາງເອງ ບໍ່ໃຊ້ຮູບ marker ມາດຕະຖານ ເພື່ອໃຫ້ຊື່ລົດອ່ານໄດ້ໄກ ແລະ
 * ບໍ່ຕ້ອງໂຫຼດຮູບຈາກນອກ (ຮູບ marker ຂອງ leaflet ມັກຫາຍໃນ Next.js).
 *
 * ແຜນທີ່ສ້າງເທື່ອດຽວ ແລ້ວຈາກນັ້ນພຽງແຕ່ຍ້າຍໝຸດ — ຈໍທີ່ເປີດຄ້າງເປັນເດືອນ
 * ບໍ່ຄວນສ້າງ/ທຳລາຍແຜນທີ່ໃໝ່ທຸກ 15 ວິນາທີ.
 */

export type MapVehicle = {
  car_code: string;
  car_name: string;
  lat: number;
  lng: number;
  speed: number;
  address: string;
  at: string | null;
  age_minutes: number | null;
  moving: boolean;
  stale: boolean;
};

// ນະຄອນຫຼວງວຽງຈັນ — ຈຸດເລີ່ມຕົ້ນເມື່ອຍັງບໍ່ມີລົດຄັນໃດລາຍງານ.
const HOME: [number, number] = [17.9757, 102.6331];

function pinHtml(vehicle: MapVehicle): string {
  const tone = vehicle.stale ? "stale" : vehicle.moving ? "move" : "stop";
  const speed = vehicle.stale
    ? "ຂາດສັນຍານ"
    : vehicle.moving
      ? `${Math.round(vehicle.speed)} km/h`
      : "ຈອດ";
  // Escaped because car names come from the tracker, not from us.
  const name = escapeHtml(vehicle.car_name || vehicle.car_code);
  return `<div class="tv-pin tv-pin-${tone}"><span class="tv-pin-dot"></span><span class="tv-pin-name">${name}</span><span class="tv-pin-speed">${speed}</span></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MapTripPoint = {
  doc_no: string;
  car: string;
  driver: string;
  lat: number;
  lng: number;
  at: string | null;
  age_minutes: number | null;
  cust_name: string;
  running: boolean;
};

function billPinHtml(point: MapTripPoint): string {
  const name = escapeHtml(point.car);
  const at = escapeHtml(point.at ?? "");
  return `<div class="tv-pin tv-pin-bill"><span class="tv-pin-dot"></span><span class="tv-pin-name">${name}</span><span class="tv-pin-speed">${at}</span></div>`;
}

export type MapTrail = {
  car_code: string;
  car_name: string;
  points: Array<[number, number]>;
};

// ສີແຍກແຕ່ລະຄັນ — ເລືອກຕາມລະຫັດລົດ ຈຶ່ງໄດ້ສີເກົ່າທຸກຄັ້ງ ບໍ່ປ່ຽນໄປມາ.
const TRAIL_COLORS = ["#38bdf8", "#f472b6", "#a78bfa", "#fbbf24", "#4ade80", "#22d3ee"];

function trailColor(carCode: string): string {
  let hash = 0;
  for (let i = 0; i < carCode.length; i++) hash = (hash * 31 + carCode.charCodeAt(i)) >>> 0;
  return TRAIL_COLORS[hash % TRAIL_COLORS.length];
}

export default function TvMap({
  vehicles,
  tripPoints,
  trails,
  active,
}: {
  vehicles: MapVehicle[];
  tripPoints: MapTripPoint[];
  trails: MapTrail[];
  active: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const billMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const trailsRef = useRef<Map<string, L.Polyline>>(new Map());
  // Only auto-fit while the screen has not settled on a view yet, so the map
  // does not lurch every poll once all the trucks are on screen.
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: HOME,
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      // Nobody touches a wall screen; live inputs would only let a passer-by
      // leave it panned somewhere useless.
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    const markers = markersRef.current;
    const billMarkers = billMarkersRef.current;
    const trailLines = trailsRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      billMarkers.clear();
      trailLines.clear();
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seenTrails = new Set<string>();
    for (const trail of trails) {
      if (trail.points.length < 2) continue;
      seenTrails.add(trail.car_code);
      const existing = trailsRef.current.get(trail.car_code);
      if (existing) {
        existing.setLatLngs(trail.points);
      } else {
        trailsRef.current.set(
          trail.car_code,
          L.polyline(trail.points, {
            color: trailColor(trail.car_code),
            weight: 4,
            opacity: 0.75,
            interactive: false,
          }).addTo(map)
        );
      }
    }
    for (const [code, line] of trailsRef.current) {
      if (!seenTrails.has(code)) {
        line.remove();
        trailsRef.current.delete(code);
      }
    }

    const seen = new Set<string>();
    for (const vehicle of vehicles) {
      if (!Number.isFinite(vehicle.lat) || !Number.isFinite(vehicle.lng)) continue;
      seen.add(vehicle.car_code);
      const position: [number, number] = [vehicle.lat, vehicle.lng];
      const icon = L.divIcon({
        html: pinHtml(vehicle),
        className: "tv-pin-wrap",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const existing = markersRef.current.get(vehicle.car_code);
      if (existing) {
        existing.setLatLng(position);
        existing.setIcon(icon);
      } else {
        markersRef.current.set(
          vehicle.car_code,
          L.marker(position, { icon, interactive: false }).addTo(map)
        );
      }
    }

    // A truck that stops reporting keeps its last pin for the day rather than
    // vanishing — the room should see that it went quiet, not that it left.
    for (const [code, marker] of markersRef.current) {
      if (!seen.has(code)) {
        marker.remove();
        markersRef.current.delete(code);
      }
    }

    const seenBills = new Set<string>();
    for (const point of tripPoints) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      seenBills.add(point.doc_no);
      const position: [number, number] = [point.lat, point.lng];
      const icon = L.divIcon({
        html: billPinHtml(point),
        className: "tv-pin-wrap",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const existing = billMarkersRef.current.get(point.doc_no);
      if (existing) {
        existing.setLatLng(position);
        existing.setIcon(icon);
      } else {
        billMarkersRef.current.set(
          point.doc_no,
          L.marker(position, { icon, interactive: false }).addTo(map)
        );
      }
    }
    for (const [docNo, marker] of billMarkersRef.current) {
      if (!seenBills.has(docNo)) {
        marker.remove();
        billMarkersRef.current.delete(docNo);
      }
    }

    if (
      !fittedRef.current &&
      markersRef.current.size +
        billMarkersRef.current.size +
        trailsRef.current.size >
        0
    ) {
      const points = [
        ...vehicles.map((v) => [v.lat, v.lng] as [number, number]),
        ...tripPoints.map((p) => [p.lat, p.lng] as [number, number]),
        ...trails.flatMap((t) => t.points),
      ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
      if (points.length === 1) {
        map.setView(points[0], 14);
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [70, 70], maxZoom: 14 });
      }
      fittedRef.current = true;
    }
  }, [vehicles, tripPoints, trails]);

  // The page is hidden with `display: none` between rotations, so Leaflet reads
  // a zero-sized container while away. Re-measure each time it comes back.
  useEffect(() => {
    if (!active || !mapRef.current) return;
    const map = mapRef.current;
    const timer = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(timer);
  }, [active]);

  return <div ref={containerRef} className="tv-map" />;
}

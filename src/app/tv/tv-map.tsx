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

export default function TvMap({
  vehicles,
  active,
}: {
  vehicles: MapVehicle[];
  active: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
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
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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

    if (!fittedRef.current && markersRef.current.size > 0) {
      const points = vehicles
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
        .map((v) => [v.lat, v.lng] as [number, number]);
      if (points.length === 1) {
        map.setView(points[0], 14);
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [70, 70], maxZoom: 14 });
      }
      fittedRef.current = true;
    }
  }, [vehicles]);

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

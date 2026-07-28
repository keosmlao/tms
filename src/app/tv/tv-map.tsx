"use client";

import { useCallback, useEffect, useRef } from "react";
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
  return `<div class="tv-pin tv-pin-${tone}"><span class="tv-pin-car">${carSvg()}</span><span class="tv-pin-name">${name}</span><span class="tv-pin-speed">${speed}</span></div>`;
}

function carSvg(): string {
  return `<svg viewBox="0 0 32 22" aria-hidden="true"><path d="M4 5h15.5l4.5 5H28v7h-2.2a4 4 0 0 1-7.6 0H12a4 4 0 0 1-7.6 0H2V8a3 3 0 0 1 2-3Zm16.8 5-2.7-3H15v3h5.8ZM8.2 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm13.8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/></svg>`;
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
  return `<div class="tv-pin tv-pin-bill"><span class="tv-pin-car">${carSvg()}</span><span class="tv-pin-name">${name}</span><span class="tv-pin-speed">${at}</span></div>`;
}

export type MapTrail = {
  car_code: string;
  car_name: string;
  points: Array<[number, number]>;
};

// ສີແຍກແຕ່ລະຄັນ — ເລືອກຕາມລະຫັດລົດ ຈຶ່ງໄດ້ສີເກົ່າທຸກຄັ້ງ ບໍ່ປ່ຽນໄປມາ.
const TRAIL_COLORS = ["#38bdf8", "#f472b6", "#a78bfa", "#fbbf24", "#4ade80", "#22d3ee"];

type SpreadPoint = {
  key: string;
  lat: number;
  lng: number;
};

type SpreadPlacement = {
  actual: L.LatLng;
  display: L.LatLng;
  spread: boolean;
  angle: number;
};

// Labels on a wall screen are much wider than normal map pins. When source
// points land within 90px, fan them around their shared centre and connect
// every car back to its true GPS point.
function spreadOverlaps(map: L.Map, rows: SpreadPoint[]): Map<string, SpreadPlacement> {
  const groups: SpreadPoint[][] = [];
  for (const row of rows) {
    const point = map.latLngToLayerPoint([row.lat, row.lng]);
    const group = groups.find((items) =>
      items.some((item) =>
        map.latLngToLayerPoint([item.lat, item.lng]).distanceTo(point) < 90
      )
    );
    if (group) group.push(row);
    else groups.push([row]);
  }

  const placements = new Map<string, SpreadPlacement>();
  for (const group of groups) {
    if (group.length === 1) {
      const row = group[0];
      const actual = L.latLng(row.lat, row.lng);
      placements.set(row.key, { actual, display: actual, spread: false, angle: 0 });
      continue;
    }
    const centre = group
      .map((row) => map.latLngToLayerPoint([row.lat, row.lng]))
      .reduce((sum, point) => sum.add(point), L.point(0, 0))
      .divideBy(group.length);
    const radius = Math.min(190, 105 + group.length * 12);
    group.forEach((row, index) => {
      const theta = -Math.PI / 2 + (Math.PI * 2 * index) / group.length;
      const displayPoint = L.point(
        centre.x + Math.cos(theta) * radius,
        centre.y + Math.sin(theta) * radius
      );
      const actualPoint = map.latLngToLayerPoint([row.lat, row.lng]);
      const angle =
        (Math.atan2(actualPoint.y - displayPoint.y, actualPoint.x - displayPoint.x) *
          180) /
        Math.PI;
      placements.set(row.key, {
        actual: L.latLng(row.lat, row.lng),
        display: map.layerPointToLatLng(displayPoint),
        spread: true,
        angle,
      });
    });
  }
  return placements;
}

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
  const connectorsRef = useRef<Map<string, L.Polyline>>(new Map());
  const arrowsRef = useRef<Map<string, L.Marker>>(new Map());
  // Only auto-fit while the screen has not settled on a view yet, so the map
  // does not lurch every poll once all the trucks are on screen.
  const fittedRef = useRef(false);
  // ຈຸດຫຼ້າສຸດ — ເກັບໄວ້ເພື່ອຈັດຂອບເຂດໄດ້ຕອນໜ້ານີ້ຖືກສະແດງ ບໍ່ແມ່ນຕອນຮັບຂໍ້ມູນ
  const pointsRef = useRef<Array<[number, number]>>([]);

  /**
   * ຈັດຂອບເຂດໃຫ້ເຫັນທຸກຈຸດ.
   *
   * ເຮັດໄດ້ສະເພາະຕອນກ່ອງມີຂະໜາດຈິງ — ໜ້ານີ້ຖືກ mount ໄວ້ແຕ່ເຊື່ອງດ້ວຍ
   * display:none ຈຶ່ງກວ້າງ 0px ຕອນຮັບຂໍ້ມູນຄັ້ງທຳອິດ. ຖ້າ fitBounds ຕອນ
   * ນັ້ນ Leaflet ຈະຄິດ center/zoom ຜິດ ແລ້ວແຜນທີ່ຈະຄ້າງຢູ່ບ່ອນທີ່ບໍ່ມີລົດ.
   */
  const fitToPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current) return;
    const size = map.getSize();
    if (size.x < 50 || size.y < 50) return;
    const points = pointsRef.current;
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
    fittedRef.current = true;
  }, []);

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
    const connectorLines = connectorsRef.current;
    const arrowMarkers = arrowsRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      billMarkers.clear();
      trailLines.clear();
      connectorLines.clear();
      arrowMarkers.clear();
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
    const spreadRows: SpreadPoint[] = [
      ...vehicles
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
        .map((v) => ({ key: `vehicle:${v.car_code}`, lat: v.lat, lng: v.lng })),
      ...tripPoints
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => ({ key: `bill:${p.doc_no}`, lat: p.lat, lng: p.lng })),
    ];
    const placements = spreadOverlaps(map, spreadRows);
    const seenConnectors = new Set<string>();

    const updateConnector = (key: string, placement: SpreadPlacement, color: string) => {
      if (!placement.spread) return;
      seenConnectors.add(key);
      const points: L.LatLngExpression[] = [placement.display, placement.actual];
      const existingLine = connectorsRef.current.get(key);
      if (existingLine) existingLine.setLatLngs(points).setStyle({ color });
      else {
        connectorsRef.current.set(
          key,
          L.polyline(points, {
            color,
            weight: 3,
            opacity: 0.82,
            dashArray: "8 7",
            interactive: false,
          }).addTo(map)
        );
      }
      const arrowIcon = L.divIcon({
        html: `<span class="tv-map-arrow" style="color:${color};transform:rotate(${placement.angle + 90}deg)"></span>`,
        className: "tv-map-arrow-wrap",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const existingArrow = arrowsRef.current.get(key);
      if (existingArrow) {
        existingArrow.setLatLng(placement.actual);
        existingArrow.setIcon(arrowIcon);
      } else {
        arrowsRef.current.set(
          key,
          L.marker(placement.actual, { icon: arrowIcon, interactive: false }).addTo(map)
        );
      }
    };

    for (const vehicle of vehicles) {
      if (!Number.isFinite(vehicle.lat) || !Number.isFinite(vehicle.lng)) continue;
      seen.add(vehicle.car_code);
      const placement = placements.get(`vehicle:${vehicle.car_code}`)!;
      const position = placement.display;
      const color = vehicle.stale ? "#e0263a" : vehicle.moving ? "#00a06b" : "#e07800";
      updateConnector(`vehicle:${vehicle.car_code}`, placement, color);
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
      const placement = placements.get(`bill:${point.doc_no}`)!;
      const position = placement.display;
      updateConnector(`bill:${point.doc_no}`, placement, "#0284c7");
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
    for (const [key, line] of connectorsRef.current) {
      if (!seenConnectors.has(key)) {
        line.remove();
        connectorsRef.current.delete(key);
      }
    }
    for (const [key, arrow] of arrowsRef.current) {
      if (!seenConnectors.has(key)) {
        arrow.remove();
        arrowsRef.current.delete(key);
      }
    }

    pointsRef.current = [
      ...vehicles.map((v) => [v.lat, v.lng] as [number, number]),
      ...tripPoints.map((p) => [p.lat, p.lng] as [number, number]),
      ...trails.flatMap((t) => t.points),
    ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (active) fitToPoints();
  }, [vehicles, tripPoints, trails, active, fitToPoints]);

  // ຄືນມາເຫັນອີກເທື່ອ: ວັດຂະໜາດໃໝ່ ແລ້ວຈັດຂອບເຂດຖ້າຍັງບໍ່ທັນຈັດ
  useEffect(() => {
    if (!active || !mapRef.current) return;
    const map = mapRef.current;
    const timer = setTimeout(() => {
      map.invalidateSize();
      fitToPoints();
    }, 120);
    return () => clearTimeout(timer);
  }, [active, fitToPoints]);

  return <div ref={containerRef} className="tv-map" />;
}

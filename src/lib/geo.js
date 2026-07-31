// ⚠️ CommonJS (.js) ໂດຍເຈດຕະນາ — src/queries/geofence.js require ໄຟລ໌ນີ້
// ແລະ require() ໂຫຼດ .ts ໄດ້ສະເພາະໃນ bundler ຂອງ Next. type ຢູ່ .d.ts ຄູ່ກັນ.
// Geospatial helpers for the delivery geofence. Pure functions, no I/O — the
// query layer (src/queries/geofence.js) requires these to enforce that a driver
// is physically at the configured start/end point before a trip can begin or
// close.

"use strict";

const EARTH_RADIUS_M = 6_371_000;

/** @param {number} deg */
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in meters. */
/**
 * @param {number} lat1 @param {number} lng1
 * @param {number} lat2 @param {number} lng2
 * @returns {number}
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Coerce a lat/lng coming off the wire (mobile sends strings, sometimes null
 * or "") to a finite number, or null when it isn't a usable coordinate.
 */
/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseCoord(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Trim first: Number("") and Number(" ") both coerce to 0, which would
  // masquerade as a valid coordinate at (0,0).
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Is (lat,lng) within `radiusM` of (targetLat,targetLng)? Returns
 * `{ ok:false, distance:null }` when a coordinate can't be parsed, so callers
 * can distinguish "too far" from "no location at all".
 */
/**
 * @param {unknown} lat @param {unknown} lng
 * @param {unknown} targetLat @param {unknown} targetLng
 * @param {number} radiusM
 * @returns {import("./geo").RadiusCheck}
 */
function checkWithinRadius(lat, lng, targetLat, targetLng, radiusM) {
  const a = parseCoord(lat);
  const b = parseCoord(lng);
  const c = parseCoord(targetLat);
  const d = parseCoord(targetLng);
  if (a == null || b == null || c == null || d == null) {
    return { ok: false, distance: null };
  }
  const distance = haversineMeters(a, b, c, d);
  return { ok: distance <= radiusM, distance };
}

// ── ການຈັດລຳດັບຈຸດສົ່ງ ─────────────────────────────────────────────────
//
// ໃຊ້ໄລຍະເສັ້ນຊື່ ບໍ່ແມ່ນທາງຈິງ: ຕ້ອງການໃຫ້ໜ້າວາງແຜນຕອບທັນທີ ໂດຍບໍ່ຂຶ້ນກັບ
// ບໍລິການພາຍນອກ ແລະ ບໍ່ມີຄ່າໃຊ້ຈ່າຍຕໍ່ຄຳຂໍ. ເສັ້ນຊື່ສັ້ນກວ່າທາງຈິງ 20-40%
// ແຕ່ "ລຳດັບ" ທີ່ໄດ້ຍັງໃຊ້ໄດ້ ເພາະສິ່ງທີ່ຕ້ອງການຄືການຈັດຈຸດທີ່ຢູ່ໃກ້ກັນ
// ໃຫ້ຢູ່ຕິດກັນ ບໍ່ແມ່ນ ກມ. ທີ່ແມ່ນຍຳຕໍ່ 100 ແມັດ.

/** ພິກັດຈາກ DB (string ຫຼື number) → ຈຸດ ຫຼື null ຖ້າໃຊ້ບໍ່ໄດ້ */
/**
 * @param {unknown} lat @param {unknown} lng
 * @returns {import("./geo").GeoPoint | null}
 */
function toPoint(lat, lng) {
  const a = parseCoord(lat);
  const b = parseCoord(lng);
  if (a == null || b == null) return null;
  // 0,0 ຢູ່ກາງມະຫາສະໝຸດ — ໃນລະບົບນີ້ມັນແປວ່າ "ບໍ່ມີຂໍ້ມູນ"
  if (a === 0 && b === 0) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

/** ໄລຍະເສັ້ນຊື່ (ກມ.) */
/**
 * @param {import("./geo").GeoPoint} a
 * @param {import("./geo").GeoPoint} b
 * @returns {number}
 */
function haversineKm(a, b) {
  return haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
}

/**
 * @template T
 * @param {import("./geo").GeoPoint} origin
 * @param {import("./geo").Stop<T>[]} stops
 * @returns {number}
 */
function totalDistance(origin, stops) {
  let total = 0;
  let prev = origin;
  for (const stop of stops) {
    total += haversineKm(prev, stop.point);
    prev = stop.point;
  }
  return total;
}

/**
 * ຮຽງລຳດັບຈຸດສົ່ງ: ເລືອກຈຸດໃກ້ສຸດຕໍ່ໆໄປ ແລ້ວປັບປຸງດ້ວຍ 2-opt.
 *
 * ເປັນຫຍັງ 2 ຂັ້ນ: ເລືອກໃກ້ສຸດຢ່າງດຽວມັກປະຈຸດໜຶ່ງໄວ້ໄກໆ ແລ້ວຕ້ອງຕີກັບໄປ
 * ເອົາຕອນທ້າຍ. 2-opt ສະຫຼັບຄູ່ເສັ້ນທີ່ຕັດກັນອອກ ຈຶ່ງແກ້ກໍລະນີນັ້ນໄດ້ ແລະ
 * ຍັງໄວພໍສຳລັບ 1 ຖ້ຽວ. ບໍ່ຮັບປະກັນວ່າດີທີ່ສຸດ — ເປັນ "ຂໍ້ແນະນຳ".
 *
 * ບໍ່ນັບການກັບສາງ: ຖ້ຽວຈິງມັກຈົບຢູ່ຈຸດສຸດທ້າຍ ຫຼື ໄປຮັບບິນຕໍ່.
 */
/**
 * @template T
 * @param {import("./geo").GeoPoint} origin
 * @param {import("./geo").Stop<T>[]} stops
 * @param {{ maxPasses?: number }} [options]
 * @returns {import("./geo").OrderedStop<T>[]}
 */
function orderStops(origin, stops, { maxPasses = 30 } = {}) {
  if (stops.length === 0) return [];

  // ຂັ້ນ 1 — ໃກ້ສຸດກ່ອນ
  const remaining = [...stops];
  /** @type {import("./geo").Stop<T>[]} */
  const route = [];
  let cursor = origin;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestKm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(cursor, remaining[i].point);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    route.push(next);
    cursor = next.point;
  }

  // ຂັ້ນ 2 — ປັບປຸງດ້ວຍ 2-opt + or-opt ຈົນບໍ່ດີຂຶ້ນອີກ
  //
  // ຕ້ອງມີທັງສອງ: 2-opt (ກັບຫົວທ່ອນ) ແກ້ເສັ້ນທີ່ຕັດກັນ ແຕ່ຍ້າຍຈຸດດຽວ
  // ອອກຈາກບ່ອນຜິດບໍ່ໄດ້; or-opt (ຍ້າຍ 1-3 ຈຸດຕິດກັນໄປແຊກບ່ອນອື່ນ) ແກ້
  // ອັນນັ້ນ. ວັດແລ້ວ: 2-opt ຢ່າງດຽວຍາວກວ່າຄ່າດີສຸດ 6.9% ໃນຕົວຢ່າງ 5 ຈຸດ
  // ພໍເພີ່ມ or-opt ແລ້ວໄດ້ເທົ່າຄ່າດີສຸດ.
  let best = totalDistance(origin, route);
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    // 2-opt: ກັບຫົວທ່ອນ [i..k]
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, k + 1).reverse(),
          ...route.slice(k + 1),
        ];
        const km = totalDistance(origin, candidate);
        if (km + 1e-9 < best) {
          route.splice(0, route.length, ...candidate);
          best = km;
          improved = true;
        }
      }
    }

    // or-opt: ຍົກທ່ອນຍາວ 1-3 ຈຸດ ໄປແຊກບ່ອນອື່ນ (ລອງທັງແບບກັບຫົວ)
    for (let len = 1; len <= 3 && len <= route.length - 1; len++) {
      for (let i = 0; i + len <= route.length; i++) {
        const segment = route.slice(i, i + len);
        const rest = [...route.slice(0, i), ...route.slice(i + len)];
        for (let j = 0; j <= rest.length; j++) {
          for (const piece of [segment, [...segment].reverse()]) {
            const candidate = [...rest.slice(0, j), ...piece, ...rest.slice(j)];
            const km = totalDistance(origin, candidate);
            if (km + 1e-9 < best) {
              route.splice(0, route.length, ...candidate);
              best = km;
              improved = true;
            }
          }
        }
      }
    }

    if (!improved) break;
  }

  /** @type {import("./geo").OrderedStop<T>[]} */
  const out = [];
  let prev = origin;
  let cumulative = 0;
  for (const stop of route) {
    const legKm = haversineKm(prev, stop.point);
    cumulative += legKm;
    out.push({
      data: stop.data,
      point: stop.point,
      legKm: Math.round(legKm * 100) / 100,
      cumulativeKm: Math.round(cumulative * 100) / 100,
    });
    prev = stop.point;
  }
  return out;
}

/** ຈຸດກາງຂອງກຸ່ມຈຸດ — ໃຊ້ເມື່ອບໍ່ຮູ້ຈຸດຕັ້ງຕົ້ນຂອງສາຂາ */
/**
 * @param {import("./geo").GeoPoint[]} points
 * @returns {import("./geo").GeoPoint | null}
 */
function centroid(points) {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

module.exports = {
  haversineMeters,
  parseCoord,
  checkWithinRadius,
  toPoint,
  haversineKm,
  orderStops,
  centroid,
};

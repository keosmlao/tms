// Geospatial helpers for the delivery geofence. Pure functions, no I/O — the
// query layer (src/queries/geofence.js) requires these to enforce that a driver
// is physically at the configured start/end point before a trip can begin or
// close.

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
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
export function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Trim first: Number("") and Number(" ") both coerce to 0, which would
  // masquerade as a valid coordinate at (0,0).
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface RadiusCheck {
  /** true when the point is within `radiusM` of the target. */
  ok: boolean;
  /** distance in meters, or null when any coordinate was missing/invalid. */
  distance: number | null;
}

/**
 * Is (lat,lng) within `radiusM` of (targetLat,targetLng)? Returns
 * `{ ok:false, distance:null }` when a coordinate can't be parsed, so callers
 * can distinguish "too far" from "no location at all".
 */
export function checkWithinRadius(
  lat: unknown,
  lng: unknown,
  targetLat: unknown,
  targetLng: unknown,
  radiusM: number
): RadiusCheck {
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

/**
 * Road routing over OSRM.
 *
 * `routeDistanceKm` in route-geometry gives the straight line between stops —
 * fine as a sanity figure, useless as the distance a truck actually drives. This
 * module turns the pinned stops into a real driving route: the road geometry to
 * draw on the map and the road distance/duration to store.
 *
 * Pure request-building and response-parsing only; the fetch itself is a server
 * action (src/actions/routing.ts) so the browser never talks to OSRM directly.
 */

export const OSRM_BASE = "https://router.project-osrm.org";

/** Stops the caller wants routed, in travel order. */
export interface RoutePoint {
  lat: number;
  lng: number;
}

/** A driving route as OSRM returned it. */
export interface DrivingRoute {
  /** Road distance in km, one decimal. */
  distanceKm: number;
  /** Driving time in minutes, rounded. */
  durationMin: number;
  /** Road geometry as [lat, lng] pairs, ready for Leaflet. */
  path: Array<[number, number]>;
}

/**
 * OSRM's coordinate list: `lng,lat;lng,lat` — longitude FIRST, which is the
 * opposite order from every other coordinate in this codebase.
 *
 * Returns null when fewer than two points are pinned: there is no route to ask
 * for, and OSRM answers a single coordinate with an error.
 */
export function buildOsrmPath(points: RoutePoint[]): string | null {
  const usable = points.filter(
    (point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lat) <= 90 &&
      Math.abs(point.lng) <= 180
  );
  if (usable.length < 2) return null;
  return usable.map((point) => `${point.lng},${point.lat}`).join(";");
}

/** Full request URL for a driving route with map-ready geometry. */
export function buildOsrmUrl(path: string, base = OSRM_BASE): string {
  return `${base}/route/v1/driving/${path}?overview=full&geometries=geojson`;
}

/**
 * Read the first route out of an OSRM response.
 *
 * Returns null for anything unusable — no route found, a malformed body, an
 * error code — so the caller can fall back to the straight-line figure instead
 * of showing a wrong distance.
 */
export function parseOsrmRoute(body: unknown): DrivingRoute | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as {
    code?: unknown;
    routes?: Array<{
      distance?: unknown;
      duration?: unknown;
      geometry?: { coordinates?: unknown };
    }>;
  };
  if (payload.code !== undefined && payload.code !== "Ok") return null;
  const route = payload.routes?.[0];
  if (!route) return null;

  const distance = Number(route.distance);
  const duration = Number(route.duration);
  if (!Number.isFinite(distance) || distance < 0) return null;

  const raw = route.geometry?.coordinates;
  const path: Array<[number, number]> = [];
  if (Array.isArray(raw)) {
    for (const pair of raw) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
      if (Number.isFinite(lat) && Number.isFinite(lng)) path.push([lat, lng]);
    }
  }
  if (path.length < 2) return null;

  return {
    distanceKm: Math.round((distance / 1000) * 10) / 10,
    durationMin: Number.isFinite(duration) ? Math.round(duration / 60) : 0,
    path,
  };
}

/** "2 ຊມ 15 ນາທີ" / "45 ນາທີ" — for the driving-time chip. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours <= 0) return `${rest} ນາທີ`;
  return rest === 0 ? `${hours} ຊມ` : `${hours} ຊມ ${rest} ນາທີ`;
}

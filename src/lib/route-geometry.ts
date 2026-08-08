import { haversineKm, toPoint } from "@/lib/geo";

/** One stop on a delivery route. Coordinates are optional — a route can be
 *  named ("ວຽງຈັນ → ປາກເຊ") long before anyone pins it on the map. */
export interface RouteStop {
  name: string;
  lat: number | null;
  lng: number | null;
}

/** Laos, padded. Used only to warn — never to reject: a route may legitimately
 *  cross into Thailand/Vietnam, so this flags likely mistakes, notably a
 *  lat/lng pair entered the wrong way round. */
const LAO_BOUNDS = { minLat: 13.5, maxLat: 23.0, minLng: 99.5, maxLng: 108.5 };

export function isValidLat(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLng(value: number | null): boolean {
  return (
    value !== null && Number.isFinite(value) && value >= -180 && value <= 180
  );
}

/** True once a stop can be drawn on the map. */
export function hasCoords(stop: {
  lat: number | null;
  lng: number | null;
}): boolean {
  return isValidLat(stop.lat) && isValidLng(stop.lng);
}

/**
 * Read one coordinate out of free text.
 *
 * Returns null for anything unusable, including the half-typed states ("-",
 * "17.") the old single-field editor used to swallow — the editor keeps the
 * raw text and only commits what parses.
 */
export function parseCoordinate(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse a pasted coordinate pair. Accepts everything people actually paste out
 * of Google Maps: "17.9757, 102.6331", "17.9757 102.6331", tabs, or a maps URL
 * containing an @lat,lng segment.
 */
export function parseLatLngPair(
  text: string
): { lat: number; lng: number } | null {
  const source = text.trim();
  if (!source) return null;
  const at = source.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const body = at ? `${at[1]},${at[2]}` : source;
  const parts = body
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseCoordinate(parts[0]);
  const lng = parseCoordinate(parts[1]);
  if (lat === null || lng === null) return null;
  if (!isValidLat(lat) || !isValidLng(lng)) return null;
  return { lat, lng };
}

/** Format for display/inputs. Empty string when the point isn't pinned yet. */
export function formatLatLng(lat: number | null, lng: number | null): string {
  if (!isValidLat(lat) || !isValidLng(lng)) return "";
  return `${lat}, ${lng}`;
}

/**
 * Straight-line ("as the crow flies") length of a route in km, summed leg by
 * leg over the stops that have coordinates. Returns null when fewer than two
 * stops are pinned — the caller shows "-" rather than a misleading 0.
 *
 * This is deliberately NOT road distance: it's an instant sanity figure the
 * admin can accept or overwrite with the real number.
 */
export function routeDistanceKm(stops: RouteStop[]): number | null {
  const points = stops
    .filter(hasCoords)
    .map((stop) => toPoint(stop.lat, stop.lng))
    .filter((point): point is NonNullable<typeof point> => point !== null);
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return Math.round(total * 10) / 10;
}

/**
 * A point outside the Laos box whose swapped twin lands inside it — the classic
 * "typed lng,lat instead of lat,lng" slip, which used to be invisible until the
 * route drew itself somewhere in the ocean.
 */
export function looksSwapped(lat: number | null, lng: number | null): boolean {
  // Deliberately not gated on isValidLat: the classic swap puts a longitude
  // (>90) in the latitude slot, which is exactly the case worth naming. Old
  // rows saved by the previous editor — which validated no ranges at all — can
  // already hold such a pair.
  if (lat === null || lng === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const inside = (la: number, ln: number) =>
    la >= LAO_BOUNDS.minLat &&
    la <= LAO_BOUNDS.maxLat &&
    ln >= LAO_BOUNDS.minLng &&
    ln <= LAO_BOUNDS.maxLng;
  return !inside(lat, lng) && inside(lng, lat);
}

export interface RouteDraft {
  name: string;
  origin: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  waypoints: RouteStop[];
}

/**
 * Everything wrong with the draft, in Lao, ready to render. Empty array = the
 * route is safe to save. Only the name is truly required (matching the server),
 * so a half-mapped route can still be saved and finished later.
 */
export function validateRoute(draft: RouteDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push("ກະລຸນາໃສ່ຊື່ເສັ້ນທາງ");

  const half = (label: string, lat: number | null, lng: number | null) => {
    const hasLat = lat !== null;
    const hasLng = lng !== null;
    if (hasLat !== hasLng) {
      problems.push(`${label}: ໃສ່ພິກັດບໍ່ຄົບ (ຕ້ອງມີທັງ latitude ແລະ longitude)`);
      return;
    }
    // Name the swap first: "latitude ຕ້ອງຢູ່ລະຫວ່າງ -90 ຫາ 90" is true but
    // unhelpful when the real fix is to flip the two numbers.
    if (looksSwapped(lat, lng)) {
      problems.push(`${label}: ພິກັດອາດສະຫຼັບກັນ — ລອງກັບ latitude/longitude`);
      return;
    }
    if (hasLat && !isValidLat(lat)) {
      problems.push(`${label}: latitude ຕ້ອງຢູ່ລະຫວ່າງ -90 ຫາ 90`);
    }
    if (hasLng && !isValidLng(lng)) {
      problems.push(`${label}: longitude ຕ້ອງຢູ່ລະຫວ່າງ -180 ຫາ 180`);
    }
  };

  half("ຕົ້ນທາງ", draft.origin_lat, draft.origin_lng);
  draft.waypoints.forEach((stop, index) => {
    half(`ທາງຜ່ານຈຸດທີ ${index + 1}`, stop.lat, stop.lng);
  });
  half("ປາຍທາງ", draft.destination_lat, draft.destination_lng);
  return problems;
}

/** Stops in travel order — the single source of truth for the map, the summary
 *  line and the distance, so those three can never disagree. */
export function routeStops(draft: RouteDraft): RouteStop[] {
  return [
    { name: draft.origin, lat: draft.origin_lat, lng: draft.origin_lng },
    ...draft.waypoints,
    {
      name: draft.destination,
      lat: draft.destination_lat,
      lng: draft.destination_lng,
    },
  ];
}

/** "ວຽງຈັນ → ວັງວຽງ → ຫຼວງພະບາງ", skipping unnamed stops. */
export function routePathLabel(stops: RouteStop[]): string {
  return stops
    .map((stop) => stop.name.trim())
    .filter(Boolean)
    .join(" → ");
}

/**
 * A branch that has transport vehicles stationed at it, offered as a ready-made
 * stop when the admin types a name. Coordinates come from the branch geofence,
 * so picking one both names and pins the stop.
 */
export interface StopSuggestion {
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  carCount: number;
  /** `branch` = ສາຂາທີ່ມີລົດຈອດ · `customer` = ຮ້ານທີ່ເຄີຍສົ່ງຈິງ. */
  kind: "branch" | "customer";
  /** ຈຳນວນຄັ້ງທີ່ສົ່ງສຳເລັດ (ສະເພາະ `customer`) — ໃຊ້ຈັດລຳດັບ. */
  deliveryCount: number;
  /** ວັນທີ່ສົ່ງຫຼ້າສຸດ "YYYY-MM-DD" (ສະເພາະ `customer`). */
  lastDelivered: string;
}

/**
 * ນ້ຳໜັກທີ່ໃຊ້ຈັດລຳດັບ — ສາຂາໃຊ້ຈຳນວນລົດ, ຮ້ານໃຊ້ຈຳນວນຄັ້ງທີ່ສົ່ງ.
 *
 * ສອງຢ່າງນີ້ບໍ່ໄດ້ທຽບກັນໂດຍກົງ ແຕ່ພາຍໃນປະເພດດຽວກັນ "ໃຊ້ຫຼາຍຂຶ້ນກ່ອນ"
 * ຄືກັນ ຈຶ່ງລວມເປັນຄ່າດຽວໄດ້.
 */
export function suggestionWeight(item: StopSuggestion): number {
  return item.kind === "customer" ? item.deliveryCount : item.carCount;
}

/**
 * ຈຸດ (0,0) ຢູ່ກາງມະຫາສະໝຸດແອດແລນຕິກ ຫ່າງລາວ ~2,000 ກມ.
 *
 * ທາງເລກມັນເປັນພິກັດທີ່ຖືກຕ້ອງ (isValidLat(0) = true) ແຕ່ໃນລະບົບນີ້ມັນແປວ່າ
 * "ຍັງບໍ່ໄດ້ຕັ້ງພິກັດ" ສະເໝີ. ປ່ອຍຜ່ານແລ້ວໄລຍະທາງຂອງເສັ້ນທາງຈະບານເປັນ
 * ຫຼາຍພັນ ກມ ໂດຍທີ່ໜ້າຈໍບໍ່ໄດ້ບອກວ່າຜິດ.
 */
function coordPairOrNull(
  lat: number | null,
  lng: number | null
): { lat: number | null; lng: number | null } {
  const okLat = lat !== null && isValidLat(lat);
  const okLng = lng !== null && isValidLng(lng);
  if (!okLat || !okLng) return { lat: null, lng: null };
  if (lat === 0 && lng === 0) return { lat: null, lng: null };
  return { lat, lng };
}

/** Coerce one row off the wire (the query returns coordinates as text). */
export function normalizeSuggestion(raw: {
  code?: unknown;
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  car_count?: unknown;
}): StopSuggestion {
  const point = coordPairOrNull(
    parseCoordinate(String(raw.lat ?? "")),
    parseCoordinate(String(raw.lng ?? ""))
  );
  return {
    code: String(raw.code ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    lat: point.lat,
    lng: point.lng,
    carCount: Number(raw.car_count ?? 0) || 0,
    kind: "branch",
    deliveryCount: 0,
    lastDelivered: "",
  };
}

/**
 * ຮ້ານທີ່ເຄີຍສົ່ງຈິງ ຈາກ `listCustomerStopSuggestions`.
 *
 * ພິກັດເປັນຄ່າມັດທະຍົມຂອງຈຸດປິດບິນ ຈຶ່ງເປັນບ່ອນທີ່ລົດໄປຮອດແທ້ ບໍ່ແມ່ນທີ່ຢູ່
 * ໃນທະບຽນລູກຄ້າ. ຈຸດທີ່ອ່ານບໍ່ອອກຖືກປັດເປັນ null ຄືກັບສາຂາ ຈຶ່ງບໍ່ມີໂອກາດ
 * ປັກໝຸດລົງ (0,0) ກາງມະຫາສະໝຸດ.
 */
export function normalizeCustomerSuggestion(raw: {
  code?: unknown;
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  delivery_count?: unknown;
  last_delivered?: unknown;
}): StopSuggestion {
  const point = coordPairOrNull(
    parseCoordinate(String(raw.lat ?? "")),
    parseCoordinate(String(raw.lng ?? ""))
  );
  return {
    code: String(raw.code ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    lat: point.lat,
    lng: point.lng,
    carCount: 0,
    kind: "customer",
    deliveryCount: Number(raw.delivery_count ?? 0) || 0,
    lastDelivered: String(raw.last_delivered ?? "").trim(),
  };
}

/**
 * Branches matching what the admin has typed, best first: names that start
 * with the query, then names that merely contain it, then by fleet size so the
 * main depots surface first. An empty query lists the branches — the point is
 * to make the common stops one click away, not to require exact spelling.
 */
export function matchSuggestions(
  suggestions: StopSuggestion[],
  query: string,
  limit = 6
): StopSuggestion[] {
  const needle = query.trim().toLowerCase();
  const scored = suggestions
    .map((item) => {
      const name = item.name.toLowerCase();
      const code = item.code.toLowerCase();
      if (!needle) return { item, rank: 2 };
      if (name.startsWith(needle) || code === needle) return { item, rank: 0 };
      if (name.includes(needle) || code.includes(needle))
        return { item, rank: 1 };
      return null;
    })
    .filter((entry): entry is { item: StopSuggestion; rank: number } => !!entry);
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      // ສາຂາຂຶ້ນກ່ອນຮ້ານ: ເສັ້ນທາງເລີ່ມ/ຈົບຢູ່ສາຂາເກືອບສະເໝີ
      (a.item.kind === b.item.kind ? 0 : a.item.kind === "branch" ? -1 : 1) ||
      suggestionWeight(b.item) - suggestionWeight(a.item) ||
      a.item.name.localeCompare(b.item.name)
  );
  return scored.slice(0, limit).map((entry) => entry.item);
}

/** Move a waypoint one slot up/down. Out-of-range moves return the input
 *  unchanged so the caller can bind the buttons without guarding. */
export function moveStop<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return items;
  if (from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

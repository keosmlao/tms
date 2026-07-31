// Types for geo.js (runtime ຢູ່ .js ເພາະ src/queries/geofence.js ເປັນ CommonJS)

/** Great-circle distance between two lat/lng points, in meters. */
export declare function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number;

/**
 * Coerce a lat/lng coming off the wire (mobile sends strings, sometimes null
 * or "") to a finite number, or null when it isn't a usable coordinate.
 */
export declare function parseCoord(value: unknown): number | null;

export interface RadiusCheck {
  /** true when the point is within `radiusM` of the target. */
  ok: boolean;
  /** distance in meters, or null when any coordinate was missing/invalid. */
  distance: number | null;
}

export declare function checkWithinRadius(
  lat: unknown,
  lng: unknown,
  targetLat: unknown,
  targetLng: unknown,
  radiusM: number
): RadiusCheck;

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** ພິກັດຈາກ DB (string ຫຼື number) → ຈຸດ ຫຼື null ຖ້າໃຊ້ບໍ່ໄດ້ */
export declare function toPoint(lat: unknown, lng: unknown): GeoPoint | null;

/** ໄລຍະເສັ້ນຊື່ (ກມ.) */
export declare function haversineKm(a: GeoPoint, b: GeoPoint): number;

export interface Stop<T> {
  point: GeoPoint;
  data: T;
}

export interface OrderedStop<T> {
  data: T;
  point: GeoPoint;
  /** ໄລຍະຈາກຈຸດກ່ອນໜ້າ (ຈຸດທຳອິດ = ຈາກສາງ) */
  legKm: number;
  /** ໄລຍະສະສົມຕັ້ງແຕ່ອອກຈາກສາງ */
  cumulativeKm: number;
}

/**
 * ຮຽງລຳດັບຈຸດສົ່ງ (nearest-neighbour + 2-opt + or-opt). ເປັນ "ຂໍ້ແນະນຳ" —
 * ບໍ່ຮັບປະກັນວ່າດີທີ່ສຸດ ແລະ ໃຊ້ໄລຍະເສັ້ນຊື່ ບໍ່ແມ່ນທາງຈິງ.
 */
export declare function orderStops<T>(
  origin: GeoPoint,
  stops: Stop<T>[],
  options?: { maxPasses?: number }
): OrderedStop<T>[];

/** ຈຸດກາງຂອງກຸ່ມຈຸດ */
export declare function centroid(points: GeoPoint[]): GeoPoint | null;

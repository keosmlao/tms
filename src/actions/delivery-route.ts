"use server";

import { requireSession } from "./_helpers";
import {
  listDeliveryRoutes as svcList,
  getDeliveryRoute as svcGet,
  upsertDeliveryRoute as svcUpsert,
  deleteDeliveryRoute as svcDelete,
  listRouteStopSuggestions as svcStopSuggestions,
  listCustomerStopSuggestions as svcCustomerStops,
} from "@/queries/delivery-route.js";
import {
  routeFootprints as svcFootprints,
  suggestRouteWaypoints as svcWaypoints,
  routeTypicalStopCount as svcTypicalStops,
} from "@/queries/route-footprint.js";

export interface DeliveryRoute {
  code: string;
  name: string;
  origin?: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination?: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  waypoints?: Array<{ name: string; lat?: number | null; lng?: number | null } | string>;
  distance_km?: number;
  sort_order?: number;
  active?: boolean;
}

export async function listDeliveryRoutes(activeOnly = false) {
  await requireSession();
  return svcList({ activeOnly });
}

export async function getDeliveryRoute(code: string) {
  await requireSession();
  return svcGet(code);
}

export async function upsertDeliveryRoute(input: DeliveryRoute) {
  await requireSession();
  return svcUpsert(input);
}

export async function deleteDeliveryRoute(code: string) {
  await requireSession();
  return svcDelete(code);
}

/** ສາຂາທີ່ມີລົດຂົນສົ່ງຢູ່ + ພິກັດ — ໃຊ້ແນະນຳຈຸດປັກໝຸດໃນໜ້າຕັ້ງຄ່າເສັ້ນທາງ. */
export interface RouteStopSuggestion {
  code: string;
  name: string;
  /** ພິກັດຈາກ geofence ສາຂາ. ວ່າງ = ສາຂານັ້ນຍັງບໍ່ໄດ້ຕັ້ງຈຸດ. */
  lat: string;
  lng: string;
  /** ຈຳນວນລົດຂົນສົ່ງທີ່ຢູ່ສາຂານີ້. */
  car_count: number;
}

export async function listRouteStopSuggestions() {
  await requireSession();
  return svcStopSuggestions() as Promise<RouteStopSuggestion[]>;
}

/** ຮ້ານທີ່ເຄີຍສົ່ງຈິງ ພ້ອມພິກັດທີ່ຄິດຈາກຈຸດປິດບິນ. */
export interface CustomerStopSuggestion {
  code: string;
  name: string;
  /** ຄ່າມັດທະຍົມຂອງຈຸດປິດບິນ — ທົນຕໍ່ຈຸດຫຼົງກວ່າຄ່າສະເລ່ຍ. */
  lat: string;
  lng: string;
  /** ຈຳນວນຄັ້ງທີ່ສົ່ງສຳເລັດໃນຊ່ວງທີ່ດຶງ — ໃຊ້ຈັດລຳດັບຄວາມສຳຄັນ. */
  delivery_count: number;
  last_delivered: string;
}

export interface CustomerStopSuggestions {
  days: number;
  /** true = ມີຮ້ານອີກທີ່ບໍ່ໄດ້ສົ່ງມາ (ຕິດເພດານ). */
  truncated: boolean;
  stops: CustomerStopSuggestion[];
}

/**
 * ຈຸດຈອດທີ່ແນະນຳຈາກ **ການສົ່ງຈິງ** ບໍ່ແມ່ນຈາກທະບຽນລູກຄ້າ.
 *
 * ຄ່າເລີ່ມຕົ້ນ 90 ວັນເປັນເລື່ອງຈຳເປັນ ບໍ່ແມ່ນເລືອກມາຊື່ໆ: ບິນເກົ່າກວ່ານັ້ນ
 * ສ່ວນຫຼາຍບໍ່ມີພິກັດ ເພາະຫາກໍເລີ່ມເກັບ GPS.
 */
export async function listCustomerStopSuggestions(days = 90) {
  await requireSession();
  return svcCustomerStops({ days }) as Promise<CustomerStopSuggestions>;
}

/** ໝຸດໜຶ່ງອັນທີ່ແນະນຳ ພ້ອມລຳດັບ. */
export interface SuggestedWaypoint {
  seq: number;
  code: string;
  name: string;
  lat: string;
  lng: string;
  /** ຈຳນວນຄັ້ງທີ່ແວ່ຮ້ານນີ້ໃນເສັ້ນທາງນີ້. */
  visits: number;
  /** ຕຳແໜ່ງທຽບສ່ວນໃນຖ້ຽວ (0-1) — ໃກ້ 0 = ແວ່ຕົ້ນຖ້ຽວ. */
  visit_order: number;
}

export interface RouteWaypointSuggestion {
  code: string;
  /** ຈຳນວນຈຸດສະເລ່ຍຕໍ່ຖ້ຽວທີ່ຄົນຂັບແວ່ຈິງ. */
  typical_stops: number;
  stops: SuggestedWaypoint[];
}

/**
 * ໝຸດ 1..N ຂອງເສັ້ນທາງ ສ້າງຈາກ **ລຳດັບການແວ່ຈິງ** ຂອງຄົນຂັບ.
 *
 * ຈຳນວນເລີ່ມຕົ້ນເອົາຈາກຈຳນວນຈຸດສະເລ່ຍຕໍ່ຖ້ຽວຂອງເສັ້ນທາງນັ້ນເອງ ບໍ່ແມ່ນ
 * ຄ່າຕາຍຕົວ — ສາຍໃນເມືອງກັບສາຍຕ່າງແຂວງມີຈຳນວນຈຸດຕ່າງກັນຫຼາຍ.
 */
export async function suggestRouteWaypoints(code: string, count?: number) {
  await requireSession();
  const typical = (await svcTypicalStops(code)) as number;
  const want = count && count > 0 ? count : typical || 8;
  const stops = (await svcWaypoints(code, {
    count: want,
  })) as SuggestedWaypoint[];
  return { code, typical_stops: typical, stops } as RouteWaypointSuggestion;
}

/** ຮູບຮ່າງຈິງຂອງທຸກເສັ້ນທາງ — ຈຳນວນຮ້ານ, ຈຸດກາງ ແລະ ໄລຍະທີ່ແລ່ນຈິງ. */
export interface RouteFootprint {
  code: string;
  point_count: number;
  shop_count: number;
  lat: string;
  lng: string;
  last_delivered: string;
  trip_count: number;
  /** null = ເຊື່ອບໍ່ໄດ້ — ເບິ່ງເຫດຜົນທີ່ `distance_unavailable`. */
  median_km: number | null;
  distance_unavailable: string;
}

export async function listRouteFootprints() {
  await requireSession();
  return svcFootprints() as Promise<RouteFootprint[]>;
}

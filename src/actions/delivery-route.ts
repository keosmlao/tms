"use server";

import { requireSession } from "./_helpers";
import {
  listDeliveryRoutes as svcList,
  getDeliveryRoute as svcGet,
  upsertDeliveryRoute as svcUpsert,
  deleteDeliveryRoute as svcDelete,
  listRouteStopSuggestions as svcStopSuggestions,
} from "@/queries/delivery-route.js";

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

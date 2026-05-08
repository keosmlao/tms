"use server";

import { requireSession } from "./_helpers";
import {
  listDeliveryRoutes as svcList,
  getDeliveryRoute as svcGet,
  upsertDeliveryRoute as svcUpsert,
  deleteDeliveryRoute as svcDelete,
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

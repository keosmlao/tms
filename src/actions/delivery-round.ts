"use server";

import { requireSession } from "./_helpers";
import {
  listDeliveryRounds as svcList,
  getDeliveryRound as svcGet,
  upsertDeliveryRound as svcUpsert,
  deleteDeliveryRound as svcDelete,
} from "@/queries/delivery-round.js";

export interface DeliveryRound {
  code: string;
  name: string;
  time_label?: string;
  sort_order?: number;
  active?: boolean;
}

export async function listDeliveryRounds(activeOnly = false) {
  await requireSession();
  return svcList({ activeOnly });
}

export async function getDeliveryRound(code: string) {
  await requireSession();
  return svcGet(code);
}

export async function upsertDeliveryRound(input: DeliveryRound) {
  await requireSession();
  return svcUpsert(input);
}

export async function deleteDeliveryRound(code: string) {
  await requireSession();
  return svcDelete(code);
}

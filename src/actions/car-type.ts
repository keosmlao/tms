"use server";

import { requireSession } from "./_helpers";
import {
  listCarTypes as svcList,
  upsertCarType as svcUpsert,
  deleteCarType as svcDelete,
} from "@/queries/car-type.js";

export interface CarType {
  code: string;
  name: string;
  sort_order?: number;
  active?: boolean;
}

export async function listCarTypes(activeOnly = false) {
  await requireSession();
  return svcList({ activeOnly });
}

export async function upsertCarType(input: CarType) {
  await requireSession();
  return svcUpsert(input);
}

export async function deleteCarType(code: string) {
  await requireSession();
  return svcDelete(code);
}

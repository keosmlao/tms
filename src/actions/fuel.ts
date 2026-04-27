"use server";

import { requireSession } from "./_helpers";
import {
  getFuelLogs as svcGetFuelLogs,
  getFuelSummary as svcGetFuelSummary,
  getFuelImage as svcGetFuelImage,
  deleteFuelLog as svcDeleteFuelLog,
  saveFuelRefill as svcSaveFuelRefill,
} from "@/queries/fuel.js";

export interface FuelLogFilter {
  fromDate?: string;
  toDate?: string;
  search?: string;
  userCode?: string;
}

export async function getFuelLogs(filter: FuelLogFilter = {}) {
  await requireSession();
  return svcGetFuelLogs(filter);
}

export async function getFuelSummary(filter: FuelLogFilter = {}) {
  await requireSession();
  return svcGetFuelSummary(filter);
}

export async function getFuelImage(id: number | string) {
  await requireSession();
  return svcGetFuelImage(id);
}

export async function deleteFuelLog(id: number | string) {
  await requireSession();
  return svcDeleteFuelLog(id);
}

export interface FuelRefillInput {
  fuel_date?: string;
  user_code?: string;
  driver_name?: string;
  car?: string;
  doc_no?: string;
  liters?: number | string;
  amount?: number | string;
  odometer?: number | string;
  station?: string;
  note?: string;
  image_data?: string;
  lat?: string;
  lng?: string;
}

export async function saveFuelRefill(input: FuelRefillInput) {
  const s = await requireSession();
  return svcSaveFuelRefill({
    ...input,
    user_code: input.user_code ?? (s as { code?: string })?.code,
    driver_name: input.driver_name ?? (s as { name_1?: string })?.name_1,
  });
}

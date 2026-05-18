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
  const session = await requireSession();
  return svcGetFuelLogs({ ...filter, session });
}

export async function getFuelSummary(filter: FuelLogFilter = {}) {
  const session = await requireSession();
  return svcGetFuelSummary({ ...filter, session });
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
  transport_code?: string;
}

export async function saveFuelRefill(input: FuelRefillInput) {
  const s = await requireSession();
  return svcSaveFuelRefill({
    ...input,
    user_code: input.user_code ?? s.usercode,
    driver_name: input.driver_name ?? s.username,
    transport_code: s.logistic_code,
  });
}

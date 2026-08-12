"use server";

import { requireSession } from "./_helpers";
import { buildFuelEfficiency } from "@/lib/fuel-efficiency-service";
// ⚠️ ຫ້າມ re-export type ອອກຈາກໄຟລ໌ "use server" (`export type { … }`).
// Next.js server-actions loader ແປງທຸກ export ເປັນ endpoint ຕອນ runtime ແລ້ວ
// type ບໍ່ມີຕົວຕົນຕອນ runtime → ລົ້ມດ້ວຍ "ReferenceError: FuelByCarRow is not
// defined" ຕອນໂຫຼດ module. ຜູ້ໃຊ້ type ໃຫ້ import ຈາກ @/lib/fuel-types ໂດຍກົງ.
import type { FuelByCarRow } from "@/lib/fuel-types";
import {
  getFuelLogs as svcGetFuelLogs,
  getFuelSummary as svcGetFuelSummary,
  getFuelByCar as svcGetFuelByCar,
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

export async function getFuelByCar(fromDate?: string, toDate?: string) {
  const session = await requireSession();
  return svcGetFuelByCar({ fromDate, toDate, session }) as Promise<FuelByCarRow[]>;
}

/**
 * km/L over a trailing window rather than a calendar month.
 *
 * A month is the wrong window for this: trucks refuel every ~10 days, so on the
 * 12th of a month most cars have zero refills logged and the column reads "-"
 * for the whole fleet. Measured 2026-08-12 — month-to-date covered 3 cars,
 * a trailing 30 days covered all 22.
 *
 * Distance comes from the daily rollup, not the raw trail: summing a month of
 * raw pings took 4.8–11.5s, the rollup answers in single-digit milliseconds.
 */
export async function getFuelEfficiency(endDate: string, days = 30) {
  const session = await requireSession();
  return buildFuelEfficiency(session, endDate, days);
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

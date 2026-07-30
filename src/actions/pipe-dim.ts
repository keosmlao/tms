"use server";

import { requireSession } from "./_helpers";
import {
  listPipeDims as svcList,
  upsertPipeDim as svcUpsert,
  deletePipeDim as svcDelete,
  getPipeItemStats as svcItemStats,
} from "@/queries/pipe-dim.js";
import {
  buildPipeDimMap,
  computePipeCoverage,
  resolvePipeVolumes,
  type PipeDimRow,
  type PipeItemRow,
} from "@/lib/pipe-resolve";

export interface PipeDimInput {
  size_key: string;
  label: string;
  od_mm: number;
  length_m: number;
  packing_factor?: number;
  sort_order?: number;
  note?: string | null;
}

export async function listPipeDims() {
  await requireSession();
  return svcList();
}

export async function upsertPipeDim(input: PipeDimInput) {
  const session = await requireSession();
  return svcUpsert(session, input);
}

export async function deletePipeDim(sizeKey: string) {
  await requireSession();
  return svcDelete(sizeKey);
}

/**
 * ສູດທໍ່ຄຸມແຖວຖ້ຽວໄດ້ຫຼາຍປານໃດ ໃນ N ວັນຜ່ານມາ — ພ້ອມລາຍການທີ່ຍັງແກະບໍ່ໄດ້
 * ຈັດລຳດັບຕາມຄວາມຖີ່ ເພື່ອໃຫ້ຮູ້ວ່າຄວນແກ້ອັນໃດກ່ອນ.
 */
export async function getPipeCoverage(days = 90, limit = 40) {
  await requireSession();
  const [dimRows, itemRows] = await Promise.all([
    svcList() as Promise<PipeDimRow[]>,
    svcItemStats({ days }) as Promise<PipeItemRow[]>,
  ]);
  const coverage = computePipeCoverage(itemRows, buildPipeDimMap(dimRows), limit);
  return { days, ...coverage };
}

/** m³ ຕໍ່ຫົວໜ່ວຍ ຂອງລາຍການທໍ່ທີ່ສົ່ງມາ — ໃຫ້ບ່ອນຄິດພື້ນທີ່ຖ້ຽວເອີ້ນໃຊ້. */
export async function resolvePipeItemVolumes(items: PipeItemRow[]) {
  await requireSession();
  const dimRows = (await svcList()) as PipeDimRow[];
  const resolved = resolvePipeVolumes(items, buildPipeDimMap(dimRows));
  return Object.fromEntries(resolved);
}

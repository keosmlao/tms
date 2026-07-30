"use server";

import { requireSession } from "./_helpers";
import {
  listPackDims as svcList,
  upsertPackDim as svcUpsert,
  deletePackDim as svcDelete,
  getPackItemStats as svcItemStats,
} from "@/queries/pack-dim.js";
import {
  buildPackDimIndex,
  computePackCoverage,
  resolvePackVolumes,
  type PackDimRow,
  type PackItemRow,
} from "@/lib/pack-resolve";
import { parsePackImport } from "@/lib/pack-import";

export interface PackDimInput {
  family: string;
  size_key?: string | null;
  pack_unit?: string | null;
  pack_qty: number;
  width_cm: number;
  length_cm: number;
  height_cm: number;
  weight_kg?: number | null;
  note?: string | null;
  measured_item_code?: string | null;
  /** 'measured' = ຄັງວັດເອງ · 'factory' = ນຳເຂົ້າຈາກສະເປັກໂຮງງານ */
  source?: "measured" | "factory";
  brand?: string | null;
}

/**
 * ນຳເຂົ້າສະເປັກຫີບຈາກໂຮງງານ (ເຊັ່ນ SCG ຕຣາຊ້າງ) ດ້ວຍການວາງຕາຕະລາງ.
 *
 * ຄ່າທີ່ນຳເຂົ້າຖືເປັນ `factory` — ໜ້າເຊື່ອຖືເທົ່າກັບຄ່າທີ່ຄັງວັດເອງ ແລະ
 * ຈະທັບຄ່າຄາດຄະເນຈາກຮູບຊົງທັນທີ.
 */
export async function importPackDims(text: string, brand?: string) {
  const session = await requireSession();
  const { rows, errors } = parsePackImport(text);

  let inserted = 0;
  const failed: Array<{ family: string; reason: string }> = [];
  for (const row of rows) {
    try {
      await svcUpsert(session, {
        family: row.family,
        size_key: row.sizeKey,
        pack_unit: row.packUnit,
        pack_qty: row.packQty,
        width_cm: row.widthCm,
        length_cm: row.lengthCm,
        height_cm: row.heightCm,
        weight_kg: row.weightKg,
        source: "factory",
        brand: brand?.trim() || null,
        note: row.sizeLabel ? `ສະເປັກໂຮງງານ · ${row.sizeLabel}` : "ສະເປັກໂຮງງານ",
      });
      inserted += 1;
    } catch (e) {
      failed.push({ family: row.family, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { parsed: rows.length, inserted, parseErrors: errors, failed };
}

export async function listPackDims() {
  await requireSession();
  return svcList();
}

export async function upsertPackDim(input: PackDimInput) {
  const session = await requireSession();
  return svcUpsert(session, input);
}

export async function deletePackDim(roworder: number) {
  await requireSession();
  return svcDelete(roworder);
}

/**
 * ຄວາມຄຸມຂອງການວັດຫີບ + ບັນຊີວຽກ "ຄວນວັດອັນໃດກ່ອນ" ຈັດຕາມຈຳນວນແຖວທັງຕະກຸນ
 * (ວັດ 1 ຫີບ ປົດລ໋ອກໄດ້ຫຼາຍລາຍການໃນຕະກຸນດຽວກັນຜ່ານການຄາດຄະເນຂ້າມຂະໜາດ).
 */
export async function getPackCoverage(days = 90, limit = 40) {
  await requireSession();
  const [dimRows, itemRows] = await Promise.all([
    svcList() as Promise<PackDimRow[]>,
    svcItemStats({ days }) as Promise<PackItemRow[]>,
  ]);
  const coverage = computePackCoverage(itemRows, buildPackDimIndex(dimRows), limit);
  return { days, ...coverage };
}

/** m³ ຕໍ່ຫົວໜ່ວຍ ຂອງລາຍການທີ່ສົ່ງມາ — ໃຫ້ບ່ອນຄິດພື້ນທີ່ຖ້ຽວເອີ້ນໃຊ້. */
export async function resolvePackItemVolumes(items: PackItemRow[]) {
  await requireSession();
  const dimRows = (await svcList()) as PackDimRow[];
  const resolved = resolvePackVolumes(items, buildPackDimIndex(dimRows));
  return Object.fromEntries(resolved);
}

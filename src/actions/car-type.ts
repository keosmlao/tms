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
  // ຄວາມຈຸບັນທຸກ — ວັດເປັນ cm, null = ຍັງບໍ່ໄດ້ກຳນົດ
  cargo_length_cm?: number | null;
  cargo_width_cm?: number | null;
  cargo_height_cm?: number | null;
  payload_kg?: number | null;
  pallet_slots?: number | null;
  /** % ທີ່ບັນທຸກໄດ້ຈິງຫຼັງຫັກຊ່ອງຫວ່າງລະຫວ່າງກ່ອງ (ຄ່າເລີ່ມຕົ້ນ 80) */
  stowage_pct?: number | null;
  /** 'default' = ຄ່າຄາດຄະເນຂອງລະບົບ, 'measured' = ຄົນຢືນຢັນແລ້ວ */
  capacity_source?: string;
  /** ຄິດໃຫ້ຈາກ DB — ບໍ່ຕ້ອງສົ່ງມາ */
  capacity_m3?: number | null;
  usable_m3?: number | null;
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

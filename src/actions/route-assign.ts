"use server";

import { requireSession } from "./_helpers";
import { suggestRouteForPendingBills } from "@/queries/route-assign.js";
import { getFleetCapacity } from "@/queries/trip-suggest-data.js";

export interface PendingRouteBill {
  bill_no: string;
  cust_code: string;
  cust_name: string;
  muang: string;
  /** ວ່າງ = ແນະນຳບໍ່ໄດ້ (ບໍ່ມີທັງຈຸດສົ່ງ ແລະ ເມືອງ). */
  route_code: string;
  route_name: string;
  /** `point` = ຈາກຈຸດສົ່ງຈິງ · `muang` = ຈາກເມືອງໃນທະບຽນ. */
  assigned_by: "point" | "muang" | "";
  /** ຈຸດສົ່ງຈິງບໍ່ຕົງກັບເມືອງໃນທະບຽນ — ຄວນກວດ. */
  district_conflict: boolean;
  district_route: string;
  lat: string;
  lng: string;
  location_source: "planned" | "last_delivery" | "";
}

export interface PendingRouteSuggestions {
  routes: { code: string; name: string; count: number }[];
  unassigned: number;
  bills: PendingRouteBill[];
}

/**
 * ບິນທີ່ຍັງລໍຈັດຖ້ຽວ ພ້ອມສາຍທີ່ແນະນຳ ແລະ ຈຸດສົ່ງ.
 *
 * ໃຊ້ໄດ້ຈິງກໍ່ຕໍ່ເມື່ອເສັ້ນທາງຊຸດ `RTD*` (ສ້າງຈາກຂອບເຂດເມືອງ) ມີຢູ່ — ປ້າຍ
 * ຊຸດເກົ່າ `RT*` ຂັດກັນເອງເກີນໄປ (ຮ້ານດຽວກັນຖືກຕິດຫຼາຍສາຍ) ຈຶ່ງແນະນຳບໍ່ໄດ້.
 *
 * ຮັບ `billNos` ຈາກໜ້າຈໍສະເໝີ — ຫ້າມນິຍາມ "ບິນລໍຈັດ" ເອງ ບໍ່ດັ່ງນັ້ນຕົວເລກ
 * ຢູ່ແຖບນີ້ຈະຂັດກັບຕົວເລກຢູ່ຫົວໜ້າ (ເຄີຍເປັນ 334 ທຽບກັບ 33).
 */
export async function getPendingRouteSuggestions(billNos: string[]) {
  await requireSession();
  return suggestRouteForPendingBills(billNos) as Promise<PendingRouteSuggestions>;
}

export interface FleetVehicle {
  code: string;
  name: string;
  usableM3: number;
  verified: boolean;
}

/**
 * ຄວາມຈຸລົດທັງກອງ — ໃຫ້ໜ້າຈໍວາງແຜນວ່າຕ້ອງໃຊ້ກີ່ຄັນ.
 *
 * ຄືນຄ່າດິບ ແລ້ວປ່ອຍໃຫ້ `planTrucks()` ຄິດຢູ່ client ເພາະ m³ ຂອງບິນຢູ່ນັ້ນ
 * ຢູ່ແລ້ວ (hook ດຽວກັບຕາຕະລາງ) — ບໍ່ຕ້ອງສົ່ງ m³ ໄປກັບ server ອີກຮອບ.
 */
export async function listFleetCapacity() {
  await requireSession();
  const rows = (await getFleetCapacity()) as Array<{
    code: string;
    name: string;
    usable_m3: string;
    verified: boolean;
  }>;
  return (rows ?? []).map((r) => ({
    code: String(r.code ?? ""),
    name: String(r.name ?? "").trim() || String(r.code ?? ""),
    usableM3: Number(r.usable_m3 ?? 0) || 0,
    verified: r.verified === true,
  })) as FleetVehicle[];
}

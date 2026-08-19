"use server";

import { requireSession } from "./_helpers";
// ⚠️ ຫ້າມ re-export type ອອກຈາກໄຟລ໌ "use server" — ເບິ່ງໝາຍເຫດໃນ actions/fuel.ts.
// ຝັ່ງໜ້າຈໍປະກາດ type ຂອງມັນເອງຈາກ @/lib/trip-cost-types.
import {
  saveTripCost as svcSaveTripCost,
  deleteTripCost as svcDeleteTripCost,
  listTripCosts as svcListTripCosts,
} from "@/queries/trip-cost.js";
import type { TripCostRow } from "@/lib/trip-cost-types";

export interface TripCostInput {
  cost_date?: string;
  cost_type?: string;
  amount?: number | string;
  car?: string;
  doc_no?: string;
  driver?: string;
  note?: string;
}

export async function listTripCosts(fromDate: string, toDate: string, carCode = "") {
  const session = await requireSession();
  return svcListTripCosts(session, fromDate, toDate, carCode) as Promise<TripCostRow[]>;
}

export async function saveTripCost(input: TripCostInput) {
  const session = await requireSession();
  // ສາຂາ ແລະ ຜູ້ບັນທຶກ ມາຈາກ session ສະເໝີ — ບໍ່ຮັບຈາກ client ເພື່ອບໍ່ໃຫ້
  // ຜູ້ໃຊ້ສາຂາໜຶ່ງລົງຕົ້ນທຶນໃສ່ສາຂາອື່ນ
  const branch = String(session.branch_codes ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)[0];
  return svcSaveTripCost({
    ...input,
    transport_code: branch ?? "",
    created_by: session.usercode,
  });
}

export async function deleteTripCost(id: number) {
  await requireSession();
  return svcDeleteTripCost(id);
}

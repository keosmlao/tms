"use server";

import { requireSession } from "./_helpers";
import {
  getSuggestCandidates,
  getFleetCapacity,
} from "@/queries/trip-suggest-data.js";
import { getBranchOrigins } from "@/queries/branch-origin.js";
import { toPoint } from "@/lib/geo.js";
import { suggestTrips, type SuggestBill, type SuggestVehicle } from "@/lib/trip-suggest";
import { getPendingBillVolumes } from "./trip-volume";

interface CandidateRow {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  transport_code: string;
  lat: string;
  lng: string;
  point_source: string;
}

/**
 * ຖ້ຽວທີ່ແນະນຳ ສຳລັບບິນທີ່ຍັງລໍຈັດ.
 *
 * ລວມ 2 ຢ່າງທີ່ລະບົບຮູ້ຢູ່ແລ້ວເຂົ້າກັນ: ພື້ນທີ່ຂອງແຕ່ລະບິນ (m³) ແລະ
 * ຈຸດສົ່ງຂອງລູກຄ້າ. ຄືນເປັນ "ຂໍ້ແນະນຳ" ເທົ່ານັ້ນ — ບໍ່ໄດ້ສ້າງຮ່າງຖ້ຽວໃຫ້
 * ອັດຕະໂນມັດ ເພາະການຕັດສິນໃຈຂຶ້ນກັບເວລານັດ ແລະ ຄົນຂັບ ທີ່ລະບົບບໍ່ຮູ້.
 */
export async function getSuggestedTrips(input: {
  branch: string;
  maxTrucks?: number;
  maxSpreadKm?: number;
  fillTargetPct?: number;
  maxStops?: number;
}) {
  await requireSession();
  const branch = String(input.branch ?? "").trim();

  const [candidates, fleetRows, origins] = await Promise.all([
    getSuggestCandidates({ branch, limit: 300 }) as Promise<CandidateRow[]>,
    getFleetCapacity() as Promise<
      Array<{ code: string; name: string; usable_m3: string; verified: boolean }>
    >,
    getBranchOrigins() as Promise<Map<string, { lat: number; lng: number; samples: number }>>,
  ]);

  const origin = origins.get(branch) ?? null;
  if (!origin) {
    return {
      hasOrigin: false,
      trips: [],
      leftover: [],
      unlocated: [],
      totals: null,
    };
  }

  // ພື້ນທີ່ຕໍ່ບິນ — ໃຊ້ຕົວດຽວກັບທີ່ໜ້າອື່ນສະແດງ ຈຶ່ງບໍ່ຂັດກັນ
  const volumes = (await getPendingBillVolumes(
    candidates.map((row) => row.bill_no)
  )) as Record<string, { m3: number; lines: number; linesUnknown: number; coveragePct: number }>;

  const bills: SuggestBill[] = [];
  const unlocated: Array<{ bill_no: string; cust_name: string; m3: number }> = [];
  for (const row of candidates) {
    const volume = volumes[row.bill_no];
    const m3 = Number(volume?.m3 ?? 0);
    const point = toPoint(row.lat, row.lng);
    if (!point) {
      unlocated.push({ bill_no: row.bill_no, cust_name: row.cust_name, m3 });
      continue;
    }
    bills.push({
      bill_no: row.bill_no,
      cust_code: row.cust_code,
      cust_name: row.cust_name,
      point,
      m3,
      // ຮູ້ຂະໜາດເກີນ 75% ຂອງແຖວຈຶ່ງນັບວ່າພຽງພໍ — ຄືເກນດຽວກັບໜ້າອື່ນ
      dataSufficient: (volume?.coveragePct ?? 0) >= 75,
    });
  }

  const maxTrucks = Math.max(1, Math.min(Number(input.maxTrucks ?? 5), fleetRows.length));
  const fleet: SuggestVehicle[] = fleetRows
    .map((row) => ({
      code: row.code,
      name: row.name,
      usableM3: Number(row.usable_m3 ?? 0),
    }))
    .filter((vehicle) => vehicle.usableM3 > 0)
    .slice(0, maxTrucks);

  const result = suggestTrips(origin, bills, fleet, {
    maxSpreadKm: Number(input.maxSpreadKm ?? 25),
    fillTargetPct: Number(input.fillTargetPct ?? 95),
    maxStops: Number(input.maxStops ?? 12),
  });

  const placed = result.trips.reduce((sum, trip) => sum + trip.bills.length, 0);
  return {
    hasOrigin: true,
    trips: result.trips,
    leftover: result.leftover,
    unlocated,
    totals: {
      candidates: candidates.length,
      placed,
      leftover: result.leftover.length,
      unlocated: unlocated.length,
      km: Math.round(result.trips.reduce((sum, trip) => sum + trip.km, 0) * 10) / 10,
    },
  };
}

// ຈັດກຸ່ມບິນທີ່ລໍຖ້າ ໃຫ້ກາຍເປັນ "ຖ້ຽວທີ່ແນະນຳ" — ຄິດຢ່າງດຽວ ບໍ່ແຕະ DB.
//
// ຫຼັກການ: ບິນຢູ່ໃກ້ກັນຄວນຢູ່ຖ້ຽວດຽວກັນ ແລະ ຖ້ຽວໜຶ່ງບໍ່ຄວນເກີນພື້ນທີ່ຂອງລົດ.
// ສອງເງື່ອນໄຂນີ້ຂັດກັນເລື້ອຍໆ ຈຶ່ງເລືອກແບບ "ໂລບ" (greedy): ເລີ່ມຈາກບິນທີ່ໄກ
// ສາງທີ່ສຸດກ່ອນ ແລ້ວດຶງບິນທີ່ໃກ້ກຸ່ມທີ່ສຸດເຂົ້າມາຈົນລົດເຕັມ.
//
// ⚠️ ເປັນ "ຂໍ້ແນະນຳ" ບໍ່ແມ່ນຄຳສັ່ງ: ບໍ່ຮູ້ເລື່ອງເວລານັດ, ນ້ຳໜັກ, ລູກຄ້າ
// ບູລິມະສິດ ຫຼື ຂໍ້ຕົກລົງລະຫວ່າງຄົນຂັບ. ຄົນຈັດຖ້ຽວຕັດສິນໃຈສຸດທ້າຍ.

import { haversineKm, orderStops, type GeoPoint } from "./geo";

export interface SuggestBill {
  bill_no: string;
  cust_code: string;
  cust_name: string;
  point: GeoPoint;
  m3: number;
  /** ຮູ້ຂະໜາດຄົບບໍ — ບໍ່ຄົບ m³ ຈະຕໍ່າກວ່າຄວາມຈິງ */
  dataSufficient: boolean;
}

export interface SuggestVehicle {
  code: string;
  name: string;
  usableM3: number;
}

export interface SuggestedTrip {
  vehicle: SuggestVehicle;
  bills: Array<SuggestBill & { legKm: number; order: number }>;
  m3: number;
  utilizationPct: number;
  km: number;
  /** ມີບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດຄົບຢູ່ໃນຖ້ຽວນີ້ — % ຈຶ່ງເປັນຄ່າຕໍ່າສຸດ */
  hasUnknownVolume: boolean;
}

export interface SuggestResult {
  trips: SuggestedTrip[];
  /** ບິນທີ່ຍັດເຂົ້າຖ້ຽວໃດບໍ່ໄດ້ (ລົດໝົດ ຫຼື ໃຫຍ່ເກີນທຸກຄັນ) */
  leftover: SuggestBill[];
}

export interface SuggestOptions {
  /** ບໍ່ດຶງບິນທີ່ຫ່າງຈາກກຸ່ມເກີນນີ້ເຂົ້າມາ (ກມ.) */
  maxSpreadKm?: number;
  /** ບັນຈຸເຖິງແຕ່ % ນີ້ ແລ້ວຢຸດ — ເຜື່ອບ່ອນຍ່າງ ແລະ ຄວາມຄາດເຄື່ອນຂອງຂະໜາດ */
  fillTargetPct?: number;
  /**
   * ຈຳນວນຈຸດສົ່ງສູງສຸດຕໍ່ຖ້ຽວ.
   *
   * ຈຳເປັນ ບໍ່ແມ່ນທາງເລືອກ: ບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດມີ m³ = 0 ຈຶ່ງບໍ່ກິນພື້ນທີ່
   * ເລີຍ ແລະ ລົດຈະ "ບໍ່ເຕັມ" ຈັກເທື່ອ. ວັດກັບຂໍ້ມູນຈິງ: ຖ້າບໍ່ຈຳກັດ ຖ້ຽວ
   * ໜຶ່ງໄດ້ 111 ບິນ ເຊິ່ງໃຊ້ບໍ່ໄດ້ຈິງ.
   */
  maxStops?: number;
}

/**
 * ຈັດບິນເຂົ້າລົດ.
 *
 * ລົດຖືກຮຽງຈາກໃຫຍ່ໄປນ້ອຍ ເພື່ອໃຫ້ຄັນໃຫຍ່ໄດ້ກຸ່ມທີ່ກວ້າງທີ່ສຸດກ່ອນ —
 * ຖ້າໃຫ້ຄັນນ້ອຍເລືອກກ່ອນ ບິນໃຫຍ່ຈະເຫຼືອຄ້າງໂດຍບໍ່ຈຳເປັນ.
 */
export function suggestTrips(
  origin: GeoPoint,
  bills: SuggestBill[],
  vehicles: SuggestVehicle[],
  { maxSpreadKm = 25, fillTargetPct = 95, maxStops = 12 }: SuggestOptions = {}
): SuggestResult {
  const remaining = [...bills];
  const fleet = [...vehicles]
    .filter((v) => v.usableM3 > 0)
    .sort((a, b) => b.usableM3 - a.usableM3);
  const trips: SuggestedTrip[] = [];

  for (const vehicle of fleet) {
    if (remaining.length === 0) break;
    const capacity = (vehicle.usableM3 * fillTargetPct) / 100;

    // ເລີ່ມຈາກບິນທີ່ໄກສາງທີ່ສຸດ: ບິນໄກຄືອັນທີ່ຈັດຍາກສຸດ ຖ້າປະໄວ້ທ້າຍ
    // ມັນຈະກາຍເປັນຖ້ຽວທີ່ມີບິນດຽວ
    let seedIndex = 0;
    let seedKm = -1;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(origin, remaining[i].point);
      if (km > seedKm) {
        seedKm = km;
        seedIndex = i;
      }
    }
    const seed = remaining[seedIndex];
    if (seed.m3 > vehicle.usableM3) {
      // ບິນດຽວກໍ່ໃຫຍ່ກວ່າລົດຄັນນີ້ — ລອງຄັນຕໍ່ໄປ (ນ້ອຍກວ່າ) ບໍ່ໄດ້ ຈຶ່ງ
      // ປ່ອຍໄວ້ໃຫ້ leftover ຈັບ ແລະ ໃຫ້ຄົນຕັດສິນໃຈ
      remaining.splice(seedIndex, 1);
      trips.push({
        vehicle,
        bills: [{ ...seed, legKm: 0, order: 1 }],
        m3: seed.m3,
        utilizationPct: (seed.m3 / vehicle.usableM3) * 100,
        km: Math.round(haversineKm(origin, seed.point) * 100) / 100,
        hasUnknownVolume: !seed.dataSufficient,
      });
      continue;
    }

    remaining.splice(seedIndex, 1);
    const group = [seed];
    let load = seed.m3;

    // ດຶງບິນທີ່ໃກ້ກຸ່ມທີ່ສຸດເຂົ້າມາເລື້ອຍໆ ຈົນເຕັມ, ຄົບຈຳນວນຈຸດ ຫຼື ໄກເກີນ
    while (group.length < maxStops) {
      let bestIndex = -1;
      let bestKm = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (load + candidate.m3 > capacity) continue;
        // ໄກຈາກ "ບິນທີ່ໃກ້ທີ່ສຸດໃນກຸ່ມ" ບໍ່ແມ່ນຈາກຈຸດກາງ — ຈຶ່ງຍອມໃຫ້
        // ກຸ່ມຍາວຕາມເສັ້ນທາງໄດ້ ແທນທີ່ຈະບັງຄັບໃຫ້ເປັນວົງມົນ
        let km = Number.POSITIVE_INFINITY;
        for (const member of group) {
          km = Math.min(km, haversineKm(member.point, candidate.point));
        }
        if (km > maxSpreadKm) continue;
        if (km < bestKm) {
          bestKm = km;
          bestIndex = i;
        }
      }
      if (bestIndex < 0) break;
      const [picked] = remaining.splice(bestIndex, 1);
      group.push(picked);
      load += picked.m3;
    }

    const ordered = orderStops(
      origin,
      group.map((bill) => ({ point: bill.point, data: bill }))
    );
    trips.push({
      vehicle,
      bills: ordered.map((stop, index) => ({
        ...stop.data,
        legKm: stop.legKm,
        order: index + 1,
      })),
      m3: Math.round(load * 1000) / 1000,
      utilizationPct: (load / vehicle.usableM3) * 100,
      km: ordered[ordered.length - 1]?.cumulativeKm ?? 0,
      hasUnknownVolume: group.some((bill) => !bill.dataSufficient),
    });
  }

  return { trips, leftover: remaining };
}

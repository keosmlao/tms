export interface PlanVehicle {
  code: string;
  name: string;
  usableM3: number;
  /** ຄວາມຈຸມາຈາກການວັດຈິງ ຫຼື ຄາດເອົາ — ບອກຄວາມໜ້າເຊື່ອຖື. */
  verified: boolean;
}

export interface PlannedTruck {
  vehicle: PlanVehicle;
  /** m³ ທີ່ບັນຈຸໃສ່ຄັນນີ້. */
  m3: number;
  utilizationPct: number;
  /** true = ຄັນສຸດທ້າຍທີ່ຍັງບັນຈຸບໍ່ເຕັມ. */
  partial: boolean;
}

export interface TruckPlan {
  trucks: PlannedTruck[];
  /** m³ ທີ່ບັນຈຸບໍ່ໝົດ ເພາະລົດບໍ່ພໍ. */
  leftoverM3: number;
  /** ຄວາມຈຸລວມທີ່ໃຊ້ໄດ້ຂອງລົດທັງກອງ (ຫຼັງຫັກເປົ້າໝາຍການບັນຈຸ). */
  totalCapacityM3: number;
}

/**
 * ວາງແຜນວ່າ **ຕ້ອງໃຊ້ລົດກີ່ຄັນ ແລະ ຄັນລະເທົ່າໃດ**.
 *
 * ກົດທີ່ຕົກລົງກັນ: **ເຕັມຄັນທຳອິດກ່ອນ ຈຶ່ງເປີດຄັນຕໍ່ໄປ** — ບໍ່ແມ່ນຫານເທົ່າກັນ
 * ທຸກຄັນ. ການຫານເທົ່າກັນເບິ່ງຄືຍຸຕິທຳ ແຕ່ໃນຄວາມຈິງມັນເປືອງ: 3 ຄັນແລ່ນຄັນລະ
 * 60% ກິນນ້ຳມັນ 3 ຄັນ ທັງທີ່ 2 ຄັນເຕັມກໍ່ພໍ.
 *
 * ໃຊ້ລົດຄັນໃຫຍ່ກ່ອນ ເພາະໄດ້ຈຳນວນຄັນໜ້ອຍສຸດຕໍ່ປະລິມານດຽວກັນ.
 *
 * `fillTargetPct` ຕ່ຳກວ່າ 100 ໂດຍເຈດຕະນາ: ບັນຈຸເຕັມ 100% ຕາມທິດສະດີແມ່ນ
 * ບັນຈຸບໍ່ໄດ້ຈິງ ເພາະສິນຄ້າວາງຊ້ອນກັນບໍ່ລົງຕົວ ແລະ ຕ້ອງມີບ່ອນຍ່າງ.
 */
export function planTrucks(
  totalM3: number,
  vehicles: PlanVehicle[],
  { fillTargetPct = 90 }: { fillTargetPct?: number } = {}
): TruckPlan {
  const target = Math.min(Math.max(fillTargetPct, 1), 100) / 100;
  const fleet = [...vehicles]
    .filter((v) => v.usableM3 > 0)
    .sort((a, b) => b.usableM3 - a.usableM3);

  const totalCapacityM3 = fleet.reduce((s, v) => s + v.usableM3 * target, 0);

  let left = Math.max(0, totalM3);
  const trucks: PlannedTruck[] = [];
  for (const vehicle of fleet) {
    if (left <= 0) break;
    const capacity = vehicle.usableM3 * target;
    const load = Math.min(left, capacity);
    left -= load;
    trucks.push({
      vehicle,
      m3: Math.round(load * 100) / 100,
      utilizationPct: Math.round((load / vehicle.usableM3) * 100),
      partial: load < capacity - 1e-9,
    });
  }

  return {
    trucks,
    leftoverM3: Math.round(left * 100) / 100,
    totalCapacityM3: Math.round(totalCapacityM3 * 100) / 100,
  };
}

/** ຂໍ້ຄວາມສັ້ນສຳລັບໜ້າຈໍ: "2 ຄັນ · ບຄ 2941 ເຕັມ + ບຈ0689 40%". */
export function describePlan(plan: TruckPlan): string {
  if (plan.trucks.length === 0) return "ບໍ່ຕ້ອງໃຊ້ລົດ";
  const parts = plan.trucks.map((t) =>
    t.partial ? `${t.vehicle.name} ${t.utilizationPct}%` : `${t.vehicle.name} ເຕັມ`
  );
  const tail =
    plan.leftoverM3 > 0 ? ` · ເຫຼືອ ${plan.leftoverM3} m³ ບັນຈຸບໍ່ໄດ້` : "";
  return `${plan.trucks.length} ຄັນ · ${parts.join(" + ")}${tail}`;
}

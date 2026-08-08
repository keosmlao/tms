import { describe, expect, it } from "vitest";
import { describePlan, planTrucks, type PlanVehicle } from "./truck-plan";

const v = (code: string, m3: number, verified = true): PlanVehicle => ({
  code,
  name: code,
  usableM3: m3,
  verified,
});

// ຄວາມຈຸຈິງຈາກກອງລົດ: 35.3 / 30.4 / 18 / 17.6 …
const FLEET = [v("ໃຫຍ່", 35.328), v("ກາງ", 30.362), v("ນ້ອຍ", 18)];

describe("ເຕັມຄັນທຳອິດກ່ອນ", () => {
  it("ບັນຈຸຄັນໃຫຍ່ໃຫ້ເຕັມກ່ອນ ຈຶ່ງເປີດຄັນທີສອງ", () => {
    // ກົດຫຼັກທີ່ຜູ້ໃຊ້ກຳນົດ — ຫ້າມຫານເທົ່າກັນທຸກຄັນ.
    const p = planTrucks(40, FLEET, { fillTargetPct: 90 });
    expect(p.trucks).toHaveLength(2);
    expect(p.trucks[0].partial).toBe(false);
    expect(p.trucks[0].m3).toBeCloseTo(35.328 * 0.9, 2);
    expect(p.trucks[1].partial).toBe(true);
  });

  it("ພໍດີຄັນດຽວ ບໍ່ເປີດຄັນທີສອງ", () => {
    const p = planTrucks(10, FLEET);
    expect(p.trucks).toHaveLength(1);
    expect(p.trucks[0].partial).toBe(true);
    expect(p.leftoverM3).toBe(0);
  });

  it("ໃຊ້ຄັນໃຫຍ່ກ່ອນສະເໝີ — ໄດ້ຈຳນວນຄັນໜ້ອຍສຸດ", () => {
    const p = planTrucks(60, [v("ນ້ອຍ", 18), v("ໃຫຍ່", 35.328)]);
    expect(p.trucks[0].vehicle.code).toBe("ໃຫຍ່");
  });
});

describe("ຂອບເຂດ", () => {
  it("ບໍ່ມີສິນຄ້າ = ບໍ່ຕ້ອງໃຊ້ລົດ", () => {
    const p = planTrucks(0, FLEET);
    expect(p.trucks).toHaveLength(0);
    expect(describePlan(p)).toBe("ບໍ່ຕ້ອງໃຊ້ລົດ");
  });

  it("ສິນຄ້າຫຼາຍກວ່າກອງລົດ → ບອກສ່ວນທີ່ບັນຈຸບໍ່ໄດ້ ບໍ່ແມ່ນປິດງຽບ", () => {
    // ບອກເລີຍວ່າເຫຼືອເທົ່າໃດ ດີກວ່າໃຫ້ຄົນຈັດຖ້ຽວມາຮູ້ຕອນເຄື່ອງລົງບໍ່ໝົດ.
    const p = planTrucks(1000, FLEET, { fillTargetPct: 90 });
    expect(p.trucks).toHaveLength(3);
    expect(p.leftoverM3).toBeGreaterThan(0);
    expect(describePlan(p)).toContain("ບັນຈຸບໍ່ໄດ້");
  });

  it("ລົດຄວາມຈຸ 0 ຫຼື ຕິດລົບ ຖືກຕັດອອກ", () => {
    const p = planTrucks(10, [v("ບໍ່ຮູ້", 0), v("ຜິດ", -5), v("ດີ", 20)]);
    expect(p.trucks).toHaveLength(1);
    expect(p.trucks[0].vehicle.code).toBe("ດີ");
  });

  it("ບໍ່ມີລົດເລີຍ → ເຫຼືອທັງໝົດ ບໍ່ພັງ", () => {
    const p = planTrucks(10, []);
    expect(p.trucks).toHaveLength(0);
    expect(p.leftoverM3).toBe(10);
  });
});

describe("ເປົ້າໝາຍການບັນຈຸ", () => {
  it("ບໍ່ບັນຈຸເຕັມ 100% ຕາມຄ່າເລີ່ມຕົ້ນ", () => {
    // ບັນຈຸເຕັມຕາມທິດສະດີແມ່ນເປັນໄປບໍ່ໄດ້ຈິງ — ສິນຄ້າວາງຊ້ອນບໍ່ລົງຕົວ.
    const p = planTrucks(100, [v("ຄັນດຽວ", 20)]);
    expect(p.trucks[0].m3).toBeCloseTo(18, 2);
    expect(p.trucks[0].utilizationPct).toBe(90);
  });

  it("ຕັ້ງເປົ້າໝາຍເອງໄດ້", () => {
    const p = planTrucks(100, [v("ຄັນດຽວ", 20)], { fillTargetPct: 100 });
    expect(p.trucks[0].m3).toBeCloseTo(20, 2);
  });
});

describe("ຂໍ້ຄວາມສະຫຼຸບ", () => {
  it("ບອກຈຳນວນຄັນ ແລະ ສະພາບການບັນຈຸແຕ່ລະຄັນ", () => {
    const text = describePlan(planTrucks(40, FLEET, { fillTargetPct: 90 }));
    expect(text).toContain("2 ຄັນ");
    expect(text).toContain("ເຕັມ");
    expect(text).toMatch(/\d+%/);
  });
});

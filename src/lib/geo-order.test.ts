import { describe, it, expect } from "vitest";
import { toPoint, haversineKm, orderStops, centroid } from "./geo";

// ຈຸດຈິງໃນນະຄອນຫຼວງວຽງຈັນ — ສາງ 02-0002 ຄິດຈາກ GPS ຕອນລົດອອກ 1,022 ຄັ້ງ
const WAREHOUSE = { lat: 18.064334, lng: 102.669599 };

describe("toPoint", () => {
  it("ຮັບ string ຈາກ DB", () => {
    expect(toPoint("18.064334", "102.669599")).toEqual(WAREHOUSE);
  });

  it("0,0 ບໍ່ແມ່ນພິກັດ — ແປວ່າບໍ່ມີຂໍ້ມູນ", () => {
    // ຖ້າຮັບ 0,0 ລົດຈະຖືກແຕ້ມໄປກາງມະຫາສະໝຸດ ແລ້ວໄລຍະທາງຈະຜິດເປັນພັນ ກມ.
    expect(toPoint("0", "0")).toBeNull();
    expect(toPoint(0, 0)).toBeNull();
  });

  it("ຄ່າຫວ່າງ / ນອກຂອບເຂດ ຄືນ null", () => {
    expect(toPoint("", "")).toBeNull();
    expect(toPoint(null, null)).toBeNull();
    expect(toPoint("abc", "102.6")).toBeNull();
    expect(toPoint("91", "102.6")).toBeNull();
    expect(toPoint("18.06", "181")).toBeNull();
  });

  it("ພິກັດດຽວທີ່ເປັນ 0 ຍັງໃຊ້ໄດ້ (ເສັ້ນສູນສູດ/ເມີຣິດຽນ)", () => {
    expect(toPoint("0", "102.6")).toEqual({ lat: 0, lng: 102.6 });
  });
});

describe("haversineKm", () => {
  it("ວັດໄລຍະໄດ້ຖືກຕ້ອງ", () => {
    // ວຽງຈັນ → ປາກເຊ ປະມານ 500 ກມ. ເສັ້ນຊື່
    const pakse = { lat: 15.131891, lng: 105.806977 };
    const km = haversineKm(WAREHOUSE, pakse);
    expect(km).toBeGreaterThan(450);
    expect(km).toBeLessThan(550);
  });

  it("ຈຸດດຽວກັນ = 0", () => {
    expect(haversineKm(WAREHOUSE, WAREHOUSE)).toBe(0);
  });
});

describe("orderStops", () => {
  it("ຮຽງຈາກໃກ້ໄປໄກ ເມື່ອຈຸດຢູ່ເສັ້ນດຽວກັນ", () => {
    const stops = [
      { point: { lat: 18.3, lng: 102.669599 }, data: "ໄກ" },
      { point: { lat: 18.1, lng: 102.669599 }, data: "ໃກ້" },
      { point: { lat: 18.2, lng: 102.669599 }, data: "ກາງ" },
    ];
    const out = orderStops(WAREHOUSE, stops);
    expect(out.map((s) => s.data)).toEqual(["ໃກ້", "ກາງ", "ໄກ"]);
  });

  it("legKm ແລະ cumulativeKm ສອດຄ່ອງກັນ", () => {
    const stops = [
      { point: { lat: 18.1, lng: 102.669599 }, data: "a" },
      { point: { lat: 18.2, lng: 102.669599 }, data: "b" },
    ];
    const out = orderStops(WAREHOUSE, stops);
    expect(out[1].cumulativeKm).toBeCloseTo(out[0].legKm + out[1].legKm, 1);
  });

  it("ບໍ່ສະຫຼັບໄປມາ: ຈຸດຝັ່ງດຽວກັນຕ້ອງຢູ່ຕິດກັນ", () => {
    const stops = [
      { point: { lat: 18.064, lng: 102.68 }, data: "ອອກ1" },
      { point: { lat: 18.064, lng: 102.62 }, data: "ຕົກໄກ" },
      { point: { lat: 18.064, lng: 102.7 }, data: "ອອກ2" },
      { point: { lat: 18.064, lng: 102.64 }, data: "ຕົກໃກ້" },
    ];
    const order = orderStops(WAREHOUSE, stops).map((s) => s.data);
    // ຢືນຢັນດ້ວຍ brute force ວ່າ 11.67 ກມ. ຄືສັ້ນທີ່ສຸດແທ້ (ມີ 2 ລຳດັບທີ່
    // ໄດ້ໄລຍະເທົ່າກັນ) ຈຶ່ງບໍ່ຜູກ test ໄວ້ກັບລຳດັບໃດລຳດັບໜຶ່ງ — ວັດສິ່ງທີ່
    // ຕ້ອງການແທ້: ບໍ່ໄປຝັ່ງໜຶ່ງແລ້ວຕີກັບມາອີກຝັ່ງ
    const eastAt = ["ອອກ1", "ອອກ2"].map((d) => order.indexOf(d)).sort((a, b) => a - b);
    const westAt = ["ຕົກໃກ້", "ຕົກໄກ"].map((d) => order.indexOf(d)).sort((a, b) => a - b);
    expect(eastAt[1] - eastAt[0]).toBe(1);
    expect(westAt[1] - westAt[0]).toBe(1);
  });

  it("ໄດ້ໄລຍະສັ້ນທີ່ສຸດ ທຽບກັບທຸກລຳດັບທີ່ເປັນໄປໄດ້", () => {
    const stops = [
      { point: { lat: 18.02, lng: 102.71 }, data: "a" },
      { point: { lat: 18.11, lng: 102.61 }, data: "b" },
      { point: { lat: 17.98, lng: 102.63 }, data: "c" },
      { point: { lat: 18.09, lng: 102.74 }, data: "d" },
      { point: { lat: 18.05, lng: 102.66 }, data: "e" },
    ];
    const out = orderStops(WAREHOUSE, stops);
    const got = out[out.length - 1].cumulativeKm;

    const permutations = <T,>(list: T[]): T[][] =>
      list.length <= 1
        ? [list]
        : list.flatMap((item, i) =>
            permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [
              item,
              ...rest,
            ])
          );
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of permutations(stops)) {
      let total = 0;
      let prev = WAREHOUSE;
      for (const stop of candidate) {
        total += haversineKm(prev, stop.point);
        prev = stop.point;
      }
      best = Math.min(best, total);
    }
    expect(got).toBeCloseTo(best, 1);
  });

  it("ບໍ່ມີຈຸດ = ບໍ່ມີເສັ້ນທາງ", () => {
    expect(orderStops(WAREHOUSE, [])).toEqual([]);
  });

  it("ຈຸດດຽວ: legKm = ໄລຍະຈາກສາງ", () => {
    const p = { lat: 18.1, lng: 102.669599 };
    const out = orderStops(WAREHOUSE, [{ point: p, data: "x" }]);
    expect(out).toHaveLength(1);
    expect(out[0].legKm).toBeCloseTo(haversineKm(WAREHOUSE, p), 2);
  });
});

describe("centroid", () => {
  it("ຫາຈຸດກາງ", () => {
    expect(
      centroid([
        { lat: 18, lng: 102 },
        { lat: 19, lng: 103 },
      ])
    ).toEqual({ lat: 18.5, lng: 102.5 });
  });

  it("ບໍ່ມີຈຸດ = null", () => {
    expect(centroid([])).toBeNull();
  });
});

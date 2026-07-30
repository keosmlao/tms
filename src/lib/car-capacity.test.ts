import { describe, expect, it } from "vitest";
import {
  cargoBoxM3,
  resolveCargoM3,
  toCapacityNumber,
  usableM3,
} from "./car-capacity";

describe("toCapacityNumber", () => {
  it("treats blank as ບໍ່ໄດ້ກຳນົດ (null), not zero", () => {
    // ຖ້າແປງເປັນ 0 ຈະກາຍເປັນ "ລົດຄັນນີ້ບັນທຸກບໍ່ໄດ້ເລີຍ" ແທນ "ໃຊ້ຄ່າປະເພດ"
    expect(toCapacityNumber("")).toBeNull();
    expect(toCapacityNumber(null)).toBeNull();
    expect(toCapacityNumber(undefined)).toBeNull();
    expect(toCapacityNumber("abc")).toBeNull();
    expect(toCapacityNumber(0)).toBe(0);
  });

  it("accepts the numeric strings Postgres returns", () => {
    expect(toCapacityNumber("210")).toBe(210);
    expect(toCapacityNumber("22.050")).toBe(22.05);
  });
});

describe("cargoBoxM3", () => {
  it("converts a 6-wheel box (210×500×210 cm) to m³", () => {
    expect(cargoBoxM3(210, 500, 210)).toBeCloseTo(22.05, 3);
  });

  it("matches the DB figure for a 12-wheel box", () => {
    expect(cargoBoxM3(230, 800, 240)).toBeCloseTo(44.16, 3);
  });

  it("returns null when any side is missing or zero", () => {
    expect(cargoBoxM3(210, 500, "")).toBeNull();
    expect(cargoBoxM3(210, 0, 210)).toBeNull();
    expect(cargoBoxM3(null, null, null)).toBeNull();
  });
});

describe("usableM3", () => {
  it("discounts the box by the stowage percentage", () => {
    expect(usableM3(22.05, 80)).toBeCloseTo(17.64, 3);
    expect(usableM3(29.04, 70)).toBeCloseTo(20.328, 3);
  });

  it("falls back to 80% when stowage is not set", () => {
    expect(usableM3(10, "")).toBeCloseTo(8, 6);
    expect(usableM3(10, null)).toBeCloseTo(8, 6);
  });

  it("rejects out-of-range percentages instead of inventing capacity", () => {
    expect(usableM3(10, 0)).toBeNull();
    expect(usableM3(10, 140)).toBeNull();
  });

  it("stays null when the box is unknown", () => {
    expect(usableM3(null, 80)).toBeNull();
  });
});

describe("resolveCargoM3", () => {
  const sixWheel = { width: 210, length: 500, height: 210 };

  it("prefers the per-car box over the type default", () => {
    const out = resolveCargoM3({ width: 220, length: 600, height: 220 }, sixWheel);
    expect(out.source).toBe("car");
    expect(out.m3).toBeCloseTo(29.04, 3);
  });

  it("inherits the type default when the car has no box", () => {
    const out = resolveCargoM3({ width: "", length: "", height: "" }, sixWheel);
    expect(out.source).toBe("type");
    expect(out.m3).toBeCloseTo(22.05, 3);
  });

  it("does not mix a partial per-car box with the type default", () => {
    // ຄັນນີ້ໃສ່ແຕ່ຄວາມກວ້າງ — ຕ້ອງຕົກໄປໃຊ້ຕູ້ຂອງປະເພດທັງກ້ອນ
    // ບໍ່ແມ່ນເອົາກວ້າງຄັນນີ້ມາຄູນຍາວ/ສູງຂອງປະເພດ
    const out = resolveCargoM3({ width: 220, length: "", height: "" }, sixWheel);
    expect(out.source).toBe("type");
    expect(out.m3).toBeCloseTo(22.05, 3);
  });

  it("reports none when neither the car nor its type is measured", () => {
    expect(resolveCargoM3({}, null)).toEqual({ m3: null, source: "none" });
    expect(resolveCargoM3({}, { width: "", length: "", height: "" }).source).toBe("none");
  });
});

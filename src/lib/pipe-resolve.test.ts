import { describe, expect, it } from "vitest";
import {
  buildPipeDimMap,
  computePipeCoverage,
  resolvePipeVolumes,
  type PipeDimRow,
} from "./pipe-resolve";

// ຮູບແບບແຖວທີ່ Postgres ຄືນມາຈິງ — numeric ມາເປັນ string
const DIM_ROWS: PipeDimRow[] = [
  { size_key: "in:0.375", label: '3/8"', od_mm: "18", length_m: "4", packing_factor: "0.9" },
  { size_key: "in:0.5", label: '1/2"', od_mm: "21.5", length_m: "4", packing_factor: "0.9" },
  { size_key: "in:4", label: '4"', od_mm: "114", length_m: "4", packing_factor: "0.9" },
  { size_key: "mm:25", label: "25 mm", od_mm: "25", length_m: "4", packing_factor: "0.9" },
];

const map = buildPipeDimMap(DIM_ROWS);

describe("buildPipeDimMap", () => {
  it("coerces the numeric strings Postgres returns", () => {
    expect(map.get("in:0.5")).toEqual({
      label: '1/2"',
      odMm: 21.5,
      lengthM: 4,
      packingFactor: 0.9,
      weightKg: null,
    });
  });

  it("defaults length to 4 m and packing to 0.9 when null", () => {
    const m = buildPipeDimMap([
      { size_key: "in:2", label: '2"', od_mm: 60, length_m: null, packing_factor: null },
    ]);
    expect(m.get("in:2")).toMatchObject({ lengthM: 4, packingFactor: 0.9 });
  });

  it("skips rows with no usable outer diameter", () => {
    const m = buildPipeDimMap([
      { size_key: "in:2", label: '2"', od_mm: "0", length_m: 4, packing_factor: 0.9 },
      { size_key: "", label: "x", od_mm: 60, length_m: 4, packing_factor: 0.9 },
    ]);
    expect(m.size).toBe(0);
  });

  it("tolerates null input", () => {
    expect(buildPipeDimMap(null).size).toBe(0);
  });
});

describe("resolvePipeVolumes", () => {
  it("resolves a bundled 1/2 inch PVC pipe", () => {
    const out = resolvePipeVolumes(
      [
        {
          item_code: "130101-0314",
          item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 1/2 ຊັ້ນ 13.5  1ມັດ= 25 ເສັ້ນ",
          unit_code: "ເສັ້ນ",
        },
      ],
      map
    );
    const hit = out.get("130101-0314")!;
    expect(hit.sizeKey).toBe("in:0.5");
    expect(hit.packQty).toBe(25);
    expect(hit.packUnit).toBe("ມັດ");
    // 0.0215² × 4 × 0.9
    expect(hit.m3).toBeCloseTo(0.00166, 5);
    expect(hit.source).toBe("pipe_formula");
  });

  it("resolves a 4 inch pipe with no bundle", () => {
    const out = resolvePipeVolumes(
      [{ item_code: "130101-0326", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 8.5" }],
      map
    );
    const hit = out.get("130101-0326")!;
    expect(hit.m3).toBeCloseTo(0.0467856, 6);
    expect(hit.packQty).toBeNull();
  });

  it("prefers a length stated in the name over the table default", () => {
    const out = resolvePipeVolumes(
      [
        {
          item_code: "130202-0403",
          item_name: "ທໍ່ອ່ອນຮ້ອຍສາຍໄຟສີເຫຼືອງ 3/8 ຍາວ20cm 1ຖົງ=100 ຕົວ",
        },
      ],
      map
    );
    const hit = out.get("130202-0403")!;
    expect(hit.lengthM).toBeCloseTo(0.2, 6);
    // 0.018² × 0.2 × 0.9 — ນ້ອຍກວ່າຖ້າໃຊ້ 4m ຫຼາຍເທົ່າ
    expect(hit.m3).toBeCloseTo(0.00005832, 8);
  });

  it("omits pipe clamps and fittings entirely", () => {
    const out = resolvePipeVolumes(
      [
        { item_code: "A", item_name: "ກິບຮັດທໍ່ເຫຼັກ ຂະໜາດ 4  1ຖົງ= 100 ຕົວ" },
        { item_code: "B", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 35 ຕົວ" },
      ],
      map
    );
    expect(out.size).toBe(0);
  });

  it("omits a pipe whose size is not in the table rather than guessing", () => {
    // 3 ນີ້ວ ແກະໄດ້ ແຕ່ຕາຕະລາງທົດສອບນີ້ບໍ່ມີ in:3
    const out = resolvePipeVolumes(
      [{ item_code: "C", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 3 ນີ້ວ ຊັ້ນ 8.5" }],
      map
    );
    expect(out.has("C")).toBe(false);
  });

  it("omits ທໍ່ສັ້ນ because its length is unknown", () => {
    const out = resolvePipeVolumes(
      [{ item_code: "D", item_name: 'ທໍ່ສັ້ນຝາປິດກຽວ ຊ້າງ ຂະໜາດ 4" 1ຫີບ=8 ຕົວ' }],
      map
    );
    expect(out.has("D")).toBe(false);
  });

  it("keeps the first row when an item_code repeats", () => {
    const out = resolvePipeVolumes(
      [
        { item_code: "X", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ" },
        { item_code: "X", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 1/2" },
      ],
      map
    );
    expect(out.size).toBe(1);
    expect(out.get("X")!.sizeKey).toBe("in:4");
  });
});

describe("computePipeCoverage", () => {
  const items = [
    { item_code: "1", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 1/2 ຊັ້ນ 13.5 1ມັດ= 25 ເສັ້ນ", lines: "100" },
    { item_code: "2", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 8.5", lines: 50 },
    { item_code: "3", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 3 ນີ້ວ ຊັ້ນ 8.5", lines: 30 },
    { item_code: "4", item_name: 'ທໍ່ສັ້ນຝາປິດກຽວ ຊ້າງ ຂະໜາດ 4"', lines: 10 },
  ];

  it("counts resolved items and lines", () => {
    const cov = computePipeCoverage(items, map);
    expect(cov.totalItems).toBe(4);
    expect(cov.totalLines).toBe(190);
    expect(cov.resolvedItems).toBe(2);
    expect(cov.resolvedLines).toBe(150);
  });

  it("explains why each unresolved item failed, busiest first", () => {
    const cov = computePipeCoverage(items, map);
    expect(cov.unresolved).toHaveLength(2);
    expect(cov.unresolved[0].itemCode).toBe("3");
    expect(cov.unresolved[0].reason).toContain("in:3");
    expect(cov.unresolved[1].reason).toContain("ທໍ່ສັ້ນ");
  });

  it("caps the unresolved list at the requested limit", () => {
    expect(computePipeCoverage(items, map, 1).unresolved).toHaveLength(1);
  });

  it("tolerates empty input", () => {
    expect(computePipeCoverage([], map)).toMatchObject({
      totalItems: 0,
      totalLines: 0,
      resolvedItems: 0,
    });
  });
});

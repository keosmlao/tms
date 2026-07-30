import { describe, expect, it } from "vitest";
import {
  buildPackDimIndex,
  computePackCoverage,
  resolvePackVolumes,
  type PackDimRow,
} from "./pack-resolve";

// ຫີບ 2 ນີ້ວ: 40×30×25 cm = 0.03 m³ ບັນຈຸ 30 ຕົວ → 0.001 m³/ຕົວ
const MEASURED: PackDimRow[] = [
  {
    family: "ຂໍ້ງໍບາງ",
    size_key: "in:2",
    pack_unit: "ຫີບ",
    pack_qty: "30",
    width_cm: "40",
    length_cm: "30",
    height_cm: "25",
  },
  // ຫີບ 4 ນີ້ວ: 50×40×40 = 0.08 m³ ບັນຈຸ 10 ຕົວ → 0.008 m³/ຕົວ
  {
    family: "ຂໍ້ງໍບາງ",
    size_key: "in:4",
    pack_unit: "ຫີບ",
    pack_qty: "10",
    width_cm: "50",
    length_cm: "40",
    height_cm: "40",
  },
  // ສິນຄ້າຂະໜາດດຽວ — ວັດແບບ "ທຸກຂະໜາດ"
  {
    family: "ກາວໃສກາຊ້າງ 500g",
    size_key: null,
    pack_unit: "ຫີບ",
    pack_qty: "12",
    width_cm: "30",
    length_cm: "22",
    height_cm: "18",
  },
];

const index = buildPackDimIndex(MEASURED);

describe("buildPackDimIndex", () => {
  it("computes carton m³ and per-piece m³ from the box and count", () => {
    const dim = index.byKey.get("ຂໍ້ງໍບາງ|in:2")!;
    expect(dim.packM3).toBeCloseTo(0.03, 9);
    expect(dim.pieceM3).toBeCloseTo(0.001, 9);
  });

  it("indexes single-size goods under *", () => {
    expect(index.byKey.get("ກາວໃສກາຊ້າງ 500g|*")).toBeDefined();
  });

  it("groups rows by family for cross-size estimation", () => {
    expect(index.byFamily.get("ຂໍ້ງໍບາງ")).toHaveLength(2);
  });

  it("skips rows with an incomplete box", () => {
    const partial = buildPackDimIndex([
      { family: "X", size_key: "in:2", pack_unit: "ຫີບ", pack_qty: 10, width_cm: 40, length_cm: null, height_cm: 25 },
    ]);
    expect(partial.byKey.size).toBe(0);
  });

  it("keeps a row with no count but leaves pieceM3 null", () => {
    const noQty = buildPackDimIndex([
      { family: "X", size_key: "in:2", pack_unit: "ຫີບ", pack_qty: null, width_cm: 40, length_cm: 30, height_cm: 25 },
    ]);
    expect(noQty.byKey.get("X|in:2")!.pieceM3).toBeNull();
  });
});

describe("resolvePackVolumes", () => {
  it("returns per-piece m³ when the bill counts pieces", () => {
    const out = resolvePackVolumes(
      [{ item_code: "A", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ" }],
      index
    );
    const hit = out.get("A")!;
    expect(hit.source).toBe("pack_measured");
    expect(hit.perPack).toBe(false);
    expect(hit.m3).toBeCloseTo(0.001, 9);
  });

  it("returns per-carton m³ when the bill counts cartons", () => {
    const out = resolvePackVolumes(
      [{ item_code: "A", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຫີບ" }],
      index
    );
    const hit = out.get("A")!;
    expect(hit.perPack).toBe(true);
    expect(hit.m3).toBeCloseTo(0.03, 9);
  });

  it("treats ອັນ and ຕົວ alike — both are pieces, not cartons", () => {
    const asAn = resolvePackVolumes(
      [{ item_code: "A", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ອັນ" }],
      index
    );
    expect(asAn.get("A")!.m3).toBeCloseTo(0.001, 9);
  });

  it("estimates an unmeasured size from the rest of its family", () => {
    const out = resolvePackVolumes(
      [{ item_code: "B", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 3 ນີ້ວ  1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ" }],
      index
    );
    const hit = out.get("B")!;
    expect(hit.source).toBe("pack_estimated");
    // ຢູ່ລະຫວ່າງ 2" (0.001) ແລະ 4" (0.008)
    expect(hit.m3).toBeGreaterThan(0.001);
    expect(hit.m3).toBeLessThan(0.008);
    expect(hit.basedOn).toBe(2);
  });

  it("resolves single-size goods via the * row", () => {
    const out = resolvePackVolumes(
      [{ item_code: "C", item_name: "ກາວໃສກາຊ້າງ 500g 1ຫີບ= 12 ປ໋ອງ", unit_code: "ປ໋ອງ" }],
      index
    );
    const hit = out.get("C")!;
    expect(hit.source).toBe("pack_measured");
    // ບິນນັບເປັນ ປ໋ອງ ບໍ່ແມ່ນ ຫີບ → ຄືນຄ່າຕໍ່ປ໋ອງ: 0.30×0.22×0.18 ÷ 12
    expect(hit.perPack).toBe(false);
    expect(hit.m3).toBeCloseTo(0.00099, 7);
  });

  it("returns the whole carton for single-size goods when the bill counts ຫີບ", () => {
    const out = resolvePackVolumes(
      [{ item_code: "C", item_name: "ກາວໃສກາຊ້າງ 500g 1ຫີບ= 12 ປ໋ອງ", unit_code: "ຫີບ" }],
      index
    );
    expect(out.get("C")!.m3).toBeCloseTo(0.01188, 7);
  });

  it("omits a family that has nothing measured at all", () => {
    const out = resolvePackVolumes(
      [{ item_code: "D", item_name: "ສາມຕາໜາ ຊ້າງ ຂະໜາດ 1/2 1ຫີບ= 120 ຕົວ", unit_code: "ຕົວ" }],
      index
    );
    expect(out.has("D")).toBe(false);
  });

  it("omits an item whose size cannot be read even if the family is measured", () => {
    const out = resolvePackVolumes(
      [{ item_code: "E", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ພິເສດ 1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ" }],
      index
    );
    expect(out.has("E")).toBe(false);
  });

  it("keeps the first row when an item_code repeats", () => {
    const out = resolvePackVolumes(
      [
        { item_code: "A", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ" },
        { item_code: "A", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 4 ນີ້ວ 1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ" },
      ],
      index
    );
    expect(out.size).toBe(1);
    expect(out.get("A")!.m3).toBeCloseTo(0.001, 9);
  });
});

describe("computePackCoverage", () => {
  const items = [
    { item_code: "1", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ", lines: 291 },
    { item_code: "2", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 4 ນີ້ວ  1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ", lines: 227 },
    { item_code: "3", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 3 ນີ້ວ  1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ", lines: 172 },
    { item_code: "4", item_name: "ສາມຕາໜາ ຊ້າງ ຂະໜາດ 1/2  1ຫີບ= 120 ຕົວ", unit_code: "ຕົວ", lines: 484 },
  ];

  it("splits lines into measured, estimated and unknown", () => {
    const cov = computePackCoverage(items, index);
    expect(cov.totalLines).toBe(1174);
    expect(cov.measuredItems).toBe(2);
    expect(cov.measuredLines).toBe(518);
    expect(cov.estimatedItems).toBe(1);
    expect(cov.estimatedLines).toBe(172);
  });

  it("puts wholly unknown families ahead of merely estimated sizes", () => {
    const cov = computePackCoverage(items, index);
    expect(cov.worklist[0].itemCode).toBe("4");
    expect(cov.worklist[0].status).toBe("unknown");
    expect(cov.worklist[1].status).toBe("estimated");
  });

  it("reports family line totals so one carton can unlock many items", () => {
    const cov = computePackCoverage(items, index);
    const sam = cov.worklist.find((w) => w.family === "ສາມຕາໜາ")!;
    expect(sam.familyLines).toBe(484);
    const elbow = cov.worklist.find((w) => w.family === "ຂໍ້ງໍບາງ")!;
    expect(elbow.familyLines).toBe(690);
  });

  it("carries the pack count into the worklist so nobody has to re-read the name", () => {
    const cov = computePackCoverage(items, index);
    expect(cov.worklist[0]).toMatchObject({ packQty: 120, packUnit: "ຫີບ", label: '1/2"' });
  });

  it("honours the limit", () => {
    expect(computePackCoverage(items, index, 1).worklist).toHaveLength(1);
  });

  it("tolerates empty input", () => {
    expect(computePackCoverage([], index)).toMatchObject({ totalItems: 0, measuredLines: 0 });
  });
});

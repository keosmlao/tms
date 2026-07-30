import { describe, expect, it } from "vitest";
import {
  checkLengthFits,
  computeTripVolume,
  resolveItemVolumes,
  sliceByBill,
  sliceByCategory,
  UNKNOWN_LINE_LIMIT,
  type ItemVolume,
  type MasterDimRow,
} from "./trip-volume";
import type { PackDimRow } from "./pack-resolve";
import type { PipeDimRow } from "./pipe-resolve";

const PIPE_DIMS: PipeDimRow[] = [
  { size_key: "in:4", label: '4"', od_mm: "114", length_m: "4", packing_factor: "0.9" },
];

const PACK_DIMS: PackDimRow[] = [
  {
    family: "ຂໍ້ງໍບາງ",
    size_key: "in:2",
    pack_unit: "ຫີບ",
    pack_qty: 30,
    width_cm: 40,
    length_cm: 30,
    height_cm: 25,
  },
];

const MASTER_DIMS: MasterDimRow[] = [
  {
    item_code: "110101-0001",
    unit_code: "ໜ່ວຍ",
    width_cm: "87",
    length_cm: "67",
    height_cm: "183",
    weight_kg: "86.5",
  },
];

describe("resolveItemVolumes", () => {
  it("uses master data — the only truly measured source", () => {
    const out = resolveItemVolumes(
      [{ item_code: "110101-0001", item_name: "ຕູ້ເຢັນ", unit_code: "ໜ່ວຍ", qty: 1 }],
      { masterDims: MASTER_DIMS }
    );
    const hit = out.get("110101-0001")!;
    expect(hit.source).toBe("master");
    expect(hit.confidence).toBe(3);
    // 0.87 × 0.67 × 1.83 — ບໍ່ແມ່ນ 10.667 ທີ່ຄໍລັມ m3 ຂອງ DB ບອກ
    expect(hit.m3).toBeCloseTo(1.0667, 4);
    expect(hit.kg).toBeCloseTo(86.5, 4);
  });

  it("falls back to the pipe formula", () => {
    const out = resolveItemVolumes(
      [{ item_code: "P", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 8.5", unit_code: "ເສັ້ນ", qty: 1 }],
      { pipeDims: PIPE_DIMS }
    );
    expect(out.get("P")).toMatchObject({ source: "pipe_formula", confidence: 3 });
    expect(out.get("P")!.m3).toBeCloseTo(0.0467856, 6);
  });

  it("falls back to a measured carton", () => {
    const out = resolveItemVolumes(
      [{ item_code: "F", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ", qty: 1 }],
      { packDims: PACK_DIMS }
    );
    expect(out.get("F")).toMatchObject({ source: "pack_measured", confidence: 3 });
    expect(out.get("F")!.m3).toBeCloseTo(0.001, 9);
  });

  it("marks a cross-size estimate as confidence 2", () => {
    const out = resolveItemVolumes(
      [{ item_code: "E", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 4 ນີ້ວ 1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ", qty: 1 }],
      { packDims: PACK_DIMS }
    );
    expect(out.get("E")).toMatchObject({ source: "pack_estimated", confidence: 2 });
  });

  it("prefers master data over the pipe formula for the same item", () => {
    const out = resolveItemVolumes(
      [{ item_code: "X", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ", unit_code: "ເສັ້ນ", qty: 1 }],
      {
        masterDims: [
          { item_code: "X", unit_code: "ເສັ້ນ", width_cm: 12, length_cm: 400, height_cm: 12 },
        ],
        pipeDims: PIPE_DIMS,
      }
    );
    expect(out.get("X")!.source).toBe("master");
  });

  it("omits items no source can explain", () => {
    const out = resolveItemVolumes(
      [{ item_code: "Z", item_name: "ສິນຄ້າແປກ", unit_code: "ອັນ", qty: 5 }],
      { masterDims: MASTER_DIMS, pipeDims: PIPE_DIMS, packDims: PACK_DIMS }
    );
    expect(out.has("Z")).toBe(false);
  });
});

describe("computeTripVolume", () => {
  const vols = new Map<string, ItemVolume>([
    ["A", { m3: 0.05, kg: 10, source: "master", confidence: 3 }],
    ["B", { m3: 0.02, kg: null, source: "pack_estimated", confidence: 2 }],
  ]);
  const cap = { capacity_m3: "22.05", usable_m3: "17.64", payload_kg: "6000", length_cm: "500" };

  it("multiplies volume by quantity", () => {
    const out = computeTripVolume(
      [{ item_code: "A", qty: 100 }, { item_code: "B", qty: 50 }],
      vols,
      cap
    );
    expect(out.m3).toBeCloseTo(0.05 * 100 + 0.02 * 50, 9);
    expect(out.estimatedM3).toBeCloseTo(1, 9);
  });

  it("computes utilisation against usable m³, not gross capacity", () => {
    const out = computeTripVolume([{ item_code: "A", qty: 100 }], vols, cap);
    // 5 m³ ຈາກ 17.64 ໃຊ້ໄດ້ (ບໍ່ແມ່ນ 22.05 ທັງກ້ອນ)
    expect(out.utilizationPct).toBeCloseTo((5 / 17.64) * 100, 6);
  });

  it("takes the worse of volume and weight — a truck fills on either", () => {
    const heavy = new Map<string, ItemVolume>([
      ["H", { m3: 0.001, kg: 60, source: "master", confidence: 3 }],
    ]);
    const out = computeTripVolume([{ item_code: "H", qty: 100 }], heavy, cap);
    // ຄິວພຽງ 0.1/17.64 = 0.6% ແຕ່ນ້ຳໜັກ 6000/6000 = 100%
    expect(out.weightPct).toBeCloseTo(100, 6);
    expect(out.utilizationPct).toBeCloseTo(100, 6);
  });

  it("flags an overload", () => {
    const out = computeTripVolume([{ item_code: "A", qty: 400 }], vols, cap);
    expect(out.overloaded).toBe(true);
  });

  it("refuses to show a percentage when too many lines are unknown", () => {
    const out = computeTripVolume(
      [
        { item_code: "A", qty: 1 },
        { item_code: "?1", qty: 1 },
        { item_code: "?2", qty: 1 },
      ],
      vols,
      cap
    );
    expect(out.linesUnknown).toBe(2);
    expect(out.dataSufficient).toBe(false);
    expect(out.utilizationPct).toBeNull();
    // ຄິວທີ່ຄິດໄດ້ຍັງຄືນມາ — ພຽງແຕ່ບໍ່ໃຫ້ອ້າງເປັນ %
    expect(out.m3).toBeCloseTo(0.05, 9);
  });

  it("allows a percentage right at the unknown-line limit", () => {
    // 1 ໃນ 4 ແຖວ = 25% ພໍດີ → ຍັງສະແດງໄດ້
    const out = computeTripVolume(
      [
        { item_code: "A", qty: 1 },
        { item_code: "A", qty: 1 },
        { item_code: "A", qty: 1 },
        { item_code: "?", qty: 1 },
      ],
      vols,
      cap
    );
    expect(out.linesUnknown / out.lines).toBeCloseTo(UNKNOWN_LINE_LIMIT, 9);
    expect(out.dataSufficient).toBe(true);
    expect(out.utilizationPct).not.toBeNull();
  });

  it("widens the range only for the estimated part", () => {
    const out = computeTripVolume(
      [{ item_code: "A", qty: 100 }, { item_code: "B", qty: 50 }],
      vols,
      cap
    );
    // ວັດແລ້ວ 5 m³ ບໍ່ຂຶ້ນລົງ, ຄາດຄະເນ 1 m³ ເຜື່ອ ±30%
    expect(out.m3Low).toBeCloseTo(5.7, 6);
    expect(out.m3High).toBeCloseTo(6.3, 6);
  });

  it("returns no percentage when the car has no capacity set", () => {
    const out = computeTripVolume([{ item_code: "A", qty: 10 }], vols, null);
    expect(out.utilizationPct).toBeNull();
    expect(out.overloaded).toBe(false);
    expect(out.m3).toBeCloseTo(0.5, 9);
  });

  it("lists unknown items by quantity so the biggest gap is obvious", () => {
    const out = computeTripVolume(
      [
        { item_code: "?small", item_name: "ນ້ອຍ", unit_code: "ອັນ", qty: 2 },
        { item_code: "?big", item_name: "ໃຫຍ່", unit_code: "ຕົວ", qty: 90 },
      ],
      vols,
      cap
    );
    expect(out.unknownItems[0]).toMatchObject({ itemCode: "?big", qty: 90 });
  });

  it("sums repeated unknown item codes instead of listing them twice", () => {
    const out = computeTripVolume(
      [
        { item_code: "?x", item_name: "ຊ້ຳ", qty: 3 },
        { item_code: "?x", item_name: "ຊ້ຳ", qty: 4 },
      ],
      vols,
      cap
    );
    expect(out.unknownItems).toHaveLength(1);
    expect(out.unknownItems[0].qty).toBe(7);
  });

  it("handles an empty trip", () => {
    const out = computeTripVolume([], vols, cap);
    expect(out).toMatchObject({ m3: 0, lines: 0, dataSufficient: false, utilizationPct: null });
  });

  it("reports null weight when no item has a weight", () => {
    const out = computeTripVolume([{ item_code: "B", qty: 10 }], vols, cap);
    expect(out.kg).toBeNull();
    expect(out.weightPct).toBeNull();
  });
});

describe("checkLengthFits", () => {
  it("catches a 4 m pipe going into a 3 m van", () => {
    const out = checkLengthFits(4, { length_cm: "300" });
    expect(out.fits).toBe(false);
    expect(out.cargoLengthM).toBeCloseTo(3, 9);
  });

  it("passes a 4 m pipe in a 5 m six-wheeler", () => {
    expect(checkLengthFits(4, { length_cm: "500" }).fits).toBe(true);
  });

  it("passes when either side is unknown — never a false alarm", () => {
    expect(checkLengthFits(null, { length_cm: "300" }).fits).toBe(true);
    expect(checkLengthFits(4, null).fits).toBe(true);
  });
});

describe("fitting estimates (ມອກ.1131 geometry, not SCG catalogue numbers)", () => {
  const pipeDims: PipeDimRow[] = [
    { size_key: "in:0.5", label: '1/2"', od_mm: "21.5", length_m: 4, packing_factor: 0.9 },
    { size_key: "in:2", label: '2"', od_mm: "60", length_m: 4, packing_factor: 0.9 },
    { size_key: "in:4", label: '4"', od_mm: "114", length_m: 4, packing_factor: 0.9 },
  ];

  it("derives an elbow from the pipe OD when nothing else knows it", () => {
    const out = resolveItemVolumes(
      [{ item_code: "E", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ", qty: 1 }],
      { pipeDims }
    );
    const hit = out.get("E")!;
    expect(hit.source).toBe("fitting_derived");
    expect(hit.confidence).toBe(2);
    // 3.7 × 0.060³
    expect(hit.m3).toBeCloseTo(3.7 * 0.06 ** 3, 9);
  });

  it("gives a 45° elbow less volume than a 90° of the same size", () => {
    const out = resolveItemVolumes(
      [
        { item_code: "A", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ", unit_code: "ຕົວ", qty: 1 },
        { item_code: "B", item_name: "ຂໍ້ງໍບາງ 45 ຊ້າງ ຂະໜາດ 2 ນີ້ວ", unit_code: "ຕົວ", qty: 1 },
      ],
      { pipeDims }
    );
    expect(out.get("B")!.m3).toBeLessThan(out.get("A")!.m3);
  });

  it("scales with the cube of the pipe OD", () => {
    const out = resolveItemVolumes(
      [
        { item_code: "S", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 1/2", unit_code: "ຕົວ", qty: 1 },
        { item_code: "L", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 4 ນີ້ວ", unit_code: "ຕົວ", qty: 1 },
      ],
      { pipeDims }
    );
    expect(out.get("L")!.m3 / out.get("S")!.m3).toBeCloseTo((114 / 21.5) ** 3, 6);
  });

  it("returns the carton when the bill counts ຫີບ", () => {
    const out = resolveItemVolumes(
      [{ item_code: "C", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຫີບ", qty: 1 }],
      { pipeDims }
    );
    expect(out.get("C")!.m3).toBeCloseTo(3.7 * 0.06 ** 3 * 30, 9);
  });

  it("is beaten by a measured carton — the estimate never wins", () => {
    const out = resolveItemVolumes(
      [{ item_code: "M", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ", qty: 1 }],
      {
        pipeDims,
        packDims: [
          { family: "ຂໍ້ງໍບາງ", size_key: "in:2", pack_unit: "ຫີບ", pack_qty: 30,
            width_cm: 40, length_cm: 30, height_cm: 25 },
        ],
      }
    );
    expect(out.get("M")!.source).toBe("pack_measured");
  });

  it("stays silent for families it does not recognise", () => {
    const out = resolveItemVolumes(
      [{ item_code: "U", item_name: "ສິນຄ້າແປກ ຂະໜາດ 2 ນີ້ວ", unit_code: "ຕົວ", qty: 1 }],
      { pipeDims }
    );
    expect(out.has("U")).toBe(false);
  });

  it("stays silent when the size is unreadable", () => {
    const out = resolveItemVolumes(
      [{ item_code: "N", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ພິເສດ", unit_code: "ຕົວ", qty: 1 }],
      { pipeDims }
    );
    expect(out.has("N")).toBe(false);
  });

  it("counts as estimated volume in the trip total", () => {
    const items = [{ item_code: "E", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ", unit_code: "ຕົວ", qty: 100 }];
    const vols = resolveItemVolumes(items, { pipeDims });
    const trip = computeTripVolume(items, vols, { usable_m3: 17.64 });
    expect(trip.linesEstimated).toBe(1);
    expect(trip.estimatedM3).toBeCloseTo(trip.m3, 9);
    expect(trip.m3High).toBeGreaterThan(trip.m3);
  });
});

describe("sliceByBill / sliceByCategory", () => {
  const vols = new Map<string, ItemVolume>([
    ["big", { m3: 1.0, kg: null, source: "master", confidence: 3 }],
    ["small", { m3: 0.01, kg: null, source: "pipe_formula", confidence: 3 }],
  ]);
  const items = [
    { item_code: "big", bill_no: "B1", qty: 5 },      // 5.0 m³
    { item_code: "small", bill_no: "B1", qty: 100 },  // 1.0 m³
    { item_code: "small", bill_no: "B2", qty: 200 },  // 2.0 m³
    { item_code: "?", bill_no: "B2", qty: 3 },        // ບໍ່ຮູ້
  ];
  const cap = { usable_m3: 17.64 };
  const trip = computeTripVolume(items, vols, cap);
  const cats = [
    { item_code: "big", group_sub: "1101", group_sub_name: "ຕູ້ເຢັນ" },
    { item_code: "small", group_sub: "1301", group_sub_name: "ທໍ່ PVC" },
  ];

  it("splits by bill, biggest first", () => {
    const out = sliceByBill(items, vols, trip);
    expect(out[0].key).toBe("B1");
    expect(out[0].m3).toBeCloseTo(6, 9);
    expect(out[1].key).toBe("B2");
    expect(out[1].m3).toBeCloseTo(2, 9);
  });

  it("bill percentages of the truck sum to the trip percentage", () => {
    const out = sliceByBill(items, vols, trip);
    const sum = out.reduce((a, b) => a + (b.pctOfTruck ?? 0), 0);
    expect(sum).toBeCloseTo(trip.utilizationPct!, 6);
  });

  it("bill percentages of the trip sum to 100", () => {
    const out = sliceByBill(items, vols, trip);
    expect(out.reduce((a, b) => a + b.pctOfTrip, 0)).toBeCloseTo(100, 6);
  });

  it("counts unknown lines per bill so a low figure can be explained", () => {
    const out = sliceByBill(items, vols, trip);
    expect(out.find((s) => s.key === "B2")!.linesUnknown).toBe(1);
    expect(out.find((s) => s.key === "B1")!.linesUnknown).toBe(0);
  });

  it("labels bills with the customer when names are supplied", () => {
    const out = sliceByBill(items, vols, trip, new Map([["B1", "ຮ້ານ ກ"]]));
    expect(out[0].label).toBe("B1 · ຮ້ານ ກ");
  });

  it("splits by product category using the sub group", () => {
    const out = sliceByCategory(items, vols, trip, cats);
    expect(out[0]).toMatchObject({ key: "1101", label: "ຕູ້ເຢັນ" });
    expect(out[0].m3).toBeCloseTo(5, 9);
    expect(out[1]).toMatchObject({ key: "1301", label: "ທໍ່ PVC" });
    expect(out[1].m3).toBeCloseTo(3, 9);
  });

  it("buckets items with no category rather than dropping them", () => {
    const out = sliceByCategory(items, vols, trip, cats);
    const none = out.find((s) => s.key === "?")!;
    expect(none.label).toBe("(ບໍ່ມີໝວດ)");
    expect(none.linesUnknown).toBe(1);
  });

  it("category percentages of the truck also sum to the trip percentage", () => {
    const out = sliceByCategory(items, vols, trip, cats);
    const sum = out.reduce((a, b) => a + (b.pctOfTruck ?? 0), 0);
    expect(sum).toBeCloseTo(trip.utilizationPct!, 6);
  });

  it("returns pctOfTruck null when the truck capacity is unknown", () => {
    const noCap = computeTripVolume(items, vols, null);
    const out = sliceByBill(items, vols, noCap);
    expect(out[0].pctOfTruck).toBeNull();
    // ແຕ່ %ຂອງຖ້ຽວ ຍັງໃຊ້ໄດ້
    expect(out[0].pctOfTrip).toBeCloseTo(75, 6);
  });
});

describe("weight", () => {
  it("takes kg per pipe from the factory spec when present", () => {
    const out = resolveItemVolumes(
      [{ item_code: "P", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ", unit_code: "ເສັ້ນ", qty: 1 }],
      {
        pipeDims: [
          { size_key: "in:4", label: '4"', od_mm: 114, length_m: 4,
            packing_factor: 0.9, weight_kg: "6.8" },
        ],
      }
    );
    expect(out.get("P")!.kg).toBeCloseTo(6.8, 6);
  });

  it("leaves kg null when the pipe spec has no weight", () => {
    const out = resolveItemVolumes(
      [{ item_code: "P", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ", unit_code: "ເສັ້ນ", qty: 1 }],
      { pipeDims: [{ size_key: "in:4", label: '4"', od_mm: 114, length_m: 4, packing_factor: 0.9 }] }
    );
    expect(out.get("P")!.kg).toBeNull();
  });

  it("derives kg per piece from a measured carton weight", () => {
    const out = resolveItemVolumes(
      [{ item_code: "F", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຕົວ", qty: 1 }],
      {
        packDims: [
          { family: "ຂໍ້ງໍບາງ", size_key: "in:2", pack_unit: "ຫີບ", pack_qty: 30,
            width_cm: 40, length_cm: 30, height_cm: 25, weight_kg: 15 },
        ],
      }
    );
    expect(out.get("F")!.kg).toBeCloseTo(0.5, 6); // 15 kg ÷ 30 ຕົວ
  });

  it("returns the whole carton weight when the bill counts ຫີບ", () => {
    const out = resolveItemVolumes(
      [{ item_code: "F", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ", unit_code: "ຫີບ", qty: 1 }],
      {
        packDims: [
          { family: "ຂໍ້ງໍບາງ", size_key: "in:2", pack_unit: "ຫີບ", pack_qty: 30,
            width_cm: 40, length_cm: 30, height_cm: 25, weight_kg: 15 },
        ],
      }
    );
    expect(out.get("F")!.kg).toBeCloseTo(15, 6);
  });

  it("never guesses a weight for a cross-size estimate", () => {
    const out = resolveItemVolumes(
      [{ item_code: "E", item_name: "ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 4 ນີ້ວ 1ຫີບ= 10 ຕົວ", unit_code: "ຕົວ", qty: 1 }],
      {
        packDims: [
          { family: "ຂໍ້ງໍບາງ", size_key: "in:2", pack_unit: "ຫີບ", pack_qty: 30,
            width_cm: 40, length_cm: 30, height_cm: 25, weight_kg: 15 },
        ],
      }
    );
    expect(out.get("E")!.source).toBe("pack_estimated");
    expect(out.get("E")!.kg).toBeNull();
  });

  it("triggers the weight warning once real kg exists", () => {
    const items = [{ item_code: "P", item_name: "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ", unit_code: "ເສັ້ນ", qty: 1000 }];
    const vols = resolveItemVolumes(items, {
      pipeDims: [
        { size_key: "in:4", label: '4"', od_mm: 114, length_m: 4, packing_factor: 0.9, weight_kg: 6.8 },
      ],
    });
    const trip = computeTripVolume(items, vols, { usable_m3: 100, payload_kg: 6000 });
    expect(trip.kg).toBeCloseTo(6800, 3);
    expect(trip.weightPct).toBeCloseTo(113.33, 1);
    // ນ້ຳໜັກເກີນກ່ອນຄິວ → ຕ້ອງເປັນຕົວກຳນົດ
    expect(trip.utilizationPct).toBeCloseTo(113.33, 1);
    expect(trip.overloaded).toBe(true);
  });
});

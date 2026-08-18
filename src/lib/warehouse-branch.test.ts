import { describe, expect, it } from "vitest";
import {
  suggestTransportForBranchStock,
  groupRemainingItemsByWarehouse,
  planBranchLegs,
  branchLegBillNo,
  type BranchLegLine,
  type RemainingWarehouseRow,
} from "./warehouse-branch";

describe("suggestTransportForBranchStock", () => {
  it("maps each known stock branch to its delivery branch", () => {
    expect(suggestTransportForBranchStock("01")).toBe("02-0001"); // ຂົວຫຼວງ
    expect(suggestTransportForBranchStock("03")).toBe("02-0002"); // ດອນຕິ້ວ
    expect(suggestTransportForBranchStock("02")).toBe("02-0007"); // ໂພນສະອາດ
    expect(suggestTransportForBranchStock("04")).toBe("02-0003"); // ປາກເຊ
  });

  it("trims whitespace before matching", () => {
    expect(suggestTransportForBranchStock(" 03 ")).toBe("02-0002");
  });

  it("returns empty string for unknown / blank / nullish input", () => {
    expect(suggestTransportForBranchStock("99")).toBe("");
    expect(suggestTransportForBranchStock("")).toBe("");
    expect(suggestTransportForBranchStock(null)).toBe("");
    expect(suggestTransportForBranchStock(undefined)).toBe("");
  });
});

describe("groupRemainingItemsByWarehouse", () => {
  const rows: RemainingWarehouseRow[] = [
    // ຂົວຫຼວງ warehouse (branch_stock 01)
    {
      wh_code: "1103",
      wh_name: "ສາງຂົວຫຼວງ 3",
      branch_stock: "01",
      item_code: "A1",
      item_name: "item A",
      unit_code: "ເສັ້ນ",
      erp_qty: "10",
      placed_qty: "0",
      remaining_qty: "10",
    },
    // ດອນຕິ້ວ warehouse (branch_stock 03), two lines
    {
      wh_code: "1204",
      wh_name: "ສາງດອນຕິ້ວ 4",
      branch_stock: "03",
      item_code: "B1",
      item_name: "item B1",
      unit_code: "ອັນ",
      erp_qty: "5",
      placed_qty: "2",
      remaining_qty: "3",
    },
    {
      wh_code: "1204",
      wh_name: "ສາງດອນຕິ້ວ 4",
      branch_stock: "03",
      item_code: "B2",
      item_name: "item B2",
      unit_code: "ອັນ",
      erp_qty: "4",
      placed_qty: "0",
      remaining_qty: "4",
    },
  ];

  it("folds rows into one group per warehouse in first-seen order", () => {
    const groups = groupRemainingItemsByWarehouse(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].wh_code).toBe("1103");
    expect(groups[1].wh_code).toBe("1204");
    expect(groups[1].items).toHaveLength(2);
  });

  it("attaches the suggested delivery branch per warehouse", () => {
    const [khuaLuang, donTiw] = groupRemainingItemsByWarehouse(rows);
    expect(khuaLuang.suggested_transport_code).toBe("02-0001");
    expect(donTiw.suggested_transport_code).toBe("02-0002");
  });

  it("sums remaining_qty per warehouse and coerces numeric strings", () => {
    const [khuaLuang, donTiw] = groupRemainingItemsByWarehouse(rows);
    expect(khuaLuang.remaining_qty_total).toBe(10);
    expect(donTiw.remaining_qty_total).toBe(7); // 3 + 4
    expect(donTiw.items[0].placed_qty).toBe(2);
    expect(donTiw.items[0].remaining_qty).toBe(3);
  });

  it("returns an empty array for no rows", () => {
    expect(groupRemainingItemsByWarehouse([])).toEqual([]);
  });
});

describe("planBranchLegs", () => {
  const line = (over: Partial<BranchLegLine>): BranchLegLine => ({
    doc_no: "SB001",
    home_transport_code: "02-0001",
    wh_code: "1103",
    wh_name: "ສາງຂົວຫຼວງ 3",
    branch_stock: "01",
    item_code: "A1",
    item_name: "item A",
    unit_code: "ເສັ້ນ",
    erp_qty: 10,
    placed_qty: 0,
    returned_qty: 0,
    ...over,
  });

  it("splits the foreign-branch warehouse off a 2-branch bill, keeps the home warehouse", () => {
    const plans = planBranchLegs([
      line({}),
      line({ wh_code: "3101", wh_name: "ສາງດອນຕິ້ວ", branch_stock: "03", item_code: "B1", item_name: "item B", erp_qty: 3 }),
    ]);
    expect(plans).toEqual([
      {
        parent_bill_no: "SB001",
        transport_code: "02-0002",
        wh_labels: ["ສາງດອນຕິ້ວ"],
        items: [{ item_code: "B1", item_name: "item B", unit_code: "ເສັ້ນ", qty: 3 }],
      },
    ]);
  });

  it("does nothing for a single-warehouse bill or when every warehouse is the home branch", () => {
    expect(planBranchLegs([line({})])).toEqual([]);
    expect(
      planBranchLegs([line({}), line({ wh_code: "1104", wh_name: "ສາງຂົວຫຼວງ 4", item_code: "A2" })])
    ).toEqual([]);
  });

  it("leaves a bill alone when its items sit in ONE foreign warehouse (forward flow, not a split)", () => {
    expect(
      planBranchLegs([
        line({ wh_code: "3101", branch_stock: "03", item_code: "B1" }),
        line({ wh_code: "3102", branch_stock: "03", item_code: "B2" }),
      ])
    ).toEqual([]);
  });

  it("gives every foreign branch its own leg when the home branch holds part of the bill", () => {
    const plans = planBranchLegs([
      line({}),
      line({ wh_code: "3101", wh_name: "ດອນຕິ້ວ", branch_stock: "03", item_code: "B1" }),
      line({ wh_code: "4101", wh_name: "ປາກເຊ", branch_stock: "04", item_code: "C1", erp_qty: 2 }),
    ]);
    expect(plans.map((p) => p.transport_code).sort()).toEqual(["02-0002", "02-0003"]);
  });

  it("leaves a bill alone when the home branch holds NOTHING (pure forward case, even across 2 foreign branches)", () => {
    expect(
      planBranchLegs([
        line({ wh_code: "3101", branch_stock: "03", item_code: "B1" }),
        line({ wh_code: "4101", branch_stock: "04", item_code: "C1" }),
      ])
    ).toEqual([]);
  });

  it("treats an unmapped or non-queue warehouse as the home branch (never strands goods)", () => {
    // 02 ໂພນສະອາດ maps to 02-0007, which has no dispatch queue → stays home.
    expect(
      planBranchLegs([
        line({}),
        line({ wh_code: "2101", branch_stock: "02", item_code: "P1" }),
        line({ wh_code: "9999", branch_stock: "", item_code: "X1" }),
      ])
    ).toEqual([]);
    // …and it counts AS home when deciding whether the bill spans 2 branches:
    // ໂພນສະອາດ goods stay with the home branch, ດອນຕິ້ວ goods get their leg.
    const plans = planBranchLegs([
      line({ wh_code: "2101", branch_stock: "02", item_code: "P1" }),
      line({ wh_code: "3101", wh_name: "ດອນຕິ້ວ", branch_stock: "03", item_code: "B1" }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].transport_code).toBe("02-0002");
    expect(plans[0].items.map((i) => i.item_code)).toEqual(["B1"]);
  });

  it("nets out placed + returned qty and drops legs with nothing left", () => {
    const plans = planBranchLegs([
      line({}),
      line({ wh_code: "3101", branch_stock: "03", item_code: "B1", erp_qty: 5, placed_qty: 2, returned_qty: 1 }),
      line({ wh_code: "3101", branch_stock: "03", item_code: "B2", erp_qty: 4, placed_qty: 4 }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].items).toEqual([{ item_code: "B1", item_name: "item A", unit_code: "ເສັ້ນ", qty: 2 }]);
    expect(
      planBranchLegs([
        line({}),
        line({ wh_code: "3101", branch_stock: "03", item_code: "B1", erp_qty: 4, placed_qty: 4 }),
      ])
    ).toEqual([]);
  });

  it("attributes placed qty to the HOME warehouse first when one item sits in both warehouses", () => {
    // 5 at home + 6 at ດອນຕິ້ວ of the same item; the home branch already
    // dispatched 5 → all 5 come off the home line, the leg keeps its full 6.
    const plans = planBranchLegs([
      line({ item_code: "X", erp_qty: 5, placed_qty: 5 }),
      line({ wh_code: "1201", wh_name: "ດອນຕິ້ວ", branch_stock: "03", item_code: "X", erp_qty: 6, placed_qty: 5 }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].items).toEqual([{ item_code: "X", item_name: "item A", unit_code: "ເສັ້ນ", qty: 6 }]);
    // 8 placed → home absorbs 5, the leg loses 3 → keeps 3.
    const over = planBranchLegs([
      line({ item_code: "X", erp_qty: 5, placed_qty: 8 }),
      line({ wh_code: "1201", branch_stock: "03", item_code: "X", erp_qty: 6, placed_qty: 8 }),
    ]);
    expect(over[0].items[0].qty).toBe(3);
  });

  it("folds two foreign warehouses of the same branch into one leg and sums a repeated item", () => {
    const plans = planBranchLegs([
      line({}),
      line({ wh_code: "3101", wh_name: "ດອນຕິ້ວ 1", branch_stock: "03", item_code: "B1", erp_qty: 2 }),
      line({ wh_code: "3102", wh_name: "ດອນຕິ້ວ 2", branch_stock: "03", item_code: "B1", erp_qty: 3 }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].wh_labels).toEqual(["ດອນຕິ້ວ 1", "ດອນຕິ້ວ 2"]);
    expect(plans[0].items).toEqual([{ item_code: "B1", item_name: "item A", unit_code: "ເສັ້ນ", qty: 5 }]);
  });

  it("plans several bills independently", () => {
    const plans = planBranchLegs([
      line({ doc_no: "SB001" }),
      line({ doc_no: "SB001", wh_code: "3101", branch_stock: "03", item_code: "B1" }),
      line({ doc_no: "SB002", home_transport_code: "02-0002", wh_code: "3101", branch_stock: "03" }),
      line({ doc_no: "SB002", home_transport_code: "02-0002", wh_code: "1103", branch_stock: "01", item_code: "A9" }),
    ]);
    expect(plans.map((p) => [p.parent_bill_no, p.transport_code])).toEqual([
      ["SB001", "02-0002"],
      ["SB002", "02-0001"],
    ]);
  });
});

describe("branchLegBillNo", () => {
  it("is the parent bill + '#' + branch, trimmed", () => {
    expect(branchLegBillNo(" SB001 ", "02-0002 ")).toBe("SB001#02-0002");
  });
});

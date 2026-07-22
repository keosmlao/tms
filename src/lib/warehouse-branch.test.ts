import { describe, expect, it } from "vitest";
import {
  suggestTransportForBranchStock,
  groupRemainingItemsByWarehouse,
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

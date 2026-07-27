import { describe, expect, it } from "vitest";
import { computePickupVariance, describePickupVariance } from "./pickup-variance";

const planned = [
  { item_code: "A1", item_name: "ທໍ່ PVC", unit_code: "ເສັ້ນ", selected_qty: 10 },
  { item_code: "B2", item_name: "ຂໍ້ຕໍ່", unit_code: "ອັນ", selected_qty: 4 },
];

describe("computePickupVariance", () => {
  it("reports nothing when the app sends no items", () => {
    const result = computePickupVariance(planned, []);
    expect(result.hasVariance).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.plannedTotal).toBe(14);
    expect(result.actualTotal).toBe(14);
  });

  it("reports nothing when every reported qty matches the trip", () => {
    const result = computePickupVariance(planned, [
      { item_code: "A1", qty: 10 },
      { item_code: "B2", qty: 4 },
    ]);
    expect(result.hasVariance).toBe(false);
    expect(result.actualTotal).toBe(14);
  });

  it("flags a short pickup and keeps unreported lines as planned", () => {
    const result = computePickupVariance(planned, [{ item_code: "A1", qty: 7 }]);
    expect(result.hasVariance).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      item_code: "A1",
      planned_qty: 10,
      actual_qty: 7,
      diff_qty: -3,
      over_reported: false,
    });
    // B2 was not mentioned → still counted at its planned 4.
    expect(result.actualTotal).toBe(11);
  });

  it("clamps a surplus to the planned qty and flags it", () => {
    const result = computePickupVariance(planned, [{ item_code: "B2", qty: 9 }]);
    expect(result.lines[0]).toMatchObject({
      item_code: "B2",
      planned_qty: 4,
      reported_qty: 9,
      actual_qty: 4,
      diff_qty: 0,
      over_reported: true,
    });
    expect(result.actualTotal).toBe(14);
  });

  it("sums duplicate reported lines for the same item", () => {
    const result = computePickupVariance(planned, [
      { item_code: "A1", qty: 3 },
      { item_code: "A1", qty: 4 },
    ]);
    expect(result.lines[0].reported_qty).toBe(7);
    expect(result.lines[0].actual_qty).toBe(7);
  });

  it("marks a pickup where nothing at all was received", () => {
    const result = computePickupVariance(planned, [
      { item_code: "A1", qty: 0 },
      { item_code: "B2", qty: 0 },
    ]);
    expect(result.emptyPickup).toBe(true);
    expect(result.actualTotal).toBe(0);
  });

  it("is not an empty pickup when something remains", () => {
    const result = computePickupVariance(planned, [{ item_code: "A1", qty: 0 }]);
    expect(result.emptyPickup).toBe(false);
    expect(result.actualTotal).toBe(4);
  });

  it("treats negative / non-numeric reports as zero and ignores blank codes", () => {
    const result = computePickupVariance(planned, [
      { item_code: "A1", qty: -5 },
      { item_code: "  ", qty: 99 },
      { item_code: "B2", qty: Number.NaN },
    ]);
    expect(result.actualTotal).toBe(0);
    expect(result.lines.map((l) => l.item_code)).toEqual(["A1", "B2"]);
  });

  it("ignores reported items that are not on the trip", () => {
    const result = computePickupVariance(planned, [{ item_code: "ZZ", qty: 5 }]);
    expect(result.hasVariance).toBe(false);
    expect(result.actualTotal).toBe(14);
  });

  it("summarises shortfalls and surpluses in Lao", () => {
    const result = computePickupVariance(planned, [
      { item_code: "A1", qty: 7 },
      { item_code: "B2", qty: 9 },
    ]);
    const text = describePickupVariance(result);
    expect(text).toContain("ຂາດ 3");
    expect(text).toContain("ເກີນ 1");
  });
});

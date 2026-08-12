import { describe, expect, it } from "vitest";
import {
  MAX_PLAUSIBLE_LITERS,
  clampFuelPercent,
  describeFuelEntryProblem,
  isPlausibleLiters,
} from "./fuel-sanity";

describe("isPlausibleLiters", () => {
  it("accepts real refills", () => {
    for (const l of [24.7, 61.74, 300, MAX_PLAUSIBLE_LITERS]) {
      expect(isPlausibleLiters(l)).toBe(true);
    }
  });

  it("rejects the kip amounts found in odg_tms_fuel_log", () => {
    // Real rows: 2026-04-27 car 3651, and 2026-07-02 car ກບ 3651.
    for (const l of [62_940, 60_435, 37_810]) {
      expect(isPlausibleLiters(l)).toBe(false);
    }
  });

  it("rejects junk and zero", () => {
    for (const l of [0, -5, null, undefined, "", "abc", NaN]) {
      expect(isPlausibleLiters(l)).toBe(false);
    }
  });
});

describe("clampFuelPercent", () => {
  it("keeps real readings, including the boundaries", () => {
    // Live values seen 2026-08-12: ກນ4458 at 8%, ກຮ6264 at 85%.
    for (const p of [0, 8, 85, 100]) expect(clampFuelPercent(p)).toBe(p);
    expect(clampFuelPercent("42")).toBe(42);
  });

  it("drops readings from cars with no fuel probe", () => {
    // Raw ADC counts and negatives — not percentages.
    for (const p of [-1, 101, 3200, "abc", "", null, undefined]) {
      expect(clampFuelPercent(p)).toBeNull();
    }
  });

  it("keeps 0 rather than turning an empty tank into no-reading", () => {
    expect(clampFuelPercent(0)).toBe(0);
    expect(clampFuelPercent("0")).toBe(0);
  });
});

describe("describeFuelEntryProblem", () => {
  it("passes a normal refill", () => {
    // 61.74 L for 2,000,000 kip = 32,394 kip/L — a real 2026-08-01 row.
    expect(describeFuelEntryProblem(61.74, 2_000_000)).toBeNull();
  });

  it("passes an amount-only entry", () => {
    expect(describeFuelEntryProblem(0, 500_000)).toBeNull();
    expect(describeFuelEntryProblem(null, 500_000)).toBeNull();
  });

  it("points at the amount field when litres hold kip", () => {
    const msg = describeFuelEntryProblem(62_940, 285_000);
    expect(msg).toContain("ຈຳນວນເງິນ");
  });

  it("catches a swap the bounds alone miss", () => {
    // 300 in both boxes: within the litre bounds, but 1,000 kip/L is impossible.
    const msg = describeFuelEntryProblem(300, 300_000);
    expect(msg).toContain("ກີບ/ລິດ");
  });

  it("does not flag a plausible price", () => {
    expect(describeFuelEntryProblem(50, 1_400_000)).toBeNull();
  });
});

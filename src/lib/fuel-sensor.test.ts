import { describe, expect, it } from "vitest";
import {
  calibrateLitersPerPercent,
  pairRefillsWithSensor,
  sensorKmPerLiter,
  splitFuelMovements,
  type FuelPoint,
} from "./fuel-sensor";

const at = (h: number) => `2026-08-10 ${String(h).padStart(2, "0")}`;
const series = (...pcts: number[]): FuelPoint[] =>
  pcts.map((pct, i) => ({ at: at(i), pct }));

describe("splitFuelMovements", () => {
  it("measures a plain drain end to end", () => {
    const m = splitFuelMovements(series(80, 70, 60, 50));
    expect(m.consumedPct).toBe(30);
    expect(m.refilledPct).toBe(0);
    expect(m.refills).toHaveLength(0);
  });

  it("does NOT double-count sloshing on the way down", () => {
    // Net drop is 80 → 60. Summing every negative step would give 26.
    const m = splitFuelMovements(series(80, 78, 79, 74, 76, 70, 71, 60));
    expect(m.consumedPct).toBe(20);
  });

  it("splits at a refill and counts each segment separately", () => {
    // 80 → 40 (used 40), refill to 90, then 90 → 55 (used 35).
    const m = splitFuelMovements(series(80, 60, 40, 90, 70, 55));
    expect(m.consumedPct).toBe(75);
    expect(m.refilledPct).toBe(50);
    expect(m.refills).toHaveLength(1);
    expect(m.refills[0].risePct).toBe(50);
  });

  it("ignores a rise too small to be a refill", () => {
    const m = splitFuelMovements(series(50, 48, 50, 45));
    expect(m.refills).toHaveLength(0);
    expect(m.consumedPct).toBe(5);
  });

  it("treats a full tank swap with no driving as zero consumption", () => {
    const m = splitFuelMovements(series(20, 20, 95, 95));
    expect(m.consumedPct).toBe(0);
    expect(m.refilledPct).toBe(75);
  });

  it("handles an empty or single-point series", () => {
    expect(splitFuelMovements([]).consumedPct).toBe(0);
    expect(splitFuelMovements(series(42)).consumedPct).toBe(0);
  });
});

describe("pairRefillsWithSensor", () => {
  it("matches a receipt to the same day's sensor rise", () => {
    const receipts = new Map([["2026-08-10", 60]]);
    const pairs = pairRefillsWithSensor(receipts, [
      { at: "2026-08-10 09", risePct: 40 },
    ]);
    expect(pairs).toEqual([{ liters: 60, risePct: 40 }]);
  });

  it("adds two rises on one day before pairing", () => {
    const receipts = new Map([["2026-08-10", 60]]);
    const pairs = pairRefillsWithSensor(receipts, [
      { at: "2026-08-10 09", risePct: 20 },
      { at: "2026-08-10 17", risePct: 20 },
    ]);
    expect(pairs).toEqual([{ liters: 60, risePct: 40 }]);
  });

  it("drops a receipt the sensor never saw", () => {
    const receipts = new Map([["2026-08-11", 60]]);
    expect(
      pairRefillsWithSensor(receipts, [{ at: "2026-08-10 09", risePct: 40 }])
    ).toEqual([]);
  });
});

describe("calibrateLitersPerPercent", () => {
  it("derives tank size from litres against percent", () => {
    // 60 L raised the gauge 40% → 1.5 L per 1% → a 150 L tank.
    expect(calibrateLitersPerPercent([{ liters: 60, risePct: 40 }])).toBe(1.5);
  });

  it("takes the median so one mismatched receipt cannot drag it", () => {
    const pairs = [
      { liters: 60, risePct: 40 }, // 1.5
      { liters: 62, risePct: 40 }, // 1.55
      { liters: 400, risePct: 45 }, // 8.9 — wrong day, way off
    ];
    expect(calibrateLitersPerPercent(pairs)).toBe(1.55);
  });

  it("rejects ratios outside any real tank", () => {
    expect(calibrateLitersPerPercent([{ liters: 5000, risePct: 40 }])).toBeNull();
    expect(calibrateLitersPerPercent([{ liters: 4, risePct: 40 }])).toBeNull();
  });

  it("ignores a rise too small to be a refill", () => {
    expect(calibrateLitersPerPercent([{ liters: 60, risePct: 1 }])).toBeNull();
  });

  it("returns null with nothing to go on", () => {
    expect(calibrateLitersPerPercent([])).toBeNull();
  });
});

describe("sensorKmPerLiter", () => {
  it("divides distance by the litres the gauge says were burnt", () => {
    // 212% of a 1.61 L/% tank = 341 L; 1670 km → 4.89 km/L (ບຄ 0063, real).
    expect(sensorKmPerLiter(1670, 212, 1.61)).toBeCloseTo(4.89, 2);
  });

  it("is null when the tank was never calibrated", () => {
    expect(sensorKmPerLiter(1000, 100, null)).toBeNull();
  });

  it("is null when the gauge never moved", () => {
    expect(sensorKmPerLiter(1000, 0, 1.5)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  fleetFuelStats,
  fuelStatsForCar,
  indexFuelByCar,
  type FuelByCar,
} from "./fuel-efficiency";

const fuel: FuelByCar[] = [
  { car_code: "C001", liters: 100, amount: 2_000_000, refills: 4 },
  { car_code: "ບຈ1857", liters: 50, amount: 1_000_000, refills: 2 },
];

describe("indexFuelByCar", () => {
  it("keys rows case-insensitively and trims", () => {
    const index = indexFuelByCar([
      { car_code: "  c001 ", liters: 10, amount: 100, refills: 1 },
    ]);
    expect(index.get("C001")?.liters).toBe(10);
  });

  it("adds duplicate keys instead of overwriting", () => {
    const index = indexFuelByCar([
      { car_code: "C001", liters: 10, amount: 100, refills: 1 },
      { car_code: "c001", liters: 5, amount: 50, refills: 2 },
    ]);
    expect(index.get("C001")).toMatchObject({ liters: 15, amount: 150, refills: 3 });
  });

  it("drops rows with a blank car", () => {
    expect(indexFuelByCar([{ car_code: "  ", liters: 9, amount: 9, refills: 1 }]).size).toBe(0);
  });
});

describe("fuelStatsForCar", () => {
  const index = indexFuelByCar(fuel);

  it("computes km/L and cost/km from the code match", () => {
    const stats = fuelStatsForCar(
      { car_code: "C001", car_name: "ບຈ 0001", distance_km: 850 },
      index
    );
    expect(stats.liters).toBe(100);
    expect(stats.km_per_liter).toBeCloseTo(8.5, 6);
    expect(stats.cost_per_km).toBeCloseTo(2_000_000 / 850, 6);
  });

  it("falls back to the plate when the refill never resolved to a code", () => {
    const stats = fuelStatsForCar(
      { car_code: "C999", car_name: "ບຈ1857", distance_km: 500 },
      index
    );
    expect(stats.liters).toBe(50);
    expect(stats.km_per_liter).toBeCloseTo(10, 6);
  });

  it("adds code-keyed and plate-keyed refills for the same car", () => {
    const split = indexFuelByCar([
      { car_code: "C001", liters: 60, amount: 600, refills: 2 },
      { car_code: "ບຈ1857", liters: 40, amount: 400, refills: 1 },
    ]);
    const stats = fuelStatsForCar(
      { car_code: "C001", car_name: "ບຈ1857", distance_km: 1000 },
      split
    );
    expect(stats.liters).toBe(100);
    expect(stats.refills).toBe(3);
    expect(stats.km_per_liter).toBeCloseTo(10, 6);
  });

  it("counts a car whose code equals its name only once", () => {
    const index2 = indexFuelByCar([
      { car_code: "ບຈ1857", liters: 50, amount: 500, refills: 2 },
    ]);
    const stats = fuelStatsForCar(
      { car_code: "ບຈ1857", car_name: "ບຈ1857", distance_km: 500 },
      index2
    );
    expect(stats.liters).toBe(50);
  });

  it("returns null km/L (not 0) when no refill is logged", () => {
    const stats = fuelStatsForCar({ car_code: "NOPE", distance_km: 400 }, index);
    expect(stats.liters).toBe(0);
    expect(stats.km_per_liter).toBeNull();
    expect(stats.cost_per_km).toBeNull();
  });

  it("reports 0 km/L when liters were logged but the car never moved", () => {
    const stats = fuelStatsForCar({ car_code: "C001", distance_km: 0 }, index);
    expect(stats.km_per_liter).toBe(0);
    expect(stats.cost_per_km).toBeNull();
  });
});

describe("fleetFuelStats", () => {
  it("ignores the distance of cars with no refills", () => {
    const index = indexFuelByCar(fuel);
    const rows = [
      { car_code: "C001", distance_km: 850 },
      { car_code: "NOFUEL", distance_km: 5000 },
    ].map((c) => ({ ...c, ...fuelStatsForCar(c, index) }));

    const totals = fleetFuelStats(rows);
    expect(totals.cars).toBe(1);
    expect(totals.distance).toBe(850);
    expect(totals.liters).toBe(100);
    expect(totals.kmPerLiter).toBeCloseTo(8.5, 6);
  });

  it("is null when nothing was refilled", () => {
    const totals = fleetFuelStats([
      { car_code: "A", distance_km: 100, liters: 0, fuel_amount: 0, refills: 0, km_per_liter: null, cost_per_km: null },
    ]);
    expect(totals.kmPerLiter).toBeNull();
    expect(totals.costPerKm).toBeNull();
    expect(totals.cars).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { haversineMeters, parseCoord, checkWithinRadius } from "./geo";

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters(17.9757, 102.6331, 17.9757, 102.6331)).toBe(0);
  });

  it("approximates 1° of latitude as ~111 km", () => {
    const d = haversineMeters(17, 102, 18, 102);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("measures a short hop within a few percent", () => {
    // ~0.0009° lng at this latitude ≈ 95 m; assert a sane band.
    const d = haversineMeters(17.9757, 102.6331, 17.9757, 102.6340);
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(105);
  });
});

describe("parseCoord", () => {
  it("parses numeric strings and numbers", () => {
    expect(parseCoord("17.9757")).toBeCloseTo(17.9757);
    expect(parseCoord(102.6331)).toBeCloseTo(102.6331);
    expect(parseCoord(" -17.1 ")).toBeCloseTo(-17.1);
  });
  it("returns null for missing or invalid values", () => {
    expect(parseCoord(null)).toBeNull();
    expect(parseCoord("")).toBeNull();
    expect(parseCoord("abc")).toBeNull();
    expect(parseCoord(undefined)).toBeNull();
  });
});

describe("checkWithinRadius", () => {
  it("passes a point at the exact target", () => {
    const r = checkWithinRadius("17.9757", "102.6331", "17.9757", "102.6331", 50);
    expect(r.ok).toBe(true);
    expect(r.distance).toBe(0);
  });

  it("passes a point just inside the radius", () => {
    // ~30 m north of target, radius 50 m → inside.
    const r = checkWithinRadius(17.975973, 102.6331, "17.9757", "102.6331", 50);
    expect(r.ok).toBe(true);
    expect(r.distance!).toBeLessThan(50);
  });

  it("blocks a point outside the radius", () => {
    const r = checkWithinRadius("17.9800", "102.6331", "17.9757", "102.6331", 50);
    expect(r.ok).toBe(false);
    expect(r.distance!).toBeGreaterThan(50);
  });

  it("reports distance null when a coordinate is missing", () => {
    expect(checkWithinRadius("", "102.6", "17.9", "102.6", 50)).toEqual({
      ok: false,
      distance: null,
    });
    expect(checkWithinRadius("17.9", "102.6", null, "102.6", 50).distance).toBeNull();
  });
});

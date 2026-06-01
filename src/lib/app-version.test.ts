import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion } from "./version-compare";

describe("parseVersion", () => {
  it("splits dotted versions into numeric segments", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("tolerates build/pre-release suffixes", () => {
    expect(parseVersion("1.2.3+45")).toEqual([1, 2, 3, 45]);
    expect(parseVersion("1.2.3-beta")).toEqual([1, 2, 3]);
  });

  it("returns empty for blank/garbage input", () => {
    expect(parseVersion("")).toEqual([]);
    expect(parseVersion("   ")).toEqual([]);
    expect(parseVersion("abc")).toEqual([]);
  });
});

describe("compareVersions", () => {
  it("orders by each numeric segment", () => {
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
    expect(compareVersions("1.3.0", "1.2.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("treats equal versions as 0, including padding", () => {
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("compares numerically, not lexicographically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
  });

  it("a missing/blank current version is below any real minimum", () => {
    expect(compareVersions("", "1.0.0")).toBe(-1);
  });
});

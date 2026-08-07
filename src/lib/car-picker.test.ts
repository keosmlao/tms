import { describe, expect, it } from "vitest";
import {
  dispatchableCars,
  isDeliveryVehicle,
  isUnassignedToBranch,
  matchesCarSearch,
  type CarOption,
} from "./car-picker";

const FORKLIFT: CarOption = {
  code: "0000",
  name_1: "Forklift",
  car_type: "",
  transport_code: "01",
  is_delivery: false,
};
const TRUCK_VTE: CarOption = {
  code: "6830",
  name_1: "ISUZU 6 ລໍ້ ບກ 6830",
  car_type: "ລົດ 6 ລໍ້",
  transport_code: "01",
  is_delivery: true,
};
const TRUCK_PAKSE: CarOption = {
  code: "8597",
  name_1: "HYUNDAI ກຈ 8597",
  car_type: "ລົດ 10 ລໍ້",
  transport_code: "02",
  is_delivery: true,
};
const TRUCK_NO_BRANCH: CarOption = {
  code: "0364",
  name_1: "ກຍ 0364",
  car_type: "ລົດກະບະ",
  transport_code: "",
  is_delivery: true,
};

const FLEET = [FORKLIFT, TRUCK_VTE, TRUCK_PAKSE, TRUCK_NO_BRANCH];

describe("isDeliveryVehicle", () => {
  it("rejects yard equipment with no vehicle class", () => {
    expect(isDeliveryVehicle(FORKLIFT)).toBe(false);
  });

  it("accepts a classified truck", () => {
    expect(isDeliveryVehicle(TRUCK_VTE)).toBe(true);
  });

  it("keeps rows from an API that predates the flag", () => {
    // Better one stray forklift than an empty dropdown mid-dispatch.
    expect(isDeliveryVehicle({ code: "x", name_1: "old" })).toBe(true);
  });
});

describe("dispatchableCars", () => {
  it("drops equipment and other branches' trucks", () => {
    expect(dispatchableCars(FLEET, "01").map((c) => c.code)).toEqual([
      "6830",
      "0364",
    ]);
  });

  it("keeps vehicles with no branch on record", () => {
    // They are real trucks; the fix belongs on the vehicle page, and hiding
    // them here would make them silently unbookable.
    expect(dispatchableCars(FLEET, "02").map((c) => c.code)).toEqual([
      "8597",
      "0364",
    ]);
  });

  it("offers every dispatchable vehicle before a branch is chosen", () => {
    expect(dispatchableCars(FLEET, "").map((c) => c.code)).toEqual([
      "6830",
      "8597",
      "0364",
    ]);
  });

  it("ignores whitespace around the branch code", () => {
    expect(dispatchableCars(FLEET, "  01  ").map((c) => c.code)).toEqual([
      "6830",
      "0364",
    ]);
  });

  it("returns nothing when a branch has no vehicles at all", () => {
    expect(dispatchableCars([FORKLIFT, TRUCK_PAKSE], "01")).toEqual([]);
  });
});

describe("isUnassignedToBranch", () => {
  it("flags only the vehicles with no branch", () => {
    expect(isUnassignedToBranch(TRUCK_NO_BRANCH)).toBe(true);
    expect(isUnassignedToBranch(TRUCK_VTE)).toBe(false);
    expect(isUnassignedToBranch({ code: "x", name_1: "y" })).toBe(true);
  });
});

describe("matchesCarSearch", () => {
  it("matches name or code, case-insensitively", () => {
    expect(matchesCarSearch(TRUCK_VTE, "isuzu")).toBe(true);
    expect(matchesCarSearch(TRUCK_VTE, "6830")).toBe(true);
    expect(matchesCarSearch(TRUCK_VTE, "hyundai")).toBe(false);
  });

  it("matches everything on an empty search", () => {
    expect(matchesCarSearch(TRUCK_VTE, "   ")).toBe(true);
  });
});

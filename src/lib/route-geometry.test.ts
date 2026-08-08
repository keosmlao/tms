import { describe, expect, it } from "vitest";
import {
  formatLatLng,
  hasCoords,
  looksSwapped,
  matchSuggestions,
  moveStop,
  normalizeSuggestion,
  parseLatLngPair,
  routeDistanceKm,
  routePathLabel,
  routeStops,
  validateRoute,
  type RouteDraft,
  normalizeCustomerSuggestion,
  suggestionWeight,
  type StopSuggestion,
} from "./route-geometry";

const VIENTIANE = { lat: 17.9757, lng: 102.6331 };
const LUANG_PRABANG = { lat: 19.8834, lng: 102.135 };
const PAKSE = { lat: 15.1202, lng: 105.7986 };

function draft(overrides: Partial<RouteDraft> = {}): RouteDraft {
  return {
    name: "ວຽງຈັນ - ປາກເຊ",
    origin: "ວຽງຈັນ",
    origin_lat: VIENTIANE.lat,
    origin_lng: VIENTIANE.lng,
    destination: "ປາກເຊ",
    destination_lat: PAKSE.lat,
    destination_lng: PAKSE.lng,
    waypoints: [],
    ...overrides,
  };
}

describe("parseLatLngPair", () => {
  it("reads the comma form people type", () => {
    expect(parseLatLngPair("17.9757, 102.6331")).toEqual(VIENTIANE);
  });

  it("reads space- and tab-separated pairs", () => {
    expect(parseLatLngPair("17.9757 102.6331")).toEqual(VIENTIANE);
    expect(parseLatLngPair("17.9757\t102.6331")).toEqual(VIENTIANE);
  });

  it("pulls the pair out of a pasted Google Maps URL", () => {
    expect(
      parseLatLngPair("https://www.google.com/maps/@17.9757,102.6331,15z")
    ).toEqual(VIENTIANE);
  });

  it("handles negative coordinates", () => {
    expect(parseLatLngPair("-33.8688, 151.2093")).toEqual({
      lat: -33.8688,
      lng: 151.2093,
    });
  });

  it("returns null for half-typed input instead of committing garbage", () => {
    // These are the states the old single-field editor mangled on every
    // keystroke; the new field keeps the raw text and commits nothing yet.
    expect(parseLatLngPair("17.")).toBeNull();
    expect(parseLatLngPair("-")).toBeNull();
    expect(parseLatLngPair("17.9757,")).toBeNull();
    expect(parseLatLngPair("")).toBeNull();
    expect(parseLatLngPair("abc, def")).toBeNull();
  });

  it("rejects out-of-range values", () => {
    expect(parseLatLngPair("117.9, 102.6")).toBeNull();
    expect(parseLatLngPair("17.9, 202.6")).toBeNull();
  });
});

describe("formatLatLng", () => {
  it("round-trips through the parser", () => {
    const text = formatLatLng(VIENTIANE.lat, VIENTIANE.lng);
    expect(parseLatLngPair(text)).toEqual(VIENTIANE);
  });

  it("is empty for an unpinned point", () => {
    expect(formatLatLng(null, null)).toBe("");
    expect(formatLatLng(17.9757, null)).toBe("");
  });
});

describe("routeDistanceKm", () => {
  it("sums the legs in travel order", () => {
    const direct = routeDistanceKm([
      { name: "a", ...VIENTIANE },
      { name: "b", ...PAKSE },
    ]);
    const viaLuangPrabang = routeDistanceKm([
      { name: "a", ...VIENTIANE },
      { name: "b", ...LUANG_PRABANG },
      { name: "c", ...PAKSE },
    ]);
    expect(direct).toBeGreaterThan(400);
    expect(direct).toBeLessThan(600);
    // A detour north can only make the straight-line path longer.
    expect(viaLuangPrabang!).toBeGreaterThan(direct!);
  });

  it("skips stops that were never pinned", () => {
    const withGap = routeDistanceKm([
      { name: "a", ...VIENTIANE },
      { name: "unpinned", lat: null, lng: null },
      { name: "b", ...PAKSE },
    ]);
    const without = routeDistanceKm([
      { name: "a", ...VIENTIANE },
      { name: "b", ...PAKSE },
    ]);
    expect(withGap).toBe(without);
  });

  it("returns null (not 0) when fewer than two stops are pinned", () => {
    expect(routeDistanceKm([{ name: "a", ...VIENTIANE }])).toBeNull();
    expect(
      routeDistanceKm([{ name: "a", lat: null, lng: null }])
    ).toBeNull();
    expect(routeDistanceKm([])).toBeNull();
  });
});

describe("looksSwapped", () => {
  it("flags a Laos pair entered as lng,lat", () => {
    expect(looksSwapped(VIENTIANE.lng, VIENTIANE.lat)).toBe(true);
  });

  it("leaves a correct Laos pair alone", () => {
    expect(looksSwapped(VIENTIANE.lat, VIENTIANE.lng)).toBe(false);
    expect(looksSwapped(PAKSE.lat, PAKSE.lng)).toBe(false);
  });

  it("stays quiet for points abroad that don't swap into Laos", () => {
    // A cross-border route is legitimate — only warn on the actual mistake.
    expect(looksSwapped(-33.8688, 151.2093)).toBe(false);
  });

  it("ignores unpinned points", () => {
    expect(looksSwapped(null, null)).toBe(false);
    expect(looksSwapped(17.9757, null)).toBe(false);
  });
});

describe("validateRoute", () => {
  it("accepts a complete route", () => {
    expect(validateRoute(draft())).toEqual([]);
  });

  it("requires a name", () => {
    expect(validateRoute(draft({ name: "   " }))).toContain(
      "ກະລຸນາໃສ່ຊື່ເສັ້ນທາງ"
    );
  });

  it("accepts a route with no coordinates at all", () => {
    // Naming the route first and mapping it later is a normal workflow.
    const problems = validateRoute(
      draft({
        origin_lat: null,
        origin_lng: null,
        destination_lat: null,
        destination_lng: null,
      })
    );
    expect(problems).toEqual([]);
  });

  it("catches a half-entered coordinate", () => {
    const problems = validateRoute(draft({ origin_lng: null }));
    expect(problems.join(" ")).toContain("ຕົ້ນທາງ");
  });

  it("points at the waypoint that is wrong, by number", () => {
    const problems = validateRoute(
      draft({
        waypoints: [
          { name: "ok", ...LUANG_PRABANG },
          { name: "swapped", lat: VIENTIANE.lng, lng: VIENTIANE.lat },
        ],
      })
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("ຈຸດທີ 2");
  });
});

describe("routeStops / routePathLabel", () => {
  it("lists stops in travel order", () => {
    const stops = routeStops(
      draft({ waypoints: [{ name: "ວັງວຽງ", ...LUANG_PRABANG }] })
    );
    expect(stops.map((s) => s.name)).toEqual(["ວຽງຈັນ", "ວັງວຽງ", "ປາກເຊ"]);
  });

  it("skips unnamed stops in the summary line", () => {
    const label = routePathLabel([
      { name: "ວຽງຈັນ", lat: null, lng: null },
      { name: "  ", lat: null, lng: null },
      { name: "ປາກເຊ", lat: null, lng: null },
    ]);
    expect(label).toBe("ວຽງຈັນ → ປາກເຊ");
  });
});

describe("moveStop", () => {
  it("moves an item up and down", () => {
    expect(moveStop(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveStop(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns the input untouched for a no-op or out-of-range move", () => {
    const items = ["a", "b", "c"];
    expect(moveStop(items, 1, 1)).toBe(items);
    expect(moveStop(items, 0, -1)).toBe(items);
    expect(moveStop(items, 5, 0)).toBe(items);
  });

  it("does not mutate the original array", () => {
    const items = ["a", "b", "c"];
    moveStop(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("normalizeSuggestion", () => {
  it("parses the text coordinates the branch geofence stores", () => {
    expect(
      normalizeSuggestion({
        code: "01",
        name: " ສາງວຽງຈັນ ",
        lat: "17.9757",
        lng: "102.6331",
        car_count: 4,
      })
    ).toEqual({
      code: "01",
      name: "ສາງວຽງຈັນ",
      lat: 17.9757,
      lng: 102.6331,
      carCount: 4,
      kind: "branch",
      deliveryCount: 0,
      lastDelivered: "",
    });
  });

  it("ສາຂາທີ່ພິກັດເປັນ 0,0 ຖືວ່າຍັງບໍ່ໄດ້ຕັ້ງ", () => {
    // ຮູຮົ່ວອັນດຽວກັບຝັ່ງຮ້ານ — geofence ທີ່ຍັງບໍ່ໄດ້ຕັ້ງເກັບເປັນ "0".
    const stop = normalizeSuggestion({ code: "09", lat: "0", lng: "0" });
    expect(stop.lat).toBeNull();
    expect(stop.lng).toBeNull();
  });

  it("leaves a branch with no geofence unpinned rather than at 0,0", () => {
    const suggestion = normalizeSuggestion({
      code: "02",
      name: "ສາຂາປາກເຊ",
      lat: "",
      lng: "",
      car_count: 1,
    });
    expect(suggestion.lat).toBeNull();
    expect(suggestion.lng).toBeNull();
    // Still offered — picking it fills the name, the admin pins it by hand.
    expect(suggestion.name).toBe("ສາຂາປາກເຊ");
  });

  it("drops out-of-range junk", () => {
    const suggestion = normalizeSuggestion({
      code: "03",
      name: "x",
      lat: "999",
      lng: "102.6",
      car_count: "2",
    });
    expect(suggestion.lat).toBeNull();
    expect(suggestion.carCount).toBe(2);
  });
});

/** ສ້າງຈຸດຈອດແບບສາຂາ — ໃຊ້ຮ່ວມກັນຫຼາຍ describe. */
const branch = (
  code: string,
  name: string,
  lat: number,
  lng: number,
  carCount: number
): StopSuggestion => ({
  code,
  name,
  lat,
  lng,
  carCount,
  kind: "branch",
  deliveryCount: 0,
  lastDelivered: "",
});

describe("matchSuggestions", () => {
  const branches = [
    branch("01", "ສາງວຽງຈັນ", 17.9, 102.6, 12),
    branch("02", "ສາຂາປາກເຊ", 15.1, 105.7, 3),
    branch("03", "ສາຂາຫຼວງພະບາງ", 19.8, 102.1, 5),
  ];

  it("lists branches when nothing has been typed yet", () => {
    const all = matchSuggestions(branches, "");
    expect(all).toHaveLength(3);
    // Biggest fleet first — the depot most routes start from.
    expect(all[0].code).toBe("01");
  });

  it("prefers a prefix match over a mid-string one", () => {
    const matches = matchSuggestions(branches, "ສາຂາ");
    expect(matches.map((m) => m.code)).toEqual(["03", "02"]);
  });

  it("matches on branch code too", () => {
    expect(matchSuggestions(branches, "02").map((m) => m.code)).toEqual(["02"]);
  });

  it("returns nothing for a stop that is not a branch", () => {
    expect(matchSuggestions(branches, "ບ້ານນາໄຊ")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(matchSuggestions(branches, "", 2)).toHaveLength(2);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(matchSuggestions(branches, "  ສາງວຽງຈັນ  ")).toHaveLength(1);
  });
});

describe("hasCoords", () => {
  it("is true only for a fully pinned point", () => {
    expect(hasCoords({ lat: 17.9, lng: 102.6 })).toBe(true);
    expect(hasCoords({ lat: 17.9, lng: null })).toBe(false);
    expect(hasCoords({ lat: null, lng: null })).toBe(false);
  });
});

describe("ຈຸດຈອດທີ່ແນະນຳຈາກການສົ່ງຈິງ", () => {
  it("ອ່ານແຖວຈາກ server ເປັນຈຸດຮ້ານ", () => {
    const stop = normalizeCustomerSuggestion({
      code: "C001",
      name: "ຮ້ານ ປິ່ນຄຳ (ທົ່ງຂັນຄຳ)",
      lat: "17.975108",
      lng: "102.607403",
      delivery_count: 180,
      last_delivered: "2026-08-07",
    });
    expect(stop.kind).toBe("customer");
    expect(stop.lat).toBeCloseTo(17.975108, 5);
    expect(stop.deliveryCount).toBe(180);
    expect(stop.lastDelivered).toBe("2026-08-07");
    expect(stop.carCount).toBe(0);
  });

  it("ພິກັດທີ່ອ່ານບໍ່ອອກ ຫຼື ນອກຂອບເຂດ ກາຍເປັນ null ບໍ່ແມ່ນ 0", () => {
    // (0,0) ຢູ່ກາງມະຫາສະໝຸດ — ປັກໝຸດລົງນັ້ນຈະເຮັດໃຫ້ໄລຍະທາງຜິດມະຫາສານ.
    for (const bad of ["", "abc", "0", "999"]) {
      const stop = normalizeCustomerSuggestion({ lat: bad, lng: bad });
      expect(stop.lat).toBeNull();
      expect(stop.lng).toBeNull();
    }
  });

  it("ຊ່ອງທີ່ຫາຍ ບໍ່ພັງ", () => {
    const stop = normalizeCustomerSuggestion({});
    expect(stop.code).toBe("");
    expect(stop.deliveryCount).toBe(0);
    expect(stop.kind).toBe("customer");
  });

  it("ສາຂາຂຶ້ນກ່ອນຮ້ານ ເຖິງຮ້ານຈະຖີ່ກວ່າ", () => {
    // ເສັ້ນທາງເກືອບສະເໝີເລີ່ມ ຫຼື ຈົບຢູ່ສາຂາ — ຄົນຕັ້ງຄ່າຫາອັນນັ້ນກ່ອນ.
    const shop = normalizeCustomerSuggestion({
      code: "C1",
      name: "ສາຂາຮ້ານດັງ",
      lat: "17.9",
      lng: "102.6",
      delivery_count: 999,
    });
    const depot = branch("01", "ສາຂາວຽງຈັນ", 17.9, 102.6, 2);
    expect(matchSuggestions([shop, depot], "ສາຂາ")[0].code).toBe("01");
  });

  it("ພາຍໃນປະເພດດຽວກັນ ອັນທີ່ໃຊ້ຫຼາຍກວ່າຂຶ້ນກ່ອນ", () => {
    const often = normalizeCustomerSuggestion({
      code: "A",
      name: "ຮ້ານ ກ",
      delivery_count: 50,
    });
    const rare = normalizeCustomerSuggestion({
      code: "B",
      name: "ຮ້ານ ຂ",
      delivery_count: 2,
    });
    expect(matchSuggestions([rare, often], "ຮ້ານ").map((s) => s.code)).toEqual([
      "A",
      "B",
    ]);
  });

  it("ນ້ຳໜັກຈັດລຳດັບ ອີງຄ່າທີ່ຖືກຕ້ອງຂອງແຕ່ລະປະເພດ", () => {
    expect(suggestionWeight(branch("01", "ສາງ", 17.9, 102.6, 12))).toBe(12);
    expect(
      suggestionWeight(normalizeCustomerSuggestion({ delivery_count: 7 }))
    ).toBe(7);
  });
});

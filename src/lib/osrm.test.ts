import { describe, expect, it } from "vitest";
import {
  buildOsrmPath,
  buildOsrmUrl,
  formatDuration,
  parseOsrmRoute,
} from "./osrm";

const VIENTIANE = { lat: 17.9757, lng: 102.6331 };
const PAKSE = { lat: 15.1202, lng: 105.7986 };

describe("buildOsrmPath", () => {
  it("emits lng,lat pairs — the opposite order from the rest of the app", () => {
    expect(buildOsrmPath([VIENTIANE, PAKSE])).toBe(
      "102.6331,17.9757;105.7986,15.1202"
    );
  });

  it("needs two usable points", () => {
    expect(buildOsrmPath([VIENTIANE])).toBeNull();
    expect(buildOsrmPath([])).toBeNull();
  });

  it("drops junk coordinates and re-checks the count", () => {
    expect(
      buildOsrmPath([VIENTIANE, { lat: Number.NaN, lng: 102 }])
    ).toBeNull();
    expect(
      buildOsrmPath([VIENTIANE, { lat: 999, lng: 102 }, PAKSE])
    ).toBe("102.6331,17.9757;105.7986,15.1202");
  });

  it("keeps every waypoint in travel order", () => {
    const middle = { lat: 16.5, lng: 104.5 };
    expect(buildOsrmPath([VIENTIANE, middle, PAKSE])).toBe(
      "102.6331,17.9757;104.5,16.5;105.7986,15.1202"
    );
  });
});

describe("buildOsrmUrl", () => {
  it("asks for full geometry as GeoJSON", () => {
    const url = buildOsrmUrl("102.6,17.9;105.7,15.1");
    expect(url).toContain("/route/v1/driving/102.6,17.9;105.7,15.1");
    expect(url).toContain("overview=full");
    expect(url).toContain("geometries=geojson");
  });
});

describe("parseOsrmRoute", () => {
  const ok = {
    code: "Ok",
    routes: [
      {
        distance: 678_123,
        duration: 32_400,
        geometry: {
          coordinates: [
            [102.6331, 17.9757],
            [104.5, 16.5],
            [105.7986, 15.1202],
          ],
        },
      },
    ],
  };

  it("converts metres/seconds and flips the coordinates for Leaflet", () => {
    const route = parseOsrmRoute(ok);
    expect(route).not.toBeNull();
    expect(route!.distanceKm).toBe(678.1);
    expect(route!.durationMin).toBe(540);
    expect(route!.path[0]).toEqual([17.9757, 102.6331]);
    expect(route!.path).toHaveLength(3);
  });

  it("returns null for an error response rather than a wrong distance", () => {
    expect(parseOsrmRoute({ code: "NoRoute", routes: [] })).toBeNull();
    expect(parseOsrmRoute({ code: "Ok", routes: [] })).toBeNull();
    expect(parseOsrmRoute(null)).toBeNull();
    expect(parseOsrmRoute("nope")).toBeNull();
  });

  it("returns null when the geometry is too short to draw", () => {
    expect(
      parseOsrmRoute({
        code: "Ok",
        routes: [
          { distance: 10, duration: 5, geometry: { coordinates: [[102, 17]] } },
        ],
      })
    ).toBeNull();
  });

  it("skips malformed coordinate pairs inside a good geometry", () => {
    const route = parseOsrmRoute({
      code: "Ok",
      routes: [
        {
          distance: 1000,
          duration: 60,
          geometry: {
            coordinates: [[102.6, 17.9], ["x"], [105.7, 15.1]],
          },
        },
      ],
    });
    expect(route!.path).toEqual([
      [17.9, 102.6],
      [15.1, 105.7],
    ]);
  });

  it("survives a missing duration", () => {
    const route = parseOsrmRoute({
      code: "Ok",
      routes: [
        {
          distance: 5000,
          geometry: {
            coordinates: [
              [102.6, 17.9],
              [105.7, 15.1],
            ],
          },
        },
      ],
    });
    expect(route!.distanceKm).toBe(5);
    expect(route!.durationMin).toBe(0);
  });
});

describe("formatDuration", () => {
  it("reads as Lao driving time", () => {
    expect(formatDuration(45)).toBe("45 ນາທີ");
    expect(formatDuration(120)).toBe("2 ຊມ");
    expect(formatDuration(135)).toBe("2 ຊມ 15 ນາທີ");
  });

  it("shows a dash when there is no time to show", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

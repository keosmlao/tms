import { describe, expect, it } from "vitest";
import {
  LOCATION_TRACKING_KEY,
  isLocationTrackingEnabled,
} from "./location-tracking-flag";

describe("isLocationTrackingEnabled", () => {
  it("defaults to on when the setting was never saved", () => {
    // getSettings returns "" for a key with no row; a fresh install must keep
    // tracking rather than silently losing every driver's position.
    expect(isLocationTrackingEnabled("")).toBe(true);
    expect(isLocationTrackingEnabled(undefined)).toBe(true);
  });

  it("is on for the values the dashboard writes when enabled", () => {
    expect(isLocationTrackingEnabled("1")).toBe(true);
    expect(isLocationTrackingEnabled("true")).toBe(true);
  });

  it("is off only for an explicit negative", () => {
    expect(isLocationTrackingEnabled("0")).toBe(false);
    expect(isLocationTrackingEnabled("false")).toBe(false);
    expect(isLocationTrackingEnabled("off")).toBe(false);
    expect(isLocationTrackingEnabled("no")).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isLocationTrackingEnabled(" 0 ")).toBe(false);
    expect(isLocationTrackingEnabled("FALSE")).toBe(false);
    expect(isLocationTrackingEnabled("  ")).toBe(true);
  });

  it("treats an unrecognised value as on", () => {
    // Better to keep collecting positions than to go dark on a typo.
    expect(isLocationTrackingEnabled("yes")).toBe(true);
    expect(isLocationTrackingEnabled("enabled")).toBe(true);
  });

  it("exposes the settings key the dashboard and API share", () => {
    expect(LOCATION_TRACKING_KEY).toBe("app.mobile.location_tracking_enabled");
  });
});

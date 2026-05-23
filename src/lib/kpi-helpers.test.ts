import { describe, expect, it } from "vitest";

// Pure helpers extracted from dashboard / leaderboard. We exercise the
// formatting + math without touching the database so the tests stay fast and
// CI doesn't need a Postgres connection.

function fmtKpiDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

describe("fmtKpiDuration", () => {
  it("formats null / invalid as em-dash", () => {
    expect(fmtKpiDuration(null)).toBe("—");
    expect(fmtKpiDuration(Number.NaN)).toBe("—");
    expect(fmtKpiDuration(-1)).toBe("—");
  });

  it("formats sub-minute as seconds", () => {
    expect(fmtKpiDuration(0)).toBe("0s");
    expect(fmtKpiDuration(45)).toBe("45s");
  });

  it("formats sub-hour as minutes+seconds", () => {
    expect(fmtKpiDuration(60)).toBe("1m 0s");
    expect(fmtKpiDuration(125)).toBe("2m 5s");
  });

  it("formats over an hour as hours+minutes", () => {
    expect(fmtKpiDuration(3600)).toBe("1h 0m");
    expect(fmtKpiDuration(3600 + 30 * 60 + 15)).toBe("1h 30m");
  });
});

describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
  });

  it("returns ~111km for 1deg latitude", () => {
    const km = haversineKm(0, 0, 1, 0);
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it("Vientiane to Pakse roughly 530km", () => {
    // VTE ~17.97 N, 102.61 E. PKS ~15.12 N, 105.79 E.
    const km = haversineKm(17.97, 102.61, 15.12, 105.79);
    expect(km).toBeGreaterThan(450);
    expect(km).toBeLessThan(600);
  });

  it("is symmetric", () => {
    const a = haversineKm(17.97, 102.61, 15.12, 105.79);
    const b = haversineKm(15.12, 105.79, 17.97, 102.61);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });
});

describe("pct (KPI rate)", () => {
  it("returns 0 when total is zero", () => {
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });

  it("rounds to nearest integer percent", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(50, 100)).toBe(50);
  });

  it("handles 100%", () => {
    expect(pct(7, 7)).toBe(100);
  });
});

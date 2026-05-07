import { afterEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTests, rateLimit, rateLimitResponse } from "./rate-limit";

function req(ip = "1.2.3.4"): Request {
  return new Request("http://test", {
    headers: { "x-forwarded-for": ip },
  });
}

afterEach(() => __resetRateLimitForTests());

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const r1 = rateLimit(req(), { bucket: "t", limit: 3, windowMs: 1000 });
    const r2 = rateLimit(req(), { bucket: "t", limit: 3, windowMs: 1000 });
    const r3 = rateLimit(req(), { bucket: "t", limit: 3, windowMs: 1000 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks the request that exceeds the limit", () => {
    rateLimit(req(), { bucket: "t", limit: 2, windowMs: 1000 });
    rateLimit(req(), { bucket: "t", limit: 2, windowMs: 1000 });
    const blocked = rateLimit(req(), { bucket: "t", limit: 2, windowMs: 1000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates buckets", () => {
    rateLimit(req(), { bucket: "a", limit: 1, windowMs: 1000 });
    const b = rateLimit(req(), { bucket: "b", limit: 1, windowMs: 1000 });
    expect(b.allowed).toBe(true);
  });

  it("isolates clients by IP", () => {
    rateLimit(req("1.1.1.1"), { bucket: "t", limit: 1, windowMs: 1000 });
    const other = rateLimit(req("2.2.2.2"), { bucket: "t", limit: 1, windowMs: 1000 });
    expect(other.allowed).toBe(true);
  });

  it("falls back to 'unknown' when no IP headers", () => {
    const bare = new Request("http://test");
    const r1 = rateLimit(bare, { bucket: "t", limit: 1, windowMs: 1000 });
    const r2 = rateLimit(bare, { bucket: "t", limit: 1, windowMs: 1000 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(false);
  });
});

describe("rateLimitResponse", () => {
  it("returns 429 with retry headers", async () => {
    const blocked = {
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 5000,
      retryAfterSeconds: 5,
    };
    const res = rateLimitResponse(blocked);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    const body = await res.json();
    expect(body.error).toMatch(/too many/i);
  });
});

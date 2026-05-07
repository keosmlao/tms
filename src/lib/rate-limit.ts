// In-memory rate limiter — fixed window per (bucket, key). Good enough for a
// single-node deployment; if tms-next ever runs behind multiple replicas this
// has to move to Redis or PostgreSQL (the windows would otherwise be per-node
// and the effective limit would multiply).

interface Entry {
  count: number;
  expiresAt: number;
}

const store = new Map<string, Entry>();

interface Options {
  bucket: string;
  limit: number;
  windowMs: number;
  key?: string; // override the default IP-based key
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimit(request: Request, opts: Options): RateLimitResult {
  const now = Date.now();
  const key = `${opts.bucket}:${opts.key ?? clientKey(request)}`;
  const existing = store.get(key);

  if (!existing || existing.expiresAt <= now) {
    const expiresAt = now + opts.windowMs;
    store.set(key, { count: 1, expiresAt });
    sweep(now);
    return {
      allowed: true,
      limit: opts.limit,
      remaining: opts.limit - 1,
      resetAt: expiresAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count++;
  const remaining = Math.max(0, opts.limit - existing.count);
  const allowed = existing.count <= opts.limit;
  return {
    allowed,
    limit: opts.limit,
    remaining,
    resetAt: existing.expiresAt,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  };
}

// Walk the map occasionally to avoid unbounded growth from sparse keys
// (one-off IPs that hit a route once and never come back). Cheap enough at
// this scale; revisit when entries grow large.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of store) if (v.expiresAt <= now) store.delete(k);
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    }
  );
}

// Test-only — clears state between tests.
export function __resetRateLimitForTests(): void {
  store.clear();
  lastSweep = 0;
}

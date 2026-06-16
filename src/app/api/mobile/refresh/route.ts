import { createToken } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";

// Re-mint a fresh 8h access token for an app whose token is still valid but
// nearing expiry. The driver app calls this proactively during long trips (and
// at launch) so continuous GPS tracking survives past the 8h token lifetime
// without forcing a re-login. A fully-expired token can't be refreshed here
// (requireMobileSession rejects it) — that path falls back to a normal login.
export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, {
      bucket: "mobile-refresh",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const session = await requireMobileSession(request);
    const token = await createToken({
      usercode: session.usercode,
      username: session.username,
      driver_id: session.driver_id,
      logistic_code: session.logistic_code,
      title: session.title,
      roles: session.roles,
      is_driver: session.is_driver,
    });
    return Response.json({ token });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

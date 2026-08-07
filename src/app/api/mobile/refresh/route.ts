import { MOBILE_TOKEN_TTL, createToken } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";

// Re-mint an access token for an app whose token is still valid. Mobile tokens
// no longer expire by default (see MOBILE_TOKEN_TTL), so this is now only
// needed when an admin sets a TTL, or to pick up changed claims (e.g. a user
// promoted from driver to supervisor) without a re-login. A token that IS
// expired can't be refreshed here — requireMobileSession rejects it and the app
// falls back to a normal login.
export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, {
      bucket: "mobile-refresh",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const session = await requireMobileSession(request);
    const token = await createToken(
      {
        usercode: session.usercode,
        username: session.username,
        driver_id: session.driver_id,
        logistic_code: session.logistic_code,
        title: session.title,
        roles: session.roles,
        is_driver: session.is_driver,
      },
      MOBILE_TOKEN_TTL
    );
    return Response.json({ token });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

import { mobileLogin } from "@/queries/mobile.js";
import { MOBILE_TOKEN_TTL, createToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validation";
import { LoginSchema } from "@/lib/mobile-schemas";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { mobileErrorResponse } from "@/lib/mobile-auth";
import { evaluateMobileAppVersion } from "@/lib/app-version";
import { touchUserPresence } from "@/queries/presence.js";

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, { bucket: "mobile-login", limit: 10, windowMs: 60_000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const data = await parseJsonBody(request, LoginSchema);
    const user = await mobileLogin(data);
    // ບໍ່ໃສ່ອາຍຸ (ເວັ້ນແຕ່ຕັ້ງ MOBILE_TOKEN_TTL) — ແອັບຢູ່ໃນເຄື່ອງຂອງພະນັກງານ
    // ຄົນດຽວ ແລະ ການບັງຄັບ login ໃໝ່ກາງທາງເຮັດວຽກບໍ່ໄດ້.
    const token = await createToken(
      {
        usercode: user.code,
        username: user.name_1 ?? user.username,
        driver_id: user.driver_id,
        logistic_code: user.logistic_code ?? "",
        title: user.title ?? "",
        roles: user.roles ?? user.title ?? "",
        is_driver: user.is_driver === true,
      },
      MOBILE_TOKEN_TTL
    );
    await ((touchUserPresence as unknown) as (input: Record<string, unknown>) => Promise<unknown>)({
      session: {
        usercode: user.code,
        username: user.name_1 ?? user.username,
        logistic_code: user.logistic_code ?? "",
        title: user.title ?? "",
      },
      source: "mobile",
      request,
    });
    // Surface the update policy on login (without blocking) so the app can show
    // a forced-update screen immediately. Protected routes hard-block via 426.
    const app_update = await evaluateMobileAppVersion(request);
    return Response.json({ ...user, token, app_update });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

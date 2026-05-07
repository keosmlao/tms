import { mobileLogin } from "@/queries/mobile.js";
import { createToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validation";
import { LoginSchema } from "@/lib/mobile-schemas";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { mobileErrorResponse } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, { bucket: "mobile-login", limit: 10, windowMs: 60_000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const data = await parseJsonBody(request, LoginSchema);
    const user = await mobileLogin(data);
    const token = await createToken({
      usercode: user.code,
      username: user.name_1 ?? user.username,
      driver_id: user.driver_id,
      logistic_code: user.logistic_code ?? "",
      title: user.title ?? "",
    });
    return Response.json({ ...user, token });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

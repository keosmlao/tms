import type { NextRequest } from "next/server";
import { fcmTokenSave, fcmTokenDelete } from "@/queries/mobile.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody } from "@/lib/validation";
import { FcmTokenDeleteSchema, FcmTokenSaveSchema } from "@/lib/mobile-schemas";

export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await parseJsonBody(request, FcmTokenSaveSchema);
    const data = await fcmTokenSave({ ...body, user_code: session.usercode });
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireMobileSession(request);
    const body = await parseJsonBody(request, FcmTokenDeleteSchema);
    const tokenFromQuery = request.nextUrl.searchParams.get("token");
    const data = await fcmTokenDelete(body.token ?? tokenFromQuery);
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

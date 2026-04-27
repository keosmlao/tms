import type { NextRequest } from "next/server";
import { fcmTokenSave, fcmTokenDelete } from "@/queries/mobile.js";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await fcmTokenSave(body);
    return Response.json(data);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? "Internal server error";
    if (status === 500) console.error("fcm-token save error:", error);
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request
      .json()
      .catch(() => ({}));
    const tokenFromBody = body?.token;
    const tokenFromQuery = request.nextUrl.searchParams.get("token");
    const data = await fcmTokenDelete(tokenFromBody ?? tokenFromQuery);
    return Response.json(data);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? "Internal server error";
    if (status === 500) console.error("fcm-token delete error:", error);
    return Response.json({ error: message }, { status });
  }
}

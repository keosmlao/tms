import type { NextRequest } from "next/server";
import { mobileFuelLogs } from "@/queries/mobile.js";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const data = await mobileFuelLogs({
      userCode: sp.get("user_code") ?? "",
      fromDate: sp.get("from") ?? undefined,
      toDate: sp.get("to") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return Response.json(data);
  } catch (error: unknown) {
    console.error("Mobile fuel list error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Internal server error";
    const status =
      typeof (error as { status?: number })?.status === "number"
        ? (error as { status: number }).status
        : 500;
    return Response.json({ error: message }, { status });
  }
}

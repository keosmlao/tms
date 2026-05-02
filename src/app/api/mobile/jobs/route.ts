import type { NextRequest } from "next/server";
import { mobileJobsList, mobileJobAction } from "@/queries/mobile.js";

export async function GET(request: NextRequest) {
  try {
    const driverId = request.nextUrl.searchParams.get("driver_id") ?? "";
    const date = request.nextUrl.searchParams.get("date") ?? "";
    const data = await mobileJobsList(driverId, date);
    return Response.json(data);
  } catch (error) {
    console.error("Mobile jobs error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await mobileJobAction(body);
    return Response.json(data);
  } catch (error: any) {
    console.error("Mobile job action error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Internal server error";
    const status =
      message === "Invalid action" ||
      message.includes("required") ||
      message.includes("remaining only") ||
      message.includes("Still has pending") ||
      message.includes("must be")
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}

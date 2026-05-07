import type { NextRequest } from "next/server";
import { mobileFuelLogs } from "@/queries/mobile.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseSearchParams } from "@/lib/validation";
import { FuelListQuerySchema } from "@/lib/mobile-schemas";

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const params = parseSearchParams(request.nextUrl.searchParams, FuelListQuerySchema);
    const data = await mobileFuelLogs({
      userCode: session.usercode,
      fromDate: params.from,
      toDate: params.to,
      limit: params.limit,
    });
    return Response.json(data);
  } catch (error: unknown) {
    return mobileErrorResponse(error);
  }
}

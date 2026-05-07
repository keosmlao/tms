import type { NextRequest } from "next/server";
import { mobileBills } from "@/queries/mobile.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseSearchParams } from "@/lib/validation";
import { BillsListQuerySchema } from "@/lib/mobile-schemas";

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const params = parseSearchParams(request.nextUrl.searchParams, BillsListQuerySchema);
    const data = await mobileBills({
      docNo: params.doc_no ?? null,
      billNo: params.bill_no ?? null,
      type: params.type ?? null,
      driverId: session.driver_id,
    });
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

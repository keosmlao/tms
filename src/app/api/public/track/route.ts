import type { NextRequest } from "next/server";
import { trackBillPublic } from "@/queries/tracking.js";
import { parseJsonBody, parseSearchParams } from "@/lib/validation";
import { PublicTrackSchema } from "@/lib/mobile-schemas";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { mobileErrorResponse } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  const limit = rateLimit(request, { bucket: "public-track", limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const { bill_no } = parseSearchParams(request.nextUrl.searchParams, PublicTrackSchema);
    return await handle(bill_no);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const limit = rateLimit(request, { bucket: "public-track", limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const { bill_no } = await parseJsonBody(request, PublicTrackSchema);
    return await handle(bill_no);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

async function handle(billNo: string) {
  try {
    const data = await trackBillPublic(billNo);
    return Response.json(data ?? null);
  } catch (error) {
    console.error("Public track error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

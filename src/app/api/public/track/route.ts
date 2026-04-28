import type { NextRequest } from "next/server";
import { trackBillPublic } from "@/queries/tracking.js";

export async function GET(request: NextRequest) {
  const billNo = request.nextUrl.searchParams.get("bill_no") ?? "";
  return handle(billNo);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const billNo = (body as { bill_no?: string })?.bill_no ?? "";
  return handle(billNo);
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

import type { NextRequest } from "next/server";
import { mobileBills } from "@/queries/mobile.js";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const docNo = params.get("doc_no") || null;
    const billNo = params.get("bill_no") || null;
    const type = params.get("type") || null;
    const data = await mobileBills({ docNo, billNo, type });
    return Response.json(data);
  } catch (error) {
    console.error("Mobile bills error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";
import { getRatingByToken, submitRating } from "@/queries/customer-rating.js";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const row = await getRatingByToken(token);
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({
      bill_no: row.bill_no,
      submitted: !!row.submitted_at,
      stars: row.stars,
      comment: row.comment,
    });
  } catch (err) {
    return Response.json({ error: (err as Error)?.message ?? "unknown" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string; stars?: number; comment?: string };
    await submitRating({
      token: body.token ?? "",
      stars: Number(body.stars),
      comment: body.comment ?? null,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error)?.message ?? "unknown" }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";

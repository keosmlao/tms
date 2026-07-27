import type { NextRequest } from "next/server";
import { getTvDashboard } from "@/queries/tv-dashboard.js";

// Feed for the wall-mounted delivery monitor.
//
// A TV in the dispatch room has nobody to type a password, and parking a staff
// session on a box that runs unattended for months is worse than a scoped key.
// So this endpoint authenticates with a single shared read-only token and
// exposes counts only — no prices, no COD, no phone numbers — because whoever
// walks past the screen can read it.
export const dynamic = "force-dynamic";

function tokenOk(request: NextRequest): boolean {
  const expected = (process.env.TV_DASHBOARD_TOKEN ?? "").trim();
  // Without a configured token the screen stays closed rather than open.
  if (!expected) return false;
  const given = (
    request.nextUrl.searchParams.get("key") ??
    request.headers.get("x-tv-key") ??
    ""
  ).trim();
  if (given.length !== expected.length) return false;
  // Constant-time-ish compare: the token sits in a URL on a kiosk, but there is
  // no reason to leak its length-prefix through early exit.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: NextRequest) {
  if (!tokenOk(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const params = request.nextUrl.searchParams;
    const data = await getTvDashboard({
      date: params.get("date") ?? "",
      branch: params.get("branch") ?? "",
    });
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "error" },
      { status: 500 }
    );
  }
}

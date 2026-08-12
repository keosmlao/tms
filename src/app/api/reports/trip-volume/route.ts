import type { NextRequest } from "next/server";
import { buildTripVolume, buildTripVolumesBulk } from "@/actions/trip-volume";

/**
 * ພື້ນທີ່ບັນທຸກຂອງຖ້ຽວ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ.
 *
 *   GET /api/reports/trip-volume?doc=<doc_no>   → ຖ້ຽວດຽວ
 *   GET /api/reports/trip-volume?docs=<a,b,c>   → ຫຼາຍຖ້ຽວພ້ອມກັນ
 *   Authorization: Bearer <REPORT_API_SECRET>
 */
export async function GET(request: NextRequest) {
  const secret = process.env.REPORT_API_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const doc = request.nextUrl.searchParams.get("doc") ?? "";
  const docs = (request.nextUrl.searchParams.get("docs") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const data = doc ? await buildTripVolume(doc) : await buildTripVolumesBulk(docs);
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error("[api] trip-volume failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

import type { NextRequest } from "next/server";
import { getCurrentAll as svcGetCurrentAll } from "@/queries/gps-current.js";
import { getPhoneFleet as svcGetPhoneFleet } from "@/queries/tracking.js";

/**
 * ຕຳແໜ່ງລົດ ແລະ ໂທລະສັບ ລ່າສຸດ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງແຜນທີ່
 * — ຊຸດດຽວກັບທີ່ component live-fleet-overview ຂອງ TMS ໃຊ້.
 *
 *   GET /api/reports/fleet-live
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

  try {
    const [cars, phones] = await Promise.all([
      svcGetCurrentAll(),
      svcGetPhoneFleet().catch(() => []),
    ]);
    return Response.json({ ok: true, cars, phones });
  } catch (err) {
    console.error("[api] fleet-live failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

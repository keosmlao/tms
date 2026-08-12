import type { NextRequest } from "next/server";
import {
  getDashboardSummary,
  getDashboardKpi,
  getDashboardDeliveryPerformance,
  getDashboardPending,
  getDashboardActivity,
} from "@/queries/dashboard.js";

/**
 * ຂໍ້ມູນ dashboard ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ — ແຍກເປັນ slice
 * ຄືກັນກັບທີ່ໜ້າ dashboard ຂອງ TMS ໂຫຼດ ເພື່ອໃຫ້ໜ້າຄ່ອຍໆສະແດງທີ່ລະສ່ວນ
 * (summary ໄວ · kpi ກາງ · pending ຊ້າ).
 *
 *   GET /api/reports/dashboard?slice=summary|kpi|delivery|pending|activity&force=1
 *   Authorization: Bearer <REPORT_API_SECRET>
 */
const SLICES: Record<string, (session: object, force: boolean) => Promise<unknown>> = {
  summary: getDashboardSummary,
  kpi: getDashboardKpi,
  delivery: getDashboardDeliveryPerformance,
  pending: getDashboardPending,
  activity: (session) => getDashboardActivity(session),
};

export async function GET(request: NextRequest) {
  const secret = process.env.REPORT_API_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const slice = request.nextUrl.searchParams.get("slice") ?? "";
  const force = request.nextUrl.searchParams.get("force") === "1";
  const run = SLICES[slice];
  if (!run) {
    return Response.json(
      { error: `slice must be one of ${Object.keys(SLICES).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // ບໍ່ສົ່ງ session ໄປ — ແອັບບໍລິຫານເບິ່ງທຸກສາຂາ.
    const data = await run({}, force);
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error(`[api] dashboard slice ${slice} failed:`, err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

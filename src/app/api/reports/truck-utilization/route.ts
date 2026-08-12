import type { NextRequest } from "next/server";
import { buildUtilizationReport } from "@/actions/trip-volume";

/**
 * ອັດຕາໃຊ້ພື້ນທີ່ລົດ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ.
 *
 * ເອີ້ນແກ່ນອັນດຽວກັບ getUtilizationReport() — ຄິດໄລ່ທັງໝົດ (ຂະໜາດສິນຄ້າ, ພື້ນທີ່
 * ບັນທຸກຂອງລົດ, band ການແຈກແຈງ) ຢູ່ໃນ TMS ບ່ອນດຽວ ຈຶ່ງບໍ່ມີທາງທີ່ 2 ແອັບ
 * ຈະສະແດງຄົນລະຕົວເລກ.
 *
 *   GET /api/reports/truck-utilization?from=YYYY-MM-DD&to=YYYY-MM-DD
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

  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isDate(from) || !isDate(to)) {
    return Response.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const data = await buildUtilizationReport(from, to);
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error("[api] truck-utilization failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

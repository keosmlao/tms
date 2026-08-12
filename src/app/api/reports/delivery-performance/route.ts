import type { NextRequest } from "next/server";
import { getDeliveryPerformance } from "@/queries/reports.js";

/**
 * ລາຍງານປະສິດທິພາບການຈັດສົ່ງ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ.
 *
 * ⚠️ ຢ່າຂຽນສູດຄິດໄລ່ຄືນຢູ່ແອັບປາຍທາງ — ໃຫ້ເອີ້ນເສັ້ນນີ້ແທນ. ນິຍາມຂອງ
 * carry_in / carry_out ຂຶ້ນກັບ getBillsPending (remaining-count, ບິນບໍລິການ,
 * ບິນໂອນສາຂາ) ຊຶ່ງຂຽນຄືນແລ້ວຕົວເລກຈະບໍ່ຕົງ.
 *
 *   GET /api/reports/delivery-performance?month=YYYY-MM
 *   Authorization: Bearer <REPORT_API_SECRET>
 *
 * ຄືນ DeliveryPerfReport ອັນດຽວກັບທີ່ໜ້າ /reports/delivery-performance ໃຊ້.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.REPORT_API_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  try {
    // ບໍ່ສົ່ງ session ໄປ — ແອັບບໍລິຫານເບິ່ງທຸກສາຂາ ຄືກັບຜູ້ໃຊ້ທີ່ບໍ່ຜູກສາຂາ.
    const report = await getDeliveryPerformance({}, month);
    return Response.json({ ok: true, report });
  } catch (err) {
    console.error("[api] delivery-performance failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

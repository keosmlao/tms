import type { NextRequest } from "next/server";
import {
  getGpsUsageSummary as svcGetGpsUsageSummary,
  getGpsUsageSummaryCached as svcGetGpsUsageSummaryCached,
} from "@/queries/gps-usage.js";
import { getFuelByCar as svcGetFuelByCar } from "@/queries/fuel.js";
import { buildFuelEfficiency } from "@/lib/fuel-efficiency-service";
import type { Session } from "@/lib/auth";

/**
 * ບໍ່ຜູກສາຂາ — ແອັບບໍລິຫານເບິ່ງທຸກສາຂາ ຄືກັບຜູ້ໃຊ້ທີ່ບໍ່ມີ branch_codes.
 * ບັນດາ query ອ່ານແຕ່ branch_codes ຈຶ່ງພຽງພໍທີ່ຈະສົ່ງຄ່າຫວ່າງ.
 */
const ALL_BRANCHES = {
  usercode: "",
  username: "",
  logistic_code: "",
  department: "",
  title: "",
  emp_department_code: "",
  emp_department_name: "",
  position_title: "",
  app_role: "",
  position_code: "",
  branch_codes: "",
} satisfies Session;

/**
 * ສະຫຼຸບ GPS ລາຍເດືອນ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ — ຄືນຊຸດຂໍ້ມູນ
 * ອັນດຽວກັບ getGpsMonthlyOverview() ທີ່ໜ້າ /tracking/gps-monthly-summary ໃຊ້.
 *
 *   GET /api/reports/gps-monthly?from=YYYY-MM-DD&to=YYYY-MM-DD&window=30
 *       &refresh=1   → ດຶງຈາກ provider ໃໝ່ (ຊ້າ) ແທນການອ່ານ rollup
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

  const params = request.nextUrl.searchParams;
  const fromDate = params.get("from") ?? "";
  const toDate = params.get("to") ?? "";
  const windowDays = Number(params.get("window") ?? 30) || 30;
  const refresh = params.get("refresh") === "1";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isDate(fromDate) || !isDate(toDate)) {
    return Response.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const [rows, fuel, efficiency] = await Promise.all([
      refresh
        ? svcGetGpsUsageSummary(fromDate, toDate, undefined, { fillMissing: true })
        : svcGetGpsUsageSummaryCached(fromDate, toDate),
      svcGetFuelByCar({ fromDate, toDate, session: ALL_BRANCHES }),
      buildFuelEfficiency(ALL_BRANCHES, toDate, windowDays),
    ]);
    return Response.json({ ok: true, rows, fuel, efficiency });
  } catch (err) {
    console.error("[api] gps-monthly failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

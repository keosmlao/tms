import type { NextRequest } from "next/server";
import {
  getReportDailyDepartment,
  getReportDailyActivityBills,
  getReportDailyActivityItems,
  getReportPendingDaily,
} from "@/queries/reports.js";
import { getAvailableBillProducts } from "@/queries/bills.js";
import { getPodTracking, getPodSummary, getPodLiveFeed, getPodBillProof } from "@/queries/pod.js";
import { addDays, getLaoToday } from "@/lib/lao-date";

/**
 * ລາຍງານຂົນສົ່ງ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ — ອ່ານຢ່າງດຽວ,
 * ຊຸດຂໍ້ມູນອັນດຽວກັບໜ້າ /reports/* ແລະ /tracking/pod ຂອງ TMS.
 *
 *   GET /api/reports/logistics?report=pod|daily-department|daily-bills|daily-items|pending-daily|bill-products
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

  const p = request.nextUrl.searchParams;
  const report = p.get("report") ?? "";
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const branch = (p.get("branch") ?? "").trim();
  const doc = p.get("doc") ?? "";

  try {
    // ບໍ່ສົ່ງ session ໄປ — ແອັບບໍລິຫານເບິ່ງທຸກສາຂາ.
    let data: unknown;
    switch (report) {
      case "pod": {
        const opts = {
          session: {},
          fromDate: from,
          toDate: to,
          branch,
          driver: (p.get("driver") ?? "").trim(),
          state: (p.get("state") ?? "all").trim(),
          search: (p.get("search") ?? "").trim(),
          limit: Number(p.get("limit") ?? 300) || 300,
          requireSignature: p.get("requireSignature") === "1",
        };
        const [rows, summary] = await Promise.all([getPodTracking(opts), getPodSummary(opts)]);
        data = { rows, ...(summary as object) };
        break;
      }
      case "pod-live": {
        // ຄ່າເລີ່ມຕົ້ນຄືກັບ action getPodLiveFeed ຂອງ TMS: ຟີດສົດບອກແຕ່
        // "ຍ້ອນຫຼັງ N ນາທີ" ຈຶ່ງບໍ່ສົ່ງວັນທີມາ — ຕ້ອງຕັ້ງຊ່ວງ 3 ມື້ໃຫ້ເອງ
        // ບໍ່ດັ່ງນັ້ນ query ຈະລົ້ມ (ວັນທີເປັນສະຕຣິງຫວ່າງ).
        const minutes = Number(p.get("minutes") ?? 720) || 720;
        const today = getLaoToday();
        const rows = await getPodLiveFeed({
          session: {},
          fromDate: from || addDays(today, -3),
          toDate: to || today,
          minutes,
          limit: Number(p.get("limit") ?? 60) || 60,
          branch,
          driver: (p.get("driver") ?? "").trim(),
          requireSignature: p.get("requireSignature") === "1",
        });
        data = { rows, minutes };
        break;
      }
      case "pod-proof": {
        const bill = p.get("bill") ?? "";
        if (!bill) return Response.json({ error: "bill required" }, { status: 400 });
        data = await getPodBillProof(bill, doc || undefined);
        break;
      }
      case "daily-department":
        data = await getReportDailyDepartment({}, from, to, p.get("salesOnly") !== "0", branch);
        break;
      case "daily-bills":
        data = await getReportDailyActivityBills({}, from, to, branch);
        break;
      case "daily-items":
        data = await getReportDailyActivityItems({}, from, to, branch);
        break;
      case "pending-daily":
        data = await getReportPendingDaily({}, from, to);
        break;
      case "bill-products":
        if (!doc) return Response.json({ error: "doc required" }, { status: 400 });
        data = await getAvailableBillProducts(doc);
        break;
      default:
        return Response.json({ error: "unknown report" }, { status: 400 });
    }
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error(`[api] logistics ${report} failed:`, err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

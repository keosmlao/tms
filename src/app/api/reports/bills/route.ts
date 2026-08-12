import type { NextRequest } from "next/server";
import {
  getBillsWaitingSent,
  getBillsWaitingSentDetails,
  getBillsInProgress,
  getBillCompleteList,
} from "@/queries/bills.js";
import { getJobBillsWithProducts } from "@/queries/jobs.js";
import { getTransportBranches } from "@/queries/master-data.js";

/**
 * ລາຍການບິນ ສຳລັບແອັບອື່ນ (ODGMGT) ດຶງໄປສະແດງ — ອ່ານຢ່າງດຽວ.
 *
 * ⚠️ ບໍ່ເປີດຄຳສັ່ງທີ່ແກ້ຂໍ້ມູນ (ລຶບຖ້ຽວ, ຍ້າຍສາຂາ, ສົ່ງ LINE) ໄວ້ນີ້ —
 * ວຽກປະຕິບັດການເຫຼົ່ານັ້ນຕ້ອງເຮັດຢູ່ TMS ບ່ອນທີ່ມີ session ຂອງຜູ້ໃຊ້ຈິງ.
 *
 *   GET /api/reports/bills?list=waiting-sent|in-progress|complete|branches
 *       &from=YYYY-MM-DD&to=YYYY-MM-DD   (ສະເພາະ complete)
 *   GET /api/reports/bills?list=details&doc=<doc_no>
 *   GET /api/reports/bills?list=job-products&doc=<doc_no>
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
  const list = params.get("list") ?? "";
  const doc = params.get("doc") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  try {
    // ບໍ່ສົ່ງ session ໄປ — ແອັບບໍລິຫານເບິ່ງທຸກສາຂາ.
    let data: unknown;
    switch (list) {
      case "waiting-sent":
        data = await getBillsWaitingSent({});
        break;
      case "in-progress":
        data = await getBillsInProgress({});
        break;
      case "complete":
        data = await getBillCompleteList({}, from || undefined, to || undefined);
        break;
      case "branches":
        data = await getTransportBranches();
        break;
      case "details":
        if (!doc) return Response.json({ error: "doc required" }, { status: 400 });
        data = await getBillsWaitingSentDetails(doc);
        break;
      case "job-products":
        if (!doc) return Response.json({ error: "doc required" }, { status: 400 });
        data = await getJobBillsWithProducts(doc);
        break;
      default:
        return Response.json({ error: "unknown list" }, { status: 400 });
    }
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error(`[api] bills ${list} failed:`, err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

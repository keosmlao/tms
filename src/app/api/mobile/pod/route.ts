import type { NextRequest } from "next/server";
import { getPodLiveFeed, getPodBillProof } from "@/queries/pod.js";
import {
  isSupervisorSession,
  mobileErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { parseSearchParams } from "@/lib/validation";
import { PodQuerySchema } from "@/lib/mobile-schemas";
import { addDays, getLaoToday } from "@/lib/lao-date";

/**
 * ຫຼັກຖານການສົ່ງ (POD) ສຳລັບແອັບຫົວໜ້າ.
 *
 * ບໍ່ມີ `bill_no` = ຟີດບິນທີ່ຫາກໍປິດ (ເບົາ, ບໍ່ມີຮູບ) ໃຫ້ໜ້າລາຍການ poll ໄດ້.
 * ມີ `bill_no` = ຫຼັກຖານເຕັມຂອງບິນນັ້ນ ພ້ອມຮູບ base64 — ດຶງຕອນເປີດເບິ່ງເທົ່ານັ້ນ
 * ເພາະໜັກຫຼາຍ ບໍ່ຄວນຢູ່ໃນລາຍການ.
 *
 * ຄົນຂັບບໍ່ໄດ້ຮັບ: POD ຂ້າມທັງກອງລົດ ຈຶ່ງເປັນຂໍ້ມູນລະດັບຫົວໜ້າ. Query ກັ່ນຕາມ
 * ສາຂາຂອງ session ຢູ່ແລ້ວ (getBranchScope) ຈຶ່ງເຫັນສະເພາະສາຂາຂອງຕົນ.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!isSupervisorSession(session)) {
      const error = new Error("Forbidden");
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
    const { bill_no, doc_no, minutes, limit, branch, driver } =
      parseSearchParams(request.nextUrl.searchParams, PodQuerySchema);

    if (bill_no) {
      const proof = await getPodBillProof(bill_no, doc_no ?? "");
      if (!proof) {
        const error = new Error("ບໍ່ພົບຫຼັກຖານຂອງບິນນີ້");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
      return Response.json(proof);
    }

    const today = getLaoToday();
    const rows = await getPodLiveFeed({
      session,
      // Same 3-day floor as the web feed: a trip closed after midnight still
      // belongs to yesterday's date_logistic.
      fromDate: addDays(today, -3),
      toDate: today,
      minutes: minutes ?? 720,
      limit: limit ?? 50,
      branch: branch ?? "",
      driver: driver ?? "",
      requireSignature: false,
    });
    return Response.json(rows);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

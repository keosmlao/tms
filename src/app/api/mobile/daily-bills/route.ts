import type { NextRequest } from "next/server";
import { mobileDailyBills } from "@/queries/mobile.js";
import {
  isSupervisorSession,
  mobileErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { parseSearchParams } from "@/lib/validation";
import { DailyBillsQuerySchema } from "@/lib/mobile-schemas";
import { getLaoToday } from "@/lib/lao-date.js";

/**
 * ບິນທັງໝົດຂອງຊ່ອງໃດຊ່ອງໜຶ່ງໃນຕາລາງຍອດບິນປະຈຳວັນ.
 *
 * ຈໍຫົວໜ້າກົດຕົວເລກໃດ ກໍ່ຕ້ອງເຫັນ **ບິນ** ຂອງຕົວເລກນັ້ນ — ບໍ່ແມ່ນລາຍການ
 * ຖ້ຽວທີ່ຕ້ອງໄປໄລ່ຫາຕໍ່ອີກ.
 *
 * ຄົນຂັບເຂົ້າບໍ່ໄດ້: ນີ້ເປັນຕົວເລກທັງກອງ ຄືກັບ /api/mobile/jobs?scope=all.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!isSupervisorSession(session)) {
      const error = new Error("Forbidden");
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
    const { date, bucket } = parseSearchParams(
      request.nextUrl.searchParams,
      DailyBillsQuerySchema
    );
    // ວັນທີ່ຕ້ອງເປັນ "ມື້ນີ້ຕາມໂມງລາວ" ບໍ່ແມ່ນ UTC — ບໍ່ດັ່ງນັ້ນກ່ອນ 07:00
    // ຈະໄປອ່ານຂໍ້ມູນມື້ວານທັງໝົດ.
    const day = date && date.trim() ? date.trim() : getLaoToday();
    const bills = await mobileDailyBills(day, bucket);
    return Response.json({ date: day, bucket, count: bills.length, bills });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

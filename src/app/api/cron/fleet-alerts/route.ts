import type { NextRequest } from "next/server";
import { evaluateFleetAlerts } from "@/queries/fleet-alert.js";

// ແຈ້ງເຕືອນລົດຈອດດົນ / ອອກຈາກສາງແຕ່ຍັງບໍ່ກົດເລີ່ມຈັດສົ່ງ — ສົ່ງ LINE ຫາ
// ພະນັກງານສາຂາ. ຮຽກທຸກ 5 ນາທີ ຄືກັບ dispatch-reminders. Auth ໃຊ້ CRON_SECRET.
//
//   Authorization: Bearer <CRON_SECRET>
//
// ?dry=1 ກວດເບິ່ງຢ່າງດຽວ — ຄືນຂໍ້ຄວາມທີ່ຈະສົ່ງ ໂດຍບໍ່ສົ່ງ ແລະ ບໍ່ຂຽນ log.
// ໃຊ້ຢືນຢັນຂໍ້ຄວາມກ່ອນເປີດ setting fleet.alert_enabled.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const dryRun = request.nextUrl.searchParams.get("dry") === "1";
    const result = await evaluateFleetAlerts({ dryRun });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] fleet-alerts failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

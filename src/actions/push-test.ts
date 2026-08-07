"use server";

import { requireSession } from "./_helpers";
import {
  pushDiagnostics as svcDiagnostics,
  sendTestPush as svcSendTest,
} from "@/queries/push.js";

export interface PushTestResult {
  ok: boolean;
  /** Firebase credentials loaded on the server. */
  configured: boolean;
  /** Devices registered under this user in the driver app. */
  app_tokens: number;
  /** Devices registered under this user in the sales app. */
  sales_tokens: number;
  sent?: number;
  failed?: number;
  /** Lao message explaining what to fix; empty when everything worked. */
  error: string;
}

/**
 * ສະຖານະແຈ້ງເຕືອນຂອງບັນຊີທີ່ login ຢູ່ — ບໍ່ໄດ້ສົ່ງຫຍັງ.
 *
 * ໜ້າຈໍໂຫຼດອັນນີ້ກ່ອນ ຈຶ່ງບອກໄດ້ວ່າ "Firebase ຍັງບໍ່ຕັ້ງຄ່າ" ຫຼື "ຍັງບໍ່ໄດ້
 * ເປີດແອັບ" ໂດຍບໍ່ຕ້ອງລໍໃຫ້ຜູ້ໃຊ້ກົດຍິງກ່ອນ.
 */
export async function getPushStatus(): Promise<PushTestResult> {
  const session = await requireSession();
  const diagnostics = (await svcDiagnostics(session.usercode)) as Omit<
    PushTestResult,
    "ok"
  >;
  return { ok: diagnostics.configured, ...diagnostics };
}

/**
 * ຍິງແຈ້ງເຕືອນທົດສອບຫາ **ເຄື່ອງຂອງຜູ້ທີ່ກົດເອງ** ເທົ່ານັ້ນ.
 *
 * ຕັ້ງໃຈບໍ່ໃຫ້ເລືອກຜູ້ຮັບ: ປຸ່ມທົດສອບຢູ່ໜ້າຕັ້ງຄ່າທີ່ຫຼາຍຄົນເຂົ້າໄດ້ ຖ້າສົ່ງຫາ
 * ຄົນອື່ນໄດ້ ມັນຈະກາຍເປັນຊ່ອງທາງລົບກວນຄົນຂັບທັງກອງ.
 */
export async function sendPushTest(): Promise<PushTestResult> {
  const session = await requireSession();
  const result = (await svcSendTest(session.usercode, {
    title: "🔔 ທົດສອບແຈ້ງເຕືອນ",
    body: `ສົ່ງຈາກໜ້າຕັ້ງຄ່າໂດຍ ${session.username || session.usercode}`,
  })) as PushTestResult;
  return result;
}

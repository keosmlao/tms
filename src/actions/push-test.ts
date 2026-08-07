"use server";

import { requireDispatchAccess, requireSession } from "./_helpers";
import {
  listPushTargets as svcListTargets,
  pushDiagnostics as svcDiagnostics,
  sendTestPush as svcSendTest,
} from "@/queries/push.js";

export interface PushTarget {
  user_code: string;
  name: string;
  devices: number;
  /** Laos wall-clock stamp of the newest token, "" when unknown. */
  last_seen: string;
}

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
  /** Which device the test actually hit, e.g. "android · 2026-08-07 21:06". */
  target_device?: string;
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
 * ລາຍຊື່ເຄື່ອງທີ່ລົງທະບຽນຮັບແຈ້ງເຕືອນແລ້ວ — ໃຫ້ເລືອກເປັນເປົ້າໝາຍທົດສອບ.
 *
 * ຝ່າຍຂາຍເຂົ້າບໍ່ໄດ້ (`requireDispatchAccess`) ເພາະລາຍຊື່ນີ້ບອກວ່າໃຜເປີດແອັບ
 * ຢູ່ ແລະ ເປັນປະຕູໄປສູ່ການຍິງຫາຄົນອື່ນ.
 */
export async function listPushTargets(): Promise<PushTarget[]> {
  await requireDispatchAccess();
  return (await svcListTargets()) as PushTarget[];
}

/**
 * ຍິງແຈ້ງເຕືອນທົດສອບ — ຫາເຄື່ອງຕົນເອງ ຫຼື ຫາເຄື່ອງທີ່ເລືອກ.
 *
 * ຍິງຫາຄົນອື່ນຕ້ອງມີສິດຈັດການຖ້ຽວ ເພື່ອບໍ່ໃຫ້ປຸ່ມທົດສອບກາຍເປັນຊ່ອງທາງ
 * ລົບກວນຄົນຂັບທັງກອງ. ຍິງຫາຕົນເອງບໍ່ຈຳກັດ.
 */
export async function sendPushTest(
  targetCode?: string
): Promise<PushTestResult> {
  const session = await requireSession();
  const wanted = String(targetCode ?? "").trim();
  const target = wanted && wanted !== session.usercode ? wanted : null;
  if (target) await requireDispatchAccess();

  const by = session.username || session.usercode;
  const result = (await svcSendTest(target ?? session.usercode, {
    title: "🔔 ທົດສອບແຈ້ງເຕືອນ",
    body: `ສົ່ງຈາກໜ້າຕັ້ງຄ່າໂດຍ ${by}`,
  })) as PushTestResult;
  return result;
}

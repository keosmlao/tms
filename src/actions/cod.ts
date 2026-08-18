"use server";

import { requireSession, requireDispatchAccess } from "./_helpers";
import {
  getTripCodSummary as svcGetTripCodSummary,
  recordCodHandover as svcRecordCodHandover,
  deleteCodHandover as svcDeleteCodHandover,
  getCodReconciliation as svcGetCodReconciliation,
  getCodByDriver as svcGetCodByDriver,
  syncCodAmountsForOpenTrips as svcSyncCodAmounts,
} from "@/queries/cod.js";

// ໜ້າກະທົບຍອດເງິນ COD — 1 ແຖວ = 1 ຖ້ຽວທີ່ມີບິນເກັບເງິນປາຍທາງ.
export async function getCodReconciliation(
  fromDate: string,
  toDate: string,
  onlyOutstanding = false
) {
  const s = await requireSession();
  // ຖ້ຽວເກົ່າ / ບິນທີ່ ERP ແກ້ພາຍຫຼັງ ອາດຍັງບໍ່ມີຍອດ COD — ກວາດໃຫ້ກ່ອນອ່ານ
  // (throttled ພາຍໃນ ຈຶ່ງເປັນ no-op ເກືອບທຸກຄັ້ງ).
  await svcSyncCodAmounts();
  return svcGetCodReconciliation(s, fromDate, toDate, { onlyOutstanding });
}

export async function getTripCodSummary(docNo: string) {
  await requireSession();
  return svcGetTripCodSummary(docNo);
}

export async function getCodByDriver(fromDate: string, toDate: string) {
  const s = await requireSession();
  await svcSyncCodAmounts();
  return svcGetCodByDriver(s, fromDate, toDate);
}

// ການເງິນຮັບເງິນສົດຈາກຄົນຂັບ. ເປັນການແຕະເງິນ ຈຶ່ງກັນໄວ້ໃຫ້ສິດຈັດສົ່ງ ແລະ
// ບັນທຶກ audit ທຸກຄັ້ງ (ໃຜຮັບ ເທົ່າໃດ ເມື່ອໃດ).
export async function recordCodHandover(input: {
  doc_no: string;
  counted_amount: number;
  variance_reason?: string | null;
  remark?: string | null;
}) {
  const s = await requireDispatchAccess();
  const userCode =
    (s as { code?: string; usercode?: string })?.code ??
    (s as { usercode?: string })?.usercode;
  const result = await svcRecordCodHandover({
    docNo: input.doc_no,
    countedAmount: input.counted_amount,
    varianceReason: input.variance_reason ?? null,
    remark: input.remark ?? null,
    receivedBy: userCode ?? null,
  });
  const { recordAudit } = await import("@/queries/audit-log.js");
  await recordAudit({
    action: "cod.handover",
    entityType: "job",
    entityId: input.doc_no,
    userCode,
    changes: {
      counted_amount: input.counted_amount,
      expected_amount: result.expected_amount,
      variance_reason: input.variance_reason ?? null,
    },
  });
  return result;
}

export async function deleteCodHandover(docNo: string) {
  const s = await requireDispatchAccess();
  const userCode =
    (s as { code?: string; usercode?: string })?.code ??
    (s as { usercode?: string })?.usercode;
  const result = await svcDeleteCodHandover(docNo);
  const { recordAudit } = await import("@/queries/audit-log.js");
  await recordAudit({
    action: "cod.handover_deleted",
    entityType: "job",
    entityId: docNo,
    userCode,
  });
  return result;
}

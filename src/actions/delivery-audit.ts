"use server";

import { requireSession } from "./_helpers";
import {
  getDeliveryLocationAudit as svcAudit,
  getDeliveryLocationSummary as svcSummary,
} from "@/queries/delivery-audit.js";

/**
 * ບິນທີ່ປິດຫ່າງຈາກຈຸດສົ່ງທີ່ຮູ້ຂອງລູກຄ້າ + ພາບລວມ.
 *
 * ດຶງພ້ອມກັນເພື່ອໃຫ້ໜ້າສະແດງໄດ້ຄັ້ງດຽວ ແລະ ໃຫ້ຄົນອ່ານເຫັນ "ພາບລວມ" ກ່ອນ
 * ລາຍການ — ບໍ່ດັ່ງນັ້ນຈະເຂົ້າໃຈຜິດວ່າທຸກລາຍການທີ່ຂຶ້ນຄືການເຮັດຜິດ.
 */
export async function getDeliveryLocationReport(input: {
  fromDate?: string;
  toDate?: string;
  minKm?: number;
  branch?: string;
  limit?: number;
}) {
  await requireSession();
  const [rows, summary] = await Promise.all([
    svcAudit(input),
    svcSummary({ fromDate: input.fromDate, toDate: input.toDate }),
  ]);
  return { rows, summary };
}

"use server";

import { requireSession } from "./_helpers";
import {
  getPodTracking as svcTracking,
  getPodSummary as svcSummary,
  getPodLiveFeed as svcLiveFeed,
  getPodBillProof as svcProof,
} from "@/queries/pod.js";
import { addDays, getLaoToday } from "@/lib/lao-date";

export interface PodTrackingInput {
  fromDate?: string;
  toDate?: string;
  branch?: string;
  driver?: string;
  state?: string;
  search?: string;
  limit?: number;
  requireSignature?: boolean;
}

/**
 * ລາຍການ POD + ສະຫຼຸບ ໃນຄັ້ງດຽວ.
 *
 * ສະຫຼຸບຄິດຈາກ "ທັງຊ່ວງ" ສ່ວນລາຍການຖືກຕັດດ້ວຍ limit — ໜ້າຈໍຈຶ່ງບອກໄດ້ວ່າ
 * ຍັງມີບິນຄ້າງອີກ ເຖິງວ່າຕາຕະລາງຈະສະແດງບໍ່ໝົດ.
 */
export async function getPodTrackingReport(input: PodTrackingInput = {}) {
  const session = await requireSession();
  const opts = {
    session,
    fromDate: input.fromDate || addDays(getLaoToday(), -7),
    toDate: input.toDate || getLaoToday(),
    branch: (input.branch ?? "").trim(),
    driver: (input.driver ?? "").trim(),
    state: (input.state ?? "all").trim(),
    search: (input.search ?? "").trim(),
    limit: input.limit ?? 300,
    requireSignature: Boolean(input.requireSignature),
  };

  const [rows, summary] = await Promise.all([svcTracking(opts), svcSummary(opts)]);
  return { rows, ...summary };
}

/**
 * ຟີດສົດ — ບິນທີ່ຄົນຂັບຫາກໍປິດ ພ້ອມທຸງວ່າຖ່າຍຮູບ/ເຊັນ/ມີ GPS ບໍ.
 *
 * ໜ້າຈໍ poll ອັນນີ້ທຸກໆ 15 ວິນາທີ ຈຶ່ງຕ້ອງເບົາ: ບໍ່ມີ base64 ຂອງຮູບຢູ່ໃນນີ້ເລີຍ
 * (ຮູບໂຫຼດແຍກຕ່າງຫາກຕໍ່ບິນ ແລ້ວ cache ໄວ້ຢູ່ browser).
 */
export async function getPodLiveFeed(input: {
  minutes?: number;
  limit?: number;
  branch?: string;
  driver?: string;
  requireSignature?: boolean;
} = {}) {
  const session = await requireSession();
  const minutes = input.minutes ?? 720;
  const today = getLaoToday();

  const rows = await svcLiveFeed({
    session,
    // ຍ້ອນຫຼັງ 3 ມື້ພຽງພໍກັບຟີດທີ່ຍາວສຸດ (72 ຊົ່ວໂມງ) ແລະ ບໍ່ໃຫ້ query ກວ້າງເກີນ
    fromDate: addDays(today, -3),
    toDate: today,
    minutes,
    limit: input.limit ?? 60,
    branch: (input.branch ?? "").trim(),
    driver: (input.driver ?? "").trim(),
    requireSignature: Boolean(input.requireSignature),
  });

  // ເວລາ server ໄວ້ໃຫ້ໜ້າຈໍຄິດ "ຫາກໍປິດເມື່ອ x ນາທີກ່ອນ" ໂດຍບໍ່ຂຶ້ນກັບໂມງເຄື່ອງ
  return { rows, minutes };
}

/** ຫຼັກຖານເຕັມ (ຮູບ base64) ຂອງບິນດຽວ — ດຶງຕອນເປີດເບິ່ງເທົ່ານັ້ນ. */
export async function getPodBillProof(billNo: string, docNo?: string) {
  await requireSession();
  return svcProof(billNo, docNo ?? "");
}

"use server";

import { requireSession } from "./_helpers";
import {
  getBillShipmentData as svcGetBillShipmentData,
  saveBillShipment as svcSaveBillShipment,
} from "@/queries/bill-shipment.js";

export async function getBillShipmentData(search?: string) {
  const s = await requireSession();
  return svcGetBillShipmentData(s, search);
}

export async function saveBillShipment(docNo: string, transportCode: string) {
  const s = await requireSession();
  return svcSaveBillShipment(s, docNo, transportCode);
}

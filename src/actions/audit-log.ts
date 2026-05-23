"use server";

import { requireSession } from "./_helpers";
import { listAuditLog as svc } from "@/queries/audit-log.js";

export async function getAuditLog(input: {
  fromDate?: string;
  toDate?: string;
  entityType?: string;
  entityId?: string;
  userCode?: string;
  action?: string;
  limit?: number;
}) {
  await requireSession();
  return svc(input);
}

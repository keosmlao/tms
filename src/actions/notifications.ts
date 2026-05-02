"use server";

import { requireSession } from "./_helpers";
import { getActivityNotifications as svcGetActivityNotifications } from "@/queries/notifications.js";

export interface ActivityNotification {
  type: string;
  doc_no: string;
  bill_no: string | null;
  title: string;
  body: string;
  href: string;
  tone: string;
  event_time: string;
  age_seconds: number;
}

export async function getActivityNotifications(limit = 30): Promise<ActivityNotification[]> {
  const s = await requireSession();
  return svcGetActivityNotifications(s, limit) as Promise<ActivityNotification[]>;
}

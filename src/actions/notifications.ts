"use server";

import { requireSession } from "./_helpers";
import {
  getActivityNotifications as svcGetActivityNotifications,
  markActivityNotificationRead as svcMarkActivityNotificationRead,
  markAllActivityNotificationsRead as svcMarkAllActivityNotificationsRead,
} from "@/queries/notifications.js";

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
  notification_key: string;
  read: boolean;
}

export async function getActivityNotifications(limit = 30): Promise<ActivityNotification[]> {
  const s = await requireSession();
  return svcGetActivityNotifications(s, limit) as Promise<ActivityNotification[]>;
}

export async function markActivityNotificationRead(notificationKey: string) {
  const s = await requireSession();
  return svcMarkActivityNotificationRead(s, notificationKey) as Promise<{ success: boolean }>;
}

export async function markAllActivityNotificationsRead(limit = 80) {
  const s = await requireSession();
  return svcMarkAllActivityNotificationsRead(s, limit) as Promise<{
    success: boolean;
    marked?: number;
  }>;
}

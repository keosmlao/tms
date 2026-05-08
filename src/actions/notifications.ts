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

function isTransientDbError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; cause?: unknown };
  const message = String(err.message ?? "");
  const causeMessage =
    err.cause && typeof err.cause === "object"
      ? String((err.cause as { message?: string }).message ?? "")
      : "";
  return (
    err.code === "ETIMEDOUT" ||
    message.includes("ETIMEDOUT") ||
    message.includes("read ETIMEDOUT") ||
    causeMessage.includes("ETIMEDOUT")
  );
}

export async function getActivityNotifications(limit = 30): Promise<ActivityNotification[]> {
  const s = await requireSession();
  try {
    return (await svcGetActivityNotifications(s, limit)) as ActivityNotification[];
  } catch (error) {
    if (isTransientDbError(error)) {
      console.warn("[notifications] skipped activity fetch after database timeout");
      return [];
    }
    throw error;
  }
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

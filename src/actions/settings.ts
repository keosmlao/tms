"use server";

import { requireSession } from "./_helpers";
import {
  getSettings as svcGetSettings,
  setSettings as svcSetSettings,
} from "@/queries/settings.js";

const NOTIFY_KEYS = [
  "line.test_enabled",
  "line.test_to",
  "line.customer.test_enabled",
  "line.customer.test_to",
  "whatsapp.test_enabled",
  "whatsapp.test_to",
  "pending.not_yet_days",
  // Driver-app feature flag. "1" = QR-scan verify button visible in bill rows;
  // anything else hides it. Defaulted to "1" in the dashboard form.
  "app.qr_scan_verify_enabled",
] as const;

export interface NotifySettings {
  "line.test_enabled": string;
  "line.test_to": string;
  "line.customer.test_enabled": string;
  "line.customer.test_to": string;
  "whatsapp.test_enabled": string;
  "whatsapp.test_to": string;
  "pending.not_yet_days": string;
  "app.qr_scan_verify_enabled": string;
}

export async function getNotifySettings(): Promise<NotifySettings> {
  await requireSession();
  return svcGetSettings(NOTIFY_KEYS as unknown as string[]) as Promise<NotifySettings>;
}

export async function saveNotifySettings(input: Partial<NotifySettings>) {
  const s = await requireSession();
  const filtered: Record<string, string> = {};
  for (const key of NOTIFY_KEYS) {
    if (key in input) {
      filtered[key] = input[key] ?? "";
    }
  }
  return svcSetSettings(filtered, (s as { code?: string })?.code);
}

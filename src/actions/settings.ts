"use server";

import { requireSession } from "./_helpers";
import {
  getSettings as svcGetSettings,
  setSettings as svcSetSettings,
} from "@/queries/settings.js";

const NOTIFY_KEYS = [
  "line.test_enabled",
  "line.test_to",
  "whatsapp.test_enabled",
  "whatsapp.test_to",
] as const;

export interface NotifySettings {
  "line.test_enabled": string;
  "line.test_to": string;
  "whatsapp.test_enabled": string;
  "whatsapp.test_to": string;
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

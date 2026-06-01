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
  // Driver-app version gate. min_version = oldest build allowed (older builds
  // are forced to update). latest_version = newest build (soft prompt). The
  // two URLs point drivers to the store/APK per platform. Empty min = gate off.
  "app.mobile.min_version",
  "app.mobile.latest_version",
  "app.mobile.update_url_android",
  "app.mobile.update_url_ios",
  // Delivery KPI targets shown on the dashboard. Stored as strings so empty
  // means "no target." Rates are percent (0-100); times are minutes.
  "kpi.target_on_time_rate",
  "kpi.target_avg_delivery_minutes",
  "kpi.target_avg_close_minutes",
  // KPI alert: when yesterday's KPI is below target, send LINE message to this
  // user/group. Empty = disabled.
  "kpi.alert_enabled",
  "kpi.alert_line_to",
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
  "app.mobile.min_version": string;
  "app.mobile.latest_version": string;
  "app.mobile.update_url_android": string;
  "app.mobile.update_url_ios": string;
  "kpi.target_on_time_rate": string;
  "kpi.target_avg_delivery_minutes": string;
  "kpi.target_avg_close_minutes": string;
  "kpi.alert_enabled": string;
  "kpi.alert_line_to": string;
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

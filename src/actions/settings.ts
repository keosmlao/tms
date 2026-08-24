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
  // ດຶງໃບຂໍໂອນສິນຄ້າລະຫວ່າງສາງຂອງ ERP (ic_trans trans_flag 124) ເຂົ້າຄິວ
  // ບິນລໍຈັດຖ້ຽວ ຫຼື ບໍ່. "0" = ປິດ; ຢ່າງອື່ນ (ລວມທັງບໍ່ຕັ້ງ) = ເປີດ.
  "pending.erp_transfer_enabled",
  // Driver-app feature flag. "1" = QR-scan verify button visible in bill rows;
  // anything else hides it. Defaulted to "1" in the dashboard form.
  "app.qr_scan_verify_enabled",
  // Master switch for receiving phone GPS. "0" = the app stops posting
  // positions, stops forcing staff to keep location on, and the server drops
  // any GPS an older build still sends. Anything else (incl. unset) = on.
  "app.mobile.location_tracking_enabled",
  // Driver-app version gate. min_version = oldest build allowed (older builds
  // are forced to update). latest_version = newest build (soft prompt). The
  // two URLs point drivers to the store/APK per platform. Empty min = gate off.
  "app.mobile.min_version",
  // "auto" = ຂັ້ນຕ່ຳຕິດຕາມ APK ທີ່ວາງໃຫ້ໂຫຼດຢູ່ /tms.apk ເອງ (ອ່ານຈາກ
  // public/tms.apk.version) ຈຶ່ງບໍ່ຕ້ອງພິມເລກທຸກຄັ້ງທີ່ອອກລຸ້ນໃໝ່.
  // ຢ່າງອື່ນ (ລວມທັງບໍ່ຕັ້ງ) = ໃຊ້ min_version ທີ່ພິມເອງ.
  "app.mobile.min_version_mode",
  // "0" = ບັງຄັບທັນທີ. ຢ່າງອື່ນ (ຄ່າເລີ່ມຕົ້ນ) = ລໍໃຫ້ປິດຖ້ຽວກ່ອນ ຈຶ່ງບັງຄັບ
  // — ບໍ່ລັອກຄົນຂັບອອກກາງທາງ.
  "app.mobile.force_after_trip",
  "app.mobile.latest_version",
  "app.mobile.update_url_android",
  "app.mobile.update_url_ios",
  // Delivery KPI targets shown on the dashboard. Stored as strings so empty
  // means "no target." Rates are percent (0-100); times are minutes.
  "kpi.target_on_time_rate",
  "kpi.target_avg_delivery_minutes",
  "kpi.target_avg_close_minutes",
  "kpi.target_cost_per_km",
  "kpi.target_cost_per_trip",
  "kpi.target_load_pct",
  // KPI alert: when yesterday's KPI is below target, send LINE message to this
  // user/group. Empty = disabled.
  "kpi.alert_enabled",
  "kpi.alert_line_to",
  // ແຈ້ງເຕືອນລົດ (fleet-alert.js): ລົດຈອດດົນ / ອອກຈາກສາງແຕ່ບໍ່ກົດເລີ່ມຈັດສົ່ງ.
  // ສົ່ງ LINE ຫາພະນັກງານສາຂາທີ່ມີ line_id ຈຶ່ງບໍ່ຕ້ອງຕັ້ງລາຍຊື່ຜູ້ຮັບຢູ່ນີ້.
  "fleet.alert_enabled",
  "fleet.parked_minutes",
  "fleet.left_base_metres",
  "tv.pages",
  "tv.secs",
] as const;

export interface NotifySettings {
  "line.test_enabled": string;
  "line.test_to": string;
  "line.customer.test_enabled": string;
  "line.customer.test_to": string;
  "whatsapp.test_enabled": string;
  "whatsapp.test_to": string;
  "pending.not_yet_days": string;
  "pending.erp_transfer_enabled": string;
  "app.qr_scan_verify_enabled": string;
  "app.mobile.location_tracking_enabled": string;
  "app.mobile.min_version": string;
  "app.mobile.min_version_mode": string;
  "app.mobile.force_after_trip": string;
  "app.mobile.latest_version": string;
  "app.mobile.update_url_android": string;
  "app.mobile.update_url_ios": string;
  "kpi.target_on_time_rate": string;
  "kpi.target_avg_delivery_minutes": string;
  "kpi.target_avg_close_minutes": string;
  "kpi.target_cost_per_km": string;
  "kpi.target_cost_per_trip": string;
  "kpi.target_load_pct": string;
  "kpi.alert_enabled": string;
  "kpi.alert_line_to": string;
  "fleet.alert_enabled": string;
  "fleet.parked_minutes": string;
  "fleet.left_base_metres": string;
  "tv.pages": string;
  "tv.secs": string;
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

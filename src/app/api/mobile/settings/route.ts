import { getSettings } from "@/queries/settings.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";

// Allow-list of settings safe to expose to the driver app. New mobile feature
// flags belong here; nothing else from `odg_tms_setting` should leak.
const MOBILE_KEYS = ["app.qr_scan_verify_enabled"] as const;

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const raw = (await getSettings(MOBILE_KEYS as unknown as string[])) as Record<string, string>;
    // Defaults: keep features on unless an admin has explicitly disabled them.
    // Empty string = no row in DB yet = treat as enabled.
    const isOn = (v: string | undefined) =>
      v === "1" || v === "true" || v === "" || v === undefined;
    return Response.json({
      qr_scan_verify_enabled: isOn(raw["app.qr_scan_verify_enabled"]),
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

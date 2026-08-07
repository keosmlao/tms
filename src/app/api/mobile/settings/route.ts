import type { NextRequest } from "next/server";
import { getSettings } from "@/queries/settings.js";
import {
  isSupervisorSession,
  mobileErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { evaluateMobileAppVersion } from "@/lib/app-version";
import {
  LOCATION_TRACKING_KEY,
  isLocationTrackingEnabled,
} from "@/lib/mobile-tracking";

// Allow-list of settings safe to expose to the driver app. New mobile feature
// flags belong here; nothing else from `odg_tms_setting` should leak.
const MOBILE_KEYS = [
  "app.qr_scan_verify_enabled",
  LOCATION_TRACKING_KEY,
] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const raw = (await getSettings(MOBILE_KEYS as unknown as string[])) as Record<string, string>;
    // Defaults: keep features on unless an admin has explicitly disabled them.
    // Empty string = no row in DB yet = treat as enabled.
    const isOn = (v: string | undefined) =>
      v === "1" || v === "true" || v === "" || v === undefined;
    // requireMobileSession already 426s when a forced update is required, so
    // reaching here means the version is allowed; include the policy anyway so
    // the app can show a soft "update available" prompt.
    const app_update = await evaluateMobileAppVersion(request);
    // The wall-board URL carries the TV data key, so it goes to operations
    // sessions only — a driver token must never learn the fleet-wide key.
    const tvKey = (process.env.TV_DASHBOARD_TOKEN ?? "").trim();
    const tvUrl =
      tvKey && isSupervisorSession(session)
        ? `${request.nextUrl.origin}/tv?key=${encodeURIComponent(tvKey)}`
        : "";
    return Response.json({
      qr_scan_verify_enabled: isOn(raw["app.qr_scan_verify_enabled"]),
      // Master switch for phone GPS. The app polls this endpoint on a short
      // cycle, so flipping it in the dashboard reaches every handset within
      // that window — no re-login, no new build.
      location_tracking_enabled: isLocationTrackingEnabled(
        raw[LOCATION_TRACKING_KEY]
      ),
      tv_url: tvUrl,
      app_update,
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

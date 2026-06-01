// Driver-app version gate. The mobile app sends its version (and platform) on
// every request via the `x-app-version` / `x-app-platform` headers. When an
// admin sets a minimum required version in settings, any app reporting an older
// version — or no version at all (an old build from before version reporting) —
// is forced to update before it can use the protected mobile API.
import type { NextRequest } from "next/server";
import { getSettings } from "@/queries/settings.js";
import { compareVersions, parseVersion } from "@/lib/version-compare";

export { compareVersions, parseVersion };

const VERSION_KEYS = [
  "app.mobile.min_version",
  "app.mobile.latest_version",
  "app.mobile.update_url_android",
  "app.mobile.update_url_ios",
] as const;

export interface MobileAppUpdate {
  // App version is below the admin-set minimum (or missing) — block usage.
  force_update: boolean;
  // A newer version exists but the current one is still allowed — soft prompt.
  update_available: boolean;
  min_version: string;
  latest_version: string;
  current_version: string;
  platform: string;
  update_url: string;
}

function header(request: Request | NextRequest, name: string): string {
  return (request.headers.get(name) ?? "").trim();
}

/**
 * Read the version policy from settings + the app's reported version, and work
 * out whether the app must update. Never throws — callers decide whether to
 * block (see {@link assertMobileAppVersion}) or just surface the info.
 */
export async function evaluateMobileAppVersion(
  request: Request | NextRequest
): Promise<MobileAppUpdate> {
  const raw = (await getSettings(VERSION_KEYS as unknown as string[])) as Record<
    string,
    string
  >;
  const minVersion = (raw["app.mobile.min_version"] ?? "").trim();
  const latestVersion = (raw["app.mobile.latest_version"] ?? "").trim();
  const current = header(request, "x-app-version");
  const platform = header(request, "x-app-platform").toLowerCase();
  const updateUrl = (
    (platform === "ios"
      ? raw["app.mobile.update_url_ios"]
      : raw["app.mobile.update_url_android"]) ?? ""
  ).trim();

  // No minimum configured → gate is off; let every app through.
  const forceUpdate = minVersion
    ? !current || compareVersions(current, minVersion) < 0
    : false;
  const updateAvailable =
    forceUpdate ||
    (!!latestVersion && !!current && compareVersions(current, latestVersion) < 0);

  return {
    force_update: forceUpdate,
    update_available: updateAvailable,
    min_version: minVersion,
    latest_version: latestVersion,
    current_version: current,
    platform,
    update_url: updateUrl,
  };
}

export class AppUpdateRequiredError extends Error {
  status = 426;
  details: Record<string, unknown>;
  constructor(update: MobileAppUpdate) {
    super("ກະລຸນາອັບເດດແອັບເປັນເວີຊັນຫຼ້າສຸດກ່ອນໃຊ້ງານ");
    this.name = "AppUpdateRequiredError";
    // mobileErrorResponse spreads `details` into the JSON body so the app can
    // read force_update + the store URL straight off the 426 response.
    this.details = { force_update: true, app_update: update };
  }
}

/**
 * Throw a 426 (Upgrade Required) when the app must update. Returns the update
 * info otherwise. Call after authenticating so every protected route enforces
 * the gate uniformly.
 */
export async function assertMobileAppVersion(
  request: Request | NextRequest
): Promise<MobileAppUpdate> {
  const update = await evaluateMobileAppVersion(request);
  if (update.force_update) throw new AppUpdateRequiredError(update);
  return update;
}

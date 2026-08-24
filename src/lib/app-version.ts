// Driver-app version gate. The mobile app sends its version (and platform) on
// every request via the `x-app-version` / `x-app-platform` headers. When an
// admin sets a minimum required version in settings, any app reporting an older
// version — or no version at all (an old build from before version reporting) —
// is forced to update before it can use the protected mobile API.
import type { NextRequest } from "next/server";
import { getSettings } from "@/queries/settings.js";
import { driverHasOpenTrip } from "@/queries/mobile.js";
import { compareVersions, parseVersion } from "@/lib/version-compare";
import { shippedAppVersion } from "@/lib/shipped-app-version";

export { compareVersions, parseVersion };

const VERSION_KEYS = [
  "app.mobile.min_version",
  "app.mobile.min_version_mode",
  "app.mobile.force_after_trip",
  "app.mobile.latest_version",
  "app.mobile.update_url_android",
  "app.mobile.update_url_ios",
] as const;

export interface MobileAppUpdate {
  // App version is below the admin-set minimum (or missing) — block usage.
  force_update: boolean;
  // A newer version exists but the current one is still allowed — soft prompt.
  update_available: boolean;
  // ຕ່ຳກວ່າຂັ້ນຕ່ຳຈິງ ແຕ່ຍັງປ່ອຍຜ່ານເພາະຄົນຂັບມີຖ້ຽວຄ້າງຢູ່. ແອັບເອົາອັນນີ້
  // ໄປສະແດງແຖບເຕືອນວ່າ "ປິດຖ້ຽວແລ້ວຕ້ອງອັບເດດ".
  update_after_trip: boolean;
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
  request: Request | NextRequest,
  // ລະຫັດຄົນຂັບຈາກ token. ມີ = ຕັດສິນໄດ້ວ່າກຳລັງແລ່ນຖ້ຽວຢູ່ບໍ່ ຈຶ່ງເລື່ອນ
  // ການບັງຄັບອອກໄປໄດ້. ບໍ່ມີ (ເຊັ່ນຕອນ login) = ບັງຄັບຕາມປົກກະຕິ.
  driverId = ""
): Promise<MobileAppUpdate> {
  const raw = (await getSettings(VERSION_KEYS as unknown as string[])) as Record<
    string,
    string
  >;
  const mode = (raw["app.mobile.min_version_mode"] ?? "").trim().toLowerCase();
  // ໂໝດອັດຕະໂນມັດ: ຂັ້ນຕ່ຳ = ເວີຊັນຂອງ APK ທີ່ວາງໃຫ້ໂຫຼດຢູ່ `/tms.apk`.
  // ອອກ APK ໃໝ່ = ຂັ້ນຕ່ຳຂະຫຍັບເອງ ບໍ່ຕ້ອງມີໃຜພິມເລກ. ຖ້າອ່ານໄຟລ໌ເວີຊັນບໍ່
  // ໄດ້ ຈະຕົກກັບໄປໃຊ້ຄ່າທີ່ຕັ້ງດ້ວຍມື — ບໍ່ແມ່ນລັອກທຸກຄົນອອກ.
  const shipped = mode === "auto" ? await shippedAppVersion() : "";
  const manualMin = (raw["app.mobile.min_version"] ?? "").trim();
  const minVersion = mode === "auto" ? shipped || manualMin : manualMin;
  // ໂໝດອັດຕະໂນມັດ: APK ທີ່ວາງຢູ່ຄື "ຫຼ້າສຸດ" ຕາມນິຍາມ ຈຶ່ງມາກ່ອນຄ່າທີ່
  // ພິມໄວ້ — ບໍ່ດັ່ງນັ້ນເລກເກົ່າທີ່ຄ້າງຢູ່ໃນຕັ້ງຄ່າຈະທັບເວີຊັນຈິງ.
  const latestVersion =
    shipped || (raw["app.mobile.latest_version"] ?? "").trim();
  // ຄ່າເລີ່ມຕົ້ນ = ເລື່ອນ. ການລັອກຄົນຂັບອອກກາງຖ້ຽວແພງກວ່າການປ່ອຍໃຫ້ລຸ້ນ
  // ເກົ່າແລ່ນຕໍ່ອີກ 2–3 ຊົ່ວໂມງຈົນປິດຖ້ຽວ.
  const forceAfterTrip =
    (raw["app.mobile.force_after_trip"] ?? "").trim() !== "0";
  const current = header(request, "x-app-version");
  const platform = header(request, "x-app-platform").toLowerCase();
  const updateUrl = (
    (platform === "ios"
      ? raw["app.mobile.update_url_ios"]
      : raw["app.mobile.update_url_android"]) ?? ""
  ).trim();

  // No minimum configured → gate is off; let every app through.
  const belowMinimum = minVersion
    ? !current || compareVersions(current, minVersion) < 0
    : false;

  // ຕ່ຳກວ່າຂັ້ນຕ່ຳ ແຕ່ຍັງມີຖ້ຽວຄ້າງ → ຍັງບໍ່ບັງຄັບ ພຽງແຕ່ໝາຍໄວ້.
  const deferred =
    belowMinimum && forceAfterTrip && (await hasOpenTrip(driverId));
  const forceUpdate = belowMinimum && !deferred;
  // ຕອນເລື່ອນ ຕ້ອງປິດ `update_available` ນຳ. ເຫດຜົນ: ແອັບຖືວ່າ **ທຸກການ
  // ອັບເດດເປັນການບັງຄັບ** ຈຶ່ງບລັອກຕົວເອງເມື່ອເຫັນທຸງນີ້ ໂດຍບໍ່ສົນ
  // force_update. ລຸ້ນເກົ່າທີ່ຍັງບໍ່ຮູ້ຈັກ `update_after_trip` ຈະບລັອກເອງ
  // ແລ້ວດີດຄົນຂັບອອກກາງຖ້ຽວ — ເຊິ່ງເປັນສິ່ງດຽວກັບທີ່ການເລື່ອນນີ້ຫຼີກຢູ່.
  // ປິດທັງສອງທຸງຈຶ່ງເຮັດໃຫ້ການເລື່ອນໄດ້ຜົນກັບ **ທຸກລຸ້ນ** ບໍ່ແມ່ນສະເພາະ
  // ລຸ້ນໃໝ່; ລຸ້ນໃໝ່ຍັງເຫັນ `update_after_trip` ໄປສະແດງແຖບເຕືອນໄດ້.
  const updateAvailable =
    !deferred &&
    (belowMinimum ||
      (!!latestVersion &&
        !!current &&
        compareVersions(current, latestVersion) < 0));

  return {
    force_update: forceUpdate,
    update_available: updateAvailable,
    update_after_trip: deferred,
    min_version: minVersion,
    latest_version: latestVersion,
    current_version: current,
    platform,
    update_url: updateUrl,
  };
}

/**
 * ຫໍ່ການຖາມ DB ໄວ້: ຄຳຖາມນີ້ຢູ່ໃນເສັ້ນທາງຂອງ **ທຸກ request** ຂອງມືຖື ຈຶ່ງບໍ່
 * ຄວນຍິງເມື່ອ gate ບໍ່ໄດ້ຈະບັງຄັບຢູ່ແລ້ວ (ຜູ້ເອີ້ນກວດ `belowMinimum` ກ່ອນ).
 * ຖາມບໍ່ໄດ້ = ຖືວ່າ "ມີຖ້ຽວຄ້າງ" ຈຶ່ງບໍ່ບັງຄັບ — ຜິດພາດໄປທາງທີ່ບໍ່ຢຸດວຽກ.
 */
async function hasOpenTrip(driverId: string): Promise<boolean> {
  if (!driverId) return false;
  try {
    return await (driverHasOpenTrip as (id: string) => Promise<boolean>)(
      driverId
    );
  } catch {
    return true;
  }
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
  request: Request | NextRequest,
  driverId = ""
): Promise<MobileAppUpdate> {
  const update = await evaluateMobileAppVersion(request, driverId);
  if (update.force_update) throw new AppUpdateRequiredError(update);
  return update;
}

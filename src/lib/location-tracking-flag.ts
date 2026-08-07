/**
 * Setting key for "receive location from the mobile app".
 *
 * Turning it off stops the whole chain: the app stops posting GPS, stops
 * forcing staff to keep location switched on, and the server rejects any GPS
 * that an older build still tries to send.
 */
export const LOCATION_TRACKING_KEY = "app.mobile.location_tracking_enabled";

/**
 * Settings store strings and a key that has never been saved reads as "".
 * Tracking is ON unless an admin explicitly turned it off, so an empty/missing
 * value means enabled — the same convention as the other driver-app flags.
 *
 * Pure + DB-free so it can be unit-tested; the settings-reading wrapper lives
 * in `mobile-tracking.ts`.
 */
export function isLocationTrackingEnabled(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const text = String(value).trim().toLowerCase();
  if (text === "") return true;
  return !(text === "0" || text === "false" || text === "off" || text === "no");
}

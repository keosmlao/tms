import { getSettings } from "@/queries/settings.js";
import {
  LOCATION_TRACKING_KEY,
  isLocationTrackingEnabled,
} from "@/lib/location-tracking-flag";

export { LOCATION_TRACKING_KEY, isLocationTrackingEnabled };

/** Read the live flag from settings (30s-cached in the query layer). */
export async function locationTrackingEnabled(): Promise<boolean> {
  const raw = (await getSettings([LOCATION_TRACKING_KEY])) as Record<
    string,
    string
  >;
  return isLocationTrackingEnabled(raw[LOCATION_TRACKING_KEY]);
}

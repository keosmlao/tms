"use server";

import { requireSession } from "./_helpers";
import {
  listGeofences as svcListGeofences,
  saveGeofence as svcSaveGeofence,
} from "@/queries/geofence.js";

export interface GeofenceRow {
  transport_code: string;
  name: string;
  enabled: boolean;
  start_lat: string;
  start_lng: string;
  end_lat: string;
  end_lng: string;
  radius_m: number;
}

export async function getGeofences(): Promise<GeofenceRow[]> {
  await requireSession();
  return svcListGeofences() as Promise<GeofenceRow[]>;
}

export async function saveGeofenceConfig(input: {
  transport_code: string;
  enabled: boolean;
  start_lat: string;
  start_lng: string;
  end_lat: string;
  end_lng: string;
  radius_m: number | string;
}) {
  const s = await requireSession();
  return svcSaveGeofence({ ...input, userCode: s.usercode });
}

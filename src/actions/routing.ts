"use server";

import { requireSession } from "./_helpers";
import {
  buildOsrmPath,
  buildOsrmUrl,
  parseOsrmRoute,
  type DrivingRoute,
  type RoutePoint,
} from "@/lib/osrm";

/**
 * Road route between a trip's stops, from the server.
 *
 * Proxied rather than called from the browser so the dashboard keeps working
 * where clients can't reach the internet, and so one cache serves everyone —
 * the same handful of routes gets opened over and over.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // routes don't move
const TIMEOUT_MS = 12_000;

interface CacheEntry {
  at: number;
  route: DrivingRoute | null;
}
const routingCache = globalThis as unknown as {
  __tmsRoutingCache?: Map<string, CacheEntry>;
};

function cache() {
  if (!routingCache.__tmsRoutingCache) {
    routingCache.__tmsRoutingCache = new Map();
  }
  return routingCache.__tmsRoutingCache;
}

export interface DrivingRouteResult {
  route: DrivingRoute | null;
  /** Lao message when there is no route to show. */
  error?: string;
}

export async function getDrivingRoute(
  points: RoutePoint[]
): Promise<DrivingRouteResult> {
  await requireSession();
  const path = buildOsrmPath(points ?? []);
  if (!path) {
    return { route: null, error: "ຕ້ອງປັກໝຸດຢ່າງໜ້ອຍ 2 ຈຸດ ຈຶ່ງຄິດໄລ່ໄດ້" };
  }

  const hit = cache().get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.route
      ? { route: hit.route }
      : { route: null, error: "ຫາເສັ້ນທາງຕາມຖະໜົນບໍ່ພົບ" };
  }

  try {
    const response = await fetch(buildOsrmUrl(path), {
      headers: { "User-Agent": "ODG-TMS/1.0 (dispatch dashboard)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        route: null,
        error: `ບໍລິການແຜນທີ່ຕອບກັບ ${response.status} — ລອງໃໝ່ພາຍຫຼັງ`,
      };
    }
    const route = parseOsrmRoute(await response.json());
    // Cache the miss too: a pair of pins with no road between them would
    // otherwise re-query on every open.
    cache().set(path, { at: Date.now(), route });
    return route
      ? { route }
      : {
          route: null,
          error: "ຫາເສັ້ນທາງຕາມຖະໜົນລະຫວ່າງຈຸດເຫຼົ່ານີ້ບໍ່ພົບ",
        };
  } catch (error) {
    console.error("getDrivingRoute", error);
    return {
      route: null,
      error: "ຕິດຕໍ່ບໍລິການແຜນທີ່ບໍ່ໄດ້ — ກວດອິນເຕີເນັດຂອງເຊີບເວີ",
    };
  }
}

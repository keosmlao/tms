import { mobileSaveLocations } from "@/queries/mobile.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody } from "@/lib/validation";
import { LocationBatchSchema } from "@/lib/mobile-schemas";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Ingest a buffered batch of the driver's device GPS points (collected ~every
// 3s on-device) for one active trip. Auth runs first so the rate-limit bucket
// can be keyed per driver — multiple drivers behind one office NAT must not
// share a per-IP budget. The limit is generous because each request already
// carries many points; it only exists to cap a misbehaving client.
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const limit = rateLimit(request, {
      bucket: "mobile-location",
      key: session.driver_id,
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await parseJsonBody(request, LocationBatchSchema);
    const data = await mobileSaveLocations({
      doc_no: body.doc_no,
      driver_id: session.driver_id,
      imei: body.imei,
      device: body.device,
      points: body.points,
    });
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

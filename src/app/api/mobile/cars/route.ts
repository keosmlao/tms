import { query } from "@/lib/db.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const { searchParams } = new URL(request.url);
    // Accept explicit driver_id param (same pattern as /api/mobile/jobs).
    // Fall back to the session's driver_id if not provided.
    const driverId = searchParams.get("driver_id")?.trim() || session.driver_id;

    const rows = await query<{ code: string; name: string; plate_no: string }>(
      `SELECT b.code, COALESCE(b.name_1, '') AS name, COALESCE(b.plate_no, '') AS plate_no
       FROM public.odg_tms a
       JOIN public.odg_tms_car b ON b.code = a.car
       WHERE a.driver = $1
       GROUP BY b.code, b.name_1, b.plate_no
       ORDER BY b.code`,
      [driverId]
    );

    return Response.json(rows);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

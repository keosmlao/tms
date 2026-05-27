import { getSession } from "@/lib/auth";
import { query } from "@/lib/db.js";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await query(`
      SELECT
        (
          SELECT COUNT(DISTINCT car_code)
          FROM public.odg_tms_inspect
          WHERE inspect_date = CURRENT_DATE
        )::int AS inspected_today,
        (
          SELECT COUNT(DISTINCT i.car_code)
          FROM public.odg_tms_inspect i
          WHERE i.inspect_date = CURRENT_DATE
            AND EXISTS(
              SELECT 1 FROM public.odg_tms_inspect_detail d
              WHERE d.inspect_code = i.inspect_code
                AND d.status_code != (SELECT MIN(status_code) FROM public.odg_tms_inspect_status)
            )
        )::int AS vehicles_with_issues,
        (SELECT COUNT(*)::int FROM public.odg_tms_car) AS total_vehicles,
        (
          SELECT COUNT(*)::int
          FROM public.odg_tms_inspect
          WHERE COALESCE(approval_status, 'pending') = 'pending'
        ) AS pending_approval
    `);
    return Response.json(rows[0]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[inspections/summary] request failed:", error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

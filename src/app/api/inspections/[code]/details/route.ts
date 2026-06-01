import { getSession } from "@/lib/auth";
import { query } from "@/lib/db.js";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { code } = await params;
    const rows = await query(
      `SELECT
         d.item_code,
         it.item_name,
         s.status_name,
         s.status_code
       FROM public.odg_tms_inspect_detail d
       JOIN public.odg_tms_inspect_item it ON it.item_code = d.item_code
       JOIN public.odg_tms_inspect_status s ON s.status_code = d.status_code
       WHERE d.inspect_code = $1
         AND d.status_code != (SELECT MIN(status_code) FROM public.odg_tms_inspect_status)
       ORDER BY s.status_code ASC, it.sort_order ASC, it.item_code ASC`,
      [code]
    );
    return Response.json(rows);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[inspections/details] request failed:", error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

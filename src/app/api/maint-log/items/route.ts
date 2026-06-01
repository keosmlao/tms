import { getSession } from "@/lib/auth";
import { query } from "@/lib/db.js";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  try {
    const params: string[] = [];
    let whereClause = "";
    if (q) {
      params.push(`%${q}%`);
      whereClause = `WHERE item_code ILIKE $1 OR item_name ILIKE $1`;
    }
    const rows = await query(
      `SELECT item_code, item_name
       FROM public.odg_tms_inspect_item
       ${whereClause}
       ORDER BY sort_order ASC, item_code ASC
       LIMIT 20`,
      params
    );
    return Response.json(rows);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[maint-log/items]", error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

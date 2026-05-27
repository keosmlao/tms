import { query } from "@/lib/db.js";
import { getSession } from "@/lib/auth";
import { getInspectItems, getInspectStatuses } from "@/queries/vehicle-query";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [items, statuses, cols] = await Promise.all([
      getInspectItems(),
      getInspectStatuses(),
      query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'odg_tms_inspect'
         ORDER BY ordinal_position`
      ) as Promise<Array<{ column_name: string }>>,
    ]);
    return Response.json({ items, statuses, _inspect_cols: cols.map((c) => c.column_name) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[inspect-meta] request failed:", error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

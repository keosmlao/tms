import { z } from "zod";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db.js";
import { parseJsonBody, ValidationError } from "@/lib/validation";

async function ensureRulesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_maint_rule (
      code character varying PRIMARY KEY,
      name character varying NOT NULL,
      interval_km numeric NOT NULL DEFAULT 0
    )
  `, []);
}

const RuleSchema = z.object({
  code: z.string().trim().min(1, "code is required"),
  name: z.string().trim().min(1, "name is required"),
  interval_km: z.number().int().min(1, "interval_km must be >= 1"),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[maint-log/rules]", error);
  return Response.json({ error: msg }, { status: 500 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureRulesTable();
    const rows = await query(
      `SELECT code, name, interval_km FROM public.odg_tms_maint_rule ORDER BY interval_km ASC`,
      []
    );
    return Response.json(rows);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureRulesTable();
    const input = await parseJsonBody(request, RuleSchema);
    const row = await queryOne(
      `INSERT INTO public.odg_tms_maint_rule (code, name, interval_km)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, interval_km = EXCLUDED.interval_km
       RETURNING code, name, interval_km`,
      [input.code, input.name, input.interval_km]
    );
    return Response.json(row, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();
  if (!code) return Response.json({ error: "code is required" }, { status: 400 });

  try {
    await ensureRulesTable();
    await query(`DELETE FROM public.odg_tms_maint_rule WHERE code = $1`, [code]);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

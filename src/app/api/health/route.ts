import { query } from "@/lib/db.js";

export async function GET() {
  const env = {
    PG_HOST: !!process.env.PG_HOST,
    PG_PORT: !!process.env.PG_PORT,
    PG_DATABASE: !!process.env.PG_DATABASE,
    PG_USER: !!process.env.PG_USER,
    PG_PASSWORD: !!process.env.PG_PASSWORD,
    JWT_SECRET: !!process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  let dbCheck: { ok: boolean; result?: any; error?: string };
  try {
    const rows = await query(
      "SELECT 1 as one, current_database() as db, current_user as user_name"
    );
    dbCheck = { ok: true, result: rows[0] };
  } catch (err: any) {
    dbCheck = {
      ok: false,
      error: err?.message ?? String(err),
    };
  }

  let userCheck: { ok: boolean; count?: number; error?: string };
  try {
    const rows = await query("SELECT count(*)::int as n FROM erp_user");
    userCheck = { ok: true, count: rows[0]?.n ?? 0 };
  } catch (err: any) {
    userCheck = { ok: false, error: err?.message ?? String(err) };
  }

  return Response.json({ env, dbCheck, userCheck }, { status: 200 });
}

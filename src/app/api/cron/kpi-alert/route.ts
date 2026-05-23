import type { NextRequest } from "next/server";
import { evaluateKpiAlerts, ensureKpiAlertSchema } from "@/queries/kpi-alert.js";

// Daily KPI breach alert. Cron should hit this once per day after the day's
// deliveries close out (eg. 06:00 local time). Uses CRON_SECRET like the
// other cron routes.
//
//   Authorization: Bearer <CRON_SECRET>
//
// Returns { sent, breaches, kpi } or { skipped, reason }.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    await ensureKpiAlertSchema();
    const result = await evaluateKpiAlerts();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] kpi-alert failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

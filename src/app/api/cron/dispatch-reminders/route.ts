import type { NextRequest } from "next/server";
import { remindUnstartedDispatches } from "@/queries/push.js";

// Recurring nudge for drivers who received a trip + picked up bills but
// haven't tapped "ເລີ່ມຈັດສົ່ງ". Fire from any cron that can hit this URL
// every 5 min (Vercel cron, server crontab, GitHub Action). Auth uses
// CRON_SECRET — match Vercel's convention so the same env var works there.
//
//   Authorization: Bearer <CRON_SECRET>
//
// Returns { scanned, pushed } so the caller can log activity.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await remindUnstartedDispatches({ minMinutesSincePickup: 5 });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] dispatch-reminders failed:", err);
    return Response.json(
      { ok: false, error: (err as Error)?.message ?? "unknown" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

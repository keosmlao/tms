import type { NextRequest } from "next/server";
import { mobileManagerDashboard } from "@/queries/mobile.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseSearchParams } from "@/lib/validation";
import { ManagerDashboardQuerySchema } from "@/lib/mobile-schemas";

// Manager dashboard — today + this month + per-person breakdowns in one call.
// Drivers have no business reading fleet-wide figures, so this mirrors the
// supervisor gate used by /api/mobile/jobs?scope=all.
function canUseManagerScope(session: {
  roles?: string;
  title?: string;
  logistic_code?: string;
  is_driver?: boolean;
}) {
  if (session.is_driver === false) return true;
  const text = `${session.roles ?? ""} ${session.title ?? ""} ${
    session.logistic_code ?? ""
  }`.toLowerCase();
  return (
    text.includes("supervisor") ||
    text.includes("manager") ||
    text.includes("admin") ||
    text.includes("logistic") ||
    text.includes("transport_head")
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!canUseManagerScope(session)) {
      const error = new Error("Forbidden");
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
    const { date, branch } = parseSearchParams(
      request.nextUrl.searchParams,
      ManagerDashboardQuerySchema
    );
    const data = await mobileManagerDashboard({
      date: date ?? "",
      branch: branch ?? "",
    });
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

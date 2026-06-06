import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { assertMobileAppVersion } from "@/lib/app-version";
import { touchUserPresence } from "@/queries/presence.js";

export interface MobileSession {
  usercode: string;
  username: string;
  driver_id: string;
  logistic_code: string;
  title: string;
  roles: string;
  /// true = driver; false = non-driver (treated as supervisor/manager).
  is_driver: boolean;
}

// A session is a supervisor/manager (not a plain driver) when the server marked
// it is_driver=false, or — for legacy tokens without the flag — its role text
// names an office role. Such users may view/act beyond their own trips.
export function isSupervisorSession(session: {
  roles?: string;
  title?: string;
  logistic_code?: string;
  is_driver?: boolean;
}): boolean {
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

export async function requireMobileSession(
  request: Request | NextRequest
): Promise<MobileSession> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  const payload = await verifyToken(match[1]);
  if (!payload) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  const usercode = String(payload.usercode ?? payload.code ?? "");
  const username = String(payload.username ?? usercode);
  const driverId = String(payload.driver_id ?? usercode);
  if (!usercode || !driverId) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  // Force a client update before any protected work when the app version is
  // below the admin-set minimum. Throws a 426 that mobileErrorResponse turns
  // into a force_update payload.
  await assertMobileAppVersion(request);
  const session = {
    usercode,
    username,
    driver_id: driverId,
    logistic_code: String(payload.logistic_code ?? ""),
    title: String(payload.title ?? ""),
    roles: String(payload.roles ?? ""),
    is_driver: payload.is_driver === true,
  };
  await ((touchUserPresence as unknown) as (input: Record<string, unknown>) => Promise<unknown>)({
    session,
    source: "mobile",
    request,
  });
  return session;
}

export function mobileErrorResponse(error: unknown): Response {
  const err = error as {
    status?: number;
    message?: string;
    issues?: unknown;
    details?: Record<string, unknown>;
  };
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message ?? "Internal server error";
  if (status === 500) console.error("Mobile API error:", error);
  // Echo Zod issues so mobile clients can surface field-level errors when we
  // add per-field UI feedback later.
  const body: Record<string, unknown> = { error: message };
  if (err?.issues) body.issues = err.issues;
  // Merge any structured details (e.g. the force_update / app_update payload
  // from a 426) so the client can read them straight off the error body.
  if (err?.details && typeof err.details === "object") Object.assign(body, err.details);
  return Response.json(body, { status });
}

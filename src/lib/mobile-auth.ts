import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export interface MobileSession {
  usercode: string;
  username: string;
  driver_id: string;
  logistic_code: string;
  title: string;
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
  return {
    usercode,
    username,
    driver_id: driverId,
    logistic_code: String(payload.logistic_code ?? ""),
    title: String(payload.title ?? ""),
  };
}

export function mobileErrorResponse(error: unknown): Response {
  const err = error as { status?: number; message?: string; issues?: unknown };
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message ?? "Internal server error";
  if (status === 500) console.error("Mobile API error:", error);
  // Echo Zod issues so mobile clients can surface field-level errors when we
  // add per-field UI feedback later.
  const body: Record<string, unknown> = { error: message };
  if (err?.issues) body.issues = err.issues;
  return Response.json(body, { status });
}

import type { NextRequest } from "next/server";
import { pushHistory, pushHistoryMarkRead } from "@/queries/push.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody, parseSearchParams } from "@/lib/validation";
import {
  NotificationsListQuerySchema,
  NotificationsMarkReadSchema,
} from "@/lib/mobile-schemas";

// Per-user push history. Every push sent to this user is journaled server-side
// (see logPush in src/queries/push.js), so the app's ແຈ້ງເຕືອນ screen shows the
// same history on any device — surviving reinstalls and phone changes.

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const { limit } = parseSearchParams(
      request.nextUrl.searchParams,
      NotificationsListQuerySchema
    );
    const rows = await pushHistory(session.usercode, limit ?? 50);
    return Response.json(rows);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await parseJsonBody(request, NotificationsMarkReadSchema);
    const data = await pushHistoryMarkRead(session.usercode, body.ids ?? []);
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

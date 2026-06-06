import type { NextRequest } from "next/server";
import {
  listDmPeople,
  listChatterMessages,
  postChatterMessage,
  markChatterRead,
  canAccessRecord,
} from "@/queries/chatter.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";

function forbidden() {
  const e = new Error("Forbidden") as Error & { status?: number };
  e.status = 403;
  return e;
}

// Mobile chat = the same 1:1 Chatter DMs the web uses. Drivers message office
// staff / dispatchers; record_id is "dm:<a>|<b>" and the privacy gate
// (canAccessRecord) restricts each DM to its two participants.
//
// GET                      → people list (who you can DM) + unread
// GET ?record_id=dm:a|b    → messages of that DM (and marks it read)
// POST {record_id, body}   → send a message
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const recordId = request.nextUrl.searchParams.get("record_id");
    if (!recordId) {
      const people = await listDmPeople(session.usercode);
      return Response.json({ people });
    }
    if (!(await canAccessRecord(session, "dm", recordId))) throw forbidden();
    const messages = await listChatterMessages("dm", recordId);
    void markChatterRead({
      model: "dm",
      recordId,
      userCode: session.usercode,
    });
    return Response.json({ messages, me: session.usercode });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const body = (await request.json().catch(() => ({}))) as {
      record_id?: string;
      body?: string;
    };
    const recordId = String(body.record_id ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!recordId || !text) {
      const e = new Error("record_id and body are required") as Error & {
        status?: number;
      };
      e.status = 400;
      throw e;
    }
    if (!(await canAccessRecord(session, "dm", recordId))) throw forbidden();
    await postChatterMessage({
      model: "dm",
      recordId,
      body: text.slice(0, 5000),
      msgType: "comment",
      mentions: null,
      attachmentData: null,
      attachmentName: null,
      authorCode: session.usercode,
      authorName: session.username,
    });
    return Response.json({ success: true });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

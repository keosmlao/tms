import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseDataUrl } from "@/lib/chatter-helpers";
import { getChatterAttachment, canAccessRecord } from "@/queries/chatter.js";

// Serves a chatter attachment (stored base64 in the DB) as real image bytes so
// the message thread payload stays lean and the browser can cache the file.
// Authenticated + scoped to records the user may access.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const row = await getChatterAttachment(id);
  if (!row || !row.attachment_data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ok = await canAccessRecord(session, row.model, row.record_id);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = parseDataUrl(row.attachment_data);
  if (!parsed) {
    return NextResponse.json({ error: "Unsupported attachment" }, { status: 422 });
  }
  const buffer = Buffer.from(parsed.base64, "base64");
  const name = String(row.attachment_name || "file").replace(/["\r\n]/g, "");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": parsed.mime,
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}

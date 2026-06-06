"use server";

import { headers } from "next/headers";
import { requireSession } from "./_helpers";
import {
  listUserPresence as svcListUserPresence,
  touchUserPresence as svcTouchUserPresence,
} from "@/queries/presence.js";

async function requestMeta() {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = h.get("x-real-ip")?.trim();
  return {
    ipAddr: forwardedFor || realIp || null,
    userAgent: h.get("user-agent") || null,
  };
}

export async function heartbeat() {
  const session = await requireSession();
  const meta = await requestMeta();
  return ((svcTouchUserPresence as unknown) as (input: Record<string, unknown>) => Promise<unknown>)({
    session,
    source: "web",
    ipAddr: meta.ipAddr,
    userAgent: meta.userAgent,
  });
}

export async function getUserPresence(input?: {
  search?: string;
  source?: "all" | "web" | "mobile";
  status?: "all" | "online" | "offline";
  limit?: number;
}) {
  await requireSession();
  return svcListUserPresence({
    search: input?.search ?? "",
    source: input?.source === "web" || input?.source === "mobile" ? input.source : "",
    status: input?.status ?? "all",
    limit: input?.limit ?? 500,
  });
}

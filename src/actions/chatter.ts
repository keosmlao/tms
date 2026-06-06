"use server";

import type { Session } from "@/lib/auth";
import { requireSession } from "./_helpers";
import {
  canAccessRecord as svcCanAccess,
  listChatterMessages as svcListMessages,
  postChatterMessage as svcPost,
  editChatterMessage as svcEdit,
  deleteChatterMessage as svcDelete,
  listFollowers as svcListFollowers,
  toggleFollower as svcToggleFollower,
  listActivities as svcListActivities,
  scheduleActivity as svcSchedule,
  completeActivity as svcComplete,
  deleteActivity as svcDeleteActivity,
  listChatterUsers as svcUsers,
  markChatterRead as svcMarkRead,
  getUnreadCounts as svcUnread,
  getInboxConversations as svcInbox,
  listDmPeople as svcDmPeople,
  getDmPeerRead as svcDmPeerRead,
} from "@/queries/chatter.js";

// Authorise the session for the given record, throwing if it is out of scope.
async function guard(model: string, recordId: string): Promise<Session> {
  const s = await requireSession();
  const ok = await svcCanAccess(s, model, recordId);
  if (!ok) throw new Error("Forbidden");
  return s;
}

export async function getChatterMessages(model: string, recordId: string) {
  await guard(model, recordId);
  return svcListMessages(model, recordId);
}

// One round-trip + one access check for the full panel (thread + activities +
// followers) — replaces three separate guarded calls per poll.
export async function getChatterBundle(model: string, recordId: string) {
  const s = await guard(model, recordId);
  const [messages, activities, followers] = await Promise.all([
    svcListMessages(model, recordId),
    svcListActivities(model, recordId),
    svcListFollowers(model, recordId),
  ]);
  void svcMarkRead({ model, recordId, userCode: s.usercode });
  return { messages, activities, followers };
}

export async function postChatterMessage(input: {
  model: string;
  record_id: string;
  body: string;
  msg_type?: string;
  mentions?: string[];
  attachment_data?: string;
  attachment_name?: string;
}) {
  const s = await guard(input.model, input.record_id);
  return svcPost({
    model: input.model,
    recordId: input.record_id,
    body: input.body,
    msgType: input.msg_type,
    mentions: input.mentions,
    attachmentData: input.attachment_data,
    attachmentName: input.attachment_name,
    authorCode: s.usercode,
    authorName: s.username,
  });
}

export async function editChatterMessage(id: number, body: string) {
  const s = await requireSession();
  return svcEdit({ id, body, authorCode: s.usercode });
}

export async function deleteChatterMessage(id: number) {
  const s = await requireSession();
  return svcDelete({ id, authorCode: s.usercode });
}

export async function getChatterFollowers(model: string, recordId: string) {
  await guard(model, recordId);
  return svcListFollowers(model, recordId);
}

export async function toggleChatterFollower(model: string, recordId: string) {
  const s = await guard(model, recordId);
  return svcToggleFollower({ model, recordId, userCode: s.usercode, userName: s.username });
}

export async function getChatterActivities(model: string, recordId: string) {
  await guard(model, recordId);
  return svcListActivities(model, recordId);
}

export async function scheduleChatterActivity(input: {
  model: string;
  record_id: string;
  act_type?: string;
  summary: string;
  due_date?: string;
  assignee_code?: string;
  assignee_name?: string;
}) {
  const s = await guard(input.model, input.record_id);
  return svcSchedule({
    model: input.model,
    recordId: input.record_id,
    actType: input.act_type,
    summary: input.summary,
    dueDate: input.due_date,
    assigneeCode: input.assignee_code,
    assigneeName: input.assignee_name,
    createdBy: s.usercode,
  });
}

export async function completeChatterActivity(id: number) {
  await requireSession();
  return svcComplete(id);
}

export async function deleteChatterActivity(id: number) {
  await requireSession();
  return svcDeleteActivity(id);
}

export async function getChatterUsers() {
  await requireSession();
  return svcUsers();
}

export async function markChatterRead(model: string, recordId: string) {
  const s = await requireSession();
  return svcMarkRead({ model, recordId, userCode: s.usercode });
}

export async function getUnreadChatterCounts(model: string, recordIds: string[]) {
  const s = await requireSession();
  return svcUnread(s.usercode, model, recordIds);
}

export async function getInboxConversations() {
  const s = await requireSession();
  return svcInbox(s.usercode);
}

export async function getDmPeople() {
  const s = await requireSession();
  return svcDmPeople(s.usercode);
}

export async function getDmPeerRead(recordId: string) {
  const s = await requireSession();
  return svcDmPeerRead(s.usercode, recordId);
}

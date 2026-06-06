"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaAt,
  FaBell,
  FaCheck,
  FaImage,
  FaPaperPlane,
  FaPen,
  FaRegBell,
  FaRegCommentDots,
  FaRegClock,
  FaSpinner,
  FaStickyNote,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

interface ChatterMessage {
  id: number | null;
  msg_type: string;
  body: string;
  mentions: string;
  author_code?: string;
  author_name: string;
  has_attachment?: boolean;
  attachment_name?: string;
  edited?: boolean;
  created_at_display: string;
}
interface Activity {
  id: number;
  summary: string;
  due_date: string;
  due_date_display: string;
  assignee_name: string;
  done: boolean;
  done_at_display: string;
  overdue: boolean;
}
interface Follower {
  user_code: string;
  user_name: string;
}
interface ChatUser {
  code: string;
  name: string;
}

// Odoo-style chatter: discussion (note/message + @mention) + activities + followers.
export default function Chatter({
  model,
  recordId,
  readOnly = false,
}: {
  model: string;
  recordId: string;
  readOnly?: boolean;
}) {
  const { session } = useSession();
  const myCode = session?.usercode ?? "";

  const [tab, setTab] = useState<"messages" | "activities">("messages");
  const [messages, setMessages] = useState<ChatterMessage[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);

  // composer
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"note" | "comment">("note");
  const [mentions, setMentions] = useState<ChatUser[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{ data: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  // activity form
  const [actSummary, setActSummary] = useState("");
  const [actDue, setActDue] = useState("");
  const [actAssignee, setActAssignee] = useState("");

  const load = useCallback(async () => {
    if (!recordId) {
      setMessages([]);
      setActivities([]);
      setFollowers([]);
      return;
    }
    try {
      const bundle = (await Actions.getChatterBundle(model, recordId)) as {
        messages?: ChatterMessage[];
        activities?: Activity[];
        followers?: Follower[];
      } | null;
      // Bundle already marks the thread read server-side.
      setMessages((bundle?.messages ?? []) as ChatterMessage[]);
      setActivities((bundle?.activities ?? []) as Activity[]);
      setFollowers((bundle?.followers ?? []) as Follower[]);
    } catch (e) {
      console.error(e);
    }
  }, [model, recordId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    // Real-time: refresh every 6s while the record is open.
    const id = window.setInterval(() => void load(), 6000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    Actions.getChatterUsers()
      .then((u) => setUsers((u ?? []) as ChatUser[]))
      .catch(() => undefined);
  }, []);

  const iFollow = useMemo(() => followers.some((f) => f.user_code === myCode), [followers, myCode]);
  const openActivities = activities.filter((a) => !a.done).length;

  const addMention = (u: ChatUser) => {
    if (!mentions.some((m) => m.code === u.code)) setMentions((prev) => [...prev, u]);
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${u.name} `);
    setMentionOpen(false);
  };

  const send = async () => {
    if (readOnly) return;
    const text = body.trim();
    if ((!text && !attachment) || !recordId) return;
    setSending(true);
    try {
      await Actions.postChatterMessage({
        model,
        record_id: recordId,
        body: text,
        msg_type: mode,
        mentions: mentions.map((m) => m.code),
        attachment_data: attachment?.data,
        attachment_name: attachment?.name,
      });
      setBody("");
      setMentions([]);
      setAttachment(null);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      window.alert("ໄຟລ໌ໃຫຍ່ເກີນ 4MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ data: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  const saveEdit = async (id: number) => {
    if (readOnly) return;
    const text = editBody.trim();
    if (!text) return;
    try {
      await Actions.editChatterMessage(id, text);
      setEditingId(null);
      setEditBody("");
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const removeMessage = async (id: number) => {
    if (readOnly) return;
    try {
      await Actions.deleteChatterMessage(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleFollow = async () => {
    if (readOnly) return;
    try {
      await Actions.toggleChatterFollower(model, recordId);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const addActivity = async () => {
    if (readOnly) return;
    const s = actSummary.trim();
    if (!s || !recordId) return;
    try {
      const assignee = users.find((u) => u.code === actAssignee);
      await Actions.scheduleChatterActivity({
        model,
        record_id: recordId,
        summary: s,
        due_date: actDue || undefined,
        assignee_code: actAssignee || undefined,
        assignee_name: assignee?.name,
      });
      setActSummary("");
      setActDue("");
      setActAssignee("");
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const completeAct = async (id: number) => {
    if (readOnly) return;
    try {
      await Actions.completeChatterActivity(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };
  const removeAct = async (id: number) => {
    if (readOnly) return;
    try {
      await Actions.deleteChatterActivity(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const tabBtn = (key: "messages" | "activities", label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
        tab === key
          ? "bg-teal-500/15 text-teal-700 dark:text-teal-400"
          : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
      }`}
    >
      {label}
      {badge ? (
        <span className="rounded-full bg-rose-500 px-1.5 text-[9px] font-bold text-white">{badge}</span>
      ) : null}
    </button>
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-white/10">
        <FaRegCommentDots className="text-teal-500" size={12} />
        {tabBtn("messages", "ສົນທະນາ")}
        {tabBtn("activities", "ນັດວຽກ", openActivities)}
        {readOnly ? (
          <span className="ml-auto rounded-md bg-slate-500/10 px-2 py-1 text-[10px] font-bold text-slate-500">
            read only
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void toggleFollow()}
            title={iFollow ? "ກຳລັງຕິດຕາມ" : "ຕິດຕາມ"}
            className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
              iFollow
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
            }`}
          >
            {iFollow ? <FaBell size={10} /> : <FaRegBell size={10} />}
            {followers.length}
          </button>
        )}
      </div>

      {tab === "messages" ? (
        <>
          {/* Composer */}
          {readOnly ? (
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.03]">
              ໂໝດອ່ານຢ່າງດຽວ: ເບິ່ງປະຫວັດສົນທະນາໄດ້ ແຕ່ບໍ່ສາມາດຂຽນ ຫຼື ແກ້ໄຂໄດ້.
            </div>
          ) : (
          <div className="relative border-b border-slate-100 p-2 dark:border-white/10">
            <div className="mb-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode("note")}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${mode === "note" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}`}
              >
                ບັນທຶກພາຍໃນ
              </button>
              <button
                type="button"
                onClick={() => setMode("comment")}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${mode === "comment" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}`}
              >
                ສົ່ງຂໍ້ຄວາມ
              </button>
              <label className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5">
                <FaImage size={9} /> ໄຟລ໌
                <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              </label>
              <button
                type="button"
                onClick={() => setMentionOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <FaAt size={9} /> ແທັກ
              </button>
            </div>
            {mentionOpen && (
              <div className="absolute right-2 top-9 z-20 max-h-40 w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
                {users.slice(0, 50).map((u) => (
                  <button
                    key={u.code}
                    type="button"
                    onClick={() => addMention(u)}
                    className="block w-full px-2 py-1 text-left text-[11px] text-slate-600 hover:bg-teal-500/10 dark:text-slate-300"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder={mode === "note" ? "ບັນທຶກພາຍໃນ... (@ ແທັກຄົນ)" : "ຂໍ້ຄວາມ..."}
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-teal-400/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
            {mentions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {mentions.map((m) => (
                  <span key={m.code} className="rounded-full bg-teal-500/15 px-1.5 text-[9px] font-bold text-teal-700 dark:text-teal-400">
                    @{m.name}
                  </span>
                ))}
              </div>
            )}
            {attachment && (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                {attachment.data.startsWith("data:image") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.data} alt="" className="h-8 w-8 rounded object-cover" />
                )}
                <span className="flex-1 truncate text-[10px] text-slate-500">{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} className="text-slate-400 hover:text-rose-500">
                  <FaTimes size={10} />
                </button>
              </div>
            )}
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || (!body.trim() && !attachment)}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {sending ? <FaSpinner className="animate-spin" size={10} /> : <FaPaperPlane size={10} />}
                ສົ່ງ
              </button>
            </div>
          </div>
          )}

          {/* Thread */}
          <div className="max-h-[300px] space-y-2 overflow-y-auto p-2">
            {loading && messages.length === 0 ? (
              <div className="py-6 text-center text-slate-400"><FaSpinner className="mx-auto animate-spin" /></div>
            ) : messages.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-400">ຍັງບໍ່ມີຂໍ້ຄວາມ</div>
            ) : (
              messages.map((m, i) => {
                const mine = m.id != null && m.msg_type !== "system" && m.author_code === myCode;
                const editing = editingId === m.id && m.id != null;
                return (
                  <div
                    key={m.id ?? `sys-${i}`}
                    className={`group rounded-lg border p-2 ${
                      m.msg_type === "note"
                        ? "border-amber-200/60 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
                        : m.msg_type === "system"
                          ? "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5"
                          : "border-sky-200/60 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {m.msg_type === "note" && <FaStickyNote size={8} className="text-amber-500" />}
                        {m.msg_type === "system" ? "⚙ ລະບົບ" : m.author_name || "-"}
                        {m.edited && <span className="text-[8px] font-normal text-slate-400">(ແກ້ໄຂ)</span>}
                      </span>
                      <span className="flex items-center gap-1.5 text-[9px] text-slate-400">
                        {m.created_at_display}
                        {mine && !editing && !readOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditBody(m.body);
                              }}
                              className="opacity-0 transition-opacity hover:text-sky-500 group-hover:opacity-100"
                            >
                              <FaPen size={8} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeMessage(m.id as number)}
                              className="opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                            >
                              <FaTrash size={8} />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {editing ? (
                      <div className="mt-1">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-teal-400/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        />
                        <div className="mt-1 flex justify-end gap-1">
                          <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5">
                            ຍົກເລີກ
                          </button>
                          <button type="button" onClick={() => void saveEdit(m.id as number)} className="rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-teal-700">
                            ບັນທຶກ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.body && (
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-slate-600 dark:text-slate-300">{m.body}</p>
                        )}
                        {m.has_attachment && m.id != null && (
                          <a href={`/api/chatter/attachment?id=${m.id}`} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/chatter/attachment?id=${m.id}`}
                              alt={m.attachment_name || ""}
                              className="mt-1 max-h-40 rounded-md border border-slate-200 dark:border-white/10"
                            />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="p-2">
          {/* Activity composer */}
          {readOnly ? (
            <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/[0.03]">
              ໂໝດອ່ານຢ່າງດຽວ: ບໍ່ສາມາດນັດວຽກ ຫຼື ປິດ activity ໄດ້.
            </div>
          ) : (
          <div className="mb-2 space-y-1.5 rounded-lg border border-slate-200 p-2 dark:border-white/10">
            <input
              value={actSummary}
              onChange={(e) => setActSummary(e.target.value)}
              placeholder="ນັດວຽກ... (ເຊັ່ນ ໂທລູກຄ້າ)"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-teal-400/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
            <div className="flex gap-1.5">
              <input
                type="date"
                value={actDue}
                onChange={(e) => setActDue(e.target.value)}
                className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              />
              <select
                value={actAssignee}
                onChange={(e) => setActAssignee(e.target.value)}
                className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              >
                <option value="">— ມອບໝາຍ —</option>
                {users.map((u) => (
                  <option key={u.code} value={u.code}>{u.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void addActivity()}
                disabled={!actSummary.trim()}
                className="rounded-md bg-teal-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                ນັດ
              </button>
            </div>
          </div>
          )}

          {/* Activity list */}
          <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
            {activities.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-400">ຍັງບໍ່ມີນັດວຽກ</div>
            ) : (
              activities.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-start gap-2 rounded-lg border p-2 ${
                    a.done
                      ? "border-slate-200 bg-slate-50 opacity-70 dark:border-white/10 dark:bg-white/5"
                      : a.overdue
                        ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
                        : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  {!a.done && !readOnly && (
                    <button
                      type="button"
                      onClick={() => void completeAct(a.id)}
                      title="ສຳເລັດ"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 hover:bg-emerald-500 hover:text-white dark:border-white/20"
                    >
                      <FaCheck size={7} />
                    </button>
                  )}
                  {(a.done || readOnly) && (
                    <FaCheck
                      size={11}
                      className={`mt-0.5 shrink-0 ${a.done ? "text-emerald-500" : "text-slate-300"}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-semibold ${a.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}>
                      {a.summary}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[9px] text-slate-400">
                      {a.due_date_display && (
                        <span className={`inline-flex items-center gap-1 ${a.overdue && !a.done ? "font-bold text-rose-500" : ""}`}>
                          <FaRegClock size={8} /> {a.due_date_display}
                        </span>
                      )}
                      {a.assignee_name && <span>👤 {a.assignee_name}</span>}
                      {a.done && a.done_at_display && <span>✓ {a.done_at_display}</span>}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void removeAct(a.id)}
                      className="shrink-0 rounded p-1 text-slate-300 hover:text-rose-500"
                      title="ລຶບ"
                    >
                      <FaTrash size={9} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

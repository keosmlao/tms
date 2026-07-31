"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaComments,
  FaPaperPlane,
  FaSearch,
  FaSpinner,
  FaTimes,
} from "react-icons/fa";
import { createPortal } from "react-dom";
import { Actions } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

interface Person {
  code: string;
  name: string;
  title: string;
  record_id: string;
  online: boolean;
  last_seen: string;
  last_body: string;
  unread: number;
}
interface Msg {
  id: number | null;
  body: string;
  author_code?: string;
  author_name: string;
  created_at_display: string;
  msg_type: string;
}
interface Active {
  record_id: string;
  name: string;
  online?: boolean;
}

// Floating direct-message widget — chat 1:1 with any system user, online
// presence first. Bubble bottom-right on every page; Messenger-style panel.
export default function ChatWidget() {
  const { session } = useSession();
  const myCode = session?.usercode ?? "";

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [seen, setSeen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadPeople = useCallback(async () => {
    try {
      setPeople(((await Actions.getDmPeople()) ?? []) as Person[]);
    } catch {
      /* ignore */
    }
  }, []);
  const loadMessages = useCallback(async (recordId: string) => {
    try {
      const [msgs, read] = await Promise.all([
        Actions.getChatterMessages("dm", recordId),
        Actions.getDmPeerRead(recordId),
      ]);
      setMessages(((msgs ?? []) as Msg[]).slice().reverse());
      setSeen(!!(read as { seen?: boolean } | null)?.seen);
      void Actions.markChatterRead("dm", recordId);
    } catch {
      /* ignore */
    }
  }, []);

  // ບໍ່ມີ session (ໜ້າ login ຫຼື token ໝົດອາຍຸ) ຢ່າຍິງເລີຍ — ບໍ່ດັ່ງນັ້ນ
  // poller ນີ້ຈະຍິງທຸກ 20 ວິ ແລ້ວໄດ້ 500 Unauthorized ຕໍ່ເນື່ອງ
  useEffect(() => {
    if (!myCode) return;
    void loadPeople();
    const id = window.setInterval(() => void loadPeople(), 20000);
    return () => window.clearInterval(id);
  }, [loadPeople, myCode]);

  useEffect(() => {
    if (!active) return;
    void loadMessages(active.record_id);
    const id = window.setInterval(() => void loadMessages(active.record_id), 4000);
    return () => window.clearInterval(id);
  }, [active, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, active]);

  // Render into <body> so the bubble is always viewport-fixed bottom-right,
  // immune to any ancestor stacking/transform context. Also open a DM when
  // arriving via a bell notification (?dm=<record_id>).
  useEffect(() => {
    setMounted(true);
    const dm = new URLSearchParams(window.location.search).get("dm");
    if (dm) {
      setOpen(true);
      setActive({ record_id: dm, name: "ສົນທະນາ" });
    }
  }, []);

  const totalUnread = people.reduce((s, p) => s + (p.unread || 0), 0);

  const openDm = (p: Person) => {
    setActive({ record_id: p.record_id, name: p.name, online: p.online });
    setPeople((prev) => prev.map((x) => (x.record_id === p.record_id ? { ...x, unread: 0 } : x)));
  };

  const send = async () => {
    const text = body.trim();
    if (!text || !active) return;
    setSending(true);
    try {
      await Actions.postChatterMessage({
        model: "dm",
        record_id: active.record_id,
        body: text,
        msg_type: "comment",
      });
      setBody("");
      await loadMessages(active.record_id);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q))
    : people;
  // Unread conversations get their own group pinned to the top; the
  // online/offline groups below list only already-read ones (no duplicates).
  const unreadPeople = filtered.filter((p) => (p.unread || 0) > 0);
  const readPeople = filtered.filter((p) => !(p.unread || 0));
  const onlinePeople = readPeople.filter((p) => p.online);
  const offlinePeople = readPeople.filter((p) => !p.online);

  const personRow = (p: Person) => (
    <button
      key={p.code}
      type="button"
      onClick={() => openDm(p)}
      className="flex w-full items-center gap-2 border-t border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-sm font-bold text-slate-500 dark:text-slate-300">
        {p.name.charAt(0)}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
            p.online ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
          }`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
          {p.name}
          {p.title && <span className="ml-1 text-[9px] font-normal text-slate-400">· {p.title}</span>}
        </p>
        <p className="truncate text-[10px] text-slate-400">
          {p.last_body || (p.online ? "ອອນລາຍ" : p.last_seen ? `ເຂົ້າລ່າສຸດ ${p.last_seen}` : "ກົດເພື່ອລົມ")}
        </p>
      </div>
      {p.unread > 0 && (
        <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {p.unread}
        </span>
      )}
    </button>
  );

  if (!mounted) return null;
  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-colors hover:bg-teal-700 print:hidden"
          title="ຂໍ້ຄວາມ"
        >
          <FaComments size={22} />
          {totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-[60] flex h-[480px] w-[340px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 print:hidden">
          {/* Header */}
          <div className="flex items-center gap-2 bg-teal-600 px-3 py-2.5 text-white">
            {active ? (
              <button type="button" onClick={() => setActive(null)} className="rounded p-1 hover:bg-white/15">
                <FaArrowLeft size={13} />
              </button>
            ) : (
              <FaComments size={16} />
            )}
            <span className="flex flex-1 items-center gap-1.5 truncate text-sm font-bold">
              {active ? active.name : "ຂໍ້ຄວາມ"}
              {active && (
                <span
                  className={`inline-block h-2 w-2 rounded-full ${active.online ? "bg-emerald-300" : "bg-white/40"}`}
                  title={active.online ? "ອອນລາຍ" : "ອອບລາຍ"}
                />
              )}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-white/15">
              <FaTimes size={14} />
            </button>
          </div>

          {active ? (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-950/40">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-[11px] text-slate-400">ຍັງບໍ່ມີຂໍ້ຄວາມ — ເລີ່ມສົນທະນາ</p>
                ) : (
                  messages.map((m, i) => {
                    const mine = !!m.author_code && m.author_code === myCode;
                    return (
                      <div key={m.id ?? `m-${i}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-3 py-1.5 text-[12px] ${
                            mine
                              ? "bg-teal-600 text-white"
                              : "bg-white text-slate-700 shadow-sm dark:bg-white/10 dark:text-slate-200"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`mt-0.5 text-right text-[8px] ${mine ? "text-teal-100" : "text-slate-400"}`}>
                            {m.created_at_display}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                {seen &&
                  messages.length > 0 &&
                  messages[messages.length - 1]?.author_code === myCode && (
                    <p className="pr-1 text-right text-[8px] font-semibold text-teal-500">✓ ອ່ານແລ້ວ</p>
                  )}
              </div>
              {/* Composer */}
              <div className="flex items-center gap-2 border-t border-slate-100 p-2 dark:border-white/10">
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                  placeholder="ພິມຂໍ້ຄວາມ..."
                  className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-teal-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !body.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {sending ? <FaSpinner className="animate-spin" size={11} /> : <FaPaperPlane size={11} />}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Search */}
              <div className="border-b border-slate-100 p-2 dark:border-white/10">
                <div className="relative">
                  <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ຄົ້ນຫາຄົນ..."
                    className="w-full rounded-full border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs outline-none focus:border-teal-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                  />
                </div>
              </div>
              {/* People */}
              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-[11px] text-slate-400">ບໍ່ພົບຄົນ</p>
                ) : (
                  <>
                    {unreadPeople.length > 0 && (
                      <>
                        <div className="bg-rose-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                          ✉ ຍັງບໍ່ໄດ້ອ່ານ {unreadPeople.length}
                        </div>
                        {unreadPeople.map(personRow)}
                      </>
                    )}
                    {onlinePeople.length > 0 && (
                      <>
                        <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:bg-white/[0.02] dark:text-emerald-400">
                          ● ອອນລາຍ {onlinePeople.length}
                        </div>
                        {onlinePeople.map(personRow)}
                      </>
                    )}
                    {offlinePeople.length > 0 && (
                      <>
                        <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-white/[0.02]">
                          ○ ອອບລາຍ {offlinePeople.length}
                        </div>
                        {offlinePeople.map(personRow)}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}

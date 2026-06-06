"use client";

import { useCallback, useEffect, useState } from "react";
import { FaInbox, FaRegCommentDots, FaSpinner } from "react-icons/fa";
import { Actions } from "@/lib/api";
import Chatter from "@/components/Chatter";

interface Conversation {
  model: string;
  record_id: string;
  last_body: string;
  last_author: string;
  last_at: string;
  unread: number;
  title: string;
}

// Unified inbox — every chatter conversation the user is involved in, in one
// place, with inline reply (reuses the Chatter component per conversation).
export default function InboxPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ model: string; recordId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await Actions.getInboxConversations();
      const list = (data ?? []) as Conversation[];
      setConvos(list);
      setSelected((prev) =>
        prev ?? (list[0] ? { model: list[0].model, recordId: list[0].record_id } : null)
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const totalUnread = convos.reduce((s, c) => s + (c.unread || 0), 0);

  const labelFor = (c: Conversation) =>
    c.model === "bill" ? `ບິນ ${c.record_id}` : c.model === "job" ? `ຖ້ຽວ ${c.record_id}` : c.record_id;

  const open = (c: Conversation) => {
    setSelected({ model: c.model, recordId: c.record_id });
    setConvos((prev) =>
      prev.map((x) =>
        x.record_id === c.record_id && x.model === c.model ? { ...x, unread: 0 } : x
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FaInbox className="text-teal-500" />
        <h1 className="text-lg font-bold text-slate-800 dark:text-white">ກ່ອງຂໍ້ຄວາມ</h1>
        {totalUnread > 0 && (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
            {totalUnread}
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {/* Conversation list */}
        <section className="overflow-hidden rounded-xl border border-slate-200/60 bg-white dark:border-white/[0.06] dark:bg-slate-900">
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
            {loading && convos.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <FaSpinner className="mx-auto animate-spin" />
              </div>
            ) : convos.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">ຍັງບໍ່ມີສົນທະນາ</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {convos.map((c) => {
                  const active = selected?.model === c.model && selected?.recordId === c.record_id;
                  return (
                    <li key={`${c.model}-${c.record_id}`}>
                      <button
                        type="button"
                        onClick={() => open(c)}
                        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${
                          active ? "bg-teal-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                              {labelFor(c)}
                            </span>
                            <span className="shrink-0 text-[9px] text-slate-400">{c.last_at}</span>
                          </div>
                          {c.title && (
                            <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {c.title}
                            </p>
                          )}
                          <p className="truncate text-[11px] text-slate-400">
                            {c.last_author ? `${c.last_author}: ` : ""}
                            {c.last_body}
                          </p>
                        </div>
                        {c.unread > 0 && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-teal-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {c.unread}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Selected conversation */}
        <section className="rounded-xl border border-slate-200/60 bg-white p-3 dark:border-white/[0.06] dark:bg-slate-900">
          {selected ? (
            <Chatter
              key={`${selected.model}-${selected.recordId}`}
              model={selected.model}
              recordId={selected.recordId}
            />
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-slate-400">
              <FaRegCommentDots size={28} className="mb-2 opacity-50" />
              <p className="text-sm">ເລືອກສົນທະນາ</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

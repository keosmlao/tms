"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaCalendar,
  FaCheck,
  FaClock,
  FaPlus,
  FaSpinner,
  FaStickyNote,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";

interface Todo {
  id: number;
  bill_no: string;
  summary: string;
  deadline: string | null;
  deadline_display: string | null;
  done: boolean;
  created_by: string;
  created_at: string;
  done_by: string;
  done_at: string | null;
}

/** Floating popover anchored to the trigger element, Odoo-Activities style. */
export function BillTodoPopover({
  open,
  billNo,
  anchorEl,
  onClose,
  onChanged,
}: {
  open: boolean;
  billNo: string | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [summary, setSummary] = useState("");
  const [deadline, setDeadline] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const today = getFixedTodayDate();

  useEffect(() => {
    if (!open || !billNo) return;
    setError(null);
    setAdding(false);
    setSummary("");
    setDeadline("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, billNo]);

  // Anchor the popover to the trigger element so it floats next to the row.
  useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popW = 360;
      const left = Math.max(8, Math.min(window.innerWidth - popW - 8, rect.right - popW));
      const top = rect.bottom + 6;
      setPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl]);

  // Click outside to dismiss.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, anchorEl, onClose]);

  const load = async () => {
    if (!billNo) return;
    setLoading(true);
    try {
      const data = await Actions.getBillTodos(billNo);
      setTodos((data ?? []) as Todo[]);
    } catch (e) {
      console.error(e);
      setTodos([]);
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!billNo) return;
    if (!summary.trim()) {
      setError("ກະລຸນາໃສ່ລາຍລະອຽດ");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Actions.createBillTodo({
        bill_no: billNo,
        summary: summary.trim(),
        deadline: deadline || null,
      });
      setSummary("");
      setDeadline("");
      setAdding(false);
      await load();
      onChanged?.();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (t: Todo) => {
    try {
      await Actions.setBillTodoDone({ id: t.id, done: !t.done });
      await load();
      onChanged?.();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (t: Todo) => {
    if (!confirm("ລຶບລາຍການນີ້?")) return;
    try {
      await Actions.deleteBillTodo(t.id);
      await load();
      onChanged?.();
    } catch (e) {
      console.error(e);
    }
  };

  const deadlineTone = (t: Todo) => {
    if (t.done) return "text-slate-400";
    if (!t.deadline) return "text-slate-500";
    if (t.deadline < today) return "text-rose-600 dark:text-rose-400";
    if (t.deadline === today) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  if (!open || !billNo || !pos) return null;

  const pendingTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);

  return (
    <div
      ref={popRef}
      className="fixed z-50 w-[360px] glass rounded-lg shadow-xl border border-slate-200/40 dark:border-white/10 overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-3 py-2 bg-white/40 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FaClock size={11} className="text-amber-500" />
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            ກິດຈະກຳ · {billNo}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
        >
          <FaTimes size={9} />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="py-8 flex items-center justify-center text-slate-400 text-xs">
            <FaSpinner className="animate-spin mr-1.5" /> ກຳລັງໂຫຼດ...
          </div>
        ) : todos.length === 0 && !adding ? (
          <div className="py-8 text-center text-xs text-slate-400">
            ຍັງບໍ່ມີກິດຈະກຳ
          </div>
        ) : (
          <div className="divide-y divide-slate-200/30 dark:divide-white/5">
            {pendingTodos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                deadlineTone={deadlineTone(t)}
                onToggle={() => void toggle(t)}
                onRemove={() => void remove(t)}
                today={today}
              />
            ))}
            {doneTodos.length > 0 && (
              <div className="px-3 py-1 bg-slate-500/5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                ສຳເລັດແລ້ວ ({doneTodos.length})
              </div>
            )}
            {doneTodos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                deadlineTone={deadlineTone(t)}
                onToggle={() => void toggle(t)}
                onRemove={() => void remove(t)}
                today={today}
              />
            ))}
          </div>
        )}

        {adding && (
          <div className="p-3 bg-amber-500/5 border-t border-amber-500/20 space-y-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <FaStickyNote className="inline mr-1" size={9} /> ລາຍລະອຽດ
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                placeholder="ສິ່ງທີ່ຕ້ອງເຮັດ..."
                className="w-full glass-input rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 resize-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <FaCalendar className="inline mr-1" size={9} /> ວັນຄົບກຳນົດ
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full glass-input rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
              />
            </div>
            {error && (
              <p className="text-[10px] text-rose-500">{error}</p>
            )}
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                disabled={submitting}
                className="px-2.5 py-1 text-[11px] font-semibold rounded text-slate-600 dark:text-slate-300 hover:bg-white/40 dark:hover:bg-white/5 disabled:opacity-50"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={() => void create()}
                disabled={submitting}
                className="px-3 py-1 text-[11px] font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 inline-flex items-center gap-1"
              >
                {submitting ? <FaSpinner className="animate-spin" size={9} /> : <FaPlus size={9} />}
                ບັນທຶກ
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <div className="px-3 py-2 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <FaPlus size={9} /> ເພີ່ມກິດຈະກຳ
          </button>
        </div>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  deadlineTone,
  onToggle,
  onRemove,
  today,
}: {
  todo: Todo;
  deadlineTone: string;
  onToggle: () => void;
  onRemove: () => void;
  today: string;
}) {
  const overdue = !todo.done && todo.deadline && todo.deadline < today;
  return (
    <div
      className={`px-3 py-2 flex items-start gap-2 hover:bg-white/40 dark:hover:bg-white/5 transition-colors ${
        overdue ? "bg-rose-500/5" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
          todo.done
            ? "bg-emerald-600 border-emerald-600 text-white"
            : "border-slate-300 dark:border-white/20 hover:border-emerald-500"
        }`}
        title={todo.done ? "ຍົກເລີກສຳເລັດ" : "ໝາຍສຳເລັດ"}
      >
        {todo.done && <FaCheck size={8} />}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[11px] ${
            todo.done
              ? "line-through text-slate-400"
              : "text-slate-700 dark:text-slate-200"
          } whitespace-pre-wrap break-words`}
        >
          {todo.summary}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {todo.deadline_display && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${deadlineTone}`}>
              <FaCalendar size={8} /> {todo.deadline_display}
            </span>
          )}
          {todo.created_by && (
            <span className="text-[10px] text-slate-400">
              ໂດຍ {todo.created_by}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-0.5 w-5 h-5 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center shrink-0"
        title="ລຶບ"
      >
        <FaTrash size={9} />
      </button>
    </div>
  );
}

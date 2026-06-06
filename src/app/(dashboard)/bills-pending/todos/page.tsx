"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FaArrowLeft,
  FaCheck,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaRegSquare,
  FaSearch,
  FaSpinner,
  FaStickyNote,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusStatGrid } from "@/components/status-page-shell";
import { getFixedTodayDate } from "@/lib/fixed-year";

interface TodoRow {
  id: number;
  bill_no: string;
  summary: string;
  deadline: string | null;
  deadline_display: string | null;
  done: boolean;
  created_by: string;
  created_at: string;
  done_by: string;
  done_at: string;
  owner_code: string;
  owner_name: string;
  customer: string;
  cust_code: string;
  transport_code: string;
  transport: string;
  scope_readonly?: boolean;
  scope_role?: string;
  scope_label?: string;
}

// Same per-branch palette as the bills-pending list so a bill's branch reads
// the same colour across both screens.
const BRANCH_BADGE: Record<string, string> = {
  "02-0001": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "02-0002": "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "02-0003": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

function BranchBadge({ code, name }: { code?: string; name?: string }) {
  const label = (name || code || "").trim();
  if (!label) return null;
  const cls =
    (code && BRANCH_BADGE[code]) ||
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>
      <FaTruck size={8} />
      {label}
    </span>
  );
}

export default function BillTodosPage() {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeDone, setIncludeDone] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const today = getFixedTodayDate();
  const readOnlyMode = todos.some((t) => t.scope_readonly);
  const scopeLabel = todos.find((t) => t.scope_label)?.scope_label ?? "ຂອງຕົນເອງ";

  const fetchTodos = (withDone: boolean) => {
    setLoading(true);
    Actions.getAllBillTodos(withDone)
      .then((rows) => setTodos((rows ?? []) as TodoRow[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTodos(includeDone);
  }, [includeDone]);

  const toggleDone = async (todo: TodoRow) => {
    if (todo.scope_readonly) return;
    setSavingId(todo.id);
    try {
      await Actions.setBillTodoDone({ id: todo.id, done: !todo.done });
      // Optimistic: flip locally; if "open only" view, drop a freshly-done item.
      setTodos((cur) =>
        cur
          .map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t))
          .filter((t) => includeDone || !t.done)
      );
    } catch (e) {
      console.error(e);
    } finally {
      setSavingId(null);
    }
  };

  const isOverdue = (t: TodoRow) => !t.done && !!t.deadline && t.deadline < today;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return todos;
    return todos.filter((t) =>
      [t.bill_no, t.customer, t.summary, t.created_by, t.owner_code, t.owner_name].some((v) =>
        (v || "").toLowerCase().includes(q)
      )
    );
  }, [todos, search]);

  // overdue first, then open by deadline, then done
  const groups = useMemo(() => {
    const overdue: TodoRow[] = [];
    const open: TodoRow[] = [];
    const done: TodoRow[] = [];
    for (const t of filtered) {
      if (t.done) done.push(t);
      else if (isOverdue(t)) overdue.push(t);
      else open.push(t);
    }
    return { overdue, open, done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, today]);

  const stats = useMemo(() => {
    const openCount = todos.filter((t) => !t.done).length;
    const overdueCount = todos.filter(isOverdue).length;
    const doneCount = todos.filter((t) => t.done).length;
    return { openCount, overdueCount, doneCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, today]);

  return (
    <div className="space-y-5">
      <Link
        href="/bills-pending"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-teal-600 dark:hover:text-teal-300"
      >
        <FaArrowLeft size={10} /> ກັບໄປບິນຄ້າງຕິດຕໍ່
      </Link>

      <StatusPageHeader
        title="ສິ່ງທີ່ຕ້ອງເຮັດ (Todo)"
        subtitle={
          readOnlyMode
            ? "ຫົວໜ້າ/ຜູ້ຈັດການຂົນສົ່ງເບິ່ງລາຍການທັງໝົດໃນສາຂາໄດ້ ແຕ່ເປັນ read only"
            : "ລວບລວມບັນທຶກ/ກິດຈະກຳຂອງຕົນເອງ ທີ່ໝາຍໄວ້ໃນແຕ່ລະບິນ"
        }
        icon={<FaStickyNote />}
        tone="teal"
      />

      <StatusStatGrid
        stats={[
          { label: "ຍັງຄ້າງ", value: stats.openCount, icon: <FaClock />, tone: "teal" },
          { label: "ເກີນກຳນົດ", value: stats.overdueCount, icon: <FaExclamationTriangle />, tone: "orange" },
          { label: "ເຮັດແລ້ວ", value: stats.doneCount, icon: <FaCheckCircle />, tone: "sky" },
        ]}
      />

      {/* Controls */}
      <div className="glass rounded-lg p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ຄົ້ນຫາ ເລກບິນ, ລູກຄ້າ, ລາຍລະອຽດ..."
            className="w-full pl-8 pr-3 py-2 glass-input rounded-lg text-xs"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setIncludeDone(e.target.checked)}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          ສະແດງລາຍການທີ່ເຮັດແລ້ວ
        </label>
        <span className="text-[11px] text-slate-400">ພົບ {filtered.length} ລາຍການ</span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            readOnlyMode
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-teal-500/10 text-teal-700 dark:text-teal-400"
          }`}
        >
          {scopeLabel}{readOnlyMode ? " · read only" : ""}
        </span>
      </div>

      {loading ? (
        <div className="rounded-lg glass p-16 text-center">
          <FaSpinner className="animate-spin text-2xl mx-auto mb-3 text-teal-500" />
          <p className="text-sm text-slate-500">ກຳລັງໂຫຼດ...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg glass p-16 text-center">
          <FaCheckCircle className="text-3xl mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">ບໍ່ມີລາຍການທີ່ຕ້ອງເຮັດ</p>
        </div>
      ) : (
        <div className="space-y-5">
          <TodoGroup
            title="ເກີນກຳນົດ"
            tone="rose"
            rows={groups.overdue}
            savingId={savingId}
            onToggle={toggleDone}
            today={today}
            readOnly={readOnlyMode}
          />
          <TodoGroup
            title="ກຳລັງລໍ"
            tone="amber"
            rows={groups.open}
            savingId={savingId}
            onToggle={toggleDone}
            today={today}
            readOnly={readOnlyMode}
          />
          {includeDone && (
            <TodoGroup
              title="ເຮັດແລ້ວ"
              tone="emerald"
              rows={groups.done}
              savingId={savingId}
              onToggle={toggleDone}
              today={today}
              readOnly={readOnlyMode}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TodoGroup({
  title,
  tone,
  rows,
  savingId,
  onToggle,
  today,
  readOnly,
}: {
  title: string;
  tone: "rose" | "amber" | "emerald";
  rows: TodoRow[];
  savingId: number | null;
  onToggle: (t: TodoRow) => void;
  today: string;
  readOnly: boolean;
}) {
  if (rows.length === 0) return null;
  const dot = { rose: "bg-rose-500", amber: "bg-amber-500", emerald: "bg-emerald-500" }[tone];
  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h2>
        <span className="text-[11px] font-bold text-slate-400">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.map((t) => {
          const overdue = !t.done && !!t.deadline && t.deadline < today;
          const ownerLabel = t.owner_name || t.owner_code || t.created_by;
          return (
            <div
              key={t.id}
              className={`rounded-lg border bg-white dark:bg-slate-900 p-3 flex items-start gap-3 ${
                overdue ? "border-rose-300/60 dark:border-rose-800/60" : "border-slate-200/60 dark:border-white/[0.06]"
              } ${t.done ? "opacity-70" : ""}`}
            >
              <button
                type="button"
                onClick={() => onToggle(t)}
                disabled={savingId === t.id || readOnly || t.scope_readonly}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                  t.done
                    ? "bg-emerald-600 text-white disabled:opacity-70"
                    : "border border-slate-300 dark:border-slate-600 text-transparent hover:border-teal-500 disabled:hover:border-slate-300 disabled:opacity-60"
                }`}
                title={
                  readOnly || t.scope_readonly
                    ? "read only"
                    : t.done
                    ? "ໝາຍວ່າຍັງບໍ່ເຮັດ"
                    : "ໝາຍວ່າເຮັດແລ້ວ"
                }
              >
                {savingId === t.id ? <FaSpinner className="animate-spin" size={10} /> : t.done ? <FaCheck size={10} /> : <FaRegSquare size={10} className="opacity-0" />}
              </button>

              <div className="min-w-0 flex-1">
                <p className={`text-sm text-slate-800 dark:text-slate-100 ${t.done ? "line-through text-slate-400" : ""}`}>
                  {t.summary}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Link
                    href={`/bills-pending?focus=${encodeURIComponent(t.bill_no)}`}
                    className="font-mono font-bold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {t.bill_no}
                  </Link>
                  {t.customer && <span className="truncate max-w-[260px]">· {t.customer}</span>}
                  <BranchBadge code={t.transport_code} name={t.transport} />
                  {ownerLabel && (
                    <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      ຂອງ {ownerLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
                  {t.deadline_display && (
                    <span className={`inline-flex items-center gap-1 font-semibold ${overdue ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
                      <FaClock size={9} /> ກຳນົດ {t.deadline_display}
                      {overdue && " (ເກີນ)"}
                    </span>
                  )}
                  {t.created_by && <span className="text-slate-400">ໂດຍ {t.created_by}</span>}
                  {t.created_at && <span className="text-slate-400">· {t.created_at}</span>}
                  {t.done && t.done_at && (
                    <span className="text-emerald-600 dark:text-emerald-400">✓ ເຮັດແລ້ວ {t.done_at}{t.done_by ? ` · ${t.done_by}` : ""}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

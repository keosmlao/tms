"use client";

import { useEffect, useState } from "react";
import { FaClock } from "react-icons/fa";

export function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export function parseDDMMYYYYHHMM(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi] = match;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +mi);
}

export function formatElapsed(diffMs: number): string {
  if (diffMs < 0) return "-";
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}ມື້ ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function ElapsedTimer({
  since,
  tone = "sky",
}: {
  since: string;
  tone?: "sky" | "amber" | "emerald" | "rose";
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = parseDDMMYYYYHHMM(since);
  if (!start) return <span>-</span>;

  const diffMs = now - start.getTime();
  const text = formatElapsed(diffMs);

  const tones = {
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${tones[tone]} text-[10px] font-mono font-semibold tabular-nums`}
    >
      <FaClock size={8} className="animate-pulse" />
      {text}
    </span>
  );
}

export function StatusBadge({
  tone,
  label,
}: {
  tone: "slate" | "amber" | "sky" | "emerald" | "rose" | "teal" | "orange";
  label: string;
}) {
  const TONES: Record<string, string> = {
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  };
  const DOT: Record<string, string> = {
    slate: "bg-slate-500",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    teal: "bg-teal-500",
    orange: "bg-orange-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold ${TONES[tone]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[tone]}`} />
      {label}
    </span>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  total,
  perPage,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/30 dark:border-white/5">
      <p className="text-[11px] text-slate-500">
        ສະແດງ {(currentPage - 1) * perPage + 1}-
        {Math.min(currentPage * perPage, total)} ຈາກ {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ກ່ອນໜ້າ
        </button>
        <span className="text-[11px] text-slate-500 px-2">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ຖັດໄປ
        </button>
      </div>
    </div>
  );
}

export function BillProgressPills({
  pending,
  picked,
  completed,
  cancelled,
}: {
  pending?: number;
  picked?: number;
  completed?: number;
  cancelled?: number;
}) {
  const Pill = ({
    icon,
    label,
    value,
    tone,
  }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    tone: "amber" | "sky" | "emerald" | "rose";
  }) => {
    const tones = {
      amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    } as const;
    if (value <= 0) return null;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${tones[tone]}`}
      >
        {icon}
        {label} {value}
      </span>
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {pending != null && pending > 0 && (
        <Pill
          icon={<span className="w-1 h-1 rounded-full bg-amber-500" />}
          label="ລໍ"
          value={pending}
          tone="amber"
        />
      )}
      {picked != null && picked > 0 && (
        <Pill
          icon={<span className="w-1 h-1 rounded-full bg-sky-500" />}
          label="ເບີກ"
          value={picked}
          tone="sky"
        />
      )}
      {completed != null && completed > 0 && (
        <Pill
          icon={<span className="w-1 h-1 rounded-full bg-emerald-500" />}
          label="ສຳເລັດ"
          value={completed}
          tone="emerald"
        />
      )}
      {cancelled != null && cancelled > 0 && (
        <Pill
          icon={<span className="w-1 h-1 rounded-full bg-rose-500" />}
          label="ຍົກເລີກ"
          value={cancelled}
          tone="rose"
        />
      )}
    </div>
  );
}

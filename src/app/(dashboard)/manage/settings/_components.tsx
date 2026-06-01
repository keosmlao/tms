"use client";

import { FaCheck, FaSave, FaSpinner } from "react-icons/fa";

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-500/10 flex items-center justify-center text-base">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p>
        {description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

export function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  icon,
  disabled,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  type?: "text" | "password" | "url";
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 disabled:cursor-not-allowed`}
        />
      </div>
      {hint && (
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function SaveBar({
  saving,
  savedAt,
  error,
  onSave,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <>
      {error && (
        <div className="glass rounded-lg p-3 text-xs text-rose-600 bg-rose-500/10">{error}</div>
      )}
      <div className="flex items-center justify-end gap-3">
        {savedAt && Date.now() - savedAt < 5_000 && (
          <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
            <FaCheck size={11} /> ບັນທຶກສຳເລັດ
          </span>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? (
            <>
              <FaSpinner className="animate-spin" /> ກຳລັງບັນທຶກ...
            </>
          ) : (
            <>
              <FaSave /> ບັນທຶກ
            </>
          )}
        </button>
      </div>
    </>
  );
}

export function PageLoading() {
  return (
    <div className="glass rounded-lg py-16 flex items-center justify-center text-slate-400">
      <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
    </div>
  );
}

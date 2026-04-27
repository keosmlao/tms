"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaPlay,
  FaStop,
  FaSpinner,
  FaSyncAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaHourglassHalf,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";

interface CarProgress {
  code: string;
  name: string;
  imei: string;
  days_done: number;
  days_total: number;
}

interface BackfillStatus {
  status: "idle" | "running" | "stopping" | "done" | "failed";
  started_at: string | null;
  finished_at: string | null;
  fromDate: string | null;
  toDate: string | null;
  car_code: string | null;
  iteration: number;
  max_iterations: number;
  total_inserted: number;
  total_errors: number;
  last_iteration_summary: {
    inserted_points?: number;
    fetched_days?: number;
    skipped_days?: number;
    errors?: number;
  } | null;
  last_error: string | null;
  next_run_at: string | null;
  cars_progress: CarProgress[];
  is_complete: boolean;
  log_tail: string[];
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("lo-LA", { hour12: false });
}

function countdownTo(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  return Math.ceil(diff / 1000);
}

export default function GpsBackfillPage() {
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [maxIterations, setMaxIterations] = useState(20);
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = (await Actions.getGpsBackfillStatus()) as BackfillStatus;
      setStatus(data);
    } catch (err) {
      console.error("status fetch failed", err);
    }
  }, []);

  // Poll every 2s while running
  useEffect(() => {
    void refresh();
    pollRef.current = window.setInterval(() => void refresh(), 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  // 1s ticker for countdown
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      await Actions.startGpsBackfill(fromDate, toDate, undefined, maxIterations);
      await refresh();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error ??
        (err as { message?: string })?.message ??
        "ເລີ່ມບໍ່ສຳເລັດ";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await Actions.stopGpsBackfill();
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status?.status === "running" || status?.status === "stopping";
  const countdown = countdownTo(status?.next_run_at ?? null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 shadow-xl">
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
            <FaSyncAlt className="text-teal-300" size={18} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300">
              GPS Backfill
            </p>
            <h1 className="text-xl font-bold text-white leading-tight">
              ດຶງຂໍ້ມູນຍ້ອນຫຼັງຈາກ Provider ໃສ່ realtime_log
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-300">
              ຮັນ loop ອັດຕະໂນມັດ, ລໍ rate-limit cooldown, skip ວັນທີ່ສຳເລັດແລ້ວ
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              ເຖິງວັນທີ
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              ຮອບສູງສຸດ
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value) || 20)}
              disabled={isRunning}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs disabled:opacity-60"
            />
          </div>
          {isRunning ? (
            <button
              type="button"
              onClick={handleStop}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <FaStop size={10} /> ຢຸດ
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {loading ? <FaSpinner className="animate-spin" size={10} /> : <FaPlay size={10} />}
              ເລີ່ມ
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white/40 dark:hover:bg-white/5"
            title="Refresh"
          >
            <FaSyncAlt size={10} />
          </button>
        </div>
        {error && (
          <div className="mt-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}
      </div>

      {/* Status bar */}
      {status && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatusCard
            label="ສະຖານະ"
            value={statusLabel(status.status)}
            color={statusColor(status.status)}
            icon={statusIcon(status.status)}
          />
          <StatusCard
            label="ຮອບ"
            value={`${status.iteration} / ${status.max_iterations}`}
            color="teal"
          />
          <StatusCard
            label="ບັນທຶກສະສົມ"
            value={status.total_inserted.toLocaleString()}
            color="emerald"
          />
          <StatusCard
            label="Errors"
            value={String(status.total_errors)}
            color={status.total_errors > 0 ? "amber" : "slate"}
          />
          <StatusCard
            label="ຮອບຖັດໄປ"
            value={
              countdown != null
                ? `ອີກ ${countdown}s`
                : status.status === "running"
                  ? "ກຳລັງຮັນ…"
                  : "-"
            }
            color={countdown != null ? "sky" : "slate"}
          />
        </div>
      )}

      {/* Per-car progress */}
      {status && status.cars_progress.length > 0 && (
        <div className="glass rounded-lg p-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-3">
            ຄວາມຄືບໜ້າ ຕໍ່ລົດ
          </h2>
          <div className="space-y-2">
            {status.cars_progress.map((c) => {
              const pct =
                c.days_total > 0
                  ? Math.min(100, Math.round((c.days_done / c.days_total) * 100))
                  : 0;
              const done = c.days_done >= c.days_total;
              return (
                <div key={c.imei} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
                    <FaTruck size={11} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {c.name || c.code}{" "}
                        <span className="font-mono text-slate-400">
                          {c.imei}
                        </span>
                      </span>
                      <span
                        className={`tabular-nums font-bold ${
                          done
                            ? "text-emerald-600"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {c.days_done}/{c.days_total} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          done ? "bg-emerald-500" : "bg-teal-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Run info */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div className="glass rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
              ຊ່ວງເວລາ
            </p>
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {status.fromDate} → {status.toDate}{" "}
              {status.car_code ? `(${status.car_code})` : "(ທຸກຄັນ)"}
            </p>
          </div>
          <div className="glass rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
              ເລີ່ມ / ສຳເລັດ
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              {formatDateTime(status.started_at)}
              {status.finished_at && <> → {formatDateTime(status.finished_at)}</>}
            </p>
          </div>
        </div>
      )}

      {/* Last iteration summary */}
      {status?.last_iteration_summary && (
        <div className="glass rounded-lg p-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-2">
            ຮອບຫຼ້າສຸດ
          </h2>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <Stat
              label="Inserted"
              value={String(status.last_iteration_summary.inserted_points ?? 0)}
              color="emerald"
            />
            <Stat
              label="Fetched"
              value={String(status.last_iteration_summary.fetched_days ?? 0)}
              color="sky"
            />
            <Stat
              label="Skipped"
              value={String(status.last_iteration_summary.skipped_days ?? 0)}
              color="slate"
            />
            <Stat
              label="Errors"
              value={String(status.last_iteration_summary.errors ?? 0)}
              color="amber"
            />
          </div>
        </div>
      )}

      {/* Log tail */}
      {status && status.log_tail.length > 0 && (
        <div className="glass rounded-lg p-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-2">
            Log
          </h2>
          <div className="max-h-80 overflow-y-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] text-emerald-300 space-y-0.5">
            {status.log_tail
              .slice()
              .reverse()
              .map((line, i) => (
                <div key={i}>{line}</div>
              ))}
          </div>
        </div>
      )}

      {status?.last_error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-[12px] text-rose-700 dark:text-rose-400">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <FaExclamationTriangle /> Error
          </div>
          {status.last_error}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: "teal" | "emerald" | "amber" | "slate" | "rose" | "sky";
  icon?: React.ReactNode;
}) {
  const palette: Record<string, string> = {
    teal: "text-teal-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    slate: "text-slate-500",
    rose: "text-rose-600",
    sky: "text-sky-600",
  };
  return (
    <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-sm dark:bg-slate-900/70 dark:border-white/5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums flex items-center gap-1.5 ${palette[color]}`}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "sky" | "slate" | "amber";
}) {
  const palette: Record<string, string> = {
    emerald: "text-emerald-600",
    sky: "text-sky-600",
    slate: "text-slate-500",
    amber: "text-amber-600",
  };
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`text-base font-bold tabular-nums ${palette[color]}`}>
        {value}
      </p>
    </div>
  );
}

function statusLabel(s: BackfillStatus["status"]) {
  switch (s) {
    case "idle":
      return "ວ່າງ";
    case "running":
      return "ກຳລັງຮັນ";
    case "stopping":
      return "ກຳລັງຢຸດ";
    case "done":
      return "ສຳເລັດ";
    case "failed":
      return "ຜິດພາດ";
  }
}

function statusColor(s: BackfillStatus["status"]) {
  switch (s) {
    case "running":
      return "teal" as const;
    case "done":
      return "emerald" as const;
    case "stopping":
      return "amber" as const;
    case "failed":
      return "rose" as const;
    default:
      return "slate" as const;
  }
}

function statusIcon(s: BackfillStatus["status"]) {
  switch (s) {
    case "running":
      return <FaSpinner className="animate-spin" size={14} />;
    case "done":
      return <FaCheckCircle size={14} />;
    case "stopping":
      return <FaHourglassHalf size={14} />;
    case "failed":
      return <FaExclamationTriangle size={14} />;
    default:
      return null;
  }
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaArrowRight,
  FaBoxOpen,
  FaBroadcastTower,
  FaChartLine,
  FaCheckCircle,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaMapMarkedAlt,
  FaRoute,
  FaSyncAlt,
  FaTruck,
  FaSpinner,
  FaClock,
  FaUsers,
} from "react-icons/fa";
import { FIXED_YEAR } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getDashboardData

// ==================== Types ====================

type CountValue = number | string | null | undefined;

interface SummaryData {
  bill_count: CountValue; pickup: CountValue; logistic: CountValue;
  logistic_od: CountValue; logistic_dt: CountValue; logistic_ps: CountValue;
}

interface TeamData {
  bill_count: CountValue; still: CountValue; complete: CountValue;
}

interface PendingShipment {
  doc_no: string; doc_date: string; transport_name: string | null;
  sale: string | null; transport: string | null;
  time_open: string | null; time_use: string | null; time_use_seconds?: CountValue;
}

interface InProgressShipment {
  bill_no: string;
  doc_no: string;
  doc_date: string;
  bill_date: string;
  customer: string;
  telephone: string;
  active_sent_start: string;
  active_seconds?: CountValue;
  car: string;
  driver: string;
  transport_name: string;
}

interface WaitingDispatchShipment {
  bill_no: string;
  doc_no: string;
  doc_date: string;
  bill_date: string;
  customer: string;
  telephone: string;
  waiting_since: string;
  waiting_seconds?: CountValue;
  car: string;
  driver: string;
  transport_name: string;
  picked_up?: boolean;
}

interface DeliveredPendingCloseShipment {
  bill_no: string;
  doc_no: string;
  doc_date: string;
  bill_date: string;
  customer: string;
  telephone: string;
  delivered_at: string;
  pending_close_seconds?: CountValue;
  car: string;
  driver: string;
  transport_name: string;
  job_status: CountValue;
  job_status_text: string;
  url_img?: string;
  sight_img?: string;
  remark?: string;
}

interface PendingSummary {
  month_count: CountValue; today_count: CountValue;
  today_pending: CountValue; today_complete: CountValue;
  month_pending: CountValue; month_complete: CountValue;
  year_pending: CountValue; year_complete: CountValue;
  current_date: string; current_month: string;
}

interface DashboardData {
  data: SummaryData; kl: TeamData; dt: TeamData; ps: TeamData;
  user_branch: string | null;
  trans: PendingShipment[]; trans_month: PendingShipment[]; trans_today: PendingShipment[];
  in_progress?: InProgressShipment[];
  in_progress_count?: CountValue;
  waiting_dispatch?: WaitingDispatchShipment[];
  waiting_dispatch_count?: CountValue;
  delivered_pending_close?: DeliveredPendingCloseShipment[];
  delivered_pending_close_count?: CountValue;
  pending_summary: PendingSummary;
}

// ==================== Helpers ====================

const numberFormatter = new Intl.NumberFormat("en-US");

function toNumber(value: CountValue) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatNumber(value: CountValue) {
  return numberFormatter.format(toNumber(value));
}
function getPercent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
function formatAgingSeconds(value: CountValue) {
  const totalSeconds = Math.max(0, Math.trunc(toNumber(value)));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0 ? `${days}d` : null,
    days > 0 || hours > 0 ? `${hours}h` : null,
    days > 0 || hours > 0 || minutes > 0 ? `${minutes}m` : null,
    `${seconds}s`,
  ].filter(Boolean);
  return parts.join(" ");
}
function getAgingClassName(value: CountValue) {
  const totalSeconds = toNumber(value);
  if (totalSeconds >= 4 * 3600) return "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20";
  if (totalSeconds >= 2 * 3600) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20";
  return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20";
}

async function fetchDashboardData() {
  return (await Actions.getDashboardData()) as unknown as DashboardData;
}

// ==================== UI Pieces ====================

const quickActions = [
  { href: "/approve", label: "ກວດອະນຸມັດ", description: "ຄຳຂໍລໍອະນຸມັດ", icon: <FaClipboardCheck />, color: "bg-teal-700" },
  { href: "/jobs", label: "ຈັດຖ້ຽວ", description: "ວາງແຜນການຈັດສົ່ງ", icon: <FaRoute />, color: "bg-slate-800" },
  { href: "/tracking", label: "ຕິດຕາມບິນ", description: "ກວດສະຖານະຂົນສົ່ງ", icon: <FaMapMarkedAlt />, color: "bg-sky-700" },
  { href: "/tracking/cars-map", label: "ແຜນທີ່ລົດ", description: "GPS live tracking", icon: <FaBroadcastTower />, color: "bg-emerald-700" },
  { href: "/reports/daily", label: "ລາຍງານ", description: "ສະຫຼຸບປະຈຳວັນ", icon: <FaChartLine />, color: "bg-amber-600" },
];

function HeroKpiTile({
  label,
  value,
  caption,
  icon,
  accent,
}: {
  label: string;
  value: CountValue;
  caption?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/12 bg-white/8 p-4 backdrop-blur-xl transition-all hover:bg-white/12">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">{label}</p>
          <p className="mt-1 text-3xl font-bold text-white leading-none tabular-nums">{formatNumber(value)}</p>
          {caption && <p className="mt-1 text-[11px] text-white/70">{caption}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent} text-white shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniDonut({
  label,
  sublabel,
  complete,
  pending,
  gradientFrom,
  gradientTo,
  gradientId,
}: {
  label: string;
  sublabel?: string;
  complete: number;
  pending: number;
  gradientFrom: string;
  gradientTo: string;
  gradientId: string;
}) {
  const total = complete + pending;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const completePct = total > 0 ? complete / total : 0;
  const pendingDash = circumference * (1 - completePct);
  const percent = getPercent(complete, total);

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200/70 bg-white/65 p-3 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400">
          {label}
        </p>
        {sublabel && (
          <span className="text-[9px] text-slate-400 font-normal">· {sublabel}</span>
        )}
      </div>

      <div className="relative w-[110px] h-[110px]">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="11"
            className="text-slate-100 dark:text-gray-800"
          />
          {total > 0 && (
            <circle
              cx="55"
              cy="55"
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={pendingDash}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          )}
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={gradientFrom} />
              <stop offset="100%" stopColor={gradientTo} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {total === 0 ? (
            <>
              <p className="text-sm font-semibold text-slate-400">—</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">ບໍ່ມີບິນ</p>
            </>
          ) : (
            <>
              <p
                className="text-xl font-bold tabular-nums"
                style={{
                  background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {percent}%
              </p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-gray-400 mt-0.5">ສຳເລັດ</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 w-full">
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-center">
          <p className="text-[9px] text-emerald-600 font-semibold">ສົ່ງ</p>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {formatNumber(complete)}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-center">
          <p className="text-[9px] text-amber-600 font-semibold">ລໍ</p>
          <p className="text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {formatNumber(pending)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ name, code, stats, color }: {
  name: string; code: string; stats: TeamData; color: "sky" | "emerald" | "amber";
}) {
  const total = toNumber(stats.bill_count);
  const pending = toNumber(stats.still);
  const complete = toNumber(stats.complete);
  const rate = getPercent(complete, total);

  const palette = {
    sky: { text: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500", soft: "bg-sky-50 dark:bg-sky-950/40" },
    emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500", soft: "bg-emerald-50 dark:bg-emerald-950/40" },
    amber: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500", soft: "bg-amber-50 dark:bg-amber-950/40" },
  } as const;
  const c = palette[color];

  return (
    <div className="rounded-lg border border-slate-200/70 bg-white/75 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg ${c.soft} ${c.text} flex items-center justify-center`}>
            <FaTruck size={13} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{code}</p>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{name}</p>
          </div>
        </div>
        <div className={`text-right ${c.text}`}>
          <p className="text-2xl font-bold tabular-nums leading-none">{rate}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">ສຳເລັດ</p>
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-slate-200/50 dark:bg-white/5 overflow-hidden">
        <div className={`h-full ${c.bg} transition-all duration-500`} style={{ width: `${rate}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/50 dark:bg-white/5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-slate-400">ທັງໝົດ</p>
          <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">{formatNumber(total)}</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-amber-600">ລໍຖ້າ</p>
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300 tabular-nums">{formatNumber(pending)}</p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-emerald-600">ສົ່ງແລ້ວ</p>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{formatNumber(complete)}</p>
        </div>
      </div>
    </div>
  );
}

function CarrierMixBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = getPercent(value, total);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-slate-600 dark:text-gray-300">{label}</span>
        <span className="text-slate-500 dark:text-gray-400 tabular-nums">
          {formatNumber(value)} <span className="text-slate-400">· {pct}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200/50 dark:bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PendingList({ items, emptyMessage, agingTick }: {
  items: PendingShipment[]; emptyMessage: string; agingTick: number;
}) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        <FaCheckCircle className="mx-auto text-emerald-300 text-3xl mb-2" />
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-200/30 dark:divide-white/5">
      {items.map((item) => {
        const liveAging = item.time_use_seconds == null ? null : toNumber(item.time_use_seconds) + agingTick;
        return (
          <div key={item.doc_no} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/55 dark:hover:bg-white/5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              <FaBoxOpen size={12} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">{item.doc_no}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                {item.doc_date} · {item.transport_name || "-"}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {item.sale || "-"} / {item.transport || "-"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${getAgingClassName(liveAging)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {liveAging == null ? item.time_use || "Pending" : formatAgingSeconds(liveAging)}
              </span>
              {item.time_open && (
                <p className="mt-0.5 text-[10px] text-slate-400">ເປີດ {item.time_open}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InProgressList({ items, total, agingTick }: {
  items: InProgressShipment[];
  total: CountValue;
  agingTick: number;
}) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        <FaCheckCircle className="mx-auto text-emerald-300 text-3xl mb-2" />
        ບໍ່ມີລາຍການກຳລັງຈັດສົ່ງ
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 px-5 py-3 bg-sky-500/5 border-b border-slate-200/30 dark:border-white/5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ບິນທັງໝົດ</p>
          <p className="text-lg font-bold text-sky-700 dark:text-sky-300 tabular-nums">{formatNumber(total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ສະແດງ</p>
          <p className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
            {formatNumber(items.length)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-200/30 dark:divide-white/5">
        {items.map((item) => {
          const liveSeconds = item.active_seconds == null ? null : toNumber(item.active_seconds) + agingTick;
          return (
            <div key={`${item.doc_no}-${item.bill_no}`} className="px-4 py-3 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                  <FaTruck size={13} />
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sm text-slate-800 dark:text-white">{item.bill_no}</p>
                    <span className="rounded-full bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-[10px] font-semibold">
                      ກຳລັງຈັດສົ່ງ
                    </span>
                    <span className="text-[10px] text-slate-400">ຖ້ຽວ {item.doc_no}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-gray-300 truncate font-medium">
                    {item.customer || "-"}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.transport_name || "-"} · {item.car || "-"} / {item.driver || "-"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${getAgingClassName(liveSeconds)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                    {liveSeconds == null ? "ກຳລັງຈັດສົ່ງ" : formatAgingSeconds(liveSeconds)}
                  </span>
                  <p className="mt-0.5 text-[10px] text-slate-400">ເລີ່ມ {item.active_sent_start || "-"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WaitingDispatchList({ items, total, agingTick }: {
  items: WaitingDispatchShipment[];
  total: CountValue;
  agingTick: number;
}) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        <FaCheckCircle className="mx-auto text-emerald-300 text-3xl mb-2" />
        ບໍ່ມີບິນຈັດຖ້ຽວແລ້ວທີ່ລໍຖ້າຈັດສົ່ງ
      </div>
    );
  }

  const pickedCount = items.filter((i) => i.picked_up).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-amber-500/5 border-b border-slate-200/30 dark:border-white/5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ບິນທັງໝົດ</p>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums">{formatNumber(total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ສະແດງ</p>
          <p className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
            {formatNumber(items.length)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ເບີກເຄື່ອງແລ້ວ</p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {formatNumber(pickedCount)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-200/30 dark:divide-white/5">
        {items.map((item) => {
          const liveSeconds = item.waiting_seconds == null ? null : toNumber(item.waiting_seconds) + agingTick;
          return (
            <div key={`${item.doc_no}-${item.bill_no}`} className="px-4 py-3 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  <FaClock size={13} />
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sm text-slate-800 dark:text-white">{item.bill_no}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      item.picked_up
                        ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                    }`}>
                      {item.picked_up ? "ເບີກເຄື່ອງແລ້ວ" : "ລໍຖ້າຈັດສົ່ງ"}
                    </span>
                    <span className="text-[10px] text-slate-400">ຖ້ຽວ {item.doc_no}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-gray-300 truncate font-medium">
                    {item.customer || "-"}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.transport_name || "-"} · {item.car || "-"} / {item.driver || "-"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${getAgingClassName(liveSeconds)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                    {liveSeconds == null ? "ລໍຖ້າ" : formatAgingSeconds(liveSeconds)}
                  </span>
                  <p className="mt-0.5 text-[10px] text-slate-400">ຈັດຖ້ຽວ {item.waiting_since || "-"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImageThumb({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative h-11 w-11 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition-all hover:ring-2 hover:ring-teal-500 dark:border-gray-700 dark:bg-gray-800"
        title={label}
      >
        <img src={src} alt={label} className="h-full w-full object-cover" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent text-[8px] font-semibold text-white px-1 py-0.5 text-center">
          {label}
        </span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={label} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}

function DeliveredPendingCloseList({ items, total, agingTick }: {
  items: DeliveredPendingCloseShipment[];
  total: CountValue;
  agingTick: number;
}) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        <FaCheckCircle className="mx-auto text-emerald-300 text-3xl mb-2" />
        ບໍ່ມີບິນທີ່ຈັດສົ່ງສຳເລັດທີ່ຍັງບໍ່ປິດຖ້ຽວ
      </div>
    );
  }

  const driverClosedCount = items.filter((i) => toNumber(i.job_status) === 3).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-emerald-500/5 border-b border-slate-200/30 dark:border-white/5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ບິນທັງໝົດ</p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{formatNumber(total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ສະແດງ</p>
          <p className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
            {formatNumber(items.length)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">ຄົນຂັບປິດງານແລ້ວ</p>
          <p className="text-lg font-bold text-sky-700 dark:text-sky-300 tabular-nums">
            {formatNumber(driverClosedCount)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-200/30 dark:divide-white/5">
        {items.map((item) => {
          const liveSeconds = item.pending_close_seconds == null ? null : toNumber(item.pending_close_seconds) + agingTick;
          const isDriverClosed = toNumber(item.job_status) === 3;
          return (
            <div key={`${item.doc_no}-${item.bill_no}`} className="px-4 py-3 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <FaCheckCircle size={13} />
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sm text-slate-800 dark:text-white">{item.bill_no}</p>
                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                      ຈັດສົ່ງສຳເລັດ
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isDriverClosed
                        ? "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}>
                      {item.job_status_text || "ຍັງບໍ່ປິດຖ້ຽວ"}
                    </span>
                    <span className="text-[10px] text-slate-400">ຖ້ຽວ {item.doc_no}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-gray-300 truncate font-medium">
                    {item.customer || "-"}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.transport_name || "-"} · {item.car || "-"} / {item.driver || "-"}
                  </p>
                </div>
                {(item.url_img || item.sight_img) && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.url_img && <ImageThumb src={item.url_img} label="ຮູບ" />}
                    {item.sight_img && <ImageThumb src={item.sight_img} label="ລາຍເຊັນ" />}
                  </div>
                )}
                <div className="shrink-0 text-right">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${getAgingClassName(liveSeconds)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                    {liveSeconds == null ? "ລໍ" : formatAgingSeconds(liveSeconds)}
                  </span>
                  <p className="mt-0.5 text-[10px] text-slate-400">ສົ່ງສຳເລັດ {item.delivered_at || "-"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Main ====================

type PendingTab = "year" | "month" | "today";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agingTick, setAgingTick] = useState(0);
  const [pendingTab, setPendingTab] = useState<PendingTab>("today");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await fetchDashboardData();
        if (!active) return;
        setData(result);
        setError(null);
        setLastFetched(new Date());
      } catch (e) {
        console.error(e);
        if (active) setError("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setAgingTick(c => c + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const result = await fetchDashboardData();
      setData(result);
      setError(null);
      setLastFetched(new Date());
    } catch {
      setError("ບໍ່ສາມາດອັບເດດຂໍ້ມູນໄດ້");
    } finally {
      setLoading(false);
    }
  };

  const computed = useMemo(() => {
    if (!data) return null;
    const summary = data.data;
    const totalBills = toNumber(summary.bill_count);
    const logistic = toNumber(summary.logistic);
    const odLogistic = toNumber(summary.logistic_od);
    const dtLogistic = toNumber(summary.logistic_dt);
    const psLogistic = toNumber(summary.logistic_ps);

    const allTeams = [
      { code: "KL", branch: "02-0001", name: "KL Transport", stats: data.kl, color: "sky" as const },
      { code: "DT", branch: "02-0002", name: "DT Transport", stats: data.dt, color: "emerald" as const },
      { code: "PS", branch: "02-0003", name: "PS Transport", stats: data.ps, color: "amber" as const },
    ];
    const teams = data.user_branch ? allTeams.filter((t) => t.branch === data.user_branch) : allTeams;

    const totalPending = teams.reduce((s, t) => s + toNumber(t.stats.still), 0);
    const totalComplete = teams.reduce((s, t) => s + toNumber(t.stats.complete), 0);
    const completionRate = getPercent(totalComplete, totalPending + totalComplete);
    const logisticRate = getPercent(logistic, totalBills);

    const allCarrierMix = [
      { branch: "02-0001", label: "OD Logistic", value: odLogistic, bar: "bg-gradient-to-r from-sky-400 to-sky-600" },
      { branch: "02-0002", label: "DT Logistic", value: dtLogistic, bar: "bg-gradient-to-r from-emerald-400 to-emerald-600" },
      { branch: "02-0003", label: "PS Logistic", value: psLogistic, bar: "bg-gradient-to-r from-amber-400 to-amber-600" },
    ];
    const carrierMix = data.user_branch ? allCarrierMix.filter((c) => c.branch === data.user_branch) : allCarrierMix;

    return { totalBills, logistic, teams, totalPending, totalComplete, completionRate, logisticRate, carrierMix };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <FaSpinner className="mb-4 animate-spin text-4xl text-teal-700 dark:text-teal-300" />
        <p className="text-slate-500 text-sm">ກຳລັງໂຫຼດ Dashboard...</p>
      </div>
    );
  }

  if (!data || !computed) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="mt-0.5" />
          <div>
            <h1 className="font-semibold">Dashboard ບໍ່ພ້ອມໃຊ້ງານ</h1>
            <p className="text-sm mt-1">{error ?? "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້"}</p>
            <button
              onClick={() => void handleRefresh()}
              className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 flex items-center gap-2"
            >
              <FaSyncAlt /> ລອງໃໝ່
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { totalBills, logistic, teams, totalPending, totalComplete, completionRate, logisticRate, carrierMix } = computed;
  const currentYear = FIXED_YEAR;

  const pendingLists: Record<PendingTab, { count: CountValue; items: PendingShipment[]; subtitle: string }> = {
    year: { count: totalPending, items: data.trans, subtitle: `ປີ ${currentYear}` },
    month: { count: data.pending_summary.month_count, items: data.trans_month, subtitle: `ເດືອນ ${data.pending_summary.current_month}` },
    today: { count: data.pending_summary.today_count, items: data.trans_today, subtitle: `ວັນ ${data.pending_summary.current_date}` },
  };
  const currentPending = pendingLists[pendingTab];

  return (
    <div className="space-y-5">
      {/* ========== HERO ========== */}
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 shadow-xl sm:p-6">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(45,212,191,.16) 1px, transparent 1px), linear-gradient(rgba(45,212,191,.11) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20 backdrop-blur">
                <FaTruck className="text-teal-200" size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-200">
                    Transport Control Center
                  </p>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                  ສູນຄວບຄຸມການຂົນສົ່ງ
                </h1>
                <p className="text-[11px] text-slate-300 mt-0.5">ODG Transport · ປີ {currentYear}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastFetched && (
                <span className="hidden sm:inline text-[11px] text-slate-400">
                  {lastFetched.toLocaleTimeString("lo-LA", { hour12: false })}
                </span>
              )}
              <button
                onClick={() => void handleRefresh()}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-medium text-white backdrop-blur transition-all hover:bg-white/15 disabled:opacity-60"
              >
                <FaSyncAlt className={loading ? "animate-spin" : ""} size={11} />
                ຣີເຟຣຊ
              </button>
            </div>
          </div>

          {/* KPI grid */}
          <div className="mt-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
            <HeroKpiTile
              label="ບິນທັງໝົດ"
              value={totalBills}
              caption={`ປີ ${currentYear}`}
              icon={<FaBoxOpen size={14} />}
              accent="bg-teal-600"
            />
            <HeroKpiTile
              label="ຕ້ອງຂົນສົ່ງ"
              value={logistic}
              caption={`${logisticRate}% ຂອງບິນທັງໝົດ`}
              icon={<FaTruck size={14} />}
              accent="bg-sky-600"
            />
            <HeroKpiTile
              label="ສົ່ງສຳເລັດ"
              value={totalComplete}
              caption={`${completionRate}% ສຳເລັດ`}
              icon={<FaCheckCircle size={14} />}
              accent="bg-emerald-600"
            />
            <HeroKpiTile
              label="ຄ້າງສົ່ງ"
              value={totalPending}
              caption={`${getPercent(totalPending, totalPending + totalComplete)}% ລໍຖ້າ`}
              icon={<FaClock size={14} />}
              accent="bg-amber-600"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <FaExclamationTriangle size={12} />
          {error}
        </div>
      )}

      {/* ========== QUICK ACTIONS ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickActions.map((action) => (
          <Link
            key={action.href}
             href={action.href}
            className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/65"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.color} text-white shadow-sm transition-transform group-hover:scale-105`}>
              {action.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{action.label}</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">{action.description}</p>
            </div>
            <FaArrowRight className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-teal-700 dark:group-hover:text-teal-300" size={11} />
          </Link>
        ))}
      </div>

      {/* ========== OVERVIEW GRID ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Completion donut card — split by day / month / year */}
        <div className="rounded-lg border border-slate-200/70 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/65 lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-950/40">
              <FaChartLine className="text-teal-700 dark:text-teal-300" size={12} />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຄວາມຄືບໜ້າການຂົນສົ່ງ</h2>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-gray-500">ແຍກຕາມ ວັນ · ເດືອນ · ປີ</p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MiniDonut
              label="ວັນນີ້"
              sublabel={data.pending_summary.current_date}
              complete={toNumber(data.pending_summary.today_complete)}
              pending={toNumber(data.pending_summary.today_pending)}
              gradientFrom="#06b6d4"
              gradientTo="#0e7c6b"
              gradientId="grad-today"
            />
            <MiniDonut
              label="ເດືອນນີ້"
              sublabel={data.pending_summary.current_month}
              complete={toNumber(data.pending_summary.month_complete)}
              pending={toNumber(data.pending_summary.month_pending)}
              gradientFrom="#10b981"
              gradientTo="#0e7c6b"
              gradientId="grad-month"
            />
            <MiniDonut
              label="ປີ"
              sublabel={String(currentYear)}
              complete={toNumber(data.pending_summary.year_complete)}
              pending={toNumber(data.pending_summary.year_pending)}
              gradientFrom="#f59e0b"
              gradientTo="#0e7c6b"
              gradientId="grad-year"
            />
          </div>
        </div>

        {/* Carrier mix */}
        <div className="rounded-lg border border-slate-200/70 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/65">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <FaRoute className="text-sky-500" size={12} />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Carrier Mix</h2>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-gray-500">
            {formatNumber(logistic)} ບິນ · {logisticRate}% ຂອງທັງໝົດ
          </p>
          <div className="mt-5 space-y-3.5">
            {carrierMix.map((c) => (
              <CarrierMixBar key={c.label} label={c.label} value={c.value} total={logistic} color={c.bar} />
            ))}
          </div>
        </div>

        {/* Teams */}
        <div className="rounded-lg border border-slate-200/70 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/65">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10">
              <FaUsers className="text-teal-700 dark:text-teal-300" size={12} />
            </div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">ໜ່ວຍຂົນສົ່ງ</h2>
          </div>
          <div className="space-y-2.5">
            {teams.map((t) => (
              <TeamCard key={t.code} {...t} />
            ))}
          </div>
        </div>
      </div>

      {/* ========== WAITING DISPATCH ========== */}
      <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 dark:border-slate-800 dark:bg-slate-900/65">
        <div className="flex flex-wrap items-center gap-3 justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FaClock className="text-amber-500" size={12} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຈັດຖ້ຽວແລ້ວ ລໍຖ້າຈັດສົ່ງ</h2>
              <p className="text-[11px] text-slate-400 dark:text-gray-500">
                ສະແດງ {formatNumber((data.waiting_dispatch ?? []).length)} / {formatNumber(data.waiting_dispatch_count ?? 0)} ບິນ
              </p>
            </div>
          </div>
          <Link
             href="/bills-waitingsent"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-semibold hover:bg-amber-700 transition-colors"
          >
            ເບິ່ງທັງໝົດ <FaArrowRight size={9} />
          </Link>
        </div>
        <WaitingDispatchList
          items={data.waiting_dispatch ?? []}
          total={data.waiting_dispatch_count ?? 0}
          agingTick={agingTick}
        />
      </div>

      {/* ========== IN PROGRESS ========== */}
      <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 dark:border-slate-800 dark:bg-slate-900/65">
        <div className="flex flex-wrap items-center gap-3 justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <FaTruck className="text-sky-500" size={12} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍການກຳລັງຈັດສົ່ງ</h2>
              <p className="text-[11px] text-slate-400 dark:text-gray-500">
                ສະແດງ {formatNumber((data.in_progress ?? []).length)} / {formatNumber(data.in_progress_count ?? 0)} ບິນ
              </p>
            </div>
          </div>
          <Link
             href="/bills-inprogress"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-[11px] font-semibold hover:bg-sky-700 transition-colors"
          >
            ເບິ່ງທັງໝົດ <FaArrowRight size={9} />
          </Link>
        </div>
        <InProgressList
          items={data.in_progress ?? []}
          total={data.in_progress_count ?? 0}
          agingTick={agingTick}
        />
      </div>

      {/* ========== DELIVERED, AWAITING JOB CLOSE ========== */}
      <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 dark:border-slate-800 dark:bg-slate-900/65">
        <div className="flex flex-wrap items-center gap-3 justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <FaCheckCircle className="text-emerald-500" size={12} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຈັດສົ່ງສຳເລັດ ແຕ່ຍັງບໍ່ປິດຖ້ຽວ</h2>
              <p className="text-[11px] text-slate-400 dark:text-gray-500">
                ສະແດງ {formatNumber((data.delivered_pending_close ?? []).length)} / {formatNumber(data.delivered_pending_close_count ?? 0)} ບິນ
              </p>
            </div>
          </div>
          <Link
             href="/bill-complete"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-700 transition-colors"
          >
            ເບິ່ງທັງໝົດ <FaArrowRight size={9} />
          </Link>
        </div>
        <DeliveredPendingCloseList
          items={data.delivered_pending_close ?? []}
          total={data.delivered_pending_close_count ?? 0}
          agingTick={agingTick}
        />
      </div>

      {/* ========== PENDING ========== */}
      <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 dark:border-slate-800 dark:bg-slate-900/65">
        <div className="flex flex-wrap items-center gap-3 justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FaClock className="text-amber-500" size={12} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍການລໍຖ້າຈັດສົ່ງ</h2>
              <p className="text-[11px] text-slate-400 dark:text-gray-500">{currentPending.subtitle}</p>
            </div>
          </div>
          <Link
             href="/bills-pending"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-lg text-[11px] font-semibold hover:bg-slate-800 transition-colors"
          >
            ເບິ່ງທັງໝົດ <FaArrowRight size={9} />
          </Link>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70">
            {([
              { key: "today" as const, label: "ວັນນີ້", count: data.pending_summary.today_count },
              { key: "month" as const, label: "ເດືອນນີ້", count: data.pending_summary.month_count },
              { key: "year" as const, label: `ປີ ${currentYear}`, count: totalPending },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPendingTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  pendingTab === tab.key
                    ? "bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-300"
                    : "text-slate-500 dark:text-gray-400 hover:text-slate-700"
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  pendingTab === tab.key
                    ? "bg-teal-500/10 text-teal-700 dark:text-teal-300"
                    : "bg-white/50 dark:bg-white/5 text-slate-500"
                }`}>
                  {formatNumber(tab.count)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <PendingList
          items={currentPending.items}
          emptyMessage={`ບໍ່ມີລາຍການໃນ${currentPending.subtitle}`}
          agingTick={agingTick}
        />
      </div>
    </div>
  );
}

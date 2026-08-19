"use client";

// ພາບລວມການຂົນສົ່ງ 1 ໜ້າຈໍ — ຕົວເລກມາຈາກ getBiDashboard() ບວກ getBiDeliveryStatus().
// ຄຳນິຍາມຂອງແຕ່ລະຕົວເລກຢູ່ src/queries/bi-dashboard.js — ໜ້ານີ້ບໍ່ຄິດສູດເອງ.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaChartLine,
  FaClipboardList,
  FaClock,
  FaExclamationTriangle,
  FaGasPump,
  FaMoneyBillWave,
  FaRoad,
  FaRoute,
  FaSpinner,
  FaSyncAlt,
  FaTruck,
  FaTruckLoading,
  FaWarehouse,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import { deliveryPerfRates } from "@/lib/delivery-performance";
import { fuelPaymentTypeLabel } from "@/lib/fuel-payment-type";
import type { BiDashboard } from "@/actions/bi-dashboard";
import type { DeliveryPerfReport } from "@/lib/delivery-performance";

// ── ສີຂອງກຣາຟ ────────────────────────────────────────────────────────────
// ຊຸດນີ້ຜ່ານການກວດທັງພື້ນຂາວ ແລະ ພື້ນມືດ (ຄວາມສະຫວ່າງ, contrast ≥ 3:1 ແລະ
// ການແຍກສີສຳລັບຄົນຕາບອດສີ) ຈຶ່ງໃຊ້ຄ່າດຽວກັນທັງສອງໂໝດ ບໍ່ຕ້ອງສະຫຼັບ.
const C = {
  good: "#059669", // ສຳເລັດ
  info: "#0284c7", // ກຳລັງດຳເນີນ
  warn: "#d97706", // ເຝົ້າລະວັງ
  bad: "#e11d48", // ບັນຫາ
  muted: "#94a3b8",
} as const;

const MONTH_NAMES = [
  "ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ",
  "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ",
];
const DOW_NAMES = ["ຈັນ", "ອັງຄານ", "ພຸດ", "ພະຫັດ", "ສຸກ", "ເສົາ", "ອາທິດ"];

const n = (v: number) => Math.round(Number(v) || 0).toLocaleString("en-US");
const n1 = (v: number) => (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}%`;
const kip = (v: number) => `${n(v)}`;

function monthText(month: string) {
  const [year, part] = (month ?? "").split("-");
  const index = Number(part) - 1;
  return index >= 0 && index < 12 ? `${MONTH_NAMES[index]} ${year}` : month || "—";
}

function monthOptions() {
  const out: string[] = [];
  const [minYear, minMonth] = FIXED_MONTH_MIN.split("-").map(Number);
  const [, maxMonth] = FIXED_MONTH_MAX.split("-").map(Number);
  for (let m = minMonth; m <= maxMonth; m += 1) {
    out.push(`${minYear}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

// ── ຊິ້ນສ່ວນທີ່ໃຊ້ຊ້ຳ ─────────────────────────────────────────────────────

function Section({
  index,
  title,
  subtitle,
  icon,
  children,
  className = "",
}: {
  index: number;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 ${className}`}
    >
      <header className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white dark:bg-slate-200 dark:text-slate-900">
          {index}
        </span>
        <span className="text-slate-400">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          {subtitle && (
            <p className="truncate text-[10.5px] leading-tight text-slate-400">{subtitle}</p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

/** ປ່ຽນແປງທຽບເດືອນກ່ອນ. higherIsBetter ຕັດສິນວ່າ ຂຶ້ນ = ດີ ຫຼື ຂຶ້ນ = ຮ້າຍ. */
function Delta({
  current,
  previous,
  higherIsBetter = true,
  suffix = "",
}: {
  current: number;
  previous: number;
  higherIsBetter?: boolean;
  suffix?: string;
}) {
  if (!Number.isFinite(previous) || previous === 0) {
    return <span className="text-[10px] text-slate-400">ບໍ່ມີເດືອນກ່ອນໃຫ້ທຽບ</span>;
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const flat = Math.abs(change) < 0.05;
  const good = flat || (change > 0) === higherIsBetter;
  const tone = flat
    ? "text-slate-400"
    : good
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${tone}`}>
      {flat ? "▬" : change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%{suffix} ທຽບເດືອນກ່ອນ
    </span>
  );
}

function KpiTile({
  label,
  value,
  unit,
  icon,
  accent,
  footer,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  accent: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-base" style={{ color: accent }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xl font-extrabold tabular-nums text-slate-800 dark:text-slate-50">
              {value}
            </span>
            {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
          </p>
        </div>
      </div>
      {footer && <div className="mt-1.5">{footer}</div>}
    </div>
  );
}

type Slice = { label: string; value: number; color: string };

/** ວົງແຫວນ + ປ້າຍຄ່າຂ້າງ — ປ້າຍເປັນຕົວໜັງສືສະເໝີ ບໍ່ໄດ້ອາໄສສີຢ່າງດຽວ */
function Donut({ slices, centerLabel, centerValue }: { slices: Slice[]; centerLabel: string; centerValue: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const gap = 2; // ຊ່ອງວ່າງລະຫວ່າງກ້ອນ ເພື່ອບໍ່ໃຫ້ 2 ສີຕິດກັນເປັນກ້ອນດຽວ
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 140 140" className="h-[130px] w-[130px] shrink-0" role="img">
        <circle cx="70" cy="70" r={radius} fill="none" strokeWidth="16" className="stroke-slate-100 dark:stroke-slate-800" />
        {total > 0 &&
          slices.map((s) => {
            const length = (s.value / total) * circumference;
            const dash = Math.max(0, length - gap);
            const el = (
              <circle
                key={s.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              >
                <title>{`${s.label}: ${n(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
              </circle>
            );
            offset += length;
            return el;
          })}
        <text x="70" y="66" textAnchor="middle" className="fill-slate-800 text-[17px] font-extrabold dark:fill-slate-50">
          {centerValue}
        </text>
        <text x="70" y="82" textAnchor="middle" className="fill-slate-400 text-[9px]">
          {centerLabel}
        </text>
      </svg>
      <ul className="w-full space-y-1.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[11px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{s.label}</span>
            <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{n(s.value)}</span>
            <span className="w-12 text-right tabular-nums text-slate-400">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ແຖບນອນ ພ້ອມປ້າຍຄ່າ — ໃຊ້ກັບອັນດັບ (ສາຂາ, ພະແນກ, ສາເຫດ) */
function BarRow({
  label,
  value,
  max,
  display,
  color = C.info,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  color?: string;
}) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className="w-[92px] shrink-0 truncate text-slate-600 dark:text-slate-300" title={label}>
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span className="block h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </span>
      <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
        {display}
      </span>
    </li>
  );
}

/** ແທ່ງຕັ້ງ — ຖ້ຽວແຍກຕາມມື້ຂອງອາທິດ */
function ColumnChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-[132px] items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
            {n(d.value)}
          </span>
          <div
            className="w-full rounded-t"
            style={{ height: `${(d.value / max) * 88}px`, minHeight: 2, background: C.info }}
            title={`${d.label}: ${n(d.value)} ຖ້ຽວ`}
          />
          <span className="text-[9.5px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** ເສັ້ນແນວໂນ້ມ 0–100% ພ້ອມເສັ້ນເປົ້າໝາຍ */
function TrendLine({
  points,
  target,
}: {
  points: Array<{ label: string; value: number; hint: string }>;
  target: number | null;
}) {
  const W = 520;
  const H = 150;
  const padL = 30;
  const padR = 26; // ເຫຼືອບ່ອນໃຫ້ປ້າຍຄ່າຂອງຈຸດສຸດທ້າຍ ບໍ່ໃຫ້ລົ້ນຂອບ
  const padT = 18;
  const padB = 20;
  const x = (i: number) =>
    padL + (points.length <= 1 ? 0 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v: number) => padT + ((100 - v) / 100) * (H - padT - padB);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" role="img">
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-slate-100 dark:stroke-slate-800"
            strokeWidth="1"
          />
          <text x={padL - 5} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[8.5px]">
            {tick}
          </text>
        </g>
      ))}
      {target != null && (
        <line
          x1={padL}
          x2={W - padR}
          y1={y(target)}
          y2={y(target)}
          stroke={C.warn}
          strokeWidth="1.5"
          strokeDasharray="5 4"
        >
          <title>{`ເປົ້າໝາຍ ${target}%`}</title>
        </line>
      )}
      {points.length > 1 && <path d={path} fill="none" stroke={C.good} strokeWidth="2" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill={C.good} className="stroke-white dark:stroke-slate-900" strokeWidth="2">
            <title>{p.hint}</title>
          </circle>
          <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[8.5px]">
            {p.label}
          </text>
        </g>
      ))}
      {/* ປ້າຍຄ່າສະເພາະຈຸດທຳອິດ ແລະ ຈຸດສຸດທ້າຍ — ບໍ່ຕິດທຸກຈຸດ ບໍ່ດັ່ງນັ້ນອ່ານບໍ່ອອກ */}
      {points.length > 0 &&
        [0, points.length - 1].filter((i, idx, arr) => arr.indexOf(i) === idx).map((i) => (
          <text
            key={`v${i}`}
            x={x(i)}
            y={y(points[i].value) - 9}
            textAnchor={i === 0 ? "start" : "end"}
            className="fill-slate-600 text-[9.5px] font-bold dark:fill-slate-200"
          >
            {points[i].value.toFixed(1)}%
          </text>
        ))}
    </svg>
  );
}

/** ເກຈເຄິ່ງວົງ 0–100% */
function Gauge({ value, caption, color = C.good }: { value: number | null; caption: string; color?: string }) {
  const clamped = value == null ? 0 : Math.max(0, Math.min(100, value));
  const radius = 52;
  const half = Math.PI * radius;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 130 74" className="h-[74px] w-[130px]" role="img">
        <path d="M 13 65 A 52 52 0 0 1 117 65" fill="none" strokeWidth="13" strokeLinecap="round" className="stroke-slate-100 dark:stroke-slate-800" />
        <path
          d="M 13 65 A 52 52 0 0 1 117 65"
          fill="none"
          stroke={color}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * half} ${half}`}
        />
        <text x="65" y="60" textAnchor="middle" className="fill-slate-800 text-[19px] font-extrabold dark:fill-slate-50">
          {value == null ? "—" : `${clamped.toFixed(1)}%`}
        </text>
      </svg>
      <p className="mt-0.5 text-center text-[10px] leading-tight text-slate-400">{caption}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      {children}
    </p>
  );
}

// ── ໜ້າຈໍ ─────────────────────────────────────────────────────────────────

const FLOW = [
  { label: "ຮັບບິນ", icon: <FaClipboardList /> },
  { label: "ຈັດຖ້ຽວ", icon: <FaWarehouse /> },
  { label: "ຂົນສົ່ງ", icon: <FaTruck /> },
  { label: "ສົ່ງເຖິງລູກຄ້າ", icon: <FaBoxOpen /> },
  { label: "ຕົ້ນທຶນ & ຜົນງານ", icon: <FaMoneyBillWave /> },
];

export default function BiDashboardPage() {
  const [month, setMonth] = useState(getFixedTodayMonth());
  const [carCode, setCarCode] = useState("");
  const [data, setData] = useState<BiDashboard | null>(null);
  const [status, setStatus] = useState<DeliveryPerfReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ພາກ ② ຖາມແຍກ ເພາະ query ຂອງມັນໃຊ້ເວລາ ~12 ວິນາທີ. Server action ແລ່ນ
  // ເທື່ອລະອັນຢູ່ແລ້ວ ຈຶ່ງຍິງອັນໄວກ່ອນ — ໜ້າຈໍຂຶ້ນພາຍໃນ 1 ວິນາທີ ແລ້ວພາກ ②
  // ຈຶ່ງຕື່ມເຂົ້າມາທີ່ຫຼັງ ແທນທີ່ຈະຄ້າງຂາວທັງໜ້າ.
  const load = useCallback(async (target: string, car: string) => {
    setLoading(true);
    setStatusLoading(!car);
    setError(null);
    setStatus(null);
    try {
      setData((await Actions.getBiDashboard(target, car)) as BiDashboard);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
      setStatusLoading(false);
      return;
    } finally {
      setLoading(false);
    }
    // ພາກ ② ນັບຢູ່ລະດັບບິນ ຈຶ່ງແຍກຕາມລົດບໍ່ໄດ້ — ເມື່ອກັ່ນຕອງລົດຄັນດຽວ ຈຶ່ງ
    // ບໍ່ຍິງມັນເລີຍ (ປະຢັດ ~12 ວິນາທີ) ແລະ ໜ້າຈໍບອກແທນວ່າເປັນຫຍັງ.
    if (car) return;
    try {
      setStatus((await Actions.getBiDeliveryStatus(target)) as DeliveryPerfReport);
    } catch (e) {
      console.error(e);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month, carCode);
  }, [load, month, carCode]);

  const rates = useMemo(
    () => (status ? deliveryPerfRates(status.overall) : null),
    [status]
  );

  const months = useMemo(() => monthOptions(), []);
  const selectedCar = useMemo(
    () => data?.cars.find((c) => c.code === data.carCode) ?? null,
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 text-lg text-teal-600 dark:text-teal-400">
            <FaChartLine />
          </span>
          <div>
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">
              ພາບລວມການຂົນສົ່ງ
            </h1>
            <p className="text-[11px] text-slate-400">
              ຕິດຕາມການຂົນສົ່ງຄົບທຸກມິຕິ — {monthText(month)}
              {selectedCar ? ` · ${selectedCar.name}` : " · ທຸກຄັນ"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthText(m)}
              </option>
            ))}
          </select>
          <select
            value={carCode}
            onChange={(e) => setCarCode(e.target.value)}
            title="ກັ່ນຕອງທັງໜ້າລົງລົດຄັນດຽວ"
            className="max-w-[220px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">ທຸກຄັນ ({data?.cars.length ?? 0} ຄັນ)</option>
            {(data?.cars ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
                {c.trips > 0 ? ` · ${c.trips} ຖ້ຽວ` : " · ບໍ່ມີຖ້ຽວ"}
              </option>
            ))}
          </select>
          {carCode && (
            <button
              type="button"
              onClick={() => setCarCode("")}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ລ້າງ
            </button>
          )}
          <button
            type="button"
            onClick={() => void load(month, carCode)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? <FaSpinner className="animate-spin" /> : <FaSyncAlt />}
            ໂຫຼດຄືນ
          </button>
        </div>
      </div>

      {/* ຂັ້ນຕອນງານ — ອ່ານໜ້ານີ້ຈາກຊ້າຍໄປຂວາຕາມນີ້ */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        {FLOW.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <span className="text-teal-600 dark:text-teal-400">{step.icon}</span>
              {step.label}
            </span>
            {i < FLOW.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300">
          <FaExclamationTriangle /> {error}
        </div>
      )}

      {!data && loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/70">
          <FaSpinner className="animate-spin" /> ກຳລັງໂຫຼດ…
        </div>
      )}

      {data && (
        <DashboardBody
          data={data}
          status={status}
          rates={rates}
          statusLoading={statusLoading}
          loading={loading}
        />
      )}
    </div>
  );
}

function DashboardBody({
  data,
  status,
  rates,
  statusLoading,
  loading,
}: {
  data: BiDashboard;
  status: DeliveryPerfReport | null;
  rates: ReturnType<typeof deliveryPerfRates> | null;
  statusLoading: boolean;
  loading: boolean;
}) {
  const { current, previous, exceptions, vehicles, load, targets } = data;
  const overall = status?.overall ?? null;
  // ເດືອນທີ່ກຳລັງແລ່ນຢູ່ ຍັງບໍ່ຄົບວັນ ຈຶ່ງທຽບກັບເດືອນເຕັມບໍ່ໄດ້ຊື່ໆ
  const isPartialMonth = data.month === getFixedTodayMonth();
  // ພາກທີ່ນັບຢູ່ລະດັບ "ບິນ" (② ແລະ ອັນດັບໃນ ③) ບໍ່ມີມິຕິລົດ ຈຶ່ງກັ່ນຕອງບໍ່ໄດ້
  const carFiltered = Boolean(data.carCode);
  const carName = data.cars.find((c) => c.code === data.carCode)?.name ?? data.carCode;

  const statusSlices: Slice[] = overall
    ? [
        { label: "ສົ່ງເຖິງລູກຄ້າແລ້ວ", value: overall.delivered, color: C.good },
        { label: "ຍັງຄ້າງສົ່ງ (ຍົກໄປເດືອນໜ້າ)", value: overall.carry_out, color: C.info },
        { label: "ປິດດ້ວຍທາງອື່ນ (ຄືນສິນຄ້າ / ປິດທີ່ ERP)", value: overall.closed_other, color: C.warn },
        { label: "ມີການຍົກເລີກການສົ່ງ", value: overall.cancelled_bills, color: C.bad },
      ]
    : [];

  // ຄຳອະທິບາຍປະເພດການເຕີມ ດຶງຈາກ lib/fuel-payment-type.js ບ່ອນດຽວ — ເພີ່ມ
  // ປະເພດໃໝ່ຢູ່ບ່ອນນັ້ນແລ້ວ ໜ້ານີ້ຂຶ້ນຕາມເອງ ບໍ່ຕ້ອງແກ້ 2 ບ່ອນ.
  const fuelSlices: Slice[] = current.fuel.by_type.map((t, i) => ({
    label:
      t.fuel_type === "unspecified"
        ? "ບໍ່ໄດ້ລະບຸປະເພດ"
        : fuelPaymentTypeLabel(t.fuel_type),
    value: t.amount,
    color: [C.good, C.info, C.warn, C.bad][i % 4],
  }));

  const branchBars = [...(status?.branches ?? [])]
    .map((b) => ({
      label: b.branch_name,
      value: b.delivered > 0 ? (b.from_open.le_24h / b.delivered) * 100 : 0,
      delivered: b.delivered,
    }))
    .filter((b) => b.delivered > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const deptBars = [...(status?.departments ?? [])]
    .map((d) => ({
      label: d.department_name,
      value: d.delivered > 0 ? (d.from_open.le_24h / d.delivered) * 100 : 0,
      delivered: d.delivered,
    }))
    .filter((d) => d.delivered > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const trendPoints = data.onTimeTrend.map((t) => ({
    label: MONTH_NAMES[Number(t.month.slice(5)) - 1]?.slice(0, 3) ?? t.month,
    value: t.on_time_pct,
    hint: `${monthText(t.month)}: ${t.on_time_pct.toFixed(1)}% (${n(t.on_time)}/${n(t.drops)} ຈຸດສົ່ງ)`,
  }));

  const maxReason = Math.max(1, ...exceptions.reasons.map((r) => r.legs));
  const maxException = Math.max(1, ...exceptions.items.map((i) => i.count));

  const kpiRows = [
    {
      label: "ສົ່ງທັນເວລາ (%)",
      target: targets.on_time_rate,
      unit: "%",
      value: current.delivery.on_time_pct,
      prev: previous.delivery.on_time_pct,
      higherIsBetter: true,
      format: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: "ຄ່ານ້ຳມັນ (ກີບ)",
      target: null,
      unit: "ກີບ",
      value: current.fuel.amount,
      prev: previous.fuel.amount,
      higherIsBetter: false,
      format: (v: number) => kip(v),
    },
    {
      label: "ຄ່ານ້ຳມັນ/ຖ້ຽວ (ກີບ)",
      target: null,
      unit: "ກີບ",
      value: current.cost_per_trip,
      prev: previous.cost_per_trip,
      higherIsBetter: false,
      format: (v: number) => kip(v),
    },
    {
      label: "ຄ່ານ້ຳມັນ/ກມ (ກີບ)",
      target: null,
      unit: "ກີບ",
      value: current.cost_per_km,
      prev: previous.cost_per_km,
      higherIsBetter: false,
      format: (v: number) => kip(v),
    },
    {
      label: "ອັດຕາໃຊ້ພື້ນທີ່ບັນທຸກ (%)",
      target: null,
      unit: "%",
      value: load?.avg_pct ?? 0,
      prev: 0,
      higherIsBetter: true,
      format: (v: number) => (load?.avg_pct == null ? "—" : `${v.toFixed(1)}%`),
    },
  ];

  return (
    <div className={loading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4"}>
      {/* ① ສະຫຼຸບ KPI */}
      <Section index={1} title="ສະຫຼຸບ KPI" subtitle={`ເດືອນ ${monthText(data.month)} ທຽບກັບເດືອນກ່ອນ`} icon={<FaChartLine />}>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile
            label="ຖ້ຽວທັງໝົດ"
            value={n(current.trips.trips)}
            unit="ຖ້ຽວ"
            icon={<FaTruck />}
            accent={C.info}
            footer={<Delta current={current.trips.trips} previous={previous.trips.trips} />}
          />
          <KpiTile
            label="ຈຸດສົ່ງສຳເລັດ"
            value={n(current.delivery.drops)}
            unit={`ຈຸດ · ${n(current.delivery.bills)} ບິນ`}
            icon={<FaBoxOpen />}
            accent={C.good}
            footer={<Delta current={current.delivery.drops} previous={previous.delivery.drops} />}
          />
          <KpiTile
            label="ສົ່ງທັນເວລາ"
            value={pct(current.delivery.on_time_pct)}
            unit={`${n(current.delivery.late)} ຈຸດຊ້າ`}
            icon={<FaClock />}
            accent={C.good}
            footer={
              <Delta current={current.delivery.on_time_pct} previous={previous.delivery.on_time_pct} />
            }
          />
          <KpiTile
            label="ຄ່ານ້ຳມັນລວມ"
            value={kip(current.fuel.amount)}
            unit="ກີບ"
            icon={<FaMoneyBillWave />}
            accent={C.warn}
            footer={
              <Delta current={current.fuel.amount} previous={previous.fuel.amount} higherIsBetter={false} />
            }
          />
          <KpiTile
            label="ຄ່ານ້ຳມັນ/ຖ້ຽວ"
            value={kip(current.cost_per_trip)}
            unit="ກີບ/ຖ້ຽວ"
            icon={<FaClipboardList />}
            accent={C.warn}
            footer={
              <Delta current={current.cost_per_trip} previous={previous.cost_per_trip} higherIsBetter={false} />
            }
          />
          <KpiTile
            label="ຄ່ານ້ຳມັນ/ກມ"
            value={kip(current.cost_per_km)}
            unit="ກີບ/ກມ"
            icon={<FaRoad />}
            accent={C.warn}
            footer={
              <Delta current={current.cost_per_km} previous={previous.cost_per_km} higherIsBetter={false} />
            }
          />
        </div>
        {isPartialMonth && (
          <Note>
            ເດືອນນີ້ <strong>ຍັງບໍ່ທັນຄົບເດືອນ</strong> — ຊ່ອງ “ທຽບເດືອນກ່ອນ” ຈຶ່ງທຽບເດືອນທີ່ຍັງບໍ່ຈົບ
            ກັບເດືອນເຕັມ ແລະ ຈະຕິດລົບເປັນທຳມະດາ. ຢາກທຽບໃຫ້ຍຸດຕິທຳ ໃຫ້ເລືອກເດືອນທີ່ຈົບແລ້ວ.
          </Note>
        )}
        <Note>
          ຕົ້ນທຶນທີ່ສະແດງ ນັບສະເພາະ <strong>ຄ່ານ້ຳມັນ</strong> ທີ່ບັນທຶກໃນລະບົບ —
          ຄ່າແຮງຄົນຂັບ, ຄ່າຜ່ານທາງ, ຄ່າສ້ອມແປງ ແລະ ຄ່າຈ້າງລົດນອກ ຍັງບໍ່ມີບ່ອນເກັບ
          ໃນ TMS ຈຶ່ງບໍ່ໄດ້ຄິດເຂົ້າ. ຕົວເລກນີ້ຈຶ່ງເປັນ “ຕົ້ນທຶນຂັ້ນຕ່ຳ” ບໍ່ແມ່ນຕົ້ນທຶນເຕັມ.
        </Note>
      </Section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ② ສະຖານະການຈັດສົ່ງ */}
        <Section index={2} title="ສະຖານະການຈັດສົ່ງ" subtitle="ບິນທີ່ຢູ່ໃນມືເດືອນນີ້ (ຍົກມາ + ເປີດໃໝ່)" icon={<FaBoxOpen />}>
          {overall && rates ? (
            <>
              <Donut slices={statusSlices} centerValue={n(overall.handled)} centerLabel="ບິນໃນມື" />
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ອັດຕາສົ່ງສຳເລັດ</p>
                  <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {pct(rates.deliveredRate)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ບິນທະຍອຍສົ່ງຫຼາຍຖ້ຽວ</p>
                  <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {n(overall.multi_leg_bills)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[196px] flex-col items-center justify-center gap-2 px-3 text-center text-[11px] text-slate-400">
              {carFiltered ? (
                <>
                  <FaTruck className="text-base" />
                  <span>
                    ພາກນີ້ນັບຢູ່ລະດັບ <strong>ບິນ</strong> (ຍົກມາ / ເປີດໃໝ່ / ຄ້າງ) ຊຶ່ງບໍ່ຜູກກັບລົດ
                    ຄັນໃດຄັນໜຶ່ງ — ບິນດຽວອາດຖືກສົ່ງຫຼາຍຖ້ຽວ ຫຼາຍຄັນ. ເລືອກ “ທຸກຄັນ” ເພື່ອເບິ່ງພາກນີ້.
                  </span>
                </>
              ) : statusLoading ? (
                <>
                  <FaSpinner className="animate-spin text-base" />
                  ກຳລັງຄິດຍອດບິນທັງເດືອນ… (ໃຊ້ເວລາປະມານ 10 ວິນາທີ)
                </>
              ) : (
                "ໂຫຼດສະຖານະການຈັດສົ່ງບໍ່ສຳເລັດ"
              )}
            </div>
          )}
        </Section>

        {/* ③ ອັດຕາສົ່ງທັນເວລາ */}
        <Section
          index={3}
          title="ອັດຕາສົ່ງທັນເວລາ"
          subtitle="ສົ່ງສຳເລັດພາຍໃນວັນນັດ ÷ ຈຸດສົ່ງທີ່ມີວັນນັດ"
          icon={<FaClock />}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tabular-nums" style={{ color: C.good }}>
              {pct(current.delivery.on_time_pct)}
            </span>
            <span className="text-[11px] text-slate-400">
              {n(current.delivery.on_time)} / {n(current.delivery.drops - current.delivery.no_due)} ຈຸດສົ່ງ
            </span>
          </div>
          <div className="mt-2">
            <p className="mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
              ສາຂາ — ສົ່ງພາຍໃນ 24 ຊມ ນັບແຕ່ເປີດບິນ
            </p>
            <ul className="space-y-1.5">
              {branchBars.length === 0 && (
                <li className="text-[11px] text-slate-400">
                  {carFiltered ? "ບໍ່ແຍກຕາມລົດໄດ້ — ນັບຢູ່ລະດັບບິນ" : statusLoading ? "ກຳລັງໂຫຼດ…" : "ບໍ່ມີຂໍ້ມູນ"}
                </li>
              )}
              {branchBars.map((b) => (
                <BarRow key={b.label} label={b.label} value={b.value} max={100} display={pct(b.value)} color={C.good} />
              ))}
            </ul>
          </div>
          <div className="mt-2.5">
            <p className="mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
              ພະແນກຜູ້ເປີດບິນ — ສົ່ງພາຍໃນ 24 ຊມ
            </p>
            <ul className="space-y-1.5">
              {deptBars.length === 0 && (
                <li className="text-[11px] text-slate-400">
                  {carFiltered ? "ບໍ່ແຍກຕາມລົດໄດ້ — ນັບຢູ່ລະດັບບິນ" : statusLoading ? "ກຳລັງໂຫຼດ…" : "ບໍ່ມີຂໍ້ມູນ"}
                </li>
              )}
              {deptBars.map((d) => (
                <BarRow key={d.label} label={d.label} value={d.value} max={100} display={pct(d.value)} color={C.info} />
              ))}
            </ul>
          </div>
        </Section>

        {/* ④ ຖ້ຽວ ແລະ ສາຍທາງ */}
        <Section index={4} title="ຖ້ຽວ ແລະ ສາຍທາງ" subtitle="ຖ້ຽວທີ່ອະນຸມັດແລ້ວໃນເດືອນ" icon={<FaRoute />}>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {[
              { label: "ຖ້ຽວທັງໝົດ", value: n(current.trips.trips), icon: <FaTruck /> },
              { label: "ໄລຍະທາງລວມ (ກມ)", value: n(current.km), icon: <FaRoad /> },
              {
                label: "ສະເລ່ຍ ກມ/ຖ້ຽວ",
                value: current.trips.trips > 0 ? n1(current.km / current.trips.trips) : "—",
                icon: <FaRoad />,
              },
              { label: "ຈຸດສົ່ງສຳເລັດ", value: n(current.delivery.drops), icon: <FaBoxOpen /> },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                <p className="flex items-center gap-1 text-slate-400">
                  <span className="text-[9px]">{s.icon}</span>
                  {s.label}
                </p>
                <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
            ຖ້ຽວແຍກຕາມມື້
          </p>
          <ColumnChart
            data={data.tripsByWeekday.map((d) => ({ label: DOW_NAMES[d.dow - 1], value: d.trips }))}
          />
          <p className="mt-1 text-[10px] text-slate-400">
            ໄລຍະທາງມາຈາກ{" "}
            {current.km_source === "gps"
              ? `GPS (${current.gps.trackers} ເຄື່ອງຕິດຕາມ)`
              : current.km_source === "odometer"
                ? `ເລກໄມລ໌ທີ່ຄົນຂັບບັນທຶກ (${n(current.trips.trips_with_odometer)} ຖ້ຽວ)`
                : "— ບໍ່ມີແຫຼ່ງໄລຍະທາງ"}
          </p>
        </Section>
      </div>

      {/* ④ (ຕໍ່) ຕາຕະລາງສາຍທາງ */}
      <Section index={4} title="ສາຍທາງທີ່ໃຊ້ຫຼາຍທີ່ສຸດ" subtitle="8 ອັນດັບທຳອິດຂອງເດືອນ" icon={<FaRoute />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-1.5 pr-2 font-semibold">ລະຫັດ</th>
                <th className="py-1.5 pr-2 font-semibold">ຊື່ສາຍ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ຖ້ຽວ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດສົ່ງ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດ/ຖ້ຽວ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ກມ/ຖ້ຽວ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ຍົກເລີກ</th>
                <th className="py-1.5 text-right font-semibold">ທັນເວລາ</th>
              </tr>
            </thead>
            <tbody>
              {data.routes.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-slate-400">
                    ບໍ່ມີຖ້ຽວໃນເດືອນນີ້
                  </td>
                </tr>
              )}
              {data.routes.map((r) => (
                <tr key={r.route_code} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                  <td className="py-1.5 pr-2 font-mono text-[10px] text-slate-500">{r.route_code}</td>
                  <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">
                    {r.route_code === "—" ? "ບໍ່ໄດ້ລະບຸສາຍ" : r.route_name}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n(r.trips)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n(r.drops)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n1(r.drops_per_trip)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                    {r.route_km > 0 ? n1(r.route_km) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{n(r.cancelled)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{pct(r.on_time_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          ຄໍລຳ “ກມ/ຖ້ຽວ” ແມ່ນໄລຍະທາງທີ່ຕັ້ງໄວ້ໃນຂໍ້ມູນສາຍທາງ (ຫຼາຍສາຍຍັງບໍ່ໄດ້ຕັ້ງ ຈຶ່ງເປັນ —)
          ບໍ່ແມ່ນໄລຍະທາງ GPS ຕົວຈິງຂອງແຕ່ລະຖ້ຽວ.
        </p>
      </Section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ⑤ ການໃຊ້ລົດ */}
        <Section
          index={5}
          title={carFiltered ? `ການໃຊ້ລົດ · ${carName}` : "ການໃຊ້ລົດຂົນສົ່ງ"}
          subtitle={carFiltered ? "ສະເພາະຄັນທີ່ເລືອກ" : "ນັບສະເພາະລົດທີ່ສັງກັດສາຂາຂົນສົ່ງ"}
          icon={<FaTruck />}
        >
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            {(carFiltered
              ? [
                  { label: "ຖ້ຽວ", value: current.trips.trips, unit: "ຖ້ຽວ", color: "text-slate-800 dark:text-slate-100" },
                  { label: "ວັນທີ່ອອກຖ້ຽວ", value: vehicles.car_days, unit: "ວັນ", color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "ວັນທີ່ຈອດ", value: Math.max(0, vehicles.days_in_month - vehicles.car_days), unit: "ວັນ", color: "text-slate-400" },
                ]
              : [
                  { label: "ລົດຂົນສົ່ງ", value: vehicles.total_cars, unit: "ຄັນ", color: "text-slate-800 dark:text-slate-100" },
                  { label: "ອອກຖ້ຽວ", value: vehicles.used_cars, unit: "ຄັນ", color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "ບໍ່ໄດ້ໃຊ້", value: vehicles.idle_cars, unit: "ຄັນ", color: "text-slate-400" },
                ]
            ).map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800/70">
                <p className="text-slate-400">{s.label}</p>
                <p className={`text-lg font-extrabold tabular-nums ${s.color}`}>{n(s.value)}</p>
                <p className="text-[9.5px] text-slate-400">{s.unit}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <Gauge
              value={vehicles.utilization_pct}
              caption={
                carFiltered
                  ? `${carName} ອອກຖ້ຽວ ${n(vehicles.car_days)} ວັນ ຈາກ ${vehicles.days_in_month} ວັນ`
                  : `${n(vehicles.car_days)} ວັນ-ຄັນ ທີ່ມີຖ້ຽວ ÷ (${n(vehicles.total_cars)} ຄັນ × ${vehicles.days_in_month} ວັນ)`
              }
              color={C.info}
            />
          </div>
          {!carFiltered && (
            <Note>
              ບໍ່ນັບພາຫະນະທີ່ບໍ່ແມ່ນລົດຂົນສົ່ງ (ເຊັ່ນ Forklift) ແລະ ລົດທີ່ຕິດ GPS ໄວ້ແຕ່ຍັງບໍ່ໄດ້
              ຜູກສາຂາຂົນສົ່ງ. ໄລຍະທາງ ແລະ ຕາຕະລາງນ້ຳມັນ ກໍ່ນັບລົດຊຸດດຽວກັນນີ້.
            </Note>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
              <p className="text-slate-400">ຄົນຂັບທີ່ອອກຖ້ຽວ</p>
              <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {n(current.trips.active_drivers)} ຄົນ
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
              <p className="text-slate-400">ຖ້ຽວ/ຄັນ/ວັນ</p>
              <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {vehicles.car_days > 0 ? n1(current.trips.trips / vehicles.car_days) : "—"}
              </p>
            </div>
          </div>
        </Section>

        {/* ⑥ ການໃຊ້ພື້ນທີ່ບັນທຸກ */}
        <Section
          index={6}
          title="ການໃຊ້ພື້ນທີ່ບັນທຸກ"
          subtitle="ປະລິມາດສິນຄ້າ ທຽບຄວາມຈຸຕູ້ (ມ³)"
          icon={<FaTruckLoading />}
        >
          <div className="flex justify-center">
            <Gauge
              value={load?.avg_pct ?? null}
              caption={
                load
                  ? `ສະເລ່ຍຈາກ ${n(load.scored)} ຖ້ຽວ ທີ່ຄິດໄດ້ (ຈາກ ${n(load.total)} ຖ້ຽວ)`
                  : "ບໍ່ມີຖ້ຽວທີ່ຄິດໄດ້ໃນເດືອນນີ້"
              }
              color={C.warn}
            />
          </div>
          {load && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ຄ່າກາງ</p>
                  <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{pct(load.median_pct)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ພື້ນທີ່ວ່າງລວມ</p>
                  <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {n1(load.free_m3)} ມ³
                  </p>
                </div>
              </div>
              <p className="mt-2.5 mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                ຈຳນວນຖ້ຽວ ແຍກຕາມຊັ້ນການບັນທຸກ
              </p>
              <ul className="space-y-1.5">
                {load.bands.map((b) => (
                  <BarRow
                    key={b.label}
                    label={b.label}
                    value={b.trips}
                    max={Math.max(1, ...load.bands.map((x) => x.trips))}
                    display={n(b.trips)}
                    color={C.warn}
                  />
                ))}
              </ul>
            </>
          )}
          <Note>
            ວັດໄດ້ສະເພາະ <strong>ປະລິມາດ (ມ³)</strong> — ນ້ຳໜັກສິນຄ້າຕໍ່ບິນ ບໍ່ໄດ້ຖືກບັນທຶກ
            ຈຶ່ງຄິດ % ການບັນທຸກຕາມນ້ຳໜັກບໍ່ໄດ້.
          </Note>
        </Section>

        {/* ⑦ ຕົ້ນທຶນຂົນສົ່ງ */}
        <Section index={7} title="ຕົ້ນທຶນຂົນສົ່ງ" subtitle="ຄ່ານ້ຳມັນທີ່ບັນທຶກໃນລະບົບ" icon={<FaMoneyBillWave />}>
          {current.fuel.amount > 0 ? (
            <Donut slices={fuelSlices} centerValue={n(current.fuel.amount / 1_000_000)} centerLabel="ລ້ານກີບ" />
          ) : (
            <p className="py-6 text-center text-[11px] text-slate-400">ບໍ່ມີການບັນທຶກຄ່ານ້ຳມັນໃນເດືອນນີ້</p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            {[
              { label: "ຕໍ່ຖ້ຽວ", value: kip(current.cost_per_trip) },
              { label: "ຕໍ່ ກມ", value: kip(current.cost_per_km) },
              { label: "ຕໍ່ຈຸດສົ່ງ", value: kip(current.cost_per_drop) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/70">
                <p className="text-slate-400">{s.label}</p>
                <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.value}</p>
                <p className="text-[9.5px] text-slate-400">ກີບ</p>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] dark:bg-slate-800/70">
            <p className="text-slate-400">
              ນ້ຳມັນ {n1(current.fuel.liters)} ລິດ · ເຕີມ {n(current.fuel.refills)} ຄັ້ງ
            </p>
          </div>
          <Note>
            ບໍ່ໄດ້ລວມຄ່າແຮງຄົນຂັບ, ຄ່າຜ່ານທາງ, ຄ່າສ້ອມແປງ ແລະ ຄ່າຈ້າງລົດນອກ —
            ລະບົບຍັງບໍ່ມີບ່ອນເກັບຄ່າໃຊ້ຈ່າຍເຫຼົ່ານັ້ນ.
          </Note>
          {current.fuel.excluded_amount > 0 && (
            <Note>
              ອີກ <strong>{kip(current.fuel.excluded_amount)} ກີບ</strong> ({n(current.fuel.excluded_refills)} ໃບບິນ)
              ເປັນນ້ຳມັນຂອງພາຫະນະທີ່ບໍ່ຢູ່ໃນກອງລົດຂົນສົ່ງ — ບໍ່ໄດ້ນັບເຂົ້າຕົວເລກຂ້າງເທິງ.
              ຖ້າແມ່ນລົດຂົນສົ່ງແທ້ ໃຫ້ໄປຕັ້ງສາຂາໃຫ້ມັນຢູ່ໜ້າຈັດການລົດ ແລ້ວມັນຈະຖືກນັບເອງ.
            </Note>
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ⑧ ປະສິດທິພາບນ້ຳມັນ */}
        <Section index={8} title="ປະສິດທິພາບການໃຊ້ນ້ຳມັນ" subtitle="ລົດຂົນສົ່ງລາຍຄັນ — ໄລຍະທາງ GPS ÷ ລິດທີ່ຕື່ມ" icon={<FaGasPump />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">ລົດ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຖ້ຽວ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ກມ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ລິດ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ກມ/ລິດ</th>
                  <th className="py-1.5 text-right font-semibold">ກີບ/ກມ</th>
                </tr>
              </thead>
              <tbody>
                {data.fuelByCar.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-400">
                      ບໍ່ມີຂໍ້ມູນ
                    </td>
                  </tr>
                )}
                {data.fuelByCar.map((car) => (
                  <tr key={car.car_code} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">
                      {car.car_name}
                      {car.dup_imei && (
                        <span
                          className="ml-1 text-[9px] text-amber-600 dark:text-amber-400"
                          title="ລົດຄັນນີ້ແບ່ງເຄື່ອງຕິດຕາມກັບລົດຄັນອື່ນ — ໄລຍະທາງຈຶ່ງບໍ່ແມ່ນຂອງຄັນນີ້ຄັນດຽວ"
                        >
                          ⚠ ແບ່ງ GPS
                        </span>
                      )}
                      {car.suspect_rows > 0 && (
                        <span
                          className="ml-1 text-[9px] text-amber-600 dark:text-amber-400"
                          title={`${car.suspect_rows} ແຖວ ທີ່ຊ່ອງລິດຖືກປ້ອນເປັນຈຳນວນເງິນ — ຕັດອອກຈາກການຄິດ ກມ/ລິດ ແລ້ວ`}
                        >
                          ⚠ ຂໍ້ມູນລິດ
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n(car.trips)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n(car.distance_km)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n1(car.liters)}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                      {car.km_per_liter == null ? "—" : n1(car.km_per_liter)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {car.cost_per_km == null ? "—" : n(car.cost_per_km)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            ຕົວເລກ ກມ/ລິດ ຍັງບໍ່ໄດ້ຮັບການຢືນຢັນ — ໄລຍະທາງມາຈາກ GPS ແຕ່ລິດມາຈາກໃບບິນ
            ຈຶ່ງອາດຄາດເຄື່ອນຖ້າຕື່ມນ້ຳມັນຂ້າມເດືອນ ຫຼື ຕື່ມໃສ່ລົດຄັນອື່ນ.
          </Note>
        </Section>

        {/* ⑨ ຄວາມຜິດປົກກະຕິ */}
        <Section index={9} title="ຄວາມຊັກຊ້າ ແລະ ຄວາມຜິດປົກກະຕິ" subtitle={`ຈາກ ${n(exceptions.legs)} ຄັ້ງການສົ່ງໃນເດືອນ`} icon={<FaExclamationTriangle />}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[190px] flex-1">
              <ul className="space-y-2">
                {exceptions.items.map((item) => (
                  <BarRow
                    key={item.key}
                    label={item.label}
                    value={item.count}
                    max={maxException}
                    display={`${n(item.count)} · ${item.pct.toFixed(1)}%`}
                    color={item.key === "cancelled" ? C.bad : C.warn}
                  />
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-800/70">
              <p className="text-2xl font-extrabold tabular-nums" style={{ color: C.bad }}>
                {n(exceptions.total)}
              </p>
              <p className="text-[10px] text-slate-400">ຄັ້ງທີ່ຜິດປົກກະຕິ</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {pct(exceptions.total_pct)}
              </p>
              <p className="text-[9.5px] text-slate-400">ຂອງການສົ່ງທັງໝົດ</p>
            </div>
          </div>
          <p className="mt-3 mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
            ສາເຫດທີ່ສົ່ງບໍ່ສຳເລັດ
          </p>
          <ul className="space-y-1.5">
            {exceptions.reasons.length === 0 && (
              <li className="text-[11px] text-slate-400">ບໍ່ມີການສົ່ງທີ່ບໍ່ສຳເລັດໃນເດືອນນີ້</li>
            )}
            {exceptions.reasons.map((r) => (
              <BarRow
                key={r.reason_code}
                label={r.label}
                value={r.legs}
                max={maxReason}
                display={n(r.legs)}
                color={r.reason_code === "unspecified" ? C.muted : C.bad}
              />
            ))}
          </ul>
        </Section>
      </div>

      {/* ⑩ ແນວໂນ້ມ ແລະ ເປົ້າໝາຍ */}
      <Section index={10} title="ແນວໂນ້ມ ແລະ ເປົ້າໝາຍ" subtitle={`ອັດຕາສົ່ງທັນເວລາ ລາຍເດືອນ ປີ ${data.month.slice(0, 4)}`} icon={<FaChartLine />}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <TrendLine points={trendPoints} target={targets.on_time_rate} />
            <p className="mt-1 text-[10px] text-slate-400">
              {targets.on_time_rate != null
                ? `ເສັ້ນຂີດ = ເປົ້າໝາຍ ${targets.on_time_rate}% (ຕັ້ງຢູ່ໜ້າຕັ້ງຄ່າ KPI)`
                : "ຍັງບໍ່ໄດ້ຕັ້ງເປົ້າໝາຍ KPI — ຕັ້ງໄດ້ຢູ່ໜ້າຕັ້ງຄ່າ"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">ຕົວຊີ້ວັດ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ເປົ້າໝາຍ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ເດືອນນີ້</th>
                  <th className="py-1.5 text-right font-semibold">ທຽບເດືອນກ່ອນ</th>
                </tr>
              </thead>
              <tbody>
                {kpiRows.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{row.label}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">
                      {row.target == null ? "—" : `${row.target}${row.unit === "%" ? "%" : ""}`}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-right font-semibold tabular-nums"
                      style={
                        row.target != null
                          ? { color: row.value >= row.target ? C.good : C.bad }
                          : undefined
                      }
                    >
                      {row.format(row.value)}
                    </td>
                    <td className="py-1.5 text-right">
                      {row.prev > 0 ? (
                        <Delta current={row.value} previous={row.prev} higherIsBetter={row.higherIsBetter} />
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  );
}

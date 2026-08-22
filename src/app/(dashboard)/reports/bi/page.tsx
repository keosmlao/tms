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
  FaFileExcel,
  FaSpinner,
  FaSyncAlt,
  FaTruck,
  FaTruckLoading,
  FaWarehouse,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { exportSheets } from "@/lib/excel-export";
import {
  FIXED_YEAR_END,
  FIXED_YEAR_START,
  getFixedTodayDate,
} from "@/lib/fixed-year";
import { addDays } from "@/lib/lao-date";
import { deliveryPerfRates } from "@/lib/delivery-performance";
import { fuelPaymentTypeLabel } from "@/lib/fuel-payment-type";
import { tripCostTypeLabel } from "@/lib/trip-cost-type";
import type { BiDashboard } from "@/actions/bi-dashboard";
import type { DeliveryPerfReport } from "@/lib/delivery-performance";

/**
 * ຍອດບິນຂອງຊ່ວງ — ເອົາສະເພາະແຖວລວມຂອງ getReportDailyActivity (ບັນຊີດຽວກັບ
 * ໜ້າ "ລາຍງານກິດຈະກຳປະຈຳວັນ") ຈຶ່ງບໍ່ຄິດສູດໃໝ່ຢູ່ນີ້.
 *
 * ⚠️ ຢ່າສະຫຼັບໄປໃຊ້ຍອດຂອງພາກ ② (getBiDeliveryStatus): ອັນນັ້ນນັບບິນທີ່ຈັດຖ້ຽວ
 * ແລ້ວແຕ່ຍັງບໍ່ຮອດລູກຄ້າ ເປັນ "ຍັງຄ້າງ" ນຳ ຈຶ່ງໃຫ້ ຍົກໄປ 83 ທຽບກັບ ຄົງເຫຼືອ 38
 * (ວັດເມື່ອ 21/08/2026) ແລະ ບໍ່ຕົງກັບໜ້າ /bills-pending.
 */
type BillLedgerTotal = {
  carry_bills: number;
  opened_bills: number;
  delivered_bills: number;
  closed_other_bills: number;
  remaining_bills: number;
  dispatched_bills: number;
};

type BillLedgerBranch = BillLedgerTotal & { branch_code: string; branch_name: string };

type BillLedger = { total: BillLedgerTotal; branches: BillLedgerBranch[] };

const EMPTY_BILL_LEDGER_TOTAL: BillLedgerTotal = {
  carry_bills: 0,
  opened_bills: 0,
  delivered_bills: 0,
  closed_other_bills: 0,
  remaining_bills: 0,
  dispatched_bills: 0,
};

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

/** "2026-08-19" → "19 ສິງຫາ 2026" */
function dateText(date: string) {
  const [year, month, day] = (date ?? "").split("-");
  const index = Number(month) - 1;
  return index >= 0 && index < 12 ? `${Number(day)} ${MONTH_NAMES[index]} ${year}` : date || "—";
}

/**
 * ດຶງລາຍງານທັງໜ້າອອກເປັນ Excel — 1 ແຖບຕໍ່ 1 ຕາຕະລາງ.
 *
 * ຜູ້ບໍລິຫານຕ້ອງເອົາຕົວເລກໄປປະຊຸມ ຈຶ່ງຕ້ອງອອກໄດ້ທັງຊຸດ ບໍ່ແມ່ນ copy ເທື່ອລະຊ່ອງ.
 * ຄ່າທີ່ອອກເປັນຕົວເລກດິບ (ບໍ່ຈັດຮູບແບບ) ເພື່ອໃຫ້ Excel ຄິດຕໍ່ໄດ້.
 */
function exportDashboard(data: BiDashboard, ledger: BillLedger | null) {
  const round1 = (v: number) => Math.round((Number(v) || 0) * 10) / 10;
  const c = data.current;
  // ແຕ່ລະແຖບມີຮູບແຖວຕ່າງກັນ ຈຶ່ງຕ້ອງບອກ generic ເອງ ບໍ່ດັ່ງນັ້ນ TS ຈະຖືເອົາ
  // ຮູບແຖວຂອງແຖບທຳອິດເປັນຂອງທຸກແຖບ
  const billRow = !ledger
    ? null
    : data.branchCode
      ? (ledger.branches.find((b) => b.branch_code === data.branchCode) ?? null)
      : ledger.total;
  const tag = `${data.branchCode ? `_${data.branchCode}` : ""}${data.carCode ? `_${data.carCode}` : ""}`;
  exportSheets<Record<string, unknown>>(`bi_${data.from}_to_${data.to}${tag}`, [
    {
      name: "ສະຫຼຸບ",
      rows: [
        { k: "ຊ່ວງ", v: `${data.from} → ${data.to}` },
        { k: "ສາຂາທີ່ກັ່ນຕອງ", v: data.branchCode || "ທຸກສາຂາ" },
        { k: "ລົດທີ່ກັ່ນຕອງ", v: data.carCode || "ທຸກຄັນ" },
        { k: "ຖ້ຽວທັງໝົດ", v: c.trips.trips },
        { k: "ຈຸດສົ່ງສຳເລັດ", v: c.delivery.drops },
        { k: "ບິນ", v: c.delivery.bills },
        { k: "ສົ່ງທັນເວລາ (%)", v: round1(c.delivery.on_time_pct) },
        { k: "ຈຸດສົ່ງຊ້າ", v: c.delivery.late },
        { k: "ບິນທີ່ຖືກເລື່ອນນັດ", v: c.delivery.rescheduled_bills },
        { k: "ໄລຍະທາງ (ກມ)", v: Math.round(c.km) },
        { k: "ຄ່ານ້ຳມັນ (ກີບ)", v: Math.round(c.fuel.amount) },
        { k: "ຄ່ານ້ຳມັນ/ຖ້ຽວ (ກີບ)", v: Math.round(c.cost_per_trip) },
        { k: "ຄ່ານ້ຳມັນ/ກມ (ກີບ)", v: Math.round(c.cost_per_km) },
        { k: "ຖ້ຽວໜຶ່ງ (ຊມ, ກາງ)", v: round1(data.timing.median_trip_hours) },
        { k: "ຢູ່ໜ້າຮ້ານ (ນາທີ, ກາງ)", v: Math.round(data.timing.median_stop_minutes) },
        { k: "COD ຕ້ອງເກັບ (ກີບ)", v: Math.round(data.cod.expected) },
        { k: "COD ບັນທຶກວ່າເກັບ (ກີບ)", v: Math.round(data.cod.collected) },
        // ຍອດບິນມາຈາກຄຳຖາມຄົນລະອັນ ແລະ ບໍ່ມີເມື່ອກັ່ນຕອງລົດຄັນດຽວ
        ...(billRow
          ? [
              { k: "ບິນຍົກມາ", v: billRow.carry_bills },
              { k: "ບິນທີ່ເປີດ", v: billRow.opened_bills },
              { k: "ບິນທີ່ຈັດສົ່ງ", v: billRow.delivered_bills },
              { k: "ບິນປິດດ້ວຍທາງອື່ນ", v: billRow.closed_other_bills },
              { k: "ຄົງເຫຼືອ (ຍົກໄປ)", v: billRow.remaining_bills },
              { k: "ຈັດຖ້ຽວແລ້ວລໍສົ່ງ", v: billRow.dispatched_bills },
            ]
          : []),
      ],
      columns: [
        { key: "k", header: "ລາຍການ", width: 30 },
        { key: "v", header: "ຄ່າ", width: 22 },
      ],
    },
    {
      name: "ລາຍວັນ",
      rows: data.daily.map((d) => ({ ...d, km: Math.round(d.km), fuel: Math.round(d.fuel) })),
      columns: [
        { key: "day", header: "ວັນທີ", width: 13 },
        { key: "trips", header: "ຖ້ຽວ", width: 9 },
        { key: "drops", header: "ຈຸດສົ່ງ", width: 10 },
        { key: "km", header: "ກມ", width: 10 },
        { key: "fuel", header: "ຄ່ານ້ຳມັນ", width: 14 },
      ],
    },
    {
      name: "ຄົນຂັບ",
      rows: data.drivers.map((d) => ({
        ...d,
        drops_per_trip: round1(d.drops_per_trip),
        on_time_pct: d.on_time_pct == null ? "" : round1(d.on_time_pct),
      })),
      columns: [
        { key: "name", header: "ຄົນຂັບ", width: 26 },
        { key: "trips", header: "ຖ້ຽວ", width: 9 },
        { key: "drops", header: "ຈຸດສົ່ງ", width: 10 },
        { key: "drops_per_trip", header: "ຈຸດ/ຖ້ຽວ", width: 11 },
        { key: "cancelled", header: "ຍົກເລີກ", width: 10 },
        { key: "on_time_pct", header: "ທັນເວລາ (%)", width: 13 },
      ],
    },
    {
      name: "ສາຂາ",
      rows: data.branches.map((b) => ({
        ...b,
        on_time_pct: b.on_time_pct == null ? "" : round1(b.on_time_pct),
      })),
      columns: [
        { key: "branch_name", header: "ສາຂາ", width: 24 },
        { key: "trips", header: "ຖ້ຽວ", width: 9 },
        { key: "cars", header: "ລົດ", width: 8 },
        { key: "drops", header: "ຈຸດສົ່ງ", width: 10 },
        { key: "on_time_pct", header: "ທັນເວລາ (%)", width: 13 },
      ],
    },
    {
      name: "ສາຍທາງ",
      rows: data.routes.map((r) => ({
        ...r,
        route_km: round1(r.route_km),
        drops_per_trip: round1(r.drops_per_trip),
        on_time_pct: r.on_time_pct == null ? "" : round1(r.on_time_pct),
      })),
      columns: [
        { key: "route_code", header: "ລະຫັດ", width: 12 },
        { key: "route_name", header: "ຊື່ສາຍ", width: 28 },
        { key: "trips", header: "ຖ້ຽວ", width: 9 },
        { key: "drops", header: "ຈຸດສົ່ງ", width: 10 },
        { key: "drops_per_trip", header: "ຈຸດ/ຖ້ຽວ", width: 11 },
        { key: "route_km", header: "ກມ/ຖ້ຽວ", width: 11 },
        { key: "cancelled", header: "ຍົກເລີກ", width: 10 },
        { key: "on_time_pct", header: "ທັນເວລາ (%)", width: 13 },
      ],
    },
    {
      name: "ລູກຄ້າ",
      rows: data.customers,
      columns: [
        { key: "customer", header: "ລູກຄ້າ", width: 34 },
        { key: "drops", header: "ຈຸດສົ່ງ", width: 10 },
        { key: "bills", header: "ບິນ", width: 9 },
        { key: "late", header: "ຊ້າ", width: 9 },
      ],
    },
    {
      name: "ນ້ຳມັນລາຍຄັນ",
      rows: data.fuelByCar.map((f) => ({
        ...f,
        distance_km: Math.round(f.distance_km),
        liters: round1(f.liters),
        amount: Math.round(f.amount),
        km_per_liter: f.km_per_liter == null ? "" : round1(f.km_per_liter),
        cost_per_km: f.cost_per_km == null ? "" : Math.round(f.cost_per_km),
      })),
      columns: [
        { key: "car_name", header: "ລົດ", width: 16 },
        { key: "trips", header: "ຖ້ຽວ", width: 9 },
        { key: "distance_km", header: "ກມ", width: 10 },
        { key: "liters", header: "ລິດ", width: 10 },
        { key: "amount", header: "ຄ່ານ້ຳມັນ", width: 14 },
        { key: "km_per_liter", header: "ກມ/ລິດ", width: 11 },
        { key: "cost_per_km", header: "ກີບ/ກມ", width: 11 },
      ],
    },
    {
      name: "ຄວາມໄວ",
      rows: data.fleetActivity.map((f) => ({
        ...f,
        km: Math.round(f.km),
        moving_hours: round1(f.moving_hours),
        max_speed: Math.round(f.max_speed),
        avg_daily_max_speed: Math.round(f.avg_daily_max_speed),
        km_per_hour: f.km_per_hour == null ? "" : Math.round(f.km_per_hour),
      })),
      columns: [
        { key: "car_name", header: "ລົດ", width: 16 },
        { key: "active_days", header: "ວັນທີ່ແລ່ນ", width: 12 },
        { key: "km", header: "ກມ", width: 10 },
        { key: "moving_hours", header: "ຊມ ຂັບ", width: 11 },
        { key: "max_speed", header: "ໄວສູງສຸດ", width: 12 },
        { key: "avg_daily_max_speed", header: "ສະເລ່ຍໄວສູງສຸດ/ວັນ", width: 20 },
        { key: "km_per_hour", header: "ກມ/ຊມ", width: 11 },
      ],
    },
  ]);
}

/** "2026-08-19" → "19/08 ພຸດ" — ສັ້ນພໍໃສ່ຕາຕະລາງລາຍວັນ */
function dayText(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  // ນັບມື້ຂອງອາທິດດ້ວຍ Date.UTC ລ້ວນໆ — ບໍ່ແຕະ TZ ຂອງ browser
  const dow = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return `${String(date).padStart(2, "0")}/${String(month).padStart(2, "0")} ${DOW_NAMES[(dow + 6) % 7]}`;
}

/** ປ້າຍຊ່ວງ — ວັນດຽວກັນບໍ່ຕ້ອງຂຽນ 2 ເທື່ອ */
function rangeText(from: string, to: string) {
  return from === to ? dateText(from) : `${dateText(from)} – ${dateText(to)}`;
}

/** ວັນທຳອິດຂອງເດືອນທີ່ວັນນັ້ນຢູ່ — ຄ່າເລີ່ມຕົ້ນຂອງຊ່ອງ "ຈາກວັນທີ" */
function startOfMonthDate(date: string) {
  return `${date.slice(0, 7)}-01`;
}

/** ບີບວັນທີໃຫ້ຢູ່ໃນປີທີ່ລະບົບຕັ້ງໄວ້ — preset ຢູ່ຂອບປີຈຶ່ງບໍ່ຫຼຸດອອກນອກ */
function clampToFixedYear(date: string) {
  if (date < FIXED_YEAR_START) return FIXED_YEAR_START;
  if (date > FIXED_YEAR_END) return FIXED_YEAR_END;
  return date;
}

/** ປຸ່ມຊ່ວງທີ່ໃຊ້ເລື້ອຍ — ຄິດຈາກ "ມື້ນີ້" ຂອງລາວ ບໍ່ແມ່ນໂມງ browser */
const RANGE_PRESETS: Array<{
  label: string;
  range: (today: string) => { from: string; to: string };
}> = [
  { label: "ມື້ນີ້", range: (t) => ({ from: t, to: t }) },
  { label: "7 ວັນ", range: (t) => ({ from: clampToFixedYear(addDays(t, -6)), to: t }) },
  { label: "ເດືອນນີ້", range: (t) => ({ from: startOfMonthDate(t), to: t }) },
  {
    label: "ເດືອນກ່ອນ",
    range: (t) => {
      const end = clampToFixedYear(addDays(startOfMonthDate(t), -1));
      return { from: clampToFixedYear(startOfMonthDate(end)), to: end };
    },
  },
];

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

/**
 * ກ່ອງ "ຂໍ້ມູນທີ່ຍັງບໍ່ຄົບ" — ບອກວ່າຕົວເລກຂ້າງເທິງຂາດຫຍັງໄປ ກ່ອນຜູ້ອ່ານຈະເຊື່ອມັນ.
 * ບໍ່ມີຊ່ອງຫວ່າງ = ບໍ່ສະແດງກ່ອງນີ້ເລີຍ ຈຶ່ງບໍ່ລົບກວນເມື່ອຂໍ້ມູນຄົບ.
 */
function DataQualityBox({ dq }: { dq: BiDashboard["dataQuality"] }) {
  const lines: React.ReactNode[] = [];
  for (const c of dq.trips_without_gps) {
    lines.push(
      <li key={`nogps-${c.car_name}`}>
        <strong>{c.car_name}</strong> ອອກ {n(c.trips)} ຖ້ຽວ ແຕ່ GPS ບໍ່ບັນທຶກໄລຍະທາງເລີຍ
        {c.has_imei ? " (ຜູກ imei ໄວ້ແລ້ວ ແຕ່ເຄື່ອງບໍ່ສົ່ງຂໍ້ມູນ)" : " (ຍັງບໍ່ໄດ້ຜູກ imei)"} —
        ໄລຍະທາງກອງລົດ ແລະ ກມ/ຖ້ຽວ ຈຶ່ງຕ່ຳກວ່າຄວາມຈິງ
      </li>
    );
  }
  for (const c of dq.gps_without_trips) {
    lines.push(
      <li key={`notrip-${c.car_name}`}>
        <strong>{c.car_name}</strong> ແລ່ນ {n(c.km)} ກມ ແຕ່ບໍ່ມີໃບຈັດຖ້ຽວເລີຍໃນຊ່ວງນີ້
      </li>
    );
  }
  if (dq.cars_without_branch.length > 0) {
    const amount = dq.cars_without_branch.reduce((sum, c) => sum + c.amount, 0);
    lines.push(
      <li key="nobranch">
        ພາຫະນະ {n(dq.cars_without_branch.length)} ຄັນ ຕື່ມນ້ຳມັນ {kip(amount)} ກີບ ແຕ່ບໍ່ໄດ້ຜູກສາຂາ
        ຈຶ່ງ<strong>ບໍ່ຢູ່ໃນຍອດຄ່ານ້ຳມັນຂ້າງເທິງ</strong> — {dq.cars_without_branch.map((c) => c.car_name).join(", ")}.
        ຖ້າແມ່ນລົດຂົນສົ່ງ ໃຫ້ຜູກສາຂາຢູ່ໜ້າ “ຂໍ້ມູນລົດ”; ຖ້າບໍ່ແມ່ນ (Forklift, ລົດພະນັກງານ,
        ລົດຂອງໜ່ວຍງານອື່ນ) ປະໄວ້ແບບນີ້ຖືກຕ້ອງແລ້ວ — ລາຍການນີ້ພຽງບອກໃຫ້ຮູ້ວ່າເງິນສ່ວນນີ້ຢູ່ນອກລາຍງານ.
      </li>
    );
  }
  if (dq.unapproved_jobs > 0) {
    lines.push(
      <li key="unapproved">
        ໃບຈັດຖ້ຽວ {n(dq.unapproved_jobs)} ໃບ ຍັງລໍອະນຸມັດ — ບໍ່ຖືກນັບຢູ່ບ່ອນໃດໃນລາຍງານນີ້
      </li>
    );
  }
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-500/10">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
        <FaExclamationTriangle size={11} /> ຂໍ້ມູນທີ່ຍັງບໍ່ຄົບ ({lines.length} ຂໍ້)
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-[10.5px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
        {lines}
      </ul>
    </div>
  );
}

/** ປ່ຽນແປງທຽບຊ່ວງກ່ອນໜ້າ (ຍາວເທົ່າກັນ). higherIsBetter ຕັດສິນວ່າ ຂຶ້ນ = ດີ ຫຼື ຂຶ້ນ = ຮ້າຍ. */
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
    return <span className="text-[10px] text-slate-400">ບໍ່ມີຊ່ວງກ່ອນໃຫ້ທຽບ</span>;
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
      {flat ? "▬" : change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%{suffix} ທຽບຊ່ວງກ່ອນ
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

/** ຄຳອະທິບາຍນ້ອຍລຸ່ມຊ່ອງ KPI ບ່ອນທີ່ບໍ່ມີຊ່ວງກ່ອນໜ້າໃຫ້ທຽບ */
function TileHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-slate-400">{children}</p>;
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
  // ຄ່າເລີ່ມຕົ້ນ: ວັນທີ 1 ຂອງເດືອນນີ້ → ມື້ນີ້
  const today = getFixedTodayDate();
  const [from, setFrom] = useState(() => startOfMonthDate(getFixedTodayDate()));
  const [to, setTo] = useState(() => getFixedTodayDate());
  const [carCode, setCarCode] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [data, setData] = useState<BiDashboard | null>(null);
  const [status, setStatus] = useState<DeliveryPerfReport | null>(null);
  const [ledger, setLedger] = useState<BillLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ພາກ ② ຖາມແຍກ ເພາະ query ຂອງມັນໃຊ້ເວລາ ~12 ວິນາທີ. Server action ແລ່ນ
  // ເທື່ອລະອັນຢູ່ແລ້ວ ຈຶ່ງຍິງອັນໄວກ່ອນ — ໜ້າຈໍຂຶ້ນພາຍໃນ 1 ວິນາທີ ແລ້ວພາກ ②
  // ຈຶ່ງຕື່ມເຂົ້າມາທີ່ຫຼັງ ແທນທີ່ຈະຄ້າງຂາວທັງໜ້າ.
  const load = useCallback(async (dateFrom: string, dateTo: string, car: string, branch: string) => {
    setLoading(true);
    setStatusLoading(!car);
    setError(null);
    setStatus(null);
    setLedger(null);
    try {
      setData((await Actions.getBiDashboard(dateFrom, dateTo, car, branch)) as BiDashboard);
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
    // ຍອດບິນ (~4 ວິນາທີ) ຍິງກ່ອນພາກ ② ທີ່ຊ້າກວ່າ — server action ແລ່ນເທື່ອລະ
    // ອັນ ຈຶ່ງໄດ້ຕົວເລກຂຶ້ນໄວ ແທນທີ່ຈະລໍພາກ ② ຈົບກ່ອນ
    try {
      setLedger((await Actions.getReportDailyActivity(dateFrom, dateTo)) as BillLedger);
    } catch (e) {
      console.error(e);
    }
    try {
      setStatus((await Actions.getBiDeliveryStatus(dateFrom, dateTo, branch)) as DeliveryPerfReport);
    } catch (e) {
      console.error(e);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // ຊ່ອງວັນທີມັກປ່ຽນເປັນຄູ່ (ແຕ່ວັນ ແລ້ວ ຫາວັນ) ແລະ ພາກ ② ໃຊ້ເວລາຫຼາຍວິນາທີ —
  // ຖ້າຍິງທັນທີທຸກຄັ້ງຈະໄດ້ 2 ຮອບຊ້ອນກັນ ຈຶ່ງລໍໃຫ້ຢຸດປ່ຽນກ່ອນ.
  useEffect(() => {
    const timer = setTimeout(() => void load(from, to, carCode, branchCode), 350);
    return () => clearTimeout(timer);
  }, [load, from, to, carCode, branchCode]);

  const rates = useMemo(
    () => (status ? deliveryPerfRates(status.overall) : null),
    [status]
  );

  const selectedBranch = useMemo(
    () => data?.branchOptions.find((b) => b.code === data.branchCode) ?? null,
    [data]
  );

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
              ຕິດຕາມການຂົນສົ່ງຄົບທຸກມິຕິ — {rangeText(from, to)}
              {selectedBranch ? ` · ${selectedBranch.name}` : ""}
              {selectedCar ? ` · ${selectedCar.name}` : " · ທຸກຄັນ"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              // ເລືອກວັນເລີ່ມທີ່ຫຼັງວັນສິ້ນສຸດ → ດຶງວັນສິ້ນສຸດຕາມໄປ ບໍ່ໃຫ້ຊ່ວງກັບຫົວ
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                setFrom(value);
                if (value > to) setTo(value);
              }}
              title="ແຕ່ວັນ"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="text-[11px] text-slate-400">ຫາ</span>
            <input
              type="date"
              value={to}
              min={from}
              max={FIXED_YEAR_END}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                setTo(value);
                if (value < from) setFrom(value);
              }}
              title="ຫາວັນ"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="flex items-center gap-1">
            {RANGE_PRESETS.map((preset) => {
              const range = preset.range(today);
              const active = range.from === from && range.to === to;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setFrom(range.from);
                    setTo(range.to);
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                    active
                      ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {/* ສາຂາ: ບີບທັງໜ້າ (ຖາມຄືນຝັ່ງເຊີບເວີ) — ຕ່າງກັບລົດ ຕົງທີ່ຍອດບິນ
              ແຍກຕາມສາຂາໄດ້ ຈຶ່ງບໍ່ມີພາກໃດຫາຍໄປ */}
          <select
            value={branchCode}
            onChange={(e) => {
              setBranchCode(e.target.value);
              // ລົດຄັນທີ່ເລືອກໄວ້ ອາດບໍ່ຢູ່ສາຂາໃໝ່ — ລ້າງໄວ້ ບໍ່ດັ່ງນັ້ນໄດ້ໜ້າຫວ່າງ
              setCarCode("");
            }}
            title="ກັ່ນຕອງທັງໜ້າລົງສາຂາດຽວ"
            className="max-w-[200px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">ທຸກສາຂາ</option>
            {(data?.branchOptions ?? []).map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
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
          {(carCode || branchCode) && (
            <button
              type="button"
              onClick={() => {
                setCarCode("");
                setBranchCode("");
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ລ້າງ
            </button>
          )}
          <button
            type="button"
            onClick={() => data && exportDashboard(data, ledger)}
            disabled={loading || !data}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FaFileExcel /> Excel
          </button>
          <button
            type="button"
            onClick={() => void load(from, to, carCode, branchCode)}
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
          ledger={ledger}
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
  ledger,
  rates,
  statusLoading,
  loading,
}: {
  data: BiDashboard;
  status: DeliveryPerfReport | null;
  ledger: BillLedger | null;
  rates: ReturnType<typeof deliveryPerfRates> | null;
  statusLoading: boolean;
  loading: boolean;
}) {
  const { current, previous, exceptions, vehicles, load, targets, timing, cod } = data;
  const maxDailyTrips = Math.max(1, ...data.daily.map((d) => d.trips));
  const overall = status?.overall ?? null;
  // ຊ່ວງທີ່ລາກມາຮອດມື້ນີ້ ຍັງບໍ່ຈົບວັນ — ຊ່ວງກ່ອນໜ້າຈົບແລ້ວ ຈຶ່ງທຽບກັນບໍ່ຊື່ໆ
  const isPartialPeriod = data.to >= getFixedTodayDate();
  // ພາກທີ່ນັບຢູ່ລະດັບ "ບິນ" (② ແລະ ອັນດັບໃນ ③) ບໍ່ມີມິຕິລົດ ຈຶ່ງກັ່ນຕອງບໍ່ໄດ້
  const carFiltered = Boolean(data.carCode);
  const carName = data.cars.find((c) => c.code === data.carCode)?.name ?? data.carCode;

  // ຍອດບິນຂອງຊ່ວງ — ບັນຊີດຽວກັບໜ້າ "ລາຍງານກິດຈະກຳປະຈຳວັນ". ບັນຊີສົ່ງແຖວແຍກ
  // ຕາມສາຂາມາຢູ່ແລ້ວ ຈຶ່ງກັ່ນຕອງຢູ່ນີ້ ບໍ່ຕ້ອງຖາມຖານຂໍ້ມູນຄືນ
  const bills = !ledger
    ? null
    : data.branchCode
      ? (ledger.branches.find((b) => b.branch_code === data.branchCode) ??
        EMPTY_BILL_LEDGER_TOTAL)
      : ledger.total;
  // ສາຂາທີ່ບໍ່ມີແຖວໃນບັນຊີບິນ (ເຊັ່ນ ສາຂາທີ່ມີລົດ ແຕ່ບໍ່ໄດ້ເປັນເຈົ້າຂອງບິນ)
  const billsBranchMissing = Boolean(
    ledger && data.branchCode && !ledger.branches.some((b) => b.branch_code === data.branchCode)
  );
  // ທຸກ % ອ່ານທຽບກັບ "ບິນໃນມື" (ຍົກມາ + ເປີດ) ບ່ອນດຽວ ຈຶ່ງບວກກັນໄດ້ 100%
  const billsHandled = bills ? bills.carry_bills + bills.opened_bills : 0;
  const shareOfHandled = (v: number) =>
    billsHandled > 0 ? pct((v / billsHandled) * 100) : "—";

  const statusSlices: Slice[] = overall
    ? [
        { label: "ສົ່ງເຖິງລູກຄ້າແລ້ວ", value: overall.delivered, color: C.good },
        { label: "ຍັງຄ້າງສົ່ງ (ຍົກໄປຊ່ວງໜ້າ)", value: overall.carry_out, color: C.info },
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

  // ສະເພາະພະແນກສາຍງານຂາຍ ແລະ ຕ້ອງມີບິນພໍສົມຄວນ — ບໍ່ດັ່ງນັ້ນພະແນກທີ່ເປີດບິນ
  // 1–2 ໃບ (ບັນຊີ, ສຳນັກງານ) ຈະຂຶ້ນ 100% ນຳໜ້າພະແນກຂາຍທີ່ສົ່ງຫຼາຍຮ້ອຍບິນ
  const MIN_DEPT_BILLS = 10;
  const deptBars = [...(status?.departments ?? [])]
    .filter((d) => d.is_sales && d.delivered >= MIN_DEPT_BILLS)
    .map((d) => ({
      label: d.department_name,
      value: d.delivered > 0 ? (d.from_open.le_24h / d.delivered) * 100 : 0,
      delivered: d.delivered,
    }))
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
      target: targets.cost_per_trip,
      unit: "ກີບ",
      value: current.cost_per_trip,
      prev: previous.cost_per_trip,
      higherIsBetter: false,
      format: (v: number) => kip(v),
    },
    {
      label: "ຄ່ານ້ຳມັນ/ກມ (ກີບ)",
      target: targets.cost_per_km,
      unit: "ກີບ",
      value: current.cost_per_km,
      prev: previous.cost_per_km,
      higherIsBetter: false,
      format: (v: number) => kip(v),
    },
    {
      label: "ອັດຕາໃຊ້ພື້ນທີ່ບັນທຸກ (%)",
      target: targets.load_pct,
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
      <Section
        index={1}
        title="ສະຫຼຸບ KPI"
        subtitle={`${rangeText(data.from, data.to)} · ${n(vehicles.days)} ວັນ — ທຽບກັບຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນ`}
        icon={<FaChartLine />}
      >
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
        {/* ຍອດບິນ — ນັບຢູ່ລະດັບບິນ ຈຶ່ງບໍ່ຢູ່ໃນ getBiDashboard() ແລະ ມາທີ່ຫຼັງ.
            ບັນຊີດຽວກັບ "ລາຍງານກິດຈະກຳປະຈຳວັນ" (/reports/daily) ບໍ່ແມ່ນຂອງພາກ ② */}
        <div className="mt-3">
          <p className="mb-1.5 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
            ຍອດບິນຂອງຊ່ວງ — ຍົກມາ + ເປີດ − ຈັດສົ່ງ − ປິດທາງອື່ນ = ຄົງເຫຼືອ
            <span className="ml-1 font-normal text-slate-400">
              (ບັນຊີດຽວກັບລາຍງານກິດຈະກຳປະຈຳວັນ)
            </span>
          </p>
          {bills ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <KpiTile
                  label="ບິນຍົກມາ"
                  value={n(bills.carry_bills)}
                  unit="ບິນ"
                  icon={<FaWarehouse />}
                  accent={C.muted}
                  footer={<TileHint>{shareOfHandled(bills.carry_bills)} ຂອງບິນໃນມື</TileHint>}
                />
                <KpiTile
                  label="ບິນທີ່ເປີດ"
                  value={n(bills.opened_bills)}
                  unit="ບິນ"
                  icon={<FaClipboardList />}
                  accent={C.warn}
                  footer={<TileHint>{shareOfHandled(bills.opened_bills)} ຂອງບິນໃນມື</TileHint>}
                />
                <KpiTile
                  label="ບິນທີ່ຈັດສົ່ງ"
                  value={n(bills.delivered_bills)}
                  unit="ບິນ"
                  icon={<FaBoxOpen />}
                  accent={C.good}
                  footer={<TileHint>{shareOfHandled(bills.delivered_bills)} ຂອງບິນໃນມື</TileHint>}
                />
                <KpiTile
                  label="ຄົງເຫຼືອ (ຍົກໄປ)"
                  value={n(bills.remaining_bills)}
                  unit="ບິນ"
                  icon={<FaTruckLoading />}
                  accent={C.info}
                  footer={
                    <TileHint>
                      ນອກນັ້ນ ຈັດຖ້ຽວແລ້ວລໍສົ່ງ {n(bills.dispatched_bills)} ບິນ
                    </TileHint>
                  }
                />
              </div>
              {/* ບິນທະຍອຍສົ່ງ ແລະ ບິນທີ່ອອກຈາກຍອດໂດຍບໍ່ໄດ້ສົ່ງ ເປັນ 2 ຂໍ້ທີ່ຄົນ
                  ອ່ານແລ້ວມັກຄິດວ່າຍອດຜິດ ຈຶ່ງບອກນິຍາມໄວ້ຕິດຊ່ອງເລີຍ */}
              <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <strong>ບິນທີ່ສົ່ງຫຼາຍຮອບ</strong> ນັບເປັນ “ຈັດສົ່ງ” ໃນ
                <strong> ວັນທີ່ຮອບສຸດທ້າຍສົ່ງຄົບ</strong> ເທົ່ານັ້ນ — ຮອບກ່ອນໜ້າ
                ບິນຍັງຢູ່ໃນ ຄົງເຫຼືອ ຈຶ່ງບໍ່ຖືກນັບ 2 ເທື່ອ.
                {bills.closed_other_bills > 0 && (
                  <>
                    {" · "}
                    <strong>{n(bills.closed_other_bills)} ບິນ</strong> ອອກຈາກຍອດ
                    ໂດຍບໍ່ໄດ້ສົ່ງ (ຄືນຜ່ານໃບຫຼຸດໜີ້ ຫຼື ຖືກປິດຢູ່ ERP)
                  </>
                )}
                {" · "}ບິນ 02-0004 (ລູກຄ້າຮັບເອງ) ບໍ່ຢູ່ໃນຍອດນີ້.
                {billsBranchMissing && (
                  <>
                    {" "}
                    <strong>
                      ສາຂານີ້ບໍ່ຢູ່ໃນບັນຊີບິນ (ນັບສະເພາະ 3 ສາຂາຂົນສົ່ງ) ຈຶ່ງເປັນ 0.
                    </strong>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
              {carFiltered ? (
                <>
                  ຍອດບິນນັບຢູ່ລະດັບ <strong>ບິນ</strong> ຈຶ່ງແຍກຕາມລົດບໍ່ໄດ້ — ເລືອກ “ທຸກຄັນ” ເພື່ອເບິ່ງ
                </>
              ) : statusLoading ? (
                <>
                  <FaSpinner className="mr-1 inline animate-spin" />
                  ກຳລັງຄິດຍອດບິນ…
                </>
              ) : (
                "ໂຫຼດຍອດບິນບໍ່ສຳເລັດ"
              )}
            </p>
          )}
        </div>
        {isPartialPeriod && (
          <Note>
            ຊ່ວງນີ້ <strong>ລວມມື້ນີ້ທີ່ຍັງບໍ່ຈົບວັນ</strong> — ຊ່ອງ “ທຽບຊ່ວງກ່ອນ” ຈຶ່ງທຽບວັນທີ່ຍັງເຮັດ
            ວຽກຄ້າງຢູ່ ກັບວັນທີ່ຈົບແລ້ວ ແລະ ຈະຕິດລົບເປັນທຳມະດາ. ຢາກທຽບໃຫ້ຍຸດຕິທຳ ໃຫ້ຕັ້ງວັນສິ້ນສຸດເປັນມື້ວານ.
          </Note>
        )}
        <DataQualityBox dq={data.dataQuality} />
        {data.otherCost.by_type.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
              ຕົ້ນທຶນອື່ນ ແຍກຕາມປະເພດ
            </p>
            <ul className="space-y-1.5">
              {data.otherCost.by_type.map((t) => (
                <BarRow
                  key={t.cost_type}
                  label={tripCostTypeLabel(t.cost_type)}
                  value={t.amount}
                  max={Math.max(1, ...data.otherCost.by_type.map((x) => x.amount))}
                  display={kip(t.amount)}
                  color={C.warn}
                />
              ))}
            </ul>
          </div>
        )}
        <Note>
          {data.otherCost.total > 0 ? (
            <>
              ຕົ້ນທຶນເຕັມ = ຄ່ານ້ຳມັນ {kip(current.fuel.amount)} + ຕົ້ນທຶນອື່ນ{" "}
              {kip(data.otherCost.total)} ={" "}
              <strong>{kip(data.costTotal)} ກີບ</strong> ({kip(data.costPerTripTotal)} ກີບ/ຖ້ຽວ ·{" "}
              {kip(data.costPerKmTotal)} ກີບ/ກມ). ຊ່ອງ KPI ຂ້າງເທິງຍັງສະແດງສະເພາະຄ່ານ້ຳມັນ
              ເພື່ອໃຫ້ທຽບກັບຊ່ວງເກົ່າໄດ້.
            </>
          ) : (
            <>
              ຕົ້ນທຶນທີ່ສະແດງ ນັບສະເພາະ <strong>ຄ່ານ້ຳມັນ</strong> — ຄ່າແຮງຄົນຂັບ, ຄ່າຜ່ານທາງ,
              ຄ່າສ້ອມແປງ ແລະ ຄ່າຈ້າງລົດນອກ ຍັງບໍ່ມີໃຜບັນທຶກໃນຊ່ວງນີ້. ບັນທຶກໄດ້ຢູ່ໜ້າ
              “ຕົ້ນທຶນຂົນສົ່ງ” (/costs) ແລ້ວຕົວເລກຈະມາລວມຢູ່ນີ້ເອງ.
            </>
          )}
        </Note>
      </Section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ② ສະຖານະການຈັດສົ່ງ */}
        <Section index={2} title="ສະຖານະການຈັດສົ່ງ" subtitle="ບິນທີ່ຢູ່ໃນມືໃນຊ່ວງນີ້ (ຍົກມາ + ເປີດໃໝ່)" icon={<FaBoxOpen />}>
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
                  ກຳລັງຄິດຍອດບິນທັງຊ່ວງ… (ໃຊ້ເວລາປະມານ 10 ວິນາທີ)
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
          subtitle="ສົ່ງສຳເລັດພາຍໃນວັນນັດ ຄັ້ງທຳອິດ ÷ ຈຸດສົ່ງທີ່ມີວັນນັດ"
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
          {/* ວັດຈາກນັດເດີມ ບໍ່ແມ່ນນັດທີ່ຖືກຂຽນທັບຕອນຈັດຖ້ຽວ — ບອກຖານການວັດ
              ແລະ ຈຳນວນການເລື່ອນນັດໄວ້ນຳ ເພາະສອງອັນນີ້ອ່ານຄູ່ກັນຈຶ່ງມີຄວາມໝາຍ */}
          <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            ວັດຈາກ <strong>ວັນນັດຄັ້ງທຳອິດ</strong> ທີ່ຜູ້ຈັດຕັ້ງໄວ້ (ປະຫວັດເລີ່ມ 4 ມິຖຸນາ 2026) —
            ບໍ່ແມ່ນວັນນັດປັດຈຸບັນ ເຊິ່ງຖືກຂຽນທັບຕອນຈັດຖ້ຽວ ຈຶ່ງມັກກາຍເປັນວັນດຽວກັບວັນສົ່ງ.
            {" "}ວັດຈາກນັດເດີມໄດ້ {n(current.delivery.from_first_promise)} /{" "}
            {n(current.delivery.drops)} ຈຸດສົ່ງ.
            {current.delivery.rescheduled_bills > 0 && (
              <>
                {" · "}
                <strong>{n(current.delivery.rescheduled_bills)} ບິນ</strong> ຖືກເລື່ອນນັດຢ່າງໜ້ອຍ 1 ຄັ້ງ
                {current.delivery.bills > 0 &&
                  ` (${((current.delivery.rescheduled_bills / current.delivery.bills) * 100).toFixed(1)}%)`}
              </>
            )}
          </p>
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
              ພະແນກຂາຍຜູ້ເປີດບິນ — ສົ່ງພາຍໃນ 24 ຊມ (ຢ່າງໜ້ອຍ {MIN_DEPT_BILLS} ບິນ)
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
        <Section index={4} title="ຖ້ຽວ ແລະ ສາຍທາງ" subtitle="ຖ້ຽວທີ່ອະນຸມັດແລ້ວໃນຊ່ວງນີ້" icon={<FaRoute />}>
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

      {/* ⑤ ເວລາ ແລະ ເງິນເກັບປາຍທາງ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          index={5}
          title="ເວລາທີ່ໃຊ້ໄປ"
          subtitle="ຄວາມຍາວຂອງຖ້ຽວ ແລະ ເວລາຢູ່ໜ້າຮ້ານລູກຄ້າ"
          icon={<FaClock />}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {[
              {
                label: "ຖ້ຽວໜຶ່ງ (ກາງ)",
                value: timing.median_trip_hours > 0 ? `${n1(timing.median_trip_hours)} ຊມ` : "—",
              },
              {
                label: "ຖ້ຽວໜຶ່ງ (ສະເລ່ຍ)",
                value: timing.avg_trip_hours > 0 ? `${n1(timing.avg_trip_hours)} ຊມ` : "—",
              },
              {
                label: "ຢູ່ໜ້າຮ້ານ (ກາງ)",
                value: timing.median_stop_minutes > 0 ? `${n(timing.median_stop_minutes)} ນາທີ` : "—",
              },
              {
                label: "ຢູ່ໜ້າຮ້ານ (p90)",
                value: timing.p90_stop_minutes > 0 ? `${n(timing.p90_stop_minutes)} ນາທີ` : "—",
              },
            ].map((t) => (
              <div key={t.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                <p className="text-slate-400">{t.label}</p>
                <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{t.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 mb-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
            ຊົ່ວໂມງທີ່ອອກລົດ
          </p>
          {timing.dispatch_hours.length > 0 ? (
            <ColumnChart
              data={timing.dispatch_hours.map((h) => ({ label: `${h.hour}`, value: h.trips }))}
            />
          ) : (
            <p className="py-4 text-center text-[11px] text-slate-400">ບໍ່ມີເວລາອອກລົດໃນຊ່ວງນີ້</p>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            ຖ້ຽວ = ຈາກກົດອອກລົດ ຫາ ປິດງານ ({n(timing.trips_measured)}/{n(timing.trips)} ຖ້ຽວມີເວລາຄົບ) ·
            ໜ້າຮ້ານ = ຈາກ check-in ຫາ ກົດສຳເລັດ ({n(timing.drops_measured)}/{n(timing.drops)} ຈຸດ).
            ຖ້າ p90 ສູງຜິດປົກກະຕິ ໃຫ້ກວດວ່າຄົນຂັບ check-in ແຕ່ຫົວແຖວແລ້ວຄ່ອຍທະຍອຍປິດ ຫຼືບໍ່.
          </p>
        </Section>

        <Section
          index={6}
          title="ເງິນເກັບປາຍທາງ (COD)"
          subtitle="ຍອດທີ່ຕ້ອງເກັບ ທຽບກັບຍອດທີ່ບັນທຶກວ່າເກັບແລ້ວ"
          icon={<FaMoneyBillWave />}
        >
          {cod.drops === 0 ? (
            <p className="py-8 text-center text-[11px] text-slate-400">ບໍ່ມີຈຸດສົ່ງທີ່ມີ COD ໃນຊ່ວງນີ້</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ຕ້ອງເກັບ · {n(cod.drops)} ຈຸດ</p>
                  <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {kip(cod.expected)} ກີບ
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ບັນທຶກວ່າເກັບແລ້ວ</p>
                  <p className="font-bold tabular-nums" style={{ color: C.good }}>
                    {kip(cod.collected)} ກີບ
                  </p>
                </div>
              </div>
              <ul className="mt-2 space-y-1.5">
                <BarRow
                  label="ບັນທຶກແລ້ວ"
                  value={cod.collected_pct}
                  max={100}
                  display={pct(cod.collected_pct)}
                  color={cod.collected_pct >= 90 ? C.good : C.bad}
                />
              </ul>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ຈຸດທີ່ບໍ່ມີການບັນທຶກ</p>
                  <p className="font-bold tabular-nums" style={{ color: C.bad }}>
                    {n(cod.unrecorded_drops)} ຈຸດ · {kip(cod.unrecorded_amount)} ກີບ
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/70">
                  <p className="text-slate-400">ເກັບໄດ້ໜ້ອຍກວ່າຍອດ</p>
                  <p className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {n(cod.short_drops)} ຈຸດ
                  </p>
                </div>
              </div>
              <Note>
                ຕົວເລກນີ້ອ່ານໄດ້ 2 ທາງ — ເງິນຍັງບໍ່ໄດ້ເກັບ ຫຼື ເກັບແລ້ວແຕ່ຄົນຂັບບໍ່ໄດ້ບັນທຶກໃນແອັບ.
                ຕາຕະລາງມອບເງິນ (odg_tms_cod_handover) ຍັງບໍ່ມີແຖວໃດເລີຍ ຈຶ່ງຍັງກວດຄູ່ບໍ່ໄດ້.
              </Note>
            </>
          )}
        </Section>
      </div>

      {/* ⑦ ເສັ້ນເວລາລາຍວັນ */}
      <Section
        index={7}
        title="ແຕ່ລະວັນໃນຊ່ວງນີ້"
        subtitle="ຖ້ຽວ · ຈຸດສົ່ງ · ກມ · ຄ່ານ້ຳມັນ ຕາມວັນຈິງ"
        icon={<FaChartLine />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-1.5 pr-2 font-semibold">ວັນທີ</th>
                <th className="py-1.5 pr-2 font-semibold">ຖ້ຽວ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ຖ້ຽວ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດສົ່ງ</th>
                <th className="py-1.5 pr-2 text-right font-semibold">ກມ</th>
                <th className="py-1.5 text-right font-semibold">ຄ່ານ້ຳມັນ</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.day} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                    {dayText(d.day)}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="block h-2 rounded-full" style={{
                      width: `${Math.max(2, (d.trips / maxDailyTrips) * 100)}%`,
                      background: d.trips === 0 ? C.muted : C.info,
                    }} />
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{n(d.trips)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(d.drops)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(d.km)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{kip(d.fuel)}</td>
                </tr>
              ))}
              {data.daily.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">ບໍ່ມີຂໍ້ມູນໃນຊ່ວງນີ້</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ⑧ ຄົນຂັບ ແລະ ⑨ ສາຂາ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section index={8} title="ຄົນຂັບ" subtitle="ຮຽງຕາມຈຳນວນຖ້ຽວ — ສູງສຸດ 12 ຄົນ" icon={<FaTruck />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">ຊື່</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຖ້ຽວ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດສົ່ງ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດ/ຖ້ຽວ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຍົກເລີກ</th>
                  <th className="py-1.5 text-right font-semibold">ທັນເວລາ</th>
                </tr>
              </thead>
              <tbody>
                {data.drivers.map((d) => (
                  <tr key={d.code} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{d.name}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{n(d.trips)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(d.drops)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n1(d.drops_per_trip)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(d.cancelled)}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums" style={{
                      color: d.on_time_pct == null ? undefined : d.on_time_pct >= 95 ? C.good : d.on_time_pct >= 85 ? C.warn : C.bad,
                    }}>{pct(d.on_time_pct)}</td>
                  </tr>
                ))}
                {data.drivers.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">ບໍ່ມີຄົນຂັບທີ່ອອກຖ້ຽວໃນຊ່ວງນີ້</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          index={9}
          title="ສາຂາ"
          subtitle={`${n(data.branches.length)} ສາຂາທີ່ບັນຊີນີ້ເຫັນໄດ້`}
          icon={<FaWarehouse />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">ສາຂາ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຖ້ຽວ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ລົດ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດສົ່ງ</th>
                  <th className="py-1.5 text-right font-semibold">ທັນເວລາ</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map((b) => (
                  <tr key={b.branch_code} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{b.branch_name}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{n(b.trips)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(b.cars)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(b.drops)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{pct(b.on_time_pct)}</td>
                  </tr>
                ))}
                {data.branches.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">ບໍ່ມີຂໍ້ມູນ</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Note>
            ລາຍງານນີ້ນັບສະເພາະສາຂາທີ່ບັນຊີຂອງທ່ານມີສິດເບິ່ງ — ຢາກເຫັນທຸກສາຂາ
            ຕ້ອງເອົາການຜູກສາຂາ (branch_codes) ຂອງບັນຊີອອກ ຫຼື ເພີ່ມສາຂາທີ່ຂາດເຂົ້າໄປ.
          </Note>
        </Section>
      </div>

      {/* ⑩ ລູກຄ້າ ແລະ ⑪ ຄວາມໄວ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section index={10} title="ລູກຄ້າທີ່ສົ່ງຫຼາຍທີ່ສຸດ" subtitle="10 ອັນດັບ ຕາມຈຳນວນຈຸດສົ່ງ" icon={<FaBoxOpen />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">ລູກຄ້າ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຈຸດສົ່ງ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ບິນ</th>
                  <th className="py-1.5 text-right font-semibold">ຊ້າ</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.customer} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-1.5 pr-2 max-w-[220px] truncate text-slate-700 dark:text-slate-200" title={c.customer}>{c.customer}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">{n(c.drops)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(c.bills)}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: c.late > 0 ? C.bad : undefined }}>{n(c.late)}</td>
                  </tr>
                ))}
                {data.customers.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">ບໍ່ມີຂໍ້ມູນ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section index={11} title="ຄວາມໄວ ແລະ ຊົ່ວໂມງຂັບ" subtitle="ຈາກ rollup GPS — ຮຽງຕາມຄວາມໄວສູງສຸດ" icon={<FaRoad />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">ລົດ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ໄວສູງສຸດ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ສະເລ່ຍໄວສູງສຸດ/ວັນ</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">ຊມ ຂັບ</th>
                  <th className="py-1.5 text-right font-semibold">ກມ/ຊມ</th>
                </tr>
              </thead>
              <tbody>
                {data.fleetActivity.map((f) => (
                  <tr key={f.car_name} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{f.car_name}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums" style={{
                      color: f.max_speed >= 90 ? C.bad : f.max_speed >= 80 ? C.warn : undefined,
                    }}>{n(f.max_speed)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n(f.avg_daily_max_speed)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{n1(f.moving_hours)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {f.km_per_hour == null ? "—" : n(f.km_per_hour)}
                    </td>
                  </tr>
                ))}
                {data.fleetActivity.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">ບໍ່ມີຂໍ້ມູນ GPS ໃນຊ່ວງນີ້</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Note>
            ຄວາມໄວມາຈາກຄ່າສູງສຸດຂອງແຕ່ລະວັນໃນ rollup GPS — ໃຊ້ເປັນສັນຍານເຝົ້າລະວັງ
            ບໍ່ແມ່ນຫຼັກຖານລົງໂທດ ເພາະ 1 ຈຸດ ping ຜິດພາດກໍ່ດັນຄ່າສູງສຸດຂຶ້ນໄດ້.
          </Note>
        </Section>
      </div>

      {/* ④ (ຕໍ່) ຕາຕະລາງສາຍທາງ */}
      <Section index={12} title="ສາຍທາງທີ່ໃຊ້ຫຼາຍທີ່ສຸດ" subtitle="8 ອັນດັບທຳອິດຂອງຊ່ວງນີ້" icon={<FaRoute />}>
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
                    ບໍ່ມີຖ້ຽວໃນຊ່ວງນີ້
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
          index={13}
          title={carFiltered ? `ການໃຊ້ລົດ · ${carName}` : "ການໃຊ້ລົດຂົນສົ່ງ"}
          subtitle={carFiltered ? "ສະເພາະຄັນທີ່ເລືອກ" : "ນັບສະເພາະລົດທີ່ສັງກັດສາຂາຂົນສົ່ງ"}
          icon={<FaTruck />}
        >
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            {(carFiltered
              ? [
                  { label: "ຖ້ຽວ", value: current.trips.trips, unit: "ຖ້ຽວ", color: "text-slate-800 dark:text-slate-100" },
                  { label: "ວັນທີ່ອອກຖ້ຽວ", value: vehicles.car_days, unit: "ວັນ", color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "ວັນທີ່ຈອດ", value: Math.max(0, vehicles.days - vehicles.car_days), unit: "ວັນ", color: "text-slate-400" },
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
                  ? `${carName} ອອກຖ້ຽວ ${n(vehicles.car_days)} ວັນ ຈາກ ${vehicles.days} ວັນ`
                  : `${n(vehicles.car_days)} ວັນ-ຄັນ ທີ່ມີຖ້ຽວ ÷ (${n(vehicles.total_cars)} ຄັນ × ${vehicles.days} ວັນ)`
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
          index={14}
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
                  : "ບໍ່ມີຖ້ຽວທີ່ຄິດໄດ້ໃນຊ່ວງນີ້"
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
        <Section index={15} title="ຕົ້ນທຶນຂົນສົ່ງ" subtitle="ຄ່ານ້ຳມັນທີ່ບັນທຶກໃນລະບົບ" icon={<FaMoneyBillWave />}>
          {current.fuel.amount > 0 ? (
            <Donut slices={fuelSlices} centerValue={n(current.fuel.amount / 1_000_000)} centerLabel="ລ້ານກີບ" />
          ) : (
            <p className="py-6 text-center text-[11px] text-slate-400">ບໍ່ມີການບັນທຶກຄ່ານ້ຳມັນໃນຊ່ວງນີ້</p>
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
        <Section index={16} title="ປະສິດທິພາບການໃຊ້ນ້ຳມັນ" subtitle="ລົດຂົນສົ່ງລາຍຄັນ — ໄລຍະທາງ GPS ÷ ລິດທີ່ຕື່ມ" icon={<FaGasPump />}>
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
            ຈຶ່ງອາດຄາດເຄື່ອນຖ້າຕື່ມນ້ຳມັນຂ້າມຊ່ວງ ຫຼື ຕື່ມໃສ່ລົດຄັນອື່ນ.
          </Note>
        </Section>

        {/* ⑨ ຄວາມຜິດປົກກະຕິ */}
        <Section index={17} title="ຄວາມຊັກຊ້າ ແລະ ຄວາມຜິດປົກກະຕິ" subtitle={`ຈາກ ${n(exceptions.legs)} ຄັ້ງການສົ່ງໃນຊ່ວງນີ້`} icon={<FaExclamationTriangle />}>
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
              <li className="text-[11px] text-slate-400">ບໍ່ມີການສົ່ງທີ່ບໍ່ສຳເລັດໃນຊ່ວງນີ້</li>
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
      <Section index={18} title="ແນວໂນ້ມ ແລະ ເປົ້າໝາຍ" subtitle={`ອັດຕາສົ່ງທັນເວລາ ລາຍເດືອນ ປີ ${data.from.slice(0, 4)}`} icon={<FaChartLine />}>
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
                  <th className="py-1.5 pr-2 text-right font-semibold">ຊ່ວງນີ້</th>
                  <th className="py-1.5 text-right font-semibold">ທຽບຊ່ວງກ່ອນ</th>
                </tr>
              </thead>
              <tbody>
                {kpiRows.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{row.label}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">
                      {row.target == null
                        ? "—"
                        : row.unit === "%"
                          ? `${row.target}%`
                          : kip(row.target)}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-right font-semibold tabular-nums"
                      style={
                        row.target != null
                          ? {
                              color:
                                (row.higherIsBetter
                                  ? row.value >= row.target
                                  : row.value <= row.target)
                                  ? C.good
                                  : C.bad,
                            }
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

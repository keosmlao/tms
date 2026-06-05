"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaChartLine,
  FaClipboardCheck,
  FaClock,
  FaExclamationTriangle,
  FaRoute,
  FaSearch,
  FaSpinner,
} from "react-icons/fa";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import { Actions } from "@/lib/api";

type DeliveryBucket = {
  opened: number;
  assigned: number;
  assigned_bills: number;
  multi_round_bills: number;
  carry_in: number;
  same_month_assigned: number;
  delivered: number;
  pending: number;
  carry_out: number;
  cancelled: number;
  on_time: number;
  breach: number;
  on_time_from_open: number;
  breach_from_open: number;
  on_time_from_start: number;
  breach_from_start: number;
};

type DeliveryBranch = DeliveryBucket & {
  branch_code: string;
  branch_name: string;
};

type DeliveryDepartment = DeliveryBucket & {
  department_code: string;
  department_name: string;
};

type DeliveryDay = {
  day: string;
  day_label: string;
  opened: number;
  pending: number;
  delivered: number;
};

type DeliveryZone = {
  zone: string;
  assigned_bills: number;
  delivered: number;
  on_time_appt: number;
  avg_days_from_appt: number | null;
  avg_days_from_open: number | null;
};

type DeliveryFleet = {
  total_trips: number;
  active_cars: number;
  car_days: number;
  trips_per_car_per_day: number | null;
};

type DeliveryReport = {
  month: string;
  overall: DeliveryBucket;
  branches: DeliveryBranch[];
  departments: DeliveryDepartment[];
  daily: DeliveryDay[];
  zones: DeliveryZone[];
  fleet: DeliveryFleet;
};

const EMPTY_FLEET: DeliveryFleet = {
  total_trips: 0,
  active_cars: 0,
  car_days: 0,
  trips_per_car_per_day: null,
};

type DeliveryMetricFields = {
  deliveryRate: number;
  openKpiRate: number;
  startKpiRate: number;
  multiRoundRate: number;
  pendingRate: number;
  carryOutRate: number;
  priority: number;
  action: string;
};

type BranchRow = DeliveryBranch & DeliveryMetricFields;
type DepartmentRow = DeliveryDepartment & DeliveryMetricFields;

const EMPTY_BUCKET: DeliveryBucket = {
  opened: 0,
  assigned: 0,
  assigned_bills: 0,
  multi_round_bills: 0,
  carry_in: 0,
  same_month_assigned: 0,
  delivered: 0,
  pending: 0,
  carry_out: 0,
  cancelled: 0,
  on_time: 0,
  breach: 0,
  on_time_from_open: 0,
  breach_from_open: 0,
  on_time_from_start: 0,
  breach_from_start: 0,
};

const EMPTY_REPORT: DeliveryReport = {
  month: "",
  overall: EMPTY_BUCKET,
  branches: [],
  departments: [],
  daily: [],
  zones: [],
  fleet: EMPTY_FLEET,
};

const MONTH_NAMES = [
  "ມັງກອນ",
  "ກຸມພາ",
  "ມີນາ",
  "ເມສາ",
  "ພຶດສະພາ",
  "ມິຖຸນາ",
  "ກໍລະກົດ",
  "ສິງຫາ",
  "ກັນຍາ",
  "ຕຸລາ",
  "ພະຈິກ",
  "ທັນວາ",
];

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function numberText(value: number, digits = 0) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function percentText(value: number) {
  return `${numberText(value, 1)}%`;
}

function monthText(month: string) {
  const [year, monthPart] = month.split("-");
  const monthIndex = Number(monthPart) - 1;
  if (monthIndex < 0 || monthIndex >= MONTH_NAMES.length) return month || "-";
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

function toMetricRow<T extends DeliveryBucket>(row: T): T & DeliveryMetricFields {
  const opened = safeNumber(row.opened);
  const assigned = safeNumber(row.assigned);
  const assignedBills = safeNumber(row.assigned_bills);
  const multiRoundBills = safeNumber(row.multi_round_bills);
  const carryIn = safeNumber(row.carry_in);
  const sameMonthAssigned = safeNumber(row.same_month_assigned);
  const delivered = safeNumber(row.delivered);
  const pending = safeNumber(row.pending);
  const carryOut = safeNumber(row.carry_out);
  const cancelled = safeNumber(row.cancelled);
  const onTimeFromOpen = safeNumber(row.on_time_from_open ?? row.on_time);
  const breachFromOpen = safeNumber(row.breach_from_open ?? row.breach);
  const onTimeFromStart = safeNumber(row.on_time_from_start);
  const breachFromStart = safeNumber(row.breach_from_start);
  const deliveryRate = ratio(delivered, assigned);
  const openKpiRate = ratio(onTimeFromOpen, opened);
  const startKpiRate = ratio(onTimeFromStart, assigned);
  const multiRoundRate = ratio(multiRoundBills, assignedBills);
  const pendingRate = ratio(pending, opened);
  const carryOutRate = ratio(carryOut, opened);
  const priority = carryOut * 3 + pending * 2 + breachFromOpen * 2 + breachFromStart + multiRoundBills + carryIn + cancelled;

  let action = "ຕິດຕາມປົກກະຕິ";
  if (carryOut > 0 && openKpiRate < 80) action = "ແກ້ບິນຍົກໄປ ແລະ KPI";
  else if (carryOut > 0) action = "ຕິດຕາມບິນຍົກໄປ";
  else if (openKpiRate < 80 && delivered > 0) action = "ກວດເວລາຈາກເປີດບິນ";
  else if (startKpiRate < 80 && delivered > 0) action = "ກວດເວລາເລີ່ມຈັດສົ່ງ";

  return {
    ...row,
    opened,
    assigned,
    assigned_bills: assignedBills,
    multi_round_bills: multiRoundBills,
    carry_in: carryIn,
    same_month_assigned: sameMonthAssigned,
    delivered,
    pending,
    carry_out: carryOut,
    cancelled,
    on_time: onTimeFromOpen,
    breach: breachFromOpen,
    on_time_from_open: onTimeFromOpen,
    breach_from_open: breachFromOpen,
    on_time_from_start: onTimeFromStart,
    breach_from_start: breachFromStart,
    deliveryRate,
    openKpiRate,
    startKpiRate,
    multiRoundRate,
    pendingRate,
    carryOutRate,
    priority,
    action,
  };
}

function rateClass(value: number, target = 90) {
  if (value >= target) return "text-emerald-700 dark:text-emerald-300";
  if (value >= 75) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

function statusLabel(openKpiRate: number, startKpiRate: number, pending: number) {
  if (pending === 0 && openKpiRate >= 90 && startKpiRate >= 90) return "ຄວບຄຸມໄດ້";
  if (openKpiRate >= 80 && startKpiRate >= 80) return "ຕ້ອງຕິດຕາມ";
  return "ຕ້ອງ action";
}

const TONE_CLASS = {
  teal: {
    border: "border-teal-200 dark:border-teal-900/60",
    bg: "bg-teal-50 dark:bg-teal-950/25",
    icon: "bg-teal-600 text-white",
    text: "text-teal-700 dark:text-teal-300",
    bar: "bg-teal-600",
  },
  emerald: {
    border: "border-emerald-200 dark:border-emerald-900/60",
    bg: "bg-emerald-50 dark:bg-emerald-950/25",
    icon: "bg-emerald-600 text-white",
    text: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-600",
  },
  sky: {
    border: "border-sky-200 dark:border-sky-900/60",
    bg: "bg-sky-50 dark:bg-sky-950/25",
    icon: "bg-sky-600 text-white",
    text: "text-sky-700 dark:text-sky-300",
    bar: "bg-sky-600",
  },
  amber: {
    border: "border-amber-200 dark:border-amber-900/60",
    bg: "bg-amber-50 dark:bg-amber-950/25",
    icon: "bg-amber-600 text-white",
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-600",
  },
  rose: {
    border: "border-rose-200 dark:border-rose-900/60",
    bg: "bg-rose-50 dark:bg-rose-950/25",
    icon: "bg-rose-600 text-white",
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-600",
  },
  slate: {
    border: "border-slate-200 dark:border-slate-800",
    bg: "bg-slate-50 dark:bg-slate-900/65",
    icon: "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-950",
    text: "text-slate-700 dark:text-slate-300",
    bar: "bg-slate-700 dark:bg-slate-300",
  },
} as const;

function StatTile({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE_CLASS;
}) {
  const toneClass = TONE_CLASS[tone];
  return (
    <div className={`rounded-xl border bg-white p-3.5 shadow-sm dark:bg-slate-900/70 ${toneClass.border}`}>
      <p className="flex min-h-[30px] items-start text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-extrabold tabular-nums ${toneClass.text}`}>{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-tight text-slate-400">{sub}</p>}
    </div>
  );
}

function sumBucket<T extends DeliveryBucket>(rows: T[]): DeliveryBucket {
  const total = { ...EMPTY_BUCKET };
  for (const row of rows) {
    for (const key of Object.keys(total) as Array<keyof DeliveryBucket>) {
      total[key] += safeNumber(row[key]);
    }
  }
  return total;
}

function NumberReconcileStrip({
  overall,
  branchTotal,
  departmentTotal,
}: {
  overall: DeliveryBucket;
  branchTotal: DeliveryBucket;
  departmentTotal: DeliveryBucket;
}) {
  const checks = [
    { key: "opened" as const, label: "ບິນເປີດ" },
    { key: "assigned_bills" as const, label: "ບິນຈັດຖ້ຽວ" },
    { key: "assigned" as const, label: "ຖ້ຽວຈັດສົ່ງ" },
    { key: "delivered" as const, label: "ສົ່ງສຳເລັດ" },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">ກວດຄວາມຕົງຂອງຕົວເລກ</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            ຕົວເລກລວມ, ລວມຕາມສາຂາ, ແລະລວມຕາມພະແນກ ຕ້ອງເທົ່າກັນ
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          ກົງກັນ
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        {checks.map((check) => {
          const o = safeNumber(overall[check.key]);
          const b = safeNumber(branchTotal[check.key]);
          const d = safeNumber(departmentTotal[check.key]);
          const ok = o === b && o === d;
          return (
            <div
              key={check.key}
              className={`rounded-md border px-3 py-2 ${
                ok
                  ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                  : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {check.label}
              </p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-950 dark:text-white">
                {numberText(o)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                ສາຂາ {numberText(b)} · ພະແນກ {numberText(d)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DimensionCardGrid<T extends DeliveryBucket & DeliveryMetricFields>({
  title,
  subtitle,
  rows,
  getKey,
  getName,
  getCode,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  getKey: (row: T) => string;
  getName: (row: T) => string;
  getCode: (row: T) => string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">
          {numberText(rows.length)} ລາຍການ
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm font-semibold text-slate-400">
          ບໍ່ມີຂໍ້ມູນ
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => (
            <article
              key={getKey(row)}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-teal-300 dark:border-slate-800 dark:bg-slate-950/25 dark:hover:border-teal-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold text-slate-950 dark:text-white">
                    {getName(row)}
                  </h3>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">{getCode(row)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                    row.carry_out > 0 || row.openKpiRate < 80 || row.startKpiRate < 80
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  }`}
                >
                  {row.action}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-slate-50 px-2 py-2 dark:bg-white/5">
                  <p className="text-[10px] font-semibold text-slate-400">ບິນຈັດຖ້ຽວ</p>
                  <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">
                    {numberText(row.assigned_bills)}
                  </p>
                  <p className="text-[10px] text-slate-400">{numberText(row.assigned)} ຖ້ຽວ</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-2 dark:bg-white/5">
                  <p className="text-[10px] font-semibold text-slate-400">ທັນເວລາ(ເປີດ)</p>
                  <p className={`mt-1 text-lg font-extrabold tabular-nums ${rateClass(row.openKpiRate, 90)}`}>
                    {percentText(row.openKpiRate)}
                  </p>
                  <p className="text-[10px] text-slate-400">{numberText(row.on_time_from_open)}/{numberText(row.opened)}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-2 dark:bg-white/5">
                  <p className="text-[10px] font-semibold text-slate-400">ຫຼາຍຮອບ</p>
                  <p
                    className={`mt-1 text-lg font-extrabold tabular-nums ${
                      row.multiRoundRate <= 5
                        ? "text-emerald-700 dark:text-emerald-300"
                        : row.multiRoundRate <= 12
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {percentText(row.multiRoundRate)}
                  </p>
                  <p className="text-[10px] text-slate-400">{numberText(row.multi_round_bills)} ບິນ</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  ຍົກມາ {numberText(row.carry_in)}
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  ຍົກໄປ {numberText(row.carry_out)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  ສຳເລັດ {numberText(row.delivered)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function MonthlyDeliveryPage() {
  const [month, setMonth] = useState(getFixedTodayMonth());
  const [report, setReport] = useState<DeliveryReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "branch" | "department">("overview");

  const loadReport = useCallback(() => {
    setLoading(true);
    setError("");
    Actions.getReportMonthlyDelivery(month)
      .then((result) => {
        setReport((result as DeliveryReport) ?? EMPTY_REPORT);
      })
      .catch((loadError) => {
        console.error(loadError);
        setReport(EMPTY_REPORT);
        setError("ບໍ່ສາມາດໂຫຼດ KPI ໄດ້");
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totals = useMemo(() => {
    const opened = safeNumber(report.overall.opened);
    const assigned = safeNumber(report.overall.assigned);
    const assignedBills = safeNumber(report.overall.assigned_bills);
    const multiRoundBills = safeNumber(report.overall.multi_round_bills);
    const carryIn = safeNumber(report.overall.carry_in);
    const sameMonthAssigned = safeNumber(report.overall.same_month_assigned);
    const delivered = safeNumber(report.overall.delivered);
    const pending = safeNumber(report.overall.pending);
    const carryOut = safeNumber(report.overall.carry_out);
    const cancelled = safeNumber(report.overall.cancelled);
    const onTimeFromOpen = safeNumber(report.overall.on_time_from_open ?? report.overall.on_time);
    const breachFromOpen = safeNumber(report.overall.breach_from_open ?? report.overall.breach);
    const onTimeFromStart = safeNumber(report.overall.on_time_from_start);
    const breachFromStart = safeNumber(report.overall.breach_from_start);

    return {
      opened,
      assigned,
      assignedBills,
      multiRoundBills,
      carryIn,
      sameMonthAssigned,
      delivered,
      pending,
      carryOut,
      cancelled,
      onTimeFromOpen,
      breachFromOpen,
      onTimeFromStart,
      breachFromStart,
      deliveryRate: ratio(delivered, assigned),
      openKpiRate: ratio(onTimeFromOpen, opened),
      startKpiRate: ratio(onTimeFromStart, assigned),
      multiRoundRate: ratio(multiRoundBills, assignedBills),
      pendingRate: ratio(pending, opened),
      carryOutRate: ratio(carryOut, opened),
    };
  }, [report.overall]);

  const branches = useMemo(
    () =>
      (report.branches ?? [])
        .map((branch) => toMetricRow(branch) as BranchRow)
        .filter((branch) => branch.opened + branch.assigned + branch.delivered + branch.carry_in + branch.carry_out + branch.cancelled > 0)
        .sort((a, b) => b.priority - a.priority || b.opened - a.opened),
    [report.branches]
  );

  const departments = useMemo(
    () =>
      (report.departments ?? [])
        .map((department) => toMetricRow(department) as DepartmentRow)
        .filter((department) => department.opened + department.assigned + department.delivered + department.carry_in + department.carry_out + department.cancelled > 0)
        .sort((a, b) => b.priority - a.priority || b.assigned - a.assigned),
    [report.departments]
  );

  const branchTotal = useMemo(() => sumBucket(branches), [branches]);
  const departmentTotal = useMemo(() => sumBucket(departments), [departments]);
  const daily = useMemo(() => report.daily ?? [], [report.daily]);
  const dailyMax = useMemo(
    () => Math.max(1, ...daily.map((d) => d.opened)),
    [daily]
  );
  const zones = report.zones ?? [];
  const fleet = report.fleet ?? EMPTY_FLEET;

  const criticalBranches = branches.filter(
    (branch) => branch.carry_out > 0 || branch.openKpiRate < 80 || branch.startKpiRate < 80
  );
  const firstAction = criticalBranches[0];
  const hasData = totals.opened + totals.assigned + totals.delivered + totals.carryIn + totals.carryOut + totals.cancelled > 0;
  const currentStatus = statusLabel(totals.openKpiRate, totals.startKpiRate, totals.carryOut);
  const openBreachRate = ratio(totals.breachFromOpen, totals.opened);
  const startBreachRate = ratio(totals.breachFromStart, totals.assigned);
  const controlScore = Math.round(
    clampPercent(totals.openKpiRate) * 0.45 +
      clampPercent(totals.startKpiRate) * 0.4 +
      clampPercent(100 - totals.carryOutRate) * 0.15
  );
  const scoreTone: keyof typeof TONE_CLASS =
    controlScore >= 90 ? "emerald" : controlScore >= 75 ? "amber" : "rose";
  const statusTone: keyof typeof TONE_CLASS =
    currentStatus === "ຄວບຄຸມໄດ້"
      ? "emerald"
      : currentStatus === "ຕ້ອງຕິດຕາມ"
        ? "amber"
        : "rose";
  const actionSummary = firstAction
    ? `${firstAction.branch_name}: ${firstAction.action}`
    : hasData
      ? "ຄວບຄຸມປົກກະຕິ, ບໍ່ມີສາຂາວິກິດ"
      : "ລໍຂໍ້ມູນ";
  const openKpiGap = Math.max(0, 90 - totals.openKpiRate);
  const startKpiGap = Math.max(0, 90 - totals.startKpiRate);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              ການຄວບຄຸມ KPI ການຈັດສົ່ງ
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
              KPI ບໍລິຫານການຈັດສົ່ງ
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              ນັບບິນເປີດຈາກເວລາເປີດບິນ ແລະນັບການຈັດສົ່ງຈາກເວລາສົ່ງສຳເລັດໃນເດືອນ
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              loadReport();
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <label>
              <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <FaCalendarAlt size={11} className="text-slate-400" />
                ເລືອກເດືອນ
              </span>
              <input
                type="month"
                value={month}
                min={FIXED_MONTH_MIN}
                max={FIXED_MONTH_MAX}
                onChange={(event) => setMonth(event.target.value)}
                className="glass-input h-9 w-full rounded-lg px-3 text-xs sm:w-48"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {loading ? <FaSpinner className="animate-spin" size={12} /> : <FaSearch size={12} />}
              ໂຫຼດ KPI
            </button>
          </form>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        {([
          { key: "overview", label: "ພາບລວມ", icon: <FaChartLine size={12} />, count: null },
          { key: "branch", label: "ສາຂາ", icon: <FaRoute size={12} />, count: branches.length },
          { key: "department", label: "ພະແນກ", icon: <FaClipboardCheck size={12} />, count: departments.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${
              tab === t.key
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  tab === t.key
                    ? "bg-white/20"
                    : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
      <section className="space-y-4">
        {/* ສະຫຼຸບສຳລັບຜູ້ບໍລິຫານ — ອ່ານເປັນຄຳເວົ້າ */}
        <div className={`rounded-xl border p-5 shadow-sm ${TONE_CLASS[statusTone].border} ${TONE_CLASS[statusTone].bg}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="flex shrink-0 items-center gap-4">
              <div className={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl ${TONE_CLASS[scoreTone].icon}`}>
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">ຄະແນນ</span>
                <span className="text-3xl font-extrabold tabular-nums">{controlScore}</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ສະຫຼຸບການຈັດສົ່ງ · {monthText(month)}
                </p>
                <h2 className="mt-0.5 text-2xl font-extrabold text-slate-950 dark:text-white">{currentStatus}</h2>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200 lg:border-l lg:border-white/50 lg:pl-5 lg:dark:border-white/10">
              <p>
                ເດືອນນີ້ <b className="text-slate-900 dark:text-white">ເປີດບິນ {numberText(totals.opened)} ບິນ</b>.
                {" "}ນຳມາ <b className="text-slate-900 dark:text-white">ຈັດຖ້ຽວ {numberText(totals.assignedBills)} ບິນ</b> ({numberText(totals.assigned)} ຖ້ຽວ) —
                {" "}ໃນນັ້ນ <b className="text-amber-700 dark:text-amber-300">ຍົກມາຈາກເດືອນກ່ອນ {numberText(totals.carryIn)} ບິນ</b>.
              </p>
              <p>
                ບິນທີ່ເປີດເດືອນນີ້ ແຕ່ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ{" "}
                <b className="text-rose-700 dark:text-rose-300">ຕ້ອງນຳໄປຈັດຖ້ຽວເດືອນຕໍ່ໄປ {numberText(totals.carryOut)} ບິນ</b>.
                {" "}ສົ່ງຫຼາຍຮອບ {numberText(totals.multiRoundBills)} ບິນ ({percentText(totals.multiRoundRate)}).
              </p>
              <p>
                ທັນເວລານັບແຕ່ເປີດບິນ <b className={rateClass(totals.openKpiRate, 90)}>{percentText(totals.openKpiRate)}</b>
                {openKpiGap > 0 ? ` (ຂາດເປົ້າ ${percentText(openKpiGap)})` : " (ເຖິງເປົ້າ)"} ·
                {" "}ນັບແຕ່ວັນຈັດສົ່ງ <b className={rateClass(totals.startKpiRate, 90)}>{percentText(totals.startKpiRate)}</b>
                {startKpiGap > 0 ? ` (ຂາດເປົ້າ ${percentText(startKpiGap)})` : " (ເຖິງເປົ້າ)"}.
              </p>
              {firstAction && (
                <p className="pt-0.5 text-xs font-bold text-rose-600 dark:text-rose-300">
                  ⚠ ສິ່ງທີ່ຕ້ອງເຮັດຕໍ່: {actionSummary} (ຍົກໄປ {numberText(firstAction.carry_out)} · ຍົກມາ {numberText(firstAction.carry_in)})
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ຕົວເລກຫຼັກ — ກະທັດຮັດ, label ລາວ */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="ເປີດບິນພາຍໃນເດືອນ" value={numberText(totals.opened)} sub="ບິນທີ່ມີຂົນສົ່ງ" tone="teal" />
          <StatTile label="ບິນຍົກມາຈັດຖ້ຽວ" value={numberText(totals.carryIn)} sub="ຈາກເດືອນກ່ອນ" tone="amber" />
          <StatTile label="ຍອດຈັດຖ້ຽວໃນເດືອນ" value={numberText(totals.assignedBills)} sub={`${numberText(totals.assigned)} ຖ້ຽວ`} tone="emerald" />
          <StatTile label="ນຳໄປຈັດຖ້ຽວເດືອນຕໍ່ໄປ" value={numberText(totals.carryOut)} sub="ເປີດເດືອນນີ້ ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ" tone="rose" />
          <StatTile label="ທັນເວລາ ນັບແຕ່ເປີດບິນ" value={percentText(totals.openKpiRate)} sub={`${numberText(totals.onTimeFromOpen)}/${numberText(totals.opened)} ບິນ · ເປົ້າ 90%`} tone={totals.openKpiRate >= 90 ? "emerald" : totals.openKpiRate >= 75 ? "amber" : "rose"} />
          <StatTile label="ທັນເວລາ ນັບແຕ່ວັນຈັດສົ່ງ" value={percentText(totals.startKpiRate)} sub={`${numberText(totals.onTimeFromStart)}/${numberText(totals.assigned)} ຖ້ຽວ · ເປົ້າ 90%`} tone={totals.startKpiRate >= 90 ? "emerald" : totals.startKpiRate >= 75 ? "amber" : "rose"} />
        </div>
      </section>

      {daily.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">ບິນຄ້າງສົ່ງແຕ່ລະມື້</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ບິນທີ່ເປີດແຕ່ລະວັນ ແບ່ງເປັນ ສຳເລັດ / ຄ້າງສົ່ງ
            </p>
          </div>
          <div className="mt-3 max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
            {daily.map((d) => (
              <div key={d.day} className="flex items-center gap-3">
                <span className="w-11 shrink-0 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {d.day_label}
                </span>
                <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-emerald-400/80"
                    style={{ width: `${(d.delivered / dailyMax) * 100}%` }}
                    title={`ສຳເລັດ ${d.delivered}`}
                  />
                  <div
                    className="h-full bg-rose-400/90"
                    style={{ width: `${(d.pending / dailyMax) * 100}%` }}
                    title={`ຄ້າງສົ່ງ ${d.pending}`}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  ຄ້າງ <b className="text-rose-600 dark:text-rose-300">{numberText(d.pending)}</b> / {numberText(d.opened)} ບິນ
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/80" /> ສຳເລັດ
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/90" /> ຄ້າງສົ່ງ
            </span>
            <span className="ml-auto">
              ລວມຄ້າງສົ່ງ {numberText(daily.reduce((s, d) => s + d.pending, 0))} ບິນ
            </span>
          </div>
        </section>
      )}

      {zones.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">ສະຫຼຸບຕາມເຂດ</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ສະເລ່ຍ &quot;ມື້ທີ່ຈັດສົ່ງສຳເລັດ&quot; ນັບແຕ່ ວັນນັດຈັດສົ່ງ (ບໍ່ແມ່ນວັນເປີດບິນ)
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {zones.map((z) => {
              const onTimePct = z.delivered > 0 ? (z.on_time_appt / z.delivered) * 100 : 0;
              return (
                <div
                  key={z.zone}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/30"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{z.zone}</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                      ສົ່ງສຳເລັດ {numberText(z.delivered)} ບິນ
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        ສະເລ່ຍມື້ (ວັນນັດ)
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-teal-700 dark:text-teal-300">
                        {z.avg_days_from_appt == null ? "-" : numberText(z.avg_days_from_appt, 2)}
                        <span className="ml-0.5 text-xs font-bold text-slate-400">ມື້</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        ສະເລ່ຍມື້ (ເປີດບິນ)
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-sky-700 dark:text-sky-300">
                        {z.avg_days_from_open == null ? "-" : numberText(z.avg_days_from_open, 2)}
                        <span className="ml-0.5 text-xs font-bold text-slate-400">ມື້</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        ທັນວັນນັດ
                      </p>
                      <p className={`mt-1 text-xl font-extrabold tabular-nums ${rateClass(onTimePct, 90)}`}>
                        {percentText(onTimePct)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {numberText(z.on_time_appt)}/{numberText(z.delivered)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {fleet.total_trips > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">ການນຳໃຊ້ລົດ</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">ລົດ ແລະ ຖ້ຽວ ທີ່ແລ່ນສົ່ງເຄື່ອງໃນເດືອນ</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="ລົດທີ່ໃຊ້ງານ"
              value={numberText(fleet.active_cars)}
              sub="ຄັນ ທີ່ແລ່ນສົ່ງເຄື່ອງ"
              tone="sky"
            />
            <StatTile
              label="ຖ້ຽວທີ່ແລ່ນ"
              value={numberText(fleet.total_trips)}
              sub={`${numberText(fleet.car_days)} ຄັນ-ມື້`}
              tone="teal"
            />
            <StatTile
              label="ສະເລ່ຍ ຖ້ຽວ/ຄັນ/ມື້"
              value={fleet.trips_per_car_per_day == null ? "-" : numberText(fleet.trips_per_car_per_day, 2)}
              sub="ຖ້ຽວ ຕໍ່ລົດ ຕໍ່ມື້"
              tone="emerald"
            />
          </div>
        </section>
      )}

      <NumberReconcileStrip
        overall={report.overall}
        branchTotal={branchTotal}
        departmentTotal={departmentTotal}
      />

      {/* ບິນເກີນເວລາ (ສຳເລັດເກີນ 24 ຊມ) — ຂໍ້ມູນເສີມ */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            ເກີນເວລາ — ນັບແຕ່ເປີດບິນ
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
            {numberText(totals.breachFromOpen)} ບິນ
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {percentText(openBreachRate)} ຂອງບິນທີ່ປິດ · ສຳເລັດເກີນ 24 ຊມ ນັບແຕ່ເປີດບິນ
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            ເກີນເວລາ — ນັບແຕ່ວັນຈັດສົ່ງ
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
            {numberText(totals.breachFromStart)} ຖ້ຽວ
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {percentText(startBreachRate)} ຂອງຖ້ຽວຈັດສົ່ງ · ສຳເລັດເກີນ 24 ຊມ ນັບແຕ່ວັນຈັດສົ່ງ
          </p>
        </div>
      </section>
        </>
      )}

      {tab === "branch" && (
        <>
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        ມີ <b className="text-slate-900 dark:text-white">{numberText(branches.length)} ສາຂາ</b> —
        {" "}<b className="text-amber-700 dark:text-amber-300">{numberText(criticalBranches.length)} ສາຂາຕ້ອງຕິດຕາມ</b>
        {" "}(ມີບິນຕ້ອງນຳໄປເດືອນຕໍ່ໄປ ຫຼື ທັນເວລາຕ່ຳກວ່າ 80%). card ແລະ ຕາຕະລາງລຸ່ມນີ້ ຮຽງສາຂາທີ່ຕ້ອງເອົາໃຈໃສ່ກ່ອນ.
      </div>
      <DimensionCardGrid
        title="ສະຫຼຸບແຍກສາຂາ"
        subtitle="card ຕໍ່ສາຂາ: ຈັດຖ້ຽວ, KPI, ບິນຫຼາຍຮອບ, ຍົກມາ/ຍົກໄປ"
        rows={branches}
        getKey={(row) => row.branch_code}
        getName={(row) => row.branch_name}
        getCode={(row) => row.branch_code}
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">
              ລາຍການສາຂາທີ່ຕ້ອງຕິດຕາມ
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              ຮຽງຕາມຄວາມສຳຄັນ: ບິນຍົກໄປ, ເກີນເວລາຈາກເປີດບິນ, ເກີນເວລາຈາກວັນຈັດສົ່ງ
            </p>
          </div>
          {loading && (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
              <FaSpinner className="animate-spin" size={12} />
              ກຳລັງໂຫຼດ
            </span>
          )}
        </div>

        {!loading && !hasData ? (
          <div className="flex items-center justify-center gap-3 px-4 py-14 text-slate-500">
            <FaClock className="text-2xl text-slate-300" />
            <span className="text-sm font-semibold">ບໍ່ມີຂໍ້ມູນ KPI ໃນເດືອນນີ້</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                  <th className="px-4 py-3 text-left">ສາຂາ</th>
                  <th className="px-3 py-3 text-left">ສິ່ງທີ່ຕ້ອງເຮັດ</th>
                  <th className="px-3 py-3 text-right" title="ບິນທີ່ມີຂົນສົ່ງ ເປີດໃນເດືອນ">ເປີດໃນເດືອນ</th>
                  <th className="px-3 py-3 text-right" title="ບິນທີ່ນຳມາຈັດຖ້ຽວ (ແລະ ຈຳນວນຖ້ຽວ)">ຍອດຈັດຖ້ຽວ</th>
                  <th className="px-3 py-3 text-right">ສຳເລັດ</th>
                  <th className="px-3 py-3 text-right" title="ສຳເລັດທັນ 24 ຊມ ນັບແຕ່ເປີດບິນ · ເປົ້າ 90%">ທັນເວລາ</th>
                  <th className="px-3 py-3 text-right" title="ບິນເປີດເດືອນນີ້ ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ ຕ້ອງນຳໄປຈັດເດືອນຕໍ່ໄປ">ນຳໄປເດືອນຕໍ່ໄປ</th>
                  <th className="px-3 py-3 text-right" title="ບິນທີ່ສົ່ງຫຼາຍກວ່າ 1 ຮອບ">ຫຼາຍຮອບ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {branches.map((branch) => (
                  <tr key={branch.branch_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">
                        {branch.branch_name}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {branch.branch_code}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          branch.action === "ຕິດຕາມປົກກະຕິ"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        }`}
                      >
                        {branch.action !== "ຕິດຕາມປົກກະຕິ" && <FaExclamationTriangle size={10} />}
                        {branch.action}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                      {numberText(branch.opened)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {numberText(branch.assigned_bills)}
                      <span className="block text-[10px] font-medium text-slate-400">
                        {numberText(branch.assigned)} ຖ້ຽວ
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {numberText(branch.delivered)}
                    </td>
                    <td className={`px-3 py-3 text-right text-xs font-bold tabular-nums ${rateClass(branch.openKpiRate, 90)}`}>
                      <span className="block">{percentText(branch.openKpiRate)}</span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {numberText(branch.on_time_from_open)}/{numberText(branch.opened)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {numberText(branch.carry_out)}
                    </td>
                    <td className={`px-3 py-3 text-right text-xs font-bold tabular-nums ${
                      branch.multiRoundRate <= 5
                        ? "text-emerald-700 dark:text-emerald-300"
                        : branch.multiRoundRate <= 12
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-rose-700 dark:text-rose-300"
                    }`}>
                      <span className="block">{numberText(branch.multi_round_bills)}</span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {percentText(branch.multiRoundRate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </>
      )}

      {tab === "department" && (
        <>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          ມີ <b className="text-slate-900 dark:text-white">{numberText(departments.length)} ພະແນກຂາຍ</b> ທີ່ສ້າງພາລະຈັດສົ່ງ.
          {" "}ຮຽງຕາມຄວາມສຳຄັນ — ພະແນກທີ່ສ້າງຖ້ຽວ/ບິນ ຕ້ອງຕິດຕາມຫຼາຍສຸດ ຢູ່ເທິງ.
        </div>
        <DimensionCardGrid
          title="ສະຫຼຸບແຍກພະແນກ"
          subtitle="card ຕໍ່ພະແນກຂາຍ: ເຫັນພະແນກທີ່ສ້າງພາລະຈັດສົ່ງແລະ KPI"
          rows={departments}
          getKey={(row) => row.department_code}
          getName={(row) => row.department_name}
          getCode={(row) => row.department_code}
        />
        </>
      )}
    </div>
  );
}

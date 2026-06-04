"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaClipboardCheck,
  FaClock,
  FaExclamationTriangle,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTruckLoading,
} from "react-icons/fa";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import { Actions } from "@/lib/api";

type DeliveryBucket = {
  delivered: number;
  pending: number;
  cancelled: number;
  on_time: number;
  breach: number;
};

type DeliveryBranch = DeliveryBucket & {
  branch_code: string;
  branch_name: string;
};

type DeliveryReport = {
  month: string;
  overall: DeliveryBucket;
  branches: DeliveryBranch[];
};

type BranchRow = DeliveryBranch & {
  opened: number;
  doneRate: number;
  kpiRate: number;
  pendingRate: number;
  priority: number;
  action: string;
};

const EMPTY_BUCKET: DeliveryBucket = {
  delivered: 0,
  pending: 0,
  cancelled: 0,
  on_time: 0,
  breach: 0,
};

const EMPTY_REPORT: DeliveryReport = {
  month: "",
  overall: EMPTY_BUCKET,
  branches: [],
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

function toBranchRow(branch: DeliveryBranch): BranchRow {
  const delivered = safeNumber(branch.delivered);
  const pending = safeNumber(branch.pending);
  const cancelled = safeNumber(branch.cancelled);
  const onTime = safeNumber(branch.on_time);
  const breach = safeNumber(branch.breach);
  const opened = delivered + pending;
  const doneRate = ratio(delivered, opened);
  const kpiRate = ratio(onTime, delivered);
  const pendingRate = ratio(pending, opened);
  const priority = pending * 3 + breach * 2 + cancelled;

  let action = "ຕິດຕາມປົກກະຕິ";
  if (pending > 0 && kpiRate < 80) action = "ແກ້ backlog ແລະ KPI";
  else if (pending > 0) action = "ປິດບິນຄ້າງ";
  else if (kpiRate < 80 && delivered > 0) action = "ກວດເວລາສົ່ງ";

  return {
    ...branch,
    delivered,
    pending,
    cancelled,
    on_time: onTime,
    breach,
    opened,
    doneRate,
    kpiRate,
    pendingRate,
    priority,
    action,
  };
}

function rateClass(value: number, target = 90) {
  if (value >= target) return "text-emerald-700 dark:text-emerald-300";
  if (value >= 75) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

function statusLabel(kpiRate: number, pending: number) {
  if (pending === 0 && kpiRate >= 90) return "ຄວບຄຸມໄດ້";
  if (kpiRate >= 80) return "ຕ້ອງຕິດຕາມ";
  return "ຕ້ອງ action";
}

function ScoreBlock({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="border-l border-slate-200 px-4 py-3 first:border-l-0 dark:border-slate-800">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="text-slate-500 dark:text-slate-300">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  );
}

export default function MonthlyDeliveryPage() {
  const [month, setMonth] = useState(getFixedTodayMonth());
  const [report, setReport] = useState<DeliveryReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    const delivered = safeNumber(report.overall.delivered);
    const pending = safeNumber(report.overall.pending);
    const cancelled = safeNumber(report.overall.cancelled);
    const onTime = safeNumber(report.overall.on_time);
    const breach = safeNumber(report.overall.breach);
    const opened = delivered + pending;

    return {
      opened,
      delivered,
      pending,
      cancelled,
      onTime,
      breach,
      doneRate: ratio(delivered, opened),
      kpiRate: ratio(onTime, delivered),
      pendingRate: ratio(pending, opened),
    };
  }, [report.overall]);

  const branches = useMemo(
    () =>
      (report.branches ?? [])
        .map(toBranchRow)
        .filter((branch) => branch.opened + branch.cancelled > 0)
        .sort((a, b) => b.priority - a.priority || b.opened - a.opened),
    [report.branches]
  );

  const criticalBranches = branches.filter(
    (branch) => branch.pending > 0 || branch.kpiRate < 80
  );
  const firstAction = criticalBranches[0];
  const hasData = totals.opened + totals.cancelled > 0;
  const currentStatus = statusLabel(totals.kpiRate, totals.pending);

  return (
    <div className="space-y-4">
      <section className="border-b border-slate-200 bg-white pb-4 dark:border-slate-800 dark:bg-transparent">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Delivery KPI Control
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
              KPI ບໍລິຫານການຈັດສົ່ງ
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              ໃຊ້ເບິ່ງວ່າເດືອນນີ້ຄວບຄຸມການຈັດສົ່ງໄດ້ບໍ່ ແລະຕ້ອງ action ສາຂາໃດກ່ອນ
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Management decision
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">
                {currentStatus}
              </h2>
            </div>
            <span
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                currentStatus === "ຄວບຄຸມໄດ້"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : currentStatus === "ຕ້ອງຕິດຕາມ"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              }`}
            >
              {monthText(month)}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            <p>
              ສຳເລັດ {percentText(totals.doneRate)} ຈາກ {numberText(totals.opened)} ບິນເປີດ,
              ຄ້າງ {numberText(totals.pending)} ບິນ.
            </p>
            <p>
              KPI ທັນເວລາ {percentText(totals.kpiRate)} ຈາກບິນທີ່ສົ່ງສຳເລັດ.
            </p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-800 dark:bg-white/5 dark:text-slate-100">
              Action:{" "}
              {firstAction
                ? `${firstAction.branch_name} - ${firstAction.action} (${numberText(firstAction.pending)} ບິນຄ້າງ)`
                : hasData
                  ? "ບໍ່ມີສາຂາວິກິດ"
                  : "ລໍຂໍ້ມູນ"}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 dark:divide-slate-800">
            <ScoreBlock
              label="ບິນເປີດ"
              value={numberText(totals.opened)}
              detail={`${numberText(totals.cancelled)} ບິນຍົກເລີກ`}
              icon={<FaClipboardCheck size={13} />}
            />
            <ScoreBlock
              label="ສົ່ງສຳເລັດ"
              value={percentText(totals.doneRate)}
              detail={`${numberText(totals.delivered)} ບິນສຳເລັດ`}
              icon={<FaCheckCircle size={13} />}
            />
            <ScoreBlock
              label="ທັນ KPI"
              value={percentText(totals.kpiRate)}
              detail={`${numberText(totals.onTime)} ບິນທັນເວລາ`}
              icon={<FaRoute size={13} />}
            />
            <ScoreBlock
              label="ຄ້າງສົ່ງ"
              value={numberText(totals.pending)}
              detail={`${percentText(totals.pendingRate)} ຂອງບິນເປີດ`}
              icon={<FaTruckLoading size={13} />}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">
              Branch action list
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              ຮຽງຕາມຄວາມສຳຄັນ: ບິນຄ້າງ, ເກີນ KPI, ຍົກເລີກ
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
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                  <th className="px-4 py-3 text-left">ສາຂາ</th>
                  <th className="px-3 py-3 text-left">Action</th>
                  <th className="px-3 py-3 text-right">ບິນເປີດ</th>
                  <th className="px-3 py-3 text-right">ສຳເລັດ</th>
                  <th className="px-3 py-3 text-right">KPI</th>
                  <th className="px-3 py-3 text-right">ຄ້າງ</th>
                  <th className="px-3 py-3 text-right">ເກີນ</th>
                  <th className="px-3 py-3 text-right">ຍົກເລີກ</th>
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
                    <td className={`px-3 py-3 text-right text-xs font-bold tabular-nums ${rateClass(branch.doneRate, 90)}`}>
                      {percentText(branch.doneRate)}
                    </td>
                    <td className={`px-3 py-3 text-right text-xs font-bold tabular-nums ${rateClass(branch.kpiRate, 90)}`}>
                      {percentText(branch.kpiRate)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {numberText(branch.pending)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      {numberText(branch.breach)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-slate-500">
                      {numberText(branch.cancelled)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

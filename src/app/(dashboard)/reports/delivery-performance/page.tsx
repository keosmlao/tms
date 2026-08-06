"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendarAlt,
  FaCalendarCheck,
  FaClock,
  FaExclamationTriangle,
  FaFileExcel,
  FaLayerGroup,
  FaSearch,
  FaSpinner,
  FaTimesCircle,
  FaUndoAlt,
} from "react-icons/fa";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { exportToExcel } from "@/lib/excel-export";
import {
  EMPTY_PERF_REPORT,
  deliveryPerfRates,
  formatLeadHours,
  perfBalanceIsSound,
  type DeliveryPerfBranch,
  type DeliveryPerfBucket,
  type DeliveryPerfReport,
} from "@/lib/delivery-performance";

const MONTH_NAMES = [
  "ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ",
  "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ",
];

function monthText(month: string) {
  const [year, monthPart] = (month ?? "").split("-");
  const index = Number(monthPart) - 1;
  if (index < 0 || index >= MONTH_NAMES.length) return month || "-";
  return `${MONTH_NAMES[index]} ${year}`;
}

function numberText(value: number) {
  return (Number(value) || 0).toLocaleString("en-US");
}

function percentText(value: number) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

const TONE = {
  teal: { text: "text-teal-700 dark:text-teal-300", bar: "bg-teal-500", border: "border-teal-200 dark:border-teal-900/60" },
  emerald: { text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-900/60" },
  sky: { text: "text-sky-700 dark:text-sky-300", bar: "bg-sky-500", border: "border-sky-200 dark:border-sky-900/60" },
  amber: { text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", border: "border-amber-200 dark:border-amber-900/60" },
  rose: { text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500", border: "border-rose-200 dark:border-rose-900/60" },
  slate: { text: "text-slate-700 dark:text-slate-300", bar: "bg-slate-400", border: "border-slate-200 dark:border-slate-800" },
} as const;

type Tone = keyof typeof TONE;

function StatTile({
  label,
  value,
  sub,
  tone = "slate",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border bg-white p-3.5 shadow-sm dark:bg-slate-900/70 ${TONE[tone].border}`}>
      <p className="flex min-h-[30px] items-start gap-1.5 text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-extrabold tabular-nums ${TONE[tone].text}`}>{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-tight text-slate-400">{sub}</p>}
    </div>
  );
}

type Slice = { label: string; count: number; rate: number; tone: Tone };

/** ແຖບສັດສ່ວນ + ລາຍການຊັ້ນ — ໃຊ້ຊ້ຳສຳລັບ 2 ວິທີວັດເວລານຳສົ່ງ */
function LeadTimePanel({
  title,
  subtitle,
  total,
  slices,
  footnote,
}: {
  title: string;
  subtitle: string;
  total: number;
  slices: Slice[];
  footnote: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">
          ສົ່ງສຳເລັດ {numberText(total)} ບິນ
        </span>
      </div>

      <div className="p-4">
        {total === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-400">ບໍ່ມີບິນທີ່ສົ່ງສຳເລັດໃນເດືອນນີ້</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
              {slices.map((slice) => (
                <div
                  key={slice.label}
                  className={TONE[slice.tone].bar}
                  style={{ width: `${slice.rate}%` }}
                  title={`${slice.label} · ${percentText(slice.rate)}`}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {slices.map((slice) => (
                <div
                  key={slice.label}
                  className={`rounded-lg border px-3 py-2.5 ${TONE[slice.tone].border}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[slice.tone].bar}`} />
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{slice.label}</p>
                  </div>
                  <p className={`mt-1 text-2xl font-extrabold tabular-nums ${TONE[slice.tone].text}`}>
                    {percentText(slice.rate)}
                  </p>
                  <p className="text-[10px] text-slate-400">{numberText(slice.count)} ບິນ</p>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{footnote}</p>
      </div>
    </section>
  );
}

function openSlices(bucket: DeliveryPerfBucket): Slice[] {
  const rates = deliveryPerfRates(bucket);
  return [
    { label: "ບໍ່ເກີນ 24 ຊົ່ວໂມງ", count: bucket.from_open.le_24h, rate: rates.openOnTimeRate, tone: "emerald" },
    { label: "24–48 ຊົ່ວໂມງ", count: bucket.from_open.h24_48, rate: rates.open24to48Rate, tone: "amber" },
    { label: "ເກີນ 48 ຊົ່ວໂມງ", count: bucket.from_open.gt_48h, rate: rates.openOver48Rate, tone: "rose" },
  ];
}

function scheduleSlices(bucket: DeliveryPerfBucket): Slice[] {
  const rates = deliveryPerfRates(bucket);
  return [
    { label: "ບໍ່ເກີນ 24 ຊົ່ວໂມງ", count: bucket.from_schedule.le_24h, rate: rates.schedOnTimeRate, tone: "emerald" },
    { label: "24–48 ຊົ່ວໂມງ", count: bucket.from_schedule.h24_48, rate: rates.sched24to48Rate, tone: "amber" },
    { label: "ເກີນ 48 ຊົ່ວໂມງ", count: bucket.from_schedule.gt_48h, rate: rates.schedOver48Rate, tone: "rose" },
    { label: "ບໍ່ໄດ້ນັດວັນສົ່ງ", count: bucket.from_schedule.no_schedule, rate: rates.schedUnknownRate, tone: "slate" },
  ];
}

function BranchTable({ branches }: { branches: DeliveryPerfBranch[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">ແຍກຕາມສາຂາຂົນສົ່ງ</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          ເປີເຊັນທັນເວລາຄິດຈາກບິນທີ່ສົ່ງສຳເລັດ · ເປີເຊັນອື່ນຄິດຈາກບິນທີ່ຢູ່ໃນມືເດືອນນີ້
        </p>
      </div>
      {branches.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">ບໍ່ມີຂໍ້ມູນ</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-slate-50/60 text-slate-500 dark:bg-slate-950/20 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">ສາຂາ</th>
                <th className="px-3 py-2 text-right font-semibold">ຍົກມາ</th>
                <th className="px-3 py-2 text-right font-semibold">ເປີດໃນເດືອນ</th>
                <th className="px-3 py-2 text-right font-semibold">ສົ່ງສຳເລັດ</th>
                <th className="px-3 py-2 text-right font-semibold">ຫຼຸດອອກ</th>
                <th className="px-3 py-2 text-right font-semibold">ຍົກໄປ</th>
                <th className="px-3 py-2 text-right font-semibold">≤24h (ເປີດບິນ)</th>
                <th className="px-3 py-2 text-right font-semibold">≤24h (ວັນນັດ)</th>
                <th className="px-3 py-2 text-right font-semibold">ເລື່ອນນັດ &gt;2</th>
                <th className="px-3 py-2 text-right font-semibold">ທະຍອຍສົ່ງ</th>
                <th className="px-3 py-2 text-right font-semibold">ຍົກເລີກ</th>
                <th className="px-3 py-2 text-right font-semibold">ສະເລ່ຍ/ກາງ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
              {branches.map((branch) => {
                const rates = deliveryPerfRates(branch);
                return (
                  <tr key={branch.branch_code} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
                    <td className="px-3 py-2">
                      <p className="font-bold text-slate-900 dark:text-white">{branch.branch_name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{branch.branch_code}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300">{numberText(branch.carry_in)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{numberText(branch.opened)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{numberText(branch.delivered)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{numberText(branch.closed_other)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-300">{numberText(branch.carry_out)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">
                      {percentText(rates.openOnTimeRate)}
                      <span className="ml-1 text-[10px] font-normal text-slate-400">{numberText(branch.from_open.le_24h)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">
                      {percentText(rates.schedOnTimeRate)}
                      <span className="ml-1 text-[10px] font-normal text-slate-400">{numberText(branch.from_schedule.le_24h)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {percentText(rates.rescheduledRate)}
                      <span className="ml-1 text-[10px] text-slate-400">{numberText(branch.rescheduled_over_2)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {percentText(rates.multiLegRate)}
                      <span className="ml-1 text-[10px] text-slate-400">{numberText(branch.multi_leg_bills)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                      {percentText(rates.cancelledRate)}
                      <span className="ml-1 text-[10px] text-slate-400">{numberText(branch.cancelled_bills)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {formatLeadHours(branch.avg_lead_open_h)} / {formatLeadHours(branch.median_lead_open_h)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DeliveryPerformancePage() {
  const [month, setMonth] = useState(getFixedTodayMonth());
  const [report, setReport] = useState<DeliveryPerfReport>(EMPTY_PERF_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(() => {
    setLoading(true);
    setError("");
    Actions.getDeliveryPerformance(month)
      .then((result) => setReport((result as DeliveryPerfReport) ?? EMPTY_PERF_REPORT))
      .catch((loadError) => {
        console.error(loadError);
        setReport(EMPTY_PERF_REPORT);
        setError("ບໍ່ສາມາດໂຫຼດລາຍງານໄດ້");
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const overall = report.overall ?? EMPTY_PERF_REPORT.overall;
  const branches = report.branches ?? [];
  const rates = useMemo(() => deliveryPerfRates(overall), [overall]);
  const balanceSound = perfBalanceIsSound(overall);

  const handleExport = () => {
    const rows = [
      { ...overall, branch_code: "ALL", branch_name: "ລວມທຸກສາຂາ" } as DeliveryPerfBranch,
      ...branches,
    ].map((row) => {
      const r = deliveryPerfRates(row);
      return {
        branch_name: row.branch_name,
        carry_in: row.carry_in,
        opened: row.opened,
        delivered: row.delivered,
        closed_other: row.closed_other,
        carry_out: row.carry_out,
        handled: row.handled,
        open_le24: row.from_open.le_24h,
        open_le24_pct: Number(r.openOnTimeRate.toFixed(1)),
        open_24_48: row.from_open.h24_48,
        open_24_48_pct: Number(r.open24to48Rate.toFixed(1)),
        open_gt48: row.from_open.gt_48h,
        open_gt48_pct: Number(r.openOver48Rate.toFixed(1)),
        sched_le24: row.from_schedule.le_24h,
        sched_le24_pct: Number(r.schedOnTimeRate.toFixed(1)),
        sched_24_48: row.from_schedule.h24_48,
        sched_24_48_pct: Number(r.sched24to48Rate.toFixed(1)),
        sched_gt48: row.from_schedule.gt_48h,
        sched_gt48_pct: Number(r.schedOver48Rate.toFixed(1)),
        sched_none: row.from_schedule.no_schedule,
        rescheduled_over_2: row.rescheduled_over_2,
        rescheduled_pct: Number(r.rescheduledRate.toFixed(1)),
        multi_leg_bills: row.multi_leg_bills,
        multi_leg_pct: Number(r.multiLegRate.toFixed(1)),
        short_bills: row.short_bills,
        short_pct: Number(r.shortRate.toFixed(1)),
        cancelled_bills: row.cancelled_bills,
        cancelled_pct: Number(r.cancelledRate.toFixed(1)),
      };
    });

    exportToExcel(`delivery-performance-${month}`, rows, [
      { key: "branch_name", header: "ສາຂາ", width: 20 },
      { key: "carry_in", header: "ຍອດຍົກມາ", width: 11 },
      { key: "opened", header: "ເປີດບິນໃນເດືອນ", width: 14 },
      { key: "delivered", header: "ສົ່ງສຳເລັດ", width: 11 },
      { key: "closed_other", header: "ຫຼຸດອອກ (ຄືນ/ຕັດບິນ)", width: 19 },
      { key: "carry_out", header: "ຍອດຍົກໄປ", width: 11 },
      { key: "handled", header: "ບິນທີ່ຢູ່ໃນມື", width: 13 },
      { key: "open_le24", header: "ເປີດບິນ ≤24h", width: 13 },
      { key: "open_le24_pct", header: "ເປີດບິນ ≤24h %", width: 15 },
      { key: "open_24_48", header: "ເປີດບິນ 24-48h", width: 15 },
      { key: "open_24_48_pct", header: "ເປີດບິນ 24-48h %", width: 17 },
      { key: "open_gt48", header: "ເປີດບິນ >48h", width: 13 },
      { key: "open_gt48_pct", header: "ເປີດບິນ >48h %", width: 15 },
      { key: "sched_le24", header: "ວັນນັດ ≤24h", width: 13 },
      { key: "sched_le24_pct", header: "ວັນນັດ ≤24h %", width: 15 },
      { key: "sched_24_48", header: "ວັນນັດ 24-48h", width: 15 },
      { key: "sched_24_48_pct", header: "ວັນນັດ 24-48h %", width: 17 },
      { key: "sched_gt48", header: "ວັນນັດ >48h", width: 13 },
      { key: "sched_gt48_pct", header: "ວັນນັດ >48h %", width: 15 },
      { key: "sched_none", header: "ບໍ່ໄດ້ນັດວັນ", width: 13 },
      { key: "rescheduled_over_2", header: "ເລື່ອນນັດ >2 ຄັ້ງ", width: 16 },
      { key: "rescheduled_pct", header: "ເລື່ອນນັດ >2 ຄັ້ງ %", width: 18 },
      { key: "multi_leg_bills", header: "ບິນທະຍອຍສົ່ງ", width: 14 },
      { key: "multi_leg_pct", header: "ບິນທະຍອຍສົ່ງ %", width: 16 },
      { key: "short_bills", header: "ສົ່ງບໍ່ຄົບຈຳນວນ", width: 16 },
      { key: "short_pct", header: "ສົ່ງບໍ່ຄົບຈຳນວນ %", width: 18 },
      { key: "cancelled_bills", header: "ຍົກເລີກ", width: 11 },
      { key: "cancelled_pct", header: "ຍົກເລີກ %", width: 12 },
    ]);
  };

  const hasData = overall.handled > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              ປະສິດທິພາບການຈັດສົ່ງ
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
              ລາຍງານປະສິດທິພາບການຈັດສົ່ງ · {monthText(report.month || month)}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              ຍອດຍົກມາ · ເປີດບິນໃນເດືອນ · ຍອດຍົກໄປ ພ້ອມຊັ້ນເວລານຳສົ່ງ ແລະ ຄຸນນະພາບການສົ່ງ
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
              ໂຫຼດລາຍງານ
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || !hasData}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaFileExcel size={12} />
              Excel
            </button>
          </form>
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </p>
        )}
      </section>

      {/* ຍອດບິນປະຈຳເດືອນ */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
          <div>
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">ຍອດບິນປະຈຳເດືອນ</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              ຍອດຍົກມາ + ເປີດບິນໃນເດືອນ − ສົ່ງສຳເລັດ − ຫຼຸດອອກ = ຍອດຄົງເຫຼືອຍົກໄປ
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              balanceSound
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
            }`}
          >
            {balanceSound ? "ຍອດສົມດຸນ" : "ຍອດບໍ່ສົມດຸນ"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-6">
          <StatTile
            label="ຍອດຍົກມາ"
            value={numberText(overall.carry_in)}
            sub="ບິນຄ້າງຈາກເດືອນກ່ອນ"
            tone="amber"
            icon={<FaLayerGroup size={11} className="mt-0.5 text-amber-500" />}
          />
          <StatTile
            label="ເປີດບິນໃນເດືອນ"
            value={numberText(overall.opened)}
            sub="ນັບຈາກເວລາເປີດບິນຂາຍ"
            tone="sky"
            icon={<FaBoxOpen size={11} className="mt-0.5 text-sky-500" />}
          />
          <StatTile
            label="ສົ່ງສຳເລັດໃນເດືອນ"
            value={numberText(overall.delivered)}
            sub={`${percentText(rates.deliveredRate)} ຂອງບິນທີ່ຢູ່ໃນມື`}
            tone="emerald"
            icon={<FaCalendarCheck size={11} className="mt-0.5 text-emerald-500" />}
          />
          <StatTile
            label="ຫຼຸດອອກ (ຄືນ/ຕັດບິນ)"
            value={numberText(overall.closed_other)}
            sub={`${percentText(rates.closedOtherRate)} · ບໍ່ໄດ້ສົ່ງແຕ່ບໍ່ເຫຼືອຂອງ`}
            tone="slate"
            icon={<FaUndoAlt size={11} className="mt-0.5 text-slate-400" />}
          />
          <StatTile
            label="ຍອດຄົງເຫຼືອຍົກໄປ"
            value={numberText(overall.carry_out)}
            sub={`${percentText(rates.carryOutRate)} ຂອງບິນທີ່ຢູ່ໃນມື`}
            tone="rose"
            icon={<FaExclamationTriangle size={11} className="mt-0.5 text-rose-500" />}
          />
          <StatTile
            label="ເວລານຳສົ່ງ ສະເລ່ຍ / ຄ່າກາງ"
            value={formatLeadHours(overall.avg_lead_open_h)}
            sub={`ຄ່າກາງ ${formatLeadHours(overall.median_lead_open_h)} · ນັບແຕ່ເປີດບິນ`}
            tone="teal"
            icon={<FaClock size={11} className="mt-0.5 text-teal-500" />}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <LeadTimePanel
          title="ເວລານຳສົ່ງ ນັບແຕ່ເວລາເປີດບິນ"
          subtitle="ເປີດບິນ → ຈັດສົ່ງສຳເລັດ"
          total={overall.delivered}
          slices={openSlices(overall)}
          footnote="ເວລາເປີດບິນມາຈາກ doc_date + doc_time ຂອງບິນຂາຍ (ເວລາລາວ). ບໍ່ໃຊ້ create_date_time_now ເພາະ ERP ຂຽນເປັນ UTC ເຊິ່ງເຮັດໃຫ້ອາຍຸບິນຄາດເຄື່ອນ 7 ຊົ່ວໂມງ."
        />
        <LeadTimePanel
          title="ເວລານຳສົ່ງ ນັບແຕ່ວັນນັດຈັດສົ່ງ"
          subtitle="ວັນນັດຈັດສົ່ງ → ຈັດສົ່ງສຳເລັດ"
          total={overall.delivered}
          slices={scheduleSlices(overall)}
          footnote="ວັນນັດມາຈາກທີ່ຜູ້ຈັດຖ້ຽວນັດໄວ້ (ຖ້າບໍ່ມີຈຶ່ງໃຊ້ວັນຈັດສົ່ງຂອງຖ້ຽວທຳອິດ) ແລະ ທຽບຈາກ 00:00 ຂອງວັນນັ້ນ — ສົ່ງພາຍໃນວັນທີ່ນັດ = ບໍ່ເກີນ 24 ຊົ່ວໂມງ. ລະບົບເກັບແຕ່ວັນນັດຫຼ້າສຸດ ບິນທີ່ຖືກເລື່ອນນັດຈຶ່ງນັບເປັນທັນເວລາຕາມນັດໃໝ່ — ອ່ານຄູ່ກັບ 'ເລື່ອນນັດຫຼາຍກວ່າ 2 ຄັ້ງ' ຂ້າງລຸ່ມ."
        />
      </div>

      {/* ຄຸນນະພາບການຈັດສົ່ງ */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">ຄຸນນະພາບການຈັດສົ່ງ</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            ທຸກເປີເຊັນຄິດຈາກ {numberText(overall.handled)} ບິນທີ່ຢູ່ໃນມືເດືອນນີ້ (ຍົກມາ + ເປີດໃໝ່)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <StatTile
            label="ເລື່ອນວັນນັດຈັດສົ່ງ ຫຼາຍກວ່າ 2 ຄັ້ງ"
            value={percentText(rates.rescheduledRate)}
            sub={`${numberText(overall.rescheduled_over_2)} ບິນ`}
            tone="amber"
          />
          <StatTile
            label="ບິນທີ່ທະຍອຍສົ່ງ (ຫຼາຍກວ່າ 1 ຖ້ຽວ)"
            value={percentText(rates.multiLegRate)}
            sub={`${numberText(overall.multi_leg_bills)} ບິນ`}
            tone="sky"
          />
          <StatTile
            label="ປິດງານແລ້ວແຕ່ສົ່ງບໍ່ຄົບຈຳນວນ"
            value={percentText(rates.shortRate)}
            sub={`${numberText(overall.short_bills)} ບິນ`}
            tone="teal"
          />
          <StatTile
            label="ສົ່ງບໍ່ສຳເລັດ / ຍົກເລີກ"
            value={percentText(rates.cancelledRate)}
            sub={`${numberText(overall.cancelled_bills)} ບິນ · ${numberText(overall.cancelled_legs)} ຄັ້ງ`}
            tone="rose"
          />
        </div>
        <p className="px-4 pb-4 text-[10px] leading-relaxed text-slate-400">
          <FaTimesCircle className="mr-1 inline text-rose-400" size={9} />
          ບິນທີ່ຖືກຍົກເລີກຍັງນັບເປັນຍອດຄົງເຫຼືອຈົນກວ່າຈະຖືກຈັດຖ້ຽວໃໝ່ ຫຼື ຄືນສາງ ຈຶ່ງບໍ່ໄດ້ຫັກອອກຈາກສົມຜົນຍອດຍົກໄປ.
        </p>
      </section>

      <BranchTable branches={branches} />

      {!loading && !hasData && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900/70">
          ບໍ່ມີຂໍ້ມູນໃນເດືອນ {monthText(month)}
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-[10px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-400">
        <p className="mb-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">ນິຍາມທີ່ໃຊ້</p>
        <p>
          • ນັບສະເພາະບິນທີ່ 3 ສາຂາຂົນສົ່ງເປັນຄົນຈັດສົ່ງ (ໂອດ່ຽນ · ດອນຕິ້ວ · ປາກເຊ) ພາຍໃນປີ {FIXED_MONTH_MIN.slice(0, 4)}.
          ສາຂາເຈົ້າຂອງບິນຖືເອົາ <b>ສາຂາຂອງຖ້ຽວທີ່ສົ່ງສຳເລັດ</b> ເປັນຫຼັກ, ບິນທີ່ຍັງບໍ່ທັນຈັດຖ້ຽວຈຶ່ງໃຊ້ສາຂາທີ່ຜູ້ຈັດມອບໝາຍ.
          ຈຶ່ງລວມທັງບິນມື/ບິນໂອນທີ່ບໍ່ມີແຖວໃນ ERP ແລະ ບິນທີ່ຖືກໂອນຂ້າມສາຂາ.
        </p>
        <p>
          • ບິນ &quot;ສົ່ງສຳເລັດ&quot; = <b>ສິນຄ້າຮອດມືລູກຄ້າຄົບແລ້ວ</b>. ບິນທະຍອຍສົ່ງນັບສຳເລັດຕອນ
          <b>ຖ້ຽວສຸດທ້າຍ</b> ບໍ່ແມ່ນຖ້ຽວທຳອິດ ແລະ ຖ້າຍັງຂາດຈຳນວນຢູ່ ຍັງບໍ່ນັບເປັນສຳເລັດ.
        </p>
        <p>
          • &quot;ຍອດຄົງເຫຼືອຍົກໄປ&quot; = ບິນທີ່ <b>ສິນຄ້າຍັງບໍ່ຮອດມືລູກຄ້າ</b> — ລວມບິນທີ່ຂຶ້ນລົດແລ້ວກຳລັງສົ່ງ
          ແລະ ບິນທະຍອຍສົ່ງທີ່ຍັງສົ່ງບໍ່ຄົບ. ຈຶ່ງສູງກວ່າຕົວເລກໜ້າ &quot;ບິນລໍຈັດຖ້ຽວ&quot; ທີ່ນັບສະເພາະບິນທີ່ຍັງບໍ່ໄດ້ຂຶ້ນລົດ.
        </p>
        <p>
          • ບິນທີ່ຄົນຂັບປິດງານໂດຍບໍ່ບັນທຶກລາຍການສິນຄ້າ (ວັດແລ້ວ ~1,900 ໃບ/ປີ) ຖືວ່າສົ່ງຄົບ —
          ບໍ່ມີຫຼັກຖານວ່າຂາດ ແລະ ERP ຢືນຢັນຄົບແລ້ວ. ນັບເປັນຄ້າງສະເພາະເມື່ອ<b>ມີແຖວລາຍການເປັນຫຼັກຖານ</b>ວ່າຍັງຂາດ.
        </p>
        <p>
          • &quot;ຫຼຸດອອກ&quot; = ບິນທີ່ອອກຈາກຍອດຄ້າງໂດຍບໍ່ໄດ້ສົ່ງ (ຄືນຜ່ານໃບຫຼຸດໜີ້ trans_flag 48 ຫຼື ຖືກປິດຢູ່ ERP).
          ບິນທີ່ບໍ່ມີໃບຫຼຸດໜີ້ໃຫ້ອ້າງວັນທີ (ປະມານ 53 ໃບ/ປີ) ຖືກນັບອອກຕັ້ງແຕ່ວັນເປີດບິນ ເພາະ ERP ບໍ່ເກັບປະຫວັດການປິດບິນ.
        </p>
        <p>• ບິນທະຍອຍສົ່ງນັບວ່າສຳເລັດຕັ້ງແຕ່ຖ້ຽວທຳອິດ ຈຶ່ງລາຍງານແຍກໄວ້ໃນ &quot;ຄຸນນະພາບການຈັດສົ່ງ&quot;.</p>
        <p>• ບິນລໍຈັດຖ້ຽວນັບສະເພາະບິນຂາຍ (trans_flag 44) ຄືກັບໜ້າ &quot;ບິນລໍຈັດຖ້ຽວ&quot; — ຕັດເອກະສານ RWSO/SRH ທີ່ບໍ່ແມ່ນວຽກຈັດສົ່ງອອກ.</p>
        <p>• ບິນທີ່ເປີດກ່ອນປີ {FIXED_MONTH_MIN.slice(0, 4)} ບໍ່ຢູ່ໃນຍອດຍົກມາ ເພາະລະບົບຕຶງການກັ່ນຕອງໄວ້ທີ່ປີນີ້.</p>
      </section>
    </div>
  );
}

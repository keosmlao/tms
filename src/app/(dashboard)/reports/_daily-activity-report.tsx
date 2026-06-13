"use client";

import { useEffect, useState } from "react";
import {
  FaCalendar,
  FaSearch,
  FaSpinner,
  FaInbox,
  FaFileInvoice,
  FaTruck,
  FaBoxOpen,
  FaWarehouse,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";

// Movement ledger over a date range: carry-in + opened − delivered = remaining.
// One query feeds both modes; `mode` only decides whether we read bill counts
// or product-quantity totals. See getReportDailyActivity in src/queries/reports.js.
type Mode = "bill" | "product";

interface BranchRow {
  branch_code: string;
  branch_name: string;
  carry_bills: number;
  opened_bills: number;
  delivered_bills: number;
  remaining_bills: number;
  carry_qty: number;
  opened_qty: number;
  delivered_qty: number;
  remaining_qty: number;
}

interface ActivityData {
  fromDate: string;
  toDate: string;
  branches: BranchRow[];
  total: Omit<BranchRow, "branch_code" | "branch_name">;
}

function firstOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function fmt(n: number) {
  return Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function DailyActivityReport({ mode }: { mode: Mode }) {
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(() => firstOfMonth(today));
  const [toDate, setToDate] = useState(() => today);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    Actions.getReportDailyActivity(fromDate, toDate)
      .then((d) => setData(d as ActivityData))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBill = mode === "bill";
  const unit = isBill ? "ບິນ" : "ສິນຄ້າ";
  const pick = (
    r: BranchRow | ActivityData["total"],
    key: "carry" | "opened" | "delivered" | "remaining"
  ): number => {
    if (isBill) {
      return key === "carry" ? r.carry_bills
        : key === "opened" ? r.opened_bills
        : key === "delivered" ? r.delivered_bills
        : r.remaining_bills;
    }
    return key === "carry" ? r.carry_qty
      : key === "opened" ? r.opened_qty
      : key === "delivered" ? r.delivered_qty
      : r.remaining_qty;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 flex items-center justify-center shadow-md">
          {isBill ? <FaFileInvoice className="text-white text-lg" /> : <FaBoxOpen className="text-white text-lg" />}
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">
            ລາຍການງານເຄື່ອນໄຫວປະຈຳວັນ ({unit})
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ຍອດຍົກມາ + ເປີດບິນ − ຈັດສົ່ງ = ຄົງເຫຼືອ ({isBill ? "ນັບເປັນບິນ" : "ນັບເປັນຈຳນວນສິນຄ້າ"})
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="glass rounded-lg p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchData();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} />
              ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} />
              ຫາວັນທີ
            </label>
            <input
              type="date"
              value={toDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </form>
      </div>

      {loading ? (
        <div className="glass rounded-lg p-12 text-center">
          <FaSpinner className="animate-spin text-teal-600 text-2xl mx-auto mb-3" />
          <p className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        </div>
      ) : !data ? (
        <div className="glass rounded-lg p-12 text-center">
          <FaInbox className="text-slate-400 text-2xl mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">ບໍ່ມີຂໍ້ມູນ</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="ຍອດຍົກມາ (ຄ້າງສົ່ງ)"
              value={pick(data.total, "carry")}
              unit={unit}
              icon={<FaWarehouse />}
              iconBg="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              accent="text-amber-600 dark:text-amber-400"
            />
            <SummaryCard
              label="ຍອດເປີດບິນ"
              value={pick(data.total, "opened")}
              unit={unit}
              icon={<FaFileInvoice />}
              iconBg="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              accent="text-sky-600 dark:text-sky-400"
            />
            <SummaryCard
              label="ຍອດຈັດສົ່ງ"
              value={pick(data.total, "delivered")}
              unit={unit}
              icon={<FaTruck />}
              iconBg="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <SummaryCard
              label="ຄົງເຫຼືອ"
              value={pick(data.total, "remaining")}
              unit={unit}
              icon={<FaInbox />}
              iconBg="bg-rose-500/10 text-rose-600 dark:text-rose-400"
              accent="text-rose-600 dark:text-rose-400"
            />
          </div>

          {/* Per-branch breakdown */}
          <div className="glass rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/30 dark:border-white/5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">ແຍກຕາມສາຂາ</p>
              <p className="text-[11px] text-slate-400">{data.fromDate} → {data.toDate}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສາຂາ</th>
                    <th className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400">ຍອດຍົກມາ</th>
                    <th className="px-4 py-3 text-right font-semibold text-sky-600 dark:text-sky-400">ເປີດບິນ</th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">ຈັດສົ່ງ</th>
                    <th className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">ຄົງເຫຼືອ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.branches.map((b, index) => (
                    <tr
                      key={b.branch_code}
                      className={`border-b border-slate-200/20 dark:border-white/5 ${
                        index % 2 === 1 ? "bg-white/10 dark:bg-white/[0.02]" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                        <FaTruck size={10} className="text-slate-400" />
                        {b.branch_name}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{fmt(pick(b, "carry"))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sky-700 dark:text-sky-400">{fmt(pick(b, "opened"))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(pick(b, "delivered"))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-400">{fmt(pick(b, "remaining"))}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300/40 dark:border-white/10 bg-white/40 dark:bg-white/5 font-bold">
                    <td className="px-4 py-3 text-slate-800 dark:text-white">ລວມທັງໝົດ</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{fmt(pick(data.total, "carry"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-sky-700 dark:text-sky-400">{fmt(pick(data.total, "opened"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(pick(data.total, "delivered"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-700 dark:text-rose-400">{fmt(pick(data.total, "remaining"))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  icon,
  iconBg,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}) {
  return (
    <div className="bg-white dark:bg-white/5 rounded-lg border border-slate-100 dark:border-white/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1.5 text-xl font-bold ${accent}`}>
          {value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          <span className="ml-1 text-[11px] font-medium text-slate-400">{unit}</span>
        </p>
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
  );
}

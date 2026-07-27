"use client";

import { useEffect, useState } from "react";
import {
  FaCalendar,
  FaSearch,
  FaSpinner,
  FaInbox,
  FaFileInvoice,
  FaTruck,
  FaWarehouse,
  FaFileExcel,
  FaBuilding,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { exportToExcel } from "@/lib/excel-export";

// Daily transport ledger split by sale department:
//   ຄ້າງສົ່ງຍົກມາ + ເປີດບິນໃນວັນ − ຈັດສົ່ງໃນວັນ = ຄົງເຫຼືອ
// Each bucket carries both a bill count and a product quantity.
// See getReportDailyDepartment in src/queries/reports.js.
interface DeptRow {
  department: string;
  department_code: string;
  carry_bills: number;
  opened_bills: number;
  delivered_bills: number;
  remaining_bills: number;
  carry_qty: number;
  opened_qty: number;
  delivered_qty: number;
  remaining_qty: number;
}

interface DeptData {
  fromDate: string;
  toDate: string;
  salesOnly: boolean;
  departments: DeptRow[];
  total: Omit<DeptRow, "department" | "department_code">;
}

function fmt(n: number) {
  return Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function DailyDepartmentReport() {
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(() => today);
  const [toDate, setToDate] = useState(() => today);
  const [salesOnly, setSalesOnly] = useState(true);
  const [data, setData] = useState<DeptData | null>(null);
  const [loading, setLoading] = useState(true);

  // salesOnly is read at call time so the checkbox can refetch immediately
  // without waiting for the state to land in a re-render.
  const fetchData = (onlySales = salesOnly) => {
    setLoading(true);
    Actions.getReportDailyDepartment(fromDate, toDate, onlySales)
      .then((d) => setData(d as DeptData))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = () => {
    if (!data || data.departments.length === 0) return;
    const rows = [
      ...data.departments.map((d, i) => ({ no: String(i + 1), ...d })),
      { no: "", department: "ລວມທັງໝົດ", department_code: "", ...data.total },
    ];
    exportToExcel(`daily-department_${data.fromDate}_to_${data.toDate}`, rows, [
      { key: "no", header: "#", width: 6 },
      { key: "department_code", header: "ລະຫັດ", width: 8 },
      { key: "department", header: "ພະແນກ", width: 26 },
      { key: "carry_bills", header: "ຄ້າງສົ່ງຍົກມາ (ບິນ)", width: 16 },
      { key: "carry_qty", header: "ຄ້າງສົ່ງຍົກມາ (ສິນຄ້າ)", width: 18 },
      { key: "opened_bills", header: "ເປີດບິນໃນວັນ (ບິນ)", width: 16 },
      { key: "opened_qty", header: "ເປີດບິນໃນວັນ (ສິນຄ້າ)", width: 18 },
      { key: "delivered_bills", header: "ຈັດສົ່ງໃນວັນ (ບິນ)", width: 16 },
      { key: "delivered_qty", header: "ຈັດສົ່ງໃນວັນ (ສິນຄ້າ)", width: 18 },
      { key: "remaining_bills", header: "ຄົງເຫຼືອ (ບິນ)", width: 14 },
      { key: "remaining_qty", header: "ຄົງເຫຼືອ (ສິນຄ້າ)", width: 16 },
    ]);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 flex items-center justify-center shadow-md">
          <FaBuilding className="text-white text-lg" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">
            ລາຍງານປະຈຳວັນຂົນສົ່ງ (ແຍກຕາມພະແນກຂາຍ)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ຄ້າງສົ່ງຍົກມາ + ເປີດບິນໃນວັນ − ຈັດສົ່ງໃນວັນ = ຄົງເຫຼືອ (ນັບທັງບິນ ແລະ ຈຳນວນສິນຄ້າ)
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
          <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={salesOnly}
              onChange={(e) => {
                setSalesOnly(e.target.checked);
                fetchData(e.target.checked);
              }}
              className="w-3.5 h-3.5 accent-teal-600"
            />
            ສະເພາະພະແນກຂາຍ
          </label>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || !data || data.departments.length === 0}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <FaFileExcel size={11} />
            Excel
          </button>
        </form>
      </div>

      {loading ? (
        <div className="glass rounded-lg p-12 text-center">
          <FaSpinner className="animate-spin text-teal-600 text-2xl mx-auto mb-3" />
          <p className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        </div>
      ) : !data || data.departments.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center">
          <FaInbox className="text-slate-400 text-2xl mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">ບໍ່ມີຂໍ້ມູນ</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="ຄ້າງສົ່ງຍົກມາ"
              bills={data.total.carry_bills}
              qty={data.total.carry_qty}
              icon={<FaWarehouse />}
              iconBg="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              accent="text-amber-600 dark:text-amber-400"
            />
            <SummaryCard
              label="ເປີດບິນໃນວັນ"
              bills={data.total.opened_bills}
              qty={data.total.opened_qty}
              icon={<FaFileInvoice />}
              iconBg="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              accent="text-sky-600 dark:text-sky-400"
            />
            <SummaryCard
              label="ຈັດສົ່ງໃນວັນ"
              bills={data.total.delivered_bills}
              qty={data.total.delivered_qty}
              icon={<FaTruck />}
              iconBg="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <SummaryCard
              label="ຄົງເຫຼືອ"
              bills={data.total.remaining_bills}
              qty={data.total.remaining_qty}
              icon={<FaInbox />}
              iconBg="bg-rose-500/10 text-rose-600 dark:text-rose-400"
              accent="text-rose-600 dark:text-rose-400"
            />
          </div>

          {/* Per-department breakdown */}
          <div className="glass rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/30 dark:border-white/5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {data.salesOnly ? "ແຍກຕາມພະແນກຂາຍ" : "ແຍກຕາມພະແນກ (ທັງໝົດ)"}
              </p>
              <p className="text-[11px] text-slate-400">{data.fromDate} → {data.toDate}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th rowSpan={2} className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 align-bottom">ພະແນກ</th>
                    <th colSpan={2} className="px-4 py-2 text-center font-semibold text-amber-600 dark:text-amber-400 border-l border-slate-200/30 dark:border-white/5">ຄ້າງສົ່ງຍົກມາ</th>
                    <th colSpan={2} className="px-4 py-2 text-center font-semibold text-sky-600 dark:text-sky-400 border-l border-slate-200/30 dark:border-white/5">ເປີດບິນໃນວັນ</th>
                    <th colSpan={2} className="px-4 py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400 border-l border-slate-200/30 dark:border-white/5">ຈັດສົ່ງໃນວັນ</th>
                    <th colSpan={2} className="px-4 py-2 text-center font-semibold text-rose-600 dark:text-rose-400 border-l border-slate-200/30 dark:border-white/5">ຄົງເຫຼືອ</th>
                  </tr>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-1.5 text-right font-medium border-l border-slate-200/30 dark:border-white/5">ບິນ</th>
                    <th className="px-3 py-1.5 text-right font-medium">ສິນຄ້າ</th>
                    <th className="px-3 py-1.5 text-right font-medium border-l border-slate-200/30 dark:border-white/5">ບິນ</th>
                    <th className="px-3 py-1.5 text-right font-medium">ສິນຄ້າ</th>
                    <th className="px-3 py-1.5 text-right font-medium border-l border-slate-200/30 dark:border-white/5">ບິນ</th>
                    <th className="px-3 py-1.5 text-right font-medium">ສິນຄ້າ</th>
                    <th className="px-3 py-1.5 text-right font-medium border-l border-slate-200/30 dark:border-white/5">ບິນ</th>
                    <th className="px-3 py-1.5 text-right font-medium">ສິນຄ້າ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((d, index) => (
                    <tr
                      key={d.department}
                      className={`border-b border-slate-200/20 dark:border-white/5 ${
                        index % 2 === 1 ? "bg-white/10 dark:bg-white/[0.02]" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                        <span className="flex items-center gap-1.5">
                          <FaBuilding size={10} className="text-slate-400" />
                          {d.department}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400 border-l border-slate-200/20 dark:border-white/5">{fmt(d.carry_bills)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-amber-700/70 dark:text-amber-400/70">{fmt(d.carry_qty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-sky-700 dark:text-sky-400 border-l border-slate-200/20 dark:border-white/5">{fmt(d.opened_bills)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-sky-700/70 dark:text-sky-400/70">{fmt(d.opened_qty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-slate-200/20 dark:border-white/5">{fmt(d.delivered_bills)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-700/70 dark:text-emerald-400/70">{fmt(d.delivered_qty)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-400 border-l border-slate-200/20 dark:border-white/5">{fmt(d.remaining_bills)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-rose-700/70 dark:text-rose-400/70">{fmt(d.remaining_qty)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300/40 dark:border-white/10 bg-white/40 dark:bg-white/5 font-bold">
                    <td className="px-4 py-3 text-slate-800 dark:text-white">ລວມທັງໝົດ</td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400 border-l border-slate-200/20 dark:border-white/5">{fmt(data.total.carry_bills)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-700/70 dark:text-amber-400/70">{fmt(data.total.carry_qty)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-700 dark:text-sky-400 border-l border-slate-200/20 dark:border-white/5">{fmt(data.total.opened_bills)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-700/70 dark:text-sky-400/70">{fmt(data.total.opened_qty)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-slate-200/20 dark:border-white/5">{fmt(data.total.delivered_bills)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700/70 dark:text-emerald-400/70">{fmt(data.total.delivered_qty)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-700 dark:text-rose-400 border-l border-slate-200/20 dark:border-white/5">{fmt(data.total.remaining_bills)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-700/70 dark:text-rose-400/70">{fmt(data.total.remaining_qty)}</td>
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
  bills,
  qty,
  icon,
  iconBg,
  accent,
}: {
  label: string;
  bills: number;
  qty: number;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
}) {
  return (
    <div className="bg-white dark:bg-white/5 rounded-lg border border-slate-100 dark:border-white/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1.5 text-xl font-bold ${accent}`}>
          {fmt(bills)}
          <span className="ml-1 text-[11px] font-medium text-slate-400">ບິນ</span>
        </p>
        <p className="text-[11px] font-medium text-slate-400">{fmt(qty)} ສິນຄ້າ</p>
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
  );
}

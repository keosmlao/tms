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
import { FaTimes } from "react-icons/fa";
import { exportToExcel } from "@/lib/excel-export";

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

// One bill behind a figure — the drill-down opened by clicking a number.
interface DrillBill {
  bill_no: string;
  doc_date: string;
  cust_name: string;
  cust_area?: string;
  sale?: string;
  department?: string;
  qty: number;
  item_count: number;
  note?: string;
}

type Bucket = "opened" | "delivered" | "remaining";

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
  // Drill-down: which cell was clicked, and the bills behind it.
  const [drill, setDrill] = useState<
    { branch: BranchRow | null; bucket: Bucket; label: string } | null
  >(null);
  const [drillRows, setDrillRows] = useState<DrillBill[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Excel straight from the drill-down: either one row per bill (what is on
  // screen) or one row per product line, fetched on demand.
  const exportDrill = async (as: "bills" | "items") => {
    if (!drill) return;
    setExporting(true);
    try {
      const branch = drill.branch?.branch_code ?? "";
      const name = `${drill.bucket}_${as}_${fromDate}_to_${toDate}${branch ? `_${branch}` : ""}`;
      if (as === "bills") {
        exportToExcel(
          name,
          drillRows.map((r, i) => ({ no: i + 1, ...r })),
          [
            { key: "no", header: "#", width: 6 },
            { key: "bill_no", header: "ເລກບິນ", width: 18 },
            { key: "doc_date", header: "ວັນທີບິນ", width: 13 },
            { key: "cust_name", header: "ລູກຄ້າ", width: 30 },
            { key: "cust_area", header: "ບ້ານ · ເມືອງ · ແຂວງ", width: 32 },
            { key: "sale", header: "ພະນັກງານຂາຍ", width: 18 },
            { key: "department", header: "ພະແນກ", width: 22 },
            { key: "item_count", header: "ລາຍການ", width: 9 },
            { key: "qty", header: "ຈຳນວນສິນຄ້າ", width: 12 },
            { key: "note", header: "ໝາຍເຫດ", width: 16 },
          ]
        );
      } else {
        const rows = ((await Actions.getReportDailyActivityItems(
          fromDate,
          toDate,
          branch,
          drill.bucket
        )) ?? []) as Array<Record<string, unknown>>;
        exportToExcel(
          name,
          rows.map((r, i) => ({ no: i + 1, ...r })) as Array<Record<string, unknown>>,
          [
            { key: "no", header: "#", width: 6 },
            { key: "bill_no", header: "ເລກບິນ", width: 18 },
            { key: "doc_date", header: "ວັນທີບິນ", width: 13 },
            { key: "cust_name", header: "ລູກຄ້າ", width: 28 },
            { key: "cust_area", header: "ບ້ານ · ເມືອງ · ແຂວງ", width: 30 },
            { key: "item_code", header: "ລະຫັດສິນຄ້າ", width: 16 },
            { key: "item_name", header: "ຊື່ສິນຄ້າ", width: 34 },
            { key: "qty", header: "ຈຳນວນ", width: 10 },
            { key: "unit_code", header: "ໜ່ວຍ", width: 9 },
            { key: "sale", header: "ພະນັກງານຂາຍ", width: 18 },
            { key: "department", header: "ພະແນກ", width: 22 },
          ]
        );
      }
    } catch (e) {
      console.error("export failed", e);
    } finally {
      setExporting(false);
    }
  };

  const openDrill = (branch: BranchRow | null, bucket: Bucket, label: string) => {
    setDrill({ branch, bucket, label });
    setDrillRows([]);
    setDrillLoading(true);
    Actions.getReportDailyActivityBills(fromDate, toDate, branch?.branch_code ?? "", bucket)
      .then((rows) => setDrillRows((rows ?? []) as DrillBill[]))
      .catch(console.error)
      .finally(() => setDrillLoading(false));
  };

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
              <p className="text-[11px] text-slate-400">
                {data.fromDate} → {data.toDate} · ກົດຕົວເລກເພື່ອເບິ່ງລາຍການບິນ
              </p>
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
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400" title="ຄິດຈາກ ຄົງເຫຼືອ + ຈັດສົ່ງ − ເປີດບິນ (ບໍ່ມີລາຍການບິນຂອງຕົນເອງ)">
                        {fmt(pick(b, "carry"))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sky-700 dark:text-sky-400">
                        <button type="button" onClick={() => openDrill(b, "opened", `ເປີດບິນ · ${b.branch_name}`)} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-70">
                          {fmt(pick(b, "opened"))}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        <button type="button" onClick={() => openDrill(b, "delivered", `ຈັດສົ່ງ · ${b.branch_name}`)} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-70">
                          {fmt(pick(b, "delivered"))}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-400">
                        <button type="button" onClick={() => openDrill(b, "remaining", `ຄົງເຫຼືອ · ${b.branch_name}`)} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-70">
                          {fmt(pick(b, "remaining"))}
                        </button>
                      </td>
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

      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{drill.label}</p>
                <p className="text-[11px] text-slate-500">
                  {fromDate} → {toDate} · {drillRows.length} ບິນ ·{" "}
                  {fmt(drillRows.reduce((n, r) => n + Number(r.qty ?? 0), 0))} ສິນຄ້າ
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void exportDrill("bills")}
                  disabled={exporting || drillLoading || drillRows.length === 0}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  Excel (ບິນ)
                </button>
                <button
                  type="button"
                  onClick={() => void exportDrill("items")}
                  disabled={exporting || drillLoading || drillRows.length === 0}
                  className="cursor-pointer rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-40"
                >
                  {exporting ? "..." : "Excel (ສິນຄ້າ)"}
                </button>
                <button
                  type="button"
                  onClick={() => setDrill(null)}
                  className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <FaTimes size={13} />
                </button>
              </div>
            </div>
            <div className="overflow-auto px-4 py-3">
              {drillLoading ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  <FaSpinner className="mr-2 inline animate-spin" /> ກຳລັງໂຫຼດ...
                </p>
              ) : drillRows.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">ບໍ່ມີບິນໃນຊ່ວງນີ້</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                      <th className="py-2 text-left font-semibold">ເລກບິນ</th>
                      <th className="py-2 text-left font-semibold">ລູກຄ້າ</th>
                      <th className="py-2 text-left font-semibold">ພະນັກງານຂາຍ / ພະແນກ</th>
                      <th className="py-2 text-right font-semibold">ລາຍການ</th>
                      <th className="py-2 text-right font-semibold">ສິນຄ້າ</th>
                      <th className="py-2 text-left font-semibold">ວັນທີ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillRows.map((r) => (
                      <tr key={r.bill_no} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="py-1.5 font-semibold text-slate-800 dark:text-slate-100">{r.bill_no}</td>
                        <td className="py-1.5 text-slate-600 dark:text-slate-300">
                          {r.cust_name}
                          {r.cust_area ? <span className="block text-[10px] text-slate-400">📍 {r.cust_area}</span> : null}
                        </td>
                        <td className="py-1.5 text-[10px] text-slate-500">
                          {[r.sale, r.department].filter(Boolean).join(" · ")}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.item_count}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{fmt(r.qty)}</td>
                        <td className="py-1.5 text-[10px] text-slate-500">{r.note || r.doc_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
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

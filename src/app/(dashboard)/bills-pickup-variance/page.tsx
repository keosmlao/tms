"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  FaCalendar,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaExclamationTriangle,
  FaSearch,
  FaSpinner,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
} from "@/components/status-page-shell";

// ບິນເບີກບໍ່ຄົບ — pickups where the driver reported a different quantity at the
// warehouse than the trip planned. The trip was already corrected when the
// driver submitted; this screen is where dispatch confirms they have seen it.
interface VarianceItem {
  item_code: string;
  item_name: string;
  unit_code: string;
  planned_qty: number;
  reported_qty: number;
  actual_qty: number;
  diff_qty: number;
  over_reported: boolean;
}

interface VarianceRow {
  doc_no: string;
  bill_no: string;
  created_at: string;
  cust_name: string;
  driver_name: string;
  car_name: string;
  branch_name: string;
  line_count: number;
  missing_qty: number;
  over_count: number;
  remark: string;
  acknowledged: boolean;
  acknowledged_at: string;
  acknowledged_by: string;
  items: VarianceItem[];
}

type StatusFilter = "open" | "acknowledged" | "all";

const fmtNum = (v: number) =>
  Number(v ?? 0) % 1 === 0
    ? Number(v ?? 0).toFixed(0)
    : Number(v ?? 0).toFixed(2).replace(/\.?0+$/, "");

const statusTabs: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "ຍັງບໍ່ຮັບຮູ້" },
  { key: "acknowledged", label: "ຮັບຮູ້ແລ້ວ" },
  { key: "all", label: "ທັງໝົດ" },
];

export default function BillsPickupVariancePage() {
  const today = getFixedTodayDate();
  const [rows, setRows] = useState<VarianceRow[]>([]);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [acking, setAcking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rowKey = (r: VarianceRow) => `${r.doc_no}|${r.bill_no}`;

  // status is passed explicitly so a tab click can load without waiting for
  // the state update to land in a re-render.
  const load = (nextStatus: StatusFilter = status) => {
    setLoading(true);
    setError("");
    void Actions.getPickupVarianceList(fromDate, toDate, nextStatus)
      .then((data) => setRows(data as VarianceRow[]))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acknowledge = async (row: VarianceRow) => {
    const key = rowKey(row);
    setAcking(key);
    setError("");
    try {
      await Actions.acknowledgePickupVariance(row.doc_no, row.bill_no);
      // Drop it from the "ຍັງບໍ່ຮັບຮູ້" list; in the other tabs just flip the flag.
      setRows((prev) =>
        status === "open"
          ? prev.filter((r) => rowKey(r) !== key)
          : prev.map((r) => (rowKey(r) === key ? { ...r, acknowledged: true } : r))
      );
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setAcking(null);
    }
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filtered = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((r) =>
      [r.bill_no, r.doc_no, r.cust_name, r.driver_name, r.car_name, r.branch_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, searchText]);

  const summary = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.bills += 1;
          acc.lines += Number(r.line_count ?? 0);
          acc.missing += Number(r.missing_qty ?? 0);
          if (!r.acknowledged) acc.open += 1;
          return acc;
        },
        { bills: 0, lines: 0, missing: 0, open: 0 }
      ),
    [filtered]
  );

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ບິນເບີກບໍ່ຄົບ"
        subtitle="ຄົນຂັບແຈ້ງຈຳນວນທີ່ຮັບຈາກສາງບໍ່ກົງກັບຖ້ຽວ — ລະບົບປັບຈຳນວນໃນຖ້ຽວໃຫ້ແລ້ວ ແລະ ສ່ວນທີ່ຂາດກັບໄປເປັນບິນຄ້າງສົ່ງ"
        icon={<FaExclamationTriangle />}
        tone="rose"
      />

      <StatusStatGrid
        stats={[
          { label: "ບິນທີ່ແຈ້ງ", value: summary.bills, icon: <FaExclamationTriangle />, tone: "rose" },
          { label: "ຍັງບໍ່ຮັບຮູ້", value: summary.open, icon: <FaCheckCircle />, tone: "amber" },
          { label: "ລາຍການສິນຄ້າ", value: summary.lines, icon: <FaTruck />, tone: "sky" },
          { label: "ຈຳນວນທີ່ຂາດ", value: fmtNum(summary.missing), icon: <FaExclamationTriangle />, tone: "rose" },
        ]}
      />

      <StatusControlPanel>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} /> ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">ເຖິງວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <div className="flex-[1.4] min-w-[220px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaSearch className="inline mr-1.5 text-slate-400" size={11} /> ຄົ້ນຫາ
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ເລກບິນ, ຖ້ຽວ, ລູກຄ້າ, ຄົນຂັບ..."
              className="w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "ກຳລັງໂຫຼດ..." : "ຄົ້ນຫາ"}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatus(tab.key);
                load(tab.key);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === tab.key
                  ? "bg-rose-600 text-white"
                  : "bg-white/40 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </StatusControlPanel>

      {error && (
        <div className="glass rounded-lg border border-rose-500/30 px-4 py-3 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      <StatusTableShell count={filtered.length}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
              <FaCheckCircle className="text-emerald-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ບໍ່ມີບິນເບີກບໍ່ຄົບໃນຊ່ວງນີ້"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <th className="px-3 py-3 w-8" />
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລກບິນ / ຖ້ຽວ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລູກຄ້າ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຄົນຂັບ / ລົດ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເບີກເມື່ອ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຂາດ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ໝາຍເຫດຄົນຂັບ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຮັບຮູ້</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const key = rowKey(r);
                  const isOpen = expanded.has(key);
                  return (
                    <Fragment key={key}>
                      <tr
                        className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/20 dark:hover:bg-white/[0.03] cursor-pointer"
                        onClick={() => toggle(key)}
                      >
                        <td className="px-3 py-3 text-slate-400">
                          {isOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 dark:text-white">{r.bill_no}</p>
                          <p className="text-[11px] text-slate-400">
                            {r.doc_no} · {r.branch_name}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.cust_name}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700 dark:text-slate-200">{r.driver_name}</p>
                          <p className="text-[11px] text-slate-400">{r.car_name}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.created_at}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                            {fmtNum(r.missing_qty)}
                          </span>
                          <span className="text-[11px] text-slate-400"> / {r.line_count} ລາຍການ</span>
                          {r.over_count > 0 && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                              ເກີນ {r.over_count} ລາຍການ (ບໍ່ໄດ້ປັບ)
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.remark || "-"}</td>
                        <td className="px-4 py-3 text-right">
                          {r.acknowledged ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <FaCheckCircle size={10} /> ຮັບຮູ້ແລ້ວ
                              </span>
                              {r.acknowledged_by && (
                                <span className="mt-1 text-[10px] text-slate-400">
                                  {r.acknowledged_by} · {r.acknowledged_at}
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void acknowledge(r);
                              }}
                              disabled={acking === key}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {acking === key ? (
                                <FaSpinner className="animate-spin" size={10} />
                              ) : (
                                <FaCheck size={10} />
                              )}
                              ຮັບຮູ້ແລ້ວ
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-200/20 dark:border-white/5">
                          <td />
                          <td colSpan={7} className="px-4 py-3">
                            <div className="rounded-lg bg-white/40 dark:bg-white/5 p-3">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-slate-500 dark:text-slate-400">
                                    <th className="py-1 text-left font-medium">ສິນຄ້າ</th>
                                    <th className="py-1 text-right font-medium">ໃນຖ້ຽວ</th>
                                    <th className="py-1 text-right font-medium">ຄົນຂັບແຈ້ງ</th>
                                    <th className="py-1 text-right font-medium">ປັບເປັນ</th>
                                    <th className="py-1 text-right font-medium">ຕ່າງ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.items.map((it) => (
                                    <tr key={`${key}-${it.item_code}`} className="border-t border-slate-200/30 dark:border-white/5">
                                      <td className="py-1.5 text-slate-700 dark:text-slate-200">
                                        {it.item_name}
                                        <span className="ml-1 text-slate-400">({it.item_code})</span>
                                        {it.over_reported && (
                                          <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                                            ແຈ້ງເກີນ — ບໍ່ໄດ້ປັບ
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                                        {fmtNum(it.planned_qty)} {it.unit_code}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                                        {fmtNum(it.reported_qty)}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-white">
                                        {fmtNum(it.actual_qty)}
                                      </td>
                                      <td
                                        className={`py-1.5 text-right tabular-nums font-semibold ${
                                          it.diff_qty < 0
                                            ? "text-rose-600 dark:text-rose-400"
                                            : "text-slate-400"
                                        }`}
                                      >
                                        {it.diff_qty === 0 ? "-" : fmtNum(it.diff_qty)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </StatusTableShell>
    </div>
  );
}

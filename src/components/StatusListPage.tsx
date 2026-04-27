"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FaCalendar, FaSearch, FaSpinner } from "react-icons/fa";
import { getFixedTodayDate } from "@/lib/fixed-year";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
  type StatusTone,
} from "@/components/status-page-shell";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  width?: string;
}

export interface StatCard {
  label: string;
  value: number | string;
  icon: ReactNode;
  /** Tailwind text+bg color tokens, e.g. "amber" for amber-600 + amber-500/10 */
  tone?: StatusTone;
}

interface StatusListPageProps<T> {
  /** Page header */
  title: string;
  subtitle: string;
  icon: ReactNode;
  /** Tone for icon container, e.g. "emerald" → bg-emerald-500/10 + text-emerald-600 */
  tone?: StatusTone;

  /** Async loader receiving (fromDate, toDate). */
  fetchData: (fromDate: string, toDate: string) => Promise<T[]>;

  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;

  /** Optional stat cards above the filter bar */
  stats?: (rows: T[]) => StatCard[];

  /** Searchable fields — when set, a search box appears */
  searchKeys?: (keyof T | string)[];

  /** Hide date filter (default: shown) */
  hideDateFilter?: boolean;

  emptyMessage?: string;
  initialFromDate?: string;
  initialToDate?: string;
}

export default function StatusListPage<T>({
  title,
  subtitle,
  icon,
  tone = "emerald",
  fetchData,
  columns,
  rowKey,
  onRowClick,
  stats,
  searchKeys,
  hideDateFilter = false,
  emptyMessage = "ບໍ່ມີຂໍ້ມູນ",
  initialFromDate,
  initialToDate,
}: StatusListPageProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [fromDate, setFromDate] = useState(initialFromDate ?? getFixedTodayDate());
  const [toDate, setToDate] = useState(initialToDate ?? getFixedTodayDate());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    fetchData(fromDate, toDate)
      .then((data) => setItems(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!searchKeys || !search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((row) =>
      searchKeys.some((k) => {
        const v = (row as Record<string, unknown>)[k as string];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [items, search, searchKeys]);

  const computedStats = stats ? stats(items) : null;

  return (
    <div className="space-y-5">
      <StatusPageHeader title={title} subtitle={subtitle} icon={icon} tone={tone} />

      {computedStats && <StatusStatGrid stats={computedStats} />}

      {/* Date filter */}
      {(!hideDateFilter || (searchKeys && searchKeys.length > 0)) && (
        <StatusControlPanel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            {!hideDateFilter && (
              <>
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
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    ເຖິງວັນທີ
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                  />
                </div>
              </>
            )}
            {searchKeys && searchKeys.length > 0 && (
              <div className="flex-[1.4] min-w-[220px]">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  <FaSearch className="inline mr-1.5 text-slate-400" size={11} /> ຄົ້ນຫາ
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ຄົ້ນຫາ..."
                  className="w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all"
                />
              </div>
            )}
            {!hideDateFilter && (
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "ກຳລັງໂຫຼດ..." : "ຄົ້ນຫາ"}
              </button>
            )}
          </form>
        </StatusControlPanel>
      )}

      {/* Table */}
      <StatusTableShell count={filtered.length}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaSearch className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 w-10">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={String(col.key)}
                      className={`px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 ${col.headerClassName ?? ""}`}
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={rowKey(row, i)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors ${
                      onRowClick ? "cursor-pointer" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                    {columns.map((col) => (
                      <td
                        key={String(col.key)}
                        className={`px-4 py-3 ${
                          col.className ?? "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {col.render
                          ? col.render(row, i)
                          : String(
                              (row as Record<string, unknown>)[col.key as string] ?? "-"
                            )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusTableShell>
    </div>
  );
}

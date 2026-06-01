"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  FaCalendar,
  FaFileExcel,
  FaGasPump,
  FaImage,
  FaMoneyBillWave,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUserTie,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import {
  FIXED_MONTH_MAX,
  FIXED_MONTH_MIN,
  getFixedTodayDate,
  getFixedTodayMonth,
} from "@/lib/fixed-year";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
} from "@/components/status-page-shell";
import { Pagination, toNumber } from "@/components/status-page-helpers";
import { FuelEntryDialog } from "@/components/fuel-entry-dialog";

interface FuelLog {
  id: number;
  fuel_date: string;
  user_code: string | null;
  driver_name: string | null;
  car: string | null;
  doc_no: string | null;
  liters: number | string;
  amount: number | string;
  odometer: number | string | null;
  station: string | null;
  note: string | null;
  lat: string | null;
  lng: string | null;
  has_image: boolean;
  created_at: string;
}

const formatNumber = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const dateLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
};

const endOfMonth = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return getFixedTodayDate();
  const days = new Date(year, m, 0).getDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
};

const monthTitle = (month: string) => {
  const [year, m] = month.split("-");
  if (!year || !m) return monthTitle(getFixedTodayMonth());
  const lastDay = endOfMonth(month).slice(-2).replace(/^0/, "");
  return `ສັງລວມຄ່ານ້ຳມັນ ແຕ່ ວັນທີ 1-${lastDay}/${Number(m)}/${year}`;
};

interface MonthlyFuelRow {
  key: string;
  driver: string;
  code: string;
  car: string;
  station: string;
  days: Record<string, number>;
  totalAmount: number;
  totalLiters: number;
}

export default function FuelPage() {
  const confirm = useConfirm();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [fromDate, setFromDate] = useState(getFixedTodayDate());
  const [toDate, setToDate] = useState(getFixedTodayDate());
  const [monthly, setMonthly] = useState(getFixedTodayMonth());
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [photoOpen, setPhotoOpen] = useState<{
    id: number;
    src: string | null;
    loading: boolean;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const perPage = 20;

  const load = (range = { fromDate, toDate }) => {
    setLoading(true);
    void Actions.getFuelLogs(range)
      .then((data) => {
        setLogs((data ?? []) as FuelLog[]);
        setCurrentPage(1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const k = searchText.trim().toLowerCase();
    if (!k) return logs;
    return logs.filter((r) =>
      [r.driver_name, r.user_code, r.car, r.station, r.doc_no, r.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(k)
    );
  }, [logs, searchText]);

  const summary = useMemo(
    () =>
      filtered.reduce(
        (r, x) => {
          r.entries += 1;
          r.liters += toNumber(x.liters);
          r.amount += toNumber(x.amount);
          return r;
        },
        { entries: 0, liters: 0, amount: 0 }
      ),
    [filtered]
  );

  const monthlyDays = useMemo(() => {
    const [year, m] = monthly.split("-").map(Number);
    if (!year || !m) return [];
    const days = new Date(year, m, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${year}-${String(m).padStart(2, "0")}-${day}`;
    });
  }, [monthly]);

  const monthlyRows = useMemo(() => {
    const map = new Map<string, MonthlyFuelRow>();
    for (const r of filtered) {
      if (!r.fuel_date.startsWith(`${monthly}-`)) continue;
      const driver = r.driver_name || r.user_code || "-";
      const code = r.user_code || "";
      const car = r.car || "";
      const station = r.station || "";
      const key = `${code}::${driver}::${car}::${station}`;
      const row =
        map.get(key) ??
        {
          key,
          driver,
          code,
          car,
          station,
          days: {},
          totalAmount: 0,
          totalLiters: 0,
        };
      const amount = toNumber(r.amount);
      row.days[r.fuel_date] = (row.days[r.fuel_date] ?? 0) + amount;
      row.totalAmount += amount;
      row.totalLiters += toNumber(r.liters);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => {
      const diff = b.totalAmount - a.totalAmount;
      if (diff !== 0) return diff;
      return `${a.driver} ${a.car}`.localeCompare(`${b.driver} ${b.car}`);
    });
  }, [filtered, monthly]);

  const monthlyTotals = useMemo(
    () =>
      monthlyRows.reduce(
        (acc, row) => {
          acc.amount += row.totalAmount;
          acc.liters += row.totalLiters;
          return acc;
        },
        { amount: 0, liters: 0 }
      ),
    [monthlyRows]
  );

  const loadMonthly = () => {
    const nextRange = { fromDate: `${monthly}-01`, toDate: endOfMonth(monthly) };
    setFromDate(nextRange.fromDate);
    setToDate(nextRange.toDate);
    load(nextRange);
  };

  const exportMonthlyReport = () => {
    if (monthlyRows.length === 0) return;
    const header = [
      "ລ/ດ",
      "ລາຍຊື່ຄົນຂັບຣົດປະຈຳ",
      "ລະຫັດ",
      "ທະບຽນຣົດ",
      "ບ່ອນປະຈຳການ",
      ...monthlyDays.map(dateLabel),
      "ລວມເປັນເງິນ (ກີບ)",
      "ລວມລິດ",
    ];
    const rows = monthlyRows.map((row, i) => [
      i + 1,
      row.driver,
      row.code,
      row.car,
      row.station,
      ...monthlyDays.map((day) => row.days[day] || ""),
      row.totalAmount,
      row.totalLiters,
    ]);
    const totalRow = [
      "",
      "ລວມທັງໝົດ",
      "",
      "",
      "",
      ...monthlyDays.map((day) =>
        monthlyRows.reduce((sum, row) => sum + (row.days[day] ?? 0), 0) || ""
      ),
      monthlyTotals.amount,
      monthlyTotals.liters,
    ];
    const sheet = XLSX.utils.aoa_to_sheet([
      [monthTitle(monthly)],
      ["ວັນທີໃສ່ນ້ຳມັນ PTT"],
      header,
      ...rows,
      totalRow,
    ]);
    const totalCols = header.length;
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    ];
    sheet["!cols"] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
      ...monthlyDays.map(() => ({ wch: 11 })),
      { wch: 20 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, monthly);
    XLSX.writeFile(wb, `fuel-monthly_${monthly}.xlsx`);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  const openPhoto = async (id: number) => {
    setPhotoOpen({ id, src: null, loading: true });
    try {
      const data = await Actions.getFuelImage(id);
      setPhotoOpen({ id, src: (data as string | null) ?? null, loading: false });
    } catch (e) {
      console.error(e);
      setPhotoOpen({ id, src: null, loading: false });
    }
  };

  const deleteLog = async (id: number) => {
    if (!await confirm({ title: "ລຶບ", message: "ຢືນຢັນລຶບລາຍການນີ້?", tone: "danger", confirmLabel: "ລຶບ" })) return;
    setDeletingId(id);
    try {
      await Actions.deleteFuelLog(id);
      setLogs((c) => c.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      void confirm({ title: "ຜິດພາດ", message: "ລຶບບໍ່ສຳເລັດ", tone: "warning", single: true });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ບັນທຶກເຕີມນ້ຳມັນ"
        subtitle="ປະຫວັດການເຕີມນ້ຳມັນຂອງລົດ"
        icon={<FaGasPump />}
        tone="orange"
      />

      <StatusStatGrid
        stats={[
          { label: "ລາຍການ", value: summary.entries, icon: <FaGasPump />, tone: "orange" },
          { label: "ລິດທັງໝົດ", value: formatNumber(summary.liters), icon: <FaGasPump />, tone: "amber" },
          { label: "ຍອດເງິນ", value: formatNumber(summary.amount), icon: <FaMoneyBillWave />, tone: "emerald" },
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
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ຄົ້ນຫາຄົນຂັບ, ລົດ, ສະຖານີ..."
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
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              ລາຍງານເດືອນ
            </label>
            <input
              type="month"
              value={monthly}
              min={FIXED_MONTH_MIN}
              max={FIXED_MONTH_MAX}
              onChange={(e) => setMonthly(e.target.value || getFixedTodayMonth())}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <button
            type="button"
            onClick={loadMonthly}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            disabled={loading}
          >
            ເບິ່ງເດືອນ
          </button>
          <button
            type="button"
            onClick={exportMonthlyReport}
            disabled={loading || monthlyRows.length === 0}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-50"
            title="Export to Excel"
          >
            <FaFileExcel size={12} /> Excel
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2"
          >
            <FaPlus size={10} /> ບັນທຶກໃໝ່
          </button>
        </form>
      </StatusControlPanel>

      <div className="glass rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/30 dark:border-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">
              {monthTitle(monthly)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ວັນທີໃສ່ນ້ຳມັນ PTT
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-orange-500/10 px-3 py-1 font-semibold text-orange-700 dark:text-orange-300">
              {monthlyRows.length} ລາຍການ
            </span>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
              {formatNumber(monthlyTotals.amount)} ກີບ
            </span>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 font-semibold text-amber-700 dark:text-amber-300">
              {formatNumber(monthlyTotals.liters)} L
            </span>
          </div>
        </div>
        {monthlyRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            ບໍ່ມີຂໍ້ມູນເຕີມນ້ຳມັນສຳລັບເດືອນນີ້
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[11px]">
              <thead>
                <tr className="bg-white/40 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <th className="sticky left-0 z-10 bg-white/90 dark:bg-[#13211f] px-3 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">
                    ລ/ດ
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[220px]">
                    ລາຍຊື່ຄົນຂັບຣົດປະຈຳ
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">ລະຫັດ</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">ທະບຽນຣົດ</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 min-w-[130px]">
                    ບ່ອນປະຈຳການ
                  </th>
                  {monthlyDays.map((day) => (
                    <th key={day} className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {dateLabel(day)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    ລວມເປັນເງິນ (ກີບ)
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    ລວມລິດ
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row, index) => (
                  <tr
                    key={row.key}
                    className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5"
                  >
                    <td className="sticky left-0 z-10 bg-white/90 dark:bg-[#13211f] px-3 py-2 text-center tabular-nums text-slate-500">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{row.driver}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.code || "-"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.car || "-"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.station || "-"}</td>
                    {monthlyDays.map((day) => (
                      <td key={day} className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {row.days[day] ? formatNumber(row.days[day]) : ""}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                      {formatNumber(row.totalAmount)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-700 dark:text-amber-300 whitespace-nowrap">
                      {formatNumber(row.totalLiters)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StatusTableShell count={filtered.length}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaGasPump className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ຍັງບໍ່ມີບັນທຶກເຕີມນ້ຳມັນ"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນທີ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຄົນຂັບ / ລົດ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ລິດ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຍອດເງິນ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສະຖານີ / ຫມາຍເຫດ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຮູບ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="block font-semibold text-slate-800 dark:text-white">{r.fuel_date}</span>
                          <span className="block text-[11px] text-slate-500">{r.created_at}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        <div className="space-y-1">
                          <p className="font-medium flex items-center gap-1.5">
                            <FaUserTie size={10} className="text-slate-400" />
                            {r.driver_name || r.user_code || "-"}
                          </p>
                          {r.car && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                              <FaTruck size={10} /> {r.car}
                            </p>
                          )}
                          {r.doc_no && (
                            <p className="text-[10px] text-slate-400">{r.doc_no}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {formatNumber(r.liters)}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">L</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatNumber(r.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div className="space-y-1">
                          {r.station && <p className="text-[11px]">{r.station}</p>}
                          {r.odometer !== null && r.odometer !== undefined && (
                            <p className="text-[10px] text-slate-400">
                              ໄມລ: {formatNumber(r.odometer)}
                            </p>
                          )}
                          {r.note && (
                            <p className="text-[10px] text-slate-400 italic">{r.note}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.has_image ? (
                          <button
                            onClick={() => void openPhoto(r.id)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:text-orange-400 dark:hover:bg-orange-500/10 transition-colors"
                            title="ເບິ່ງຮູບ"
                          >
                            <FaImage size={12} />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => void deleteLog(r.id)}
                          disabled={deletingId === r.id}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                          title="ລຶບ"
                        >
                          {deletingId === r.id ? (
                            <FaSpinner className="animate-spin" size={11} />
                          ) : (
                            <FaTrash size={11} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={filtered.length}
              perPage={perPage}
              onChange={setCurrentPage}
            />
          </>
        )}
      </StatusTableShell>

      <FuelEntryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={load}
      />

      {photoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPhotoOpen(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] glass rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPhotoOpen(null)}
              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
            >
              <FaTimes size={14} />
            </button>
            {photoOpen.loading ? (
              <div className="w-[480px] h-[320px] flex items-center justify-center text-slate-300">
                <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດຮູບ...
              </div>
            ) : photoOpen.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoOpen.src}
                alt="ຮູບເຕີມນ້ຳມັນ"
                className="max-w-full max-h-[90vh] object-contain"
              />
            ) : (
              <div className="w-[480px] h-[200px] flex items-center justify-center text-slate-300 text-sm">
                ບໍ່ພົບຮູບ
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

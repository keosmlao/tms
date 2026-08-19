"use client";

// ບັນທຶກຕົ້ນທຶນຂົນສົ່ງ ນອກເໜືອຈາກຄ່ານ້ຳມັນ — ຄ່າແຮງຄົນຂັບ, ຄ່າຜ່ານທາງ,
// ຄ່າສ້ອມແປງ, ຄ່າຈ້າງລົດນອກ, ຄ່າປັບໃໝ.
//
// ຄ່ານ້ຳມັນບໍ່ຢູ່ໜ້ານີ້ໂດຍເຈດຕະນາ — ມັນມີໜ້າຂອງມັນເອງ (/fuel) ພ້ອມການກວດລິດ.
// ຍອດຈາກໜ້ານີ້ໄປລວມຢູ່ພາກ "ຕົ້ນທຶນຂົນສົ່ງ" ຂອງ /reports/bi ໂດຍອັດຕະໂນມັດ.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaPlus,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { TRIP_COST_TYPES, tripCostTypeLabel } from "@/lib/trip-cost-type";
import type { TripCostRow } from "@/lib/trip-cost-types";

const n = (v: number) => Math.round(Number(v) || 0).toLocaleString("en-US");

function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export default function TripCostPage() {
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(() => startOfMonth(getFixedTodayDate()));
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [rows, setRows] = useState<TripCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ຟອມບັນທຶກ
  const [costDate, setCostDate] = useState(() => getFixedTodayDate());
  const [costType, setCostType] = useState(TRIP_COST_TYPES[0].code);
  const [amount, setAmount] = useState("");
  const [car, setCar] = useState("");
  const [docNo, setDocNo] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      setRows((await Actions.listTripCosts(from, to)) as TripCostRow[]);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  }, []);

  // ຊ່ອງວັນທີປ່ຽນເປັນຄູ່ ຈຶ່ງຫ່ວງໄວ້ 350ms ບໍ່ໃຫ້ຍິງ 2 ຮອບ
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(fromDate, toDate);
      return;
    }
    const timer = setTimeout(() => void load(fromDate, toDate), 350);
    return () => clearTimeout(timer);
  }, [load, fromDate, toDate]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await Actions.saveTripCost({
        cost_date: costDate,
        cost_type: costType,
        amount,
        car,
        doc_no: docNo,
        note,
      });
      setAmount("");
      setDocNo("");
      setNote("");
      await load(fromDate, toDate);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError(null);
    try {
      await Actions.deleteTripCost(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ລຶບບໍ່ສຳເລັດ");
    }
  };

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.cost_type, (map.get(r.cost_type) ?? 0) + r.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = useMemo(() => rows.reduce((sum, r) => sum + r.amount, 0), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-lg text-amber-600 dark:text-amber-400">
            <FaMoneyBillWave />
          </span>
          <div>
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">
              ຕົ້ນທຶນຂົນສົ່ງ (ນອກຈາກຄ່ານ້ຳມັນ)
            </h1>
            <p className="text-[11px] text-slate-400">
              ຄ່າແຮງຄົນຂັບ · ຄ່າຜ່ານທາງ · ຄ່າສ້ອມແປງ · ຄ່າຈ້າງລົດນອກ · ຄ່າປັບໃໝ
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={fromDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => {
              if (!e.target.value) return;
              setFromDate(e.target.value);
              if (e.target.value > toDate) setToDate(e.target.value);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          <span className="text-[11px] text-slate-400">ຫາ</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={FIXED_YEAR_END}
            onChange={(e) => e.target.value && setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300">
          <FaExclamationTriangle /> {error}
        </div>
      )}

      {/* ຟອມບັນທຶກ */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:grid-cols-2 xl:grid-cols-6"
      >
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ວັນທີ
          <input
            type="date"
            value={costDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setCostDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-normal dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ປະເພດ
          <select
            value={costType}
            onChange={(e) => setCostType(e.target.value as typeof costType)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-normal dark:border-slate-700 dark:bg-slate-800"
          >
            {TRIP_COST_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ຈຳນວນເງິນ (ກີບ)
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-normal tabular-nums dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ລະຫັດລົດ (ຖ້າມີ)
          <input
            value={car}
            onChange={(e) => setCar(e.target.value)}
            placeholder="ຕົວຢ່າງ 2609"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-normal dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ເລກຖ້ຽວ (ຖ້າມີ)
          <input
            value={docNo}
            onChange={(e) => setDocNo(e.target.value)}
            placeholder="ຕົວຢ່າງ 20260800300"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-normal dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ໝາຍເຫດ
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-normal dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <div className="sm:col-span-2 xl:col-span-6">
          <button
            type="submit"
            disabled={saving || !amount}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? <FaSpinner className="animate-spin" /> : <FaPlus />} ບັນທຶກ
          </button>
        </div>
      </form>

      {/* ສະຫຼຸບ */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-[11px] text-slate-400">ລວມໃນຊ່ວງ</p>
          <p className="text-xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">
            {n(total)} <span className="text-[11px] font-normal text-slate-400">ກີບ</span>
          </p>
        </div>
        {byType.slice(0, 3).map(([type, sum]) => (
          <div
            key={type}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
          >
            <p className="text-[11px] text-slate-400">{tripCostTypeLabel(type)}</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">
              {n(sum)} <span className="text-[11px] font-normal text-slate-400">ກີບ</span>
            </p>
          </div>
        ))}
      </div>

      {/* ລາຍການ */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <table className="w-full min-w-[720px] text-[11px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-3 py-2 font-semibold">ວັນທີ</th>
              <th className="px-3 py-2 font-semibold">ປະເພດ</th>
              <th className="px-3 py-2 text-right font-semibold">ຈຳນວນເງິນ</th>
              <th className="px-3 py-2 font-semibold">ລົດ</th>
              <th className="px-3 py-2 font-semibold">ຖ້ຽວ</th>
              <th className="px-3 py-2 font-semibold">ໝາຍເຫດ</th>
              <th className="px-3 py-2 font-semibold">ຜູ້ບັນທຶກ</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  <FaSpinner className="mr-1.5 inline animate-spin" /> ກຳລັງໂຫຼດ…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  ຍັງບໍ່ມີການບັນທຶກໃນຊ່ວງນີ້
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
              >
                <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                  {r.cost_date}
                </td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                  {tripCostTypeLabel(r.cost_type)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {n(r.amount)}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.car_name || "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.doc_no || "—"}</td>
                <td className="px-3 py-2 max-w-[260px] truncate text-slate-600 dark:text-slate-300" title={r.note}>
                  {r.note || "—"}
                </td>
                <td className="px-3 py-2 text-slate-400">{r.created_by || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    title="ລຶບ"
                    className="rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <FaTrash size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-slate-400">
        ຍອດເຫຼົ່ານີ້ໄປລວມຢູ່ພາກ “ຕົ້ນທຶນຂົນສົ່ງ” ຂອງລາຍງານ /reports/bi ໂດຍອັດຕະໂນມັດ —
        ວັນທີ {today} ເປັນຄ່າເລີ່ມຕົ້ນຂອງຟອມ.
      </p>
    </div>
  );
}

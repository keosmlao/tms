"use client";

// ── ລາຍງານ COD ຕໍ່ຄົນຂັບ ──────────────────────────────────────────────────
//
// ຕອບ: ຄົນຂັບແຕ່ລະຄົນຮັບຜິດຊອບເງິນເທົ່າໃດ ໃນຊ່ວງເວລານີ້ ແລະ ບັນທຶກຄົບບໍ.
// ຕ່າງຈາກໜ້າ /cod (ກະທົບຍອດເປັນລາຍຖ້ຽວ) — ໜ້ານີ້ເປັນພາບລວມຕໍ່ຄົນ.
//
// ⚠️ ສ່ວນຕ່າງ (variance) ນັບສະເພາະບິນທີ່ **ບັນທຶກການເກັບເງິນແລ້ວ** ຈຶ່ງບໍ່ໄປ
// ກ່າວໂທດຄົນຂັບສຳລັບບິນທີ່ພຽງແຕ່ຍັງບໍ່ໄດ້ບັນທຶກ — ບິນເຫຼົ່ານັ້ນນັບຢູ່ຊ່ອງ
// "ຍັງບໍ່ບັນທຶກ" ຕ່າງຫາກ.

import { useCallback, useEffect, useMemo, useState } from "react";
import { FaCoins, FaSpinner, FaExclamationTriangle } from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { userErrorMessage } from "@/lib/action-error";

interface CodDriverRow {
  driver_name: string;
  driver_code: string;
  trip_count: number;
  cod_bill_count: number;
  expected_total: string | number;
  collected_total: string | number;
  transfer_total: string | number;
  cash_total: string | number;
  pending_count: number;
  recorded_expected_total: string | number;
  variance_total: string | number;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const kip = (v: unknown) => num(v).toLocaleString("en-US");

function clampToFixedYear(day: string): string {
  if (day < FIXED_YEAR_START) return FIXED_YEAR_START;
  if (day > FIXED_YEAR_END) return FIXED_YEAR_END;
  return day;
}

export default function CodByDriverReport() {
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<CodDriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await Actions.getCodByDriver(fromDate, toDate)) as CodDriverRow[];
      setRows(data ?? []);
    } catch (e) {
      console.error(e);
      setError(userErrorMessage(e, String(e)));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          expected: acc.expected + num(r.expected_total),
          collected: acc.collected + num(r.collected_total),
          cash: acc.cash + num(r.cash_total),
          transfer: acc.transfer + num(r.transfer_total),
          pending: acc.pending + num(r.pending_count),
          variance: acc.variance + num(r.variance_total),
        }),
        { expected: 0, collected: 0, cash: 0, transfer: 0, pending: 0, variance: 0 }
      ),
    [rows]
  );

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <FaCoins className="text-amber-500" /> ລາຍງານ COD ຕາມຄົນຂັບ
        </h1>
      </header>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ແຕ່ວັນທີ
          <input
            type="date"
            value={fromDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setFromDate(clampToFixedYear(e.target.value))}
            className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ຫາວັນທີ
          <input
            type="date"
            value={toDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setToDate(clampToFixedYear(e.target.value))}
            className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
      </div>

      {error && (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {totals.pending > 0 && !loading && (
        <p className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <FaExclamationTriangle size={11} />
          ມີ {totals.pending} ບິນ COD ທີ່ສົ່ງແລ້ວແຕ່ຍັງບໍ່ໄດ້ບັນທຶກການເກັບເງິນ — ຍອດ "ເກັບໄດ້" ຈຶ່ງຍັງບໍ່ຄົບ
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">ຄົນຂັບ</th>
              <th className="px-3 py-2 text-right">ຖ້ຽວ</th>
              <th className="px-3 py-2 text-right">ບິນ COD</th>
              <th className="px-3 py-2 text-right">ຕ້ອງເກັບ</th>
              <th className="px-3 py-2 text-right">ເກັບໄດ້</th>
              <th className="px-3 py-2 text-right">ເງິນສົດ</th>
              <th className="px-3 py-2 text-right">ໂອນ</th>
              <th className="px-3 py-2 text-right">ຍັງບໍ່ບັນທຶກ</th>
              <th className="px-3 py-2 text-right">ສ່ວນຕ່າງ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  <FaSpinner className="mr-2 inline animate-spin text-teal-500" /> ກຳລັງໂຫຼດ...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  ບໍ່ມີບິນເກັບເງິນປາຍທາງໃນຊ່ວງນີ້
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const variance = num(r.variance_total);
                return (
                  <tr key={r.driver_code || r.driver_name} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                      {r.driver_name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {r.trip_count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {r.cod_bill_count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {kip(r.expected_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                      {kip(r.collected_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      {kip(r.cash_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-400">
                      {kip(r.transfer_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {num(r.pending_count) > 0 ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          {r.pending_count}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-bold ${
                        variance < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : variance > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-400"
                      }`}
                    >
                      {variance === 0 ? "—" : kip(variance)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && !loading && (
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-900">
              <tr>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200" colSpan={3}>
                  ລວມ
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{kip(totals.expected)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{kip(totals.collected)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {kip(totals.cash)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-400">
                  {kip(totals.transfer)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.pending}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totals.variance === 0 ? "—" : kip(totals.variance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

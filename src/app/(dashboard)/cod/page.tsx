"use client";

// ── ໜ້າກະທົບຍອດເງິນ COD (ເກັບເງິນປາຍທາງ) ────────────────────────────────────
//
// ຄຳຖາມທີ່ໜ້ານີ້ຕອບ: **ເງິນສົດຢູ່ໃນມືຄົນຂັບຄົນໃດແດ່ ແລະ ເທົ່າໃດ**
//
// 1 ແຖວ = 1 ຖ້ຽວທີ່ມີບິນ COD. ຖ້ຽວທີ່ຍັງບໍ່ໄດ້ມອບເງິນຂຶ້ນກ່ອນສະເໝີ (ນັ້ນຄື
// ວຽກທີ່ຄ້າງ) ແລ້ວການເງິນກົດ "ຮັບເງິນ" ພ້ອມນັບຍອດຈິງຕໍ່ໜ້າຄົນຂັບ. ຍອດທີ່ນັບ
// ໄດ້ຕ່າງຈາກທີ່ລະບົບຄິດ → ບັງຄັບໃສ່ເຫດຜົນ (ກົດຢູ່ queries/cod.js).
//
// ໝາຍເຫດ: ການເງິນຮັບສະເພາະ **ເງິນສົດ** — ສ່ວນທີ່ລູກຄ້າໂອນເຂົ້າບັນຊີບໍ່ໄດ້
// ຜ່ານມືຄົນຂັບ ຈຶ່ງບໍ່ນັບເປັນເງິນທີ່ຕ້ອງມອບ.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCoins,
  FaSpinner,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUndo,
  FaSearch,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";

interface CodTripRow {
  doc_no: string;
  date_logistic: string;
  date_logistic_iso: string;
  driver_name: string;
  driver_code: string;
  car_name: string;
  transport_code: string;
  transport_name: string;
  job_status: number;
  cod_bill_count: number;
  expected_total: string | number;
  collected_total: string | number;
  cash_total: string | number;
  transfer_total: string | number;
  pending_count: number;
  short_count: number;
  variance_total: string | number;
  handed_over: boolean;
  counted_amount: string | number;
  received_by: string;
  received_at: string | null;
  handover_variance_reason: string;
}

interface CodTotals {
  trip_count: number;
  expected_total: number;
  collected_total: number;
  cash_total: number;
  transfer_total: number;
  pending_count: number;
  outstanding_cash: number;
  handed_over_count: number;
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

export default function CodPage() {
  // getFixedTodayDate ອ່ານນາລິກາລາວ ແລະ ຕຶງຢູ່ໃນປີທີ່ປັກໄວ້ແລ້ວ
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [onlyOutstanding, setOnlyOutstanding] = useState(true);
  const [rows, setRows] = useState<CodTripRow[]>([]);
  const [totals, setTotals] = useState<CodTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [handoverFor, setHandoverFor] = useState<CodTripRow | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await Actions.getCodReconciliation(
        fromDate,
        toDate,
        onlyOutstanding
      )) as { rows: CodTripRow[]; totals: CodTotals };
      setRows(data?.rows ?? []);
      setTotals(data?.totals ?? null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, onlyOutstanding]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.doc_no, r.driver_name, r.car_name, r.transport_name]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <FaCoins className="text-amber-500" /> ກະທົບຍອດເງິນ COD
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          ເງິນສົດທີ່ຄົນຂັບເກັບມາ ແລະ ຍັງບໍ່ໄດ້ມອບໃຫ້ການເງິນ
        </p>
      </header>

      {/* ຕົວກອງ */}
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
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={onlyOutstanding}
            onChange={(e) => setOnlyOutstanding(e.target.checked)}
            className="accent-teal-600"
          />
          ສະເພາະທີ່ຍັງບໍ່ໄດ້ມອບເງິນ
        </label>
        <div className="relative ml-auto">
          <FaSearch className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ຄົ້ນຫາ ຖ້ຽວ / ຄົນຂັບ / ລົດ"
            className="rounded border border-slate-300 py-1 pl-7 pr-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      {/* ສະຫຼຸບ */}
      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="ຖ້ຽວມີ COD" value={String(totals.trip_count)} />
          <StatTile label="ຕ້ອງເກັບ" value={kip(totals.expected_total)} suffix="ກີບ" />
          <StatTile label="ເກັບໄດ້" value={kip(totals.collected_total)} suffix="ກີບ" />
          <StatTile
            label="ເງິນສົດຄ້າງມອບ"
            value={kip(totals.outstanding_cash)}
            suffix="ກີບ"
            tone={totals.outstanding_cash > 0 ? "warn" : "ok"}
          />
          <StatTile
            label="ບິນຍັງບໍ່ບັນທຶກ"
            value={String(totals.pending_count)}
            tone={totals.pending_count > 0 ? "warn" : "ok"}
          />
        </div>
      )}

      {error && (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* ຕາຕະລາງ */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">ຖ້ຽວ</th>
              <th className="px-3 py-2 text-left">ວັນທີ</th>
              <th className="px-3 py-2 text-left">ຄົນຂັບ / ລົດ</th>
              <th className="px-3 py-2 text-right">ບິນ COD</th>
              <th className="px-3 py-2 text-right">ຕ້ອງເກັບ</th>
              <th className="px-3 py-2 text-right">ເກັບໄດ້</th>
              <th className="px-3 py-2 text-right">ເງິນສົດ</th>
              <th className="px-3 py-2 text-right">ໂອນ</th>
              <th className="px-3 py-2 text-center">ສະຖານະ</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  <FaSpinner className="mr-2 inline animate-spin text-teal-500" /> ກຳລັງໂຫຼດ...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  {onlyOutstanding
                    ? "ບໍ່ມີເງິນຄ້າງມອບໃນຊ່ວງນີ້ 🎉"
                    : "ບໍ່ມີຖ້ຽວທີ່ມີບິນເກັບເງິນປາຍທາງ"}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const variance = num(row.variance_total);
                return (
                  <tr key={row.doc_no} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-100">
                      {row.doc_no}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {row.date_logistic}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">
                        {row.driver_name || "-"}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {row.car_name} · {row.transport_name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {row.cod_bill_count}
                      {row.pending_count > 0 && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          ຄ້າງ {row.pending_count}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {kip(row.expected_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                      {kip(row.collected_total)}
                      {variance !== 0 && (
                        <div
                          className={`text-[10px] font-bold ${
                            variance < 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {variance < 0 ? "ຂາດ" : "ເກີນ"} {kip(Math.abs(variance))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      {kip(row.cash_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-400">
                      {kip(row.transfer_total)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.handed_over ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          title={`ຮັບໂດຍ ${row.received_by} · ${row.received_at ?? ""}${
                            row.handover_variance_reason ? ` · ${row.handover_variance_reason}` : ""
                          }`}
                        >
                          <FaCheckCircle size={9} /> ມອບແລ້ວ {kip(row.counted_amount)}
                        </span>
                      ) : row.pending_count > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          ຍັງສົ່ງບໍ່ຄົບ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          <FaExclamationTriangle size={9} /> ຄ້າງມອບ
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.handed_over ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`ຍົກເລີກການມອບເງິນຂອງຖ້ຽວ ${row.doc_no}?`)) return;
                            try {
                              await Actions.deleteCodHandover(row.doc_no);
                              await fetchRows();
                            } catch (e) {
                              window.alert(e instanceof Error ? e.message : String(e));
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <FaUndo size={9} /> ຍົກເລີກ
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={row.pending_count > 0}
                          onClick={() => setHandoverFor(row)}
                          title={
                            row.pending_count > 0
                              ? "ຍັງມີບິນທີ່ຄົນຂັບບໍ່ທັນບັນທຶກການເກັບເງິນ"
                              : undefined
                          }
                          className="inline-flex items-center gap-1 rounded bg-teal-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FaCoins size={9} /> ຮັບເງິນ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {handoverFor && (
        <HandoverDialog
          row={handoverFor}
          onClose={() => setHandoverFor(null)}
          onSaved={async () => {
            setHandoverFor(null);
            await fetchRows();
          }}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  tone = "neutral",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-slate-800 dark:text-slate-100";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-base font-bold tabular-nums ${toneClass}`}>
        {value}
        {suffix && <span className="ml-1 text-[10px] font-normal text-slate-500">{suffix}</span>}
      </p>
    </div>
  );
}

// ກ່ອງຮັບເງິນ: ຍອດທີ່ຄວນມອບ = ເງິນສົດເທົ່ານັ້ນ (ສ່ວນທີ່ໂອນບໍ່ໄດ້ຜ່ານມືຄົນຂັບ).
function HandoverDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CodTripRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const expected = num(row.cash_total);
  const [counted, setCounted] = useState(String(expected));
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countedNum = num(counted);
  const diff = countedNum - expected;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await Actions.recordCodHandover({
        doc_no: row.doc_no,
        counted_amount: countedNum,
        variance_reason: reason.trim() || null,
        remark: remark.trim() || null,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <FaCoins className="text-amber-500" /> ຮັບເງິນສົດຈາກຄົນຂັບ
        </h2>
        <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
          ຖ້ຽວ <span className="font-mono font-bold">{row.doc_no}</span> · {row.driver_name}
        </p>

        <dl className="mb-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-800 dark:bg-slate-950">
          <Row label="ເກັບໄດ້ທັງໝົດ" value={`${kip(row.collected_total)} ກີບ`} />
          <Row label="ໃນນັ້ນ ໂອນເຂົ້າບັນຊີ" value={`${kip(row.transfer_total)} ກີບ`} />
          <Row
            label="ເງິນສົດທີ່ຕ້ອງມອບ"
            value={`${kip(expected)} ກີບ`}
            strong
          />
        </dl>

        <label className="mb-2 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ຍອດທີ່ນັບໄດ້ຈິງ (ກີບ)
          <input
            type="number"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        {diff !== 0 && (
          <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="mb-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
              {diff < 0 ? "ເງິນຂາດ" : "ເງິນເກີນ"} {kip(Math.abs(diff))} ກີບ — ຕ້ອງລະບຸເຫດຜົນ
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ເຫດຜົນ"
              className="w-full rounded border border-amber-300 px-2 py-1 text-xs dark:border-amber-800 dark:bg-slate-950"
            />
          </div>
        )}

        <label className="mb-3 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          ໝາຍເຫດ (ບໍ່ບັງຄັບ)
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        {error && (
          <p className="mb-2 rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ຍົກເລີກ
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving && <FaSpinner className="animate-spin" size={10} />} ຢືນຢັນຮັບເງິນ
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`tabular-nums ${
          strong ? "font-bold text-slate-800 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

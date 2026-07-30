"use client";

import { useEffect, useState } from "react";
import {
  FaCheck,
  FaExclamationTriangle,
  FaPlus,
  FaRulerCombined,
  FaSpinner,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusTableShell } from "@/components/status-page-shell";
import { useConfirm } from "@/components/confirm-dialog";
import { pipeM3 } from "@/lib/pipe-name";

interface PipeDim {
  size_key: string;
  label: string;
  od_mm: number | string;
  length_m: number | string;
  packing_factor: number | string;
  sort_order: number | string;
  note: string | null;
  source: string;
  m3_per_pipe: number | string | null;
  updated_by?: string | null;
}

interface Coverage {
  days: number;
  totalItems: number;
  totalLines: number;
  resolvedItems: number;
  resolvedLines: number;
  unresolved: Array<{
    itemCode: string;
    itemName: string;
    unitCode: string;
    lines: number;
    reason: string;
  }>;
}

const EMPTY: PipeDim = {
  size_key: "",
  label: "",
  od_mm: "",
  length_m: 4,
  packing_factor: 0.9,
  sort_order: 0,
  note: "",
  source: "confirmed",
  m3_per_pipe: null,
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function PipeSizesPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<PipeDim[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PipeDim | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dims, cov] = await Promise.all([
        Actions.listPipeDims() as Promise<PipeDim[]>,
        Actions.getPipeCoverage(90, 30) as Promise<Coverage>,
      ]);
      setRows(dims ?? []);
      setCoverage(cov ?? null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const sizeKey = editing.size_key.trim();
    if (!/^(in|mm):\d+(\.\d+)?$/.test(sizeKey)) {
      setError("ລະຫັດຂະໜາດຕ້ອງເປັນຮູບແບບ in:1.25 ຫຼື mm:25");
      return;
    }
    if (!editing.label.trim()) {
      setError("ກະລຸນາໃສ່ປ້າຍຊື່ຂະໜາດ");
      return;
    }
    const od = num(editing.od_mm);
    const len = num(editing.length_m);
    const factor = num(editing.packing_factor) ?? 0.9;
    if (!od || od <= 0) {
      setError("ຂະໜາດນອກ (OD) ຕ້ອງຫຼາຍກວ່າ 0");
      return;
    }
    if (!len || len <= 0) {
      setError("ຄວາມຍາວຕ້ອງຫຼາຍກວ່າ 0");
      return;
    }
    if (factor <= 0 || factor > 1) {
      setError("ຄ່າວາງແຊກ ຕ້ອງຢູ່ລະຫວ່າງ 0 ຫາ 1");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await Actions.upsertPipeDim({
        size_key: sizeKey,
        label: editing.label.trim(),
        od_mm: od,
        length_m: len,
        packing_factor: factor,
        sort_order: num(editing.sort_order) ?? 0,
        note: editing.note?.trim() || null,
      });
      setEditing(null);
      await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: PipeDim) => {
    if (
      !(await confirm({
        title: "ລຶບຂະໜາດທໍ່",
        message: `ລຶບຂະໜາດ "${row.label}" ? ທໍ່ຂະໜາດນີ້ຈະຄິດພື້ນທີ່ບໍ່ໄດ້ອີກ`,
        tone: "danger",
        confirmLabel: "ລຶບ",
      }))
    ) {
      return;
    }
    try {
      await Actions.deletePipeDim(row.size_key);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const coveragePct =
    coverage && coverage.totalLines > 0
      ? (coverage.resolvedLines / coverage.totalLines) * 100
      : null;

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຂະໜາດທໍ່ (ຄິດຕາມສູດ)"
        subtitle="ທໍ່ບໍ່ຕ້ອງວັດເປັນລາຍການ — ຂະໜາດນອກ (OD) ແລະ ຄວາມຍາວເປັນມາດຕະຖານ ຕາຕະລາງນີ້ຈຶ່ງຄຸມທໍ່ໄດ້ຫຼາຍຮ້ອຍລາຍການ"
        icon={<FaRulerCombined />}
        tone="teal"
        aside={
          <button
            type="button"
            onClick={() => setEditing({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-teal-800"
          >
            <FaPlus size={11} /> ເພີ່ມຂະໜາດ
          </button>
        }
      />

      {/* ຄວາມຄຸມ — ບອກວ່າສູດນີ້ຄິດໄດ້ຈັກ % ຂອງແຖວທໍ່ຈິງ */}
      {coverage && (
        <div className="glass rounded-lg p-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ຄິດພື້ນທີ່ທໍ່ໄດ້ ({coverage.days} ວັນຜ່ານມາ)
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                {coveragePct !== null ? `${coveragePct.toFixed(1)}%` : "—"}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {coverage.resolvedLines.toLocaleString()} /{" "}
                  {coverage.totalLines.toLocaleString()} ແຖວ
                </span>
              </p>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              ລາຍການທໍ່ {coverage.resolvedItems} / {coverage.totalItems} ລາຍການ
            </div>
          </div>

          {coverage.unresolved.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <FaExclamationTriangle className="inline mr-1" size={10} />
                ຍັງຄິດບໍ່ໄດ້ {coverage.unresolved.length} ລາຍການ — ກົດເບິ່ງເຫດຜົນ
              </summary>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-slate-500/5">
                <table className="w-full text-[11px]">
                  <tbody>
                    {coverage.unresolved.map((u) => (
                      <tr key={u.itemCode} className="border-b border-slate-200/20 dark:border-white/5">
                        <td className="px-3 py-1.5 tabular-nums text-slate-400 w-12">{u.lines}</td>
                        <td className="px-3 py-1.5 text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          {u.reason}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{u.itemName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
                ອັນທີ່ບອກວ່າ &quot;ຍັງບໍ່ມີຂະໜາດ ... ໃນຕາຕະລາງ&quot; ແກ້ໄດ້ໂດຍກົດ
                &quot;ເພີ່ມຂະໜາດ&quot; ແລ້ວໃສ່ລະຫັດນັ້ນ. ອັນທີ່ຄວາມຍາວບໍ່ແນ່ນອນ (ທໍ່ສັ້ນ,
                ທໍ່ມ້ວນ) ຕ້ອງໄປວັດເປັນລາຍການແທນ — ລະບົບຈະບໍ່ເດົາໃຫ້.
              </p>
            </details>
          )}
        </div>
      )}

      <StatusTableShell count={rows.length}>
        {loading ? (
          <div className="py-14 flex items-center justify-center text-slate-400 text-sm">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-sm">
            ຍັງບໍ່ມີຂະໜາດທໍ່ — ກົດ &quot;ເພີ່ມຂະໜາດ&quot; ເພື່ອເລີ່ມ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຂະໜາດ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລະຫັດ</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">OD (mm)</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຍາວ (m)</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ວາງແຊກ</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">m³/ເສັ້ນ</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.size_key}
                    className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer"
                    onClick={() => setEditing({ ...r, note: r.note ?? "" })}
                  >
                    <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">{r.label}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{r.size_key}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600 dark:text-slate-300">
                      {num(r.od_mm)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600 dark:text-slate-300">
                      {num(r.length_m)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                      {num(r.packing_factor)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums font-semibold text-teal-700 dark:text-teal-400">
                      {(num(r.m3_per_pipe) ?? 0).toFixed(5)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.source === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <FaCheck size={9} /> ຢືນຢັນແລ້ວ
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          title="ຄ່າມາດຕະຖານ ມອກ.17 ທີ່ລະບົບໃສ່ໃຫ້ — ຄວນກວດກັບທໍ່ທີ່ຮ້ານຂາຍຈິງ"
                        >
                          ມາດຕະຖານ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(r);
                        }}
                        className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center"
                        title="ລຶບ"
                      >
                        <FaTrash size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusTableShell>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setEditing(null)}
        >
          <div
            className="glass rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                {rows.some((x) => x.size_key === editing.size_key) ? "ແກ້ໄຂຂະໜາດທໍ່" : "ເພີ່ມຂະໜາດທໍ່"}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
              >
                <FaTimes size={12} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    ລະຫັດຂະໜາດ
                  </label>
                  <input
                    type="text"
                    value={editing.size_key}
                    onChange={(e) => setEditing({ ...editing, size_key: e.target.value })}
                    disabled={rows.some((x) => x.size_key === editing.size_key)}
                    placeholder="in:1.25 ຫຼື mm:25"
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200 disabled:opacity-60"
                  />
                  <p className="mt-1 text-[9px] text-slate-400">
                    ນີ້ວໃຊ້ເລກທົດ: 1 1/4&quot; → in:1.25
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    ປ້າຍຊື່
                  </label>
                  <input
                    type="text"
                    value={editing.label}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    placeholder={'1 1/4"'}
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    OD (mm)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={editing.od_mm}
                    onChange={(e) => setEditing({ ...editing, od_mm: e.target.value })}
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs tabular-nums text-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    ຍາວ (m)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={editing.length_m}
                    onChange={(e) => setEditing({ ...editing, length_m: e.target.value })}
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs tabular-nums text-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label
                    className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1"
                    title="ທໍ່ມົນວາງແຊກກັນໄດ້ແໜ້ນກວ່າກ່ອງສີ່ຫຼ່ຽມ — ຄ່າເລີ່ມຕົ້ນ 0.9"
                  >
                    ວາງແຊກ
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step="0.05"
                    value={editing.packing_factor}
                    onChange={(e) => setEditing({ ...editing, packing_factor: e.target.value })}
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs tabular-nums text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  ບັນທຶກ (ບໍ່ບັງຄັບ)
                </label>
                <input
                  type="text"
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="ເຊັ່ນ ທໍ່ທອງແດງ ຂາຍເປັນມ້ວນ 15 ແມັດ"
                  className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                />
              </div>

              {(() => {
                const preview = pipeM3(
                  num(editing.od_mm),
                  num(editing.length_m),
                  num(editing.packing_factor)
                );
                if (preview === null) return null;
                return (
                  <p className="rounded-lg bg-slate-500/5 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                    ທໍ່ 1 ເສັ້ນກິນທີ່{" "}
                    <span className="font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      {preview.toFixed(5)} m³
                    </span>
                    <span className="ml-2 text-[10px] text-slate-400">
                      (ລົດ 6 ລໍ້ ບັນທຸກ 17.64 m³ ≈ {Math.floor(17.64 / preview).toLocaleString()} ເສັ້ນ)
                    </span>
                  </p>
                );
              })()}

              <p className="text-[10px] text-slate-400 leading-relaxed">
                ຄິດຈາກກ່ອງສີ່ຫຼ່ຽມຫຸ້ມທໍ່ (OD × OD × ຍາວ) ຄູນຄ່າວາງແຊກ ບໍ່ແມ່ນປະລິມາດ
                ຮູຊົງກະບອກ ເພາະຕອນວາງຊ້ອນໃນລົດ ທໍ່ກິນທີ່ເທົ່າກ່ອງຫຸ້ມ.
              </p>

              {error && <p className="text-[11px] text-rose-500">{error}</p>}
            </div>

            <div className="px-5 py-3 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={() => void save()}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <FaSpinner className="animate-spin" size={11} /> ກຳລັງບັນທຶກ...
                  </>
                ) : (
                  "ບັນທຶກ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaFileImport,
  FaCheck,
  FaSpinner,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusTableShell } from "@/components/status-page-shell";
import { useConfirm } from "@/components/confirm-dialog";
import { userErrorMessage } from "@/lib/action-error";

interface PackDim {
  roworder: number;
  family: string;
  size_key: string | null;
  pack_unit: string | null;
  pack_qty: number | string | null;
  width_cm: number | string | null;
  length_cm: number | string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  note: string | null;
  pack_m3: number | string | null;
  piece_m3: number | string | null;
  updated_by?: string | null;
}

interface WorkItem {
  itemCode: string;
  itemName: string;
  unitCode: string;
  family: string;
  sizeKey: string | null;
  label: string | null;
  packQty: number | null;
  packUnit: string | null;
  lines: number;
  familyLines: number;
  status: "estimated" | "unknown";
}

interface Coverage {
  days: number;
  totalItems: number;
  totalLines: number;
  measuredItems: number;
  measuredLines: number;
  estimatedItems: number;
  estimatedLines: number;
  worklist: WorkItem[];
}

interface MeasureForm {
  roworder: number | null;
  family: string;
  size_key: string;
  size_label: string;
  pack_unit: string;
  pack_qty: string;
  width_cm: string;
  length_cm: string;
  height_cm: string;
  weight_kg: string;
  note: string;
  measured_item_code: string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const boxM3 = (w: unknown, l: unknown, h: unknown): number | null => {
  const a = num(w);
  const b = num(l);
  const c = num(h);
  if (!a || !b || !c) return null;
  return (a * b * c) / 1_000_000;
};

const TAB_LABEL = {
  todo: "ຄວນວັດຕໍ່ໄປ",
  measured: "ວັດແລ້ວ",
} as const;

export default function PackSizesPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<PackDim[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<keyof typeof TAB_LABEL>("todo");
  const [form, setForm] = useState<MeasureForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dims, cov] = await Promise.all([
        Actions.listPackDims() as Promise<PackDim[]>,
        Actions.getPackCoverage(90, 60) as Promise<Coverage>,
      ]);
      setRows(dims ?? []);
      setCoverage(cov ?? null);
    } catch (e) {
      console.error(e);
      setError(userErrorMessage(e, "ໂຫຼດບໍ່ສຳເລັດ"));
    } finally {
      setLoading(false);
    }
  };

  // ເປີດຟອມຈາກລາຍການໃນບັນຊີວຽກ — ຕະກຸນ/ຂະໜາດ/ຈຳນວນ ຕື່ມໃຫ້ຈາກຊື່ແລ້ວ
  const measureFromWork = (item: WorkItem) => {
    setError(null);
    setForm({
      roworder: null,
      family: item.family,
      size_key: item.sizeKey ?? "",
      size_label: item.label ?? "ທຸກຂະໜາດ",
      pack_unit: item.packUnit ?? "",
      pack_qty: item.packQty ? String(item.packQty) : "",
      width_cm: "",
      length_cm: "",
      height_cm: "",
      weight_kg: "",
      note: "",
      measured_item_code: item.itemCode,
    });
  };

  const editRow = (row: PackDim) => {
    setError(null);
    setForm({
      roworder: row.roworder,
      family: row.family,
      size_key: row.size_key ?? "",
      size_label: row.size_key ?? "ທຸກຂະໜາດ",
      pack_unit: row.pack_unit ?? "",
      pack_qty: row.pack_qty ? String(row.pack_qty) : "",
      width_cm: row.width_cm ? String(row.width_cm) : "",
      length_cm: row.length_cm ? String(row.length_cm) : "",
      height_cm: row.height_cm ? String(row.height_cm) : "",
      weight_kg: row.weight_kg ? String(row.weight_kg) : "",
      note: row.note ?? "",
      measured_item_code: "",
    });
  };

  const save = async () => {
    if (!form) return;
    if (!form.family.trim()) {
      setError("ບໍ່ມີຕະກຸນ — ເປີດຈາກບັນຊີວຽກເພື່ອໃຫ້ຕື່ມໃຫ້ອັດຕະໂນມັດ");
      return;
    }
    const qty = num(form.pack_qty);
    if (!qty || qty <= 0) {
      setError("ຈຳນວນຕໍ່ຫີບຕ້ອງຫຼາຍກວ່າ 0");
      return;
    }
    for (const [key, label] of [
      ["width_cm", "ກວ້າງ"],
      ["length_cm", "ຍາວ"],
      ["height_cm", "ສູງ"],
    ] as const) {
      const v = num(form[key]);
      if (!v || v <= 0) {
        setError(`${label} ຕ້ອງຫຼາຍກວ່າ 0`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      await Actions.upsertPackDim({
        family: form.family.trim(),
        size_key: form.size_key.trim() || null,
        pack_unit: form.pack_unit.trim() || null,
        pack_qty: qty,
        width_cm: num(form.width_cm)!,
        length_cm: num(form.length_cm)!,
        height_cm: num(form.height_cm)!,
        weight_kg: num(form.weight_kg),
        note: form.note.trim() || null,
        measured_item_code: form.measured_item_code.trim() || null,
      });
      setForm(null);
      await load();
    } catch (e) {
      console.error(e);
      setError(userErrorMessage(e, "ບັນທຶກບໍ່ສຳເລັດ"));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: PackDim) => {
    if (
      !(await confirm({
        title: "ລຶບຂະໜາດຫີບ",
        message: `ລຶບ "${row.family} ${row.size_key ?? ""}" ? ຂະໜາດອື່ນໃນຕະກຸນນີ້ອາດຄາດຄະເນບໍ່ໄດ້ອີກ`,
        tone: "danger",
        confirmLabel: "ລຶບ",
      }))
    ) {
      return;
    }
    try {
      await Actions.deletePackDim(row.roworder);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const pct = (value: number) =>
    coverage && coverage.totalLines > 0 ? (value / coverage.totalLines) * 100 : 0;

  const unknownLines = coverage
    ? coverage.totalLines - coverage.measuredLines - coverage.estimatedLines
    : 0;

  // ຈັດບັນຊີວຽກເປັນຕະກຸນ ເພື່ອໃຫ້ເຫັນວ່າວັດຕະກຸນໃດຄຸ້ມສຸດ
  const workByFamily = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const item of coverage?.worklist ?? []) {
      const list = map.get(item.family) ?? [];
      list.push(item);
      map.set(item.family, list);
    }
    return [...map.entries()].sort(
      (a, b) => (b[1][0]?.familyLines ?? 0) - (a[1][0]?.familyLines ?? 0)
    );
  }, [coverage]);

  const formM3 = form ? boxM3(form.width_cm, form.length_cm, form.height_cm) : null;
  const formQty = form ? num(form.pack_qty) : null;

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຂະໜາດຫີບ (ຂໍ້ຕໍ່/ອຸປະກອນ)"
        subtitle="ວັດ 1 ຫີບ ໄດ້ 2 ຄ່າພ້ອມກັນ — ຕໍ່ຫີບ ແລະ ຕໍ່ຕົວ. ວັດຂະໜາດໜຶ່ງແລ້ວ ຂະໜາດອື່ນໃນຕະກຸນດຽວກັນຄາດຄະເນໄດ້"
        icon={<FaBoxOpen />}
        tone="teal"
        aside={
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-teal-800"
          >
            <FaFileImport size={11} /> ນຳເຂົ້າສະເປັກໂຮງງານ
          </button>
        }
      />

      {coverage && (
        <div className="glass rounded-lg p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            ຄິດພື້ນທີ່ໄດ້ ({coverage.days} ວັນຜ່ານມາ · ບໍ່ນັບທໍ່)
          </p>

          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-500/10">
            <div
              className="bg-emerald-500"
              style={{ width: `${pct(coverage.measuredLines)}%` }}
              title={`ວັດແລ້ວ ${coverage.measuredLines} ແຖວ`}
            />
            <div
              className="bg-amber-400"
              style={{ width: `${pct(coverage.estimatedLines)}%` }}
              title={`ຄາດຄະເນ ${coverage.estimatedLines} ແຖວ`}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400">
              ● ວັດແລ້ວ{" "}
              <span className="font-bold tabular-nums">
                {pct(coverage.measuredLines).toFixed(1)}%
              </span>{" "}
              <span className="text-slate-400">({coverage.measuredLines.toLocaleString()} ແຖວ)</span>
            </span>
            <span className="text-amber-600 dark:text-amber-400">
              ● ຄາດຄະເນ{" "}
              <span className="font-bold tabular-nums">
                {pct(coverage.estimatedLines).toFixed(1)}%
              </span>{" "}
              <span className="text-slate-400">
                ({coverage.estimatedLines.toLocaleString()} ແຖວ)
              </span>
            </span>
            <span className="text-slate-500">
              ● ຍັງບໍ່ຮູ້{" "}
              <span className="font-bold tabular-nums">{pct(unknownLines).toFixed(1)}%</span>{" "}
              <span className="text-slate-400">({unknownLines.toLocaleString()} ແຖວ)</span>
            </span>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            &quot;ຄາດຄະເນ&quot; = ຕະກຸນນີ້ວັດຂະໜາດອື່ນໄວ້ແລ້ວ ຈຶ່ງຂະຫຍາຍຕາມຂະໜາດ (ຂໍ້ຕໍ່ຮູບຊົງ
            ຄືກັນ ປະລິມານ ∝ ຂະໜາດ³). ວັດ 2 ຂະໜາດຕໍ່ຕະກຸນ ຈະໄດ້ຄ່າແມ່ນຂຶ້ນ ເພາະຫາເລກກຳລັງຈາກ
            ຂໍ້ມູນຈິງແທນການສົມມຸດ.
          </p>
        </div>
      )}

      <div className="flex gap-1.5">
        {(Object.keys(TAB_LABEL) as Array<keyof typeof TAB_LABEL>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
              tab === key
                ? "bg-teal-700 text-white"
                : "text-slate-600 hover:bg-slate-500/10 dark:text-slate-300"
            }`}
          >
            {TAB_LABEL[key]}
            <span className="ml-1.5 opacity-70">
              {key === "todo" ? (coverage?.worklist.length ?? 0) : rows.length}
            </span>
          </button>
        ))}
      </div>

      {error && !form && <p className="text-[11px] text-rose-500">{error}</p>}

      {loading ? (
        <div className="glass flex items-center justify-center rounded-lg py-14 text-sm text-slate-400">
          <FaSpinner className="mr-2 animate-spin" /> ກຳລັງໂຫຼດ...
        </div>
      ) : tab === "todo" ? (
        <div className="space-y-3">
          {workByFamily.length === 0 ? (
            <div className="glass rounded-lg py-14 text-center text-sm text-slate-400">
              ວັດຄົບທຸກລາຍການແລ້ວ 🎉
            </div>
          ) : (
            workByFamily.map(([family, items]) => (
              <div key={family} className="glass rounded-lg p-4">
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/40 pb-2 dark:border-white/5">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">{family}</h4>
                  <p className="text-[10px] text-slate-500">
                    ຕະກຸນນີ້ມີ{" "}
                    <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {items[0]?.familyLines.toLocaleString()}
                    </span>{" "}
                    ແຖວ · ຍັງຕ້ອງວັດ {items.length} ຂະໜາດ
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.itemCode}
                          className="border-b border-slate-200/20 last:border-0 dark:border-white/5"
                        >
                          <td className="py-1.5 pr-3 w-14 text-right tabular-nums text-slate-400">
                            {item.lines}
                          </td>
                          <td className="py-1.5 pr-3 w-20 font-semibold text-slate-700 dark:text-slate-200">
                            {item.label ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3 w-24 tabular-nums text-slate-500">
                            {item.packQty ? `1${item.packUnit ?? ""}=${item.packQty}` : "—"}
                          </td>
                          <td className="py-1.5 pr-3">
                            {item.status === "estimated" ? (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                ຄາດຄະເນຢູ່
                              </span>
                            ) : (
                              <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                ບໍ່ຮູ້
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => measureFromWork(item)}
                              className="rounded-md bg-teal-700 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-teal-800"
                            >
                              ໃສ່ຂະໜາດຫີບ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <StatusTableShell count={rows.length}>
          {rows.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-400">
              ຍັງບໍ່ໄດ້ວັດຫີບໃດເລີຍ — ໄປແທັບ &quot;ຄວນວັດຕໍ່ໄປ&quot;
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200/30 bg-white/30 dark:border-white/5 dark:bg-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຕະກຸນ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຂະໜາດ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຫີບ ກ×ຍ×ສ (cm)</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຕໍ່ຫີບ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">m³/ຫີບ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">m³/ຕົວ</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.roworder}
                      className="cursor-pointer border-b border-slate-200/20 hover:bg-white/30 dark:border-white/5 dark:hover:bg-white/5"
                      onClick={() => editRow(r)}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">{r.family}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                        {r.size_key ?? "ທຸກຂະໜາດ"}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600 dark:text-slate-300">
                        {num(r.width_cm)}×{num(r.length_cm)}×{num(r.height_cm)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                        {num(r.pack_qty)} {r.pack_unit ?? ""}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600 dark:text-slate-300">
                        {(num(r.pack_m3) ?? 0).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                        {num(r.piece_m3) !== null ? num(r.piece_m3)!.toFixed(6) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(r);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
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
      )}

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setForm(null)}
        >
          <div
            className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                  ວັດຫີບ — {form.family}
                </h3>
                <p className="text-[10px] text-slate-500">ຂະໜາດ {form.size_label}</p>
              </div>
              <button
                onClick={() => setForm(null)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <FaTimes size={12} />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <p className="rounded-lg bg-teal-500/10 px-3 py-2 text-[11px] leading-relaxed text-teal-800 dark:text-teal-300">
                ວັດ <b>ດ້ານນອກຂອງຫີບ</b> ເປັນ ຊັງຕີແມັດ — ບໍ່ຕ້ອງວັດຕົວສິນຄ້າ. ລະບົບຈະຫານ
                ດ້ວຍຈຳນວນຕໍ່ຫີບໃຫ້ເອງ ເພື່ອໄດ້ຄ່າຕໍ່ຕົວ.
              </p>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["width_cm", "ກວ້າງ (cm)"],
                    ["length_cm", "ຍາວ (cm)"],
                    ["height_cm", "ສູງ (cm)"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">{label}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="glass-input w-full rounded-lg px-3 py-2 text-xs tabular-nums text-slate-700 dark:text-slate-200"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-slate-500">ຈຳນວນຕໍ່ຫີບ</label>
                  <input
                    type="number"
                    min={1}
                    value={form.pack_qty}
                    onChange={(e) => setForm({ ...form, pack_qty: e.target.value })}
                    className="glass-input w-full rounded-lg px-3 py-2 text-xs tabular-nums text-slate-700 dark:text-slate-200"
                  />
                  <p className="mt-1 text-[9px] text-slate-400">ຕື່ມຈາກຊື່ໃຫ້ແລ້ວ — ແກ້ໄດ້ຖ້າຜິດ</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-slate-500">ຫົວໜ່ວຍຫໍ່</label>
                  <input
                    type="text"
                    value={form.pack_unit}
                    onChange={(e) => setForm({ ...form, pack_unit: e.target.value })}
                    placeholder="ຫີບ"
                    className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-slate-500">ນ້ຳໜັກ/ຫີບ (kg)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                    className="glass-input w-full rounded-lg px-3 py-2 text-xs tabular-nums text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold text-slate-500">ບັນທຶກ (ບໍ່ບັງຄັບ)</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                />
              </div>

              {formM3 !== null && (
                <p className="rounded-lg bg-slate-500/5 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                  ຫີບນີ້{" "}
                  <span className="font-bold tabular-nums">{formM3.toFixed(4)} m³</span>
                  {formQty && formQty > 0 && (
                    <>
                      {" · "}ຕໍ່ຕົວ{" "}
                      <span className="font-bold tabular-nums text-teal-700 dark:text-teal-400">
                        {(formM3 / formQty).toFixed(6)} m³
                      </span>
                    </>
                  )}
                </p>
              )}

              {error && <p className="text-[11px] text-rose-500">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
              <button
                type="button"
                onClick={() => setForm(null)}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/5"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={() => void save()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <FaSpinner className="animate-spin" size={11} /> ກຳລັງບັນທຶກ...
                  </>
                ) : (
                  <>
                    <FaCheck size={11} /> ບັນທຶກ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <PackImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/**
 * ນຳເຂົ້າສະເປັກຫີບຈາກໂຮງງານດ້ວຍການວາງຕາຕະລາງ.
 *
 * ຮັບໄດ້ທັງວາງຈາກ Excel (tab) ແລະ comma. ຄ່າທີ່ນຳເຂົ້າຖືເປັນ "ໂຮງງານ"
 * ເຊິ່ງໜ້າເຊື່ອຖືເທົ່າຄ່າທີ່ວັດເອງ ແລະ ຈະທັບຄ່າຄາດຄະເນຈາກຮູບຊົງທັນທີ.
 */
function PackImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [brand, setBrand] = useState("SCG");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    parsed: number;
    inserted: number;
    parseErrors: Array<{ line: number; text: string; reason: string }>;
    failed: Array<{ family: string; reason: string }>;
  } | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const r = await Actions.importPackDims(text, brand);
      setResult(r as NonNullable<typeof result>);
    } catch (e) {
      console.error(e);
      setResult({
        parsed: 0,
        inserted: 0,
        parseErrors: [{ line: 0, text: "", reason: userErrorMessage(e, "ຜິດພາດ") }],
        failed: [],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="glass max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">ນຳເຂົ້າສະເປັກຫີບຈາກໂຮງງານ</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="rounded-lg bg-teal-500/10 px-3 py-2 text-[11px] leading-relaxed text-teal-800 dark:text-teal-300">
            ວາງຕາຕະລາງຈາກ Excel ຫຼື PDF ຂອງໂຮງງານໄດ້ໂລດ. ຄໍລັມທີ່ຕ້ອງການ:{" "}
            <b>ຕະກຸນ · ຂະໜາດ · ຫົວໜ່ວຍ · ຈຳນວນຕໍ່ຫີບ · ກວ້າງ · ຍາວ · ສູງ · ນ້ຳໜັກ</b>{" "}
            (ນ້ຳໜັກບໍ່ບັງຄັບ). ມີແຖວຫົວກໍ່ໄດ້ ບໍ່ມີກໍ່ໄດ້ — ຖ້າບໍ່ມີຈະອ່ານຕາມລຳດັບນີ້.
          </p>

          <div>
            <label className="mb-1 block text-[10px] font-semibold text-slate-500">ຍີ່ຫໍ້</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="SCG"
              className="glass-input w-40 rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold text-slate-500">ວາງຕາຕະລາງທີ່ນີ້</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={"ຕະກຸນ\tຂະໜາດ\tຫົວໜ່ວຍ\tຈຳນວນ\tກວ້າງ\tຍາວ\tສູງ\tນ້ຳໜັກ\nຂໍ້ງໍບາງ\t2 ນີ້ວ\tຫີບ\t30\t40\t30\t25\t12.5"}
              className="glass-input w-full rounded-lg px-3 py-2 font-mono text-[11px] text-slate-700 dark:text-slate-200"
            />
          </div>

          {result && (
            <div className="rounded-lg bg-slate-500/5 px-3 py-2.5 text-[11px]">
              <p className="font-bold text-slate-700 dark:text-slate-200">
                ອ່ານໄດ້ {result.parsed} ແຖວ · ບັນທຶກສຳເລັດ{" "}
                <span className="text-teal-700 dark:text-teal-400">{result.inserted}</span>
              </p>
              {result.parseErrors.length > 0 && (
                <div className="mt-1.5">
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    ອ່ານບໍ່ໄດ້ {result.parseErrors.length} ແຖວ:
                  </p>
                  <ul className="mt-0.5 max-h-32 space-y-0.5 overflow-y-auto">
                    {result.parseErrors.slice(0, 12).map((e, i) => (
                      <li key={i} className="truncate text-[10px] text-slate-500">
                        ແຖວ {e.line}: {e.reason} — {e.text.slice(0, 44)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.failed.length > 0 && (
                <p className="mt-1 text-[10px] text-rose-500">
                  ບັນທຶກບໍ່ໄດ້ {result.failed.length} ແຖວ: {result.failed[0].reason}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
          <button
            type="button"
            onClick={result && result.inserted > 0 ? onDone : onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
          >
            {result && result.inserted > 0 ? "ປິດ ແລະ ໂຫຼດຄືນ" : "ຍົກເລີກ"}
          </button>
          <button
            onClick={() => void run()}
            disabled={busy || !text.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? <><FaSpinner className="animate-spin" size={11} /> ກຳລັງນຳເຂົ້າ...</> : "ນຳເຂົ້າ"}
          </button>
        </div>
      </div>
    </div>
  );
}

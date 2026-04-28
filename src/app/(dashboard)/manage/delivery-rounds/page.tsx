"use client";

import { useEffect, useState } from "react";
import {
  FaCheck,
  FaClock,
  FaPlus,
  FaSpinner,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  StatusPageHeader,
  StatusTableShell,
} from "@/components/status-page-shell";
import { useConfirm } from "@/components/confirm-dialog";

interface Round {
  code: string;
  name: string;
  time_label: string;
  sort_order: number;
  active: boolean;
}

const EMPTY: Round = {
  code: "",
  name: "",
  time_label: "",
  sort_order: 0,
  active: true,
};

export default function DeliveryRoundsPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Round | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await Actions.listDeliveryRounds(false)) as Round[];
      setRows(data ?? []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("ກະລຸນາໃສ່ຊື່");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Actions.upsertDeliveryRound(editing);
      setEditing(null);
      await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (code: string) => {
    if (!await confirm({ title: "ລຶບຮອບ", message: `ລຶບຮອບ "${code}" ?` })) return;
    try {
      await Actions.deleteDeliveryRound(code);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຮອບການຈັດສົ່ງ"
        subtitle="ຈັດການລາຍການຮອບ (ເຊັ່ນ ຮອບເຊົ້າ, ຮອບບ່າຍ) ສຳລັບເລືອກຕອນຈັດຖ້ຽວ"
        icon={<FaClock />}
        tone="sky"
        aside={
          <button
            type="button"
            onClick={() => setEditing({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-teal-800"
          >
            <FaPlus size={11} /> ເພີ່ມຮອບ
          </button>
        }
      />

      <StatusTableShell count={rows.length}>
        {loading ? (
          <div className="py-14 flex items-center justify-center text-slate-400 text-sm">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-sm">
            ຍັງບໍ່ມີຮອບ — ກົດ "ເພີ່ມຮອບ" ເພື່ອເລີ່ມ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລະຫັດ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຊື່</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເວລາ</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ລຳດັບ</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.code}
                    className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer"
                    onClick={() => setEditing({ ...r })}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-200">
                      {r.code}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.time_label || "-"}</td>
                    <td className="px-4 py-3 text-center text-slate-500 tabular-nums">
                      {r.sort_order}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <FaCheck size={9} /> ໃຊ້ງານ
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500">
                          ປິດ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(r.code);
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
            className="glass rounded-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                {rows.some((x) => x.code === editing.code) ? "ແກ້ໄຂຮອບ" : "ເພີ່ມຮອບໃໝ່"}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
              >
                <FaTimes size={12} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editing.code ? (
                <Field
                  label="ລະຫັດ"
                  hint="ສ້າງອັດຕະໂນມັດ"
                  value={editing.code}
                  onChange={() => undefined}
                  disabled
                />
              ) : (
                <p className="text-[10px] text-slate-400 italic">
                  ລະຫັດຈະຖືກສ້າງອັດຕະໂນມັດ (ເຊັ່ນ R001, R002...)
                </p>
              )}
              <Field
                label="ຊື່"
                value={editing.name}
                onChange={(v) => setEditing({ ...editing, name: v })}
                placeholder="ຮອບເຊົ້າ"
              />
              <Field
                label="ເວລາ (ບໍ່ບັງຄັບ)"
                hint="ເຊັ່ນ 08:00 - 11:00"
                value={editing.time_label}
                onChange={(v) => setEditing({ ...editing, time_label: v })}
                placeholder="08:00 - 11:00"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    ລຳດັບ
                  </label>
                  <input
                    type="number"
                    value={editing.sort_order}
                    onChange={(e) =>
                      setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })
                    }
                    className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    ສະຖານະ
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, active: !editing.active })}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-semibold ${
                      editing.active
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                        : "bg-slate-500/10 text-slate-600 ring-1 ring-slate-300/30"
                    }`}
                  >
                    {editing.active ? "ໃຊ້ງານ" : "ປິດໃຊ້ງານ"}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-[11px] text-rose-500">{error}</p>
              )}
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

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {hint && (
        <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
      )}
    </div>
  );
}

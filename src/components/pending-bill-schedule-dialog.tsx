"use client";

import { useEffect, useState } from "react";
import {
  FaCalendar,
  FaSpinner,
  FaStickyNote,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";

export interface PendingScheduleDefaults {
  scheduled_date?: string | null;
  remark?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export function PendingBillScheduleDialog({
  open,
  billNo,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  billNo: string | null;
  initial?: PendingScheduleDefaults | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !billNo) return;
    setError(null);
    // If the parent already passed initial values, use those — but always
    // re-fetch to pick up any concurrent updates.
    setDate(initial?.scheduled_date ?? "");
    setRemark(initial?.remark ?? "");
    setUpdatedAt(initial?.updated_at ?? null);
    setUpdatedBy(initial?.updated_by ?? null);

    setLoading(true);
    Actions.getPendingBillSchedule(billNo)
      .then((row) => {
        if (!row) return;
        const r = row as {
          scheduled_date?: string;
          remark?: string;
          updated_at?: string;
          updated_by?: string;
        };
        setDate(r.scheduled_date ?? "");
        setRemark(r.remark ?? "");
        setUpdatedAt(r.updated_at ?? null);
        setUpdatedBy(r.updated_by ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, billNo, initial]);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async (clear = false) => {
    if (!billNo) return;
    setSubmitting(true);
    setError(null);
    try {
      await Actions.upsertPendingBillSchedule({
        bill_no: billNo,
        scheduled_date: clear ? null : date || null,
        remark: clear ? null : remark.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !billNo) return null;

  const today = getFixedTodayDate();
  const overdue = Boolean(date && date < today);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={close}
    >
      <div
        className="glass rounded-xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between bg-white/30 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FaCalendar size={12} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                ກຳນົດວັນຈັດສົ່ງ
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ບິນ {billNo}
              </p>
            </div>
          </div>
          <button
            onClick={close}
            disabled={submitting}
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center disabled:opacity-50"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} />
              ວັນທີຈັດສົ່ງ
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading || submitting}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50"
            />
            {overdue && (
              <p className="mt-1 text-[10px] text-rose-500 font-medium">
                ⚠️ ຫຼາຍກຳນົດແລ້ວ ({today})
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaStickyNote className="inline mr-1.5 text-slate-400" size={11} />
              ໝາຍເຫດ
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              disabled={loading || submitting}
              placeholder="ເຫດຜົນທີ່ຍັງບໍ່ຈັດຖ້ຽວ..."
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 resize-none disabled:opacity-50"
            />
          </div>

          {(updatedAt || updatedBy) && (
            <p className="text-[10px] text-slate-400">
              ປັບປຸງລ່າສຸດ: {updatedAt}
              {updatedBy ? ` · ໂດຍ ${updatedBy}` : ""}
            </p>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={submitting || loading || (!date && !remark)}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-40 inline-flex items-center gap-1.5"
            title="ລຶບຂໍ້ມູນກຳນົດ"
          >
            <FaTrash size={10} /> ລຶບ
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={submitting || loading}
              className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
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
    </div>
  );
}

"use client";

import { FaClipboardCheck, FaTimes } from "react-icons/fa";
import { DailyChecklistForm } from "@/components/forms/DailyChecklistForm";

export function ChecklistEntryDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between bg-white/30 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <FaClipboardCheck size={14} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              ກວດເຊັກສະພາບລົດ
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <DailyChecklistForm onSubmitted={onSaved} />
        </div>
      </div>
    </div>
  );
}

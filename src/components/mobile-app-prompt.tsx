"use client";

import { useEffect, useState } from "react";
import { FaTimes, FaDownload, FaMobileAlt, FaBolt, FaBell, FaMapMarkerAlt } from "react-icons/fa";

const STORAGE_KEY = "tms-app-prompt-dismissed";

export function MobileAppPromptModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua) && !/Windows/i.test(ua);
    if (!isAndroid) return;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = (permanent: boolean) => {
    if (permanent && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => dismiss(false)}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-fadeIn">
        <button
          type="button"
          onClick={() => dismiss(false)}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
          aria-label="ປິດ"
        >
          <FaTimes size={12} />
        </button>

        {/* Hero */}
        <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pt-8 pb-6 text-center">
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
            aria-hidden
          />
          <div className="relative">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
              <FaMobileAlt className="text-white text-2xl" />
            </div>
            <h2 className="text-white text-lg font-bold">ໃຊ້ Mobile App ດີກວ່າ</h2>
            <p className="text-emerald-50 text-xs mt-1">ໃຊ້ງານໄວ ສະດວກກວ່າ Web</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-2.5 text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <FaBolt size={10} />
            </span>
            <span>ເປີດໄວ ບໍ່ຕ້ອງເປີດ Browser ທຸກຄັ້ງ</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <FaBell size={10} />
            </span>
            <span>ຮັບແຈ້ງເຕືອນບິນໃໝ່ທັນທີ</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <FaMapMarkerAlt size={10} />
            </span>
            <span>ໃຊ້ກ້ອງ ແລະ GPS ໄດ້ໂດຍກົງ</span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-1 space-y-2">
          <a
            href="/tms.apk"
            download
            onClick={() => dismiss(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-700"
          >
            <FaDownload size={13} /> ດາວໂຫຼດ App
          </a>
          <button
            type="button"
            onClick={() => dismiss(true)}
            className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            ໃຊ້ Web ໄປກ່ອນ
          </button>
        </div>
      </div>
    </div>
  );
}

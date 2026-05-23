"use client";

import { useEffect, useState } from "react";
import {
  FaCheckCircle,
  FaClock,
  FaCrown,
  FaExclamationTriangle,
  FaSpinner,
  FaTruck,
  FaUserTie,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";

type Period = "today" | "month" | "year";

interface DriverRow {
  driver_code: string;
  driver_name: string;
  total: number;
  on_time: number;
  breach: number;
  avg_delivery_seconds: number | null;
  avg_close_seconds: number | null;
}

function fmtDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default function DriverLeaderboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Actions.getDriverLeaderboard(period)
      .then((data) => {
        if (!alive) return;
        setRows((data ?? []) as DriverRow[]);
      })
      .catch((e) => {
        console.error(e);
        if (alive) setRows([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [period]);

  const tabs: Array<{ key: Period; label: string }> = [
    { key: "today", label: "ວັນນີ້" },
    { key: "month", label: "ເດືອນນີ້" },
    { key: "year", label: "ປີນີ້" },
  ];

  const top = rows[0];

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="Driver Leaderboard"
        subtitle="ຈັດອັນດັບຄົນຂັບຕາມຜົນງານການຈັດສົ່ງ"
        icon={<FaUserTie />}
        tone="teal"
      />

      <div className="glass rounded-lg p-3 flex items-center justify-between flex-wrap gap-3">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          ຈັດອັນດັບຕາມ <strong>ຈຳນວນທີ່ສົ່ງສຳເລັດທັນເວລາ</strong> (ຫຼັງຈາກນັ້ນຕາມຈຳນວນທັງໝົດ)
        </p>
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPeriod(t.key)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                period === t.key
                  ? "bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-300"
                  : "text-slate-500 dark:text-gray-400 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-lg py-16 flex items-center justify-center text-slate-400">
          <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-lg py-16 text-center text-sm text-slate-400">
          ບໍ່ມີຂໍ້ມູນຈັດສົ່ງສຳເລັດໃນຊ່ວງເວລາທີ່ເລືອກ
        </div>
      ) : (
        <>
          {top && (
            <div className="rounded-lg border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:border-amber-800 dark:from-amber-950/30 dark:to-orange-950/30">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500 text-white shadow-md">
                  <FaCrown size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300 font-semibold">
                    ອັນດັບ 1
                  </p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white truncate">{top.driver_name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {top.on_time} ບິນທັນເວລາ ({pct(top.on_time, top.total)}%) ຈາກ {top.total} ບິນ
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="glass rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">ອັນດັບ</th>
                    <th className="px-3 py-2 text-left font-semibold">ຄົນຂັບ</th>
                    <th className="px-3 py-2 text-right font-semibold">ສຳເລັດ</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <FaCheckCircle className="inline mr-1 text-emerald-500" size={9} /> ທັນເວລາ
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <FaExclamationTriangle className="inline mr-1 text-rose-500" size={9} /> ຊ້າ
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <FaTruck className="inline mr-1 text-sky-500" size={9} /> ສະເລ່ຍສົ່ງ
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <FaClock className="inline mr-1 text-amber-500" size={9} /> ສະເລ່ຍປິດ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                  {rows.map((row, i) => {
                    const rate = pct(row.on_time, row.total);
                    return (
                      <tr key={row.driver_code || i} className="hover:bg-white/40 dark:hover:bg-white/5">
                        <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                          {i === 0 ? <span className="text-amber-500">🥇</span> : i === 1 ? <span>🥈</span> : i === 2 ? <span>🥉</span> : i + 1}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{row.driver_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {row.on_time} <span className="text-[9px] font-normal text-slate-400">· {rate}%</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">{row.breach}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-600 dark:text-sky-400">{fmtDuration(row.avg_delivery_seconds)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{fmtDuration(row.avg_close_seconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

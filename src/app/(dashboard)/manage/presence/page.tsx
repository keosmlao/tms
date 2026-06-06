"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBroadcastTower,
  FaDesktop,
  FaMobileAlt,
  FaSearch,
  FaSpinner,
  FaUserClock,
  FaWifi,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusStatGrid } from "@/components/status-page-shell";

interface PresenceRow {
  user_code: string;
  user_name: string;
  title: string;
  source: "web" | "mobile";
  source_label: string;
  logistic_code: string;
  logistic_name: string;
  ip_addr: string | null;
  user_agent: string | null;
  status: "online" | "offline";
  age_seconds: number;
  last_seen_at: string;
  last_offline_at: string | null;
}

function formatAge(seconds: number) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function sourceIcon(source: string) {
  return source === "mobile" ? <FaMobileAlt size={11} /> : <FaDesktop size={11} />;
}

export default function PresencePage() {
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"all" | "web" | "mobile">("all");
  const [status, setStatus] = useState<"all" | "online" | "offline">("all");

  const fetchRows = async () => {
    setLoading(true);
    try {
      const data = await Actions.getUserPresence({
        search,
        source,
        status,
        limit: 800,
      });
      setRows((data ?? []) as PresenceRow[]);
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
    const id = window.setInterval(() => void fetchRows(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const online = rows.filter((r) => r.status === "online").length;
    const offline = rows.filter((r) => r.status === "offline").length;
    const web = rows.filter((r) => r.source === "web" && r.status === "online").length;
    const mobile = rows.filter((r) => r.source === "mobile" && r.status === "online").length;
    return { online, offline, web, mobile };
  }, [rows]);

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຜູ້ໃຊ້ Online / Offline"
        subtitle="ຕິດຕາມຜູ້ໃຊ້ທີ່ກຳລັງໃຊ້ລະບົບຜ່ານ Web ແລະແອັບ. Web heartbeat ທຸກ 30s; mobile ອັບເດດຈາກ API request."
        icon={<FaBroadcastTower />}
        tone="teal"
      />

      <StatusStatGrid
        stats={[
          { label: "Online", value: stats.online, icon: <FaWifi />, tone: "teal" },
          { label: "Offline", value: stats.offline, icon: <FaUserClock />, tone: "slate" },
          { label: "Web online", value: stats.web, icon: <FaDesktop />, tone: "sky" },
          { label: "App online", value: stats.mobile, icon: <FaMobileAlt />, tone: "orange" },
        ]}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fetchRows();
        }}
        className="glass rounded-lg p-3 grid gap-2 md:grid-cols-[1fr_150px_150px_auto]"
      >
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ຄົ້ນຫາ user, ຊື່, ເບີພະນັກງານ..."
            className="w-full glass-input rounded-lg py-2 pl-8 pr-3 text-xs"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="glass-input rounded-lg px-3 py-2 text-xs"
        >
          <option value="all">ທັງ Web / App</option>
          <option value="web">Web</option>
          <option value="mobile">ແອັບ</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="glass-input rounded-lg px-3 py-2 text-xs"
        >
          <option value="all">ທັງໝົດ</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
          ຄົ້ນຫາ
        </button>
      </form>

      <div className="glass overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">User</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">ສາຂາ</th>
                <th className="px-3 py-2">IP / Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-slate-400">
                    <FaSpinner className="mx-auto mb-2 animate-spin text-teal-500" />
                    ກຳລັງໂຫຼດ...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-slate-400">
                    ບໍ່ພົບຂໍ້ມູນ presence
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.user_code}-${row.source}`} className="hover:bg-white/50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{row.user_name || row.user_code}</p>
                      <p className="font-mono text-[10px] text-slate-400">{row.user_code}</p>
                      {row.title && <p className="text-[10px] text-slate-400">{row.title}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {sourceIcon(row.source)}
                        {row.source_label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold ${
                          row.status === "online"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-slate-500/10 text-slate-500"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            row.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                          }`}
                        />
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{row.last_seen_at}</p>
                      <p className="text-[10px] text-slate-400">ຜ່ານມາ {formatAge(row.age_seconds)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{row.logistic_name || "-"}</p>
                      {row.logistic_code && <p className="font-mono text-[10px] text-slate-400">{row.logistic_code}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-[10px] text-slate-500">{row.ip_addr || "-"}</p>
                      {row.user_agent && (
                        <p className="max-w-[260px] truncate text-[10px] text-slate-400" title={row.user_agent}>
                          {row.user_agent}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

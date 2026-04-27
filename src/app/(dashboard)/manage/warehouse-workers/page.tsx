"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaSearch, FaSyncAlt, FaSpinner, FaHardHat, FaIdBadge,
  FaThLarge, FaList, FaExclamationTriangle, FaUsers, FaBuilding,
  FaCheckCircle,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: getDispatchWorkersWithBranch, getTransportBranches, setWorkerBranch

interface Worker {
  code: string;
  name_1: string;
  branch_code: string | null;
  branch_name: string | null;
}

interface Branch { code: string; name_1: string; }

type ViewMode = "grid" | "list";

const palette = [
  "from-teal-500 to-sky-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-fuchsia-600",
];

const branchChipColor: Record<string, string> = {
  "02-0001": "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-800",
  "02-0002": "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
  "02-0003": "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800",
  "02-0004": "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-800",
};

function avatarGradient(code: string) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function chipClass(code: string | null | undefined) {
  if (!code) return "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700";
  return branchChipColor[code] ?? "bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 ring-teal-200 dark:ring-teal-800";
}

export default function TransportWorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchAll = () => {
    setLoading(true);
    Promise.all([Actions.getDispatchWorkersWithBranch(), Actions.getTransportBranches()])
      .then(([w, b]) => {
        setWorkers(w as Worker[]);
        setBranches(b as Branch[]);
        setError(null);
      })
      .catch((e) => { console.error(e); setError("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAssign = (code: string, transportCode: string) => {
    const next = transportCode || null;
    setSavingCode(code);
    setWorkers((prev) =>
      prev.map((w) =>
        w.code === code
          ? { ...w, branch_code: next, branch_name: next ? branches.find((b) => b.code === next)?.name_1 ?? null : null }
          : w
      )
    );
    startTransition(async () => {
      try {
        await Actions.setWorkerBranch(code, next);
        setSavedCode(code);
        setTimeout(() => setSavedCode((c) => (c === code ? null : c)), 1500);
      } catch (e) {
        console.error(e);
        setError("ບັນທຶກບໍ່ສຳເລັດ");
        fetchAll();
      } finally {
        setSavingCode((s) => (s === code ? null : s));
      }
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter((w) =>
      w.code.toLowerCase().includes(q) ||
      w.name_1.toLowerCase().includes(q) ||
      (w.branch_name ?? "").toLowerCase().includes(q)
    );
  }, [workers, search]);

  const assignedCount = workers.filter((w) => w.branch_code).length;

  return (
    <div className="min-h-screen pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 flex items-center justify-center shadow-lg">
              <FaHardHat className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                ພະນັກງານຂົນສົ່ງ
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">ສະເພາະພະນັກງານພະແນກຂົນສົ່ງ · ກຳນົດສາຂາໄດ້</p>
            </div>
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-4 py-2 glass rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-white/5 transition-all"
          >
            <FaSyncAlt className={loading ? "animate-spin" : ""} size={12} />
            ຣີເຟຣຊ
          </button>
        </div>

        {/* Toolbar */}
        <div className="glass rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ຄົ້ນຫາລະຫັດ ຊື່ ຫຼື ສາຂາ..."
                className="glass-input w-full pl-9 pr-4 py-2 text-sm rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-500/10 ring-1 ring-teal-500/20">
              <FaUsers className="text-teal-500 dark:text-teal-400 text-sm" />
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                {filtered.length} / {workers.length}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <FaBuilding className="text-emerald-500 dark:text-emerald-400 text-sm" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                ມີສາຂາ {assignedCount}
              </span>
            </div>
            <div className="flex items-center rounded-lg glass p-1">
              <button
                onClick={() => setView("grid")}
                className={`p-2 rounded-lg transition-all ${view === "grid" ? "glass-heavy text-teal-600 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}
                aria-label="Grid view"
              >
                <FaThLarge size={12} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 rounded-lg transition-all ${view === "list" ? "glass-heavy text-teal-600 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}
                aria-label="List view"
              >
                <FaList size={12} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-5 py-4 text-rose-700 dark:text-rose-300 flex items-start gap-3">
            <FaExclamationTriangle className="mt-0.5" />
            <div>
              <p className="font-semibold text-sm">ຜິດພາດ</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Content */}
        {loading && workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FaSpinner className="animate-spin text-teal-500 text-3xl mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-sm">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass border-dashed rounded-lg py-16 text-center">
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-lg bg-slate-500/10 text-gray-400 dark:text-gray-500 mb-3">
              <FaHardHat size={22} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {search ? "ບໍ່ພົບຜົນການຄົ້ນຫາ" : "ບໍ່ມີຂໍ້ມູນ"}
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((w) => (
              <div
                key={w.code}
                className="group relative overflow-hidden rounded-lg glass p-4 hover:shadow-md transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="relative flex items-center gap-3">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${avatarGradient(w.code)} text-white text-sm font-bold shadow-lg`}>
                    {initials(w.name_1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{w.name_1}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <FaIdBadge className="text-gray-400 dark:text-gray-500 text-[10px]" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{w.code}</span>
                    </div>
                  </div>
                </div>
                <div className="relative mt-3 pt-3 border-t border-slate-200/30 dark:border-white/5">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <FaBuilding size={9} /> ສາຂາຮັບຜິດຊອບ
                    </label>
                    {savingCode === w.code ? (
                      <FaSpinner className="text-teal-500 animate-spin" size={10} />
                    ) : savedCode === w.code ? (
                      <FaCheckCircle className="text-emerald-500" size={10} />
                    ) : null}
                  </div>
                  <select
                    value={w.branch_code ?? ""}
                    onChange={(e) => handleAssign(w.code, e.target.value)}
                    disabled={savingCode === w.code}
                    className={`w-full text-xs px-2.5 py-1.5 rounded-lg ring-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all ${chipClass(w.branch_code)} disabled:opacity-60`}
                  >
                    <option value="">— ບໍ່ໄດ້ກຳນົດ —</option>
                    {branches.map((b) => (
                      <option key={b.code} value={b.code}>{b.name_1}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/30 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ພະນັກງານ</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ລະຫັດ</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ສາຂາຮັບຜິດຊອບ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                {filtered.map((w) => (
                  <tr key={w.code} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${avatarGradient(w.code)} text-white text-xs font-bold shadow`}>
                          {initials(w.name_1)}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">{w.name_1}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-mono text-gray-600 dark:text-gray-300">
                        <FaIdBadge size={9} />
                        {w.code}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={w.branch_code ?? ""}
                          onChange={(e) => handleAssign(w.code, e.target.value)}
                          disabled={savingCode === w.code}
                          className={`text-xs px-2.5 py-1.5 rounded-lg ring-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all ${chipClass(w.branch_code)} disabled:opacity-60`}
                        >
                          <option value="">— ບໍ່ໄດ້ກຳນົດ —</option>
                          {branches.map((b) => (
                            <option key={b.code} value={b.code}>{b.name_1}</option>
                          ))}
                        </select>
                        {savingCode === w.code ? (
                          <FaSpinner className="text-teal-500 animate-spin" size={11} />
                        ) : savedCode === w.code ? (
                          <FaCheckCircle className="text-emerald-500" size={11} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

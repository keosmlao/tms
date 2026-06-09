"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaSearch, FaSyncAlt, FaSpinner, FaHardHat, FaIdBadge,
  FaExclamationTriangle, FaUsers, FaBuilding,
  FaCheckCircle, FaUserTag,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: getDispatchWorkersWithBranch, getTransportBranches, setWorkerProfile

interface Worker {
  code: string;
  name_1: string;
  branch_code: string | null;
  branch_name: string | null;
  position_code: PositionCode | null;
  position_name: string | null;
  // Branches this worker may see on the web dispatch screens (multi-select).
  dispatch_branch_codes: string[];
}

interface Branch { code: string; name_1: string; }

type PositionCode =
  | "driver"
  | "worker"
  | "both"
  | "team_lead"
  | "manager"
  | "admin";

const positionOptions: { code: PositionCode; name: string }[] = [
  { code: "driver", name: "ຄົນຂັບ" },
  { code: "worker", name: "ກຳມະກອນ" },
  { code: "team_lead", name: "ຫົວໜ້າໜ່ວຍງານ" },
  { code: "manager", name: "ຜູ້ຈັດການສາງແລະຂົນສົ່ງ" },
  { code: "admin", name: "ແອັດມິນ (ຈັດຖ້ຽວ/ປິດຖ້ຽວ/ລາຍງານ)" },
];

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

function positionClass(code: PositionCode | null | undefined) {
  if (code === "driver") return "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 ring-sky-200 dark:ring-sky-800";
  if (code === "worker") return "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800";
  if (code === "both") return "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800";
  if (code === "team_lead") return "bg-fuchsia-100 dark:bg-fuchsia-950/50 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-200 dark:ring-fuchsia-800";
  if (code === "manager") return "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-800";
  if (code === "admin") return "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-800";
  return "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700";
}

function positionName(code: PositionCode | null | undefined) {
  return positionOptions.find((item) => item.code === code)?.name ?? null;
}

type BranchFilter = "all" | "none" | string; // string = branch code
type PositionFilter = "all" | "none" | PositionCode;

export default function TransportWorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
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

  const handleAssign = (code: string, nextBranch: string | null, nextPosition: PositionCode | null) => {
    setSavingCode(code);
    setWorkers((prev) =>
      prev.map((w) =>
        w.code === code
          ? {
              ...w,
              branch_code: nextBranch,
              branch_name: nextBranch ? branches.find((b) => b.code === nextBranch)?.name_1 ?? null : null,
              position_code: nextPosition,
              position_name: positionName(nextPosition),
            }
          : w
      )
    );
    startTransition(async () => {
      try {
        await Actions.setWorkerProfile(code, nextBranch, nextPosition);
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

  // Toggle one branch in/out of a worker's dispatch-visibility set and persist.
  const handleDispatchToggle = (code: string, branchCode: string) => {
    const worker = workers.find((w) => w.code === code);
    if (!worker) return;
    const current = worker.dispatch_branch_codes ?? [];
    const next = current.includes(branchCode)
      ? current.filter((c) => c !== branchCode)
      : [...current, branchCode].sort();
    setSavingCode(code);
    setWorkers((prev) =>
      prev.map((w) => (w.code === code ? { ...w, dispatch_branch_codes: next } : w))
    );
    startTransition(async () => {
      try {
        await Actions.setWorkerDispatchBranches(code, next);
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
    return workers.filter((w) => {
      // Branch tab
      if (branchFilter === "none") {
        if (w.branch_code) return false;
      } else if (branchFilter !== "all") {
        if (w.branch_code !== branchFilter) return false;
      }
      // Position tab
      if (positionFilter === "none") {
        if (w.position_code) return false;
      } else if (positionFilter !== "all") {
        if (w.position_code !== positionFilter) return false;
      }
      // Search
      if (!q) return true;
      return (
        w.code.toLowerCase().includes(q) ||
        w.name_1.toLowerCase().includes(q) ||
        (w.branch_name ?? "").toLowerCase().includes(q) ||
        (w.position_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [workers, search, branchFilter, positionFilter]);

  // Counts for tab badges (against the full worker list, not the filtered one,
  // so user can see how many will appear when they switch tabs).
  const branchCounts = useMemo(() => {
    const map = new Map<string, number>();
    let none = 0;
    for (const w of workers) {
      if (w.branch_code) map.set(w.branch_code, (map.get(w.branch_code) ?? 0) + 1);
      else none += 1;
    }
    return { byCode: map, none, total: workers.length };
  }, [workers]);

  const positionCounts = useMemo(() => {
    const map = new Map<PositionCode, number>();
    let none = 0;
    for (const w of workers) {
      if (w.position_code) map.set(w.position_code, (map.get(w.position_code) ?? 0) + 1);
      else none += 1;
    }
    return { byCode: map, none, total: workers.length };
  }, [workers]);

  const assignedCount = workers.filter((w) => w.branch_code).length;
  const positionedCount = workers.filter((w) => w.position_code).length;

  return (
    <div className="min-h-screen pb-8">
      <div className="mx-auto px-2 sm:px-4 lg:px-4 py-2 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 flex items-center justify-center shadow-lg">
              <FaHardHat className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                ພະນັກງານສາງ ແລະ ຂົນສົ່ງ
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">ພະນັກງານພະແນກສາງ ແລະ ຂົນສົ່ງ · ກຳນົດສາຂາ ແລະ ຕຳແໜ່ງໄດ້</p>
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
                placeholder="ຄົ້ນຫາລະຫັດ ຊື່ ສາຂາ ຫຼື ຕຳແໜ່ງ..."
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20">
              <FaUserTag className="text-sky-500 dark:text-sky-400 text-sm" />
              <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                ມີຕຳແໜ່ງ {positionedCount}
              </span>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="space-y-3">
          {/* Branch tabs */}
          <div className="glass rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <FaBuilding className="text-emerald-500 dark:text-emerald-400 text-xs" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                ສາຂາ
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={branchFilter === "all"}
                onClick={() => setBranchFilter("all")}
                count={branchCounts.total}
                tone="emerald"
              >
                ທັງໝົດ
              </FilterChip>
              {branches.map((b) => (
                <FilterChip
                  key={b.code}
                  active={branchFilter === b.code}
                  onClick={() => setBranchFilter(b.code)}
                  count={branchCounts.byCode.get(b.code) ?? 0}
                  tone="emerald"
                >
                  {b.name_1}
                </FilterChip>
              ))}
              <FilterChip
                active={branchFilter === "none"}
                onClick={() => setBranchFilter("none")}
                count={branchCounts.none}
                tone="slate"
              >
                ບໍ່ໄດ້ກຳນົດ
              </FilterChip>
            </div>
          </div>

          {/* Position tabs */}
          <div className="glass rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <FaUserTag className="text-sky-500 dark:text-sky-400 text-xs" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                ຕຳແໜ່ງ
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={positionFilter === "all"}
                onClick={() => setPositionFilter("all")}
                count={positionCounts.total}
                tone="sky"
              >
                ທັງໝົດ
              </FilterChip>
              {positionOptions.map((opt) => (
                <FilterChip
                  key={opt.code}
                  active={positionFilter === opt.code}
                  onClick={() => setPositionFilter(opt.code)}
                  count={positionCounts.byCode.get(opt.code) ?? 0}
                  tone="sky"
                >
                  {opt.name}
                </FilterChip>
              ))}
              <FilterChip
                active={positionFilter === "none"}
                onClick={() => setPositionFilter("none")}
                count={positionCounts.none}
                tone="slate"
              >
                ບໍ່ໄດ້ກຳນົດ
              </FilterChip>
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
        ) : (
          <div className="glass rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/30 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ພະນັກງານ</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ລະຫັດ</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ສາຂາຮັບຜິດຊອບ</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ສາຂາທີ່ເຫັນ (ຈັດຖ້ຽວ)</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">ຕຳແໜ່ງ</th>
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
                          onChange={(e) => handleAssign(w.code, e.target.value || null, w.position_code)}
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
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {branches.map((b) => {
                          const on = (w.dispatch_branch_codes ?? []).includes(b.code);
                          return (
                            <button
                              key={b.code}
                              type="button"
                              onClick={() => handleDispatchToggle(w.code, b.code)}
                              disabled={savingCode === w.code}
                              title={b.name_1}
                              className={`text-xs px-2 py-1 rounded-lg ring-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all disabled:opacity-60 ${
                                on ? chipClass(b.code) : "bg-slate-500/5 text-gray-400 ring-slate-300/40 dark:ring-white/10"
                              }`}
                            >
                              {on ? "✓ " : ""}{b.name_1}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={w.position_code ?? ""}
                        onChange={(e) => handleAssign(w.code, w.branch_code, (e.target.value || null) as PositionCode | null)}
                        disabled={savingCode === w.code}
                        className={`text-xs px-2.5 py-1.5 rounded-lg ring-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all ${positionClass(w.position_code)} disabled:opacity-60`}
                      >
                        <option value="">— ບໍ່ໄດ້ກຳນົດ —</option>
                        {positionOptions.map((item) => (
                          <option key={item.code} value={item.code}>{item.name}</option>
                        ))}
                      </select>
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

function FilterChip({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  tone: "emerald" | "sky" | "slate";
  children: React.ReactNode;
}) {
  const activeStyle =
    tone === "emerald"
      ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
      : tone === "sky"
        ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
        : "bg-slate-500 text-white shadow-md shadow-slate-500/30";
  const inactiveStyle =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20"
      : tone === "sky"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 ring-1 ring-sky-500/20"
        : "bg-slate-500/10 text-slate-600 dark:text-slate-300 hover:bg-slate-500/20 ring-1 ring-slate-500/20";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
        active ? activeStyle : inactiveStyle
      }`}
    >
      <span>{children}</span>
      <span
        className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
          active
            ? "bg-white/25 text-white"
            : "bg-white/60 dark:bg-white/10 text-current"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

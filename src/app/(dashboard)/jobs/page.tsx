"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FaBoxOpen,
  FaCalendarAlt,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClipboardList,
  FaClock,
  FaEdit,
  FaIdCard,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUsers,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: approveJob, closeJob, deleteJob, getJobBillsWithProducts, getJobs

// ==================== Types ====================

export interface Job {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  car: string;
  driver: string;
  worker_count: number;
  workers: string;
  item_bill: number;
  user_created: string;
  approve_status: number;
  status: string;
  job_status: number;
  forward_transport_code?: string;
  forward_transport_name?: string;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

interface BillDetail {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  count_item: number;
  telephone: string;
  products: Product[];
}

type StatusFilter = "all" | "pending_approve" | "in_progress" | "done";

// ==================== Helpers ====================

function parseDDMMYYYYHHMM(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi] = match;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +mi);
}

function formatElapsed(diffMs: number): string {
  if (diffMs < 0) return "-";
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}ມື້ ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function ElapsedTimer({ createdAt, now }: { createdAt: string; now: number }) {
  const created = parseDDMMYYYYHHMM(createdAt);
  if (!created) return <span className="text-[10px] text-slate-400">-</span>;

  const diffMs = now - created.getTime();

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-mono font-semibold tabular-nums">
      <FaClock size={8} className="animate-pulse" />
      {formatElapsed(diffMs)}
    </span>
  );
}

type StatusConfig = { bg: string; text: string; dot: string; label: string };

function getStatusConfig(approveStatus: number, jobStatus: number): StatusConfig {
  if (approveStatus !== 1) {
    return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "ລໍຖ້າອະນຸມັດ" };
  }
  const configs: Record<number, StatusConfig> = {
    0: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "ລໍຖ້າຈັດສົ່ງ" },
    1: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500", label: "ຮັບຖ້ຽວ" },
    2: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500", label: "ກຳລັງສົ່ງ" },
    3: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "ລໍ admin ປິດ" },
    4: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", dot: "bg-slate-400", label: "admin ປິດແລ້ວ" },
  };
  return configs[jobStatus] || configs[0];
}

function classifyJob(job: Job): StatusFilter {
  if (job.approve_status !== 1) return "pending_approve";
  if (job.job_status === 4) return "done";
  if (job.job_status === 3) return "done";
  return "in_progress";
}

// ==================== Sub-components ====================

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "teal" | "amber" | "sky" | "emerald";
}) {
  const palette = {
    teal: "from-teal-500/20 to-teal-400/20 ring-teal-300/30 text-teal-100",
    amber: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    sky: "from-sky-500/20 to-cyan-500/20 ring-sky-300/30 text-sky-100",
    emerald: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
  }[color];
  return (
    <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${palette} backdrop-blur border border-white/10 px-3 py-1.5 ring-1 text-[11px]`}>
      <span className="opacity-80">{label}</span>
      <span className="font-bold text-white tabular-nums">{value}</span>
    </div>
  );
}

function JobRow({
  job,
  expanded,
  onToggle,
  onEdit,
  onApprove,
  onDelete,
  onClose,
  actingDoc,
  billDetails,
  loadingBills,
  now,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onClose: () => void;
  actingDoc: string | null;
  billDetails: BillDetail[] | undefined;
  loadingBills: boolean;
  now: number;
}) {
  const status = getStatusConfig(job.approve_status, job.job_status);
  const rowPending = actingDoc === job.doc_no;

  return (
    <>
      <tr className={`transition-colors ${expanded ? "bg-teal-500/5" : "hover:bg-white/30 dark:hover:bg-white/5"}`}>
        <td className="px-3 py-3 w-8">
          <button
            type="button"
            onClick={onToggle}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
              expanded ? "bg-teal-500/10 text-teal-600 dark:text-teal-400" : "text-slate-400 hover:bg-teal-500/10 hover:text-teal-600 dark:hover:text-teal-400"
            }`}
            aria-label="Toggle"
          >
            {expanded ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
          </button>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{job.doc_no}</p>
            {job.forward_transport_code ? (
              <span className="inline-flex items-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 text-[9px] font-semibold">
                ສົ່ງຕໍ່ {job.forward_transport_name || job.forward_transport_code}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[9px] font-semibold">
                ສົ່ງລູກຄ້າ
              </span>
            )}
          </div>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
            <FaCalendarAlt size={8} /> {job.doc_date}
          </p>
          <div className="mt-1">
            <ElapsedTimer createdAt={job.created_at} now={now} />
          </div>
        </td>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
            <FaTruck size={9} />
            {job.date_logistic || "-"}
          </span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
            <FaTruck size={10} className="text-sky-500" />
            <span className="font-medium truncate">{job.car || "-"}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
            <FaIdCard size={10} className="text-sky-500" />
            <span className="font-medium truncate">{job.driver || "-"}</span>
          </div>
        </td>
        <td className="px-3 py-3" title={job.workers || "ບໍ່ມີກຳມະກອນ"}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
            <FaUsers size={10} className="text-emerald-500" />
            <span className="font-semibold tabular-nums">{job.worker_count}</span>
            <span className="text-slate-400">ຄົນ</span>
          </div>
          {job.workers && (
            <p className="text-[9px] text-slate-400 truncate max-w-[160px]">{job.workers}</p>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold tabular-nums">
            {job.item_bill}
          </span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.bg} ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            {job.approve_status === 1 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 p-1 text-emerald-600 dark:text-emerald-400" title="ອະນຸມັດແລ້ວ">
                <FaCheckCircle size={9} />
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 p-1 text-amber-600 dark:text-amber-400" title="ຍັງບໍ່ອະນຸມັດ">
                <FaTimes size={9} />
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-0.5">
            {job.approve_status !== 1 && (
              <button
                type="button"
                onClick={onApprove}
                disabled={rowPending}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                title="ອະນຸມັດ"
              >
                {rowPending ? <FaSpinner className="animate-spin" size={12} /> : <FaCheckCircle size={12} />}
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              disabled={rowPending}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-40"
              title="ແກ້ໄຂ"
            >
              <FaEdit size={12} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={rowPending}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
              title="ລຶບ"
            >
              {rowPending ? <FaSpinner className="animate-spin" size={12} /> : <FaTrash size={12} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={rowPending || job.job_status !== 3}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="admin ປິດຖ້ຽວ"
            >
              <FaTimes size={12} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-white/20 dark:bg-white/5">
          <td colSpan={9} className="px-4 pb-4 pt-2 border-t border-slate-200/30 dark:border-white/5">
            {loadingBills ? (
              <div className="flex items-center justify-center gap-2 py-5">
                <FaSpinner className="animate-spin text-teal-500" size={13} />
                <span className="text-xs text-slate-500">ກຳລັງໂຫຼດ...</span>
              </div>
            ) : !billDetails || billDetails.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">ບໍ່ມີລາຍການບິນ</p>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <FaBoxOpen size={11} className="text-teal-500" />
                  ລາຍການບິນ ({billDetails.length})
                </p>
                <div className="grid gap-2">
                  {billDetails.map((bill, idx) => (
                    <div key={bill.bill_no} className="rounded-lg glass overflow-hidden">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/10 text-[10px] font-bold text-teal-600 dark:text-teal-400 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{bill.bill_no}</p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {bill.bill_date} · {bill.cust_name || bill.cust_code}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                          {bill.count_item} ລາຍການ
                        </span>
                      </div>
                      {bill.products.length > 0 && (
                        <div className="p-2">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200/30 dark:border-white/5">
                                <th className="text-left py-1 pl-2 pr-1 font-medium w-6">#</th>
                                <th className="text-left py-1 px-1 font-medium">ລະຫັດ</th>
                                <th className="text-left py-1 px-1 font-medium">ຊື່ສິນຄ້າ</th>
                                <th className="text-right py-1 px-1 font-medium">ຈຳນວນ</th>
                                <th className="text-left py-1 pl-1 pr-2 font-medium">ຫົວໜ່ວຍ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bill.products.map((product, productIndex) => (
                                <tr key={`${bill.bill_no}-${product.item_code}-${productIndex}`} className="border-b border-slate-200/20 dark:border-white/5 last:border-0">
                                  <td className="py-1 pl-2 pr-1 text-slate-400">{productIndex + 1}</td>
                                  <td className="py-1 px-1 font-mono text-[9px] text-slate-500">{product.item_code}</td>
                                  <td className="py-1 px-1 text-slate-700">{product.item_name}</td>
                                  <td className="py-1 px-1 text-right font-semibold text-teal-600 tabular-nums">{product.qty}</td>
                                  <td className="py-1 pl-1 pr-2 text-slate-500">{product.unit_code}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ==================== Main ====================

export default function JobsClient({ initialJobs = [] as Job[] }: { initialJobs?: Job[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [billDetailsByDoc, setBillDetailsByDoc] = useState<Record<string, BillDetail[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshJobs(); }, []);

  const refreshJobs = () => {
    startRefreshTransition(() => {
      void Actions.getJobs()
        .then((nextJobs) => {
          setJobs(nextJobs as Job[]);
        })
        .catch((error) => {
          console.error(error);
          alert("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນຖ້ຽວໄດ້");
        });
    });
  };

  const toggleBillDetails = async (docNo: string) => {
    if (expandedDoc === docNo) {
      setExpandedDoc(null);
      return;
    }
    setExpandedDoc(docNo);
    if (billDetailsByDoc[docNo]) return;

    setLoadingDoc(docNo);
    try {
      const data = await Actions.getJobBillsWithProducts(docNo);
      setBillDetailsByDoc((current) => ({ ...current, [docNo]: data as BillDetail[] }));
    } catch (error) {
      console.error(error);
      setBillDetailsByDoc((current) => ({ ...current, [docNo]: [] }));
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleDelete = async (docNo: string) => {
    if (!confirm("ຕ້ອງການລຶບຖ້ຽວນີ້ແທ້ບໍ່?")) return;
    setActingDoc(docNo);
    try {
      await Actions.deleteJob(docNo);
      setJobs((current) => current.filter((job) => job.doc_no !== docNo));
      if (expandedDoc === docNo) setExpandedDoc(null);
      refreshJobs();
    } finally {
      setActingDoc(null);
    }
  };

  const handleClose = async (docNo: string) => {
    if (!confirm("ຕ້ອງການໃຫ້ admin ປິດຖ້ຽວນີ້ແທ້ບໍ່?")) return;
    setActingDoc(docNo);
    try {
      await Actions.closeJob(docNo);
      setJobs((current) =>
        current.map((job) =>
          job.doc_no === docNo ? { ...job, job_status: 4, status: "admin ປິດຖ້ຽວ" } : job
        )
      );
      refreshJobs();
    } catch (error) {
      alert(error instanceof Error ? error.message : "ບໍ່ສາມາດປິດຖ້ຽວໄດ້");
    } finally {
      setActingDoc(null);
    }
  };

  const handleApprove = async (docNo: string) => {
    if (!confirm("ຕ້ອງການອະນຸມັດຖ້ຽວນີ້ແທ້ບໍ່?")) return;
    setActingDoc(docNo);
    try {
      await Actions.approveJob(docNo);
      setJobs((current) =>
        current.map((job) =>
          job.doc_no === docNo ? { ...job, approve_status: 1, status: "ລໍຖ້າຈັດສົ່ງ" } : job
        )
      );
      refreshJobs();
    } catch (error) {
      alert(error instanceof Error ? error.message : "ບໍ່ສາມາດອະນຸມັດຖ້ຽວໄດ້");
    } finally {
      setActingDoc(null);
    }
  };

  const stats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let done = 0;
    for (const job of jobs) {
      const c = classifyJob(job);
      if (c === "pending_approve") pending++;
      else if (c === "in_progress") inProgress++;
      else done++;
    }
    return { total: jobs.length, pending, inProgress, done };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return jobs.filter((job) => {
      if (filter !== "all" && classifyJob(job) !== filter) return false;
      if (!q) return true;
      return (
        job.doc_no.toLowerCase().includes(q) ||
        job.car?.toLowerCase().includes(q) ||
        job.driver?.toLowerCase().includes(q) ||
        job.user_created?.toLowerCase().includes(q)
      );
    });
  }, [jobs, searchText, filter]);

  return (
    <div className="space-y-5">
      {/* ========== HERO ========== */}
      <div className="relative overflow-hidden rounded-lg bg-[#0b1b18] p-5 sm:p-6 shadow-xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 10%, #a78bfa 0%, transparent 35%), radial-gradient(circle at 90% 80%, #60a5fa 0%, transparent 35%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <FaTruck className="text-sky-300" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                  Dispatch Queue
                </p>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                ຈັດການຖ້ຽວຂົນສົ່ງ
              </h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ຈັດການ ຈັດຖ້ຽວ ອະນຸມັດ ແລະ ຕິດຕາມສະຖານະ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatBadge label="ທັງໝົດ" value={stats.total} color="sky" />
            <StatBadge label="ລໍອະນຸມັດ" value={stats.pending} color="amber" />
            <StatBadge label="ດຳເນີນງານ" value={stats.inProgress} color="sky" />
            <StatBadge label="ສຳເລັດ" value={stats.done} color="emerald" />
            <button
              type="button"
              onClick={refreshJobs}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 px-3 py-2 text-[11px] font-semibold text-white transition-all disabled:opacity-60"
            >
              <FaSyncAlt className={isRefreshing ? "animate-spin" : ""} size={11} />
              ຣີເຟຣຊ
            </button>
            <Link
               href="/jobs/add"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 transition-all"
            >
              <FaPlus size={11} /> ເພີ່ມຖ້ຽວ
            </Link>
          </div>
        </div>
      </div>

      {/* ========== SEARCH + FILTER ========== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="ຄົ້ນຫາເລກຖ້ຽວ, ລົດ, ຄົນຂັບ..."
            className="w-full pl-9 pr-9 py-2.5 glass-input rounded-lg text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 transition-all"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label="Clear"
            >
              <FaTimes size={10} />
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg glass p-1">
          {([
            { key: "all" as const, label: "ທັງໝົດ", count: stats.total },
            { key: "pending_approve" as const, label: "ລໍອະນຸມັດ", count: stats.pending },
            { key: "in_progress" as const, label: "ດຳເນີນງານ", count: stats.inProgress },
            { key: "done" as const, label: "ສຳເລັດ", count: stats.done },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                filter === opt.key ? "glass-heavy glow-primary text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              {opt.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                  filter === opt.key ? "bg-teal-500/20 text-teal-600 dark:text-teal-400" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                }`}
              >
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ========== TABLE ========== */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg glass">
          <div className="w-16 h-16 rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
            <FaClipboardList className="text-slate-400 dark:text-slate-500 text-3xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ຍັງບໍ່ມີຖ້ຽວ</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ເພີ່ມຖ້ຽວໃໝ່ເພື່ອເລີ່ມ</p>
          <Link
             href="/jobs/add"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <FaPlus size={11} /> ເພີ່ມຖ້ຽວ
          </Link>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <FaSearch className="text-slate-400 dark:text-slate-500 text-2xl mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg glass">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2.5 w-8" aria-label="Expand" />
                  <th className="px-3 py-2.5 text-left">ເລກທີ / ວັນທີ</th>
                  <th className="px-3 py-2.5 text-left">ວັນຈັດສົ່ງ</th>
                  <th className="px-3 py-2.5 text-left">ລົດ</th>
                  <th className="px-3 py-2.5 text-left">ຄົນຂັບ</th>
                  <th className="px-3 py-2.5 text-left">ກຳມະກອນ</th>
                  <th className="px-3 py-2.5 text-center">ບິນ</th>
                  <th className="px-3 py-2.5 text-left">ສະຖານະ</th>
                  <th className="px-3 py-2.5 text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                {filteredJobs.map((job) => (
                  <JobRow
                    key={job.doc_no}
                    job={job}
                    expanded={expandedDoc === job.doc_no}
                    onToggle={() => void toggleBillDetails(job.doc_no)}
                    onEdit={() => router.push(`/jobs/edit?id=${job.doc_no}`)}
                    onApprove={() => void handleApprove(job.doc_no)}
                    onDelete={() => void handleDelete(job.doc_no)}
                    onClose={() => void handleClose(job.doc_no)}
                    actingDoc={actingDoc}
                    billDetails={billDetailsByDoc[job.doc_no]}
                    loadingBills={loadingDoc === job.doc_no}
                    now={now}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

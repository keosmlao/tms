"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { TripLoadCell, useTripVolumes, type TripVolume } from "@/components/trip-load-cell";
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
  FaPrint,
  FaSearch,
  FaSpinner,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUsers,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
} from "@/components/status-page-shell";
import { useConfirm } from "@/components/confirm-dialog";
import Chatter from "@/components/Chatter";
import { userErrorMessage } from "@/lib/action-error";
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
  bill_nos: string;
  user_created: string;
  approve_status: number;
  status: string;
  job_status: number;
  forward_transport_code?: string;
  forward_transport_name?: string;
  delivery_round_code?: string;
  delivery_round_name?: string;
  delivery_round_time_label?: string;
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
  picked_up?: boolean;
}

interface PickupReadyJob {
  doc_no: string;
  doc_date: string;
  date_logistic: string;
  car: string;
  driver: string;
  bill_count: number;
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
  onMoveBill,
  actingDoc,
  billDetails,
  loadingBills,
  now,
  volume,
  volumeFailed,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onClose: () => void;
  onMoveBill: (bill: BillDetail) => void;
  actingDoc: string | null;
  billDetails: BillDetail[] | undefined;
  loadingBills: boolean;
  now: number;
  volume?: TripVolume;
  volumeFailed?: boolean;
}) {
  const canMoveBills = job.job_status === 0;
  const status = getStatusConfig(job.approve_status, job.job_status);
  const rowPending = actingDoc === job.doc_no;

  return (
    <>
      <tr className={`transition-colors ${expanded ? "bg-teal-500/5" : "hover:bg-white/30 dark:hover:bg-white/5"}`}>
        <td className="px-3 py-3 w-8 whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
              expanded ? "bg-teal-500/10 text-teal-600 dark:text-teal-400" : "text-slate-400 hover:bg-teal-500/10 hover:text-teal-600 dark:hover:text-teal-400"
            }`}
            aria-label="ສະຫຼັບ"
          >
            {expanded ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
          </button>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
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
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              <FaTruck size={9} />
              {job.date_logistic || "-"}
            </span>
            {(job.delivery_round_name || job.delivery_round_code) && (
              <span
                className="inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                title={job.delivery_round_time_label || ""}
              >
                <FaClock size={8} />
                {job.delivery_round_name || job.delivery_round_code}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
            <FaTruck size={10} className="text-sky-500" />
            <span className="font-medium truncate">{job.car || "-"}</span>
          </div>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-700">
            <FaIdCard size={10} className="text-sky-500" />
            <span className="font-medium truncate">{job.driver || "-"}</span>
          </div>
        </td>
        <td className="px-3 py-3 whitespace-nowrap" title={job.workers || "ບໍ່ມີກຳມະກອນ"}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
            <FaUsers size={10} className="text-emerald-500" />
            <span className="font-semibold tabular-nums">{job.worker_count}</span>
            <span className="text-slate-400">ຄົນ</span>
          </div>
          {job.workers && (
            <p className="text-[9px] text-slate-400 truncate max-w-[160px]">{job.workers}</p>
          )}
        </td>
        <td className="px-3 py-3 max-w-[220px] whitespace-nowrap">
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold tabular-nums">
              {job.item_bill} ບິນ
            </span>
            {job.bill_nos && (
              <p
                className="text-[10px] text-slate-500 dark:text-slate-400 font-mono leading-tight line-clamp-2 break-all"
                title={job.bill_nos}
              >
                {job.bill_nos}
              </p>
            )}
          </div>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <TripLoadCell v={volume} failed={volumeFailed} />
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
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
        <td className="px-3 py-3 whitespace-nowrap">
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
            {job.job_status === 0 && (
              <button
                type="button"
                onClick={onEdit}
                disabled={rowPending}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-40"
                title="ແກ້ໄຂ"
              >
                <FaEdit size={12} />
              </button>
            )}
            <a
              href={`/jobs/print/${encodeURIComponent(job.doc_no)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="ພິມໃບຈັດຖ້ຽວ"
            >
              <FaPrint size={12} />
            </a>
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
          <td colSpan={10} className="px-4 pb-4 pt-2 border-t border-slate-200/30 dark:border-white/5">
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                            {bill.count_item} ລາຍການ
                          </span>
                          {canMoveBills && !bill.picked_up && (
                            <button
                              type="button"
                              onClick={() => onMoveBill(bill)}
                              className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                              title="ຍ້າຍບິນນີ້ໄປຖ້ຽວອື່ນ"
                            >
                              <FaTruck size={9} />
                              ຍ້າຍ
                            </button>
                          )}
                          {bill.picked_up && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              ຮັບແລ້ວ
                            </span>
                          )}
                        </div>
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
            <div className="mt-3">
              <Chatter model="job" recordId={job.doc_no} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ==================== Main ====================

export default function JobsClient({ initialJobs = [] as Job[] }: { initialJobs?: Job[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [billDetailsByDoc, setBillDetailsByDoc] = useState<Record<string, BillDetail[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ sourceDocNo: string; bill: BillDetail } | null>(null);
  const [moveOptions, setMoveOptions] = useState<PickupReadyJob[]>([]);
  const [movePickedDocNo, setMovePickedDocNo] = useState<string>("");
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);
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
          void confirm({ title: "ຜິດພາດ", message: "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນຖ້ຽວໄດ້", tone: "warning", single: true });
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

  const openMoveBill = async (sourceDocNo: string, bill: BillDetail) => {
    setMoveTarget({ sourceDocNo, bill });
    setMovePickedDocNo("");
    setMoveLoading(true);
    try {
      const data = await Actions.listPickupReadyJobs(sourceDocNo);
      setMoveOptions((data ?? []) as PickupReadyJob[]);
    } catch (error) {
      console.error(error);
      setMoveOptions([]);
    } finally {
      setMoveLoading(false);
    }
  };

  const closeMoveBill = () => {
    setMoveTarget(null);
    setMoveOptions([]);
    setMovePickedDocNo("");
  };

  const handleConfirmMoveBill = async () => {
    if (!moveTarget || !movePickedDocNo) return;
    setMoveSaving(true);
    try {
      await Actions.moveBillToJob(
        moveTarget.sourceDocNo,
        moveTarget.bill.bill_no,
        movePickedDocNo
      );
      // Invalidate cached bills for both jobs so the UI reflects the move.
      setBillDetailsByDoc((current) => {
        const next = { ...current };
        delete next[moveTarget.sourceDocNo];
        delete next[movePickedDocNo];
        return next;
      });
      // If the source job is currently expanded, refresh its bills now.
      if (expandedDoc === moveTarget.sourceDocNo) {
        try {
          const data = await Actions.getJobBillsWithProducts(moveTarget.sourceDocNo);
          setBillDetailsByDoc((current) => ({
            ...current,
            [moveTarget.sourceDocNo]: data as BillDetail[],
          }));
        } catch {
          // ignore — refresh button still available
        }
      }
      closeMoveBill();
      refreshJobs();
    } catch (error) {
      console.error(error);
      void confirm({
        title: "ຍ້າຍບໍ່ສຳເລັດ",
        message: userErrorMessage(error, String(error)),
        tone: "danger",
        single: true,
      });
    } finally {
      setMoveSaving(false);
    }
  };

  const handleDelete = async (docNo: string) => {
    const ok = await confirm({
      title: "ລຶບຖ້ຽວ?",
      message: `ຖ້ຽວ ${docNo} ຈະຖືກລຶບ ບິນທັງໝົດຈະກັບໄປຄິວ`,
      tone: "danger",
      confirmLabel: "ລຶບ",
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: "admin ປິດຖ້ຽວ?",
      message: `ຖ້ຽວ ${docNo} ຈະຖືກປິດ`,
      tone: "warning",
      confirmLabel: "ປິດຖ້ຽວ",
    });
    if (!ok) return;
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
      void confirm({ title: "ຜິດພາດ", message: userErrorMessage(error, "ບໍ່ສາມາດປິດຖ້ຽວໄດ້"), tone: "warning", single: true });
    } finally {
      setActingDoc(null);
    }
  };

  const handleApprove = async (docNo: string) => {
    const ok = await confirm({
      title: "ອະນຸມັດຖ້ຽວ?",
      message: `ຖ້ຽວ ${docNo} ຈະຖືກອະນຸມັດໃຫ້ຄົນຂັບເລີ່ມວຽກ`,
      tone: "info",
      confirmLabel: "ອະນຸມັດ",
    });
    if (!ok) return;
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
      void confirm({ title: "ຜິດພາດ", message: userErrorMessage(error, "ບໍ່ສາມາດອະນຸມັດຖ້ຽວໄດ້"), tone: "warning", single: true });
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
        job.user_created?.toLowerCase().includes(q) ||
        job.bill_nos?.toLowerCase().includes(q)
      );
    });
  }, [jobs, searchText, filter]);

  // % ພື້ນທີ່ບັນທຸກ — ໜ້ານີ້ບໍ່ແບ່ງໜ້າ ຈຶ່ງດຶງຕາມລາຍການທີ່ຖືກກອງແລ້ວ
  const { volumes, failed: volumesFailed } = useTripVolumes(
    filteredJobs.map((j) => j.doc_no)
  );

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ໃບງານ / ລໍຖ້າອະນຸມັດ"
        subtitle="ຈັດການ ຈັດຖ້ຽວ ອະນຸມັດ ແລະ ຕິດຕາມສະຖານະ"
        icon={<FaTruck />}
        tone="sky"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshJobs}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg glass px-3 py-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-all disabled:opacity-60"
            >
              <FaSyncAlt className={isRefreshing ? "animate-spin" : ""} size={11} />
              ຣີເຟຣຊ
            </button>
            <Link
              href="/jobs/add"
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-teal-800 transition-all"
            >
              <FaPlus size={11} /> ເພີ່ມຖ້ຽວ
            </Link>
          </div>
        }
      />

      <StatusStatGrid
        stats={[
          { label: "ທັງໝົດ", value: stats.total, icon: <FaClipboardList />, tone: "sky" },
          { label: "ລໍອະນຸມັດ", value: stats.pending, icon: <FaClock />, tone: "amber" },
          { label: "ດຳເນີນງານ", value: stats.inProgress, icon: <FaTruck />, tone: "sky" },
          { label: "ສຳເລັດ", value: stats.done, icon: <FaCheckCircle />, tone: "emerald" },
        ]}
      />

      <StatusControlPanel>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ຄົ້ນຫາເລກຖ້ຽວ, ລົດ, ຄົນຂັບ..."
              className="w-full pl-9 pr-9 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 transition-all"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label="ລ້າງ"
              >
                <FaTimes size={10} />
              </button>
            )}
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-white/30 dark:bg-white/5 p-1">
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
                  filter === opt.key
                    ? "bg-teal-700 text-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                {opt.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                    filter === opt.key
                      ? "bg-white/20 text-white"
                      : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {opt.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </StatusControlPanel>

      <StatusTableShell count={filteredJobs.length}>
        {jobs.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaClipboardList className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ຍັງບໍ່ມີຖ້ຽວ</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ເພີ່ມຖ້ຽວໃໝ່ເພື່ອເລີ່ມ</p>
            <Link
              href="/jobs/add"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <FaPlus size={11} /> ເພີ່ມຖ້ຽວ
            </Link>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaSearch className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 font-semibold text-slate-600 dark:text-slate-300">
                  <th className="px-4 py-3 whitespace-nowrap w-8" aria-label="ຂະຫຍາຍ" />
                  <th className="px-4 py-3 whitespace-nowrap text-left">ເລກທີ / ວັນທີ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">ວັນຈັດສົ່ງ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">ລົດ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">ຄົນຂັບ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">ກຳມະກອນ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">ບິນ / ລະຫັດບິນ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">% ທີ່ຂົນ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-left">ສະຖານະ</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <JobRow
                    key={job.doc_no}
                    job={job}
                    volume={volumes[job.doc_no]}
                    volumeFailed={volumesFailed}
                    expanded={expandedDoc === job.doc_no}
                    onToggle={() => void toggleBillDetails(job.doc_no)}
                    onEdit={() => router.push(`/jobs/edit?id=${job.doc_no}`)}
                    onApprove={() => void handleApprove(job.doc_no)}
                    onDelete={() => void handleDelete(job.doc_no)}
                    onClose={() => void handleClose(job.doc_no)}
                    onMoveBill={(bill) => void openMoveBill(job.doc_no, bill)}
                    actingDoc={actingDoc}
                    billDetails={billDetailsByDoc[job.doc_no]}
                    loadingBills={loadingDoc === job.doc_no}
                    now={now}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusTableShell>

      {moveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeMoveBill(); }}
        >
          <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">ຍ້າຍບິນໄປຖ້ຽວອື່ນ</h3>
                <p className="text-[11px] text-slate-500 truncate">
                  ບິນ {moveTarget.bill.bill_no} · ຈາກຖ້ຽວ {moveTarget.sourceDocNo}
                </p>
              </div>
              <button
                type="button"
                onClick={closeMoveBill}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <FaTimes size={12} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {moveLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <FaSpinner className="animate-spin text-teal-500" size={13} />
                  <span className="text-xs text-slate-500">ກຳລັງໂຫຼດ...</span>
                </div>
              ) : moveOptions.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">ບໍ່ມີຖ້ຽວປາຍທາງທີ່ຍັງບໍ່ຮັບ</p>
              ) : (
                <div className="space-y-1.5">
                  {moveOptions.map((opt) => {
                    const active = movePickedDocNo === opt.doc_no;
                    return (
                      <button
                        key={opt.doc_no}
                        type="button"
                        onClick={() => setMovePickedDocNo(opt.doc_no)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-teal-500 bg-teal-500/10"
                            : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{opt.doc_no}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {opt.bill_count} ບິນ
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          ຈັດສົ່ງ {opt.date_logistic} · {opt.car} / {opt.driver}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              <button
                type="button"
                onClick={closeMoveBill}
                disabled={moveSaving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmMoveBill()}
                disabled={!movePickedDocNo || moveSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moveSaving ? <FaSpinner className="animate-spin" size={11} /> : <FaTruck size={11} />}
                ຍ້າຍບິນ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

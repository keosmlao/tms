"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FaBroadcastTower,
  FaCalendar,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClipboardCheck,
  FaClock,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";

interface JobRow {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  driver_closed_at: string | null;
  car: string;
  driver: string;
  user_created: string;
  approve_user: string;
  item_bill: number;
  pending_pickup_count: number;
  picked_count: number;
  miles_start: string;
  miles_end: string;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

interface BillWithProducts {
  bill_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  count_item: number;
  telephone: string;
  products: Product[];
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

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

function ElapsedTimer({ closedAt }: { closedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const closed = parseDDMMYYYYHHMM(closedAt);
  if (!closed) return <span>-</span>;

  const diffMs = now - closed.getTime();
  const text = formatElapsed(diffMs);

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-mono font-semibold tabular-nums">
      <FaClock size={8} className="animate-pulse" />
      {text}
    </span>
  );
}

export default function JobsClosedByDriverPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [fromDate, setFromDate] = useState(getFixedTodayDate());
  const [toDate, setToDate] = useState(getFixedTodayDate());
  const [searchText, setSearchText] = useState("");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [billsWithProducts, setBillsWithProducts] = useState<Record<string, BillWithProducts[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  const load = () => {
    void Actions.getJobsClosedByDriver(fromDate, toDate)
      .then((data) => setJobs(data as JobRow[]))
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredJobs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return jobs;
    return jobs.filter((job) =>
      [job.doc_no, job.doc_date, job.date_logistic, job.car, job.driver, job.user_created, job.approve_user]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [jobs, searchText]);

  const summary = useMemo(() => {
    return filteredJobs.reduce(
      (result, job) => {
        result.jobs += 1;
        result.pending += toNumber(job.pending_pickup_count);
        result.picked += toNumber(job.picked_count);
        result.bills += toNumber(job.item_bill);
        return result;
      },
      { jobs: 0, pending: 0, picked: 0, bills: 0 }
    );
  }, [filteredJobs]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / perPage));
  const pagedJobs = filteredJobs.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleDetails = async (docNo: string) => {
    if (expandedDoc === docNo) {
      setExpandedDoc(null);
      return;
    }
    setExpandedDoc(docNo);
    if (billsWithProducts[docNo]) return;

    setLoadingDoc(docNo);
    try {
      const products = await Actions.getJobBillsWithProducts(docNo) as BillWithProducts[];
      setBillsWithProducts((current) => ({ ...current, [docNo]: products }));
    } catch (error) {
      console.error(error);
      setBillsWithProducts((current) => ({ ...current, [docNo]: [] }));
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleClose = async (docNo: string) => {
    if (!confirm("ຕ້ອງການໃຫ້ admin ປິດຖ້ຽວນີ້ແທ້ບໍ່?")) return;
    setActingDoc(docNo);
    try {
      await Actions.closeJob(docNo);
      setJobs((current) => current.filter((job) => job.doc_no !== docNo));
      if (expandedDoc === docNo) setExpandedDoc(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "ບໍ່ສາມາດປິດຖ້ຽວໄດ້");
    } finally {
      setActingDoc(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
          <FaClipboardCheck className="text-sky-600 dark:text-sky-400 text-lg" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">ຄົນຂັບປິດງານ</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">ຖ້ຽວທີ່ຄົນຂັບປິດແລ້ວ ລໍ admin ປິດທ້າຍ</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="glass rounded-lg p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} /> ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">ເຖິງວັນທີ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
          >
            ຄົ້ນຫາ
          </button>
        </form>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ຖ້ຽວຄ້າງລໍ admin ປິດ</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">{summary.jobs}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <FaClipboardCheck className="text-sky-600 dark:text-sky-400" />
            </div>
          </div>
        </div>
        <div className="glass rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ບິນທັງໝົດ</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">{summary.bills}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
              <FaRoute className="text-slate-600 dark:text-slate-400" />
            </div>
          </div>
        </div>
        <div className="glass rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ບິນລໍເບີກ</p>
              <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.pending}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FaClock className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </div>
        <div className="glass rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ບິນເບີກແລ້ວ</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.picked}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <FaCheckCircle className="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="glass rounded-lg p-4">
        <div className="max-w-md">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            <FaSearch className="inline mr-1.5 text-slate-400" size={11} /> ຄົ້ນຫາ
          </label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
            placeholder="ຄົ້ນຫາເລກຖ້ຽວ, ລົດ, ຄົນຂັບ..."
            className="w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            ພົບ <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredJobs.length}</span> ລາຍການ
          </p>
          <p className="text-[11px] text-slate-400">ສະເພາະຂໍ້ມູນປີ 2026</p>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaClipboardCheck className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ບໍ່ມີຖ້ຽວຄ້າງລໍ admin ປິດ"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລກທີ / ວັນທີ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນຈັດສົ່ງ / ປິດເມື່ອ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລົດ / ຄົນຂັບ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຄວາມຄືບໜ້າບິນ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ໄມລ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedJobs.map((job) => {
                    const isExpanded = expandedDoc === job.doc_no;
                    const products = billsWithProducts[job.doc_no] ?? [];

                    return (
                      <Fragment key={job.doc_no}>
                        <tr className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <button onClick={() => void toggleDetails(job.doc_no)} className="flex items-center gap-2 text-left">
                              <span className="w-5 h-5 rounded-md bg-white/30 dark:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                                {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                              </span>
                              <span>
                                <span className="block font-semibold text-slate-800 dark:text-white">{job.doc_no}</span>
                                <span className="block text-[11px] text-slate-500">{job.doc_date}</span>
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            <div className="space-y-1">
                              <p>{job.date_logistic}</p>
                              {job.driver_closed_at && (
                                <p className="text-[11px] text-slate-400">ປິດ {job.driver_closed_at}</p>
                              )}
                              {job.driver_closed_at && <ElapsedTimer closedAt={job.driver_closed_at} />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                            <div className="space-y-1">
                              <p className="font-medium">{job.car}</p>
                              <p className="text-[11px] text-slate-500">{job.driver}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                                <FaClock size={9} /> ລໍ {toNumber(job.pending_pickup_count)}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                                <FaCheckCircle size={9} /> ເບີກ {toNumber(job.picked_count)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-[11px]">
                            {job.miles_start || "-"} → {job.miles_end || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                              ຄົນຂັບປິດງານ
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {job.car && (
                                <Link
                                  href={`/tracking/cars-map?focus=${encodeURIComponent(job.car)}`}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10 transition-colors"
                                  title={`ຕິດຕາມລົດ ${job.car}`}
                                >
                                  <FaBroadcastTower size={12} />
                                </Link>
                              )}
                              <button
                                onClick={() => void handleClose(job.doc_no)}
                                disabled={actingDoc === job.doc_no}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sky-600 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title="admin ປິດຖ້ຽວ"
                              >
                                {actingDoc === job.doc_no ? <FaSpinner className="animate-spin" size={12} /> : <FaCheckCircle size={12} />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0 bg-slate-50/60 dark:bg-black/20">
                              <div className="m-3 rounded-lg glass overflow-hidden">
                                <div className="px-4 py-3 bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">ລາຍການບິນໃນຖ້ຽວ {job.doc_no}</p>
                                    <p className="text-[11px] text-slate-500">{toNumber(job.item_bill)} ບິນ</p>
                                  </div>
                                  <button onClick={() => setExpandedDoc(null)} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">ປິດ</button>
                                </div>
                                <div className="p-3">
                                  {loadingDoc === job.doc_no ? (
                                    <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                                      <FaSpinner className="animate-spin" size={12} /> ກຳລັງໂຫຼດ...
                                    </div>
                                  ) : products.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-slate-400">ບໍ່ພົບລາຍການບິນ</div>
                                  ) : (
                                    <div className="space-y-2">
                                      {products.map((bill, idx) => (
                                        <div key={`${job.doc_no}-${bill.bill_no}`} className="glass-subtle rounded-lg overflow-hidden">
                                          <div className="px-3 py-2.5 bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                                                <div>
                                                  <p className="text-xs font-semibold text-slate-800 dark:text-white">{bill.bill_no}</p>
                                                  <p className="text-[10px] text-slate-500">{bill.bill_date} · {bill.cust_name || bill.cust_code}</p>
                                                </div>
                                              </div>
                                              <span className="text-[10px] font-medium text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded">{toNumber(bill.count_item)} ລາຍການ</span>
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
                                                  {bill.products.map((product, pIdx) => (
                                                    <tr key={`${bill.bill_no}-${product.item_code}-${pIdx}`} className="border-b border-slate-200/20 dark:border-white/5 last:border-0">
                                                      <td className="py-1 pl-2 pr-1 text-slate-400">{pIdx + 1}</td>
                                                      <td className="py-1 px-1 font-mono text-[9px] text-slate-500">{product.item_code}</td>
                                                      <td className="py-1 px-1 text-slate-700 dark:text-slate-300">{product.item_name}</td>
                                                      <td className="py-1 px-1 text-right font-semibold text-teal-600">{product.qty}</td>
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
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/30 dark:border-white/5">
                <p className="text-[11px] text-slate-500">
                  ສະແດງ {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filteredJobs.length)} ຈາກ {filteredJobs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((v) => Math.max(1, v - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ກ່ອນ
                  </button>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((v) => Math.min(totalPages, v + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ຕໍ່ໄປ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

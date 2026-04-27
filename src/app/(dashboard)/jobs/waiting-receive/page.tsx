"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FaBroadcastTower,
  FaCalendar,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaRoute,
  FaSearch,
  FaSpinner,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
} from "@/components/status-page-shell";
import {
  ElapsedTimer,
  Pagination,
  StatusBadge,
  toNumber,
} from "@/components/status-page-helpers";
import {
  JobBillsAccordion,
  type JobBill,
} from "@/components/job-bills-accordion";

interface JobRow {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  created_at: string;
  car: string;
  driver: string;
  user_created: string;
  approve_user: string;
  item_bill: number;
}

export default function JobsWaitingReceivePage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [fromDate, setFromDate] = useState(getFixedTodayDate());
  const [toDate, setToDate] = useState(getFixedTodayDate());
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [billsByDoc, setBillsByDoc] = useState<Record<string, JobBill[]>>({});
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const perPage = 20;

  const load = () => {
    setLoading(true);
    void Actions.getJobsWaitingReceive(fromDate, toDate)
      .then((data) => setJobs(data as JobRow[]))
      .catch(console.error)
      .finally(() => setLoading(false));
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

  const summary = useMemo(
    () =>
      filteredJobs.reduce(
        (r, j) => {
          r.jobs += 1;
          r.bills += toNumber(j.item_bill);
          return r;
        },
        { jobs: 0, bills: 0 }
      ),
    [filteredJobs]
  );

  const toggleDetails = async (docNo: string) => {
    if (expandedDoc === docNo) {
      setExpandedDoc(null);
      return;
    }
    setExpandedDoc(docNo);
    if (billsByDoc[docNo]) return;
    setLoadingDoc(docNo);
    try {
      const data = await Actions.getJobBillsWithProducts(docNo);
      setBillsByDoc((c) => ({ ...c, [docNo]: data as JobBill[] }));
    } catch (e) {
      console.error(e);
      setBillsByDoc((c) => ({ ...c, [docNo]: [] }));
    } finally {
      setLoadingDoc(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / perPage));
  const pagedJobs = filteredJobs.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ລໍຖ້າຮັບຖ້ຽວ"
        subtitle="ຖ້ຽວທີ່ອະນຸມັດແລ້ວ ລໍຄົນຂັບກົດ ‘ຮັບຖ້ຽວ’"
        icon={<FaClock />}
        tone="amber"
      />

      <StatusStatGrid
        stats={[
          { label: "ຖ້ຽວທີ່ລໍຮັບ", value: summary.jobs, icon: <FaClock />, tone: "amber" },
          { label: "ບິນທັງໝົດ", value: summary.bills, icon: <FaRoute />, tone: "slate" },
        ]}
      />

      <StatusControlPanel>
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
          <div className="flex-[1.4] min-w-[220px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaSearch className="inline mr-1.5 text-slate-400" size={11} /> ຄົ້ນຫາ
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ຄົ້ນຫາເລກຖ້ຽວ, ລົດ, ຄົນຂັບ..."
              className="w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "ກຳລັງໂຫຼດ..." : "ຄົ້ນຫາ"}
          </button>
        </form>
      </StatusControlPanel>

      <StatusTableShell count={filteredJobs.length}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaClock className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ບໍ່ມີຖ້ຽວທີ່ລໍຮັບ"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລກທີ / ວັນທີ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນຈັດສົ່ງ / ສ້າງເມື່ອ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລົດ / ຄົນຂັບ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ບິນ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສ້າງ / ອະນຸມັດ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedJobs.map((job) => {
                    const isExpanded = expandedDoc === job.doc_no;
                    return (
                      <Fragment key={job.doc_no}>
                        <tr className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => void toggleDetails(job.doc_no)}
                              className="flex items-center gap-2 text-left"
                            >
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
                              <p className="text-[11px] text-slate-400">ສ້າງ {job.created_at}</p>
                              <ElapsedTimer since={job.created_at} tone="amber" />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                            <div className="space-y-1">
                              <p className="font-medium">{job.car}</p>
                              <p className="text-[11px] text-slate-500">{job.driver}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700 dark:text-slate-200">
                            {toNumber(job.item_bill)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            <div className="space-y-1">
                              <p className="text-[11px]">ສ້າງ: <span className="font-medium text-slate-700 dark:text-slate-200">{job.user_created}</span></p>
                              <p className="text-[11px]">ອະນຸມັດ: <span className="font-medium text-slate-700 dark:text-slate-200">{job.approve_user}</span></p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone="amber" label="ລໍຖ້າຮັບຖ້ຽວ" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {job.car && (
                              <Link
                                href={`/tracking/cars-map?focus=${encodeURIComponent(job.car)}`}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10 transition-colors"
                                title={`ຕິດຕາມລົດ ${job.car}`}
                              >
                                <FaBroadcastTower size={12} />
                              </Link>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0 bg-slate-50/60 dark:bg-black/20">
                              <JobBillsAccordion
                                docNo={job.doc_no}
                                createdAt={job.created_at}
                                bills={billsByDoc[job.doc_no] ?? []}
                                loading={loadingDoc === job.doc_no}
                                onClose={() => setExpandedDoc(null)}
                                accentTone="amber"
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={filteredJobs.length}
              perPage={perPage}
              onChange={setCurrentPage}
            />
          </>
        )}
      </StatusTableShell>
    </div>
  );
}

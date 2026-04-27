"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendar,
  FaPhone,
  FaSearch,
  FaSpinner,
  FaTruck,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { getFixedTodayDate } from "@/lib/fixed-year";
import {
  StatusControlPanel,
  StatusPageHeader,
  StatusStatGrid,
  StatusTableShell,
} from "@/components/status-page-shell";
import { Pagination, StatusBadge } from "@/components/status-page-helpers";

interface PartialBill {
  doc_date: string;
  doc_no: string;
  bill_no: string;
  bill_date: string;
  date_logistic: string;
  completed_at: string | null;
  cust_code: string;
  cust_name: string;
  telephone: string;
  car: string;
  driver: string;
  remark: string;
  selected_total: number;
  delivered_total: number;
  remaining_total: number;
}

const fmtNum = (v: number) =>
  v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, "");

export default function BillsPartialPage() {
  const [bills, setBills] = useState<PartialBill[]>([]);
  const [fromDate, setFromDate] = useState(getFixedTodayDate());
  const [toDate, setToDate] = useState(getFixedTodayDate());
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  const load = () => {
    setLoading(true);
    void Actions.getBillsPartialList(fromDate, toDate)
      .then((data) => setBills(data as PartialBill[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBills = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return bills;
    return bills.filter((b) =>
      [b.bill_no, b.doc_no, b.cust_name, b.cust_code, b.car, b.driver, b.telephone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [bills, searchText]);

  const summary = useMemo(
    () =>
      filteredBills.reduce(
        (r, b) => {
          r.bills += 1;
          r.delivered += Number(b.delivered_total ?? 0);
          r.remaining += Number(b.remaining_total ?? 0);
          return r;
        },
        { bills: 0, delivered: 0, remaining: 0 }
      ),
    [filteredBills]
  );

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / perPage));
  const pagedBills = filteredBills.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ບິນສົ່ງບໍ່ຄົບ"
        subtitle="ບິນທີ່ສົ່ງໄປແລ້ວແຕ່ມີສິນຄ້າເຫຼືອ"
        icon={<FaBoxOpen />}
        tone="amber"
      />

      <StatusStatGrid
        stats={[
          { label: "ບິນສົ່ງບໍ່ຄົບ", value: summary.bills, icon: <FaBoxOpen />, tone: "amber" },
          { label: "ຍອດສົ່ງແລ້ວ", value: fmtNum(summary.delivered), icon: <FaTruck />, tone: "emerald" },
          { label: "ຍອດເຫຼືອ", value: fmtNum(summary.remaining), icon: <FaBoxOpen />, tone: "rose" },
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
              placeholder="ຄົ້ນຫາເລກບິນ, ລູກຄ້າ, ລົດ, ຄົນຂັບ..."
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

      <StatusTableShell count={filteredBills.length}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
              <FaBoxOpen className="text-slate-400 dark:text-slate-500 text-xl" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchText.trim() ? "ບໍ່ພົບຂໍ້ມູນຕາມຄໍາຄົ້ນຫາ" : "ບໍ່ມີບິນສົ່ງບໍ່ຄົບ"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລກບິນ / ວັນທີ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສົ່ງເມື່ອ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລູກຄ້າ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຈັດ / ສົ່ງ / ເຫຼືອ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລົດ / ຄົນຂັບ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ໝາຍເຫດ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBills.map((b) => (
                    <tr
                      key={`${b.doc_no}-${b.bill_no}`}
                      className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="block font-mono font-semibold text-amber-600 dark:text-amber-400">{b.bill_no}</span>
                          <span className="block text-[11px] text-slate-500">{b.bill_date}</span>
                          <span className="block text-[10px] text-slate-400">ຖ້ຽວ {b.doc_no}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {b.completed_at ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-slate-700 dark:text-slate-200 font-medium">{b.cust_name}</p>
                          {b.telephone && (
                            <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                              <FaPhone size={9} /> {b.telephone}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span>
                          <span className="text-slate-500">{fmtNum(b.selected_total)}</span>
                          <span className="mx-1 text-slate-400">/</span>
                          <span className="text-emerald-600 dark:text-emerald-400">{fmtNum(b.delivered_total)}</span>
                          <span className="mx-1 text-slate-400">/</span>
                          <span className="text-rose-600 dark:text-rose-400 font-bold">{fmtNum(b.remaining_total)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        <div className="space-y-1">
                          <p className="font-medium">{b.car}</p>
                          <p className="text-[11px] text-slate-500">{b.driver}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500 max-w-[280px]">
                        {b.remark || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone="amber" label="ສົ່ງບໍ່ຄົບ" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              total={filteredBills.length}
              perPage={perPage}
              onChange={setCurrentPage}
            />
          </>
        )}
      </StatusTableShell>
    </div>
  );
}

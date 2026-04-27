"use client";

import { useEffect, useState } from "react";
import { FIXED_YEAR_END, FIXED_YEAR_START } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getApproveReport

interface ReportItem {
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  car: string;
  driver: string;
  item_bill: number;
  approve_user: string;
  user_created: string;
  job_status: string;
}

export default function ApproveReportPage() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fromDate, setFromDate] = useState(FIXED_YEAR_START);
  const [toDate, setToDate] = useState(FIXED_YEAR_END);
  const [loading, setLoading] = useState(true);

  const fetchItems = () => {
    setLoading(true);
    Actions.getApproveReport(fromDate, toDate)
      .then((data) => setItems(data as ReportItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">ລາຍການອະນຸມັດ</h1>
      <div className="glass rounded-lg p-4 mb-6">
        <form onSubmit={(e) => { e.preventDefault(); fetchItems(); }} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ຈາກວັນທີ</label>
            <input type="date" value={fromDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setFromDate(e.target.value)} className="glass-input px-3 py-2 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ຫາວັນທີ</label>
            <input type="date" value={toDate} min={FIXED_YEAR_START} max={FIXED_YEAR_END} onChange={(e) => setToDate(e.target.value)} className="glass-input px-3 py-2 rounded-lg" />
          </div>
          <button type="submit" className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors">ຄົ້ນຫາ</button>
        </form>
      </div>
      <div className="glass rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/30 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ວັນທີ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ເລກທີ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ວັນທີຈັດສົ່ງ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ລົດ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຄົນຂັບ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຈຳນວນບິນ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຜູ້ອະນຸມັດ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຜູ້ສ້າງ</th>
              <th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ສະຖານະ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ກຳລັງໂຫຼດ...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ບໍ່ມີຂໍ້ມູນ</td></tr>
            ) : items.map((item) => (
              <tr key={item.doc_no} className="border-t border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5">
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.doc_date}</td>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{item.doc_no}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.date_logistic}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.car}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.driver}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.item_bill}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.approve_user}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.user_created}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.job_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

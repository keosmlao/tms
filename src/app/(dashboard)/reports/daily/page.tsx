"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaCalendar,
  FaCalendarDay,
  FaCheckCircle,
  FaClock,
  FaListUl,
  FaMapMarkerAlt,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTruck,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getReportDaily

interface ReportItem {
  /** ວັນ/ເວລາທີ່ຜູ້ຈັດຖ້ຽວສ້າງໃບງານ (odg_tms.create_date_time_now — ເວລາລາວ) */
  doc_date: string;
  doc_no: string;
  date_logistic: string;
  job_code: string;
  /** ວັນ/ເວລາທີ່ຄົນຂັບກົດເລີ່ມສົ່ງບິນທຳອິດຂອງຖ້ຽວ */
  sent_start: string | null;
  car: string;
  driver: string;
  item_bill: number;
  user_created: string;
  status: string;
  job_status: number;
  imei: string;
}

const STATUS_STYLES: Record<number, { badge: string; dot: string }> = {
  0: { badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  1: { badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  2: { badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  3: { badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
};

const FALLBACK_STATUS = { badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" };

// ຖ້ຽວມີສອງວັນທີ: ວັນທີ່ຜູ້ຈັດຖ້ຽວສ້າງໃບງານ ແລະ ວັນທີ່ນັດອອກລົດສົ່ງ. ຈັດຖ້ຽວ
// ລ່ວງໜ້າເຮັດໃຫ້ສອງອັນນີ້ຄົນລະວັນ ຈຶ່ງຕ້ອງເລືອກໄດ້ວ່າຈະນັບຖ້ຽວເຂົ້າວັນໃດ.
type DateField = "logistic" | "dispatch";

const DATE_FIELDS: { key: DateField; label: string; hint: string }[] = [
  { key: "logistic", label: "ວັນຈັດສົ່ງ", hint: "ນັບຖ້ຽວເຂົ້າວັນທີ່ນັດອອກລົດສົ່ງ" },
  { key: "dispatch", label: "ວັນຈັດຖ້ຽວ", hint: "ນັບຖ້ຽວເຂົ້າວັນທີ່ຜູ້ຈັດຖ້ຽວສ້າງໃບງານ" },
];

export default function DailyReportPage() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fromDate, setFromDate] = useState(() => getFixedTodayDate());
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  // ຊ່ວງວັນທີກັ່ນຕອງດ້ວຍວັນໃດ — ສອງອັນນີ້ຕ່າງກັນເມື່ອຖ້ຽວຖືກຈັດລ່ວງໜ້າ
  const [dateField, setDateField] = useState<DateField>("logistic");
  const perPage = 20;

  const fetchItems = (field: DateField = dateField) => {
    setLoading(true);
    setCurrentPage(1);
    Actions.getReportDaily(fromDate, toDate, field)
      .then((data) => setItems(data as ReportItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.job_status === 3).length;
    const inProgress = items.filter((i) => i.job_status === 1 || i.job_status === 2).length;
    return { total, completed, inProgress };
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const pagedItems = items.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 flex items-center justify-center shadow-md">
          <FaCalendarDay className="text-white text-lg" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">ລາຍງານການຈັດສົ່ງປະຈຳວັນ</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ສະຫຼຸບຖ້ຽວຕາມ{" "}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {DATE_FIELDS.find((f) => f.key === dateField)?.label}
            </span>{" "}
            ຈາກວັນທີ–ຫາວັນທີ
            <span className="text-slate-400"> · ຈັດຖ້ຽວລ່ວງໜ້າເຮັດໃຫ້ສອງວັນນີ້ຄົນລະວັນ</span>
          </p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="glass rounded-lg p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchItems();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          {/* ສະຫຼັບວ່າຊ່ວງວັນທີຂ້າງລຸ່ມກັ່ນຕອງດ້ວຍວັນໃດ — ກົດແລ້ວດຶງໃໝ່ທັນທີ
              ຈຶ່ງບໍ່ຕ້ອງກົດ "ຄົ້ນຫາ" ຊ້ຳ ແລະ ບໍ່ມີຊ່ວງທີ່ປຸ່ມກັບຕາຕະລາງບໍ່ຕົງກັນ. */}
          <div className="w-full">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} />
              ນັບຖ້ຽວຕາມ
            </label>
            <div className="inline-flex rounded-lg bg-white/40 dark:bg-white/5 p-0.5 ring-1 ring-slate-200/60 dark:ring-white/10">
              {DATE_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  title={f.hint}
                  onClick={() => {
                    if (f.key === dateField) return;
                    setDateField(f.key);
                    fetchItems(f.key);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    dateField === f.key
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} />
              ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              min={FIXED_YEAR_START}
              max={toDate || FIXED_YEAR_END}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar className="inline mr-1.5 text-slate-400" size={11} />
              ຫາວັນທີ
            </label>
            <input
              type="date"
              value={toDate}
              min={fromDate || FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </form>
      </div>

      {/* Summary Cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="ຈຳນວນຖ້ຽວ"
            value={stats.total}
            icon={<FaRoute />}
            accent="text-teal-600"
            iconBg="bg-teal-500/10 text-teal-600 dark:text-teal-400"
          />
          <StatCard
            label="ກຳລັງສົ່ງ"
            value={stats.inProgress}
            icon={<FaClock />}
            accent="text-sky-600"
            iconBg="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          />
          <StatCard
            label="ສຳເລັດ"
            value={stats.completed}
            icon={<FaCheckCircle />}
            accent="text-emerald-600"
            iconBg="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        {loading ? (
          <div className="glass rounded-lg p-12 text-center">
            <FaSpinner className="animate-spin text-teal-600 text-2xl mx-auto mb-3" />
            <p className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="glass rounded-lg p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-500/10 flex items-center justify-center mx-auto mb-4">
              <FaListUl className="text-slate-400 text-2xl" />
            </div>
            <p className="text-sm font-medium text-slate-600">ບໍ່ມີຂໍ້ມູນ</p>
            <p className="text-xs text-slate-400 mt-1">ລອງປ່ຽນຊ່ວງວັນທີແລ້ວຄົ້ນຫາໃໝ່</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-slate-500">
                ພົບ <span className="font-semibold text-slate-700">{items.length}</span> ລາຍການ
              </p>
              <p className="text-[11px] text-slate-400">
                {fromDate} → {toDate}
              </p>
            </div>

            <div className="glass rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນທີຈັດຖ້ຽວ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນທີຈັດສົ່ງ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລກທີ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລົດ / ຄົນຂັບ</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຈຳນວນບິນ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ຜູ້ສ້າງ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເລີ່ມຈັດສົ່ງ</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ວັນທີປິດ</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((item, index) => {
                      const statusStyle = STATUS_STYLES[item.job_status] || FALLBACK_STATUS;
                      return (
                        <tr
                          key={item.doc_no}
                          className={`border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 transition-colors ${
                            index % 2 === 1 ? "bg-white/10 dark:bg-white/[0.02]" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg text-[10px] font-medium">
                              {(currentPage - 1) * perPage + index + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.doc_date}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">{item.date_logistic}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">{item.doc_no}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="flex items-center gap-1.5 text-slate-700">
                                <FaTruck size={9} className="text-slate-400" />
                                {item.car || "-"}
                              </span>
                              <span className="text-[10px] text-slate-500 mt-0.5">{item.driver || "-"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{item.item_bill}</td>
                          <td className="px-4 py-3 text-slate-500">{item.user_created || "-"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{item.sent_start || "-"}</td>
                          <td className="px-4 py-3 text-slate-500">{item.job_code || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            {item.imei ? (
                              <a
                                href={`/tracking/map?imei=${item.imei}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 transition-colors"
                                title="ເບິ່ງແຜນທີ່"
                              >
                                <FaMapMarkerAlt size={11} />
                              </a>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/30 dark:border-white/5">
                  <p className="text-[11px] text-slate-500">
                    ສະແດງ {(currentPage - 1) * perPage + 1}-
                    {Math.min(currentPage * perPage, items.length)} ຈາກ {items.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ກ່ອນ
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                      .map((p, i, arr) => (
                        <span key={p}>
                          {i > 0 && arr[i - 1] !== p - 1 && (
                            <span className="px-1 text-slate-400">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              p === currentPage
                                ? "bg-teal-600 text-white"
                                : "glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5"
                            }`}
                          >
                            {p}
                          </button>
                        </span>
                      ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg glass text-slate-600 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ຕໍ່ໄປ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  iconBg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-100 p-4 flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1.5 text-xl font-bold ${accent}`}>{value.toLocaleString("en-US")}</p>
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
  );
}

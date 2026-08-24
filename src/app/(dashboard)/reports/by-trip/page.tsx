"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBan,
  FaBoxOpen,
  FaCalendar,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaIdCard,
  FaListUl,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTruck,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
// Ported from server actions: getReportByTrip, getReportTripBills

interface Car {
  code: string;
  name_1: string;
}

interface Driver {
  code: string;
  name_1: string;
}

interface Round {
  code: string;
  name: string;
  time_label: string;
}

interface TripRow {
  doc_no: string;
  doc_date: string;
  date_logistic: string;
  created_at: string;
  car_code: string;
  car: string;
  driver_code: string;
  driver: string;
  user_created: string;
  round_code: string;
  round_name: string;
  round_time_label: string;
  route_name: string;
  item_bill: number;
  approve_status: number;
  job_status: number;
  status: string;
  bills_total: number;
  bills_delivered: number;
  bills_cancelled: number;
  bills_sending: number;
  bills_waiting: number;
  item_count: number;
  recipt_at: string | null;
  first_sent_at: string | null;
  last_sent_at: string | null;
  job_close: string | null;
  duration_min: number | null;
  miles_start: string;
  miles_end: string;
  distance_km: number | null;
  distance_source: string;
}

interface TripBill {
  bill_no: string;
  bill_date: string;
  customer: string;
  item_count: number;
  remark: string;
  status: number;
  status_trans: string;
  recipt_job: string | null;
  sent_start: string | null;
  sent_end: string | null;
}

interface Totals {
  trips: number;
  /** ນິຍາມ "ຖ້ຽວ" ຢູ່ໜ້າ BI/ໜ້າຫຼັກ = ສະເພາະທີ່ອະນຸມັດແລ້ວ */
  trips_approved: number;
  trips_pending_approval: number;
  bills: number;
  delivered: number;
  cancelled: number;
  pending: number;
  items: number;
  km: number;
}

const EMPTY_TOTALS: Totals = {
  trips: 0,
  trips_approved: 0,
  trips_pending_approval: 0,
  bills: 0,
  delivered: 0,
  cancelled: 0,
  pending: 0,
  items: 0,
  km: 0,
};

// ==================== Helpers ====================

const STATUS_TONES: Record<number, { bg: string; dot: string }> = {
  0: { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  1: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  2: { bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  3: { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  4: { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
};
const DEFAULT_STATUS_TONE = { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" };

function statusTone(row: TripRow) {
  if (row.approve_status === 0) return STATUS_TONES[0];
  return STATUS_TONES[row.job_status] ?? DEFAULT_STATUS_TONE;
}

function billTone(bill: TripBill) {
  if (!bill.sent_start) return STATUS_TONES[0];
  if (!bill.sent_end) return STATUS_TONES[2];
  return bill.status === 1 ? STATUS_TONES[3] : { bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400", dot: "bg-rose-500" };
}

function formatKm(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const km = Number(value);
  if (!Number.isFinite(km)) return "-";
  return km.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// ໄລຍະເວລາຂອງຖ້ຽວ ນັບຈາກເລີ່ມສົ່ງບິນທຳອິດ ຫາ ຕອນປິດຖ້ຽວ.
function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "-";
  const total = Math.max(0, Math.round(Number(minutes)));
  if (!Number.isFinite(total)) return "-";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ຊມ ${m} ນທ` : `${m} ນທ`;
}

// ==================== UI pieces ====================

function SummaryCard({
  label,
  value,
  icon,
  color,
  caption,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: "teal" | "sky" | "amber" | "emerald" | "rose";
  caption?: string;
}) {
  const palette = {
    teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  }[color];
  const display = typeof value === "number" ? value.toLocaleString("en-US") : value;
  return (
    <div className="rounded-lg bg-white border border-slate-100 p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${palette.text}`}>{display}</p>
        {caption ? <p className="mt-0.5 text-[10px] text-slate-400 truncate">{caption}</p> : null}
      </div>
      <div className={`w-10 h-10 rounded-lg ${palette.bg} ${palette.text} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "teal" | "emerald" | "amber" | "sky";
}) {
  const palette = {
    teal: "from-teal-500/20 to-teal-400/20 ring-teal-300/30 text-teal-100",
    emerald: "from-emerald-500/20 to-teal-500/20 ring-emerald-300/30 text-emerald-100",
    amber: "from-amber-500/20 to-orange-500/20 ring-amber-300/30 text-amber-100",
    sky: "from-sky-500/20 to-cyan-500/20 ring-sky-300/30 text-sky-100",
  }[color];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${palette} backdrop-blur border border-white/10 px-3 py-1.5 ring-1 text-[11px]`}
    >
      <span className="opacity-80">{label}</span>
      <span className="font-bold text-white tabular-nums">{value}</span>
    </div>
  );
}

// ໜ້ອຍໆຢູ່ໃນຖັນ "ບິນ": ສຳເລັດ / ຍົກເລີກ / ຄ້າງ
function BillBreakdown({ row }: { row: TripRow }) {
  const pending = Number(row.bills_sending || 0) + Number(row.bills_waiting || 0);
  return (
    <div className="flex items-center justify-center gap-1 text-[10px] font-bold tabular-nums">
      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" title="ຈັດສົ່ງສຳເລັດ">
        {row.bills_delivered}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400" title="ຍົກເລີກ">
        {row.bills_cancelled}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400" title="ຄ້າງ / ກຳລັງສົ່ງ">
        {pending}
      </span>
    </div>
  );
}

// ==================== Main ====================

export default function ByTripReportPage() {
  const [rows, setRows] = useState<TripRow[]>([]);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [cars, setCars] = useState<Car[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);

  const [fromDate, setFromDate] = useState(() => getFixedTodayDate());
  const [toDate, setToDate] = useState(() => getFixedTodayDate());
  const [carId, setCarId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [roundCode, setRoundCode] = useState("");
  const [searchText, setSearchText] = useState("");

  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [billsByTrip, setBillsByTrip] = useState<Record<string, TripBill[]>>({});
  const [loadingBills, setLoadingBills] = useState<string | null>(null);

  const fetchRows = useCallback(() => {
    setLoading(true);
    setExpanded(null);
    Actions.getReportByTrip(fromDate, toDate, { carId, driverId, roundCode })
      .then((data) => {
        const payload = data as {
          rows: TripRow[];
          cars: Car[];
          drivers: Driver[];
          rounds: Round[];
          totals: Totals;
        };
        setRows(payload.rows || []);
        setCars(payload.cars || []);
        setDrivers(payload.drivers || []);
        setRounds(payload.rounds || []);
        setTotals(payload.totals || EMPTY_TOTALS);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fromDate, toDate, carId, driverId, roundCode]);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTrip = (docNo: string) => {
    if (expanded === docNo) {
      setExpanded(null);
      return;
    }
    setExpanded(docNo);
    if (billsByTrip[docNo]) return;
    setLoadingBills(docNo);
    Actions.getReportTripBills(docNo)
      .then((data) => setBillsByTrip((prev) => ({ ...prev, [docNo]: (data || []) as TripBill[] })))
      .catch(console.error)
      .finally(() => setLoadingBills(null));
  };

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.doc_no.toLowerCase().includes(q) ||
        r.car?.toLowerCase().includes(q) ||
        r.driver?.toLowerCase().includes(q) ||
        r.round_name?.toLowerCase().includes(q) ||
        r.route_name?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
    );
  }, [rows, searchText]);

  return (
    <div className="space-y-5">
      {/* ========== HERO ========== */}
      <div className="relative overflow-hidden rounded-lg bg-[#003260] p-5 sm:p-6 shadow-xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 10%, #f6921e 0%, transparent 35%), radial-gradient(circle at 90% 80%, #5ea9e4 0%, transparent 35%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <FaRoute className="text-sky-300" size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">Trip Report</p>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">ລາຍງານຕາມຖ້ຽວ</h1>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ສະຫຼຸບແຕ່ລະຖ້ຽວ: ບິນທີ່ບັນທຸກ, ຜົນຈັດສົ່ງ, ເວລາ ແລະ ໄລຍະທາງ
              </p>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <StatBadge label="ຖ້ຽວ" value={totals.trips} color="sky" />
              <StatBadge label="ບິນ" value={totals.bills} color="sky" />
              <StatBadge label="ສຳເລັດ" value={totals.delivered} color="emerald" />
              <StatBadge label="ຄ້າງ" value={totals.pending} color="amber" />
              <StatBadge label="ກມ. ລວມ" value={formatKm(totals.km)} color="teal" />
            </div>
          )}
        </div>
      </div>

      {/* ========== FILTER FORM ========== */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchRows();
        }}
        className="glass rounded-lg p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar size={10} className="text-slate-400" />
              ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={fromDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaCalendar size={10} className="text-slate-400" />
              ຫາວັນທີ
            </label>
            <input
              type="date"
              value={toDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaTruck size={10} className="text-slate-400" />
              ລົດ
            </label>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            >
              <option value="">ທັງໝົດ</option>
              {cars.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_1}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaIdCard size={10} className="text-slate-400" />
              ຄົນຂັບ
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            >
              <option value="">ທັງໝົດ</option>
              {drivers.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name_1}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              <FaClock size={10} className="text-slate-400" />
              ຮອບ
            </label>
            <select
              value={roundCode}
              onChange={(e) => setRoundCode(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-lg text-xs"
            >
              <option value="">ທັງໝົດ</option>
              {rounds.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                  {r.time_label ? ` · ${r.time_label}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSearch size={11} />}
            ຄົ້ນຫາ
          </button>
        </div>
      </form>

      {/* ========== RESULTS ========== */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 rounded-lg glass">
          <FaSpinner className="animate-spin text-teal-500" size={14} />
          <span className="text-sm text-slate-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg glass">
          <div className="w-14 h-14 rounded-lg bg-slate-500/10 flex items-center justify-center mb-3">
            <FaListUl className="text-slate-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700">ບໍ່ມີຖ້ຽວໃນຊ່ວງວັນທີນີ້</p>
          <p className="text-xs text-slate-400 mt-1">ລອງປ່ຽນຊ່ວງວັນທີ ຫຼື ຕົວກັ່ນຕອງ</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <SummaryCard
              label="ຖ້ຽວທັງໝົດ"
              value={totals.trips}
              icon={<FaRoute size={12} />}
              color="teal"
              caption={
                totals.trips_pending_approval > 0
                  ? `ອະນຸມັດແລ້ວ ${totals.trips_approved} · ລໍອະນຸມັດ ${totals.trips_pending_approval}`
                  : undefined
              }
            />
            <SummaryCard label="ບິນທັງໝົດ" value={totals.bills} icon={<FaBoxOpen size={12} />} color="sky" />
            <SummaryCard label="ສົ່ງສຳເລັດ" value={totals.delivered} icon={<FaCheckCircle size={12} />} color="emerald" />
            <SummaryCard label="ຍົກເລີກ" value={totals.cancelled} icon={<FaBan size={12} />} color="rose" />
            <SummaryCard label="ກມ. ທີ່ແລ່ນ" value={formatKm(totals.km)} icon={<FaRoute size={12} />} color="teal" />
          </div>

          {/* Sub-search */}
          <div className="relative">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ຄົ້ນຫາໃນຜົນ: ເລກຖ້ຽວ, ລົດ, ຄົນຂັບ, ຮອບ, ສາຍ, ສະຖານະ..."
              className="w-full pl-9 pr-9 py-2.5 glass-input rounded-lg text-sm"
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

          {/* Table */}
          <div className="overflow-hidden rounded-lg glass">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/30 dark:border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Trip Log</p>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍການຖ້ຽວ</h2>
              </div>
              <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                {filteredRows.length} / {rows.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2.5 text-left w-8"></th>
                    <th className="px-3 py-2.5 text-left">ວັນທີສົ່ງ</th>
                    <th className="px-3 py-2.5 text-left">ເລກຖ້ຽວ</th>
                    <th className="px-3 py-2.5 text-left">ຮອບ / ສາຍ</th>
                    <th className="px-3 py-2.5 text-left">ລົດ</th>
                    <th className="px-3 py-2.5 text-left">ຄົນຂັບ</th>
                    <th className="px-3 py-2.5 text-center">ບິນ</th>
                    <th className="px-3 py-2.5 text-center" title="ສຳເລັດ / ຍົກເລີກ / ຄ້າງ">
                      ຜົນ
                    </th>
                    <th className="px-3 py-2.5 text-center">ເລີ່ມ-ຈົບ</th>
                    <th className="px-3 py-2.5 text-right">ໃຊ້ເວລາ</th>
                    <th className="px-3 py-2.5 text-right">ກມ.</th>
                    <th className="px-3 py-2.5 text-left">ສະຖານະ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/30 dark:divide-white/5">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-xs text-slate-400">
                        ບໍ່ພົບຜົນທີ່ກົງກັບການຄົ້ນຫາ
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const tone = statusTone(row);
                      const isOpen = expanded === row.doc_no;
                      const bills = billsByTrip[row.doc_no];
                      return (
                        <Fragment key={row.doc_no}>
                          <tr
                            onClick={() => toggleTrip(row.doc_no)}
                            className="cursor-pointer hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="px-3 py-3 text-slate-400">
                              {isOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                            </td>
                            <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">{row.date_logistic}</td>
                            <td className="px-3 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {row.doc_no}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600">
                              <div className="truncate max-w-[150px]">
                                {row.round_name || "-"}
                                {row.route_name ? (
                                  <span className="text-slate-400"> · {row.route_name}</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                <FaTruck size={10} className="text-sky-500" />
                                <span className="font-medium truncate">{row.car || "-"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                <FaIdCard size={10} className="text-sky-500" />
                                <span className="truncate">{row.driver || "-"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold tabular-nums">
                                {row.bills_total || row.item_bill}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <BillBreakdown row={row} />
                            </td>
                            <td className="px-3 py-3 text-center text-[11px] tabular-nums text-slate-600 whitespace-nowrap">
                              {row.first_sent_at || row.last_sent_at
                                ? `${row.first_sent_at ?? "-"} → ${row.last_sent_at ?? "-"}`
                                : "-"}
                            </td>
                            <td className="px-3 py-3 text-right text-[11px] tabular-nums text-slate-600 whitespace-nowrap">
                              {formatDuration(row.duration_min)}
                            </td>
                            <td
                              className="px-3 py-3 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300"
                              title={
                                row.distance_source === "tracker"
                                  ? "ຈາກເລກໄມລ໌ tracker"
                                  : row.miles_start && row.miles_end
                                    ? `${row.miles_start} → ${row.miles_end}`
                                    : ""
                              }
                            >
                              {formatKm(row.distance_km)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${tone.bg}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                                {row.status}
                              </span>
                            </td>
                          </tr>

                          {isOpen && (
                            <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                              <td colSpan={12} className="px-6 py-4">
                                {loadingBills === row.doc_no ? (
                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <FaSpinner className="animate-spin text-teal-500" size={12} />
                                    ກຳລັງໂຫຼດບິນ...
                                  </div>
                                ) : !bills || bills.length === 0 ? (
                                  <p className="text-xs text-slate-400">ຖ້ຽວນີ້ຍັງບໍ່ມີບິນ</p>
                                ) : (
                                  <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-white/60 dark:bg-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                          <th className="px-3 py-2 text-left">ເລກບິນ</th>
                                          <th className="px-3 py-2 text-left">ວັນທີບິນ</th>
                                          <th className="px-3 py-2 text-left">ລູກຄ້າ</th>
                                          <th className="px-3 py-2 text-center">ລາຍການ</th>
                                          <th className="px-3 py-2 text-center">ເລີ່ມ-ຈົບ</th>
                                          <th className="px-3 py-2 text-left">ສະຖານະ</th>
                                          <th className="px-3 py-2 text-left">ໝາຍເຫດ</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200/40 dark:divide-white/5">
                                        {bills.map((bill) => {
                                          const bt = billTone(bill);
                                          return (
                                            <tr key={`${row.doc_no}-${bill.bill_no}`}>
                                              <td className="px-3 py-2 font-semibold text-slate-800 dark:text-white whitespace-nowrap">
                                                {bill.bill_no}
                                              </td>
                                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                                {bill.bill_date || "-"}
                                              </td>
                                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                {bill.customer}
                                              </td>
                                              <td className="px-3 py-2 text-center tabular-nums text-slate-600">
                                                {bill.item_count}
                                              </td>
                                              <td className="px-3 py-2 text-center tabular-nums text-slate-600 whitespace-nowrap">
                                                {bill.sent_start || bill.sent_end
                                                  ? `${bill.sent_start ?? "-"} → ${bill.sent_end ?? "-"}`
                                                  : "-"}
                                              </td>
                                              <td className="px-3 py-2">
                                                <span
                                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${bt.bg}`}
                                                >
                                                  <span className={`h-1.5 w-1.5 rounded-full ${bt.dot}`} />
                                                  {bill.status_trans}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-slate-500">{bill.remark || "-"}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

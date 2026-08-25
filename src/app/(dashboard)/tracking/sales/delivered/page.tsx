"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle,
  FaExternalLinkAlt,
  FaFlagCheckered,
  FaSearch,
  FaSpinner,
  FaSyncAlt,
  FaTruck,
  FaUser,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusStatGrid } from "@/components/status-page-shell";
import { WhatsappLink, buildBillWhatsappMessage } from "@/components/whatsapp-link";
import { userErrorMessage } from "@/lib/action-error";

interface DeliveredBillRow {
  bill_no: string;
  bill_date: string;
  customer_name: string;
  telephone: string;
  cust_code: string;
  sale_code?: string;
  salesperson: string;
  scope_readonly?: boolean;
  transport_name: string;
  sent_end_at: string;
  car: string;
  car_plate: string;
  driver: string;
}

function trackBase() {
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function trackingUrl(billNo: string) {
  const base = trackBase();
  return `${base}/track?bill=${encodeURIComponent(billNo)}`;
}

export default function SalesDeliveredBillsPage() {
  const [rows, setRows] = useState<DeliveredBillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const today = getFixedTodayDate();
  const [fromDate, setFromDate] = useState(`${today.slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today);

  const fetchRows = useCallback(() => {
    setLoading(true);
    setError(null);
    void Actions.getSalesDeliveredBillTrackingList({ fromDate, toDate })
      .then((data) => setRows((data ?? []) as DeliveredBillRow[]))
      .catch((e) => {
        console.error(e);
        setError(userErrorMessage(e, "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ"));
      })
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((r) =>
      [r.bill_no, r.customer_name, r.cust_code, r.telephone, r.salesperson, r.transport_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, search]);

  const showSalesperson = useMemo(() => rows.some((r) => r.scope_readonly), [rows]);
  const todayDisplay = useMemo(() => today.split("-").reverse().join("-"), [today]);
  const deliveredToday = useMemo(
    () => filtered.filter((r) => (r.sent_end_at || "").startsWith(todayDisplay)).length,
    [filtered, todayDisplay]
  );
  const withPhone = useMemo(() => filtered.filter((r) => r.telephone).length, [filtered]);

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ບິນສົ່ງສຳເລັດ"
        subtitle="ບິນທີ່ຈັດສົ່ງສຳເລັດແລ້ວ — ສົ່ງ link ຕິດຕາມໃຫ້ລູກຄ້າທາງ WhatsApp"
        icon={<FaFlagCheckered />}
        tone="emerald"
      />

      <StatusStatGrid
        columns={4}
        stats={[
          { label: "ບິນສຳເລັດ", value: filtered.length, icon: <FaCheckCircle />, tone: "emerald" },
          { label: "ສຳເລັດມື້ນີ້", value: deliveredToday, icon: <FaFlagCheckered />, tone: "teal" },
          { label: "ມີເບີລູກຄ້າ", value: withPhone, icon: <FaUser />, tone: "sky" },
          { label: "ບໍ່ມີເບີ", value: filtered.length - withPhone, icon: <FaUser />, tone: "slate" },
        ]}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/20 bg-white/40 p-3 dark:border-white/5 dark:bg-white/5">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
          ແຕ່ວັນທີ
          <input
            type="date"
            value={fromDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
          ຫາວັນທີ
          <input
            type="date"
            value={toDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <div className="relative flex-1 min-w-[180px]">
          <FaSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ຄົ້ນຫາ ເລກບິນ / ລູກຄ້າ / ເບີ"
            className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <button
          type="button"
          onClick={fetchRows}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? <FaSpinner className="animate-spin" size={12} /> : <FaSyncAlt size={12} />}
          ໂຫຼດຄືນ
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/40 dark:border-white/5 dark:bg-white/5">
        {error ? (
          <div className="p-6 text-center text-sm text-rose-500">{error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <FaSpinner className="animate-spin text-emerald-500" /> ກຳລັງໂຫຼດ...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">ບໍ່ມີບິນສົ່ງສຳເລັດໃນຊ່ວງວັນທີນີ້</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/40 text-left text-slate-500 dark:border-white/10">
                <th className="px-3 py-2 font-medium">ເລກບິນ</th>
                <th className="px-3 py-2 font-medium">ລູກຄ້າ</th>
                {showSalesperson && <th className="px-3 py-2 font-medium">ພະນັກງານຂາຍ</th>}
                <th className="px-3 py-2 font-medium">ສົ່ງສຳເລັດ</th>
                <th className="px-3 py-2 font-medium">ລົດ / ຄົນຂັບ</th>
                <th className="px-3 py-2 font-medium">ສາຍ</th>
                <th className="px-3 py-2 text-center font-medium">ຕິດຕາມ / ສົ່ງລູກຄ້າ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const url = trackingUrl(r.bill_no);
                const waMessage = buildBillWhatsappMessage({
                  billNo: r.bill_no,
                  customerName: r.customer_name,
                  carName: r.car || r.car_plate,
                  driverName: r.driver,
                  trackingUrl: url,
                });
                return (
                  <tr key={r.bill_no} className="border-b border-slate-200/20 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{r.bill_no}</td>
                    <td className="px-3 py-2">
                      <p className="text-slate-700 dark:text-slate-200">{r.customer_name}</p>
                      {r.telephone && <p className="text-[10px] text-slate-400">{r.telephone}</p>}
                    </td>
                    {showSalesperson && (
                      <td className="px-3 py-2 text-slate-500">{r.salesperson || "-"}</td>
                    )}
                    <td className="px-3 py-2 text-slate-500">{r.sent_end_at || "-"}</td>
                    <td className="px-3 py-2 text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <FaTruck size={10} className="text-slate-400" />
                        {[r.car || r.car_plate, r.driver].filter(Boolean).join(" · ") || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.transport_name || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ເປີດໜ້າຕິດຕາມ"
                          className="inline-flex items-center justify-center rounded-md p-1 text-sky-600 hover:bg-sky-500/15 dark:text-sky-400"
                        >
                          <FaExternalLinkAlt size={11} />
                        </a>
                        {r.telephone ? (
                          <WhatsappLink phone={r.telephone} message={waMessage} size={14} />
                        ) : (
                          <span className="text-[10px] text-slate-300">ບໍ່ມີເບີ</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

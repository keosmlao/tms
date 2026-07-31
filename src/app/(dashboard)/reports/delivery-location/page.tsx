"use client";

import { useEffect, useState } from "react";
import { FaMapMarkedAlt, FaSpinner, FaExternalLinkAlt } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusTableShell } from "@/components/status-page-shell";

interface Row {
  bill_no: string;
  doc_no: string;
  doc_date: string;
  closed_at: string;
  cust_code: string;
  cust_name: string;
  driver_name: string;
  transport_name: string;
  lat_end: string;
  lng_end: string;
  ref_lat: string;
  ref_lng: string;
  ref_bill_no: string;
  ref_at: string;
  distance_km: string;
}

interface Summary {
  compared: number;
  within_300m: number;
  within_2km: number;
  within_20km: number;
  beyond_20km: number;
  median_km: number;
  closed: number;
  without_gps: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const mapsUrl = (lat: string, lng: string) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

export default function DeliveryLocationPage() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [minKm, setMinKm] = useState(2);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await Actions.getDeliveryLocationReport({
        fromDate: from,
        toDate: to,
        minKm,
        limit: 300,
      })) as { rows: Row[]; summary: Summary };
      setRows(data.rows ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // ໂຫຼດເທື່ອດຽວຕອນເປີດ — ຫຼັງຈາກນັ້ນກົດປຸ່ມເອງ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (n: number) =>
    summary && summary.compared > 0
      ? `${((n / summary.compared) * 100).toFixed(0)}%`
      : "—";

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຈຸດປິດບິນ ທຽບກັບ ຈຸດສົ່ງລູກຄ້າ"
        subtitle="ບິນທີ່ຄົນຂັບກົດສຳເລັດຫ່າງຈາກຈຸດທີ່ເຄີຍສົ່ງ — ໄວ້ກວດ ບໍ່ແມ່ນຕັດສິນ"
        icon={<FaMapMarkedAlt />}
        tone="teal"
      />

      <div className="glass flex flex-wrap items-end gap-3 rounded-lg p-4">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500">ແຕ່ວັນ</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="glass-input mt-1 h-9 rounded-lg px-3 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500">ຫາວັນ</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="glass-input mt-1 h-9 rounded-lg px-3 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500">ຫ່າງເກີນ</label>
          <select
            value={minKm}
            onChange={(e) => setMinKm(Number(e.target.value))}
            className="glass-input mt-1 h-9 rounded-lg px-3 text-xs"
          >
            <option value={0.3}>300 ແມັດ</option>
            <option value={2}>2 ກມ.</option>
            <option value={20}>20 ກມ.</option>
            <option value={100}>100 ກມ.</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? <FaSpinner className="animate-spin" /> : "ເບິ່ງ"}
        </button>
      </div>

      {error && <p className="text-[11px] text-rose-500">{error}</p>}

      {summary && (
        <div className="glass rounded-lg p-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ຄ່າກາງ
              </p>
              <p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                {summary.median_km < 1
                  ? `${Math.round(summary.median_km * 1000)} ມ.`
                  : `${summary.median_km.toFixed(1)} ກມ.`}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ໃນ 300 ແມັດ
              </p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {pct(summary.within_300m)}
              </p>
              <p className="text-[10px] text-slate-400">{summary.within_300m} ບິນ</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                2–20 ກມ.
              </p>
              <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {pct(summary.within_20km)}
              </p>
              <p className="text-[10px] text-slate-400">{summary.within_20km} ບິນ</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ເກີນ 20 ກມ.
              </p>
              <p className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {pct(summary.beyond_20km)}
              </p>
              <p className="text-[10px] text-slate-400">{summary.beyond_20km} ບິນ</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ປິດບິນໂດຍບໍ່ມີ GPS
              </p>
              <p className="text-2xl font-bold tabular-nums text-slate-600 dark:text-slate-300">
                {summary.without_gps}
              </p>
              <p className="text-[10px] text-slate-400">ຈາກ {summary.closed} ບິນທີ່ປິດ</p>
            </div>
          </div>
          {/* ຄຳເຕືອນການອ່ານ — ຢູ່ໜ້ານີ້ຂາດບໍ່ໄດ້ */}
          <p className="mt-3 border-t border-slate-200/60 pt-2 text-[10px] leading-relaxed text-slate-500 dark:border-slate-700">
            ຈຸດອ້າງອີງມາຈາກ <b>ການສົ່ງຄັ້ງລ່າສຸດ</b> ຂອງລູກຄ້ານັ້ນເອງ. ລູກຄ້າທີ່ມີຫຼາຍບ່ອນ
            (ຮ້ານ + ສາງ, ຫຼື ຮັບຂອງຢູ່ຕ່າງແຂວງ) ຈະຫ່າງເປັນທຳມະດາ — ໄລຍະໄກ ໝາຍເຖິງ
            &quot;ຄວນເບິ່ງ&quot; ບໍ່ແມ່ນ &quot;ຜິດ&quot;.
          </p>
        </div>
      )}

      <StatusTableShell
        count={rows.length}
        note="ສູງສຸດ 300 ລາຍການ ຮຽງຈາກໄກຫາໃກ້"
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
              <th className="whitespace-nowrap px-3 py-2">ເລກບິນ</th>
              <th className="whitespace-nowrap px-3 py-2">ລູກຄ້າ</th>
              <th className="whitespace-nowrap px-3 py-2">ຄົນຂັບ</th>
              <th className="whitespace-nowrap px-3 py-2">ສາຂາ</th>
              <th className="whitespace-nowrap px-3 py-2">ປິດເມື່ອ</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">ຫ່າງ</th>
              <th className="whitespace-nowrap px-3 py-2">ຈຸດອ້າງອີງ</th>
              <th className="whitespace-nowrap px-3 py-2">ແຜນທີ່</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  {loading ? "ກຳລັງໂຫຼດ..." : "ບໍ່ມີບິນທີ່ຫ່າງເກີນທີ່ກຳນົດ"}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const km = Number(row.distance_km);
                return (
                  <tr
                    key={`${row.doc_no}-${row.bill_no}`}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{row.bill_no}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.cust_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.driver_name}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {row.transport_name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {row.closed_at || row.doc_date}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${
                        km > 20
                          ? "text-rose-600 dark:text-rose-400"
                          : km > 2
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {km >= 1 ? `${km.toFixed(1)} ກມ.` : `${Math.round(km * 1000)} ມ.`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[10px] text-slate-500">
                      {row.ref_bill_no || "—"}
                      {row.ref_at && <span className="ml-1">· {row.ref_at}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <a
                        href={mapsUrl(row.lat_end, row.lng_end)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 hover:underline dark:text-sky-400"
                      >
                        ຈຸດປິດ <FaExternalLinkAlt className="inline" size={8} />
                      </a>
                      <span className="mx-1 text-slate-300">|</span>
                      <a
                        href={mapsUrl(row.ref_lat, row.ref_lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 hover:underline dark:text-sky-400"
                      >
                        ຈຸດອ້າງອີງ <FaExternalLinkAlt className="inline" size={8} />
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </StatusTableShell>
    </div>
  );
}

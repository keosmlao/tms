"use client";

import { useCallback, useEffect, useState } from "react";
import { FaTruckMoving } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { userErrorMessage } from "@/lib/action-error";

type TypeRow = {
  car_type: string;
  cars: number;
  trips_out: number;
  trips_in: number;
  bills_out: number;
  payload_kg: number | null;
};
type HourRow = { hour: number; trips_out: number; trips_in: number };
type DayRow = {
  day_display: string;
  trips_out: number;
  trips_in: number;
  cars_out: number;
  bills_out: number;
};
type Flow = {
  from: string;
  to: string;
  totals: {
    trips_out: number;
    trips_in: number;
    bills_out: number;
    cars: number;
    active_days: number;
    trips_per_car_day: number;
    trips_per_car: number;
  };
  by_type: TypeRow[];
  by_hour: HourRow[];
  by_day: DayRow[];
};

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
const fmt = (n: number) => n.toLocaleString("en-US");

export default function VehicleFlowPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await Actions.getReportVehicleFlow(from, to)) as Flow);
    } catch (e) {
      setError(userErrorMessage(e, "ໂຫຼດບໍ່ສຳເລັດ"));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const peakOut = Math.max(1, ...(data?.by_hour ?? []).map((h) => h.trips_out));
  const peakIn = Math.max(1, ...(data?.by_hour ?? []).map((h) => h.trips_in));

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ການເຂົ້າ-ອອກຂອງລົດ"
        subtitle="ປະລິມານ · ຄວາມຖີ່ · ປະເພດລົດ"
        icon={<FaTruckMoving />}
        tone="teal"
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          ແຕ່ວັນທີ
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          ຫາວັນທີ
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
        >
          ສະແດງ
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-slate-500">ກຳລັງໂຫຼດ…</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "ຂາອອກ (ຖ້ຽວ)", value: fmt(data.totals.trips_out) },
              { label: "ຂາເຂົ້າ (ຖ້ຽວ)", value: fmt(data.totals.trips_in) },
              { label: "ບິນຂາອອກ", value: fmt(data.totals.bills_out) },
              { label: "ລົດທີ່ໃຊ້ (ຄັນ)", value: fmt(data.totals.cars) },
              {
                label: "ຄວາມຖີ່ ຖ້ຽວ/ຄັນ/ມື້",
                value: data.totals.trips_per_car_day.toFixed(2),
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {c.value}
                </p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  {c.label}
                </p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              ຕາມປະເພດລົດ
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                    <th className="py-2">ປະເພດລົດ</th>
                    <th className="py-2 text-right">ຄັນ</th>
                    <th className="py-2 text-right">ຂາອອກ</th>
                    <th className="py-2 text-right">ຂາເຂົ້າ</th>
                    <th className="py-2 text-right">ບິນ</th>
                    <th className="py-2 text-right">ຖ້ຽວ/ຄັນ</th>
                    <th className="py-2 text-right">ບັນທຸກ (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_type.map((r) => (
                    <tr
                      key={r.car_type}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-2 font-semibold text-slate-800 dark:text-slate-100">
                        {r.car_type}
                      </td>
                      <td className="py-2 text-right">{fmt(r.cars)}</td>
                      <td className="py-2 text-right font-bold text-teal-700 dark:text-teal-300">
                        {fmt(r.trips_out)}
                      </td>
                      <td className="py-2 text-right">{fmt(r.trips_in)}</td>
                      <td className="py-2 text-right">{fmt(r.bills_out)}</td>
                      <td className="py-2 text-right">
                        {r.cars > 0 ? (r.trips_out / r.cars).toFixed(1) : "—"}
                      </td>
                      <td className="py-2 text-right text-slate-500">
                        {r.payload_kg ? fmt(r.payload_kg) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">
              ຄວາມຖີ່ຕາມຊົ່ວໂມງ
            </h2>
            <p className="mb-3 text-[11px] text-slate-500">
              ແຖບເທິງ = ຂາອອກ · ແຖບລຸ່ມ = ຂາເຂົ້າ
            </p>
            <div className="flex items-end gap-1 overflow-x-auto">
              {data.by_hour.map((h) => (
                <div key={h.hour} className="flex w-8 shrink-0 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-teal-500"
                    style={{ height: `${(h.trips_out / peakOut) * 56 + 2}px` }}
                    title={`${h.hour}:00 ຂາອອກ ${h.trips_out}`}
                  />
                  <div
                    className="w-full rounded-b bg-amber-400"
                    style={{ height: `${(h.trips_in / peakIn) * 56 + 2}px` }}
                    title={`${h.hour}:00 ຂາເຂົ້າ ${h.trips_in}`}
                  />
                  <span className="text-[10px] text-slate-500">{h.hour}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              ຕາມມື້
            </h2>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-800">
                    <th className="py-2">ວັນທີ</th>
                    <th className="py-2 text-right">ຂາອອກ</th>
                    <th className="py-2 text-right">ຂາເຂົ້າ</th>
                    <th className="py-2 text-right">ຄັນ</th>
                    <th className="py-2 text-right">ບິນ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_day
                    .filter((d) => d.trips_out > 0 || d.trips_in > 0)
                    .map((d) => (
                      <tr
                        key={d.day_display}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="py-2">{d.day_display}</td>
                        <td className="py-2 text-right font-semibold">
                          {fmt(d.trips_out)}
                        </td>
                        <td className="py-2 text-right">{fmt(d.trips_in)}</td>
                        <td className="py-2 text-right">{fmt(d.cars_out)}</td>
                        <td className="py-2 text-right">{fmt(d.bills_out)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] leading-relaxed text-slate-500">
            ນິຍາມ: <b>ຂາອອກ</b> ນັບດ້ວຍເວລາທີ່ລົດອອກຈາກສາງຈິງ (ກົດເລີ່ມຈັດສົ່ງ) ·{" "}
            <b>ຂາເຂົ້າ</b> ນັບດ້ວຍເວລາປິດຖ້ຽວ — ບໍ່ໄດ້ນັບດ້ວຍວັນທີ່ຂອງເອກະສານ ເພາະຖ້ຽວ
            ທີ່ຈັດໄວ້ມື້ໜຶ່ງແຕ່ອອກແທ້ອີກມື້ໜຶ່ງຈະຖືກນັບຜິດວັນ. <b>ຄວາມຖີ່</b> = ຖ້ຽວ ÷ ຄັນ ÷
            ມື້ທີ່ມີການເຄື່ອນໄຫວ ({data.totals.active_days} ມື້).
          </p>
        </>
      )}
    </div>
  );
}

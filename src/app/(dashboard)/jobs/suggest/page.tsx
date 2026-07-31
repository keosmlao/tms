"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaLightbulb, FaSpinner, FaTruck, FaMapMarkerAlt } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { useSession } from "@/providers/session-provider";

interface TripBill {
  bill_no: string;
  cust_code: string;
  cust_name: string;
  m3: number;
  dataSufficient: boolean;
  legKm: number;
  order: number;
}

interface Trip {
  vehicle: { code: string; name: string; usableM3: number };
  bills: TripBill[];
  m3: number;
  utilizationPct: number;
  km: number;
  hasUnknownVolume: boolean;
}

interface Result {
  hasOrigin: boolean;
  trips: Trip[];
  leftover: Array<{ bill_no: string; cust_name: string; m3: number }>;
  unlocated: Array<{ bill_no: string; cust_name: string; m3: number }>;
  totals: {
    candidates: number;
    placed: number;
    leftover: number;
    unlocated: number;
    km: number;
  } | null;
}

export default function SuggestTripsPage() {
  const { session } = useSession();
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<Array<{ code: string; name_1: string }>>([]);
  const [maxTrucks, setMaxTrucks] = useState(5);
  const [maxSpreadKm, setMaxSpreadKm] = useState(25);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Actions.getSalesTransportBranches()
      .then((rows) => {
        const list = (rows ?? []) as Array<{ code: string; name_1: string }>;
        setBranches(list);
        // ຄ່າເລີ່ມຕົ້ນ = ສາຂາຂອງຜູ້ໃຊ້ ຖ້າມີ
        const mine = session?.logistic_code ?? "";
        setBranch(list.some((b) => b.code === mine) ? mine : (list[0]?.code ?? ""));
      })
      .catch(() => setBranches([]));
  }, [session?.logistic_code]);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await Actions.getSuggestedTrips({
        branch,
        maxTrucks,
        maxSpreadKm,
      })) as Result;
      setData(res);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ຄິດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const tone = (pct: number) =>
    pct > 100
      ? "text-rose-600 dark:text-rose-400"
      : pct > 85
        ? "text-amber-600 dark:text-amber-400"
        : pct < 40
          ? "text-sky-600 dark:text-sky-400"
          : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ແນະນຳການຈັດຖ້ຽວ"
        subtitle="ຈັດບິນທີ່ຢູ່ໃກ້ກັນເຂົ້າຖ້ຽວດຽວກັນ ໃຫ້ພໍດີກັບພື້ນທີ່ຂອງລົດ"
        icon={<FaLightbulb />}
        tone="amber"
      />

      <div className="glass flex flex-wrap items-end gap-3 rounded-lg p-4">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500">ສາຂາ</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="glass-input mt-1 h-9 rounded-lg px-3 text-xs"
          >
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name_1}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500">ໃຊ້ລົດ</label>
          <select
            value={maxTrucks}
            onChange={(e) => setMaxTrucks(Number(e.target.value))}
            className="glass-input mt-1 h-9 rounded-lg px-3 text-xs"
          >
            {[1, 2, 3, 5, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} ຄັນ
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500">
            ບິນຫ່າງກັນບໍ່ເກີນ
          </label>
          <select
            value={maxSpreadKm}
            onChange={(e) => setMaxSpreadKm(Number(e.target.value))}
            className="glass-input mt-1 h-9 rounded-lg px-3 text-xs"
          >
            {[5, 10, 25, 50, 200].map((n) => (
              <option key={n} value={n}>
                {n} ກມ.
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !branch}
          className="h-9 rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? <FaSpinner className="animate-spin" /> : "ຄິດໃຫ້ເບິ່ງ"}
        </button>
      </div>

      {error && <p className="text-[11px] text-rose-500">{error}</p>}

      {data && !data.hasOrigin && (
        <p className="glass rounded-lg p-4 text-xs text-amber-700">
          ຍັງບໍ່ຮູ້ຈຸດສາງຂອງສາຂານີ້ — ຈຸດສາງຄິດຈາກ GPS ຕອນລົດເລີ່ມອອກຖ້ຽວ
          ຈຶ່ງຕ້ອງມີຢ່າງໜ້ອຍ 5 ຖ້ຽວທີ່ເລີ່ມຜ່ານແອັບກ່ອນ
        </p>
      )}

      {data?.totals && (
        <div className="glass rounded-lg p-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ບິນລໍຈັດ
              </p>
              <p className="text-2xl font-bold tabular-nums">{data.totals.candidates}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ຈັດເຂົ້າຖ້ຽວໄດ້
              </p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {data.totals.placed}
              </p>
              <p className="text-[10px] text-slate-400">{data.trips.length} ຖ້ຽວ</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ຍັງເຫຼືອ
              </p>
              <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {data.totals.leftover}
              </p>
              <p className="text-[10px] text-slate-400">ລົດບໍ່ພໍ ຫຼື ຢູ່ໄກກຸ່ມ</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                ໄລຍະລວມ
              </p>
              <p className="text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {data.totals.km} ກມ.
              </p>
            </div>
            {data.totals.unlocated > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  ບໍ່ມີຈຸດສົ່ງ
                </p>
                <p className="text-2xl font-bold tabular-nums text-slate-500">
                  {data.totals.unlocated}
                </p>
                <p className="text-[10px] text-slate-400">ຈັດເອງກ່ອນ</p>
              </div>
            )}
          </div>
          <p className="mt-3 border-t border-slate-200/60 pt-2 text-[10px] leading-relaxed text-slate-500 dark:border-slate-700">
            ເປັນ <b>ຂໍ້ແນະນຳ</b> ເທົ່ານັ້ນ — ລະບົບບໍ່ຮູ້ເລື່ອງເວລານັດ, ນ້ຳໜັກ, ລູກຄ້າ
            ບູລິມະສິດ ຫຼື ຂໍ້ຕົກລົງກັບຄົນຂັບ. ໄລຍະເປັນເສັ້ນຊື່ ບໍ່ແມ່ນທາງຈິງ.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(data?.trips ?? []).map((trip, index) => (
          <div key={`${trip.vehicle.code}-${index}`} className="glass rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <FaTruck className="text-slate-400" size={12} /> {trip.vehicle.name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {trip.bills.length} ບິນ · {trip.km} ກມ.
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold tabular-nums ${tone(trip.utilizationPct)}`}>
                  {trip.utilizationPct.toFixed(0)}%
                </p>
                <p className="text-[10px] tabular-nums text-slate-400">
                  {trip.m3.toFixed(1)}/{trip.vehicle.usableM3.toFixed(1)} m³
                </p>
              </div>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-500/10">
              <div
                className={`h-full rounded-full ${
                  trip.utilizationPct > 100
                    ? "bg-rose-500"
                    : trip.utilizationPct > 85
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(trip.utilizationPct, 100)}%` }}
              />
            </div>
            {trip.hasUnknownVolume && (
              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                ມີບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດຄົບ — % ນີ້ຕໍ່າກວ່າຄວາມຈິງ
              </p>
            )}
            <ol className="mt-2 space-y-1">
              {trip.bills.map((bill) => (
                <li
                  key={bill.bill_no}
                  className="flex items-baseline gap-2 border-t border-slate-200/60 pt-1 text-[11px] dark:border-slate-700"
                >
                  <span className="w-4 shrink-0 text-slate-400">{bill.order}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-slate-500">{bill.bill_no}</span>{" "}
                    {bill.cust_name}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {bill.m3.toFixed(1)} m³
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-400">
                    +{bill.legKm} ກມ.
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {(data?.leftover.length ?? 0) > 0 && (
        <div className="glass rounded-lg p-4">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
            ຍັງບໍ່ໄດ້ຈັດ {data?.leftover.length} ບິນ
          </p>
          <p className="text-[10px] text-slate-500">
            ລົດທີ່ເລືອກໝົດແລ້ວ ຫຼື ບິນຢູ່ໄກກຸ່ມເກີນ {maxSpreadKm} ກມ. — ເພີ່ມຈຳນວນລົດ
            ຫຼື ຂະຫຍາຍໄລຍະແລ້ວຄິດໃໝ່
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.leftover ?? []).map((bill) => (
              <li key={bill.bill_no} className="truncate text-[11px]">
                <span className="font-mono text-slate-500">{bill.bill_no}</span>{" "}
                {bill.cust_name}{" "}
                <span className="tabular-nums text-slate-400">{bill.m3.toFixed(1)} m³</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data?.unlocated.length ?? 0) > 0 && (
        <div className="glass rounded-lg p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
            <FaMapMarkerAlt size={11} /> ບໍ່ມີຈຸດສົ່ງ {data?.unlocated.length} ບິນ
          </p>
          <p className="text-[10px] text-slate-500">
            ຍັງບໍ່ເຄີຍສົ່ງໃຫ້ລູກຄ້ານີ້ ແລະ ຍັງບໍ່ໄດ້ປັກໝຸດ — ປັກໝຸດຢູ່ໜ້າ{" "}
            <Link href="/bills-pending" className="text-sky-600 hover:underline">
              ບິນລໍຈັດຖ້ຽວ
            </Link>{" "}
            ແລ້ວມັນຈະເຂົ້າມາໃນການແນະນຳ
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.unlocated ?? []).map((bill) => (
              <li key={bill.bill_no} className="truncate text-[11px]">
                <span className="font-mono text-slate-500">{bill.bill_no}</span>{" "}
                {bill.cust_name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

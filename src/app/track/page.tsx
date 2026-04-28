"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaBox,
  FaCamera,
  FaCheckCircle,
  FaFlagCheckered,
  FaPenNib,
  FaPlay,
  FaSearch,
  FaSpinner,
  FaRoute,
  FaTimes,
  FaTruck,
  FaCalendar,
} from "react-icons/fa";
import { TrackingLiveMap } from "@/components/tracking-live-map";

interface TrackingStep {
  doc_date: string;
  doc_time: string;
  status: string;
  remark: string;
}

interface TrackingItem {
  item_code: string;
  item_name: string;
  selected_qty: number | string;
  delivered_qty: number | string;
  unit_code: string;
}

interface CarPosition {
  lat: number;
  lng: number;
  speed: number;
  recorded_at: string;
  age_seconds: number;
}

interface PublicTrackingResult {
  doc_no: string;
  doc_date: string;
  bill_no: string;
  bill_date: string;
  car: string;
  driver: string;
  driver_photo: string;
  url_img: string;
  sight_img: string;
  bill_remark: string;
  lat: string;
  lng: string;
  lat_end: string;
  lng_end: string;
  bill_status: number;
  list: TrackingStep[];
  items: TrackingItem[];
  car_position: CarPosition | null;
}

const STATUS_FLOW = [
  { key: "ຈັດຖ້ຽວແລ້ວ", label: "ຈັດຖ້ຽວແລ້ວ", icon: <FaBox size={14} />, color: "slate" },
  { key: "ຮັບຖ້ຽວ / ເບີກເຄື່ອງ", label: "ຮັບເຄື່ອງ", icon: <FaCheckCircle size={14} />, color: "amber" },
  { key: "ເລີ່ມຈັດສົ່ງ", label: "ກຳລັງສົ່ງ", icon: <FaPlay size={14} />, color: "sky" },
  { key: "ຈັດສົ່ງສຳເລັດ", label: "ສຳເລັດ", icon: <FaFlagCheckered size={14} />, color: "emerald" },
] as const;

const COLOR_TONE: Record<string, { bg: string; text: string; ring: string; light: string }> = {
  slate:   { bg: "bg-slate-600",   text: "text-white", ring: "ring-slate-300",   light: "bg-slate-100 text-slate-600" },
  amber:   { bg: "bg-amber-500",   text: "text-white", ring: "ring-amber-200",   light: "bg-amber-50 text-amber-600" },
  sky:     { bg: "bg-sky-500",     text: "text-white", ring: "ring-sky-200",     light: "bg-sky-50 text-sky-600" },
  emerald: { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-200", light: "bg-emerald-50 text-emerald-600" },
  rose:    { bg: "bg-rose-500",    text: "text-white", ring: "ring-rose-200",    light: "bg-rose-50 text-rose-600" },
};

function TrackPageInner() {
  const searchParams = useSearchParams();
  const [bill, setBill] = useState(searchParams.get("bill") ?? "");
  const [result, setResult] = useState<PublicTrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/track?bill_no=${encodeURIComponent(text.trim())}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PublicTrackingResult | null;
      setResult(data);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບໍ່ສາມາດເຊື່ອມຕໍ່ ລອງໃໝ່");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bill) void search(bill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void search(bill);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-sky-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10 space-y-5">
        {/* Brand header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 text-white shadow-lg mb-3">
            <FaTruck size={20} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
            ຕິດຕາມການຈັດສົ່ງ
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            ປ້ອນເລກບິນ ເພື່ອກວດສອບສະຖານະຄຳສັ່ງຊື້ຂອງທ່ານ
          </p>
        </div>

        {/* Search */}
        <form onSubmit={onSubmit} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
          <label className="block text-xs font-semibold text-slate-500 mb-2">
            ເລກບິນ
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <FaSearch
                size={12}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
              />
              <input
                type="text"
                value={bill}
                onChange={(e) => setBill(e.target.value.toUpperCase())}
                placeholder="ເຊັ່ນ CAK26005237"
                className="w-full pl-10 pr-4 py-3 rounded-lg text-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? <FaSpinner className="animate-spin" size={13} /> : <FaSearch size={13} />}
              <span className="hidden sm:inline">ຕິດຕາມ</span>
            </button>
          </div>
        </form>

        {/* States */}
        {loading && !result && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-14 flex items-center justify-center gap-2 text-sm text-slate-500">
            <FaSpinner className="animate-spin text-teal-500" /> ກຳລັງຄົ້ນຫາ...
          </div>
        )}

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50 p-4 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!loading && !result && searched && !error && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-14 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/30 flex items-center justify-center mb-3">
              <FaSearch className="text-rose-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              ບໍ່ພົບເລກບິນນີ້
            </p>
            <p className="text-xs text-slate-400 mt-1">ກວດສອບແລ້ວລອງໃໝ່</p>
          </div>
        )}

        {/* Result */}
        {!loading && result && (
          <div className="space-y-5">
            <ProgressCard list={result.list} status={result.bill_status} />

            {(result.driver || result.driver_photo) && (
              <DriverCard name={result.driver} photoFile={result.driver_photo} car={result.car} />
            )}

            <BillInfoCard result={result} />

            <TrackingLiveMap
              billNo={result.bill_no}
              carName={result.car || "ລົດຈັດສົ່ງ"}
              initialCar={
                result.car_position
                  ? { lat: result.car_position.lat, lng: result.car_position.lng }
                  : null
              }
              start={
                result.lat && result.lng
                  ? { lat: Number(result.lat), lng: Number(result.lng) }
                  : null
              }
              end={
                result.lat_end && result.lng_end
                  ? { lat: Number(result.lat_end), lng: Number(result.lng_end) }
                  : null
              }
              refreshFn={async () => {
                const r = await fetch(
                  `/api/public/track?bill_no=${encodeURIComponent(result.bill_no)}`,
                  { cache: "no-store" }
                );
                if (!r.ok) return null;
                const data = (await r.json()) as
                  | { car_position?: { lat: number; lng: number } | null }
                  | null;
                const p = data?.car_position;
                if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
                return { lat: p.lat, lng: p.lng };
              }}
            />

            {result.items && result.items.length > 0 && (
              <ItemsCard items={result.items} />
            )}

            {result.bill_status === 1 && (result.url_img || result.sight_img) && (
              <DeliveryProofCard
                photo={result.url_img}
                signature={result.sight_img}
                remark={result.bill_remark}
              />
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-slate-400 pt-4 pb-2">
          Powered by Odien Group · TMS
        </p>
      </div>
    </div>
  );
}

function ProgressCard({ list, status }: { list: TrackingStep[]; status: number }) {
  const reached = new Set(list.map((s) => s.status));
  const cancelled = status === 2 || reached.has("ຍົກເລີກຈັດສົ່ງ");
  const currentIndex = STATUS_FLOW.findIndex((s) => !reached.has(s.key));
  const activeIdx = currentIndex === -1 ? STATUS_FLOW.length - 1 : currentIndex - 1;

  if (cancelled) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/40 p-5 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center">
          <FaFlagCheckered />
        </div>
        <p className="text-base font-bold text-rose-600">ຍົກເລີກຈັດສົ່ງ</p>
        <p className="text-xs text-slate-500">ກະລຸນາຕິດຕໍ່ຮ້ານສຳລັບລາຍລະອຽດ</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        {STATUS_FLOW.map((step, i) => {
          const done = reached.has(step.key) || i <= activeIdx;
          const active = i === activeIdx + (reached.has(step.key) ? 0 : 0) && done && i === activeIdx;
          const tone = COLOR_TONE[step.color];
          return (
            <div key={step.key} className="flex flex-col items-center text-center flex-1 min-w-0">
              <div className="relative w-full flex items-center justify-center">
                {i > 0 && (
                  <div
                    className={`absolute right-1/2 top-1/2 -translate-y-1/2 h-0.5 w-full ${
                      done ? tone.bg : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  />
                )}
                <div
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    done
                      ? `${tone.bg} ${tone.text} ${active ? `ring-4 ${tone.ring} animate-pulse` : ""}`
                      : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600"
                  }`}
                >
                  {step.icon}
                </div>
              </div>
              <span
                className={`mt-2 text-[10px] sm:text-[11px] font-semibold ${
                  done ? "text-slate-700 dark:text-slate-200" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {list.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          {list.map((step, i) => {
            const tone = STATUS_FLOW.find((s) => s.key === step.status)?.color ?? "slate";
            const c = COLOR_TONE[tone];
            return (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full ${c.light} flex items-center justify-center mt-0.5`}>
                  <span className="text-[10px] font-bold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {step.status}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {step.doc_date} · {step.doc_time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PHOTO_BASE_URL = process.env.NEXT_PUBLIC_BIOTIME_PHOTO_URL ?? "";

function DriverCard({ name, photoFile, car }: { name: string; photoFile: string; car: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl =
    photoFile && PHOTO_BASE_URL
      ? `${PHOTO_BASE_URL.replace(/\/$/, "")}/${photoFile}`
      : "";
  const initial = name?.trim()?.replace(/^(ທ\.|ທ່ານ|ທ້າວ|ນາງ)\s*/, "")?.[0] ?? "?";
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
      {photoUrl && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          onError={() => setImgFailed(true)}
          className="w-14 h-14 rounded-full object-cover border-2 border-teal-500/40 shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-sky-600 text-white text-xl font-black flex items-center justify-center shrink-0">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400 mb-0.5">ຄົນຂັບລົດ</p>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
          {name || "-"}
        </p>
        {car && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mt-0.5">
            <FaTruck size={9} /> {car}
          </p>
        )}
      </div>
    </div>
  );
}

function BillInfoCard({ result }: { result: PublicTrackingResult }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-2 gap-3 text-xs">
      <Info icon={<FaRoute />} label="ເລກບິນ" value={result.bill_no} />
      <Info icon={<FaCalendar />} label="ວັນທີບິນ" value={result.bill_date} />
      <Info icon={<FaTruck />} label="ລົດ" value={result.car || "-"} />
      <Info icon={<FaRoute />} label="ຖ້ຽວ" value={result.doc_no} />
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5">
        <span>{icon}</span>
        {label}
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{value}</p>
    </div>
  );
}

function ItemsCard({ items }: { items: TrackingItem[] }) {
  const fmt = (v: number | string) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "0";
    return Math.abs(n % 1) < 0.000001
      ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <FaBox className="text-amber-500" size={13} />
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">
          ສິນຄ້າ ({items.length} ລາຍການ)
        </h2>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((it, i) => {
          const sel = Number(it.selected_qty ?? 0) || 0;
          const del = Number(it.delivered_qty ?? 0) || 0;
          const fully = del > 0 && del >= sel;
          const partial = del > 0 && del < sel;
          return (
            <div key={`${it.item_code}-${i}`} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                  {it.item_name}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">{it.item_code}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-bold ${
                    fully
                      ? "text-emerald-600 dark:text-emerald-400"
                      : partial
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {fmt(it.delivered_qty)} / {fmt(it.selected_qty)} {it.unit_code}
                </p>
                {fully && (
                  <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600">
                    <FaCheckCircle size={8} /> ສົ່ງແລ້ວ
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryProofCard({
  photo,
  signature,
  remark,
}: {
  photo: string;
  signature: string;
  remark: string;
}) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-900/40 overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">
            <FaCheckCircle size={12} />
          </div>
          <h2 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            ຫຼັກຖານການສົ່ງສຳເລັດ
          </h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {photo && (
            <ProofThumb
              src={photo}
              icon={<FaCamera size={11} />}
              label="ຮູບການສົ່ງ"
              tone="rose"
              onZoom={() => setZoomed(photo)}
            />
          )}
          {signature && (
            <ProofThumb
              src={signature}
              icon={<FaPenNib size={11} />}
              label="ລາຍເຊັນລູກຄ້າ"
              tone="indigo"
              onZoom={() => setZoomed(signature)}
            />
          )}
        </div>
        {remark && (
          <div className="px-4 pb-4">
            <p className="text-[10px] text-slate-400 mb-1">ໝາຍເຫດ</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {remark}
            </p>
          </div>
        )}
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomed(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(null);
            }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center"
          >
            <FaTimes />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed}
            alt="proof"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function ProofThumb({
  src,
  icon,
  label,
  tone,
  onZoom,
}: {
  src: string;
  icon: React.ReactNode;
  label: string;
  tone: "rose" | "indigo";
  onZoom: () => void;
}) {
  const toneCls = tone === "rose" ? "bg-rose-500/10 text-rose-600" : "bg-indigo-500/10 text-indigo-600";
  return (
    <button
      type="button"
      onClick={onZoom}
      className="group rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 hover:border-teal-400 transition-colors"
    >
      <div className="px-3 py-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700">
        <span className={`w-5 h-5 rounded ${toneCls} flex items-center justify-center`}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </span>
      </div>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="w-full h-40 object-contain bg-white"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-white bg-black/60 px-2 py-1 rounded-full">
            ຄລິກເພື່ອຂະຫຍາຍ
          </span>
        </div>
      </div>
    </button>
  );
}

export default function CustomerTrackingPage() {
  return (
    <Suspense fallback={null}>
      <TrackPageInner />
    </Suspense>
  );
}

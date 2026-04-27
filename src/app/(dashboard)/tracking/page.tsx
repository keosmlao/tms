"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaSearch,
  FaMapMarkerAlt,
  FaBox,
  FaCheckCircle,
  FaPlay,
  FaFlagCheckered,
  FaExternalLinkAlt,
  FaFileInvoice,
  FaTruck,
  FaUser,
  FaCalendarAlt,
  FaSpinner,
  FaClock,
  FaRoute,
  FaCamera,
  FaCommentDots,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: trackBill

// ==================== Types ====================
interface TrackingStep {
  doc_date: string;
  doc_time: string;
  status: string;
  remark: string;
}

interface TrackingResult {
  doc_no: string;
  doc_date: string;
  bill_no: string;
  bill_date: string;
  car: string;
  driver: string;
  url_img: string;
  lat: string;
  lng: string;
  lat_end: string;
  lng_end: string;
  remark: string;
  list: TrackingStep[];
}

// ==================== Status Config ====================
type ColorKey = "slate" | "amber" | "sky" | "emerald" | "rose";

const allStatuses: { key: string; icon: React.ReactNode; label: string; color: ColorKey }[] = [
  { key: "ຈັດຖ້ຽວແລ້ວ", icon: <FaBox size={14} />, label: "ຈັດຖ້ຽວ", color: "slate" },
  { key: "ຮັບຖ້ຽວ / ເບີກເຄື່ອງ", icon: <FaCheckCircle size={14} />, label: "ຮັບເຄື່ອງ", color: "amber" },
  { key: "ເລີ່ມຈັດສົ່ງ", icon: <FaPlay size={14} />, label: "ກຳລັງສົ່ງ", color: "sky" },
  { key: "ຈັດສົ່ງສຳເລັດ", icon: <FaFlagCheckered size={14} />, label: "ສຳເລັດ", color: "emerald" },
];

const cancelStatus = { key: "ຍົກເລີກຈັດສົ່ງ", label: "ຍົກເລີກ", color: "rose" as ColorKey };

const colorMap: Record<ColorKey, { activeBg: string; activeText: string; activeRing: string; doneBg: string; doneText: string }> = {
  slate:   { activeBg: "bg-slate-600",   activeText: "text-white",       activeRing: "ring-slate-300",   doneBg: "bg-slate-500/10",   doneText: "text-slate-600 dark:text-slate-400" },
  amber:   { activeBg: "bg-amber-500",   activeText: "text-white",       activeRing: "ring-amber-200",   doneBg: "bg-amber-500/10",    doneText: "text-amber-600 dark:text-amber-400" },
  sky:     { activeBg: "bg-sky-500",      activeText: "text-white",       activeRing: "ring-sky-200",     doneBg: "bg-sky-500/10",       doneText: "text-sky-600 dark:text-sky-400" },
  emerald: { activeBg: "bg-emerald-500",  activeText: "text-white",       activeRing: "ring-emerald-200", doneBg: "bg-emerald-500/10",   doneText: "text-emerald-600 dark:text-emerald-400" },
  rose:    { activeBg: "bg-rose-500",     activeText: "text-white",       activeRing: "ring-rose-200",    doneBg: "bg-rose-500/10",      doneText: "text-rose-600 dark:text-rose-400" },
};

// ==================== Custom Hook ====================
function useTracking(initialSearch: string) {
  const [searchText, setSearchText] = useState(initialSearch);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await Actions.trackBill(text);
      setResult(data as TrackingResult | null);
    } catch (error) {
      console.error(error);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return { searchText, setSearchText, result, loading, searched, search };
}

// ==================== Horizontal Progress ====================
function HorizontalProgress({ steps }: { steps: TrackingStep[] }) {
  const reachedKeys = new Set(steps.map((s) => s.status));
  const isCancelled = reachedKeys.has(cancelStatus.key);
  const currentIndex = steps.length - 1;
  const currentKey = steps[currentIndex]?.status;

  if (isCancelled) {
    const cm = colorMap[cancelStatus.color];
    return (
      <div className="glass rounded-lg p-5">
        <div className="flex items-center justify-center gap-3">
          <div className={`w-10 h-10 rounded-full ${cm.activeBg} ${cm.activeText} flex items-center justify-center ring-4 ${cm.activeRing}`}>
            <FaFlagCheckered size={16} />
          </div>
          <span className="text-sm font-bold text-rose-600">{cancelStatus.label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between">
        {allStatuses.map((status, idx) => {
          const reached = reachedKeys.has(status.key);
          const isCurrent = status.key === currentKey;
          const cm = colorMap[status.color];

          return (
            <div key={status.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isCurrent
                      ? `${cm.activeBg} ${cm.activeText} ring-4 ${cm.activeRing} scale-110`
                      : reached
                        ? `${cm.doneBg} ${cm.doneText}`
                        : "bg-slate-500/10 text-slate-300 dark:text-slate-500"
                  }`}
                >
                  {status.icon}
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    isCurrent
                      ? cm.doneText.replace("text-", "text-")
                      : reached
                        ? "text-slate-600"
                        : "text-slate-300"
                  }`}
                >
                  {status.label}
                </span>
              </div>
              {idx < allStatuses.length - 1 && (
                <div className="flex-1 mx-2 mb-5">
                  <div className={`h-1 rounded-full transition-all ${
                    reachedKeys.has(allStatuses[idx + 1].key)
                      ? "bg-emerald-300"
                      : reached
                        ? "bg-gradient-to-r from-emerald-300 to-slate-200"
                        : "bg-slate-100"
                  }`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Info Strip ====================
function InfoStrip({ result }: { result: TrackingResult }) {
  const items = [
    { icon: <FaFileInvoice size={11} />, label: "ບິນ", value: result.bill_no, color: "text-teal-600 dark:text-teal-400 bg-teal-500/10" },
    { icon: <FaCalendarAlt size={11} />, label: "ວັນທີບິນ", value: result.bill_date, color: "text-sky-600 dark:text-sky-400 bg-sky-500/10" },
    { icon: <FaRoute size={11} />, label: "ຖ້ຽວ", value: result.doc_no, color: "text-sky-600 dark:text-sky-400 bg-sky-500/10" },
    { icon: <FaClock size={11} />, label: "ວັນທີຖ້ຽວ", value: result.doc_date, color: "text-amber-600 dark:text-amber-400 bg-amber-500/10" },
    { icon: <FaTruck size={11} />, label: "ລົດ", value: result.car || "-", color: "text-teal-600 dark:text-teal-400 bg-teal-500/10" },
    { icon: <FaUser size={11} />, label: "ຄົນຂັບ", value: result.driver || "-", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
  ];

  return (
    <div className="glass rounded-lg p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center shrink-0`}>
              {item.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 font-medium">{item.label}</p>
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Timeline ====================
function Timeline({ steps }: { steps: TrackingStep[] }) {
  if (!steps.length) return null;
  const currentIndex = steps.length - 1;

  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200/30 dark:border-white/5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center">
          <FaClock className="text-teal-500" size={12} />
        </div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">ປະຫວັດການຈັດສົ່ງ</h2>
        <span className="ml-auto text-[10px] text-slate-400 font-medium">{steps.length} ລາຍການ</span>
      </div>
      <div className="p-5">
        <div className="relative">
          {steps.map((step, idx) => {
            const isCurrent = idx === currentIndex;
            const isCancelled = step.status === cancelStatus.key;
            const matched = allStatuses.find((s) => s.key === step.status);
            const color: ColorKey = isCancelled ? "rose" : (matched?.color as ColorKey) || "slate";
            const cm = colorMap[color];
            const icon = isCancelled
              ? <FaFlagCheckered size={11} />
              : matched?.icon || <FaBox size={11} />;
            const label = isCancelled ? cancelStatus.label : matched?.label || step.status;

            return (
              <div key={idx} className="flex gap-3 relative">
                {idx < steps.length - 1 && (
                  <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />
                )}
                <div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isCurrent
                      ? `${cm.activeBg} ${cm.activeText} ring-4 ${cm.activeRing}`
                      : `${cm.doneBg} ${cm.doneText}`
                  }`}
                >
                  {icon}
                </div>
                <div className={`flex-1 ${idx < steps.length - 1 ? "pb-5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${isCurrent ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}>
                        {label}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {step.doc_date} · {step.doc_time}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 px-2 py-0.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[10px] font-bold rounded-full">
                        ປັດຈຸບັນ
                      </span>
                    )}
                  </div>
                  {step.remark && (
                    <div className="mt-2 flex items-start gap-1.5 p-2.5 bg-white/30 dark:bg-white/5 rounded-lg border border-slate-200/30 dark:border-white/5">
                      <FaCommentDots className="text-slate-300 dark:text-slate-500 shrink-0 mt-0.5" size={10} />
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{step.remark}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==================== Location Card ====================
function LocationCard({ result }: { result: TrackingResult }) {
  const hasStart = result.lat && result.lng;
  const hasEnd = result.lat_end && result.lng_end;

  const getMapUrl = (): string | undefined => {
    if (hasStart && hasEnd) {
      return `https://www.google.com/maps/dir/?api=1&origin=${result.lat},${result.lng}&destination=${result.lat_end},${result.lng_end}`;
    } else if (hasEnd) {
      return `https://www.google.com/maps?q=${result.lat_end},${result.lng_end}`;
    } else if (hasStart) {
      return `https://www.google.com/maps?q=${result.lat},${result.lng}`;
    }
    return undefined;
  };

  const mapUrl = getMapUrl();
  if (!hasStart && !hasEnd) return null;

  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200/30 dark:border-white/5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <FaMapMarkerAlt className="text-emerald-500" size={12} />
        </div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຕຳແໜ່ງ</h2>
      </div>
      <div className="p-4 space-y-3">
        {hasStart && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <FaPlay size={9} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">ຈຸດເລີ່ມ</p>
              <p className="text-[11px] text-slate-500 font-mono truncate">{result.lat}, {result.lng}</p>
            </div>
          </div>
        )}
        {hasEnd && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FaFlagCheckered size={9} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">ຈຸດສົ່ງສຳເລັດ</p>
              <p className="text-[11px] text-slate-500 font-mono truncate">{result.lat_end}, {result.lng_end}</p>
            </div>
          </div>
        )}
        {mapUrl && (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg transition-all text-xs font-semibold"
          >
            <FaExternalLinkAlt size={10} /> ເປີດແຜນທີ່
          </a>
        )}
      </div>
    </div>
  );
}

// ==================== Delivery Image ====================
function DeliveryImage({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!url) return null;

  return (
    <>
      <div className="glass rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/30 dark:border-white/5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
            <FaCamera className="text-rose-500" size={12} />
          </div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຫຼັກຖານການສົ່ງ</h2>
        </div>
        <div className="p-4">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="relative w-full rounded-lg overflow-hidden group cursor-zoom-in border border-slate-100"
          >
            <img
              src={url}
              alt="Delivery proof"
              width={400}
              height={300}
              className="w-full h-auto transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-slate-700 text-[11px] font-semibold px-3 py-1.5 rounded-full">
                ຄລິກເພື່ອຂະຫຍາຍ
              </span>
            </div>
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setExpanded(false)}
        >
          <img
            src={url}
            alt="Delivery proof"
            width={1200}
            height={900}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}

// ==================== Empty / Loading States ====================
function EmptyState() {
  return (
    <div className="glass rounded-lg py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-lg bg-slate-500/10 flex items-center justify-center mb-4">
        <FaRoute className="text-slate-300 text-2xl" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ຄົ້ນຫາການຈັດສົ່ງ</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ປ້ອນເລກບິນດ້ານເທິງເພື່ອເລີ່ມຕິດຕາມ</p>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="glass rounded-lg py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-lg bg-rose-500/10 flex items-center justify-center mb-4">
        <FaSearch className="text-rose-300 text-2xl" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">ບໍ່ພົບຂໍ້ມູນ</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ກະລຸນາກວດສອບເລກບິນແລ້ວລອງໃໝ່</p>
    </div>
  );
}

// ==================== Main Page ====================
export default function TrackingPage() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const { searchText, setSearchText, result, loading, searched, search } = useTracking(initialSearch);

  useEffect(() => {
    if (initialSearch) {
      search(initialSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(searchText);
  };

  return (
    <div className="space-y-5">
      {/* Header + Search */}
      <div className="glass rounded-lg p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
            <FaRoute className="text-teal-600 dark:text-teal-400 text-lg" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white">ຕິດຕາມການສົ່ງສິນຄ້າ</h1>
            <p className="text-xs text-slate-500">ປ້ອນເລກບິນເພື່ອກວດສອບສະຖານະ</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <FaFileInvoice className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={13} />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ເລກບິນ..."
              className="glass-input w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-all text-sm font-semibold shrink-0"
          >
            {loading ? <FaSpinner className="animate-spin" size={13} /> : <FaSearch size={13} />}
            ຄົ້ນຫາ
          </button>
        </form>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass rounded-lg py-14 flex items-center justify-center gap-2">
          <FaSpinner className="animate-spin text-teal-500" size={16} />
          <span className="text-sm text-slate-500">ກຳລັງຄົ້ນຫາ...</span>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-4">
          <HorizontalProgress steps={result.list} />
          <InfoStrip result={result} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <Timeline steps={result.list} />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <LocationCard result={result} />
              <DeliveryImage url={result.url_img} />
            </div>
          </div>
        </div>
      )}

      {/* Empty states */}
      {!loading && !result && !searched && <EmptyState />}
      {!loading && !result && searched && <NotFoundState />}
    </div>
  );
}

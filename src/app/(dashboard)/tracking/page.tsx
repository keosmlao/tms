"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { TrackingLiveMap } from "@/components/tracking-live-map";
// Ported from server actions: trackBill

// ==================== Types ====================
interface TrackingStep {
  doc_date: string;
  doc_time: string;
  status: string;
  remark: string;
}

interface TrackingItem {
  item_code: string;
  item_name: string;
  qty: number | string;
  selected_qty: number | string;
  delivered_qty: number | string;
  unit_code: string;
}

interface CarPosition {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  recorded_at: string;
  address: string;
  state_detail?: string;
  age_seconds: number;
}

interface TrackingResult {
  doc_no: string;
  doc_date: string;
  bill_no: string;
  bill_date: string;
  car: string;
  car_code?: string;
  driver: string;
  driver_photo?: string;
  url_img: string;
  lat: string;
  lng: string;
  lat_end: string;
  lng_end: string;
  remark: string;
  bill_status?: number;
  list: TrackingStep[];
  items?: TrackingItem[];
  car_position?: CarPosition | null;
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

// ==================== Active Bills Combobox ====================
interface ActiveBill {
  bill_no: string;
  doc_no: string;
  bill_date: string;
  cust_code: string;
  cust_name: string;
  car: string;
  driver: string;
  phase: string;
}

function ActiveBillsCombobox({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (billNo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bills, setBills] = useState<ActiveBill[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch active bills, debounced; refreshes whenever the search text changes.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      Actions.searchActiveDeliveryBills(value)
        .then((data) => setBills((data ?? []) as ActiveBill[]))
        .catch((e) => {
          console.error(e);
          setBills([]);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, value]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const phaseTone = (phase: string) =>
    phase === "ກຳລັງຈັດສົ່ງ"
      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
      : phase === "ເບີກເຄື່ອງແລ້ວ"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "bg-slate-500/10 text-slate-600 dark:text-slate-400";

  return (
    <div ref={ref} className="flex-1 relative">
      <FaFileInvoice
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
        size={13}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="ເລກບິນ, ລູກຄ້າ, ລົດ..."
        className="glass-input w-full pl-10 pr-10 py-2.5 rounded-lg text-sm"
        autoComplete="off"
      />
      {loading && (
        <FaSpinner
          size={12}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
        />
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full glass rounded-lg shadow-xl border border-slate-200/40 dark:border-white/10 overflow-hidden max-h-[60vh] flex flex-col">
          <div className="px-3 py-1.5 bg-white/40 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              ບິນທີ່ກຳລັງຈັດສົ່ງ
            </span>
            <span className="text-[10px] text-slate-400">{bills.length} ລາຍການ</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && bills.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                <FaSpinner className="animate-spin inline mr-1.5" size={11} />
                ກຳລັງໂຫຼດ...
              </div>
            ) : bills.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                ບໍ່ພົບບິນທີ່ກຳລັງຈັດສົ່ງ
              </div>
            ) : (
              bills.map((b) => (
                <button
                  type="button"
                  key={`${b.doc_no}-${b.bill_no}`}
                  onClick={() => {
                    onPick(b.bill_no);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-white/40 dark:hover:bg-white/5 transition-colors border-b border-slate-200/20 dark:border-white/5 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-white">
                          {b.bill_no}
                        </span>
                        <span className="text-[10px] text-slate-400">{b.bill_date}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {b.cust_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        🚚 {b.car} · {b.driver}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${phaseTone(
                        b.phase
                      )}`}
                    >
                      {b.phase}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Driver Card ====================
const PHOTO_BASE_URL = process.env.NEXT_PUBLIC_BIOTIME_PHOTO_URL ?? "";

function DriverCard({
  name,
  photoFile,
  car,
}: {
  name: string;
  photoFile: string;
  car: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl =
    photoFile && PHOTO_BASE_URL
      ? `${PHOTO_BASE_URL.replace(/\/$/, "")}/${photoFile}`
      : "";
  const initial =
    name?.trim()?.replace(/^(ທ\.|ທ່ານ|ທ້າວ|ນາງ)\s*/, "")?.[0] ?? "?";
  return (
    <div className="glass rounded-lg p-4 flex items-center gap-3">
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

// ==================== Items Card ====================
function ItemsCard({ items }: { items: TrackingItem[] }) {
  const fmt = (v: number | string) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "0";
    return Math.abs(n % 1) < 0.000001
      ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  const totals = items.reduce(
    (acc, it) => {
      acc.selected += Number(it.selected_qty ?? 0) || 0;
      acc.delivered += Number(it.delivered_qty ?? 0) || 0;
      return acc;
    },
    { selected: 0, delivered: 0 }
  );
  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <FaBox className="text-amber-500" size={12} />
          </div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">
            ສິນຄ້າທີ່ຈັດສົ່ງ
          </h2>
        </div>
        <span className="text-[10px] text-slate-500">
          {items.length} ລາຍການ · ສົ່ງ{" "}
          <span className="font-bold text-emerald-600">{fmt(totals.delivered)}</span>
          {" / "}
          <span className="font-bold text-amber-700">{fmt(totals.selected)}</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-6">
                #
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ລະຫັດ
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ຊື່ສິນຄ້າ
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ຈັດສົ່ງ
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ສົ່ງແລ້ວ
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ຫົວໜ່ວຍ
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const sel = Number(it.selected_qty ?? 0) || 0;
              const del = Number(it.delivered_qty ?? 0) || 0;
              const fullyDelivered = del > 0 && del >= sel;
              const partial = del > 0 && del < sel;
              return (
                <tr
                  key={`${it.item_code}-${idx}`}
                  className="border-b border-slate-200/20 dark:border-white/5 last:border-0 hover:bg-white/30 dark:hover:bg-white/5"
                >
                  <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{it.item_code}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{it.item_name}</td>
                  <td className="px-4 py-2 text-right font-bold text-amber-700 dark:text-amber-400">
                    {fmt(it.selected_qty)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        fullyDelivered
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : partial
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-slate-500/10 text-slate-500"
                      }`}
                    >
                      {fullyDelivered && <FaCheckCircle size={9} />}
                      {fmt(it.delivered_qty)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{it.unit_code}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== Car Position Card ====================
function CarPositionCard({ pos, carName }: { pos: CarPosition; carName: string }) {
  const fresh = pos.age_seconds < 120;
  const stale = pos.age_seconds >= 600;
  const ageLabel =
    pos.age_seconds < 60
      ? `${pos.age_seconds}s ກ່ອນ`
      : pos.age_seconds < 3600
      ? `${Math.floor(pos.age_seconds / 60)} ນາທີກ່ອນ`
      : `${Math.floor(pos.age_seconds / 3600)} ຊມ ${Math.floor((pos.age_seconds % 3600) / 60)} ນາທີກ່ອນ`;
  const tone = fresh ? "emerald" : stale ? "rose" : "amber";
  const toneCls: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };
  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200/30 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <FaTruck className="text-sky-500" size={12} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">
              ຕຳແໜ່ງລົດປະຈຸບັນ
            </h2>
            <p className="text-[10px] text-slate-500">{carName}</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${toneCls[tone]}`}
        >
          {ageLabel}
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[10px] text-slate-500 mb-1">ຄວາມໄວ</p>
          <p className="text-base font-bold text-slate-800 dark:text-white">
            {pos.speed.toFixed(0)}
            <span className="text-[10px] font-normal text-slate-500 ml-1">km/h</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 mb-1">ບັນທຶກລ່າສຸດ</p>
          <p className="text-[11px] font-mono text-slate-700 dark:text-slate-200">
            {pos.recorded_at}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 mb-1">ພິກັດ</p>
          <p className="text-[11px] font-mono text-slate-700 dark:text-slate-200 truncate">
            {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
          </p>
        </div>
      </div>
      {pos.state_detail && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-slate-500">ສະຖານະເຄື່ອງຈັກ</p>
          <p className="text-[11px] text-slate-700 dark:text-slate-200">{pos.state_detail}</p>
        </div>
      )}
      {pos.address && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-slate-500">ທີ່ຢູ່</p>
          <p className="text-[11px] text-slate-700 dark:text-slate-200">{pos.address}</p>
        </div>
      )}
      <div className="px-4 pb-4">
        <a
          href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
        >
          <FaMapMarkerAlt size={10} /> ເປີດໃນ Google Maps
          <FaExternalLinkAlt size={9} />
        </a>
      </div>
    </div>
  );
}

// ==================== Main Page ====================
function TrackingPageInner() {
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
          <ActiveBillsCombobox
            value={searchText}
            onChange={setSearchText}
            onPick={(billNo) => {
              setSearchText(billNo);
              search(billNo);
            }}
          />
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

          {(result.driver || result.driver_photo) && (
            <DriverCard name={result.driver} photoFile={result.driver_photo ?? ""} car={result.car} />
          )}

          {result.car_position && (
            <CarPositionCard pos={result.car_position} carName={result.car} />
          )}

          <TrackingLiveMap
            billNo={result.bill_no}
            carName={result.car}
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
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 space-y-4">
              <Timeline steps={result.list} />
              {result.items && result.items.length > 0 && (
                <ItemsCard items={result.items} />
              )}
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

export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <TrackingPageInner />
    </Suspense>
  );
}

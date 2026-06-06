"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBox,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaFileInvoice,
  FaFlagCheckered,
  FaMapMarkerAlt,
  FaPhone,
  FaPlay,
  FaRegCommentDots,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaStickyNote,
  FaSyncAlt,
  FaTruck,
  FaUser,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { useSession } from "@/providers/session-provider";
import { getSalesRole } from "@/lib/sales-role";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Chatter from "@/components/Chatter";

interface SalesBillRow {
  bill_no: string;
  bill_date: string;
  bill_date_iso: string;
  send_date_display?: string | null;
  send_date?: string | null;
  customer_name: string;
  salesperson: string;
  car_plate: string;
  driver_phone: string;
  cust_code: string;
  sale_code?: string;
  sales_remark: string;
  scope_readonly?: boolean;
  scope_role?: string;
  scope_label?: string;
  transport_name: string;
  action_status: string;
  pending_remark: string;
  pending_updated_at: string;
  scheduled_date_display: string;
  delivery_route_code: string;
  delivery_route_name: string;
  delivery_round_code: string;
  delivery_round_name: string;
  delivery_round_time_label: string;
  job_no: string;
  job_date: string;
  bill_status: number;
  job_status: number;
  received_at: string;
  sent_start_at: string;
  sent_end_at: string;
  car: string;
  driver: string;
  attempt_count: number;
  completed_count: number;
  cancelled_count: number;
  current_stage: StageKey;
  days_open: number;
}

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
  remark: string;
  tracking_stage?: string;
  customer_name?: string;
  scheduled_date_display?: string;
  delivery_route_name?: string;
  delivery_route_code?: string;
  delivery_round_name?: string;
  delivery_round_code?: string;
  delivery_round_time_label?: string;
  action_status?: string;
  list: TrackingStep[];
  items?: BillItem[];
  car_position?: CarPosition | null;
}

interface CarPosition {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  recorded_at?: string;
  address?: string;
  state_detail?: string;
  age_seconds?: number;
}

interface BillItem {
  item_code: string;
  item_name: string;
  qty: number | string;
  unit_code: string;
}

type StageKey =
  | "opened"
  | "shipment_opened"
  | "pending"
  | "assigned"
  | "received"
  | "in_delivery"
  | "delivered"
  | "cancelled";

type StageFilter = "all" | StageKey;

const STAGE_META: Record<StageKey, { label: string; tone: string; icon: React.ReactNode; order: number }> = {
  opened: { label: "ເປີດບິນ", tone: "slate", icon: <FaFileInvoice size={10} />, order: 1 },
  shipment_opened: { label: "ລໍຖ້າ pending", tone: "amber", icon: <FaClock size={10} />, order: 2 },
  pending: { label: "ກຳລັງຈັດການ pending", tone: "sky", icon: <FaRoute size={10} />, order: 3 },
  assigned: { label: "ຈັດຖ້ຽວແລ້ວ", tone: "teal", icon: <FaBox size={10} />, order: 4 },
  received: { label: "ຮັບຖ້ຽວແລ້ວ", tone: "amber", icon: <FaCheckCircle size={10} />, order: 5 },
  in_delivery: { label: "ກຳລັງຈັດສົ່ງ", tone: "sky", icon: <FaPlay size={10} />, order: 6 },
  delivered: { label: "ສົ່ງສຳເລັດ", tone: "emerald", icon: <FaFlagCheckered size={10} />, order: 7 },
  cancelled: { label: "ຍົກເລີກ", tone: "rose", icon: <FaExclamationTriangle size={10} />, order: 8 },
};

const STAGE_FILTERS: StageKey[] = [
  "shipment_opened",
  "pending",
  "assigned",
  "received",
  "in_delivery",
  "cancelled",
];

function toneClass(tone: string, active = false) {
  const map: Record<string, string> = {
    slate: active
      ? "border-slate-500 bg-slate-700 text-white"
      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
    amber: active
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    sky: active
      ? "border-sky-500 bg-sky-500 text-white"
      : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    teal: active
      ? "border-teal-600 bg-teal-600 text-white"
      : "border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-400",
    emerald: active
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    rose: active
      ? "border-rose-600 bg-rose-600 text-white"
      : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };
  return map[tone] ?? map.slate;
}

function StageBadge({ stage }: { stage: StageKey }) {
  const meta = STAGE_META[stage] ?? STAGE_META.opened;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClass(meta.tone)}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function dateLabel(value?: string | null) {
  return value && value.trim() ? value : "-";
}

function formatQty(value: number | string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value || "-");
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function buildTimeline(row: SalesBillRow | null, detail: TrackingResult | null): TrackingStep[] {
  if (!row) return [];
  const steps: TrackingStep[] = [
    {
      doc_date: row.bill_date || "-",
      doc_time: "",
      status: "ເປີດບິນຂາຍ",
      remark: [
        row.salesperson ? `ພະນັກງານຂາຍ: ${row.salesperson}` : "",
        row.sales_remark || row.customer_name || "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
  if (row.send_date_display) {
    steps.push({
      doc_date: row.send_date_display,
      doc_time: "",
      status: "ກຳນົດວັນສົ່ງ",
      remark: row.transport_name || "",
    });
  }
  // ສະຖານະຕິດຕໍ່ + ກຳນົດວັນຮັບ + ເສັ້ນທາງ/ຮອບ ມາຈາກ detail.list (trackBill) ແລ້ວ
  // — ບໍ່ເພີ່ມຊ້ຳ ຢູ່ນີ້.
  for (const step of detail?.list ?? []) {
    if (!step?.status) continue;
    steps.push(step);
  }
  return steps;
}

// Live position of the vehicle (driver's phone GPS) delivering the bill.
function BillLiveMap({ position }: { position: CarPosition }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const c = containerRef.current;
    if (!c || mapRef.current) return;
    const map = L.map(c, { zoomControl: true, attributionControl: false }).setView(
      [position.lat, position.lng],
      15
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Init once; position updates handled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ll: [number, number] = [position.lat, position.lng];
    const icon = L.divIcon({
      className: "",
      html:
        '<div style="width:20px;height:20px;border-radius:50%;background:#0ea5e9;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    if (markerRef.current) {
      markerRef.current.setLatLng(ll);
      markerRef.current.setIcon(icon);
    } else {
      markerRef.current = L.marker(ll, { icon }).addTo(map);
    }
    map.setView(ll, map.getZoom());
  }, [position.lat, position.lng]);

  return <div ref={containerRef} className="h-[240px] w-full" />;
}

export default function SalesTrackingPage() {
  const { session } = useSession();
  const [fromDate, setFromDate] = useState(FIXED_YEAR_START);
  const [toDate, setToDate] = useState(FIXED_YEAR_END);
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [rows, setRows] = useState<SalesBillRow[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [selectedBillNo, setSelectedBillNo] = useState<string>("");
  const [detailTab, setDetailTab] = useState<"timeline" | "products" | "chatter">("timeline");
  const [detail, setDetail] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRow = useMemo(
    () => rows.find((row) => row.bill_no === selectedBillNo) ?? null,
    [rows, selectedBillNo]
  );
  const salesRole = getSalesRole(session);
  const managerReadOnly = salesRole === "manager" || salesRole === "head";
  const readOnlyMode = managerReadOnly || rows.some((row) => row.scope_readonly);
  const selectedReadOnly = managerReadOnly || Boolean(selectedRow?.scope_readonly);
  const scopeLabel = readOnlyMode ? "ທັງໝົດໃນພະແນກ · read only" : "ຂອງຕົນເອງ";

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await Actions.getSalesBillTrackingList({
        fromDate,
        toDate,
        search: searchText,
      });
      const next = (data ?? []) as SalesBillRow[];
      setRows(next);
      if (next.length > 0 && !next.some((row) => row.bill_no === selectedBillNo)) {
        setSelectedBillNo(next[0].bill_no);
      }
      if (next.length === 0) {
        setSelectedBillNo("");
        setDetail(null);
      }
    } catch (err) {
      console.error(err);
      setRows([]);
      setDetail(null);
      setSelectedBillNo("");
      setError("ໂຫຼດບິນຂອງຝ່າຍຂາຍບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedBillNo) return;
    let cancelled = false;
    let intervalId: number | null = null;
    let done = false;
    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    // ສິ້ນສຸດ live refresh ເມື່ອບິນສົ່ງສຳເລັດ ຫຼື ຍົກເລີກ.
    const isDone = (d: TrackingResult | null) =>
      (d?.list ?? []).some(
        (s) => (s.status || "").includes("ສຳເລັດ") || (s.status || "").includes("ຍົກເລີກ")
      );
    const loadDetail = async (silent = false) => {
      if (!silent) setDetailLoading(true);
      try {
        const data = (await Actions.trackSalesBill(selectedBillNo)) as TrackingResult | null;
        if (!cancelled) {
          setDetail(data);
          if (isDone(data)) {
            done = true;
            stop();
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled && !silent) setDetail(null);
      } finally {
        if (!cancelled && !silent) setDetailLoading(false);
      }
    };
    // Live refresh every 3s (driver phone position + status) until delivered.
    void loadDetail().then(() => {
      if (!cancelled && !done) {
        intervalId = window.setInterval(() => void loadDetail(true), 3000);
      }
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [selectedBillNo]);

  // Unread chatter badges for the visible bills.
  useEffect(() => {
    if (rows.length === 0) {
      setUnreadMap({});
      return;
    }
    Actions.getUnreadChatterCounts(
      "bill",
      rows.map((r) => r.bill_no)
    )
      .then((data) => {
        const map: Record<string, number> = {};
        ((data ?? []) as { record_id: string; unread: number }[]).forEach((x) => {
          map[x.record_id] = x.unread;
        });
        setUnreadMap(map);
      })
      .catch(() => undefined);
  }, [rows]);

  // Opening a bill marks its conversation read — clear its badge immediately.
  useEffect(() => {
    if (selectedBillNo) {
      setUnreadMap((m) => (m[selectedBillNo] ? { ...m, [selectedBillNo]: 0 } : m));
    }
  }, [selectedBillNo]);

  const visibleRows = useMemo(() => {
    if (stageFilter === "all") return rows;
    return rows.filter((row) => row.current_stage === stageFilter);
  }, [rows, stageFilter]);

  const counts = useMemo(() => {
    const init: Record<StageKey, number> = {
      opened: 0,
      shipment_opened: 0,
      pending: 0,
      assigned: 0,
      received: 0,
      in_delivery: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const row of rows) init[row.current_stage] = (init[row.current_stage] ?? 0) + 1;
    return init;
  }, [rows]);

  const timeline = buildTimeline(selectedRow, detail);
  const cancelledCount = rows.filter((row) => row.current_stage === "cancelled").length;
  const waitingCount = rows.filter((row) =>
    ["opened", "shipment_opened", "pending"].includes(row.current_stage)
  ).length;
  const inMotionCount = rows.filter((row) =>
    ["assigned", "received", "in_delivery"].includes(row.current_stage)
  ).length;
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-white/[0.06]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  Sales Tracking
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  readOnlyMode
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                }`}>
                  <FaUser size={9} />
                  {scopeLabel}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {fromDate} - {toDate}
                </span>
              </div>
              <h1 className="mt-2 text-xl font-extrabold text-slate-950 dark:text-white">
                ບິນສົ່ງບໍ່ສຳເລັດຂອງຝ່າຍຂາຍ
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {readOnlyMode
                  ? "ຫົວໜ້າ/ຜູ້ຈັດການເບິ່ງບິນຂອງທຸກຄົນໃນພະແນກໄດ້, ແຕ່ເປັນ read-only."
                  : "ຕິດຕາມບິນຂອງຕົນເອງຈາກເວລາເປີດບິນ, pending, ຈັດຖ້ຽວ ໄປຈົນຮອດຜົນສຳເລັດ."}
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void loadRows();
              }}
              className="grid w-full gap-2 md:grid-cols-[minmax(220px,1fr)_150px_150px_auto] xl:max-w-3xl"
            >
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="ຄົ້ນຫາເລກບິນ, ລູກຄ້າ, ໝາຍເຫດ..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-700 outline-hidden transition-colors focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                />
              </div>
              <input
                type="date"
                value={fromDate}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs dark:border-white/10 dark:bg-white/5"
              />
              <input
                type="date"
                value={toDate}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(event) => setToDate(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs dark:border-white/10 dark:bg-white/5"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
              >
                {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaSyncAlt size={11} />}
                ອັບເດດ
              </button>
            </form>
          </div>
        </div>

        <div className="grid border-b border-slate-100 dark:border-white/[0.06] sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "ບິນບໍ່ສຳເລັດ", value: rows.length, icon: <FaFileInvoice />, cls: "text-slate-900 dark:text-white", hint: "ລາຍການທີ່ sale ຕ້ອງຕິດຕາມ" },
            { label: "ລໍຖ້າ / pending", value: waitingCount, icon: <FaClock />, cls: "text-amber-700 dark:text-amber-400", hint: "ຍັງບໍ່ອອກສົ່ງ" },
            { label: "ຢູ່ໃນການຈັດສົ່ງ", value: inMotionCount, icon: <FaTruck />, cls: "text-sky-700 dark:text-sky-400", hint: "ຈັດຖ້ຽວ / ຮັບ / ກຳລັງສົ່ງ" },
            { label: "ຍົກເລີກ", value: cancelledCount, icon: <FaExclamationTriangle />, cls: "text-rose-700 dark:text-rose-400", hint: "ຕ້ອງກວດເຫດຜົນ" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-start gap-3 border-r border-slate-100 px-4 py-3 last:border-r-0 dark:border-white/[0.06]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300">
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                <p className={`text-2xl font-extrabold leading-tight ${stat.cls}`}>{stat.value}</p>
                <p className="truncate text-[10px] text-slate-400">{stat.hint}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          <button
            type="button"
            onClick={() => setStageFilter("all")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
              stageFilter === "all"
                ? "border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
            }`}
          >
            ທັງໝົດ {rows.length}
          </button>
          {STAGE_FILTERS.map((stage) => {
            const meta = STAGE_META[stage];
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${toneClass(meta.tone, stageFilter === stage)}`}
              >
                <span className="mr-1 inline-flex align-[-1px]">{meta.icon}</span>
                {meta.label} {counts[stage] ?? 0}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      <div className="grid min-h-[calc(100vh-18rem)] gap-4 xl:grid-cols-[minmax(380px,0.95fr)_minmax(480px,1.05fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">
                {readOnlyMode ? "ລາຍການບິນທັງພະແນກ" : "ລາຍການບິນຂອງຂ້ອຍ"}
              </h2>
              <p className="text-[11px] text-slate-500">
                {visibleRows.length} / {rows.length} ບິນ{readOnlyMode ? " · read only" : ""}
              </p>
            </div>
            {loading && <FaSpinner className="animate-spin text-teal-500" size={16} />}
          </div>

          <div className="max-h-[calc(100vh-20rem)] space-y-2 overflow-auto p-3">
            {visibleRows.map((row) => {
              const active = selectedBillNo === row.bill_no;
              const cancelled = row.current_stage === "cancelled";
              const hasUnread = (unreadMap[row.bill_no] ?? 0) > 0;
              return (
                <button
                  key={row.bill_no}
                  type="button"
                  onClick={() => setSelectedBillNo(row.bill_no)}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    active
                      ? "border-teal-500 bg-teal-50 shadow-sm ring-1 ring-teal-500/20 dark:bg-teal-950/30"
                      : cancelled
                        ? "border-rose-400 bg-rose-50 hover:bg-rose-100/60 dark:border-rose-500/40 dark:bg-rose-950/20"
                        : "border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                  } ${hasUnread ? "ring-2 ring-teal-400/50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300"
                    }`}>
                      <FaFileInvoice size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-mono text-sm font-extrabold text-slate-950 dark:text-white">
                            {row.bill_no}
                            {unreadMap[row.bill_no] > 0 && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                <FaRegCommentDots size={8} /> {unreadMap[row.bill_no]}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{row.customer_name || "-"}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StageBadge stage={row.current_stage} />
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                              row.days_open >= 7
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : row.days_open >= 3
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            <FaClock size={8} />
                            {row.days_open <= 0 ? "ມື້ນີ້" : `ເປີດມາ ${row.days_open} ມື້`}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1.5 text-[10.5px] text-slate-500 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-1">
                          <FaClock size={9} className="text-slate-400" />
                          ເປີດ {dateLabel(row.bill_date)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FaRoute size={9} className="text-slate-400" />
                          ສົ່ງ {dateLabel(row.send_date_display)}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <FaTruck size={9} className="shrink-0 text-slate-400" />
                          <span className="truncate">{row.car_plate || row.car || row.transport_name || "-"}</span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <FaUser size={9} className="shrink-0 text-slate-400" />
                          <span className="truncate">{readOnlyMode ? `ຂອງ ${row.salesperson || row.sale_code || "-"}` : row.salesperson || "-"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FaFlagCheckered size={9} className="text-slate-400" />
                          {row.attempt_count} ຮອບ · ສຳເລັດ {row.completed_count}
                        </span>
                      </div>
                      {(row.sales_remark || row.pending_remark) && (
                        <p className="mt-2 flex min-w-0 items-start gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[10.5px] font-medium text-amber-800 dark:text-amber-300">
                          <FaStickyNote size={8} className="mt-0.5 shrink-0" />
                          <span className="truncate">{row.sales_remark || row.pending_remark}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {visibleRows.length === 0 && !loading && (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-8 text-center text-slate-400 dark:border-white/10">
                <FaFileInvoice size={30} className="mb-3 opacity-50" />
                <p className="text-sm font-semibold">ບໍ່ພົບບິນທີ່ກົງກັບເງື່ອນໄຂ</p>
                <p className="mt-1 text-[11px]">ລອງປ່ຽນວັນທີ ຫຼື ລ້າງຄຳຄົ້ນຫາ</p>
              </div>
            )}
          </div>
        </section>

        <aside className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">ລາຍລະອຽດການດຳເນີນການ</h2>
                <p className="truncate text-[11px] text-slate-500">
                  {selectedRow ? `${selectedRow.bill_no} · ${selectedRow.customer_name}` : "ເລືອກບິນເພື່ອເບິ່ງ timeline"}
                </p>
              </div>
              {detailLoading && <FaSpinner className="shrink-0 animate-spin text-teal-500" size={15} />}
            </div>
          </div>

          {!selectedRow ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center text-slate-400">
              <FaFileInvoice size={32} className="mb-3 opacity-50" />
              <p className="text-sm">ຍັງບໍ່ໄດ້ເລືອກບິນ</p>
            </div>
          ) : (
            <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-extrabold leading-tight text-slate-950 dark:text-white">{selectedRow.bill_no}</p>
                    <p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">{selectedRow.customer_name || "-"}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      ລູກຄ້າ {selectedRow.cust_code || "-"} · ເປີດ {dateLabel(selectedRow.bill_date)} · ຂອງ {selectedRow.salesperson || selectedRow.sale_code || "-"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedReadOnly && (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        read only
                      </span>
                    )}
                    <StageBadge stage={selectedRow.current_stage} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
                  {[
                    { label: "ວັນສົ່ງ", value: dateLabel(selectedRow.send_date_display), icon: <FaClock /> },
                    { label: "ຖ້ຽວລ່າສຸດ", value: selectedRow.job_no || "-", icon: <FaRoute />, mono: true },
                    { label: "ຂົນສົ່ງ", value: selectedRow.transport_name || "-", icon: <FaTruck /> },
                    { label: "ຮອບສົ່ງ", value: selectedRow.delivery_round_name || selectedRow.delivery_round_code || "-", icon: <FaFlagCheckered /> },
                    { label: "ພະນັກງານຂາຍ", value: selectedRow.salesperson || "-", icon: <FaUser /> },
                    { label: "ທະບຽນລົດ", value: selectedRow.car_plate || selectedRow.car || "-", icon: <FaTruck /> },
                    { label: "ຄົນຂັບ", value: selectedRow.driver || "-", icon: <FaUser /> },
                    { label: "ເບີໂທ", value: selectedRow.driver_phone || "-", icon: <FaPhone />, phone: selectedRow.driver_phone },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                        <span className="text-slate-300">{item.icon}</span>
                        {item.label}
                      </p>
                      {item.phone ? (
                        <a href={`tel:${item.phone}`} className="mt-0.5 block truncate font-bold text-sky-600 dark:text-sky-400">
                          {item.value}
                        </a>
                      ) : (
                        <p className={`mt-0.5 truncate font-bold text-slate-800 dark:text-slate-100 ${item.mono ? "font-mono" : ""}`}>
                          {item.value}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 p-4">
                {detail?.car_position && (
                  <div className="isolate overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                        </span>
                        ຕຳແໜ່ງລົດປະຈຸບັນ
                      </p>
                      <span className="text-[10px] text-slate-400">{detail.car_position.recorded_at}</span>
                    </div>
                    <BillLiveMap position={detail.car_position} />
                    <div className="grid gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400 sm:grid-cols-2">
                      <span className="inline-flex items-center gap-1">
                        <FaMapMarkerAlt size={9} className="text-sky-500" />
                        {detail.car_position.address || "ຍັງບໍ່ມີທີ່ຢູ່"}
                      </span>
                      <span className="inline-flex items-center gap-1 sm:justify-end">
                        <FaTruck size={9} className="text-slate-400" />
                        {detail.car_position.speed ?? 0} km/h
                      </span>
                    </div>
                  </div>
                )}

                {(selectedRow.sales_remark || selectedRow.pending_remark) && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                    <p className="mb-1 flex items-center gap-1 font-bold">
                      <FaStickyNote size={10} />
                      ໝາຍເຫດ
                    </p>
                    <p className="leading-relaxed">{selectedRow.sales_remark || selectedRow.pending_remark}</p>
                  </div>
                )}

                <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                  {(["timeline", "products", "chatter"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDetailTab(t)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${
                        detailTab === t
                          ? "bg-teal-600 text-white shadow-sm"
                          : "text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5"
                      }`}
                    >
                      {t === "timeline" ? "ໄທມ໌ລາຍ" : t === "products" ? "ສິນຄ້າ" : "ສົນທະນາ"}
                    </button>
                  ))}
                </div>

                {detailTab === "timeline" && (detailLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-12 text-sm text-slate-400 dark:border-white/10">
                    <FaSpinner className="animate-spin" />
                    ກຳລັງໂຫຼດ timeline...
                  </div>
                ) : (
                  <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-white/10">
                    {timeline.map((step, index) => {
                      const isLast = index === timeline.length - 1;
                      return (
                        <li key={`${step.status}-${index}`} className="relative">
                          <span
                            className={`absolute -left-[22px] top-1 flex h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                              isLast ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-600"
                            }`}
                          />
                          <div className={`rounded-lg border p-3 ${isLast ? "border-teal-500/30 bg-teal-500/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{step.status}</p>
                              <span className="shrink-0 text-right text-[10px] font-semibold text-slate-400">
                                {step.doc_date}{step.doc_time ? ` · ${step.doc_time}` : ""}
                              </span>
                            </div>
                            {step.remark && (
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{step.remark}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {timeline.length === 0 && (
                      <li className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400 dark:border-white/10">
                        ຍັງບໍ່ມີ timeline
                      </li>
                    )}
                  </ol>
                ))}

                {detailTab === "products" && !detailLoading && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                    <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                      ລາຍການສິນຄ້າ ({detail?.items?.length ?? 0})
                    </p>
                    {detail?.items && detail.items.length > 0 ? (
                      <ul className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                        {detail.items.map((it, i) => (
                          <li
                            key={`${it.item_code}-${i}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-[11px]"
                          >
                            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                              <span className="font-mono text-slate-400">{it.item_code}</span> {it.item_name}
                            </span>
                            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-bold tabular-nums text-slate-800 dark:bg-white/5 dark:text-white">
                              {formatQty(it.qty)} {it.unit_code}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="flex min-h-[180px] flex-col items-center justify-center text-center text-slate-400">
                        <FaBox size={24} className="mb-2 opacity-50" />
                        <p className="text-xs font-semibold">ຍັງບໍ່ມີລາຍການສິນຄ້າ</p>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === "chatter" && (
                  <Chatter model="bill" recordId={selectedRow.bill_no} readOnly={selectedReadOnly} />
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

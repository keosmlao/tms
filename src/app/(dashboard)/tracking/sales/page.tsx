"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBox,
  FaCheckCircle,
  FaChevronRight,
  FaClock,
  FaExternalLinkAlt,
  FaExclamationTriangle,
  FaFileInvoice,
  FaFlagCheckered,
  FaMapMarkerAlt,
  FaPhone,
  FaPlay,
  FaRegCommentDots,
  FaRoute,
  FaSearch,
  FaSort,
  FaSortDown,
  FaSortUp,
  FaSpinner,
  FaStickyNote,
  FaSyncAlt,
  FaTimes,
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
import { WhatsappLink, buildBillWhatsappMessage } from "@/components/whatsapp-link";

function customerTrackingUrl(billNo: string) {
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  const base = env ? env.replace(/\/$/, "") : typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/track?bill=${encodeURIComponent(billNo)}`;
}

interface SalesBillRow {
  bill_no: string;
  bill_date: string;
  bill_date_iso: string;
  send_date_display?: string | null;
  send_date?: string | null;
  customer_name: string;
  telephone?: string;
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

type SortKey = "bill_no" | "customer" | "stage" | "days" | "send";

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
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${toneClass(meta.tone)}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

// Sortable table column header.
function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-2.5 py-1.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-700 dark:hover:text-slate-200 ${
          active ? "text-teal-600 dark:text-teal-400" : ""
        }`}
      >
        {label}
        {active ? (
          dir === "asc" ? <FaSortUp size={9} /> : <FaSortDown size={9} />
        ) : (
          <FaSort size={9} className="opacity-30" />
        )}
      </button>
    </th>
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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

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
      // Table + drawer UX: do NOT auto-open a bill on load — the drawer only
      // opens when the user clicks a row. Just drop a stale selection.
      if (next.length === 0 || !next.some((row) => row.bill_no === selectedBillNo)) {
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

  const sortedRows = useMemo(() => {
    if (!sort) return visibleRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: SalesBillRow): string | number => {
      switch (sort.key) {
        case "bill_no":
          return r.bill_no;
        case "customer":
          return r.customer_name || "";
        case "stage":
          return STAGE_META[r.current_stage]?.order ?? 0;
        case "days":
          return r.days_open;
        case "send":
          return r.send_date || r.bill_date_iso || "";
        default:
          return "";
      }
    };
    return [...visibleRows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [visibleRows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" }
    );

  // Close the detail drawer with Escape.
  useEffect(() => {
    if (!selectedBillNo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedBillNo("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBillNo]);

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
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
        <div className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h1 className="text-sm font-extrabold text-slate-900 dark:text-white">ບິນສົ່ງບໍ່ສຳເລັດ</h1>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
              readOnlyMode
                ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400"
            }`}>
              <FaUser size={8} />
              {scopeLabel}
            </span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadRows();
            }}
            className="flex flex-wrap items-center gap-1.5"
          >
            <div className="relative">
              <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ຄົ້ນຫາ..."
                className="h-8 w-40 rounded-md border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-[11px] text-slate-700 outline-hidden transition-colors focus:border-teal-500 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              />
            </div>
            <input
              type="date"
              value={fromDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] dark:border-white/10 dark:bg-white/5"
            />
            <input
              type="date"
              value={toDate}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(event) => setToDate(event.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-teal-600 px-3 text-[11px] font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
            >
              {loading ? <FaSpinner className="animate-spin" size={10} /> : <FaSyncAlt size={10} />}
              ອັບເດດ
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 px-3 py-1.5 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => setStageFilter("all")}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
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
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${toneClass(meta.tone, stageFilter === stage)}`}
              >
                {meta.label} {counts[stage] ?? 0}
              </button>
            );
          })}
          <span className="ml-auto hidden items-center gap-2 pr-1 text-[10px] font-semibold text-slate-400 sm:flex">
            <span className="text-amber-600 dark:text-amber-400">ລໍຖ້າ {waitingCount}</span>
            <span className="text-sky-600 dark:text-sky-400">ກຳລັງສົ່ງ {inMotionCount}</span>
            <span className="text-rose-600 dark:text-rose-400">ຍົກເລີກ {cancelledCount}</span>
          </span>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm dark:border-white/[0.06] dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-white/[0.06]">
          <p className="text-[11px] font-semibold text-slate-500">
            {sortedRows.length} / {rows.length} ບິນ{readOnlyMode ? " · ທັງພະແນກ" : ""}
          </p>
          {loading && <FaSpinner className="animate-spin text-teal-500" size={13} />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wide text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.03]">
              <tr>
                <SortHeader label="ບິນ" sortKey="bill_no" active={sort?.key === "bill_no"} dir={sort?.dir ?? "asc"} onSort={toggleSort} />
                <SortHeader label="ລູກຄ້າ" sortKey="customer" active={sort?.key === "customer"} dir={sort?.dir ?? "asc"} onSort={toggleSort} />
                <SortHeader label="ສະຖານະ" sortKey="stage" active={sort?.key === "stage"} dir={sort?.dir ?? "asc"} onSort={toggleSort} />
                <SortHeader label="ສົ່ງ" sortKey="send" active={sort?.key === "send"} dir={sort?.dir ?? "asc"} onSort={toggleSort} />
                <SortHeader label="ເປີດ" sortKey="days" active={sort?.key === "days"} dir={sort?.dir ?? "asc"} onSort={toggleSort} align="right" />
                <th className="px-2.5 py-1.5 font-semibold">ຂົນສົ່ງ / ລົດ</th>
                <th className="px-2.5 py-1.5 font-semibold">ພະນັກງານ</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">ຮອບ</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {sortedRows.map((row) => {
                const active = selectedBillNo === row.bill_no;
                const cancelled = row.current_stage === "cancelled";
                const unread = unreadMap[row.bill_no] ?? 0;
                return (
                  <tr
                    key={row.bill_no}
                    onClick={() => setSelectedBillNo(row.bill_no)}
                    className={`cursor-pointer transition-colors ${
                      active
                        ? "bg-teal-50 dark:bg-teal-950/30"
                        : cancelled
                          ? "bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/10 dark:hover:bg-rose-950/20"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <td className="whitespace-nowrap px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-900 dark:text-white">
                        {row.bill_no}
                        {unread > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-500 px-1 py-0.5 text-[8px] font-bold text-white">
                            <FaRegCommentDots size={7} /> {unread}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-2.5 py-1.5 text-slate-700 dark:text-slate-200">{row.customer_name || "-"}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5"><StageBadge stage={row.current_stage} /></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-[11px] text-slate-500">{dateLabel(row.send_date_display)}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        row.days_open >= 7
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : row.days_open >= 3
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                      }`}>
                        {row.days_open <= 0 ? "ມື້ນີ້" : `${row.days_open} ມື້`}
                      </span>
                    </td>
                    <td className="max-w-[150px] truncate px-2.5 py-1.5 text-[11px] text-slate-500">{row.car_plate || row.car || row.transport_name || "-"}</td>
                    <td className="max-w-[120px] truncate px-2.5 py-1.5 text-[11px] text-slate-500">{readOnlyMode ? row.salesperson || row.sale_code || "-" : row.salesperson || "-"}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-[11px] text-slate-500">{row.attempt_count}·{row.completed_count}✓</td>
                    <td className="whitespace-nowrap px-1 text-right">
                      <span className="inline-flex items-center gap-0.5">
                        <a
                          href={customerTrackingUrl(row.bill_no)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="ເປີດໜ້າຕິດຕາມ"
                          className="inline-flex items-center justify-center rounded-md p-1 text-sky-600 hover:bg-sky-500/15 dark:text-sky-400"
                        >
                          <FaExternalLinkAlt size={11} />
                        </a>
                        {row.telephone && (
                          <WhatsappLink
                            phone={row.telephone}
                            message={buildBillWhatsappMessage({
                              billNo: row.bill_no,
                              customerName: row.customer_name,
                              carName: row.car_plate || row.car,
                              driverName: row.driver,
                              trackingUrl: customerTrackingUrl(row.bill_no),
                            })}
                            size={13}
                          />
                        )}
                        <FaChevronRight size={10} className="text-slate-300" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedRows.length === 0 && !loading && (
            <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center text-slate-400">
              <FaFileInvoice size={26} className="mb-2 opacity-50" />
              <p className="text-xs font-semibold">ບໍ່ພົບບິນທີ່ກົງກັບເງື່ອນໄຂ</p>
              <p className="mt-1 text-[10px]">ລອງປ່ຽນວັນທີ ຫຼື ລ້າງຄຳຄົ້ນຫາ</p>
            </div>
          )}
        </div>
      </section>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="close"
            onClick={() => setSelectedBillNo("")}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-white/[0.06]">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                  {selectedRow.bill_no}
                  {selectedReadOnly && (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">read only</span>
                  )}
                </p>
                <p className="truncate text-[11px] text-slate-500">{selectedRow.customer_name || "-"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {detailLoading && <FaSpinner className="animate-spin text-teal-500" size={13} />}
                <a
                  href={customerTrackingUrl(selectedRow.bill_no)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="ເປີດໜ້າຕິດຕາມ"
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-sky-600 hover:bg-sky-500/15 dark:text-sky-400"
                >
                  <FaExternalLinkAlt size={13} />
                </a>
                {selectedRow.telephone && (
                  <WhatsappLink
                    phone={selectedRow.telephone}
                    message={buildBillWhatsappMessage({
                      billNo: selectedRow.bill_no,
                      customerName: selectedRow.customer_name,
                      carName: selectedRow.car_plate || selectedRow.car,
                      driverName: selectedRow.driver,
                      trackingUrl: customerTrackingUrl(selectedRow.bill_no),
                    })}
                    size={15}
                    title="ສົ່ງ link ຕິດຕາມໃຫ້ລູກຄ້າ"
                  />
                )}
                <StageBadge stage={selectedRow.current_stage} />
                <button
                  type="button"
                  onClick={() => setSelectedBillNo("")}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
                >
                  <FaTimes size={13} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-1.5 border-b border-slate-100 p-2.5 sm:grid-cols-3 dark:border-white/[0.06]">
                {[
                  { label: "ວັນສົ່ງ", value: dateLabel(selectedRow.send_date_display), icon: <FaClock /> },
                  { label: "ຖ້ຽວ", value: selectedRow.job_no || "-", icon: <FaRoute />, mono: true },
                  { label: "ຂົນສົ່ງ", value: selectedRow.transport_name || "-", icon: <FaTruck /> },
                  { label: "ຮອບສົ່ງ", value: selectedRow.delivery_round_name || selectedRow.delivery_round_code || "-", icon: <FaFlagCheckered /> },
                  { label: "ພະນັກງານຂາຍ", value: selectedRow.salesperson || "-", icon: <FaUser /> },
                  { label: "ທະບຽນລົດ", value: selectedRow.car_plate || selectedRow.car || "-", icon: <FaTruck /> },
                  { label: "ຄົນຂັບ", value: selectedRow.driver || "-", icon: <FaUser /> },
                  { label: "ເບີໂທ", value: selectedRow.driver_phone || "-", icon: <FaPhone />, phone: selectedRow.driver_phone },
                ].map((item) => (
                  <div key={item.label} className="min-w-0 rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                    <p className="flex items-center gap-1 text-[9px] font-semibold uppercase text-slate-400">
                      <span className="text-slate-300">{item.icon}</span>
                      {item.label}
                    </p>
                    {item.phone ? (
                      <a href={`tel:${item.phone}`} className="mt-0.5 block truncate text-[11px] font-bold text-sky-600 dark:text-sky-400">{item.value}</a>
                    ) : (
                      <p className={`mt-0.5 truncate text-[11px] font-bold text-slate-800 dark:text-slate-100 ${item.mono ? "font-mono" : ""}`}>{item.value}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 p-2.5">
                {detail?.car_position && (
                  <div className="isolate overflow-hidden rounded-md border border-slate-200 dark:border-white/10">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                        </span>
                        ຕຳແໜ່ງລົດ
                      </p>
                      <span className="text-[9px] text-slate-400">{detail.car_position.recorded_at}</span>
                    </div>
                    <BillLiveMap position={detail.car_position} />
                    <div className="grid gap-1 border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400 sm:grid-cols-2">
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
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                    <p className="mb-0.5 flex items-center gap-1 font-bold"><FaStickyNote size={9} /> ໝາຍເຫດ</p>
                    <p className="leading-relaxed">{selectedRow.sales_remark || selectedRow.pending_remark}</p>
                  </div>
                )}

                <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                  {(["timeline", "products", "chatter"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDetailTab(t)}
                      className={`flex-1 rounded px-2 py-1 text-[11px] font-bold transition-colors ${
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
                  <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-200 py-10 text-xs text-slate-400 dark:border-white/10">
                    <FaSpinner className="animate-spin" /> ກຳລັງໂຫຼດ...
                  </div>
                ) : (
                  <ol className="relative space-y-2 border-l border-slate-200 pl-3.5 dark:border-white/10">
                    {timeline.map((step, index) => {
                      const isLast = index === timeline.length - 1;
                      return (
                        <li key={`${step.status}-${index}`} className="relative">
                          <span className={`absolute -left-[20px] top-1 flex h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${isLast ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-600"}`} />
                          <div className={`rounded-md border p-2 ${isLast ? "border-teal-500/30 bg-teal-500/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{step.status}</p>
                              <span className="shrink-0 text-right text-[9px] font-semibold text-slate-400">{step.doc_date}{step.doc_time ? ` · ${step.doc_time}` : ""}</span>
                            </div>
                            {step.remark && <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">{step.remark}</p>}
                          </div>
                        </li>
                      );
                    })}
                    {timeline.length === 0 && (
                      <li className="rounded-md border border-dashed border-slate-200 py-8 text-center text-[11px] text-slate-400 dark:border-white/10">ຍັງບໍ່ມີ timeline</li>
                    )}
                  </ol>
                ))}

                {detailTab === "products" && !detailLoading && (
                  <div className="overflow-hidden rounded-md border border-slate-200 dark:border-white/10">
                    <p className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                      ລາຍການສິນຄ້າ ({detail?.items?.length ?? 0})
                    </p>
                    {detail?.items && detail.items.length > 0 ? (
                      <ul className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                        {detail.items.map((it, i) => (
                          <li key={`${it.item_code}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-1.5 text-[10px]">
                            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                              <span className="font-mono text-slate-400">{it.item_code}</span> {it.item_name}
                            </span>
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-bold tabular-nums text-slate-800 dark:bg-white/5 dark:text-white">{formatQty(it.qty)} {it.unit_code}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="flex min-h-[140px] flex-col items-center justify-center text-center text-slate-400">
                        <FaBox size={22} className="mb-2 opacity-50" />
                        <p className="text-[11px] font-semibold">ຍັງບໍ່ມີລາຍການສິນຄ້າ</p>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === "chatter" && (
                  // Conversation is open to everyone (only DMs stay private), so
                  // the chatter is always writable here — even for head/manager
                  // whose schedule view is otherwise read-only.
                  <Chatter model="bill" recordId={selectedRow.bill_no} readOnly={false} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

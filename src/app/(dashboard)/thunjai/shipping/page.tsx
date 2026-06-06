"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBan,
  FaBoxOpen,
  FaBoxes,
  FaCalendarDay,
  FaCheckCircle,
  FaClipboardList,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaPhoneAlt,
  FaRegClock,
  FaRoute,
  FaSearch,
  FaShippingFast,
  FaSpinner,
  FaTimes,
  FaTrashAlt,
  FaTruck,
  FaTruckLoading,
  FaUndoAlt,
  FaUser,
  FaWeightHanging,
} from "react-icons/fa";
import { Actions } from "@/lib/api";

type Row = Record<string, unknown>;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartYmd() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function unwrapRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === "object") {
    const data = (value as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as Row[];
    if (data && typeof data === "object") return [data as Row];
  }
  return [];
}

function unwrapObject(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const inner = (value as Record<string, unknown>).data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Row;
    if (Array.isArray(inner)) return (inner[0] as Row) ?? null;
    return value as Row;
  }
  return null;
}

function valueText(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text !== "null" ? text : "-";
}

function pick(row: Row, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null) {
      const text = String(v).trim();
      if (text && text !== "null" && text !== "undefined") return text;
    }
  }
  return "";
}

const ORDER_STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  "0": { label: "ອອເດີໃໝ່", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200", dot: "bg-slate-400" },
  "1": { label: "ລໍຖ້າຮັບພັດສະດຸ", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200", dot: "bg-amber-400" },
  "2": { label: "ຮັບພັດສະດຸແລ້ວ", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200", dot: "bg-sky-400" },
  "3": { label: "ກຳລັງຂົນສົ່ງ", tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200", dot: "bg-indigo-400" },
  "4": { label: "ອອກນຳຈ່າຍ", tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200", dot: "bg-violet-400" },
  "5": { label: "ຍົກເລີກ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200", dot: "bg-rose-400" },
  "6": { label: "ຕີກັບ", tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200", dot: "bg-orange-400" },
  "7": { label: "ລໍອອກນຳຈ່າຍ", tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200", dot: "bg-violet-400" },
  "8": { label: "ສົ່ງບໍ່ສຳເລັດ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200", dot: "bg-rose-400" },
  "99": { label: "ສົ່ງສຳເລັດ", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", dot: "bg-emerald-500" },
};

// Gradient + accent-bar color per order status, used by the modal hero band
// and the leading bar on each table row.
const STATUS_GRADIENT: Record<string, string> = {
  "0": "from-slate-500 to-slate-700",
  "1": "from-amber-500 to-orange-500",
  "2": "from-sky-500 to-blue-600",
  "3": "from-indigo-500 to-blue-600",
  "4": "from-violet-500 to-purple-600",
  "5": "from-rose-500 to-red-600",
  "6": "from-orange-500 to-red-500",
  "7": "from-violet-500 to-purple-600",
  "8": "from-rose-500 to-red-600",
  "99": "from-emerald-500 to-green-600",
};
const STATUS_BAR: Record<string, string> = {
  "0": "bg-slate-400",
  "1": "bg-amber-400",
  "2": "bg-sky-400",
  "3": "bg-indigo-400",
  "4": "bg-violet-400",
  "5": "bg-rose-500",
  "6": "bg-orange-400",
  "7": "bg-violet-400",
  "8": "bg-rose-500",
  "99": "bg-emerald-500",
};

const PICKUP_STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  "0": { label: "ລໍຮັບເລື່ອງ", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200", dot: "bg-slate-400" },
  "1": { label: "ລໍເຂົ້າໄປຮັບ", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200", dot: "bg-amber-400" },
  "2": { label: "ກຳລັງເຂົ້າຮັບ", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200", dot: "bg-sky-400" },
  "3": { label: "ຮັບແລ້ວ", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", dot: "bg-emerald-500" },
  "4": { label: "ຮັບບໍ່ສຳເລັດ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200", dot: "bg-rose-400" },
  "98": { label: "ຍົກເລີກ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200", dot: "bg-rose-400" },
};

// Happy-path shipment journey for the tracking stepper.
const TRACK_STEPS: { keys: string[]; label: string; icon: React.ReactNode }[] = [
  { keys: ["0"], label: "ສ້າງອອเดอ", icon: <FaClipboardList /> },
  { keys: ["1", "2"], label: "ຮັບพัดสะดุ", icon: <FaBoxOpen /> },
  { keys: ["3"], label: "ກຳลังขนส่ง", icon: <FaTruck /> },
  { keys: ["4", "7"], label: "ออกนำจ่าย", icon: <FaShippingFast /> },
  { keys: ["99"], label: "ส่งสำเร็จ", icon: <FaCheckCircle /> },
];

// Statuses that break out of the happy path.
const EXCEPTION_STATUS: Record<
  string,
  { label: string; icon: React.ReactNode; reached: number }
> = {
  "5": { label: "ອອเดอนี้ถูกยกเลิก", icon: <FaBan />, reached: 0 },
  "6": { label: "ພัดสะดุถูกตีกลับ", icon: <FaUndoAlt />, reached: 2 },
  "8": { label: "ส่งไม่สำเร็จ", icon: <FaExclamationTriangle />, reached: 3 },
};

const EVENT_TIME_KEYS = [
  "status_time", "time", "datetime", "create_time", "created_at", "add_time", "timestamp", "date",
];
const EVENT_TITLE_KEYS = [
  "status_name", "status_text", "detail", "title", "name", "description",
];
const EVENT_REMARK_KEYS = ["remark", "note", "message"];
const EVENT_LOCATION_KEYS = [
  "location", "hub", "hub_name", "branch", "branch_name", "place", "city", "address",
];

function looksLikeEvents(rows: Row[]) {
  return (
    rows.length > 0 &&
    rows.some((r) => pick(r, EVENT_TIME_KEYS) || "status" in r || pick(r, EVENT_TITLE_KEYS))
  );
}

// The /order/tracking response shape is not strictly documented, so accept
// arrays, {data:[...]}, or an object nesting the events under a known key.
function extractEvents(value: unknown): Row[] {
  const direct = unwrapRows(value);
  if (looksLikeEvents(direct)) return direct;
  const obj = unwrapObject(value);
  if (obj) {
    for (const key of ["status_list", "tracking", "trackings", "history", "events", "list", "logs"]) {
      const arr = obj[key];
      if (Array.isArray(arr) && looksLikeEvents(arr as Row[])) return arr as Row[];
    }
  }
  return direct;
}

function StatusPill({
  status,
  map,
}: {
  status: unknown;
  map: Record<string, { label: string; tone: string }>;
}) {
  const key = String(status ?? "");
  const entry =
    map[key] ?? { label: key || "-", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.tone}`}>
      {entry.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  gradient,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg`}>
      <span className="pointer-events-none absolute -bottom-3 -right-1 text-6xl text-white/15">{icon}</span>
      <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-white/10 blur-xl" />
      <p className="relative text-[11px] font-medium text-white/85">{label}</p>
      <p className="relative mt-1 text-3xl font-extrabold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/40 px-4 py-3 dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-300">
            {icon}
          </span>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
      />
    </label>
  );
}

function Button({
  children,
  onClick,
  loading,
  tone = "teal",
  size = "md",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  tone?: "teal" | "slate" | "rose";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const tones = {
    teal: "bg-gradient-to-br from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white shadow-sm shadow-teal-600/25",
    slate: "bg-slate-900 hover:bg-slate-800 text-white dark:bg-white/10 dark:hover:bg-white/15",
    rose: "bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-[11px]", md: "px-4 py-2.5 text-sm" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${tones[tone]} ${sizes[size]}`}
    >
      {loading ? <FaSpinner className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function TrackingStepper({ status }: { status: string }) {
  const exception = EXCEPTION_STATUS[status];
  const happyIdx = TRACK_STEPS.findIndex((s) => s.keys.includes(status));
  const reachedIdx = exception ? exception.reached : happyIdx;
  const lastIdx = TRACK_STEPS.length - 1;
  const accentExc = Boolean(exception);
  // Circle centers sit at 10%,30%,…,90% of the row; fill the track between them.
  const fillPct = reachedIdx <= 0 ? 0 : (reachedIdx / lastIdx) * 80;

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="relative">
        {/* track */}
        <div className="absolute left-[10%] right-[10%] top-4 h-1 rounded-full bg-slate-200 dark:bg-white/10" />
        {/* progress fill */}
        <div
          className={`absolute left-[10%] top-4 h-1 rounded-full bg-gradient-to-r transition-all duration-500 ${
            accentExc ? "from-rose-400 to-red-500" : "from-teal-500 to-emerald-500"
          }`}
          style={{ width: `${fillPct}%` }}
        />
        <div className="relative flex items-start justify-between">
          {TRACK_STEPS.map((step, i) => {
            const done = reachedIdx >= 0 && i <= reachedIdx;
            const current = i === reachedIdx;
            const circle = done
              ? accentExc
                ? "bg-gradient-to-br from-rose-400 to-red-500 text-white shadow-md shadow-rose-500/30"
                : "bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-md shadow-teal-500/30"
              : "bg-white text-slate-300 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-white/10";
            return (
              <div key={step.label} className="flex flex-1 flex-col items-center">
                <span
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs transition ${circle} ${
                    current && !accentExc ? "ring-4 ring-teal-500/20 dark:ring-teal-400/25" : ""
                  }`}
                >
                  {step.icon}
                  {current && !accentExc && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/30" />
                  )}
                </span>
                <span
                  className={`mt-1.5 text-center text-[9px] font-semibold leading-tight ${
                    done ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {exception && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
          <span className="text-sm">{exception.icon}</span>
          {exception.label}
        </div>
      )}
    </div>
  );
}

function TrackingTimeline({
  events,
  currentStatus,
  loading,
}: {
  events: Row[];
  currentStatus: string;
  loading: boolean;
}) {
  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
        <FaSpinner className="animate-spin" /> ກຳລັງໂຫຼດ tracking…
      </div>
    );
  }
  if (events.length === 0) {
    return <div className="py-4 text-center text-xs text-slate-400">ຍັງບໍ່ມີປະຫວັດ tracking</div>;
  }
  return (
    <ol className="relative space-y-3 border-l-2 border-dashed border-slate-200 pl-5 dark:border-white/10">
      {events.map((ev, i) => {
        const st = String(ev.status ?? "");
        const meta = ORDER_STATUS[st];
        const title = meta?.label ?? (pick(ev, EVENT_TITLE_KEYS) || "-");
        const time = pick(ev, EVENT_TIME_KEYS);
        const loc = pick(ev, EVENT_LOCATION_KEYS);
        const remark = pick(ev, EVENT_REMARK_KEYS);
        const isActive = st !== "" && st === currentStatus;
        return (
          <li key={i} className="relative text-xs">
            <span
              className={`absolute -left-[26px] top-0.5 h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-950 ${
                meta?.dot ?? "bg-slate-300"
              } ${isActive ? "scale-125 shadow-md shadow-teal-500/40" : ""}`}
            />
            <div className={`font-semibold ${isActive ? "text-teal-700 dark:text-teal-300" : "text-slate-700 dark:text-slate-200"}`}>
              {title}
            </div>
            {loc && (
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <FaMapMarkerAlt className="text-[8px]" /> {loc}
              </div>
            )}
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              {time && (
                <>
                  <FaRegClock className="text-[8px]" /> {time}
                </>
              )}
              {remark && remark !== title ? ` · ${remark}` : ""}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function ThunJaiShippingPage() {
  const [orderFrom, setOrderFrom] = useState(monthStartYmd());
  const [orderTo, setOrderTo] = useState(todayYmd());
  const [orderNo, setOrderNo] = useState("");
  const [ordersResult, setOrdersResult] = useState<unknown>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [pickupFrom, setPickupFrom] = useState(monthStartYmd());
  const [pickupTo, setPickupTo] = useState(todayYmd());
  const [pickupsResult, setPickupsResult] = useState<unknown>(null);

  const [senders, setSenders] = useState<Row[]>([]);
  const [pickupSenderId, setPickupSenderId] = useState("");

  const [orderDetail, setOrderDetail] = useState<Row | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<Row[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [pickupDetail, setPickupDetail] = useState<Row | null>(null);

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orderRows = useMemo(() => unwrapRows(ordersResult), [ordersResult]);
  const pickupRows = useMemo(() => unwrapRows(pickupsResult), [pickupsResult]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of orderRows) {
      const key = String(row.status ?? "");
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [orderRows]);

  const statusKeys = useMemo(
    () => Object.keys(statusCounts).sort((a, b) => Number(a) - Number(b)),
    [statusCounts]
  );

  const stats = useMemo(() => {
    const c = statusCounts;
    const sum = (...keys: string[]) => keys.reduce((acc, k) => acc + (c[k] ?? 0), 0);
    return [
      { label: "ທັງໝົດ", value: orderRows.length, icon: <FaClipboardList />, gradient: "from-slate-700 to-slate-900" },
      { label: "ກຳລັງຂົນສົ່ງ", value: sum("3"), icon: <FaTruck />, gradient: "from-sky-500 to-blue-600" },
      { label: "ອອກນຳຈ່າຍ", value: sum("4", "7"), icon: <FaShippingFast />, gradient: "from-amber-500 to-orange-600" },
      { label: "ສົ່ງສຳເລັດ", value: sum("99"), icon: <FaCheckCircle />, gradient: "from-emerald-500 to-green-600" },
      { label: "ມີບັນຫາ", value: sum("5", "6", "8"), icon: <FaExclamationTriangle />, gradient: "from-rose-500 to-red-600" },
    ];
  }, [statusCounts, orderRows.length]);

  const filteredOrders = useMemo(
    () =>
      statusFilter === "all"
        ? orderRows
        : orderRows.filter((row) => String(row.status ?? "") === statusFilter),
    [orderRows, statusFilter]
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await Actions.listThunJaiSenderAddresses();
        const rows = unwrapRows(res);
        setSenders(rows);
        const def = rows.find((r) => r.sender_addr_is_default === true) ?? rows[0];
        if (def) setPickupSenderId(valueText(def.sender_addr_id ?? def.id).replace("-", ""));
      } catch {
        /* sender list is optional */
      }
    })();
  }, []);

  const run = async <T,>(key: string, task: () => Promise<T>): Promise<T | null> => {
    setLoading(key);
    setError(null);
    setNotice(null);
    try {
      return await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ThunJai API request failed");
      return null;
    } finally {
      setLoading(null);
    }
  };

  const loadOrders = async () => {
    const data = await run("orders", () =>
      Actions.listThunJaiOrders({ date_start: orderFrom, date_end: orderTo, order_no: orderNo })
    );
    setOrdersResult(data);
    setSelectedIds([]);
  };

  const loadPickups = async () => {
    const data = await run("pickups", () =>
      Actions.listThunJaiPickups({ date_start: pickupFrom, date_end: pickupTo })
    );
    setPickupsResult(data);
  };

  const openOrder = async (id: string) => {
    setTrackingEvents([]);
    const data = await run("detail", () => Actions.getThunJaiOrderDetail(id));
    const obj = unwrapObject(data);
    if (!obj) return;
    setOrderDetail(obj);
    // Pull the dedicated tracking feed (richer than detail.status_list) in the
    // background so the modal opens instantly and the timeline fills in after.
    setTrackingLoading(true);
    try {
      const tr = await Actions.getThunJaiOrderTracking(id);
      const events = extractEvents(tr);
      if (events.length > 0) setTrackingEvents(events);
    } catch {
      /* tracking is optional — fall back to detail.status_list */
    } finally {
      setTrackingLoading(false);
    }
  };

  const openLabel = async (id: string) => {
    const data = await run("label", () => Actions.getThunJaiOrderLabel(id));
    const obj = unwrapObject(data);
    const url = valueText(obj?.url);
    if (url !== "-") window.open(url, "_blank", "noopener,noreferrer");
    else setError("ບໍ່ພົບ URL ໃບປະໜ້າ");
  };

  const cancelOrder = async (id: string, no: string) => {
    if (!window.confirm(`ຢືນຢັນຍົກເລີກ/ລຶບ order ${no || id}?`)) return;
    const data = await run("cancel", () => Actions.deleteThunJaiOrder(id));
    if (data == null) return;
    setNotice(`ຍົກເລີກ order ${no || id} ສຳເລັດ`);
    setOrderDetail(null);
    await loadOrders();
  };

  const openPickup = async (id: string) => {
    const data = await run("pickup-detail", () => Actions.getThunJaiPickupDetail(id));
    const obj = unwrapObject(data);
    if (obj) setPickupDetail(obj);
  };

  const requestPickup = async () => {
    if (!pickupSenderId) {
      setError("ກະລຸນາເລືອກທີ່ຢູ່ຜູ້ສົ່ງ");
      return;
    }
    if (selectedIds.length === 0) {
      setError("ກະລຸນາເລືອກ order ຢ່າງໜ້ອຍ 1 ລາຍການຈາກຕາຕະລາງ");
      return;
    }
    const data = await run("request-pickup", () =>
      Actions.requestThunJaiPickup({ sender_addr_id: pickupSenderId, order_id_list: selectedIds })
    );
    if (data == null) return;
    const obj = unwrapObject(data);
    setNotice(`ເອີ້ນຮັບພັດສະດຸສຳເລັດ: ${valueText(obj?.pickup_no)}`);
    setSelectedIds([]);
    await loadPickups();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allSelected =
    filteredOrders.length > 0 && filteredOrders.every((r) => selectedIds.includes(valueText(r.id)));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : filteredOrders.map((r) => valueText(r.id)));
  };

  const codAmount =
    orderDetail != null
      ? pick(orderDetail, ["cod_price", "cod_amount", "cod_total", "total_cod", "price"])
      : "";
  const detailStatus = String(orderDetail?.status ?? "");

  return (
    <div className="space-y-4">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-500 p-5 text-white shadow-xl shadow-teal-900/20">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <FaTruck className="pointer-events-none absolute -bottom-5 right-6 text-[120px] text-white/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl backdrop-blur">
              <FaTruckLoading />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">ທັນໃຈ ຂົນສົ່ງ</h1>
              <p className="text-xs text-white/80">ຄົ້ນຫາ · ຕິດຕາມ · ໃບປະໜ້າ · ເອີ້ນຮັບພັດສະດຸ</p>
            </div>
          </div>
          {orderRows.length > 0 && (
            <div className="rounded-2xl bg-white/15 px-4 py-2 text-right backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider text-white/70">ອອเดอທັງໝົด</div>
              <div className="text-2xl font-extrabold leading-none">{orderRows.length}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} gradient={s.gradient} />
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-500/10 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:text-rose-300">
          <FaExclamationTriangle className="shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-300">
          <FaCheckCircle className="shrink-0" /> {notice}
        </div>
      )}

      <Panel
        title="ລາຍການອອເດอ ThunJai"
        icon={<FaClipboardList />}
        action={
          selectedIds.length > 0 ? (
            <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-200">
              ເລືອກ {selectedIds.length} ລາຍການ
            </span>
          ) : null
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto]">
          <Field label="ຈາກວັນທີ" type="date" value={orderFrom} onChange={setOrderFrom} />
          <Field label="ຫາວັນທີ" type="date" value={orderTo} onChange={setOrderTo} />
          <Field label="Order No" value={orderNo} onChange={setOrderNo} placeholder="TJxxxxxxx" />
          <div className="flex items-end">
            <Button onClick={() => void loadOrders()} loading={loading === "orders"}>
              <FaSearch /> ຄົ້ນຫາ
            </Button>
          </div>
        </div>

        {orderRows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                statusFilter === "all"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              ທັງໝົດ ({orderRows.length})
            </button>
            {statusKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                  statusFilter === key
                    ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                }`}
              >
                {ORDER_STATUS[key]?.label ?? key} ({statusCounts[key]})
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/60 dark:border-white/10">
          <table className="min-w-full divide-y divide-slate-200/60 text-xs dark:divide-white/10">
            <thead className="bg-slate-50/80 text-left text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="ເລືອກທັງໝົດ" />
                </th>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">ຜູ້ຮັບ</th>
                <th className="px-3 py-2.5">ປາຍທາງ</th>
                <th className="px-3 py-2.5">ສະຖານะ</th>
                <th className="px-3 py-2.5 text-center">COD</th>
                <th className="px-3 py-2.5">ວັນທີ</th>
                <th className="px-3 py-2.5 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {filteredOrders.map((row, index) => {
                const id = valueText(row.id);
                const selected = selectedIds.includes(id);
                const st = String(row.status ?? "");
                return (
                  <tr
                    key={`${row.id ?? index}`}
                    className={`group transition hover:bg-teal-500/5 ${selected ? "bg-teal-500/5" : ""}`}
                  >
                    <td className="relative px-3 py-2.5">
                      <span className={`absolute left-0 top-0 h-full w-1 ${STATUS_BAR[st] ?? "bg-slate-300"}`} />
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(id)}
                        aria-label={`ເລືອກ ${valueText(row.no)}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-white">{valueText(row.no)}</td>
                    <td className="px-3 py-2.5">
                      <div>{valueText(row.receiver_name)}</div>
                      <div className="text-[10px] text-slate-400">{valueText(row.receiver_tel)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-500">
                      {valueText(row.receiver_addr_district)}, {valueText(row.receiver_addr_province)}
                    </td>
                    <td className="px-3 py-2.5"><StatusPill status={row.status} map={ORDER_STATUS} /></td>
                    <td className="px-3 py-2.5 text-center">
                      {row.cod ? <FaCheckCircle className="mx-auto text-emerald-500" /> : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{valueText(row.add_time)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" tone="slate" onClick={() => void openOrder(id)} loading={loading === "detail"}>
                          <FaRoute /> ຕິດຕາມ
                        </Button>
                        <Button size="sm" onClick={() => void openLabel(id)} loading={loading === "label"}>
                          <FaExternalLinkAlt /> ໃບປະໜ້າ
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-400" colSpan={8}>
                    <FaBoxOpen className="mx-auto mb-2 text-2xl text-slate-300" />
                    {orderRows.length === 0
                      ? "ຍັງບໍ່ມີຂໍ້ມູນ — ກົດ “ຄົ້ນຫາ” ເພື່ອໂຫຼດ"
                      : "ບໍ່ມີ order ໃນສະຖານะนี้"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
        <Panel title="ເອີ້ນຮັບພັດສະດຸ (Pickup)" icon={<FaMapMarkerAlt />}>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">ທີ່ຢູ່ຜູ້ສົ່ງ</span>
              <select
                value={pickupSenderId}
                onChange={(e) => setPickupSenderId(e.target.value)}
                className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
              >
                <option value="">ເລືອກຜູ້ສົ່ງ</option>
                {senders.map((row, index) => {
                  const id = valueText(row.sender_addr_id ?? row.id);
                  return (
                    <option key={`${id}-${index}`} value={id}>
                      {id} - {valueText(row.sender_addr_name ?? row.name)}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[11px] text-slate-500 dark:border-white/15 dark:text-slate-400">
              ເລືອກ order ຈາກຕາຕະລາງຂ້າງເທິງ (ໝາຍ ✓) ແລ້ວກົດປຸ່ມລຸ່ມນີ້.
              {selectedIds.length > 0 && (
                <div className="mt-1 font-semibold text-teal-700 dark:text-teal-300">
                  ເລືອກແລ້ວ: {selectedIds.length} ລາຍການ
                </div>
              )}
            </div>
            <Button onClick={() => void requestPickup()} loading={loading === "request-pickup"} disabled={selectedIds.length === 0}>
              <FaTruckLoading /> ເອີ້ນຮັບພັດສະດຸ
            </Button>
          </div>
        </Panel>

        <Panel
          title="ປະຫວັດ Pickup"
          icon={<FaCalendarDay />}
          action={
            <div className="flex items-end gap-2">
              <input
                type="date"
                value={pickupFrom}
                onChange={(e) => setPickupFrom(e.target.value)}
                className="glass-input rounded-md px-2 py-1 text-[11px] text-slate-700 dark:text-slate-100"
              />
              <input
                type="date"
                value={pickupTo}
                onChange={(e) => setPickupTo(e.target.value)}
                className="glass-input rounded-md px-2 py-1 text-[11px] text-slate-700 dark:text-slate-100"
              />
              <Button size="sm" tone="slate" onClick={() => void loadPickups()} loading={loading === "pickups"}>
                <FaSearch /> ໂຫຼດ
              </Button>
            </div>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200/60 dark:border-white/10">
            <table className="min-w-full divide-y divide-slate-200/60 text-xs dark:divide-white/10">
              <thead className="bg-slate-50/80 text-left text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Pickup No</th>
                  <th className="px-3 py-2.5">ຜູ້ສົ່ງ</th>
                  <th className="px-3 py-2.5">Rider</th>
                  <th className="px-3 py-2.5">ສະຖານะ</th>
                  <th className="px-3 py-2.5 text-right">ລາຍລະອຽດ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {pickupRows.map((row, index) => (
                  <tr key={`${row.id ?? index}`} className="transition hover:bg-teal-500/5">
                    <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-white">{valueText(row.no)}</td>
                    <td className="px-3 py-2.5">{valueText(row.sender_addr_name)}</td>
                    <td className="px-3 py-2.5">{valueText(row.rider_name)}</td>
                    <td className="px-3 py-2.5"><StatusPill status={row.status} map={PICKUP_STATUS} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" tone="slate" onClick={() => void openPickup(valueText(row.id))} loading={loading === "pickup-detail"}>
                        <FaSearch /> ເບິ່ງ
                      </Button>
                    </td>
                  </tr>
                ))}
                {pickupRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-10 text-center text-slate-400" colSpan={5}>
                      <FaTruckLoading className="mx-auto mb-2 text-2xl text-slate-300" />
                      ຍັງບໍ່ມີຂໍ້ມູນ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {orderDetail && (
        <Modal
          onClose={() => setOrderDetail(null)}
          accent={STATUS_GRADIENT[detailStatus] ?? "from-slate-600 to-slate-800"}
          title={
            <span className="flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/75">ຕິດຕາມ Order</span>
              <span className="text-base font-extrabold leading-tight">{valueText(orderDetail.no)}</span>
            </span>
          }
          badge={ORDER_STATUS[detailStatus]?.label ?? detailStatus}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <FaRegClock className="text-[9px]" /> {valueText(orderDetail.add_time)}
              {valueText(orderDetail.delivery_level_label) !== "-" && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {valueText(orderDetail.delivery_level_label)}
                </span>
              )}
            </div>

            <TrackingStepper status={detailStatus} />

            <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-white/10">
              <div className="mb-1 flex flex-wrap items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                <FaUser className="text-teal-600 dark:text-teal-300" /> {valueText(orderDetail.receiver_name)}
                <span className="flex items-center gap-1 font-normal text-slate-500">
                  <FaPhoneAlt className="text-[9px]" /> {valueText(orderDetail.receiver_tel)}
                </span>
              </div>
              <div className="text-slate-500">
                {valueText(orderDetail.receiver_addr)} — {valueText(orderDetail.receiver_addr_district_sub)},{" "}
                {valueText(orderDetail.receiver_addr_district)}, {valueText(orderDetail.receiver_addr_province)}
              </div>
              {Array.isArray(orderDetail.estimated_delivery_date) && orderDetail.estimated_delivery_date.length > 0 && (
                <div className="mt-1 flex items-center gap-1 text-slate-500">
                  <FaCalendarDay className="text-[9px]" /> ຄາດວ່າຮອດ:{" "}
                  {(orderDetail.estimated_delivery_date as unknown[]).map(valueText).join(" - ")}
                </div>
              )}
              {codAmount && (
                <div className="mt-1 flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <FaMoneyBillWave className="text-[9px]" /> COD: {codAmount}
                </div>
              )}
            </div>

            {Array.isArray(orderDetail.product_list) && orderDetail.product_list.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">
                  <FaBoxes className="text-teal-600 dark:text-teal-300" /> ພັດສະดุ ({(orderDetail.product_list as Row[]).length})
                </div>
                <ul className="divide-y divide-slate-100 text-xs dark:divide-white/10">
                  {(orderDetail.product_list as Row[]).map((p, i) => (
                    <li key={i} className="flex justify-between px-3 py-2">
                      <span>{valueText(p.product_name)}</span>
                      <span className="flex items-center gap-2 text-slate-500">
                        <span>x{valueText(p.qty)}</span>
                        <span className="flex items-center gap-1">
                          <FaWeightHanging className="text-[8px]" /> {valueText(p.weight)}kg
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <FaRoute className="text-teal-600 dark:text-teal-300" /> ໄທມ໌ໄລນ໌ສະຖານະ
              </div>
              <TrackingTimeline
                events={
                  trackingEvents.length > 0
                    ? trackingEvents
                    : Array.isArray(orderDetail.status_list)
                      ? (orderDetail.status_list as Row[])
                      : []
                }
                currentStatus={detailStatus}
                loading={trackingLoading}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
              <Button tone="slate" onClick={() => void openLabel(valueText(orderDetail.id))} loading={loading === "label"}>
                <FaExternalLinkAlt /> ໃບປະໜ້າ
              </Button>
              <Button
                tone="rose"
                onClick={() => void cancelOrder(valueText(orderDetail.id), valueText(orderDetail.no))}
                loading={loading === "cancel"}
              >
                <FaTrashAlt /> ຍົກເລີກ order
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pickupDetail && (
        <Modal
          onClose={() => setPickupDetail(null)}
          accent="from-sky-500 to-blue-600"
          title={
            <span className="flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/75">Pickup</span>
              <span className="text-base font-extrabold leading-tight">{valueText(pickupDetail.no)}</span>
            </span>
          }
          badge={PICKUP_STATUS[String(pickupDetail.status ?? "")]?.label}
        >
          <div className="space-y-4">
            <div className="text-[11px] text-slate-500">{valueText(pickupDetail.add_time)}</div>
            <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-white/10">
              <div className="font-semibold text-slate-700 dark:text-slate-200">{valueText(pickupDetail.sender_addr_name)}</div>
              <div className="text-slate-500">{valueText(pickupDetail.sender_addr)}</div>
              {valueText(pickupDetail.rider_name) !== "-" && (
                <div className="mt-1 text-slate-500">
                  Rider: {valueText(pickupDetail.rider_name)} ({valueText(pickupDetail.rider_tel)}) ·{" "}
                  {valueText(pickupDetail.rider_vehicle_brand)} {valueText(pickupDetail.rider_vehicle_model)}
                </div>
              )}
            </div>
            {Array.isArray(pickupDetail.order_list) && pickupDetail.order_list.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-white/10">
                <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">
                  ອອเดอในใน pickup ({(pickupDetail.order_list as Row[]).length})
                </div>
                <ul className="divide-y divide-slate-100 text-xs dark:divide-white/10">
                  {(pickupDetail.order_list as Row[]).map((o, i) => (
                    <li key={i} className="flex justify-between px-3 py-2">
                      <span className="font-semibold">{valueText(o.no)}</span>
                      <span className="text-slate-500">{valueText(o.receiver_name)} · {valueText(o.receiver_addr_district)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  accent,
  badge,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  accent?: string;
  badge?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-950">
        <div
          className={`relative flex items-center justify-between gap-3 px-4 py-3 ${
            accent ? `bg-gradient-to-r ${accent} text-white` : "border-b border-slate-200 dark:border-white/10"
          }`}
        >
          <div className="min-w-0 flex-1">{title}</div>
          <div className="flex items-center gap-2">
            {badge && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold backdrop-blur">{badge}</span>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${
                accent
                  ? "border-white/30 text-white hover:bg-white/15"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
              }`}
              aria-label="Close"
            >
              <FaTimes />
            </button>
          </div>
        </div>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

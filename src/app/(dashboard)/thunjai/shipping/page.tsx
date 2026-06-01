"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendarDay,
  FaClipboardList,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaRoute,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrashAlt,
  FaTruckLoading,
  FaUser,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";

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
  return text || "-";
}

const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  "0": { label: "ອອເດີໃໝ່", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" },
  "1": { label: "ລໍຖ້າຮັບພັດສະດຸ", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" },
  "2": { label: "ຮັບພັດສະດຸແລ້ວ", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200" },
  "3": { label: "ກຳລັງຂົນສົ່ງ", tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200" },
  "4": { label: "ອອກນຳຈ່າຍ", tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200" },
  "5": { label: "ຍົກເລີກ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  "6": { label: "ຕີກັບ", tone: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200" },
  "7": { label: "ລໍອອກນຳຈ່າຍ", tone: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200" },
  "8": { label: "ສົ່ງບໍ່ສຳເລັດ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  "99": { label: "ສົ່ງສຳເລັດ", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
};

const PICKUP_STATUS: Record<string, { label: string; tone: string }> = {
  "0": { label: "ລໍຮັບເລື່ອງ", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" },
  "1": { label: "ລໍເຂົ້າໄປຮັບ", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" },
  "2": { label: "ກຳລັງເຂົ້າຮັບ", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200" },
  "3": { label: "ຮັບແລ້ວ", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
  "4": { label: "ຮັບບໍ່ສຳເລັດ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  "98": { label: "ຍົກເລີກ", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
};

function StatusPill({ status, map }: { status: unknown; map: Record<string, { label: string; tone: string }> }) {
  const key = String(status ?? "");
  const entry = map[key] ?? { label: key || "-", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.tone}`}>
      {entry.label}
    </span>
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
    <section className="rounded-xl border border-slate-200/70 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-2.5 dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-teal-600 dark:text-teal-300">{icon}</span>
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
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
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
    teal: "bg-teal-600 hover:bg-teal-700 text-white",
    slate: "bg-slate-900 hover:bg-slate-800 text-white",
    rose: "bg-rose-600 hover:bg-rose-700 text-white",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-[11px]", md: "px-4 py-2.5 text-sm" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold disabled:opacity-50 ${tones[tone]} ${sizes[size]}`}
    >
      {loading ? <FaSpinner className="animate-spin" /> : null}
      {children}
    </button>
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
    () =>
      Object.keys(statusCounts).sort((a, b) => Number(a) - Number(b)),
    [statusCounts]
  );

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
    const data = await run("detail", () => Actions.getThunJaiOrderDetail(id));
    const obj = unwrapObject(data);
    if (obj) setOrderDetail(obj);
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

  return (
    <div className="space-y-4">
      <StatusPageHeader
        title="ທັນໃຈຂົນສົ່ງ"
        subtitle="ຈັດການອອເດີ ThunJai: ຄົ້ນຫາ, ຕິດຕາມ, ໃບປະໜ້າ, ຍົກເລີກ ແລະ ເອີ້ນຮັບພັດສະດຸ"
        icon={<FaTruckLoading />}
        tone="teal"
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-500/10 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <Panel
        title="ລາຍການອອເດີ ThunJai"
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
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                statusFilter === "all"
                  ? "bg-teal-600 text-white"
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
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  statusFilter === key
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                }`}
              >
                {ORDER_STATUS[key]?.label ?? key} ({statusCounts[key]})
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
          <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-white/10">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="ເລືອກທັງໝົດ" />
                </th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">ຜູ້ຮັບ</th>
                <th className="px-3 py-2">ປາຍທາງ</th>
                <th className="px-3 py-2">ສະຖານະ</th>
                <th className="px-3 py-2 text-center">COD</th>
                <th className="px-3 py-2">ວັນທີ</th>
                <th className="px-3 py-2 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {filteredOrders.map((row, index) => {
                const id = valueText(row.id);
                return (
                  <tr key={`${row.id ?? index}`} className="hover:bg-teal-500/5">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(id)}
                        onChange={() => toggleSelect(id)}
                        aria-label={`ເລືອກ ${valueText(row.no)}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-white">{valueText(row.no)}</td>
                    <td className="px-3 py-2">
                      <div>{valueText(row.receiver_name)}</div>
                      <div className="text-[10px] text-slate-400">{valueText(row.receiver_tel)}</div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {valueText(row.receiver_addr_district)}, {valueText(row.receiver_addr_province)}
                    </td>
                    <td className="px-3 py-2"><StatusPill status={row.status} map={ORDER_STATUS} /></td>
                    <td className="px-3 py-2 text-center">{row.cod ? "✓" : "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{valueText(row.add_time)}</td>
                    <td className="px-3 py-2">
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
                  <td className="px-3 py-8 text-center text-slate-400" colSpan={8}>
                    {orderRows.length === 0
                      ? "ຍັງບໍ່ມີຂໍ້ມູນ — ກົດ “ຄົ້ນຫາ” ເພື່ອໂຫຼດ"
                      : "ບໍ່ມີ order ໃນສະຖານະນີ້"}
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
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
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
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
              />
              <input
                type="date"
                value={pickupTo}
                onChange={(e) => setPickupTo(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
              />
              <Button size="sm" tone="slate" onClick={() => void loadPickups()} loading={loading === "pickups"}>
                <FaSearch /> ໂຫຼດ
              </Button>
            </div>
          }
        >
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
            <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-white/10">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Pickup No</th>
                  <th className="px-3 py-2">ຜູ້ສົ່ງ</th>
                  <th className="px-3 py-2">Rider</th>
                  <th className="px-3 py-2">ສະຖານະ</th>
                  <th className="px-3 py-2 text-right">ລາຍລະອຽດ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {pickupRows.map((row, index) => (
                  <tr key={`${row.id ?? index}`} className="hover:bg-teal-500/5">
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-white">{valueText(row.no)}</td>
                    <td className="px-3 py-2">{valueText(row.sender_addr_name)}</td>
                    <td className="px-3 py-2">{valueText(row.rider_name)}</td>
                    <td className="px-3 py-2"><StatusPill status={row.status} map={PICKUP_STATUS} /></td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" tone="slate" onClick={() => void openPickup(valueText(row.id))} loading={loading === "pickup-detail"}>
                        <FaSearch /> ເບິ່ງ
                      </Button>
                    </td>
                  </tr>
                ))}
                {pickupRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-400" colSpan={5}>
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
        <Modal title={`Order ${valueText(orderDetail.no)}`} onClose={() => setOrderDetail(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={orderDetail.status} map={ORDER_STATUS} />
              <span className="text-[11px] text-slate-500">{valueText(orderDetail.add_time)}</span>
              {valueText(orderDetail.delivery_level_label) !== "-" && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {valueText(orderDetail.delivery_level_label)}
                </span>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-white/10">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
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
                <div className="mt-1 text-slate-500">
                  ຄາດວ່າຮອດ: {(orderDetail.estimated_delivery_date as unknown[]).map(valueText).join(" - ")}
                </div>
              )}
            </div>

            {Array.isArray(orderDetail.product_list) && orderDetail.product_list.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">
                  <FaBoxOpen className="text-teal-600 dark:text-teal-300" /> ພັດສະດຸ
                </div>
                <ul className="divide-y divide-slate-100 text-xs dark:divide-white/10">
                  {(orderDetail.product_list as Row[]).map((p, i) => (
                    <li key={i} className="flex justify-between px-3 py-2">
                      <span>{valueText(p.product_name)}</span>
                      <span className="text-slate-500">x{valueText(p.qty)} · {valueText(p.weight)}kg</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(orderDetail.status_list) && orderDetail.status_list.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <FaRoute className="text-teal-600 dark:text-teal-300" /> ໄທມ໌ໄລນ໌ສະຖານະ
                </div>
                <ol className="space-y-2 border-l-2 border-slate-200 pl-4 dark:border-white/10">
                  {(orderDetail.status_list as Row[]).map((s, i) => (
                    <li key={i} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-teal-500" />
                      <div className="font-semibold text-slate-700 dark:text-slate-200">
                        {ORDER_STATUS[String(s.status ?? "")]?.label ?? valueText(s.detail)}
                      </div>
                      <div className="text-[10px] text-slate-400">{valueText(s.status_time)}{valueText(s.remark) !== "-" ? ` · ${valueText(s.remark)}` : ""}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

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
        <Modal title={`Pickup ${valueText(pickupDetail.no)}`} onClose={() => setPickupDetail(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusPill status={pickupDetail.status} map={PICKUP_STATUS} />
              <span className="text-[11px] text-slate-500">{valueText(pickupDetail.add_time)}</span>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-white/10">
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
              <div className="rounded-lg border border-slate-200 dark:border-white/10">
                <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">
                  ອອເດີໃນ pickup ({(pickupDetail.order_list as Row[]).length})
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

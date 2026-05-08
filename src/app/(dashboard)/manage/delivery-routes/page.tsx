"use client";

import { useEffect, useState } from "react";
import {
  FaCheck,
  FaPlus,
  FaRoute,
  FaSpinner,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  StatusPageHeader,
  StatusTableShell,
} from "@/components/status-page-shell";
import { useConfirm } from "@/components/confirm-dialog";

interface RoutePoint {
  name: string;
  lat: number | null;
  lng: number | null;
}

interface RouteRow {
  code: string;
  name: string;
  origin: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  waypoints: RoutePoint[];
  distance_km: number;
  sort_order: number;
  active: boolean;
}

const EMPTY: RouteRow = {
  code: "",
  name: "",
  origin: "",
  origin_lat: null,
  origin_lng: null,
  destination: "",
  destination_lat: null,
  destination_lng: null,
  waypoints: [],
  distance_km: 0,
  sort_order: 0,
  active: true,
};

function normalizePoint(value: unknown): RoutePoint {
  if (value && typeof value === "object") {
    const item = value as { name?: unknown; lat?: unknown; lng?: unknown };
    const lat = item.lat === null || item.lat === undefined || item.lat === "" ? null : Number(item.lat);
    const lng = item.lng === null || item.lng === undefined || item.lng === "" ? null : Number(item.lng);
    return {
      name: String(item.name ?? "").trim(),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    };
  }
  return {
    name: String(value ?? "").trim(),
    lat: null,
    lng: null,
  };
}

function normalizeRoute(row: RouteRow): RouteRow {
  return {
    ...row,
    origin_lat: row.origin_lat === null || row.origin_lat === undefined ? null : Number(row.origin_lat),
    origin_lng: row.origin_lng === null || row.origin_lng === undefined ? null : Number(row.origin_lng),
    destination_lat:
      row.destination_lat === null || row.destination_lat === undefined ? null : Number(row.destination_lat),
    destination_lng:
      row.destination_lng === null || row.destination_lng === undefined ? null : Number(row.destination_lng),
    distance_km: Number(row.distance_km ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    waypoints: (row.waypoints ?? []).map(normalizePoint),
  };
}

function pointLabel(point: RoutePoint | string) {
  if (typeof point === "string") return point;
  return point.name;
}

function routePath(row: RouteRow) {
  return [row.origin, ...(row.waypoints ?? []), row.destination]
    .map((item) => String(typeof item === "string" ? item : pointLabel(item)).trim())
    .filter(Boolean)
    .join(" → ");
}

function formatLocation(lat: number | null, lng: number | null) {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat}, ${lng}`;
}

export default function DeliveryRoutesPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await Actions.listDeliveryRoutes(false)) as RouteRow[];
      setRows((data ?? []).map((row) => normalizeRoute(row)));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("ກະລຸນາໃສ່ຊື່ເສັ້ນທາງ");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Actions.upsertDeliveryRoute(editing);
      setEditing(null);
      await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (code: string) => {
    const ok = await confirm({
      title: "ລຶບເສັ້ນທາງ",
      message: `ລຶບເສັ້ນທາງ "${code}" ?`,
      tone: "danger",
      confirmLabel: "ລຶບ",
    });
    if (!ok) return;
    try {
      await Actions.deleteDeliveryRoute(code);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ເສັ້ນທາງການຂົນສົ່ງ"
        subtitle="ຕັ້ງຄ່າ route ຂົນສົ່ງ ເຊັ່ນ ຕົ້ນທາງ, ປາຍທາງ ແລະໄລຍະທາງ ເພື່ອນຳໃຊ້ກັບບິນຄ້າງສົ່ງ"
        icon={<FaRoute />}
        tone="teal"
        aside={
          <button
            type="button"
            onClick={() => setEditing({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-teal-800"
          >
            <FaPlus size={11} /> ເພີ່ມເສັ້ນທາງ
          </button>
        }
      />

      <StatusTableShell count={rows.length}>
        {loading ? (
          <div className="py-14 flex items-center justify-center text-slate-400 text-sm">
            <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-slate-400 text-sm">
            ຍັງບໍ່ມີເສັ້ນທາງ — ກົດ "ເພີ່ມເສັ້ນທາງ" ເພື່ອເລີ່ມ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/30 dark:bg-white/5 border-b border-slate-200/30 dark:border-white/5">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລະຫັດ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ເສັ້ນທາງ</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ລຳດັບທາງຜ່ານ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">KM</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">ສະຖານະ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.code}
                    className="border-b border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5 cursor-pointer"
                    onClick={() => setEditing(normalizeRoute(r))}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-200">{r.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{r.name}</td>
                    <td className="px-4 py-3 text-slate-500">{routePath(r) || "-"}</td>
                    <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                      {Number(r.distance_km ?? 0) > 0 ? Number(r.distance_km).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <FaCheck size={9} /> ໃຊ້ງານ
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500">
                          ປິດ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(r.code);
                        }}
                        className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center"
                        title="ລຶບ"
                      >
                        <FaTrash size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusTableShell>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setEditing(null)}
        >
          <div
            className="glass rounded-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                {rows.some((x) => x.code === editing.code) ? "ແກ້ໄຂເສັ້ນທາງ" : "ເພີ່ມເສັ້ນທາງໃໝ່"}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center"
              >
                <FaTimes size={12} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editing.code ? (
                <Field label="ລະຫັດ" value={editing.code} onChange={() => undefined} disabled />
              ) : (
                <p className="text-[10px] text-slate-400 italic">
                  ລະຫັດຈະຖືກສ້າງອັດຕະໂນມັດ (ເຊັ່ນ RT001, RT002...)
                </p>
              )}
              <Field
                label="ຊື່ເສັ້ນທາງ"
                value={editing.name}
                onChange={(v) => setEditing({ ...editing, name: v })}
                placeholder="ວຽງຈັນ - ປາກເຊ"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="ຕົ້ນທາງ"
                  value={editing.origin}
                  onChange={(v) => setEditing({ ...editing, origin: v })}
                  placeholder="ວຽງຈັນ"
                />
                <Field
                  label="ປາຍທາງ"
                  value={editing.destination}
                  onChange={(v) => setEditing({ ...editing, destination: v })}
                  placeholder="ປາກເຊ"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CoordinateField
                  label="Location ຕົ້ນທາງ"
                  lat={editing.origin_lat}
                  lng={editing.origin_lng}
                  onChange={(lat, lng) => setEditing({ ...editing, origin_lat: lat, origin_lng: lng })}
                />
                <CoordinateField
                  label="Location ປາຍທາງ"
                  lat={editing.destination_lat}
                  lng={editing.destination_lng}
                  onChange={(lat, lng) =>
                    setEditing({ ...editing, destination_lat: lat, destination_lng: lng })
                  }
                />
              </div>
              <div className="rounded-lg border border-slate-200/50 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      ທາງຜ່ານ
                    </p>
                    <p className="text-[10px] text-slate-400">
                      ກຳນົດຈຸດຜ່ານຕາມລຳດັບກ່ອນຮອດປາຍທາງ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        waypoints: [...(editing.waypoints ?? []), { name: "", lat: null, lng: null }],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-teal-700"
                  >
                    <FaPlus size={9} /> ເພີ່ມ
                  </button>
                </div>
                <div className="space-y-2">
                  {(editing.waypoints ?? []).length === 0 ? (
                    <p className="rounded-lg bg-slate-500/5 px-3 py-2 text-[11px] text-slate-400">
                      ບໍ່ມີທາງຜ່ານ
                    </p>
                  ) : (
                    editing.waypoints.map((point, index) => (
                      <div key={index} className="grid gap-2 rounded-lg border border-slate-200/50 bg-white/40 p-2 dark:border-white/10 dark:bg-white/5">
                        <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-[10px] font-bold text-slate-500">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          value={point.name}
                          onChange={(event) => {
                            const next = [...(editing.waypoints ?? [])];
                            next[index] = { ...next[index], name: event.target.value };
                            setEditing({ ...editing, waypoints: next });
                          }}
                          placeholder="ຊື່ບ້ານ / ເມືອງ / ສາຂາທາງຜ່ານ"
                          className="min-w-0 flex-1 glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              waypoints: (editing.waypoints ?? []).filter((_, i) => i !== index),
                            })
                          }
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                          title="ລຶບຈຸດຜ່ານ"
                        >
                          <FaTrash size={10} />
                        </button>
                        </div>
                        <CoordinateField
                          label="Location"
                          lat={point.lat}
                          lng={point.lng}
                          compact
                          onChange={(lat, lng) => {
                            const next = [...(editing.waypoints ?? [])];
                            next[index] = { ...next[index], lat, lng };
                            setEditing({ ...editing, waypoints: next });
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  ຮູບແບບ location: latitude, longitude ເຊັ່ນ 17.9757, 102.6331
                </p>
                <p className="mt-2 text-[10px] text-slate-500">
                  ລຳດັບ: {routePath(editing) || "-"}
                </p>
                {(editing.origin_lat !== null || editing.destination_lat !== null || editing.waypoints.some((p) => p.lat !== null || p.lng !== null)) && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Locations: {[formatLocation(editing.origin_lat, editing.origin_lng), ...editing.waypoints.map((p) => formatLocation(p.lat, p.lng)), formatLocation(editing.destination_lat, editing.destination_lng)].filter(Boolean).join(" → ") || "-"}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <NumberField
                  label="KM"
                  value={editing.distance_km}
                  onChange={(v) => setEditing({ ...editing, distance_km: v })}
                />
                <NumberField
                  label="ລຳດັບ"
                  value={editing.sort_order}
                  onChange={(v) => setEditing({ ...editing, sort_order: v })}
                />
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    ສະຖານະ
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, active: !editing.active })}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-semibold ${
                      editing.active
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                        : "bg-slate-500/10 text-slate-600 ring-1 ring-slate-300/30"
                    }`}
                  >
                    {editing.active ? "ໃຊ້ງານ" : "ປິດ"}
                  </button>
                </div>
              </div>
              {error && <p className="text-[11px] text-rose-500">{error}</p>}
            </div>
            <div className="px-5 py-3 border-t border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
              >
                ຍົກເລີກ
              </button>
              <button
                onClick={() => void save()}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <FaSpinner className="animate-spin" size={11} /> ກຳລັງບັນທຶກ...
                  </>
                ) : (
                  "ບັນທຶກ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function parseCoordinatePart(value: string) {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseLatLng(value: string): [number | null, number | null] {
  const [latText = "", lngText = ""] = value.split(",").map((part) => part.trim());
  return [parseCoordinatePart(latText), parseCoordinatePart(lngText)];
}

function CoordinateField({
  label,
  lat,
  lng,
  onChange,
  compact = false,
}: {
  label: string;
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  compact?: boolean;
}) {
  const value = lat === null && lng === null ? "" : `${lat ?? ""},${lng ?? ""}`;

  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const [nextLat, nextLng] = parseLatLng(e.target.value);
          onChange(nextLat, nextLng);
        }}
        placeholder="17.9757,102.6331"
        className={`w-full glass-input rounded-lg px-3 text-xs text-slate-700 dark:text-slate-200 ${
          compact ? "py-1.5" : "py-2"
        }`}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
      />
    </div>
  );
}

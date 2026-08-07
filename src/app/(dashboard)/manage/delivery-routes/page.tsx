"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaCheck,
  FaCopy,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaPen,
  FaPlus,
  FaRoute,
  FaSearch,
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
import {
  DESTINATION_INDEX,
  ORIGIN_INDEX,
  RouteMapPicker,
} from "@/components/route-map-picker";
import {
  formatLatLng,
  hasCoords,
  matchSuggestions,
  moveStop,
  normalizeSuggestion,
  parseLatLngPair,
  routeDistanceKm,
  routePathLabel,
  routeStops,
  validateRoute,
  type RouteStop,
  type StopSuggestion,
} from "@/lib/route-geometry";

interface RouteRow {
  code: string;
  name: string;
  origin: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  waypoints: RouteStop[];
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

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStop(value: unknown): RouteStop {
  if (value && typeof value === "object") {
    const item = value as { name?: unknown; lat?: unknown; lng?: unknown };
    return {
      name: String(item.name ?? "").trim(),
      lat: num(item.lat),
      lng: num(item.lng),
    };
  }
  return { name: String(value ?? "").trim(), lat: null, lng: null };
}

function normalizeRoute(row: RouteRow): RouteRow {
  return {
    ...row,
    origin: String(row.origin ?? ""),
    destination: String(row.destination ?? ""),
    origin_lat: num(row.origin_lat),
    origin_lng: num(row.origin_lng),
    destination_lat: num(row.destination_lat),
    destination_lng: num(row.destination_lng),
    distance_km: num(row.distance_km) ?? 0,
    sort_order: num(row.sort_order) ?? 0,
    waypoints: (row.waypoints ?? []).map(normalizeStop),
  };
}

/** How many of a route's stops are pinned on the map, out of how many. */
function pinnedCount(row: RouteRow) {
  const stops = routeStops(row);
  return { pinned: stops.filter(hasCoords).length, total: stops.length };
}

export default function DeliveryRoutesPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");
  const [editing, setEditing] = useState<RouteRow | null>(null);
  // Branches that actually have transport vehicles stationed at them — the
  // stops a route realistically starts, passes or ends at.
  const [suggestions, setSuggestions] = useState<StopSuggestion[]>([]);

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const raw = (await Actions.listRouteStopSuggestions()) as Parameters<
          typeof normalizeSuggestion
        >[0][];
        setSuggestions((raw ?? []).map(normalizeSuggestion));
      } catch (e) {
        // Suggestions are a convenience — the page still works by hand.
        console.error(e);
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = (await Actions.listDeliveryRoutes(false)) as RouteRow[];
      setRows((data ?? []).map(normalizeRoute));
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (statusFilter === "on" && !row.active) return false;
        if (statusFilter === "off" && row.active) return false;
        if (!query) return true;
        const haystack = [
          row.code,
          row.name,
          row.origin,
          row.destination,
          ...row.waypoints.map((stop) => stop.name),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort(
        (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)
      );
  }, [rows, search, statusFilter]);

  const activeCount = rows.filter((row) => row.active).length;

  const remove = async (row: RouteRow) => {
    const ok = await confirm({
      title: "ລຶບເສັ້ນທາງ",
      message: `ລຶບ "${row.name || row.code}" (${row.code}) ບໍ? ການລຶບກູ້ຄືນບໍ່ໄດ້.`,
      tone: "danger",
      confirmLabel: "ລຶບ",
    });
    if (!ok) return;
    try {
      await Actions.deleteDeliveryRoute(row.code);
      await load();
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : "ລຶບບໍ່ສຳເລັດ");
    }
  };

  // Flip active straight from the list — the common edit by far, and it used to
  // cost opening the dialog, toggling, saving.
  const toggleActive = async (row: RouteRow) => {
    const next = { ...row, active: !row.active };
    setRows((current) =>
      current.map((item) => (item.code === row.code ? next : item))
    );
    try {
      await Actions.upsertDeliveryRoute(next);
    } catch (e) {
      console.error(e);
      setRows((current) =>
        current.map((item) => (item.code === row.code ? row : item))
      );
      setLoadError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    }
  };

  const duplicate = (row: RouteRow) => {
    // New code, same shape — building "ວຽງຈັນ → X" variants one field at a time
    // was the slowest job on this page.
    setEditing({ ...row, code: "", name: `${row.name} (ສຳເນົາ)` });
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ເສັ້ນທາງການຂົນສົ່ງ"
        subtitle="ຕົ້ນທາງ, ທາງຜ່ານ, ປາຍທາງ ແລະ ໄລຍະທາງ — ປັກໝຸດໃນແຜນທີ່ໄດ້ໂດຍກົງ"
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FaSearch
            size={11}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ຄົ້ນຫາ ລະຫັດ, ຊື່ເສັ້ນທາງ, ຕົ້ນທາງ/ປາຍທາງ ຫຼື ທາງຜ່ານ"
            className="glass-input w-full rounded-lg py-2 pl-8 pr-3 text-xs text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-500/5 p-1">
          {(
            [
              ["all", `ທັງໝົດ ${rows.length}`],
              ["on", `ໃຊ້ງານ ${activeCount}`],
              ["off", `ປິດ ${rows.length - activeCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                statusFilter === key
                  ? "bg-teal-600 text-white"
                  : "text-slate-500 hover:bg-white/60 dark:hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600">
          {loadError}
        </div>
      )}

      <StatusTableShell count={visible.length}>
        {loading ? (
          <div className="flex items-center justify-center py-14 text-sm text-slate-400">
            <FaSpinner className="mr-2 animate-spin" /> ກຳລັງໂຫຼດ...
          </div>
        ) : visible.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">
            {rows.length === 0
              ? 'ຍັງບໍ່ມີເສັ້ນທາງ — ກົດ "ເພີ່ມເສັ້ນທາງ" ເພື່ອເລີ່ມ'
              : "ບໍ່ພົບເສັ້ນທາງຕາມເງື່ອນໄຂ"}
          </div>
        ) : (
          <>
            {/* Desktop: table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200/30 bg-white/30 dark:border-white/5 dark:bg-white/5">
                    <Th>ລະຫັດ</Th>
                    <Th>ຊື່ / ເສັ້ນທາງ</Th>
                    <Th className="text-center">ແຜນທີ່</Th>
                    <Th className="text-right">ໄລຍະ (km)</Th>
                    <Th className="text-center">ລຳດັບສະແດງ</Th>
                    <Th className="text-center">ສະຖານະ</Th>
                    <Th className="text-right">ຈັດການ</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const pins = pinnedCount(row);
                    return (
                      <tr
                        key={row.code}
                        className="border-b border-slate-200/20 hover:bg-white/30 dark:border-white/5 dark:hover:bg-white/5"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-200">
                          {row.code}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                            {row.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {routePathLabel(routeStops(row)) || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <PinBadge pinned={pins.pinned} total={pins.total} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {row.distance_km > 0
                            ? row.distance_km.toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-slate-400">
                          {row.sort_order}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ActiveToggle
                            active={row.active}
                            onClick={() => void toggleActive(row)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconButton
                              title="ແກ້ໄຂ"
                              onClick={() => setEditing(normalizeRoute(row))}
                            >
                              <FaPen size={11} />
                            </IconButton>
                            <IconButton
                              title="ສຳເນົາ"
                              onClick={() => duplicate(row)}
                            >
                              <FaCopy size={11} />
                            </IconButton>
                            <IconButton
                              title="ລຶບ"
                              danger
                              onClick={() => void remove(row)}
                            >
                              <FaTrash size={11} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards — the 7-column table used to scroll sideways. */}
            <div className="divide-y divide-slate-200/20 dark:divide-white/5 md:hidden">
              {visible.map((row) => {
                const pins = pinnedCount(row);
                return (
                  <div key={row.code} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] font-bold text-slate-400">
                          {row.code}
                        </div>
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {row.name}
                        </div>
                      </div>
                      <ActiveToggle
                        active={row.active}
                        onClick={() => void toggleActive(row)}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {routePathLabel(routeStops(row)) || "—"}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <PinBadge pinned={pins.pinned} total={pins.total} />
                      <span className="tabular-nums">
                        {row.distance_km > 0
                          ? `${row.distance_km.toLocaleString()} km`
                          : "— km"}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <IconButton
                          title="ແກ້ໄຂ"
                          onClick={() => setEditing(normalizeRoute(row))}
                        >
                          <FaPen size={11} />
                        </IconButton>
                        <IconButton title="ສຳເນົາ" onClick={() => duplicate(row)}>
                          <FaCopy size={11} />
                        </IconButton>
                        <IconButton
                          title="ລຶບ"
                          danger
                          onClick={() => void remove(row)}
                        >
                          <FaTrash size={11} />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </StatusTableShell>

      {editing && (
        <RouteEditor
          initial={editing}
          isNew={!editing.code}
          suggestions={suggestions}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 ${className}`}
    >
      {children}
    </th>
  );
}

function IconButton({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 ${
        danger
          ? "hover:bg-rose-500/10 hover:text-rose-500"
          : "hover:bg-teal-500/10 hover:text-teal-600"
      }`}
    >
      {children}
    </button>
  );
}

function ActiveToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? "ກົດເພື່ອປິດ" : "ກົດເພື່ອເປີດໃຊ້"}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
        active
          ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
          : "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20"
      }`}
    >
      {active ? <FaCheck size={9} /> : null} {active ? "ໃຊ້ງານ" : "ປິດ"}
    </button>
  );
}

function PinBadge({ pinned, total }: { pinned: number; total: number }) {
  const complete = pinned === total && total > 0;
  return (
    <span
      title="ຈຸດທີ່ປັກໝຸດແລ້ວ / ຈຸດທັງໝົດ"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        complete
          ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
          : pinned === 0
          ? "bg-slate-500/10 text-slate-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      }`}
    >
      <FaMapMarkerAlt size={9} /> {pinned}/{total}
    </span>
  );
}

// ─── Editor ────────────────────────────────────────────────────────────────

function RouteEditor({
  initial,
  isNew,
  suggestions,
  onClose,
  onSaved,
}: {
  initial: RouteRow;
  isNew: boolean;
  suggestions: StopSuggestion[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<RouteRow>(initial);
  const [activeIndex, setActiveIndex] = useState<number>(ORIGIN_INDEX);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial]
  );
  const stops = useMemo(() => routeStops(draft), [draft]);
  const problems = useMemo(() => validateRoute(draft), [draft]);
  const suggestedKm = useMemo(() => routeDistanceKm(stops), [stops]);

  const patch = (partial: Partial<RouteRow>) =>
    setDraft((current) => ({ ...current, ...partial }));

  // One handler for every pin, wherever it sits on the route.
  const setPoint = (index: number, lat: number | null, lng: number | null) => {
    if (index === ORIGIN_INDEX) return patch({ origin_lat: lat, origin_lng: lng });
    if (index === DESTINATION_INDEX)
      return patch({ destination_lat: lat, destination_lng: lng });
    setDraft((current) => {
      const waypoints = [...current.waypoints];
      if (!waypoints[index]) return current;
      waypoints[index] = { ...waypoints[index], lat, lng };
      return { ...current, waypoints };
    });
  };

  // Picking a branch fills the name AND drops the pin in one action — the
  // point of the suggestions.
  const applySuggestion = (index: number, pick: StopSuggestion) => {
    if (index === ORIGIN_INDEX)
      return patch({
        origin: pick.name,
        origin_lat: pick.lat,
        origin_lng: pick.lng,
      });
    if (index === DESTINATION_INDEX)
      return patch({
        destination: pick.name,
        destination_lat: pick.lat,
        destination_lng: pick.lng,
      });
    setDraft((current) => {
      const waypoints = [...current.waypoints];
      if (!waypoints[index]) return current;
      waypoints[index] = { name: pick.name, lat: pick.lat, lng: pick.lng };
      return { ...current, waypoints };
    });
  };

  const close = async () => {
    if (submitting) return;
    if (dirty) {
      const ok = await confirm({
        title: "ປິດໂດຍບໍ່ບັນທຶກ?",
        message: "ການແກ້ໄຂທີ່ຍັງບໍ່ໄດ້ບັນທຶກຈະຫາຍໄປ.",
        tone: "warning",
        confirmLabel: "ປິດເລີຍ",
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = async () => {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Actions.upsertDeliveryRoute(draft);
      await onSaved();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      onClick={() => void close()}
    >
      <div
        className="glass flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header — the old dialog let the buttons scroll off-screen
            once a route had a few waypoints, making it unsaveable. */}
        <div className="flex items-center justify-between border-b border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              {isNew ? "ເພີ່ມເສັ້ນທາງໃໝ່" : "ແກ້ໄຂເສັ້ນທາງ"}
            </h3>
            <p className="text-[10px] text-slate-400">
              {isNew
                ? "ລະຫັດຈະຖືກສ້າງອັດຕະໂນມັດ (RT001, RT002...)"
                : `ລະຫັດ ${draft.code}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void close()}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
            aria-label="ປິດ"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Left: the form. */}
          <div className="space-y-4 overflow-y-auto p-5">
            <Field
              label="ຊື່ເສັ້ນທາງ"
              value={draft.name}
              onChange={(v) => patch({ name: v })}
              placeholder="ວຽງຈັນ - ປາກເຊ"
            />

            <StopCard
              tone="teal"
              badge="A"
              title="ຕົ້ນທາງ"
              name={draft.origin}
              onName={(v) => patch({ origin: v })}
              lat={draft.origin_lat}
              lng={draft.origin_lng}
              onCoords={(lat, lng) => setPoint(ORIGIN_INDEX, lat, lng)}
              suggestions={suggestions}
              onSuggestionPick={(pick) => applySuggestion(ORIGIN_INDEX, pick)}
              active={activeIndex === ORIGIN_INDEX}
              onActivate={() => setActiveIndex(ORIGIN_INDEX)}
              placeholder="ວຽງຈັນ"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    ທາງຜ່ານ ({draft.waypoints.length})
                  </p>
                  <p className="text-[10px] text-slate-400">
                    ຕາມລຳດັບການແລ່ນ — ໃຊ້ລູກສອນຂຶ້ນ/ລົງເພື່ອຈັດລຳດັບ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    patch({
                      waypoints: [
                        ...draft.waypoints,
                        { name: "", lat: null, lng: null },
                      ],
                    });
                    setActiveIndex(draft.waypoints.length);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-teal-700"
                >
                  <FaPlus size={9} /> ເພີ່ມຈຸດຜ່ານ
                </button>
              </div>

              {draft.waypoints.length === 0 ? (
                <p className="rounded-lg bg-slate-500/5 px-3 py-2 text-[11px] text-slate-400">
                  ບໍ່ມີທາງຜ່ານ — ແລ່ນຈາກຕົ້ນທາງຫາປາຍທາງໂດຍກົງ
                </p>
              ) : (
                draft.waypoints.map((stop, index) => (
                  <StopCard
                    key={index}
                    tone="amber"
                    badge={`${index + 1}`}
                    title={`ທາງຜ່ານຈຸດທີ ${index + 1}`}
                    name={stop.name}
                    onName={(v) => {
                      const waypoints = [...draft.waypoints];
                      waypoints[index] = { ...waypoints[index], name: v };
                      patch({ waypoints });
                    }}
                    lat={stop.lat}
                    lng={stop.lng}
                    onCoords={(lat, lng) => setPoint(index, lat, lng)}
                    suggestions={suggestions}
                    onSuggestionPick={(pick) => applySuggestion(index, pick)}
                    active={activeIndex === index}
                    onActivate={() => setActiveIndex(index)}
                    placeholder="ຊື່ບ້ານ / ເມືອງ / ສາຂາທາງຜ່ານ"
                    onMoveUp={
                      index > 0
                        ? () => {
                            patch({
                              waypoints: moveStop(
                                draft.waypoints,
                                index,
                                index - 1
                              ),
                            });
                            setActiveIndex(index - 1);
                          }
                        : undefined
                    }
                    onMoveDown={
                      index < draft.waypoints.length - 1
                        ? () => {
                            patch({
                              waypoints: moveStop(
                                draft.waypoints,
                                index,
                                index + 1
                              ),
                            });
                            setActiveIndex(index + 1);
                          }
                        : undefined
                    }
                    onRemove={() => {
                      patch({
                        waypoints: draft.waypoints.filter(
                          (_, i) => i !== index
                        ),
                      });
                      setActiveIndex(ORIGIN_INDEX);
                    }}
                  />
                ))
              )}
            </div>

            <StopCard
              tone="rose"
              badge="B"
              title="ປາຍທາງ"
              name={draft.destination}
              onName={(v) => patch({ destination: v })}
              lat={draft.destination_lat}
              lng={draft.destination_lng}
              onCoords={(lat, lng) => setPoint(DESTINATION_INDEX, lat, lng)}
              suggestions={suggestions}
              onSuggestionPick={(pick) =>
                applySuggestion(DESTINATION_INDEX, pick)
              }
              active={activeIndex === DESTINATION_INDEX}
              onActivate={() => setActiveIndex(DESTINATION_INDEX)}
              placeholder="ປາກເຊ"
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel>ໄລຍະທາງ (km)</FieldLabel>
                <input
                  type="number"
                  min={0}
                  value={draft.distance_km || ""}
                  onChange={(e) =>
                    patch({ distance_km: Number(e.target.value) || 0 })
                  }
                  placeholder="0"
                  className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <FieldLabel>ລຳດັບສະແດງ</FieldLabel>
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    patch({ sort_order: Number(e.target.value) || 0 })
                  }
                  className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <FieldLabel>ສະຖານະ</FieldLabel>
                <button
                  type="button"
                  onClick={() => patch({ active: !draft.active })}
                  className={`w-full rounded-lg px-3 py-2 text-xs font-semibold ${
                    draft.active
                      ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400"
                      : "bg-slate-500/10 text-slate-600 ring-1 ring-slate-300/30"
                  }`}
                >
                  {draft.active ? "ໃຊ້ງານ" : "ປິດ"}
                </button>
              </div>
            </div>

            {suggestedKm !== null && (
              <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] text-sky-700 dark:text-sky-300">
                <span>
                  ໄລຍະເສັ້ນຊື່ຈາກໝຸດໃນແຜນທີ່ ≈{" "}
                  <strong className="tabular-nums">{suggestedKm}</strong> km
                  (ບໍ່ແມ່ນໄລຍະທາງຈິງ)
                </span>
                {draft.distance_km !== suggestedKm && (
                  <button
                    type="button"
                    onClick={() => patch({ distance_km: suggestedKm })}
                    className="ml-auto shrink-0 rounded-md bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700"
                  >
                    ໃຊ້ຄ່ານີ້
                  </button>
                )}
              </div>
            )}

            {showProblems && problems.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                {problems.map((problem) => (
                  <li key={problem} className="flex items-start gap-1.5">
                    <FaExclamationTriangle size={10} className="mt-0.5 shrink-0" />
                    {problem}
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-[11px] text-rose-500">{error}</p>}
          </div>

          {/* Right: the map. */}
          <div className="flex flex-col gap-2 border-t border-slate-200/30 bg-white/20 p-5 dark:border-white/5 dark:bg-white/5 lg:border-l lg:border-t-0">
            <p className="text-[11px] text-slate-500">
              ກົດແຜນທີ່ເພື່ອປັກໝຸດ:{" "}
              <strong className="text-teal-600 dark:text-teal-400">
                {activeIndex === ORIGIN_INDEX
                  ? "ຕົ້ນທາງ"
                  : activeIndex === DESTINATION_INDEX
                  ? "ປາຍທາງ"
                  : `ທາງຜ່ານຈຸດທີ ${activeIndex + 1}`}
              </strong>{" "}
              · ລາກໝຸດເພື່ອປັບຕຳແໜ່ງ
            </p>
            <RouteMapPicker
              stops={stops}
              activeIndex={activeIndex}
              onPick={(index, lat, lng) => setPoint(index, lat, lng)}
              className="h-[300px] lg:h-[460px]"
            />
            <p className="text-[11px] text-slate-500">
              ລຳດັບ: {routePathLabel(stops) || "—"}
            </p>
          </div>
        </div>

        {/* Sticky footer. */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200/30 bg-white/30 px-5 py-3 dark:border-white/5 dark:bg-white/5">
          {problems.length > 0 && (
            <span className="mr-auto text-[11px] text-amber-600">
              ມີ {problems.length} ຈຸດຕ້ອງກວດ
            </span>
          )}
          <button
            type="button"
            onClick={() => void close()}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/5"
          >
            ຍົກເລີກ
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
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
  );
}

const STOP_TONES = {
  teal: "border-teal-500/40 bg-teal-500/5",
  amber: "border-amber-500/40 bg-amber-500/5",
  rose: "border-rose-500/40 bg-rose-500/5",
} as const;

const BADGE_TONES = {
  teal: "bg-teal-600",
  amber: "bg-amber-500",
  rose: "bg-rose-600",
} as const;

function StopCard({
  tone,
  badge,
  title,
  name,
  onName,
  lat,
  lng,
  onCoords,
  active,
  onActivate,
  placeholder,
  suggestions,
  onSuggestionPick,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  tone: keyof typeof STOP_TONES;
  badge: string;
  title: string;
  name: string;
  onName: (v: string) => void;
  lat: number | null;
  lng: number | null;
  onCoords: (lat: number | null, lng: number | null) => void;
  active: boolean;
  onActivate: () => void;
  placeholder?: string;
  suggestions: StopSuggestion[];
  onSuggestionPick: (pick: StopSuggestion) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      onClick={onActivate}
      className={`cursor-pointer rounded-lg border p-3 transition ${
        STOP_TONES[tone]
      } ${active ? "ring-2 ring-teal-500/50" : "hover:border-teal-500/60"}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${BADGE_TONES[tone]}`}
        >
          {badge}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        {hasCoords({ lat, lng }) ? (
          <FaMapMarkerAlt size={10} className="text-teal-500" title="ປັກໝຸດແລ້ວ" />
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {onMoveUp && (
            <IconButton title="ຍ້າຍຂຶ້ນ" onClick={onMoveUp}>
              <FaArrowUp size={10} />
            </IconButton>
          )}
          {onMoveDown && (
            <IconButton title="ຍ້າຍລົງ" onClick={onMoveDown}>
              <FaArrowDown size={10} />
            </IconButton>
          )}
          {onRemove && (
            <IconButton title="ລຶບຈຸດຜ່ານ" danger onClick={onRemove}>
              <FaTrash size={10} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <StopNameInput
          value={name}
          onChange={onName}
          onFocus={onActivate}
          placeholder={placeholder}
          suggestions={suggestions}
          onPick={onSuggestionPick}
        />
        <CoordinateInput lat={lat} lng={lng} onChange={onCoords} onFocus={onActivate} />
      </div>
    </div>
  );
}

/**
 * Stop name with branch suggestions.
 *
 * The list is the branches that have transport vehicles stationed at them, so
 * the stops a route actually runs between are one click away — and picking one
 * pins its coordinates too, instead of leaving the admin to look them up.
 */
function StopNameInput({
  value,
  onChange,
  onFocus,
  placeholder,
  suggestions,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  suggestions: StopSuggestion[];
  onPick: (pick: StopSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(
    () => matchSuggestions(suggestions, value),
    [suggestions, value]
  );
  // Nothing to offer (no branch has vehicles, or nothing matches) — behave
  // exactly like a plain text field.
  const showList = open && matches.length > 0;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          onFocus?.();
          setOpen(true);
        }}
        // Delay so a click on an option lands before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="glass-input w-full min-w-0 rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
      />
      {showList && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200/60 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
          <li className="px-3 pt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            ສາຂາທີ່ມີລົດຂົນສົ່ງ
          </li>
          {matches.map((item) => {
            const pinned = hasCoords(item);
            return (
              <li key={item.code}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(item);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-teal-500/10 dark:text-slate-200"
                >
                  <FaMapMarkerAlt
                    size={10}
                    className={pinned ? "text-teal-500" : "text-slate-300"}
                    title={pinned ? "ມີພິກັດ" : "ຍັງບໍ່ໄດ້ຕັ້ງພິກັດສາຂາ"}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {item.carCount} ຄັນ
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Coordinate entry that can actually be typed in.
 *
 * The field keeps its own raw text, so half-finished input ("-", "17.") stays
 * on screen instead of being wiped by a re-render — the old editor rebuilt the
 * string from parsed numbers on every keystroke. Pasting a Google Maps link or
 * a "lat, lng" pair works too; the value is committed upward only once it
 * parses.
 */
function CoordinateInput({
  lat,
  lng,
  onChange,
  onFocus,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  onFocus?: () => void;
}) {
  const [text, setText] = useState(() => formatLatLng(lat, lng));

  // Re-sync when the point moves from outside (map click / marker drag), but
  // never while the text still represents the same coordinates.
  useEffect(() => {
    const parsed = parseLatLngPair(text);
    if (parsed && parsed.lat === lat && parsed.lng === lng) return;
    if (!parsed && lat === null && lng === null) return;
    setText(formatLatLng(lat, lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onFocus={onFocus}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (!next.trim()) return onChange(null, null);
          const parsed = parseLatLngPair(next);
          if (parsed) onChange(parsed.lat, parsed.lng);
        }}
        placeholder="17.9757, 102.6331 ຫຼື ວາງລິ້ງ Google Maps"
        className="glass-input w-full rounded-lg px-3 py-2 pr-7 text-xs text-slate-700 dark:text-slate-200"
      />
      {text && (
        <button
          type="button"
          title="ລ້າງພິກັດ"
          onClick={() => {
            setText("");
            onChange(null, null);
          }}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-rose-500"
        >
          <FaTimes size={10} />
        </button>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
      />
    </div>
  );
}

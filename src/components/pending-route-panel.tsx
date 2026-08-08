"use client";

import { useEffect, useMemo, useState } from "react";
import { FaMapMarkedAlt, FaRoute, FaTimes, FaExclamationTriangle } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { BillVolumeTag, useBillVolumes } from "@/components/bill-volume";
import { describePlan, planTrucks, type PlanVehicle } from "@/lib/truck-plan";
import type {
  FleetVehicle,
  PendingRouteBill,
  PendingRouteSuggestions,
} from "@/actions/route-assign";

/**
 * ແຖບ "ສາຍທີ່ແນະນຳ" ຢູ່ໜ້າບິນຄ້າງ.
 *
 * ຕອບສອງຄຳຖາມທີ່ຄົນຈັດຖ້ຽວຖາມທຸກມື້: *ບິນພວກນີ້ຄວນເຂົ້າສາຍໃດ* ແລະ
 * *ມັນຢູ່ໃສໃນແຜນທີ່*. ເມື່ອກ່ອນຕ້ອງເປີດບິນເທື່ອລະໃບຈຶ່ງເຫັນຈຸດ.
 *
 * ວາງເປັນ component ແຍກ ເພາະໜ້າ pending ຍາວ 3,800 ແຖວແລ້ວ.
 */
export function PendingRoutePanel({ billNos }: { billNos: string[] }) {
  const [data, setData] = useState<PendingRouteSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("");
  const [showMap, setShowMap] = useState(false);

  // ພື້ນທີ່ບັນທຸກ — ໃຊ້ hook ດຽວກັບຕາຕະລາງບິນ ຈຶ່ງບໍ່ດຶງຊ້ຳ ແລະ ຕົວເລກຕົງກັນ
  const volumes = useBillVolumes(billNos);
  const [fleet, setFleet] = useState<PlanVehicle[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = (await Actions.listFleetCapacity()) as FleetVehicle[];
        setFleet(rows ?? []);
      } catch {
        // ບໍ່ມີຂໍ້ມູນລົດ = ບໍ່ສະແດງແຜນລົດ ແຕ່ແຖບສາຍຍັງໃຊ້ໄດ້
      }
    })();
  }, []);

  // ຄີຍ໌ຈາກລາຍການບິນ — ໂຫຼດຄືນເມື່ອໜ້າຈໍກອງໃໝ່ ບໍ່ແມ່ນທຸກ render
  const key = billNos.join(",");
  useEffect(() => {
    const codes = key ? key.split(",") : [];
    if (codes.length === 0) {
      setData({ routes: [], unassigned: 0, bills: [] });
      return;
    }
    void (async () => {
      try {
        setData(
          (await Actions.getPendingRouteSuggestions(
            codes
          )) as PendingRouteSuggestions
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "ໂຫຼດຄຳແນະນຳບໍ່ໄດ້");
      }
    })();
  }, [key]);

  const shown = useMemo(() => {
    const bills = data?.bills ?? [];
    if (!active) return bills;
    if (active === "?") return bills.filter((b) => !b.route_code);
    return bills.filter((b) => b.route_code === active);
  }, [data, active]);

  const conflicts = useMemo(
    () => (data?.bills ?? []).filter((b) => b.district_conflict).length,
    [data]
  );

  /** m³ ລວມຕໍ່ສາຍ + ຈຳນວນບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດ. */
  const m3By = useMemo(() => {
    const out = new Map<string, { m3: number; unknown: number }>();
    for (const b of data?.bills ?? []) {
      const k = b.route_code || "?";
      const cur = out.get(k) ?? { m3: 0, unknown: 0 };
      const v = volumes[b.bill_no];
      if (!v || v.m3 <= 0) cur.unknown++;
      else cur.m3 += v.m3;
      out.set(k, cur);
    }
    return out;
  }, [data, volumes]);

  const totalM3 = useMemo(
    () => [...m3By.values()].reduce((s, v) => s + v.m3, 0),
    [m3By]
  );

  if (error || !data) return null;
  if (data.bills.length === 0) return null;

  const withPoint = data.bills.filter((b) => b.lat).length;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FaRoute className="text-teal-600" size={13} />
        <h2 className="text-xs font-bold text-slate-700 dark:text-slate-200">
          ສາຍທີ່ແນະນຳ
        </h2>
        <span className="text-[10px] text-slate-400">
          {data.bills.length} ບິນລໍຈັດ · ຮູ້ຈຸດສົ່ງ {withPoint} · ລວມ{" "}
          <strong className="tabular-nums text-slate-600 dark:text-slate-300">
            {totalM3.toFixed(2)} m³
          </strong>
        </span>
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-teal-700"
        >
          <FaMapMarkedAlt size={10} /> ເບິ່ງແຜນທີ່
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          label="ທັງໝົດ"
          count={data.bills.length}
          m3={totalM3}
          on={!active}
          onClick={() => setActive("")}
        />
        {data.routes.map((r) => (
          <Chip
            key={r.code}
            label={`${r.code} · ${r.name}`}
            count={r.count}
            m3={m3By.get(r.code)?.m3 ?? 0}
            unknown={m3By.get(r.code)?.unknown ?? 0}
            on={active === r.code}
            onClick={() => setActive(active === r.code ? "" : r.code)}
          />
        ))}
        {data.unassigned > 0 && (
          <Chip
            label="ບໍ່ຮູ້ສາຍ"
            count={data.unassigned}
            m3={m3By.get("?")?.m3 ?? 0}
            unknown={m3By.get("?")?.unknown ?? 0}
            on={active === "?"}
            tone="amber"
            onClick={() => setActive(active === "?" ? "" : "?")}
          />
        )}
      </div>

      {fleet.length > 0 && totalM3 > 0 && (
        <TruckPlanRows
          rows={[
            ...(data.routes
              .filter((r) => (m3By.get(r.code)?.m3 ?? 0) > 0)
              .map((r) => ({
                label: `${r.code} · ${r.name}`,
                m3: m3By.get(r.code)?.m3 ?? 0,
                unknown: m3By.get(r.code)?.unknown ?? 0,
              }))),
          ]}
          fleet={fleet}
        />
      )}

      {conflicts > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-300">
          <FaExclamationTriangle size={10} className="mt-0.5 shrink-0" />
          <span>
            {conflicts} ບິນ ຈຸດສົ່ງຈິງບໍ່ຕົງກັບເມືອງໃນທະບຽນລູກຄ້າ — ແນະນຳຕາມ
            <strong> ຈຸດສົ່ງຈິງ</strong> ເພາະເປັນບ່ອນທີ່ລົດເຄີຍໄປຮອດແທ້
          </span>
        </p>
      )}

      {active && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200/60 dark:border-white/10">
          <table className="w-full text-[11px]">
            <tbody>
              {shown.map((b) => (
                <tr
                  key={b.bill_no}
                  className="border-b border-slate-100 last:border-0 dark:border-white/5"
                >
                  <td className="px-3 py-1.5 font-mono text-slate-500">
                    {b.bill_no}
                  </td>
                  <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">
                    {b.cust_name || b.cust_code}
                  </td>
                  <td className="px-2 py-1.5">
                    <BillVolumeTag v={volumes[b.bill_no]} />
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-slate-400">
                    {b.muang}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[10px]">
                    {b.lat ? (
                      <a
                        href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-600 hover:underline"
                      >
                        ເບິ່ງຈຸດ
                      </a>
                    ) : (
                      <span className="text-slate-300">ບໍ່ມີຈຸດ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showMap && (
        <MapModal
          bills={shown}
          title={active ? `ສາຍ ${active}` : "ບິນລໍຈັດທັງໝົດ"}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}

/**
 * ແຜນລົດຕໍ່ສາຍ — ຕ້ອງໃຊ້ກີ່ຄັນ ແລະ ຄັນລະເທົ່າໃດ.
 *
 * ບັນຈຸ **ເຕັມຄັນທຳອິດກ່ອນ** ຈຶ່ງເປີດຄັນຕໍ່ໄປ (ເບິ່ງ `planTrucks`).
 */
function TruckPlanRows({
  rows,
  fleet,
}: {
  rows: { label: string; m3: number; unknown: number }[];
  fleet: PlanVehicle[];
}) {
  return (
    <div className="space-y-1.5 rounded-lg bg-slate-500/5 p-3">
      <p className="text-[10px] font-bold text-slate-500">
        ລົດທີ່ຕ້ອງໃຊ້ (ບັນຈຸເຕັມຄັນທຳອິດກ່ອນ)
      </p>
      {rows.map((r) => {
        const plan = planTrucks(r.m3, fleet);
        return (
          <div
            key={r.label}
            className="flex flex-wrap items-baseline gap-x-2 text-[10px]"
          >
            <span className="min-w-0 max-w-[200px] truncate font-semibold text-slate-600 dark:text-slate-300">
              {r.label}
            </span>
            <span className="tabular-nums text-slate-400">
              {r.m3.toFixed(2)} m³
              {r.unknown > 0 ? ` (+${r.unknown} ບິນຍັງບໍ່ຮູ້ຂະໜາດ)` : ""}
            </span>
            <span className="text-teal-700 dark:text-teal-300">
              → {describePlan(plan)}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[9px] text-slate-400">
        ບັນຈຸເປົ້າໝາຍ 90% ຂອງຄວາມຈຸ — ບັນຈຸເຕັມ 100% ເປັນໄປບໍ່ໄດ້ຈິງ
        ເພາະສິນຄ້າວາງຊ້ອນກັນບໍ່ລົງຕົວ
      </p>
    </div>
  );
}

function Chip({
  label,
  count,
  m3 = 0,
  unknown = 0,
  on,
  tone = "teal",
  onClick,
}: {
  label: string;
  count: number;
  /** m³ ລວມຂອງບິນທີ່ຮູ້ຂະໜາດ. */
  m3?: number;
  /** ຈຳນວນບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດ — ບອກໄວ້ບໍ່ໃຫ້ເຂົ້າໃຈວ່າ m³ ນີ້ຄົບແລ້ວ. */
  unknown?: number;
  on: boolean;
  tone?: "teal" | "amber";
  onClick: () => void;
}) {
  const base =
    tone === "amber"
      ? "border-amber-400 text-amber-700 dark:text-amber-300"
      : "border-teal-500 text-teal-700 dark:text-teal-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
        on
          ? tone === "amber"
            ? "border-amber-500 bg-amber-500/15"
            : "border-teal-600 bg-teal-500/15"
          : `${base} border-opacity-40 hover:bg-slate-500/5`
      }`}
    >
      <span className="max-w-[190px] truncate">{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
      {m3 > 0 && (
        <span
          className="tabular-nums rounded bg-slate-900/5 px-1 text-[9px] dark:bg-white/10"
          title={
            unknown > 0
              ? `${unknown} ບິນຍັງບໍ່ຮູ້ຂະໜາດ — m³ ນີ້ຍັງບໍ່ຄົບ`
              : "ພື້ນທີ່ບັນທຸກລວມ"
          }
        >
          {m3.toFixed(2)} m³{unknown > 0 ? "+" : ""}
        </span>
      )}
    </button>
  );
}

/**
 * ແຜນທີ່ລວມທຸກຈຸດຂອງສາຍທີ່ເລືອກ.
 *
 * ໃຊ້ Leaflet ຜ່ານ CDN ຄືກັບໜ້າອື່ນຂອງລະບົບ — ໂຫຼດເມື່ອເປີດເທົ່ານັ້ນ
 * ຈຶ່ງບໍ່ຖ່ວງໜ້າ pending ທີ່ໜັກຢູ່ແລ້ວ.
 */
function MapModal({
  bills,
  title,
  onClose,
}: {
  bills: PendingRouteBill[];
  title: string;
  onClose: () => void;
}) {
  const pts = bills.filter((b) => b.lat && b.lng);

  useEffect(() => {
    let map: unknown = null;
    let cancelled = false;
    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || !L) return;
      const el = document.getElementById("pending-route-map");
      if (!el) return;
      // @ts-expect-error — Leaflet ມາຈາກ CDN ບໍ່ມີ type
      map = L.map(el).setView([17.98, 102.63], 12);
      // @ts-expect-error — CDN
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const group: unknown[] = [];
      for (const b of pts) {
        // @ts-expect-error — CDN
        const m = L.circleMarker([Number(b.lat), Number(b.lng)], {
          radius: 6,
          color: "#0f766e",
          fillColor: "#14b8a6",
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindPopup(
            `<b>${escapeHtml(b.cust_name || b.cust_code)}</b><br>${escapeHtml(b.bill_no)}<br>${escapeHtml(b.route_name || "")}`
          )
          .addTo(map);
        group.push(m);
      }
      if (group.length > 0) {
        // @ts-expect-error — CDN
        map.fitBounds(L.featureGroup(group).getBounds().pad(0.15));
      }
    })();
    return () => {
      cancelled = true;
      // @ts-expect-error — CDN
      if (map) map.remove();
    };
  }, [pts]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <FaMapMarkedAlt className="text-teal-600" size={13} />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {title}
          </h3>
          <span className="text-[10px] text-slate-400">
            {pts.length} ຈຸດ
            {bills.length > pts.length
              ? ` · ອີກ ${bills.length - pts.length} ບິນຍັງບໍ່ມີຈຸດ`
              : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-slate-400 hover:text-slate-600"
          >
            <FaTimes size={14} />
          </button>
        </div>
        <div id="pending-route-map" className="flex-1" />
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c
  );
}

/** ໂຫຼດ Leaflet ຈາກ CDN ເທື່ອດຽວຕໍ່ໜ້າ. */
async function loadLeaflet(): Promise<unknown> {
  const w = window as unknown as { L?: unknown };
  if (w.L) return w.L;
  await new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("ໂຫຼດແຜນທີ່ບໍ່ໄດ້"));
    document.body.appendChild(s);
  });
  return (window as unknown as { L?: unknown }).L;
}

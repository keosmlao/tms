"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaMapMarkedAlt } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { GeofenceMapPicker } from "@/components/geofence-map-picker";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import type { GeofenceRow } from "@/actions/geofence";

export default function GeofenceSettingsPage() {
  const [rows, setRows] = useState<GeofenceRow[]>([]);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"start" | "end">("start");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await Actions.getGeofences()) as GeofenceRow[];
        setRows(data);
        if (data.length) setCode((c) => c || data[0].transport_code);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = useMemo(
    () => rows.find((r) => r.transport_code === code),
    [rows, code]
  );

  function patch(partial: Partial<GeofenceRow>) {
    setRows((rs) => rs.map((r) => (r.transport_code === code ? { ...r, ...partial } : r)));
  }

  const save = async () => {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await Actions.saveGeofenceConfig({
        transport_code: current.transport_code,
        enabled: current.enabled,
        start_lat: current.start_lat,
        start_lng: current.start_lng,
        end_lat: current.end_lat,
        end_lng: current.end_lng,
        radius_m: current.radius_m,
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-5">
      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <FaArrowLeft size={11} /> ກັບໄປຕັ້ງຄ່າ
      </Link>
      <StatusPageHeader
        title="Geofence ຈຸດເລີ່ມ / ສິ້ນສຸດ"
        subtitle="ກຳນົດຈຸດ ແລະ ໄລຍະ (ແມັດ) ທີ່ຄົນຂັບຕ້ອງຢູ່ ຈຶ່ງເລີ່ມ/ປິດຖ້ຽວໄດ້ — ແຍກຕາມສາຂາ"
        icon={<FaMapMarkedAlt />}
        tone="slate"
      />

      <SectionCard
        title="ເລືອກສາຂາ / ສາງ"
        subtitle="ແຕ່ລະສາຂາມີຈຸດເລີ່ມ/ສິ້ນສຸດ ແລະ ການເປີດໃຊ້ຂອງຕົນເອງ"
        icon={<FaMapMarkedAlt className="text-sky-600" />}
      >
        {error && !rows.length && (
          <div className="rounded-lg p-3 text-xs text-rose-600 bg-rose-500/10">{error}</div>
        )}
        {!error && !rows.length ? (
          <p className="text-xs text-slate-400">ບໍ່ພົບສາຂາ/ສາງ</p>
        ) : (
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200"
          >
            {rows.map((r) => (
              <option key={r.transport_code} value={r.transport_code}>
                {r.name} ({r.transport_code}){r.enabled ? " • ເປີດ" : ""}
              </option>
            ))}
          </select>
        )}
      </SectionCard>

      {current && (
        <SectionCard
          title={current.name}
          subtitle={`ລະຫັດສາຂາ: ${current.transport_code}`}
          icon={<FaMapMarkedAlt className="text-emerald-600" />}
        >
          <Toggle
            label="ເປີດໃຊ້ Geofence"
            description="ເມື່ອເປີດ: ຄົນຂັບຕ້ອງຢູ່ໃນໄລຍະທີ່ກຳນົດ ຈຶ່ງກົດ ‘ເລີ່ມຈັດສົ່ງ’ ແລະ ‘ປິດຖ້ຽວ’ ໄດ້"
            checked={current.enabled}
            onChange={(v) => patch({ enabled: v })}
          />

          <Field
            label="ໄລຍະທີ່ອະນຸຍາດ (ແມັດ)"
            hint="ຄ່າເລີ່ມຕົ້ນ 50 ແມັດ"
            value={String(current.radius_m)}
            onChange={(v) => patch({ radius_m: Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0) })}
            placeholder="50"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("start")}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                mode === "start"
                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/40"
                  : "glass text-slate-600 dark:text-slate-300"
              }`}
            >
              🏁 ກຳນົດຈຸດເລີ່ມ
            </button>
            <button
              type="button"
              onClick={() => setMode("end")}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                mode === "end"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40"
                  : "glass text-slate-600 dark:text-slate-300"
              }`}
            >
              📍 ກຳນົດຈຸດສິ້ນສຸດ
            </button>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            ກົດເທິງແຜນທີ່ເພື່ອວາງ{mode === "start" ? "ຈຸດເລີ່ມ" : "ຈຸດສິ້ນສຸດ"} ຫຼື ລາກໝຸດເພື່ອປັບ
          </p>

          <GeofenceMapPicker
            start={{ lat: current.start_lat, lng: current.start_lng }}
            end={{ lat: current.end_lat, lng: current.end_lng }}
            radius={Math.max(1, current.radius_m)}
            mode={mode}
            onPick={(kind, lat, lng) =>
              patch(
                kind === "start"
                  ? { start_lat: lat, start_lng: lng }
                  : { end_lat: lat, end_lng: lng }
              )
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="ຈຸດເລີ່ມ — Lat" value={current.start_lat} onChange={(v) => patch({ start_lat: v })} placeholder="17.975600" />
            <Field label="ຈຸດເລີ່ມ — Lng" value={current.start_lng} onChange={(v) => patch({ start_lng: v })} placeholder="102.633100" />
            <Field label="ຈຸດສິ້ນສຸດ — Lat" value={current.end_lat} onChange={(v) => patch({ end_lat: v })} placeholder="17.975600" />
            <Field label="ຈຸດສິ້ນສຸດ — Lng" value={current.end_lng} onChange={(v) => patch({ end_lng: v })} placeholder="102.633100" />
          </div>

          <button
            type="button"
            onClick={() => patch({ end_lat: current.start_lat, end_lng: current.start_lng })}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            ⧉ ກັອບປີ້ຈຸດເລີ່ມ → ຈຸດສິ້ນສຸດ (ກໍລະນີສາງດຽວກັນ)
          </button>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={save} />
        </SectionCard>
      )}
    </div>
  );
}

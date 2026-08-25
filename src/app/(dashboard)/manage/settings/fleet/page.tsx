"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaBell, FaMapMarkedAlt, FaTruck } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";

export default function FleetAlertSettingsPage() {
  const [data, setData] = useState<NotifySettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const d = (await Actions.getNotifySettings()) as NotifySettings;
        setData({ ...EMPTY_SETTINGS, ...d });
      } catch (e) {
        setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const clampInt = (raw: string, min: number, max: number, fallback: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n) || raw.trim() === "") return fallback;
        return String(Math.max(min, Math.min(max, Math.trunc(n))));
      };
      await Actions.saveNotifySettings({
        "fleet.alert_enabled": data["fleet.alert_enabled"],
        "fleet.parked_minutes": clampInt(data["fleet.parked_minutes"], 5, 480, "30"),
        "fleet.left_base_metres": clampInt(data["fleet.left_base_metres"], 100, 5000, "500"),
        "fleet.speed_limit_kmh": clampInt(data["fleet.speed_limit_kmh"], 30, 200, "80"),
        "fleet.off_point_metres": clampInt(data["fleet.off_point_metres"], 100, 5000, "300"),
        // ຫວ່າງ = ປິດ. ຢ່າ clamp ໃຫ້ເປັນຄ່າຕັ້ງຕົ້ນ ບໍ່ດັ່ງນັ້ນມັນຈະເປີດເອງ.
        "fleet.off_route_km": data["fleet.off_route_km"].trim()
          ? clampInt(data["fleet.off_route_km"], 1, 500, "20")
          : "",
        "fleet.close_reminder_minutes": clampInt(
          data["fleet.close_reminder_minutes"], 5, 240, "20"
        ),
        "fleet.alert_line_to": data["fleet.alert_line_to"].trim(),
        "fleet.alert_channel_line": data["fleet.alert_channel_line"],
        "fleet.alert_channel_app": data["fleet.alert_channel_app"],
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const on = data["fleet.alert_enabled"] === "1";
  // ບໍ່ໄດ້ຕັ້ງ = ເປີດ (ພຶດຕິກຳເກົ່າ) — ມີແຕ່ "0" ທີ່ປິດ. ຕ້ອງກົງກັບ
  // fleet-alert.js ບໍ່ດັ່ງນັ້ນໜ້າຈໍກັບຕົວສົ່ງຈິງຈະບອກຄົນລະຢ່າງ.
  const chanLine = data["fleet.alert_channel_line"].trim() !== "0";
  const chanApp = data["fleet.alert_channel_app"].trim() !== "0";

  return (
    <div className="space-y-5">
      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-teal-600 dark:hover:text-teal-300"
      >
        <FaArrowLeft size={10} /> ກັບໄປເມນູຕັ້ງຄ່າ
      </Link>
      <StatusPageHeader
        title="ແຈ້ງເຕືອນລົດ"
        subtitle="ສົ່ງ LINE ຫາພະນັກງານສາຂາເມື່ອລົດຈອດດົນ ຫຼື ອອກຈາກສາງແຕ່ຍັງບໍ່ກົດເລີ່ມຈັດສົ່ງ"
        icon={<FaTruck />}
        tone="amber"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ເປີດ-ປິດ"
            subtitle="ຜູ້ຮັບຄືພະນັກງານຂອງສາຂານັ້ນທີ່ມີ LINE ຜູກໄວ້ — ບໍ່ຕ້ອງຕັ້ງລາຍຊື່ຢູ່ນີ້"
            icon={<FaBell className="text-amber-500" />}
            tone="amber"
          >
            <Toggle
              label="ເປີດແຈ້ງເຕືອນລົດ"
              description="ເມື່ອເປີດ ແລະ cron ເອີ້ນ /api/cron/fleet-alerts (ແນະນຳທຸກ 5 ນາທີ) ຈະສົ່ງ LINE. ແຕ່ລະເຫດການສົ່ງເທື່ອດຽວ — ຈອດຮອບໃໝ່ຈຶ່ງເຕືອນໃໝ່."
              checked={on}
              onChange={(v) => setData((d) => ({ ...d, "fleet.alert_enabled": v ? "1" : "0" }))}
            />
          </SectionCard>

          <SectionCard
            title="ເກນການເຕືອນ"
            subtitle="ປັບໄດ້ຕາມການໃຊ້ງານຈິງ ຖ້າເຕືອນຖີ່ເກີນ ຫຼື ຊ້າເກີນ"
            icon={<FaMapMarkedAlt className="text-sky-600" />}
            tone="sky"
          >
            <Field
              label="ລົດຈອດດົນເກີນ (ນາທີ)"
              hint="ນັບສະເພາະລົດທີ່ອອກຖ້ຽວແລ້ວ ແລະ ດັບເຄື່ອງຈັກ. ຄ່າ 5–480. ຕົວຢ່າງ 30"
              value={data["fleet.parked_minutes"]}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.parked_minutes": v.replace(/\D/g, "").slice(0, 3) }))
              }
              placeholder="30"
              icon={<FaTruck />}
              disabled={!on}
            />
            <Field
              label="ອອກຈາກສາງໄກເກີນ (ແມັດ)"
              hint="ໄກກວ່ານີ້ຖືວ່າອອກຈາກສາງແລ້ວ. ວັດຈາກຂໍ້ມູນຈິງ: ລົດຈອດໃນລານຢູ່ຫ່າງ ~24 ມ. ຄ່າ 100–5000"
              value={data["fleet.left_base_metres"]}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.left_base_metres": v.replace(/\D/g, "").slice(0, 4) }))
              }
              placeholder="500"
              icon={<FaMapMarkedAlt />}
              disabled={!on}
            />
            <Field
              label="ຂັບໄວເກີນ (ກມ/ຊມ)"
              hint="ເຕືອນເມື່ອລົດທີ່ກຳລັງຈັດສົ່ງແລ່ນໄວກວ່ານີ້. ຄັນລະເທື່ອຕໍ່ຊົ່ວໂມງ. ຄ່າ 30–200"
              value={data["fleet.speed_limit_kmh"]}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.speed_limit_kmh": v.replace(/\D/g, "").slice(0, 3) }))
              }
              placeholder="80"
              icon={<FaTruck />}
              disabled={!on}
            />
            <Field
              label="ຈອດບໍ່ຕົງຈຸດ — ຫ່າງເກີນ (ແມັດ)"
              hint="ຈອດດັບເຄື່ອງດົນເກີນເກນຂ້າງເທິງ ແລະ ຫ່າງຈາກຈຸດສົ່ງທີ່ຍັງບໍ່ປິດ ແລະ ຈາກສາງ ໄກກວ່ານີ້. ຄ່າ 100–5000"
              value={data["fleet.off_point_metres"]}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.off_point_metres": v.replace(/\D/g, "").slice(0, 4) }))
              }
              placeholder="300"
              icon={<FaMapMarkedAlt />}
              disabled={!on}
            />
            <Field
              label="ອອກນອກເສັ້ນທາງ — ຫ່າງເກີນ (ກມ) · ຫວ່າງ = ປິດ"
              hint="ເຕືອນເມື່ອລົດກຳລັງແລ່ນ ແຕ່ຫ່າງຈາກທຸກຈຸດສົ່ງ ແລະ ຈາກສາງ ໄກກວ່ານີ້. ລະບົບບໍ່ມີເສັ້ນທາງທີ່ວາງແຜນໄວ້ ຈຶ່ງເປັນການປະມານ — ຕັ້ງຕ່ຳເກີນ ຖ້ຽວທາງໄກຈະເຕືອນຕະຫຼອດທາງ. ຄ່າ 1–500"
              value={data["fleet.off_route_km"]}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.off_route_km": v.replace(/\D/g, "").slice(0, 3) }))
              }
              placeholder="ຫວ່າງ = ປິດ"
              icon={<FaMapMarkedAlt />}
              disabled={!on}
            />
            <Field
              label="ຮອດສາງແລ້ວບໍ່ປິດຖ້ຽວ (ນາທີ)"
              hint="ລົດຈອດຢູ່ລານສາງດົນເກີນນີ້ ແຕ່ຖ້ຽວຍັງບໍ່ປິດ — ເຕືອນທັງຄົນຂັບ (ແຈ້ງເຕືອນໃນແອັບ) ແລະ ຫົວໜ້າ. ຄ່າ 5–240"
              value={data["fleet.close_reminder_minutes"]}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  "fleet.close_reminder_minutes": v.replace(/\D/g, "").slice(0, 3),
                }))
              }
              placeholder="20"
              icon={<FaTruck />}
              disabled={!on}
            />
            <Toggle
              label="ສົ່ງຜ່ານ LINE"
              description="ສົ່ງຂໍ້ຄວາມແຈ້ງເຕືອນເຂົ້າ LINE ຂອງຜູ້ຮັບທີ່ເລືອກໄວ້ຂ້າງລຸ່ມ."
              checked={chanLine}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.alert_channel_line": v ? "1" : "0" }))
              }
            />
            <Toggle
              label="ສົ່ງເຂົ້າແອັບ (push)"
              description="ຄົນທີ່ຕິກເປີດ “ແຈ້ງເຕືອນລົດ” ໃນແອັບຈະໄດ້ຮັບ. ສ່ວນ “ຮອດສາງແຕ່ບໍ່ປິດຖ້ຽວ” ສົ່ງໃຫ້ຄົນຂັບຄົນນັ້ນໂດຍກົງສະເໝີ."
              checked={chanApp}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.alert_channel_app": v ? "1" : "0" }))
              }
            />
            {!chanLine && !chanApp && (
              <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                ປິດທັງສອງຊ່ອງທາງ = ບໍ່ມີໃຜໄດ້ຮັບແຈ້ງເຕືອນເລີຍ.
              </p>
            )}
            {chanLine && <LineRecipientPicker
              value={data["fleet.alert_line_to"]}
              disabled={!on}
              onChange={(v) =>
                setData((d) => ({ ...d, "fleet.alert_line_to": v }))
              }
            />}
            <p className="text-[11px] text-slate-500 dark:text-gray-400">
              ໝາຍເຫດ: “ອອກຈາກສາງ”, “ຈອດບໍ່ຕົງຈຸດ” ແລະ “ອອກນອກເສັ້ນທາງ” ຕ້ອງມີພິກັດສາງໃນ
              Geofence ຂອງສາຂານັ້ນ ຫຼື ພິກັດຂອງລູກຄ້າ — ບ່ອນທີ່ບໍ່ມີພິກັດເລີຍຈະບໍ່ຖືກເຕືອນ
              (ບໍ່ຮູ້ກໍ່ບໍ່ເຕືອນ ດີກວ່າເຕືອນຜິດ).
            </p>
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

type RecipientOption = {
  code: string;
  name: string;
  nickname: string;
  department: string;
  position: string;
};

/**
 * ເລືອກຜູ້ຮັບແຈ້ງເຕືອນຈາກລາຍຊື່ພະນັກງານ (odg_employee) ແທນການພິມ LINE id ເອງ.
 *
 * ເກັບເປັນ **ລະຫັດພະນັກງານ** ບໍ່ແມ່ນ LINE id — ພະນັກງານປ່ຽນ LINE ເມື່ອໃດ
 * ແຈ້ງເຕືອນກໍ່ຕາມໄປເອງ. ຄ່າເກົ່າທີ່ເປັນ LINE id ດິບ (ຕັ້ງກ່ອນມີໜ້ານີ້) ຍັງ
 * ໃຊ້ໄດ້ຢູ່ ແລະ ສະແດງເປັນລາຍການ "ຕັ້ງດ້ວຍມື" ໃຫ້ລຶບອອກໄດ້.
 */
function LineRecipientPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setOptions((await Actions.getLineRecipientOptions()) as RecipientOption[]);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
  const byCode = new Map(options.map((o) => [o.code, o]));
  const isRawId = (t: string) => /^[UC][0-9a-f]{20,}$/i.test(t);

  const toggle = (code: string) => {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange(next.join(","));
  };

  const query = q.trim().toLowerCase();
  const shown = query
    ? options.filter((o) =>
        `${o.name} ${o.nickname} ${o.code} ${o.department} ${o.position}`
          .toLowerCase()
          .includes(query)
      )
    : options;

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        ຜູ້ຮັບແຈ້ງເຕືອນຜ່ານ LINE
      </label>

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((code) => {
            const opt = byCode.get(code);
            return (
              <button
                key={code}
                type="button"
                disabled={disabled}
                onClick={() => toggle(code)}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 disabled:opacity-50 dark:bg-teal-500/15 dark:text-teal-300"
                title="ກົດເພື່ອເອົາອອກ"
              >
                {opt ? opt.name : isRawId(code) ? `LINE id (ຕັ້ງດ້ວຍມື)` : code}
                <span aria-hidden>×</span>
              </button>
            );
          })}
        </div>
      )}

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        placeholder="ຄົ້ນຫາຊື່ / ຊື່ຫຼິ້ນ / ລະຫັດ / ພະແນກ"
        className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
      />

      <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
        {loading ? (
          <p className="p-3 text-xs text-slate-500">ກຳລັງໂຫຼດລາຍຊື່…</p>
        ) : shown.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">
            {options.length === 0
              ? "ບໍ່ມີພະນັກງານທີ່ຜູກ LINE ໄວ້"
              : "ບໍ່ພົບຄົນທີ່ຄົ້ນຫາ"}
          </p>
        ) : (
          shown.map((o) => (
            <label
              key={o.code}
              className="flex cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.code)}
                onChange={() => toggle(o.code)}
                disabled={disabled}
                className="h-4 w-4 accent-teal-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                  {o.name}
                  {o.nickname ? (
                    <span className="text-slate-400"> ({o.nickname})</span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {[o.code, o.position, o.department]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))
        )}
      </div>

      <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
        ເລືອກຈາກລາຍຊື່ພະນັກງານທີ່ຜູກ LINE ໄວ້ແລ້ວ.{" "}
        <b>ເລືອກໄວ້ = ສົ່ງສະເພາະຄົນທີ່ເລືອກ</b> ບໍ່ໄດ້ສົ່ງຫາພະນັກງານສາຂາທຸກຄົນອີກ.
        ບໍ່ເລືອກໃຜເລີຍ = ກັບໄປໃຊ້ວິທີເກົ່າ (ທຸກຄົນທີ່ logistic_code ຕົງ).
      </p>
    </div>
  );
}

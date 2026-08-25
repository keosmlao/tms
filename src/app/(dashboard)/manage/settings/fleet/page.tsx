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
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const on = data["fleet.alert_enabled"] === "1";

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
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                ຜູ້ຮັບແຈ້ງເຕືອນຜ່ານ LINE
              </label>
              <textarea
                value={data["fleet.alert_line_to"]}
                onChange={(e) =>
                  setData((d) => ({ ...d, "fleet.alert_line_to": e.target.value }))
                }
                disabled={!on}
                rows={3}
                placeholder={"ຫວ່າງ = ສົ່ງຫາພະນັກງານຂອງສາຂານັ້ນທຸກຄົນທີ່ມີ LINE\nUxxxxxxxx…  ຫຼື  Cxxxxxxxx… (ກຸ່ມ)"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
                ໃສ່ userId ຫຼື groupId ຂອງ LINE ຫຼາຍອັນໄດ້ — ຄັ່ນດ້ວຍຈຸດ ຫຼື ຂຶ້ນແຖວໃໝ່.
                <b> ຕັ້ງໄວ້ = ສົ່ງສະເພາະລາຍຊື່ນີ້</b> ບໍ່ໄດ້ສົ່ງຫາພະນັກງານສາຂາອີກ.
                ປ່ອຍຫວ່າງຈຶ່ງກັບໄປໃຊ້ວິທີເກົ່າ (ທຸກຄົນທີ່ logistic_code ຕົງ — ດຽວນີ້ມີ
                280 ຄົນທີ່ຕັ້ງ LINE ໄວ້ ຈຶ່ງມັກຈະຫຼາຍເກີນໄປ).
              </p>
            </div>
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

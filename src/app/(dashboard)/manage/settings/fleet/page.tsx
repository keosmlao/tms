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
            <p className="text-[11px] text-slate-500 dark:text-gray-400">
              ໝາຍເຫດ: ການເຕືອນ “ອອກຈາກສາງ” ຕ້ອງມີພິກັດສາງໃນ Geofence ຂອງສາຂານັ້ນ —
              ສາຂາທີ່ຍັງບໍ່ໄດ້ຕັ້ງພິກັດຈະບໍ່ຖືກເຕືອນ.
            </p>
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

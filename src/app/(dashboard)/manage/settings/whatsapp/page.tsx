"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaWhatsapp } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";
import { userErrorMessage } from "@/lib/action-error";

export default function WhatsappSettingsPage() {
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
        setError(userErrorMessage(e, "ໂຫຼດບໍ່ສຳເລັດ"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await Actions.saveNotifySettings({
        "whatsapp.test_enabled": data["whatsapp.test_enabled"],
        "whatsapp.test_to": data["whatsapp.test_to"],
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(userErrorMessage(e, "ບັນທຶກບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  const waEnabled =
    data["whatsapp.test_enabled"] === "1" || data["whatsapp.test_enabled"] === "true";

  return (
    <div className="space-y-5">
      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-teal-600 dark:hover:text-teal-300"
      >
        <FaArrowLeft size={10} /> ກັບໄປເມນູຕັ້ງຄ່າ
      </Link>
      <StatusPageHeader
        title="WhatsApp — ລູກຄ້າ"
        subtitle="ຂໍ້ຄວາມຕິດຕາມການສົ່ງໄປຫາລູກຄ້າ"
        icon={<FaWhatsapp />}
        tone="emerald"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ໂໝດທົດສອບ"
            subtitle="ສົ່ງຂໍ້ຄວາມໄປເບີທົດສອບ ແທນທີ່ຈະສົ່ງຫາລູກຄ້າຈິງ"
            icon={<FaWhatsapp className="text-emerald-500" />}
            tone="emerald"
          >
            <Toggle
              label="ໂໝດທົດສອບ WhatsApp"
              description="ເມື່ອເປີດ ຂໍ້ຄວາມລູກຄ້າທັງໝົດຈະຖືກສົ່ງໄປເບີທົດສອບ ແທນທີ່ຈະສົ່ງຫາລູກຄ້າຈິງ"
              checked={waEnabled}
              onChange={(v) => setData((d) => ({ ...d, "whatsapp.test_enabled": v ? "1" : "0" }))}
            />
            <Field
              label="ເບີໂທທົດສອບ WhatsApp"
              hint="ໃສ່ເບີລະຫັດປະເທດ ເຊັ່ນ 856201234567 (ຫຼື 02012345678 — ຈະເພີ່ມ 856 ໃຫ້ອັດຕະໂນມັດ)"
              value={data["whatsapp.test_to"]}
              onChange={(v) => setData((d) => ({ ...d, "whatsapp.test_to": v }))}
              placeholder="856201234567"
              icon={<FaWhatsapp />}
              disabled={!waEnabled}
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

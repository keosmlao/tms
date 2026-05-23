"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaCog } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";

export default function PendingSettingsPage() {
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
      const days = Number(data["pending.not_yet_days"] || "3");
      await Actions.saveNotifySettings({
        "pending.not_yet_days": String(
          Number.isFinite(days) ? Math.max(0, Math.min(30, Math.trunc(days))) : 3
        ),
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-teal-600 dark:hover:text-teal-300"
      >
        <FaArrowLeft size={10} /> ກັບໄປເມນູຕັ້ງຄ່າ
      </Link>
      <StatusPageHeader
        title="Pending ບິນ"
        subtitle="ກຳນົດເກນວັນສຳລັບມຸມມອງ “ຍັງບໍ່ເຖິງເວລາ”"
        icon={<FaCog />}
        tone="sky"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ເກນວັນ"
            subtitle="ກຳນົດເກນວັນສຳລັບມຸມມອງ “ຍັງບໍ່ເຖິງເວລາ”"
            icon={<FaCog className="text-sky-600" />}
            tone="sky"
          >
            <Field
              label="ຈຳນວນມື້ກ່ອນເຖິງເວລາ"
              hint="ຖ້າຕັ້ງເປັນ 3: ບິນທີ່ send date ຫ່າງຈາກມື້ນີ້ເກີນ 3 ມື້ ຈະຢູ່ໃນກຸ່ມຍັງບໍ່ເຖິງເວລາ"
              value={data["pending.not_yet_days"]}
              onChange={(v) => setData((d) => ({ ...d, "pending.not_yet_days": v.replace(/\D/g, "").slice(0, 2) }))}
              placeholder="3"
              icon={<FaCog />}
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

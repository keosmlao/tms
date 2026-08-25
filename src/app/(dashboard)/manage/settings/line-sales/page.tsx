"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaFlask, FaLine, FaUserTie } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";
import { userErrorMessage } from "@/lib/action-error";

export default function LineSalesSettingsPage() {
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
        "line.test_enabled": data["line.test_enabled"],
        "line.test_to": data["line.test_to"],
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(userErrorMessage(e, "ບັນທຶກບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  const lineEnabled =
    data["line.test_enabled"] === "1" || data["line.test_enabled"] === "true";

  return (
    <div className="space-y-5">
      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-teal-600 dark:hover:text-teal-300"
      >
        <FaArrowLeft size={10} /> ກັບໄປເມນູຕັ້ງຄ່າ
      </Link>
      <StatusPageHeader
        title="LINE — ພະນັກງານຂາຍ"
        subtitle="ຂໍ້ຄວາມສະຖານະການຈັດສົ່ງສົ່ງຫາ LINE OA ຂອງພະນັກງານຂາຍ"
        icon={<FaLine />}
        tone="emerald"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ໂໝດທົດສອບ"
            subtitle="ສົ່ງຂໍ້ຄວາມໄປ user ທົດສອບ ແທນທີ່ຈະສົ່ງຫາພະນັກງານຈິງ"
            icon={<FaUserTie className="text-emerald-600" />}
            tone="emerald"
          >
            <Toggle
              label="ໂໝດທົດສອບ LINE"
              description="ເມື່ອເປີດ ຂໍ້ຄວາມທັງໝົດຈະຖືກສົ່ງໄປໃຫ້ user ທົດສອບ ແທນທີ່ຈະສົ່ງຫາພະນັກງານຈິງ"
              checked={lineEnabled}
              onChange={(v) => setData((d) => ({ ...d, "line.test_enabled": v ? "1" : "0" }))}
            />
            <Field
              label="LINE userId / groupId ສຳລັບທົດສອບ"
              hint="ເຊັ່ນ U1234567890abcdef... ຫຼື C12345... (group ID)"
              value={data["line.test_to"]}
              onChange={(v) => setData((d) => ({ ...d, "line.test_to": v }))}
              placeholder="U1234..."
              icon={<FaFlask />}
              disabled={!lineEnabled}
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaCog, FaQrcode } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";

export default function AppSettingsPage() {
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
      await Actions.saveNotifySettings({
        "app.qr_scan_verify_enabled": data["app.qr_scan_verify_enabled"],
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const qrScanEnabled =
    data["app.qr_scan_verify_enabled"] === "1" ||
    data["app.qr_scan_verify_enabled"] === "true" ||
    data["app.qr_scan_verify_enabled"] === "";

  return (
    <div className="space-y-5">
      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-teal-600 dark:hover:text-teal-300"
      >
        <FaArrowLeft size={10} /> ກັບໄປເມນູຕັ້ງຄ່າ
      </Link>
      <StatusPageHeader
        title="App ຄົນຂັບ"
        subtitle="ຄຸນສົມບັດທີ່ສະແດງໃນ app ຂອງຄົນຂັບ"
        icon={<FaCog />}
        tone="teal"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ກວດສອບຈຸດສົ່ງ"
            subtitle="ຄຸນສົມບັດ Scan QR ໃນ app ຄົນຂັບ"
            icon={<FaQrcode className="text-teal-600" />}
            tone="teal"
          >
            <Toggle
              label="ກວດສອບຈຸດສົ່ງດ້ວຍ QR (Scan QR)"
              description="ເມື່ອເປີດ: ປຸ່ມ Scan QR ປະກົດໃນບີນຕອນຈັດສົ່ງ ໃຫ້ຄົນຂັບ scan ບີນເພື່ອກວດສອບໄລຍະ. ປິດເພື່ອເຊື່ອງ."
              checked={qrScanEnabled}
              onChange={(v) => setData((d) => ({ ...d, "app.qr_scan_verify_enabled": v ? "1" : "0" }))}
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

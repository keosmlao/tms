"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaCog,
  FaLocationArrow,
  FaMobileAlt,
  FaQrcode,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
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
        "app.mobile.location_tracking_enabled":
          data["app.mobile.location_tracking_enabled"],
        "app.mobile.min_version": data["app.mobile.min_version"].trim(),
        "app.mobile.latest_version": data["app.mobile.latest_version"].trim(),
        "app.mobile.update_url_android": data["app.mobile.update_url_android"].trim(),
        "app.mobile.update_url_ios": data["app.mobile.update_url_ios"].trim(),
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

  // Unset = on. Only an explicit "0"/"false" switches phone GPS off.
  const locationTrackingEnabled = !(
    data["app.mobile.location_tracking_enabled"] === "0" ||
    data["app.mobile.location_tracking_enabled"] === "false"
  );

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

          <SectionCard
            title="ຕິດຕາມຕຳແໜ່ງ (GPS ມືຖື)"
            subtitle="ຮັບຕຳແໜ່ງຈາກມືຖືພະນັກງານ — ມີຜົນທັນທີ ບໍ່ຕ້ອງອອກ-ເຂົ້າລະບົບໃໝ່"
            icon={<FaLocationArrow className="text-teal-600" />}
            tone="teal"
          >
            <Toggle
              label="ຮັບຕຳແໜ່ງຈາກມືຖື (auto realtime)"
              description="ເມື່ອເປີດ: ທຸກຄົນທີ່ໃຊ້ແອັບຖືກບັງຄັບໃຫ້ເປີດ GPS ແລະ ອະນຸຍາດສິດຕຳແໜ່ງ ຈຶ່ງໃຊ້ແອັບໄດ້, ແລະ ມືຖືສົ່ງຕຳແໜ່ງທຸກ 5 ວິນາທີຕອນມີຖ້ຽວກຳລັງແລ່ນ. ເມື່ອປິດ: ມືຖືເຊົາສົ່ງ, ເຊົາບັງຄັບເປີດ GPS ແລະ server ບໍ່ຮັບຕຳແໜ່ງທີ່ສົ່ງມາອີກ (ລວມແອັບເວີຊັນເກົ່າ). ແອັບຮັບຮູ້ການປ່ຽນພາຍໃນ 1 ນາທີ."
              checked={locationTrackingEnabled}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  "app.mobile.location_tracking_enabled": v ? "1" : "0",
                }))
              }
            />
          </SectionCard>

          <SectionCard
            title="ບັງຄັບອັບເດດ App"
            subtitle="ກຳນົດເວີຊັນຕ່ຳສຸດ — app ທີ່ເກົ່າກວ່ານີ້ຈະຖືກບັງຄັບໃຫ້ອັບເດດກ່ອນໃຊ້ງານ"
            icon={<FaMobileAlt className="text-teal-600" />}
            tone="teal"
          >
            <Field
              label="ເວີຊັນຕ່ຳສຸດທີ່ອະນຸຍາດ (min version)"
              hint="ຕົວຢ່າງ 1.4.0 — app ທີ່ຕ່ຳກວ່ານີ້ (ຫຼືບໍ່ສົ່ງເວີຊັນ) ຈະຖືກບັງຄັບໃຫ້ອັບເດດ. ປ່ອຍຫວ່າງ = ປິດການບັງຄັບ."
              value={data["app.mobile.min_version"]}
              onChange={(v) => setData((d) => ({ ...d, "app.mobile.min_version": v }))}
              placeholder="1.4.0"
            />
            <Field
              label="ເວີຊັນຫຼ້າສຸດ (latest version)"
              hint="ໃຊ້ສຳລັບແຈ້ງເຕືອນແບບບໍ່ບັງຄັບ ('ມີເວີຊັນໃໝ່'). ປ່ອຍຫວ່າງໄດ້."
              value={data["app.mobile.latest_version"]}
              onChange={(v) => setData((d) => ({ ...d, "app.mobile.latest_version": v }))}
              placeholder="1.4.0"
            />
            <Field
              label="ລິ້ງອັບເດດ Android"
              type="url"
              hint="ລິ້ງ Play Store ຫຼື APK ສຳລັບ Android"
              value={data["app.mobile.update_url_android"]}
              onChange={(v) => setData((d) => ({ ...d, "app.mobile.update_url_android": v }))}
              placeholder="https://play.google.com/store/apps/details?id=..."
            />
            <Field
              label="ລິ້ງອັບເດດ iOS"
              type="url"
              hint="ລິ້ງ App Store ສຳລັບ iOS"
              value={data["app.mobile.update_url_ios"]}
              onChange={(v) => setData((d) => ({ ...d, "app.mobile.update_url_ios": v }))}
              placeholder="https://apps.apple.com/app/..."
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaBell,
  FaCheckCircle,
  FaCog,
  FaExclamationTriangle,
  FaLocationArrow,
  FaMobileAlt,
  FaQrcode,
  FaSpinner,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";
import type { PushTarget, PushTestResult } from "@/actions/push-test";

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

  // ── ທົດສອບແຈ້ງເຕືອນ ─────────────────────────────────────────────────
  const [pushStatus, setPushStatus] = useState<PushTestResult | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushResult, setPushResult] = useState<PushTestResult | null>(null);
  // "" = ຕົນເອງ. ເລືອກຄົນອື່ນໄດ້ເພາະຄົນທີ່ນັ່ງໜ້າຄອມມັກບໍ່ແມ່ນຄົນຖືມືຖືທົດສອບ.
  const [pushTarget, setPushTarget] = useState("");
  const [pushTargets, setPushTargets] = useState<PushTarget[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setPushStatus((await Actions.getPushStatus()) as PushTestResult);
      } catch {
        // ສະຖານະອ່ານບໍ່ໄດ້ກໍ່ຍັງກົດທົດສອບໄດ້ຢູ່ — ບໍ່ຕ້ອງລົບກວນຜູ້ໃຊ້.
      }
      try {
        setPushTargets((await Actions.listPushTargets()) as PushTarget[]);
      } catch {
        // ຝ່າຍຂາຍບໍ່ມີສິດເບິ່ງລາຍຊື່ — ຍັງຍິງຫາຕົນເອງໄດ້ຢູ່.
      }
    })();
  }, []);

  const testPush = async () => {
    setPushBusy(true);
    setPushResult(null);
    try {
      const result = (await Actions.sendPushTest(
        pushTarget || undefined
      )) as PushTestResult;
      setPushResult(result);
      setPushStatus(result);
    } catch (e) {
      setPushResult({
        ok: false,
        configured: false,
        app_tokens: 0,
        sales_tokens: 0,
        error: e instanceof Error ? e.message : "ຍິງທົດສອບບໍ່ສຳເລັດ",
      });
    } finally {
      setPushBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await Actions.saveNotifySettings({
        "app.qr_scan_verify_enabled": data["app.qr_scan_verify_enabled"],
        "app.mobile.location_tracking_enabled":
          data["app.mobile.location_tracking_enabled"],
        "app.mobile.min_version": data["app.mobile.min_version"].trim(),
        "app.mobile.min_version_mode": data["app.mobile.min_version_mode"],
        "app.mobile.force_after_trip": data["app.mobile.force_after_trip"],
        "app.mobile.force_from_hour": data["app.mobile.force_from_hour"].trim(),
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

  const autoMinVersion =
    data["app.mobile.min_version_mode"].trim().toLowerCase() === "auto";

  // ບໍ່ໄດ້ຕັ້ງ = ເລື່ອນໄປຫຼັງປິດຖ້ຽວ (ຄ່າທີ່ປອດໄພກວ່າ). ມີແຕ່ "0" ທີ່ບັງຄັບທັນທີ.
  const forceAfterTrip = data["app.mobile.force_after_trip"].trim() !== "0";

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
            title="ແຈ້ງເຕືອນ (Push)"
            subtitle="ທົດສອບວ່າ server ຍິງແຈ້ງເຕືອນອອກໄດ້ບໍ — ເລືອກເຄື່ອງປາຍທາງໄດ້"
            icon={<FaBell className="text-teal-600" />}
            tone="teal"
          >
            <div className="space-y-3">
              {pushStatus && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <StatusPill
                    ok={pushStatus.configured}
                    okText="Firebase ພ້ອມ"
                    badText="Firebase ຍັງບໍ່ຕັ້ງຄ່າຢູ່ server"
                  />
                  {/* ນັບສະເພາະ app_tokens — sales_tokens ຢູ່ຄົນລະ Firebase
                      project ຈຶ່ງຍິງຫາບໍ່ໄດ້ຈາກນີ້ ບໍ່ຄວນນັບເປັນອຸປະກອນທີ່ພ້ອມ. */}
                  <StatusPill
                    ok={pushStatus.app_tokens > 0}
                    okText={`ອຸປະກອນທີ່ລົງທະບຽນ ${pushStatus.app_tokens}`}
                    badText="ບັນຊີນີ້ຍັງບໍ່ມີອຸປະກອນ — ເປີດແອັບ ODG TMS 1 ຄັ້ງກ່ອນ"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {pushTargets.length > 0 && (
                  <select
                    value={pushTarget}
                    onChange={(e) => setPushTarget(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">ຫາເຄື່ອງຂອງຂ້ອຍເອງ</option>
                    {pushTargets.map((t) => (
                      <option key={t.user_code} value={t.user_code}>
                        {t.user_code} · {t.name || "—"} ({t.devices} ເຄື່ອງ)
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => void testPush()}
                  disabled={pushBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {pushBusy ? (
                    <FaSpinner className="animate-spin" size={11} />
                  ) : (
                    <FaBell size={11} />
                  )}
                  ຍິງທົດສອບ
                </button>
              </div>
              {pushTarget && (
                <p className="text-[10px] text-amber-600">
                  ຈະຍິງຫາ{" "}
                  {pushTargets.find((t) => t.user_code === pushTarget)?.name ||
                    pushTarget}{" "}
                  — ເຂົາຈະໄດ້ຮັບແຈ້ງເຕືອນຈິງເທິງມືຖື
                </p>
              )}
              {pushResult && (
                <div
                  className={`rounded-lg px-3 py-2 text-[11px] ${
                    pushResult.ok
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {pushResult.ok
                    ? `ສົ່ງເຖິງເຄື່ອງທີ່ login ລ່າສຸດແລ້ວ${
                        pushResult.target_device
                          ? ` (${pushResult.target_device})`
                          : ""
                      } — ກວດເບິ່ງມືຖືພາຍໃນ 2-3 ວິນາທີ`
                    : pushResult.error}
                </div>
              )}
              <p className="text-[10px] text-slate-400">
                ບໍ່ໄດ້ຮັບ? ກວດວ່າ (1) server ມີໄຟລ໌ firebase-service-account.json
                ຫຼື env FIREBASE_SERVICE_ACCOUNT_BASE64, (2) ມືຖືເປີດສິດແຈ້ງເຕືອນໃຫ້
                ແອັບ, (3) ໄດ້ເປີດແອັບດ້ວຍບັນຊີນີ້ຢ່າງໜ້ອຍ 1 ຄັ້ງ.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="ບັງຄັບອັບເດດ App"
            subtitle="ກຳນົດເວີຊັນຕ່ຳສຸດ — app ທີ່ເກົ່າກວ່ານີ້ຈະຖືກບັງຄັບໃຫ້ອັບເດດກ່ອນໃຊ້ງານ"
            icon={<FaMobileAlt className="text-teal-600" />}
            tone="teal"
          >
            <Toggle
              label="ຕັ້ງເວີຊັນຕ່ຳສຸດອັດຕະໂນມັດ"
              description="ເມື່ອເປີດ: ເວີຊັນຕ່ຳສຸດຕິດຕາມ APK ທີ່ວາງໃຫ້ໂຫຼດຢູ່ /tms.apk ເອງ — ອັບ APK ໃໝ່ຂຶ້ນເຊີເວີແລ້ວບັງຄັບເລີຍ ບໍ່ຕ້ອງມາພິມເລກຢູ່ນີ້ (ຂັ້ນຕອນທີ່ລືມງ່າຍທີ່ສຸດ). ເມື່ອປິດ: ໃຊ້ເລກທີ່ພິມໄວ້ຂ້າງລຸ່ມ."
              checked={autoMinVersion}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  "app.mobile.min_version_mode": v ? "auto" : "manual",
                }))
              }
            />
            <Toggle
              label="ບັງຄັບຫຼັງປິດຖ້ຽວແລ້ວເທົ່ານັ້ນ"
              description="ເມື່ອເປີດ: ຄົນຂັບທີ່ກຳລັງແລ່ນຖ້ຽວຢູ່ (ຮັບຖ້ຽວແລ້ວ / ກຳລັງຈັດສົ່ງ) ຍັງໃຊ້ລຸ້ນເກົ່າຕໍ່ໄດ້ຈົນປິດຖ້ຽວ ຈຶ່ງຖືກບັງຄັບ — ຫຼັກຖານການສົ່ງ ແລະ GPS ຈະບໍ່ຄ້າງກາງທາງ. ເມື່ອປິດ: ບັງຄັບທັນທີ ເຖິງວ່າຈະຢູ່ກາງຖ້ຽວ."
              checked={forceAfterTrip}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  "app.mobile.force_after_trip": v ? "1" : "0",
                }))
              }
            />
            <Field
              label="ເລີ່ມບັງຄັບຕັ້ງແຕ່ໂມງ (0–23) · ຫວ່າງ = ຕະຫຼອດເວລາ"
              hint="ໂມງລາວ. ຕັ້ງ 18 = ລຸ້ນທີ່ອອກຕອນເຊົ້າຈະບໍ່ບັງຄັບໃຜຈົນກວ່າ 18:00 ຂອງມື້ນັ້ນ — ບໍ່ໄປຢຸດຄົນຂັບກາງມື້."
              value={data["app.mobile.force_from_hour"]}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  "app.mobile.force_from_hour": v.replace(/\D/g, "").slice(0, 2),
                }))
              }
              placeholder="18"
            />
            {!autoMinVersion && (
              <Field
                label="ເວີຊັນຕ່ຳສຸດທີ່ອະນຸຍາດ (min version)"
                hint="ຕົວຢ່າງ 1.4.0 — app ທີ່ຕ່ຳກວ່ານີ້ (ຫຼືບໍ່ສົ່ງເວີຊັນ) ຈະຖືກບັງຄັບໃຫ້ອັບເດດ. ປ່ອຍຫວ່າງ = ປິດການບັງຄັບ."
                value={data["app.mobile.min_version"]}
                onChange={(v) => setData((d) => ({ ...d, "app.mobile.min_version": v }))}
                placeholder="1.4.0"
              />
            )}
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

/** ປ້າຍສະຖານະນ້ອຍ — ຂຽວ = ພ້ອມ, ແດງ = ຕ້ອງແກ້. */
function StatusPill({
  ok,
  okText,
  badText,
}: {
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
        ok
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-500/10 text-rose-600 dark:text-rose-300"
      }`}
    >
      {ok ? <FaCheckCircle size={10} /> : <FaExclamationTriangle size={10} />}
      {ok ? okText : badText}
    </span>
  );
}

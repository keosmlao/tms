"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaChartLine, FaCog } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";

/**
 * ໜ້າທີ່ຈໍ TV ຫ້ອງຈັດສົ່ງຈະສະແດງ.
 *
 * ລຳດັບຕ້ອງກົງກັບ PAGES ໃນ src/app/tv/page.tsx — ຈໍອ່ານຄ່າເປັນເລກ
 * ຈຶ່ງບໍ່ຄວນສະຫຼັບລຳດັບ ຖ້າເພີ່ມໜ້າໃໝ່ໃຫ້ຕໍ່ທ້າຍ.
 */
const TV_PAGES = [
  { no: 1, label: "ພາບລວມມື້ນີ້", hint: "ຄວາມຄືບໜ້າ · ວຽກຄ້າງ · ຖ້ຽວກຳລັງແລ່ນ" },
  { no: 2, label: "ຕ້ອງແກ້ດຽວນີ້", hint: "ຍັງບໍ່ອອກ · ຄ້າງປິດຖ້ຽວ · ບິນຍົກເລີກ" },
  { no: 3, label: "ບິນທີ່ຊ້າ", hint: "ລາຍບິນທີ່ເລີຍກຳນົດ ພ້ອມຊື່ລູກຄ້າ" },
  { no: 4, label: "ບິນລັດຄິວ", hint: "ບິນທີ່ເປີດຫຼັງ ແຕ່ຖືກຈັດຖ້ຽວກ່ອນບິນເກົ່າ" },
];

export default function TvSettingsPage() {
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

  const selected = String(data["tv.pages"] || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((no) => TV_PAGES.some((page) => page.no === no));

  const toggle = (no: number) => {
    const next = selected.includes(no)
      ? selected.filter((item) => item !== no)
      : [...selected, no].sort((a, b) => a - b);
    setData((current) => ({ ...current, "tv.pages": next.join(",") }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // ບໍ່ເລືອກຈັກໜ້າ = ຈໍຫວ່າງເປົ່າ ຈຶ່ງກັບໄປໃຊ້ທຸກໜ້າແທນ
      const pages =
        selected.length > 0 ? selected.join(",") : TV_PAGES.map((p) => p.no).join(",");
      const secs = Number(data["tv.secs"] || "20");
      await Actions.saveNotifySettings({
        "tv.pages": pages,
        "tv.secs": String(
          Number.isFinite(secs) ? Math.max(5, Math.min(300, Math.trunc(secs))) : 20
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
        title="ຈໍ TV ຫ້ອງຈັດສົ່ງ"
        subtitle="ເລືອກໜ້າທີ່ຈໍຈະສະແດງ ແລະ ຄວາມໄວການໝຸນ"
        icon={<FaChartLine />}
        tone="sky"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ໜ້າທີ່ຈະສະແດງ"
            subtitle="ຕິກໜ້າທີ່ຢາກໃຫ້ຂຶ້ນຈໍ — ຈໍຈະໝຸນສະຫຼັບກັນສະເພາະໜ້າທີ່ຕິກ"
            icon={<FaChartLine className="text-sky-600" />}
            tone="sky"
          >
            <div className="space-y-2">
              {TV_PAGES.map((page) => (
                <label
                  key={page.no}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200/70 bg-white/70 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(page.no)}
                    onChange={() => toggle(page.no)}
                    className="mt-0.5 h-4 w-4 accent-sky-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-white">
                      {page.no}. {page.label}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-gray-400">
                      {page.hint}
                    </span>
                  </span>
                </label>
              ))}
              {selected.length === 0 && (
                <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  ຍັງບໍ່ໄດ້ເລືອກໜ້າໃດ — ບັນທຶກແລ້ວຈະກັບໄປສະແດງທຸກໜ້າ
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="ຄວາມໄວການໝຸນ"
            subtitle="ຈໍຈະປ່ຽນໜ້າທຸກໆກີ່ວິນາທີ (ເລືອກໜ້າດຽວຈະບໍ່ໝຸນ)"
            icon={<FaCog className="text-sky-600" />}
            tone="sky"
          >
            <Field
              label="ວິນາທີຕໍ່ໜ້າ"
              hint="ຕ່ຳສຸດ 5 · ສູງສຸດ 300 ວິນາທີ"
              value={data["tv.secs"]}
              onChange={(v) =>
                setData((d) => ({ ...d, "tv.secs": v.replace(/\D/g, "").slice(0, 3) }))
              }
              placeholder="20"
              icon={<FaCog />}
            />
          </SectionCard>

          <SaveBar
            saving={saving}
            savedAt={savedAt}
            error={error}
            onSave={() => void save()}
          />
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaBell, FaChartLine, FaFlask } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";

export default function KpiSettingsPage() {
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
      const clampInt = (raw: string, min: number, max: number) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return "";
        return String(Math.max(min, Math.min(max, Math.trunc(n))));
      };
      await Actions.saveNotifySettings({
        "kpi.target_on_time_rate": clampInt(data["kpi.target_on_time_rate"], 0, 100),
        "kpi.target_avg_delivery_minutes": clampInt(data["kpi.target_avg_delivery_minutes"], 0, 1440),
        "kpi.target_avg_close_minutes": clampInt(data["kpi.target_avg_close_minutes"], 0, 1440),
        "kpi.alert_enabled": data["kpi.alert_enabled"],
        "kpi.alert_line_to": data["kpi.alert_line_to"],
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
        title="KPI ການຈັດສົ່ງ"
        subtitle="ກຳນົດເປົ້າໝາຍ (target) ສຳລັບສະຖິຕິໃນ Dashboard"
        icon={<FaChartLine />}
        tone="teal"
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ເປົ້າໝາຍ KPI"
            subtitle="ຄ່າທີ່ຕັ້ງຈະຖືກປຽບກັບຄ່າຈິງໃນ Dashboard"
            icon={<FaChartLine className="text-teal-600" />}
            tone="teal"
          >
            <Field
              label="ສຳເລັດທັນເວລາ ເປົ້າໝາຍ (%)"
              hint="ສັດສ່ວນບິນທີ່ສົ່ງສຳເລັດທັນວັນກຳນົດ ສະຫຼຸບໃນຊ່ວງເວລາ. ຄ່າ 0–100. ຕົວຢ່າງ 90"
              value={data["kpi.target_on_time_rate"]}
              onChange={(v) => setData((d) => ({ ...d, "kpi.target_on_time_rate": v.replace(/\D/g, "").slice(0, 3) }))}
              placeholder="90"
              icon={<FaChartLine />}
            />
            <Field
              label="ສະເລ່ຍເວລາສົ່ງ ເປົ້າໝາຍ (ນາທີ)"
              hint="ສະເລ່ຍເວລາຈາກຮັບຖ້ຽວຫາສົ່ງສຳເລັດ. ຕົວຢ່າງ 120 = 2 ຊົ່ວໂມງ"
              value={data["kpi.target_avg_delivery_minutes"]}
              onChange={(v) => setData((d) => ({ ...d, "kpi.target_avg_delivery_minutes": v.replace(/\D/g, "").slice(0, 4) }))}
              placeholder="120"
              icon={<FaChartLine />}
            />
            <Field
              label="ສະເລ່ຍເວລາປິດຖ້ຽວ ເປົ້າໝາຍ (ນາທີ)"
              hint="ສະເລ່ຍເວລາຈາກສົ່ງສຳເລັດຫາຄົນຂັບປິດຖ້ຽວ. ຕົວຢ່າງ 30"
              value={data["kpi.target_avg_close_minutes"]}
              onChange={(v) => setData((d) => ({ ...d, "kpi.target_avg_close_minutes": v.replace(/\D/g, "").slice(0, 4) }))}
              placeholder="30"
              icon={<FaChartLine />}
            />
          </SectionCard>

          <SectionCard
            title="Alert ເມື່ອ KPI ຕ່ຳກວ່າເປົ້າ"
            subtitle="ສົ່ງຂໍ້ຄວາມ LINE ຫາ admin ເມື່ອ KPI ຂອງມື້ວານຕ່ຳກວ່າເປົ້າ"
            icon={<FaBell className="text-amber-500" />}
            tone="amber"
          >
            <Toggle
              label="ເປີດ Alert"
              description="ເມື່ອເປີດ ແລະ cron ເອີ້ນ /api/cron/kpi-alert: ຖ້າ on-time rate / avg delivery / avg close ຂອງມື້ວານພາດເປົ້າ ຈະສົ່ງ LINE."
              checked={data["kpi.alert_enabled"] === "1"}
              onChange={(v) => setData((d) => ({ ...d, "kpi.alert_enabled": v ? "1" : "0" }))}
            />
            <Field
              label="LINE userId / groupId ສຳລັບ Alert"
              hint="ເຊັ່ນ U1234... ຫຼື C12345... ປ່ອຍວ່າງ = ບໍ່ສົ່ງ"
              value={data["kpi.alert_line_to"]}
              onChange={(v) => setData((d) => ({ ...d, "kpi.alert_line_to": v }))}
              placeholder="U1234..."
              icon={<FaFlask />}
              disabled={data["kpi.alert_enabled"] !== "1"}
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

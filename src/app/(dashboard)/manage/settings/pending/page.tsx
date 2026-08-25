"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaCog, FaExchangeAlt } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { Field, PageLoading, SaveBar, SectionCard, Toggle } from "../_components";
import { EMPTY_SETTINGS, type NotifySettings } from "../_settings";
import { userErrorMessage } from "@/lib/action-error";

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
      const days = Number(data["pending.not_yet_days"] || "3");
      await Actions.saveNotifySettings({
        "pending.not_yet_days": String(
          Number.isFinite(days) ? Math.max(0, Math.min(30, Math.trunc(days))) : 3
        ),
        "pending.erp_transfer_enabled": data["pending.erp_transfer_enabled"],
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(userErrorMessage(e, "ບັນທຶກບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  // ບໍ່ໄດ້ຕັ້ງ = ເປີດ (ພຶດຕິກຳເກົ່າ). ມີແຕ່ "0" ທີ່ປິດ — ຕ້ອງກົງກັບ
  // `erpTransferEnabled()` ຢູ່ queries/bills.js.
  const erpTransferOn = data["pending.erp_transfer_enabled"].trim() !== "0";

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

          <SectionCard
            title="ໃບຂໍໂອນສິນຄ້າລະຫວ່າງສາງ"
            subtitle="ດຶງໃບຂໍໂອນຈາກ ERP ເຂົ້າຄິວ ບິນລໍຈັດຖ້ຽວ ຫຼື ບໍ່"
            icon={<FaExchangeAlt className="text-sky-600" />}
            tone="sky"
          >
            <Toggle
              label="ເອົາໃບຂໍໂອນເຂົ້າຄິວ ບິນລໍຈັດຖ້ຽວ"
              description="ເມື່ອເປີດ: ໃບຂໍໂອນທີ່ຍ້າຍຂ້າມສາຂາ (ດອນຕິ້ວ · ໂພນສະອາດ · ຂົວຫຼວງ · ປາກເຊ) ຂຶ້ນຄິວຂອງສາຂາຕົ້ນທາງ ໃຫ້ຈັດເຂົ້າຖ້ຽວຄືບິນຂາຍ. ເມື່ອປິດ: ຄິວມີແຕ່ບິນຂາຍ — ບໍ່ໄດ້ລຶບຫຍັງ, ໃບຂໍໂອນຍັງຢູ່ໃນ ERP ຄືເກົ່າ ແລະ ເປີດຄືນເມື່ອໃດກໍ່ກັບມາທັນທີ. ຖ້ຽວທີ່ຈັດໄປແລ້ວບໍ່ໄດ້ຮັບຜົນກະທົບ."
              checked={erpTransferOn}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  "pending.erp_transfer_enabled": v ? "1" : "0",
                }))
              }
            />
          </SectionCard>

          <SaveBar saving={saving} savedAt={savedAt} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  FaCheck,
  FaCog,
  FaFlask,
  FaLine,
  FaSave,
  FaSpinner,
  FaUserTie,
  FaWhatsapp,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import {
  StatusPageHeader,
} from "@/components/status-page-shell";

interface NotifySettings {
  "line.test_enabled": string;
  "line.test_to": string;
  "line.customer.test_enabled": string;
  "line.customer.test_to": string;
  "whatsapp.test_enabled": string;
  "whatsapp.test_to": string;
}

const EMPTY: NotifySettings = {
  "line.test_enabled": "",
  "line.test_to": "",
  "line.customer.test_enabled": "",
  "line.customer.test_to": "",
  "whatsapp.test_enabled": "",
  "whatsapp.test_to": "",
};

export default function SettingsPage() {
  const [data, setData] = useState<NotifySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = (await Actions.getNotifySettings()) as NotifySettings;
      setData({ ...EMPTY, ...d });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ໂຫຼດບໍ່ສຳເລັດ");
    } finally {
      setLoading(false);
    }
  };

  const update = (key: keyof NotifySettings, value: string) =>
    setData((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await Actions.saveNotifySettings(data);
      setSavedAt(Date.now());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const lineEnabled =
    data["line.test_enabled"] === "1" || data["line.test_enabled"] === "true";
  const customerLineEnabled =
    data["line.customer.test_enabled"] === "1" ||
    data["line.customer.test_enabled"] === "true";
  const waEnabled =
    data["whatsapp.test_enabled"] === "1" ||
    data["whatsapp.test_enabled"] === "true";

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ຕັ້ງຄ່າ"
        subtitle="ຕັ້ງຄ່າການແຈ້ງເຕືອນ ແລະ ໂໝດທົດສອບ"
        icon={<FaCog />}
        tone="slate"
      />

      {loading ? (
        <div className="glass rounded-lg py-16 flex items-center justify-center text-slate-400">
          <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
        </div>
      ) : (
        <>
          <SectionCard
            title="LINE — ພະນັກງານຂາຍ"
            subtitle="ຂໍ້ຄວາມສະຖານະການຈັດສົ່ງສົ່ງຫາ LINE OA ຂອງພະນັກງານຂາຍ"
            icon={<FaUserTie className="text-emerald-600" />}
            tone="emerald"
          >
            <Toggle
              label="ໂໝດທົດສອບ LINE"
              description="ເມື່ອເປີດ ຂໍ້ຄວາມທັງໝົດຈະຖືກສົ່ງໄປໃຫ້ user ທົດສອບ ແທນທີ່ຈະສົ່ງຫາພະນັກງານຈິງ"
              checked={lineEnabled}
              onChange={(v) =>
                update("line.test_enabled", v ? "1" : "0")
              }
            />
            <Field
              label="LINE userId / groupId ສຳລັບທົດສອບ"
              hint="ເຊັ່ນ U1234567890abcdef... ຫຼື C12345... (group ID)"
              value={data["line.test_to"]}
              onChange={(v) => update("line.test_to", v)}
              placeholder="U1234..."
              icon={<FaFlask />}
              disabled={!lineEnabled}
            />
          </SectionCard>

          <SectionCard
            title="LINE — ລູກຄ້າ"
            subtitle="ຂໍ້ຄວາມສະຖານະການຈັດສົ່ງສົ່ງຫາ LINE OA ຂອງລູກຄ້າ"
            icon={<FaLine className="text-emerald-500" />}
            tone="emerald"
          >
            <Toggle
              label="ໂໝດທົດສອບ LINE ລູກຄ້າ"
              description="ເມື່ອເປີດ ຂໍ້ຄວາມ LINE ທີ່ຈະສົ່ງຫາລູກຄ້າຈະຖືກສົ່ງໄປ user ທົດສອບ ແທນທີ່ຈະສົ່ງຫາລູກຄ້າຈິງ"
              checked={customerLineEnabled}
              onChange={(v) =>
                update("line.customer.test_enabled", v ? "1" : "0")
              }
            />
            <Field
              label="LINE userId / groupId ລູກຄ້າສຳລັບທົດສອບ"
              hint="ເຊັ່ນ U1234567890abcdef... ຫຼື C12345... (group ID)"
              value={data["line.customer.test_to"]}
              onChange={(v) => update("line.customer.test_to", v)}
              placeholder="U1234..."
              icon={<FaFlask />}
              disabled={!customerLineEnabled}
            />
          </SectionCard>

          <SectionCard
            title="WhatsApp — ລູກຄ້າ"
            subtitle="ຂໍ້ຄວາມຕິດຕາມການສົ່ງໄປຫາລູກຄ້າ"
            icon={<FaWhatsapp className="text-emerald-500" />}
            tone="emerald"
          >
            <Toggle
              label="ໂໝດທົດສອບ WhatsApp"
              description="ເມື່ອເປີດ ຂໍ້ຄວາມລູກຄ້າທັງໝົດຈະຖືກສົ່ງໄປເບີທົດສອບ ແທນທີ່ຈະສົ່ງຫາລູກຄ້າຈິງ"
              checked={waEnabled}
              onChange={(v) =>
                update("whatsapp.test_enabled", v ? "1" : "0")
              }
            />
            <Field
              label="ເບີໂທທົດສອບ WhatsApp"
              hint="ໃສ່ເບີລະຫັດປະເທດ ເຊັ່ນ 856201234567 (ຫຼື 02012345678 — ຈະເພີ່ມ 856 ໃຫ້ອັດຕະໂນມັດ)"
              value={data["whatsapp.test_to"]}
              onChange={(v) => update("whatsapp.test_to", v)}
              placeholder="856201234567"
              icon={<FaWhatsapp />}
              disabled={!waEnabled}
            />
          </SectionCard>

          {error && (
            <div className="glass rounded-lg p-3 text-xs text-rose-600 bg-rose-500/10">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {savedAt && Date.now() - savedAt < 5_000 && (
              <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                <FaCheck size={11} /> ບັນທຶກສຳເລັດ
              </span>
            )}
            <button
              onClick={() => void save()}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? (
                <>
                  <FaSpinner className="animate-spin" /> ກຳລັງບັນທຶກ...
                </>
              ) : (
                <>
                  <FaSave /> ບັນທຶກ
                </>
              )}
            </button>
          </div>

          <div className="glass rounded-lg p-4 text-[11px] text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">
              ວິທີໃຊ້ໂໝດທົດສອບ
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>ເປີດໂໝດທົດສອບ + ໃສ່ recipient ທົດສອບ → ບັນທຶກ</li>
              <li>
                ສ້າງຖ້ຽວ ຫຼື ປ່ຽນສະຖານະບິນ → ຂໍ້ຄວາມຈະຖືກສົ່ງໄປ recipient
                ທົດສອບ ໂດຍປະຕິບັດ "[TEST → recipient ຈິງ]" ໄວ້ຕົ້ນຂໍ້ຄວາມ
              </li>
              <li>ປິດໂໝດທົດສອບ → ກັບໄປສົ່ງປົກກະຕິ</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-white/5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-500/10 flex items-center justify-center text-base">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </p>
        {description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  icon,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            {icon}
          </span>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full ${
            icon ? "pl-9" : "pl-3"
          } pr-3 py-2 glass-input rounded-lg text-xs text-slate-700 dark:text-slate-200 disabled:cursor-not-allowed`}
        />
      </div>
      {hint && (
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

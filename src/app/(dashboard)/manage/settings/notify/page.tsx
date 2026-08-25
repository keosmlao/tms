"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaBell, FaTruck, FaUserTie } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { PageLoading, SaveBar } from "../_components";
import type { NotifyPrefsPage, NotifyPerson } from "@/actions/notify-prefs";
import { userErrorMessage } from "@/lib/action-error";

/**
 * ໜ້າ "ໃຜຮັບແຈ້ງເຕືອນຫຍັງ".
 *
 * ວາງເປັນຕາຕະລາງ ຄົນ × ປະເພດ ເພາະຄຳຖາມທີ່ຜູ້ໃຊ້ຖາມແມ່ນ "ຄົນນີ້ໄດ້ຫຍັງແດ່"
 * ແລະ "ເລື່ອງນີ້ໃຜໄດ້ແດ່" — ສອງທິດທາງ. ຕາຕະລາງຕອບໄດ້ທັງສອງດ້ວຍສາຍຕາ.
 */
export default function NotifyPrefsSettingsPage() {
  const [data, setData] = useState<NotifyPrefsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [showDrivers, setShowDrivers] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setData((await Actions.getNotifyPrefs()) as NotifyPrefsPage);
      } catch (e) {
        setError(userErrorMessage(e, "ໂຫຼດບໍ່ສຳເລັດ"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const key = (code: string, topic: string) => `${code}|${topic}`;

  const valueOf = (person: NotifyPerson, topic: string) =>
    edits[key(person.user_code, topic)] ?? person.topics[topic] ?? false;

  const toggle = (person: NotifyPerson, topic: string) => {
    const k = key(person.user_code, topic);
    setEdits((e) => ({ ...e, [k]: !valueOf(person, topic) }));
  };

  const people = useMemo(
    () => (data?.people ?? []).filter((p) => showDrivers || !p.is_driver),
    [data, showDrivers]
  );

  const dirty = Object.keys(edits).length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(edits).map(([k, enabled]) => {
        const [user_code, topic] = k.split("|");
        return { user_code, topic, enabled };
      });
      await Actions.saveNotifyPrefs(entries);
      // ເອົາຄ່າທີ່ບັນທຶກແລ້ວໄປທັບຂໍ້ມູນເດີມ ແທນທີ່ຈະໂຫຼດໃໝ່ທັງໜ້າ.
      setData((d) =>
        d
          ? {
              ...d,
              people: d.people.map((p) => ({
                ...p,
                topics: Object.fromEntries(
                  Object.entries(p.topics).map(([t, v]) => [
                    t,
                    edits[key(p.user_code, t)] ?? v,
                  ])
                ),
              })),
            }
          : d
      );
      setEdits({});
      setSavedAt(Date.now());
    } catch (e) {
      setError(userErrorMessage(e, "ບັນທຶກບໍ່ສຳເລັດ"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ໃຜຮັບແຈ້ງເຕືອນຫຍັງ"
        subtitle="ຕິກເລືອກປະເພດແຈ້ງເຕືອນທີ່ພະນັກງານແຕ່ລະຄົນຈະໄດ້ຮັບເທິງມືຖື"
        icon={<FaBell />}
        tone="teal"
      />

      <Link
        href="/manage/settings"
        className="inline-flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-700"
      >
        <FaArrowLeft size={10} /> ກັບໄປໜ້າຕັ້ງຄ່າ
      </Link>

      {error && (
        <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showDrivers}
            onChange={(e) => setShowDrivers(e.target.checked)}
            className="h-3.5 w-3.5 accent-teal-600"
          />
          ສະແດງຄົນຂັບນຳ
        </label>
        <span>ພະນັກງານທີ່ເຄີຍເປີດແອັບ {data?.people.length ?? 0} ຄົນ</span>
      </div>

      {/* ຕາຕະລາງກວ້າງກວ່າຈໍມືຖື — ໃຫ້ເລື່ອນຂ້າງໃນກ່ອງຕົນເອງ ບໍ່ແມ່ນທັງໜ້າ */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[720px] text-[11px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                ພະນັກງານ
              </th>
              {data?.topics.map((t) => (
                <th
                  key={t.key}
                  className="px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300"
                  title={t.detail}
                >
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr
                key={p.user_code}
                className="border-t border-slate-100 dark:border-slate-700/60"
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    {p.is_driver ? (
                      <FaTruck className="text-slate-400" size={11} />
                    ) : (
                      <FaUserTie className="text-teal-600" size={11} />
                    )}
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-200">
                        {p.name || p.user_code}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {p.user_code}
                        {p.dept ? ` · ${p.dept}` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                {data?.topics.map((t) => (
                  <td key={t.key} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={valueOf(p, t.key)}
                      onChange={() => toggle(p, t.key)}
                      className="h-4 w-4 accent-teal-600"
                      aria-label={`${p.name || p.user_code} — ${t.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td
                  colSpan={(data?.topics.length ?? 0) + 1}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  ຍັງບໍ່ມີພະນັກງານທີ່ເປີດແອັບ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] leading-relaxed text-slate-400">
        ຄ່າເລີ່ມຕົ້ນຂຶ້ນກັບບົດບາດ (ຫົວໜ້າ / ຄົນຂັບ). ຕິກປ່ຽນເອງແລ້ວ ຄ່າຂອງຄົນນັ້ນ
        ຈະຖືກຈື່ໄວ້ ແລະ ບໍ່ປ່ຽນຕາມຄ່າເລີ່ມຕົ້ນອີກ. &ldquo;ການເຄື່ອນໄຫວໃນເວັບ&rdquo;
        ປິດໄວ້ໝົດຕັ້ງແຕ່ຕົ້ນ ເພາະດັງຫຼາຍ — ເປີດສະເພາະຄົນທີ່ຕ້ອງການເຝົ້າ.
      </p>

      {dirty && (
        <p className="text-right text-[11px] font-semibold text-amber-600">
          ມີ {Object.keys(edits).length} ຊ່ອງທີ່ຍັງບໍ່ໄດ້ບັນທຶກ
        </p>
      )}
      <SaveBar
        onSave={() => void save()}
        saving={saving}
        savedAt={savedAt}
        error={error}
      />
    </div>
  );
}

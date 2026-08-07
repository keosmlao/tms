"use server";

import { requireDispatchAccess } from "./_helpers";
import {
  TOPICS,
  appPeople,
  allPrefs,
  savePrefs,
  defaultFor,
} from "@/queries/notify-prefs.js";
import { recordAudit } from "@/queries/audit-log.js";

export interface NotifyTopic {
  key: string;
  label: string;
  detail: string;
  managerDefault: boolean;
  driverDefault: boolean;
}

export interface NotifyPerson {
  user_code: string;
  name: string;
  dept: string;
  last_seen: string;
  is_driver: boolean;
  /** Effective on/off per topic — defaults already resolved. */
  topics: Record<string, boolean>;
}

export interface NotifyPrefsPage {
  topics: NotifyTopic[];
  people: NotifyPerson[];
}

/**
 * ໜ້າ "ໃຜຮັບແຈ້ງເຕືອນຫຍັງ" — ພະນັກງານທີ່ເຄີຍ login ແອັບ ພ້ອມຄ່າທີ່ໃຊ້ຈິງ.
 *
 * ຄືນຄ່າທີ່ **ຜ່ານການ resolve ແລ້ວ** (ຕັ້ງເອງ ຫຼື ຄ່າເລີ່ມຕົ້ນຕາມບົດບາດ)
 * ບໍ່ແມ່ນແຖວດິບ — ໜ້າຈໍຈຶ່ງບໍ່ຕ້ອງຮູ້ກົດຄ່າເລີ່ມຕົ້ນຊ້ຳອີກບ່ອນ.
 */
export async function getNotifyPrefs(): Promise<NotifyPrefsPage> {
  await requireDispatchAccess();
  const [people, prefs, topics] = await Promise.all([
    appPeople() as Promise<Omit<NotifyPerson, "topics">[]>,
    allPrefs() as Promise<Record<string, Record<string, boolean>>>,
    Promise.resolve(TOPICS as NotifyTopic[]),
  ]);

  return {
    topics,
    people: people.map((p) => ({
      ...p,
      topics: Object.fromEntries(
        topics.map((t) => [
          t.key,
          prefs[p.user_code]?.[t.key] ?? defaultFor(t.key, p.is_driver),
        ])
      ),
    })),
  };
}

export async function saveNotifyPrefs(
  entries: { user_code: string; topic: string; enabled: boolean }[]
): Promise<{ saved: number }> {
  const session = await requireDispatchAccess();
  const saved = (await savePrefs(entries)) as number;
  await recordAudit({
    action: "notify_prefs.update",
    entityType: "notify_prefs",
    entityId: String(entries?.length ?? 0),
    userCode: session.usercode,
    changes: { count: saved },
  });
  return { saved };
}

import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prefs = require("./notify-topics.js");

const { TOPICS, defaultFor, TYPE_TO_TOPIC, topicForPushType } = prefs as {
  TOPICS: {
    key: string;
    label: string;
    detail: string;
    managerDefault: boolean;
    driverDefault: boolean;
  }[];
  defaultFor: (topic: string, isDriver: boolean) => boolean;
  TYPE_TO_TOPIC: Record<string, string>;
  topicForPushType: (type: unknown) => string | null;
};

describe("ລາຍການປະເພດແຈ້ງເຕືອນ", () => {
  it("ທຸກປະເພດມີຊື່ພາສາລາວ ແລະ ຄຳອະທິບາຍ", () => {
    for (const t of TOPICS) {
      expect(t.label).toMatch(/[ກ-ໝ]/);
      expect(t.detail).toMatch(/[ກ-ໝ]/);
    }
  });

  it("ບໍ່ມີ key ຊ້ຳກັນ", () => {
    const keys = TOPICS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("ຄ່າເລີ່ມຕົ້ນຕາມບົດບາດ", () => {
  it("ການເຄື່ອນໄຫວໃນເວັບປິດໄວ້ທັງສອງບົດບາດ", () => {
    // ດັງທຸກຄັ້ງທີ່ມີຄົນກົດຫຍັງໃນເວັບ — ຕ້ອງເປັນການເລືອກເປີດເອງເທົ່ານັ້ນ.
    expect(defaultFor("web_activity", false)).toBe(false);
    expect(defaultFor("web_activity", true)).toBe(false);
  });

  it("ຫົວໜ້າເຫັນພາບລວມ ຄົນຂັບເຫັນແຕ່ງານຕົນເອງ", () => {
    expect(defaultFor("bill_delivered", false)).toBe(true);
    expect(defaultFor("bill_delivered", true)).toBe(false);
    expect(defaultFor("dispatch_reminder", true)).toBe(true);
    expect(defaultFor("dispatch_reminder", false)).toBe(false);
  });

  it("ງານທີ່ກ່ຽວກັບຖ້ຽວໂດຍກົງ ເປີດໃຫ້ທັງສອງ", () => {
    // ຄົນຂັບຕ້ອງຮູ້ວ່າໄດ້ຖ້ຽວ ແລະ ຫົວໜ້າຕ້ອງຮູ້ວ່າຈັດໄປແລ້ວ.
    for (const key of ["job_assigned", "job_status", "chat"]) {
      expect(defaultFor(key, true)).toBe(true);
      expect(defaultFor(key, false)).toBe(true);
    }
  });

  it("ປະເພດທີ່ບໍ່ຮູ້ຈັກ ຄືນ false ບໍ່ແມ່ນ undefined", () => {
    // ພິມຜິດຢູ່ຈຸດເອີ້ນ ບໍ່ຄວນກາຍເປັນ "ສົ່ງຫາທຸກຄົນ".
    expect(defaultFor("not_a_topic", false)).toBe(false);
    expect(defaultFor("not_a_topic", true)).toBe(false);
  });
});

describe("ແປງ data.type ຂອງ push → ປະເພດໃນໜ້າຕັ້ງຄ່າ", () => {
  it("ທຸກປາຍທາງທີ່ map ໄວ້ ຕ້ອງເປັນປະເພດທີ່ມີຈິງ", () => {
    // ພິມ topic ຜິດ = push ນັ້ນຖືກກັ່ນຕອງດ້ວຍປະເພດທີ່ບໍ່ມີ → ຫາຍງຽບໆ.
    const keys = new Set(TOPICS.map((t) => t.key));
    for (const [type, topic] of Object.entries(TYPE_TO_TOPIC)) {
      expect(keys.has(topic), `${type} → ${topic}`).toBe(true);
    }
  });

  it("ຖ້ຽວ 3 ແບບເຂົ້າ job_assigned, ສະຖານະ 3 ແບບເຂົ້າ job_status", () => {
    for (const t of ["job_created", "job_updated", "bills_added"]) {
      expect(topicForPushType(t)).toBe("job_assigned");
    }
    for (const t of ["job_approved", "job_closed", "job_deleted"]) {
      expect(topicForPushType(t)).toBe("job_status");
    }
  });

  it("ແຊັດສອງແບບເຂົ້າປະເພດດຽວກັນ", () => {
    expect(topicForPushType("dm")).toBe("chat");
    expect(topicForPushType("chatter")).toBe("chat");
  });

  it("push_test ຕ້ອງບໍ່ຖືກກັ່ນຕອງ", () => {
    // ປຸ່ມທົດສອບມີໄວ້ວິນິດໄສ — ຖ້າການຕັ້ງຄ່າບລັອກມັນງຽບໆ ຈະຫຼົງທາງໜັກກວ່າເກົ່າ.
    expect(topicForPushType("push_test")).toBeNull();
  });

  it("ປະເພດທີ່ບໍ່ຮູ້ຈັກ ປ່ອຍຜ່ານ (null) ບໍ່ແມ່ນຖືກບລັອກ", () => {
    // push ໃໝ່ທີ່ລືມມາເພີ່ມໃນຕາຕະລາງ ຄວນຍັງສົ່ງໄດ້ ບໍ່ແມ່ນຫາຍໄປ.
    expect(topicForPushType("brand_new_type")).toBeNull();
    expect(topicForPushType(undefined)).toBeNull();
    expect(topicForPushType("")).toBeNull();
  });
});

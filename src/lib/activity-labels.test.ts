import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const feed = require("./activity-labels.js");

const { describeActivity, ACTION_LABELS, NEVER_NOTIFY } = feed as {
  describeActivity: (i: {
    action: string;
    entityType?: string;
    entityId?: string;
    actorName?: string;
  }) => { title: string; body: string };
  ACTION_LABELS: Record<string, string>;
  NEVER_NOTIFY: Set<string>;
};

describe("ກັນວົນຊ້ຳບໍ່ຮູ້ຈົບ", () => {
  it("push.sent ຕ້ອງບໍ່ຖືກແຈ້ງເຕືອນຕໍ່", () => {
    // pushToDriver ບັນທຶກ audit ຊື່ push.sent → ຖ້າແຈ້ງເຕືອນມັນນຳ ຈະເປັນ
    // ແຈ້ງ → push → audit → ແຈ້ງ … ຍິງ FCM ບໍ່ຢຸດ ແລະ ຄ່າໃຊ້ຈ່າຍບານປາຍ.
    expect(NEVER_NOTIFY.has("push.sent")).toBe(true);
  });

  it("ການເຂົ້າ/ອອກລະບົບບໍ່ຄວນລົບກວນຜູ້ຈັດການ", () => {
    expect(NEVER_NOTIFY.has("auth.login")).toBe(true);
    expect(NEVER_NOTIFY.has("auth.logout")).toBe(true);
    expect(NEVER_NOTIFY.has("auth.login_failed")).toBe(true);
  });
});

describe("ຂໍ້ຄວາມທີ່ຜູ້ຈັດການເຫັນ", () => {
  it("ແປຊື່ action ເປັນພາສາລາວ ບໍ່ແມ່ນ code ດິບ", () => {
    const { title } = describeActivity({
      action: "pending_bill.schedule_update",
      entityType: "bill",
      entityId: "IV2601-001",
      actorName: "ພູມີພົນ",
    });
    expect(title).toContain("ແກ້ໄຂວັນນັດຈັດສົ່ງ");
    expect(title).not.toContain("pending_bill");
  });

  it("ບອກວ່າໃຜເຮັດ ແລະ ເຮັດກັບອັນໃດ ເປັນພາສາລາວ", () => {
    const { body } = describeActivity({
      action: "bill.update_transport",
      entityType: "bill",
      entityId: "IV2601-002",
      actorName: "ພູມີພົນ",
    });
    expect(body).toBe("ພູມີພົນ — ບິນ IV2601-002");
  });

  it("ບໍ່ມີຊະນິດຂໍ້ມູນ ກໍ່ບໍ່ເກີດຊ່ອງຫວ່າງຄູ່", () => {
    const { body } = describeActivity({
      action: "setting.update",
      entityId: "app.mobile.min_version",
      actorName: "ພູມີພົນ",
    });
    expect(body).toBe("ພູມີພົນ — app.mobile.min_version");
    expect(body).not.toContain("  ");
  });

  it("ບໍ່ຮູ້ຊື່ຜູ້ເຮັດກໍ່ຍັງອ່ານໄດ້", () => {
    const { body } = describeActivity({ action: "setting.update" });
    expect(body).toBe("ພະນັກງານ");
  });

  it("action ທີ່ຍັງບໍ່ມີຄຳແປ ຄືນ action ເດີມ ບໍ່ແມ່ນ undefined", () => {
    const { title } = describeActivity({ action: "brand_new.action" });
    expect(title).toContain("brand_new.action");
  });

  it("ທຸກ action ທີ່ຈະແຈ້ງເຕືອນຕ້ອງມີຄຳແປ", () => {
    // ລືມເພີ່ມຄຳແປ = ຫົວໜ້າໄດ້ຮັບ "pending_bill.bulk_update" ດິບໆ.
    const notified = Object.keys(ACTION_LABELS);
    for (const action of notified) {
      expect(NEVER_NOTIFY.has(action)).toBe(false);
      expect(ACTION_LABELS[action]).toMatch(/[ກ-ໝ]/);
    }
  });
});

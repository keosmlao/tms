import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  getLaoToday,
  getLaoTodayMonth,
  getLaoNowStamp,
  addDays,
  addMonths,
  startOfMonth,
} = require("./lao-date.js") as {
  getLaoToday: (now?: Date) => string;
  getLaoTodayMonth: (now?: Date) => string;
  getLaoNowStamp: (now?: Date) => string;
  addDays: (date: string | null | undefined, days: number) => string;
  addMonths: (date: string | null | undefined, months: number) => string;
  startOfMonth: (date: string | null | undefined) => string;
};

// ທຸກ case ໃສ່ເວລາຈິງ (UTC) ເຂົ້າໄປ ຈຶ່ງໃຫ້ຜົນດຽວກັນບໍ່ວ່າ CI ຈະຕັ້ງ TZ ໃດ.
describe("getLaoToday", () => {
  it("ອ່ານໂມງຝາຢູ່ລາວ (UTC+7) ບໍ່ແມ່ນ UTC", () => {
    // 18:30Z = 01:30 ຂອງມື້ຖັດໄປຢູ່ລາວ
    expect(getLaoToday(new Date("2026-08-04T18:30:00Z"))).toBe("2026-08-05");
  });

  it("ກ່ອນ 07:00 ຢູ່ລາວ ຍັງເປັນມື້ດຽວກັນ — ຈຸດທີ່ toISOString() ເຄີຍຜິດ", () => {
    // 00:30Z = 07:30 ຢູ່ລາວ ຂອງມື້ດຽວກັນ
    expect(getLaoToday(new Date("2026-08-05T00:30:00Z"))).toBe("2026-08-05");
    // 23:30Z = 06:30 ຂອງມື້ຖັດໄປຢູ່ລາວ — toISOString() ຈະຄືນ 08-04
    expect(getLaoToday(new Date("2026-08-04T23:30:00Z"))).toBe("2026-08-05");
  });

  it("ຂ້າມປີໄດ້ຖືກຕ້ອງ", () => {
    expect(getLaoToday(new Date("2025-12-31T17:00:00Z"))).toBe("2026-01-01");
  });

  it("ເດືອນ ຄືນ YYYY-MM", () => {
    expect(getLaoTodayMonth(new Date("2026-07-31T17:00:00Z"))).toBe("2026-08");
  });
});

describe("getLaoNowStamp", () => {
  it("ຮູບແບບດຽວກັບ LOCALTIMESTAMP(0)", () => {
    expect(getLaoNowStamp(new Date("2026-08-04T07:46:38Z"))).toBe("2026-08-04 14:46:38");
  });

  it("ທ່ຽງຄືນເປັນ 00 ບໍ່ແມ່ນ 24", () => {
    expect(getLaoNowStamp(new Date("2026-08-04T17:00:00Z"))).toBe("2026-08-05 00:00:00");
  });
});

describe("addDays", () => {
  it("ບວກ/ລົບມື້ ບໍ່ເລື່ອນວັນຕາມ TZ ຂອງເຄື່ອງ", () => {
    expect(addDays("2026-08-05", 1)).toBe("2026-08-06");
    expect(addDays("2026-08-05", -1)).toBe("2026-08-04");
    expect(addDays("2026-08-05", 0)).toBe("2026-08-05");
  });

  it("ຂ້າມເດືອນ ແລະ ປີ", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-08-05", -30)).toBe("2026-07-06");
  });

  it("ຄ່າທີ່ອ່ານບໍ່ໄດ້ ຄືນຄືເກົ່າ ບໍ່ພັງ", () => {
    expect(addDays("", 1)).toBe("");
    expect(addDays(null, 1)).toBe("");
    expect(addDays("ບໍ່ແມ່ນວັນທີ", 1)).toBe("ບໍ່ແມ່ນວັນທີ");
  });
});

describe("addMonths", () => {
  it("ຫາວັນທຳອິດຂອງເດືອນຖັດໄປ", () => {
    expect(addMonths("2026-08-01", 1)).toBe("2026-09-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("ມື້ທີ່ເກີນຄວາມຍາວເດືອນປາຍທາງຖືກຕັດ ບໍ່ລົ້ນໄປເດືອນຖັດໄປ", () => {
    // setMonth() ຈະໃຫ້ 03-03 — ອັນນີ້ໃຫ້ວັນສຸດທ້າຍຂອງເດືອນ 2
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("startOfMonth", () => {
  it("ຄືນວັນທຳອິດຂອງເດືອນ", () => {
    expect(startOfMonth("2026-08-27")).toBe("2026-08-01");
    expect(startOfMonth("2026-08")).toBe("2026-08-01");
  });
});

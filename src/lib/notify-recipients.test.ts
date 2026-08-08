import { describe, expect, it } from "vitest";

// CommonJS module shared with the query layer.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mergeRecipients } = require("./notify-recipients.js");

describe("mergeRecipients", () => {
  it("ຄົນທີ່ກົດເປີດເອງ ໄດ້ຮັບ ເຖິງວ່າບໍ່ກ່ຽວກັບຖ້ຽວນັ້ນ", () => {
    // ນີ້ຄືບັກທີ່ພົບຈິງ: ຜູ້ກົດເປີດ "ແຈ້ງສົ່ງສຳເລັດ" ທຸກຄົນໄດ້ 0 ລາຍການ
    // ເພາະຜູ້ຮັບຄິດຈາກງານຢ່າງດຽວ (ຜູ້ສ້າງຖ້ຽວ + ພະນັກງານສາຂາ).
    const out = mergeRecipients({
      candidates: ["7001"],
      optIns: ["25067"],
      excludeCode: "25004",
    });
    expect(out.sort()).toEqual(["25067", "7001"]);
  });

  it("ຄົນຂັບທີ່ຫາກໍ່ກົດສົ່ງ ບໍ່ໄດ້ຮັບຄືນ", () => {
    const out = mergeRecipients({
      candidates: ["7001", "25004"],
      optIns: [],
      excludeCode: "25004",
    });
    expect(out).toEqual(["7001"]);
  });

  it("ຍົກເວັ້ນ: ຄົນຂັບກົດເປີດເອງ → ໄດ້ຮັບ", () => {
    const out = mergeRecipients({
      candidates: ["7001"],
      optIns: ["25004"],
      excludeCode: "25004",
    });
    expect(out.sort()).toEqual(["25004", "7001"]);
  });

  it("ຕັດຊ້ຳ ແລະ ຊ່ອງຫວ່າງ", () => {
    const out = mergeRecipients({
      candidates: ["7001", " 7001 ", "", null],
      optIns: ["7001"],
    });
    expect(out).toEqual(["7001"]);
  });

  it("ບໍ່ມີໃຜ → ລາຍຊື່ຫວ່າງ (ຜູ້ເອີ້ນຂ້າມການສົ່ງ)", () => {
    expect(mergeRecipients({ candidates: [], optIns: [] })).toEqual([]);
  });
});

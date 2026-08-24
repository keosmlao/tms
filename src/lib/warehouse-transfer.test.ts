import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ໃບຂໍໂອນສິນຄ້າລະຫວ່າງສາງ ມາຈາກ ERP (ic_trans trans_flag 70/72) — TMS ບໍ່ໄດ້
// ສ້າງເອງ. ເອກະສານພວກນີ້ບໍ່ມີແຖວໃນ ic_trans_shipment ຈຶ່ງແຂນຫຼັກຂອງຄິວ
// ບິນລໍຈັດຖ້ຽວ (ທີ່ອ່ານຈາກ shipment ແລະ ກັ່ນຕອງ trans_flag=44) ເຫັນບໍ່ໄດ້ເລີຍ.
const billsSrc = readFileSync(join(process.cwd(), "src", "queries", "bills.js"), "utf8");
const reportsSrc = readFileSync(join(process.cwd(), "src", "queries", "reports.js"), "utf8");

describe("ໃບຂໍໂອນສິນຄ້າລະຫວ່າງສາງ ໃນຄິວ ບິນລໍຈັດຖ້ຽວ", () => {
  it("ອ່ານ ic_trans ໂດຍກົງ ບໍ່ຜ່ານ ic_trans_shipment", () => {
    expect(billsSrc).toContain("ERP_TRANSFER_SOURCE_TYPE");
    expect(billsSrc).toContain("FROM public.ic_trans t");
    expect(billsSrc).toContain("t.trans_flag IN (70, 72)");
  });

  it("ນັບແຕ່ 10/08/2026 ຂຶ້ນໄປ", () => {
    expect(billsSrc).toContain('const ERP_TRANSFER_MIN_DATE = "2026-08-10"');
  });

  // ໜຶ່ງໃບມີ 2 ແຖວ (flag 70 ໂອນອອກ / 72 ໂອນເຂົ້າ) ທີ່ມີ wh_from/wh_to ຄືກັນ.
  // ບໍ່ DISTINCT ຄິວຈະຂຶ້ນຊ້ຳ 2 ເທື່ອຕໍ່ໃບ.
  it("ກັນຂຶ້ນຊ້ຳດ້ວຍ DISTINCT ON (doc_no)", () => {
    expect(billsSrc).toContain("SELECT DISTINCT ON (t.doc_no)");
  });

  // ກຸ່ມສາງທີ່ຝ່າຍຂົນສົ່ງໃຊ້: 11xx ຂົວຫຼວງ · 12xx ດອນຕິ້ວ · 13xx ໂພນສະອາດ
  // · 14xx ປາກເຊ. 99xx (ສາງລະຫວ່າງທາງ) ບໍ່ແມ່ນສາງຈິງ ຈຶ່ງບໍ່ຢູ່ໃນນີ້.
  it("ຈັບກຸ່ມສາງເປັນ 4 ສາຂາ ດ້ວຍ 2 ໂຕໜ້າຂອງລະຫັດສາງ", () => {
    for (const [prefix, branch] of [
      ["'11'", "'02-0001'"],
      ["'12'", "'02-0002'"],
      ["'13'", "'02-0007'"],
      ["'14'", "'02-0003'"],
    ]) {
      expect(billsSrc).toContain(`WHEN ${prefix} THEN ${branch}`);
      // ບັນຊີເຄື່ອນໄຫວຕ້ອງໃຊ້ກຸ່ມດຽວກັນ ບໍ່ດັ່ງນັ້ນ ຄົງເຫຼືອ ຈະບໍ່ຕົງກັບຄິວ
      // (ວັດຕອນສ້າງ: ຄິວ 149 ແຕ່ບັນຊີໃຫ້ 95)
      expect(reportsSrc).toContain(`WHEN ${prefix} THEN ${branch}`);
    }
  });

  it("ເອົາສະເພາະດ້ານອອກ — ຈັດເຂົ້າຄິວຂອງສາຂາຕົ້ນທາງ", () => {
    // ສາຂາຄິດຈາກ wh_from (ສາງທີ່ລົດໄປຮັບເຄື່ອງ) ບໍ່ແມ່ນ wh_to
    expect(billsSrc).toContain("CASE left(t.wh_from, 2)");
    expect(billsSrc).not.toContain("CASE left(t.wh_to, 2)");
  });

  // ໃບຂໍໂອນບໍ່ມີລາຍການໃນຕາຕະລາງ ERP ທີ່ applyRemainingCounts ນັບ ຈຶ່ງ
  // count_item = 0 ສະເໝີ. ຖ້າຕົວກັ່ນຕອງໃດຕົກຫຼົ່ນ ໃບຈະຫາຍຈາກຄິວແບບງຽບໆ.
  it("ຜ່ານຕົວກັ່ນຕອງ 'ຈຳນວນຄົງເຫຼືອ' ຄົບທັງ 3 ບ່ອນ", () => {
    const hits = billsSrc.match(/source_type === ERP_TRANSFER_SOURCE_TYPE/g) ?? [];
    expect(hits.length).toBe(3);
  });
});

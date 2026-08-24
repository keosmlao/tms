import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ໃບຂໍໂອນສິນຄ້າລະຫວ່າງສາງ ມາຈາກ ERP (ic_trans trans_flag 70/72) — TMS ບໍ່ໄດ້
// ສ້າງເອງ. ເອກະສານພວກນີ້ບໍ່ມີແຖວໃນ ic_trans_shipment ຈຶ່ງແຂນຫຼັກຂອງຄິວ
// ບິນລໍຈັດຖ້ຽວ (ທີ່ອ່ານຈາກ shipment ແລະ ກັ່ນຕອງ trans_flag=44) ເຫັນບໍ່ໄດ້ເລີຍ.
const billsSrc = readFileSync(join(process.cwd(), "src", "queries", "bills.js"), "utf8");
const settingsSrc = readFileSync(
  join(process.cwd(), "src", "queries", "settings.js"),
  "utf8"
);
const reportsSrc = readFileSync(join(process.cwd(), "src", "queries", "reports.js"), "utf8");

describe("ໃບຂໍໂອນສິນຄ້າລະຫວ່າງສາງ ໃນຄິວ ບິນລໍຈັດຖ້ຽວ", () => {
  it("ອ່ານ ic_trans ໂດຍກົງ ບໍ່ຜ່ານ ic_trans_shipment", () => {
    expect(billsSrc).toContain("ERP_TRANSFER_SOURCE_TYPE");
    expect(billsSrc).toContain("FROM public.ic_trans t");
  });

  // FR (124) = ໃບຂໍໂອນ ມີສາງຕົ້ນທາງ/ປາຍທາງຈິງ.
  // FT (70/72) = ໃບໂອນ ເສັ້ນທາງຜ່ານ ສາງລະຫວ່າງທາງ (9903) ຈຶ່ງບອກປາຍທາງບໍ່ໄດ້.
  it("ໃຊ້ໃບຂໍໂອນ (flag 124) ບໍ່ແມ່ນໃບໂອນ (flag 70/72)", () => {
    expect(billsSrc).toContain("t.trans_flag = 124");
    expect(billsSrc).not.toContain("t.trans_flag IN (70, 72)");
  });

  it("ເອົາສະເພາະການຍ້າຍຂ້າມສາຂາ", () => {
    // ຍ້າຍພາຍໃນສາຂາດຽວກັນ ຫຼື ໄປ 99xx ບໍ່ຕ້ອງໃຊ້ລົດ
    expect(billsSrc).toContain("WAREHOUSE_BRANCH_TO_SQL} IS NOT NULL");
    expect(billsSrc).toContain("WAREHOUSE_BRANCH_TO_SQL} <> ${WAREHOUSE_BRANCH_SQL}");
  });

  it("ນັບແຕ່ 10/08/2026 ຂຶ້ນໄປ", () => {
    expect(billsSrc).toContain('const ERP_TRANSFER_MIN_DATE = "2026-08-10"');
  });

  // ວັດແລ້ວ FR ມີ 1 ແຖວຕໍ່ໃບ ແຕ່ຮັກສາ DISTINCT ໄວ້ເປັນປະກັນ — ຖ້າ ERP ເພີ່ມ
  // ແຖວຄູ່ພາຍຫຼັງ (ຄື FT ທີ່ມີ 70/72) ຄິວຈະບໍ່ຂຶ້ນຊ້ຳ.
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

  it("ຈັດເຂົ້າຄິວຂອງສາຂາຕົ້ນທາງ — ບ່ອນທີ່ລົດໄປຮັບເຄື່ອງ", () => {
    // ສາຂາເຈົ້າຂອງແຖວຄິດຈາກ wh_from; wh_to ໃຊ້ແຕ່ຕັດການຍ້າຍພາຍໃນສາຂາ
    expect(billsSrc).toContain('const WAREHOUSE_BRANCH_SQL = warehouseBranchSql("t.wh_from")');
    expect(billsSrc).toContain('const WAREHOUSE_BRANCH_TO_SQL = warehouseBranchSql("t.wh_to")');
    expect(billsSrc).toContain("${WAREHOUSE_BRANCH_SQL}, '') as transport_code");
  });

  // ໃບຂໍໂອນບໍ່ມີລາຍການໃນຕາຕະລາງ ERP ທີ່ applyRemainingCounts ນັບ ຈຶ່ງ
  // count_item = 0 ສະເໝີ. ຖ້າຕົວກັ່ນຕອງໃດຕົກຫຼົ່ນ ໃບຈະຫາຍຈາກຄິວແບບງຽບໆ.
  // ຜູ້ໃຊ້ຂໍໃຫ້ເປີດ/ປິດໄດ້ຈາກໜ້າຕັ້ງຄ່າ. ສອງເລື່ອງທີ່ພັງງ່າຍ: (1) ປິດແລ້ວ
  // return ໄວຈົນແຂນອື່ນ (ບິນແຍກສາຂາ / ບໍລິການ) ຫາຍໄປນຳ, (2) ບໍ່ໄດ້ຕັ້ງ
  // ຄ່າແລ້ວກາຍເປັນປິດ ເຮັດໃຫ້ຄິວຂອງທຸກຄົນປ່ຽນເອງໂດຍບໍ່ມີໃຜສັ່ງ.
  it("ເປີດ/ປິດໄດ້ຈາກຕັ້ງຄ່າ ແລະ ບໍ່ໄດ້ຕັ້ງ = ເປີດ", () => {
    expect(billsSrc).toContain(
      'const ERP_TRANSFER_SETTING_KEY = "pending.erp_transfer_enabled"'
    );
    expect(billsSrc).toContain('getSetting(ERP_TRANSFER_SETTING_KEY, "1")');
    expect(billsSrc).toContain('!== "0"');
  });

  it("ປິດແລ້ວຂ້າມສະເພາະ query ຂອງໃບຂໍໂອນ ບໍ່ແມ່ນ return ໄວ", () => {
    expect(billsSrc).toContain("const erpTransferRows = !(await erpTransferEnabled())");
    expect(billsSrc).toContain("? []");
  });

  // ຜູ້ໃຊ້ປິດສະວິດແລ້ວຍັງເຫັນໃບຂໍໂອນຢູ່ ເພາະຄິວ cache ໄວ້ 45 ວິນາທີ. ບັນທຶກ
  // ຄ່າຕັ້ງ `pending.*` ຕ້ອງລ້າງ cache ນັ້ນ ບໍ່ດັ່ງນັ້ນສະວິດເບິ່ງຄືບໍ່ເຮັດວຽກ.
  it("ບັນທຶກຄ່າ pending.* ແລ້ວລ້າງ cache ຂອງຄິວ", () => {
    expect(settingsSrc).toContain("invalidateDependentCaches");
    expect(settingsSrc).toContain('String(k).startsWith("pending.")');
    expect(settingsSrc).toContain('require("./helpers").invalidatePendingList()');
    // ຕ້ອງເອີ້ນທັງທາງບັນທຶກຄ່າດຽວ ແລະ ຫຼາຍຄ່າພ້ອມກັນ (ໜ້າຕັ້ງຄ່າໃຊ້ອັນຫຼັງ).
    const calls = settingsSrc.match(/invalidateDependentCaches\(/g) ?? [];
    expect(calls.length).toBe(3); // 1 ນິຍາມ + 2 ຈຸດເອີ້ນ
  });

  it("ຜ່ານຕົວກັ່ນຕອງ 'ຈຳນວນຄົງເຫຼືອ' ຄົບທັງ 3 ບ່ອນ", () => {
    const hits = billsSrc.match(/source_type === ERP_TRANSFER_SOURCE_TYPE/g) ?? [];
    expect(hits.length).toBe(3);
  });
});

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// helpers.js → lib/db.js ສ້າງ pg Pool ຕອນໂຫຼດ ແລະ ຕ້ອງການ env ຄົບ (ບໍ່ຕໍ່ DB
// ຈົນກວ່າຈະ query ຈິງ) — ຕັ້ງຄ່າຫຼອກໄວ້ພໍໃຫ້ require ຜ່ານ.
for (const key of ["PG_HOST", "PG_DATABASE", "PG_USER", "PG_HOST_B", "PG_DATABASE_B", "PG_USER_B"]) {
  process.env[key] = process.env[key] || "test";
}

const require = createRequire(import.meta.url);
const helpers = require("../queries/helpers.js") as {
  deliveryDueDateSql: (b: string, pb: string, t: string, d: string) => string;
  firstPromiseSql: (b: string) => string;
  branchFilterJob: (scope: { scoped: boolean; branchListSql: string }, alias: string) => string;
};

const QUERIES = join(process.cwd(), "src", "queries");
const read = (file: string) => readFileSync(join(QUERIES, file), "utf8");

// ໜ້າຈໍທີ່ສະແດງ "ອັດຕາສົ່ງທັນເວລາ" ດ້ວຍປ້າຍດຽວກັນ — ທັງໝົດຕ້ອງໃຊ້ສູດກາງ.
const ON_TIME_CONSUMERS = [
  "dashboard.js",
  "bi-dashboard.js",
  "driver-leaderboard.js",
  "kpi-alert.js",
];

describe("deliveryDueDateSql — ວັນນັດທີ່ໃຊ້ວັດ ສົ່ງທັນເວລາ", () => {
  it("ເອົານັດຄັ້ງທຳອິດຈາກປະຫວັດກ່ອນ ແລ້ວຄ່ອຍຖອຍໄປນັດປັດຈຸບັນ", () => {
    const sql = helpers.deliveryDueDateSql("d.bill_no", "pb", "t", "d");
    // ນັດຄັ້ງທຳອິດຕ້ອງມາກ່ອນ ບໍ່ດັ່ງນັ້ນບິນທີ່ເລື່ອນນັດຈະ "ທັນເວລາ" ຟຣີ
    expect(sql.indexOf("odg_tms_pending_bill_history")).toBeLessThan(
      sql.indexOf("pb.scheduled_date")
    );
    expect(sql).toContain("t.send_date::date");
    expect(sql).toContain("d.bill_date::date");
  });

  it("ຈັດລຳດັບປະຫວັດດ້ວຍ changed_at ແລ້ວເອົາແຖວທຳອິດ", () => {
    const sql = helpers.firstPromiseSql("d.bill_no");
    expect(sql).toContain("ORDER BY h.changed_at, h.id");
    expect(sql).toContain("LIMIT 1");
  });

  it.each(ON_TIME_CONSUMERS)("%s ບໍ່ຂຽນສູດວັນນັດຂອງຕົນເອງ", (file) => {
    const src = read(file);
    // ສູດເກົ່າທີ່ບໍ່ມີ "ນັດຄັ້ງທຳອິດ" — ໃຫ້ 96% ແທນ 91% ຈາກຂໍ້ມູນຊຸດດຽວກັນ
    expect(src).not.toContain("COALESCE(pb.scheduled_date::date, t.send_date::date");
    expect(src).toContain("deliveryDueDateSql");
  });
});

describe("branchFilterJob — ຂອບເຂດສາຂາຂອງລາຍງານ", () => {
  const scope = { scoped: true, branchListSql: "'02-0002'" };

  it("ຖື origin_transport_code ຂອງຖ້ຽວເປັນຫຼັກ ແລ້ວຄ່ອຍຖອຍໄປສາຂາຂອງບິນ", () => {
    const sql = helpers.branchFilterJob(scope, "a");
    expect(sql.indexOf("a.origin_transport_code")).toBeLessThan(sql.indexOf("ic_trans_shipment"));
    expect(sql).toContain("odg_tms_detail __dd");
  });

  it("ຜູ້ໃຊ້ທີ່ບໍ່ຜູກສາຂາ ບໍ່ຖືກກັ່ນຕອງ", () => {
    expect(helpers.branchFilterJob({ scoped: false, branchListSql: "" }, "a")).toBe("");
  });

  // ກົດເກົ່າ: ເບິ່ງແຕ່ສາຂາຂອງບິນ ບໍ່ເບິ່ງສາຂາຕົ້ນທາງຂອງຖ້ຽວ. ວັດ 2026-08 —
  // ໜ້າຫຼັກໄດ້ 1,381 ຈຸດສົ່ງ ໃນຂະນະທີ່ໜ້າ BI ໄດ້ 1,724 ຈາກຂໍ້ມູນຊຸດດຽວກັນ.
  it.each(["dashboard.js", "driver-leaderboard.js", "reports.js"])(
    "%s ບໍ່ຂຽນກົດສາຂາແບບເກົ່າຄືນ",
    (file) => {
      expect(read(file)).not.toContain("FROM ic_trans_shipment __ts");
    }
  );
});

describe('"ຖ້ຽວ" = ໃບງານທີ່ອະນຸມັດແລ້ວ', () => {
  // ລາຍງານສະຫຼຸບ (KPI) ຕ້ອງກັ່ນຕອງອະນຸມັດ. ລາຍງານປະຈຳວັນ / ຕາມຖ້ຽວ ເປັນລາຍການ
  // ປະຕິບັດງານ ຈຶ່ງສະແດງໃບທີ່ຍັງລໍອະນຸມັດ ແລະ ແຍກຕົວເລກໃຫ້ເຫັນແທນ.
  it("getReportMonthlyCar ແລະ getReportMonthlyDriver ນັບສະເພາະທີ່ອະນຸມັດແລ້ວ", () => {
    const src = read("reports.js");
    for (const fn of ["getReportMonthlyCar", "getReportMonthlyDriver"]) {
      const start = src.indexOf(`async function ${fn}(`);
      expect(start, `${fn} ຫາຍໄປ`).toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf("\n}", start));
      expect(body, fn).toContain("COALESCE(a.approve_status, 0) = 1");
      expect(body, fn).toContain("branchFilterJob(scope");
    }
  });

  it("ລາຍງານຕາມຖ້ຽວ ຄືນຈຳນວນທີ່ອະນຸມັດແລ້ວ ແລະ ທີ່ລໍອະນຸມັດ ແຍກກັນ", () => {
    const src = read("reports.js");
    expect(src).toContain("trips_approved");
    expect(src).toContain("trips_pending_approval");
  });

  it("ແອັບຝ່າຍຫົວໜ້າ ໃຊ້ນິຍາມດຽວກັບເວັບ", () => {
    const src = read("mobile.js");
    const start = src.indexOf("async function mobileManagerDashboard(");
    const body = src.slice(start, src.indexOf("\n}", start));
    expect(body).toContain("FILTER (WHERE COALESCE(t.approve_status,0) = 1)::int AS trips");
    expect(body).toContain("trips_pending_approval");
  });
});

describe("ບັນຊີເຄື່ອນໄຫວປະຈຳວັນ", () => {
  const src = read("reports.js");

  it("ມີແຂນທີສາມ ສຳລັບບິນຄ້າງທີ່ຍັງບໍ່ໄດ້ຈັດຖ້ຽວ", () => {
    // ບໍ່ມີແຂນນີ້ ຊ່ອງ ຄົງເຫຼືອ ຈະໜ້ອຍກວ່າໜ້າ /bills-pending (ວັດ: 40 ທຽບ 44)
    expect(src).toContain("function ledgerPendingOnlyArmSql(");
    const arms = src.match(/ledgerPendingOnlyArmSql\(/g) ?? [];
    expect(arms.length).toBeGreaterThanOrEqual(4); // 1 ນິຍາມ + 3 ບ່ອນທີ່ໃຊ້
  });

  it("ບິນຄ້າງທີ່ຍັງບໍ່ມີແຖວສິນຄ້າ ບໍ່ຖືກຕັດອອກ", () => {
    expect(src).toContain("WHERE net_total > 0 OR is_outstanding");
    expect(src).not.toMatch(/FROM calc\s+WHERE net_total > 0\s+\)/);
  });

  it("ນັບບິນທະຍອຍສົ່ງດ້ວຍ COALESCE ບໍ່ແມ່ນ NOT ລ້າໆ", () => {
    // completion_date ເປັນ NULL ⇒ is_delivered ເປັນ NULL ⇒ NOT NULL ຍັງ NULL
    // ແລ້ວ FILTER ຕັດອອກໝົດ ຈົນໄດ້ 0 ຕະຫຼອດ
    expect(src).toContain("COALESCE(is_delivered, false) = false AND sent_units > 0");
    expect(src).not.toContain("WHERE NOT is_delivered AND sent_units > 0");
  });

  it("ຫຍໍ້ຈຳນວນສິນຄ້າບໍ່ໃຫ້ເກີນຈຳນວນໃນບິນ", () => {
    // ບິນທີ່ຂຶ້ນຫຼາຍຖ້ຽວມີແຖວສິນຄ້າເຕັມໃບທຸກຖ້ຽວ — ບວກກົງໆເກີນ 194,085 ອັນ/ປີ
    expect(src).toContain("COALESCE(du.units_all, 0) >");
  });
});

describe("ລາຍງານບໍລິຫານການຈັດສົ່ງ ໃຊ້ບັນຊີກາງອັນດຽວ", () => {
  const src = read("reports.js");

  it("ລາຍງານປະຈຳເດືອນ ດຶງ ຍົກມາ/ເປີດ/ສົ່ງ/ຍົກໄປ ຈາກ getDeliveryPerformance", () => {
    const start = src.indexOf("async function getReportMonthlyDelivery(");
    const body = src.slice(start, src.indexOf("async function getMonthlyDeliveryKpi("));
    // ກ່ອນນີ້ຄິດເອງ ຈຶ່ງໃຫ້ 1,604 / 1,598 ໃນຂະນະທີ່ໜ້າ ປະສິດທິພາບການຈັດສົ່ງ
    // ໃຫ້ 1,882 / 1,896 ໃນເດືອນດຽວກັນ
    expect(body).toContain("getDeliveryPerformance(session, monthly)");
    expect(body).toContain("LEDGER_KEYS");
    for (const key of ["carry_in", "opened", "delivered", "carry_out"]) {
      expect(body).toContain(`"${key}"`);
    }
  });

  it("ກຣາຟລາຍວັນ ດຶງຈາກບັນຊີກາງ ບໍ່ໄດ້ຄິດເອງ", () => {
    const start = src.indexOf("async function getReportMonthlyDelivery(");
    const body = src.slice(start, src.indexOf("async function getMonthlyDeliveryKpi("));
    // ຄິດເອງດ້ວຍ query ຕ່າງຫາກ ⇒ ກຣາຟກັບບັດຢູ່ໜ້າດຽວກັນບໍ່ຕົງ (1,609 ທຽບ 1,887)
    expect(body).toContain("(await perfPromise).daily");
    expect(body).not.toContain("const dailyRows = await query(");
  });

  it("ບັນຊີກາງ ຄືນຊຸດລາຍວັນອອກມານຳ", () => {
    const start = src.indexOf("async function getDeliveryPerformance(");
    const body = src.slice(start, src.indexOf("\nmodule.exports", start));
    expect(body).toContain("(opened_day)");
    expect(body).toContain('r.dimension === "day"');
  });

  it("ພະແນກມາຈາກທະບຽນ TMS ບ່ອນດຽວກັບລາຍງານອື່ນ", () => {
    const start = src.indexOf("async function getReportMonthlyDelivery(");
    const body = src.slice(start, src.indexOf("async function getMonthlyDeliveryKpi("));
    // erp_user / erp_department_list ໃຫ້ຊື່ພະແນກອີກຊຸດໜຶ່ງ ("ຂາຍສົ່ງປະປາ" ທຽບ
    // "ພະແນກຂາຍສົ່ງປະປາ") ແລ້ວຈັບຄູ່ກັບໜ້າອື່ນບໍ່ໄດ້
    expect(body).toContain("public.odg_employee");
    expect(body).toContain("public.odg_department");
    expect(body).not.toContain("erp_user sale_u");
    expect(body).not.toContain("erp_department_list dep");
  });
});

describe("ລາຍງານຕາມບິນ ບໍ່ດຶງຮູບ", () => {
  it("ບໍ່ມີ url_img / sight_img / delivery_images ໃນ getReportByBill", () => {
    const src = read("reports.js");
    const start = src.indexOf("async function getReportByBill(");
    const body = src.slice(start, src.indexOf("\n}", start));
    // ຮູບເປັນ base64 — 27 MB ຕໍ່ວັນ ແລະ ລົ້ມ JSON.stringify ເມື່ອເລືອກເປັນເດືອນ
    expect(body).not.toContain("url_img");
    expect(body).not.toContain("sight_img");
    expect(body).not.toContain("delivery_images");
  });
});

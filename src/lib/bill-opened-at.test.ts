import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// helpers.js → lib/db.js ສ້າງ pg Pool ຕອນໂຫຼດ ແລະ ຕ້ອງການ env ຄົບ (ບໍ່ຕໍ່ DB
// ຈົນກວ່າຈະ query ຈິງ) — ຕັ້ງຄ່າຫຼອກໄວ້ພໍໃຫ້ require ຜ່ານ.
for (const key of ["PG_HOST", "PG_DATABASE", "PG_USER", "PG_HOST_B", "PG_DATABASE_B", "PG_USER_B"]) {
  process.env[key] = process.env[key] || "test";
}

const require = createRequire(import.meta.url);
const { billOpenedAtSql } = require("../queries/helpers.js") as {
  billOpenedAtSql: (icAlias: string, fallbackSql?: string) => string;
};

describe("billOpenedAtSql", () => {
  it("ໃຊ້ doc_date + doc_time ເປັນເວລາເປີດບິນ", () => {
    const sql = billOpenedAtSql("t");
    expect(sql).toContain("t.doc_date + t.doc_time::time");
    expect(sql).toContain("t.doc_time ~ '^[0-9]{1,2}:[0-9]{2}'");
  });

  it("ບໍ່ແຕະ create_date_time_now ເລີຍ", () => {
    // ຄໍລຳນັ້ນຢູ່ ic_trans / ic_trans_shipment ເປັນ UTC — ຖ້າກັບໄປໃຊ້ມັນ
    // ເວລາເປີດບິນຈະຊ້າ 7 ຊົ່ວໂມງ ແລະ ອາຍຸບິນຈະເກີນຈິງ ໂດຍບໍ່ມີໃຜເຫັນ
    expect(billOpenedAtSql("t")).not.toContain("create_date_time_now");
    expect(billOpenedAtSql("b", "a.doc_date::timestamp")).not.toContain("create_date_time_now");
  });

  it("ບິນທີ່ບໍ່ມີ doc_time ຕົກມາໃຊ້ doc_date", () => {
    expect(billOpenedAtSql("t")).toContain("t.doc_date IS NOT NULL THEN t.doc_date::timestamp");
  });

  it("ຮັບ fallback ຕອນບໍ່ມີແຖວ ic_trans ເລີຍ", () => {
    expect(billOpenedAtSql("t", "s.doc_date::timestamp")).toContain("ELSE s.doc_date::timestamp");
    expect(billOpenedAtSql("t")).toContain("ELSE NULL::timestamp");
  });

  it("ໃສ່ວົງເລັບຄົບ ຈຶ່ງເອົາໄປວາງໃນ expression ອື່ນໄດ້", () => {
    const sql = billOpenedAtSql("t").trim();
    expect(sql.startsWith("(")).toBe(true);
    expect(sql.endsWith(")")).toBe(true);
  });
});

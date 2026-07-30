import { describe, expect, it } from "vitest";
import { parsePackImport } from "./pack-import";

describe("parsePackImport", () => {
  it("reads a tab-separated paste from Excel with a Lao header", () => {
    const out = parsePackImport(
      [
        "ຕະກຸນ\tຂະໜາດ\tຫົວໜ່ວຍ\tຈຳນວນ\tກວ້າງ\tຍາວ\tສູງ\tນ້ຳໜັກ",
        "ຂໍ້ງໍບາງ\t2 ນີ້ວ\tຫີບ\t30\t40\t30\t25\t12.5",
        "ຂໍ້ງໍບາງ\t4 ນີ້ວ\tຫີບ\t10\t50\t40\t40\t18",
      ].join("\n")
    );
    expect(out.errors).toHaveLength(0);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      family: "ຂໍ້ງໍບາງ",
      sizeKey: "in:2",
      packUnit: "ຫີບ",
      packQty: 30,
      widthCm: 40,
      lengthCm: 30,
      heightCm: 25,
      weightKg: 12.5,
    });
    expect(out.rows[1].sizeKey).toBe("in:4");
  });

  it("reads an English header in any column order", () => {
    const out = parsePackImport(
      [
        "Size,Product,Width,Length,Height,Qty",
        '1/2",ຂໍ້ຕໍ່ຊື່ໜາ,30,22,18,120',
      ].join("\n")
    );
    expect(out.errors).toHaveLength(0);
    expect(out.rows[0]).toMatchObject({
      family: "ຂໍ້ຕໍ່ຊື່ໜາ",
      sizeKey: "in:0.5",
      widthCm: 30,
      lengthCm: 22,
      heightCm: 18,
      packQty: 120,
    });
  });

  it("falls back to the standard column order when there is no header", () => {
    const out = parsePackImport("ສາມຕາໜາ\t1/2\tຫີບ\t120\t35\t28\t20");
    expect(out.errors).toHaveLength(0);
    expect(out.rows[0]).toMatchObject({ family: "ສາມຕາໜາ", sizeKey: "in:0.5", packQty: 120 });
  });

  it("accepts comma-separated text", () => {
    const out = parsePackImport("ຂໍ້ງໍໜາ,3/4,ຫີບ,125,42,32,26");
    expect(out.rows[0]).toMatchObject({ sizeKey: "in:0.75", packQty: 125 });
  });

  it("accepts two-or-more-space separated text", () => {
    const out = parsePackImport("ຝາຄອບ   1/2   ຫີບ   220   28   20   16");
    expect(out.rows[0]).toMatchObject({ family: "ຝາຄອບ", packQty: 220 });
  });

  it("reads a compressed mixed fraction from the factory sheet", () => {
    const out = parsePackImport("ຂໍ້ງໍບາງ\t21/2\tຫີບ\t12\t45\t38\t30");
    expect(out.rows[0].sizeKey).toBe("in:2.5");
    expect(out.rows[0].sizeLabel).toBe('2 1/2"');
  });

  it("allows a row with no size — it becomes the all-sizes row", () => {
    const out = parsePackImport("ກາວໃສ 500g\t\tຫີບ\t12\t30\t22\t18");
    expect(out.errors).toHaveLength(0);
    expect(out.rows[0].sizeKey).toBeNull();
  });

  it("strips units and thousands separators from numbers", () => {
    const out = parsePackImport("ຂໍ້ງໍ\t2 ນີ້ວ\tຫີບ\t1,200\t40 cm\t30cm\t25 cm\t12.5 kg");
    expect(out.rows[0]).toMatchObject({ packQty: 1200, widthCm: 40, weightKg: 12.5 });
  });

  it("reports the line number when the box size is incomplete", () => {
    const out = parsePackImport(
      ["ຂໍ້ງໍບາງ\t2 ນີ້ວ\tຫີບ\t30\t40\t30\t25", "ຂໍ້ງໍບາງ\t3 ນີ້ວ\tຫີບ\t10\t\t\t"].join("\n")
    );
    expect(out.rows).toHaveLength(1);
    expect(out.errors[0]).toMatchObject({ line: 2, reason: "ຂະໜາດຫີບບໍ່ຄົບ (ກວ້າງ/ຍາວ/ສູງ)" });
  });

  it("reports an unreadable size instead of silently dropping the size", () => {
    const out = parsePackImport("ຂໍ້ງໍບາງ\tພິເສດ\tຫີບ\t30\t40\t30\t25");
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].reason).toContain("ອ່ານຂະໜາດ");
  });

  it("reports a bad pack count", () => {
    const out = parsePackImport("ຂໍ້ງໍບາງ\t2 ນີ້ວ\tຫີບ\t0\t40\t30\t25");
    expect(out.errors[0].reason).toContain("ຈຳນວນຕໍ່ຫີບ");
  });

  it("skips blank lines and tolerates empty input", () => {
    expect(parsePackImport("\n\n  \n").rows).toHaveLength(0);
    expect(parsePackImport("").errors).toHaveLength(0);
  });

  it("does not treat a data row as a header", () => {
    // ແຖວທຳອິດເປັນຂໍ້ມູນລ້ວນ — ຕ້ອງບໍ່ຖືກກິນເປັນຫົວຕາຕະລາງ
    const out = parsePackImport("ຂໍ້ງໍບາງ\t2 ນີ້ວ\tຫີບ\t30\t40\t30\t25");
    expect(out.rows).toHaveLength(1);
  });
});

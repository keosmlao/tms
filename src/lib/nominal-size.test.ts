import { describe, expect, it } from "vitest";
import {
  inchLabel,
  parseNominalSize,
  parsePackClause,
  parseSizePair,
  stripClassTokens,
} from "./nominal-size";

// ຊື່ທຸກອັນຢູ່ນີ້ແມ່ນຊື່ຈິງຈາກ odg_tms_detail_item (ຖ້ຽວ 90 ວັນ)

describe("parsePackClause", () => {
  it("reads ມັດ with spaces", () => {
    const out = parsePackClause("ທໍ່ PVC ສີເຫຼືອງກາຊ້າງ ຂະໜາດ 1/2 1ມັດ= 25 ເສັ້ນ");
    expect(out.packQty).toBe(25);
    expect(out.packUnit).toBe("ມັດ");
  });

  it("reads ມັດ without spaces", () => {
    const out = parsePackClause("ທໍ່ຮ້ອຍສາຍໄຟສີຂາວ NPI ຊ້າງ 1/2 JIS 1ມັດ=25ເສັ້ນ");
    expect(out.packQty).toBe(25);
    expect(out.packUnit).toBe("ມັດ");
  });

  it("reads ຫີບ, ຖົງ and ກ່ອງ", () => {
    expect(parsePackClause("ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ").packQty).toBe(30);
    expect(parsePackClause("ກິບຮັດທໍ່ເຫຼັກ ຂະໜາດ 1/2 1ຖົງ= 500 ຕົວ").packUnit).toBe("ຖົງ");
    expect(parsePackClause("ແຮງເກີ້ ຂະໜາດ 1\" 1ກ່ອງ=300 ຕົວ")).toMatchObject({
      packQty: 300,
      packUnit: "ກ່ອງ",
    });
  });

  it("removes the clause so its leading 1 cannot be read as a size", () => {
    const out = parsePackClause("ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 8.5 1ມັດ= 10 ເສັ້ນ");
    expect(out.rest).not.toContain("ມັດ");
  });

  it("leaves names without a pack clause alone", () => {
    const name = "ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 8.5";
    expect(parsePackClause(name)).toMatchObject({ packQty: null, rest: name });
  });
});

describe("stripClassTokens", () => {
  it("removes ຊັ້ນ, PN and standard names", () => {
    expect(stripClassTokens("ຂະໜາດ 1/2 ຊັ້ນ 13.5")).not.toContain("13.5");
    expect(stripClassTokens("PPR PN20 ຂະໜາດ 25MM")).not.toContain("PN20");
    expect(stripClassTokens("NPI ຊ້າງ 20 BS")).not.toContain("BS");
  });
});

describe("inchLabel", () => {
  it("renders whole and mixed sizes the way shops write them", () => {
    expect(inchLabel(4)).toBe('4"');
    expect(inchLabel(0.5)).toBe('1/2"');
    expect(inchLabel(1.25)).toBe('1 1/4"');
    expect(inchLabel(2.5)).toBe('2 1/2"');
    expect(inchLabel(1.125)).toBe('1 1/8"');
  });
});

describe("parseNominalSize", () => {
  it("reads plain fractions", () => {
    expect(parseNominalSize("ຂະໜາດ 1/2")).toMatchObject({ sizeKey: "in:0.5", label: '1/2"' });
    expect(parseNominalSize("ຂະໜາດ 3/8")).toMatchObject({ sizeKey: "in:0.375" });
  });

  it("reads mixed fractions", () => {
    expect(parseNominalSize("ຂະໜາດ 1 1/4")).toMatchObject({ sizeKey: "in:1.25" });
    expect(parseNominalSize("ຂະໜາດ 1 1/2")).toMatchObject({ sizeKey: "in:1.5" });
  });

  it("reads whole inches with and without the ນີ້ວ word", () => {
    expect(parseNominalSize("ຂະໜາດ 4 ນີ້ວ")).toMatchObject({ sizeKey: "in:4", label: '4"' });
    expect(parseNominalSize("ຂະໜາດ 2")).toMatchObject({ sizeKey: "in:2" });
    expect(parseNominalSize('ຂະໜາດ 4"')).toMatchObject({ sizeKey: "in:4" });
  });

  it("reads metric PPR sizes and reports the inch equivalent", () => {
    const out = parseNominalSize("ຂະໜາດ 25MM")!;
    expect(out.sizeKey).toBe("mm:25");
    expect(out.label).toBe("25 mm");
    expect(out.inches).toBeCloseTo(25 / 25.4, 4);
  });

  it("reads compressed mixed fractions the way pipe shops write them", () => {
    // "21/2" ໝາຍ 2 1/2 ບໍ່ແມ່ນ 10.5 — ຂະໜາດບໍ່ເຄີຍເປັນເສດເກີນ
    expect(parseNominalSize("ຂະໜາດ 21/2")).toMatchObject({ sizeKey: "in:2.5", label: '2 1/2"' });
    expect(parseNominalSize("ຂະໜາດ 11/4")).toMatchObject({ sizeKey: "in:1.25" });
    expect(parseNominalSize("ຂະໜາດ 11/2")).toMatchObject({ sizeKey: "in:1.5" });
    // 11/8 ເປັນເສດເກີນໄດ້ພໍດີ (1.375) ແຕ່ຄວາມໝາຍແທ້ແມ່ນ 1 1/8
    expect(parseNominalSize("LHCT 11/8L")).toMatchObject({ sizeKey: "in:1.125", label: '1 1/8"' });
    expect(parseNominalSize("LHCT 13/8L")).toMatchObject({ sizeKey: "in:1.375" });
  });

  it("still reads proper fractions as themselves", () => {
    expect(parseNominalSize("LHCT 7/8L")).toMatchObject({ sizeKey: "in:0.875" });
    expect(parseNominalSize("LHCT 5/8L")).toMatchObject({ sizeKey: "in:0.625" });
  });

  it("reads a bare metric size on BS-standard conduit", () => {
    expect(parseNominalSize("NPI ຊ້າງ 20")).toMatchObject({ sizeKey: "mm:20" });
    expect(parseNominalSize("NPI ຊ້າງ 16")).toMatchObject({ sizeKey: "mm:16" });
    expect(parseNominalSize("NPI ຊ້າງ 25")).toMatchObject({ sizeKey: "mm:25" });
  });

  it("rejects sizes that are not really sold", () => {
    // 13.5 ແມ່ນ "ຊັ້ນ" ບໍ່ແມ່ນຂະໜາດ — ຖ້າຜູ້ເອີ້ນລືມຕັດອອກ ກໍຕ້ອງບໍ່ຮັບ
    expect(parseNominalSize("ຂະໜາດ 13.5")).toBeNull();
    expect(parseNominalSize("ຂະໜາດ 7")).toBeNull();
    expect(parseNominalSize("ຂະໜາດ 99MM")).toBeNull();
  });
});

describe("parseSizePair", () => {
  it("reads reducer sizes and puts the larger end first", () => {
    const out = parseSizePair("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ ຂະໜາດ 1 x1/2")!;
    expect(out.primary.sizeKey).toBe("in:1");
    expect(out.secondary?.sizeKey).toBe("in:0.5");
  });

  it("handles no space around the x", () => {
    const out = parseSizePair("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ ຂະໜາດ 3/4x1/2")!;
    expect(out.primary.sizeKey).toBe("in:0.75");
    expect(out.secondary?.sizeKey).toBe("in:0.5");
  });

  it("handles no space after ຂະໜາດ", () => {
    const out = parseSizePair("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ ຂະໜາດ3 x2")!;
    expect(out.primary.sizeKey).toBe("in:3");
    expect(out.secondary?.sizeKey).toBe("in:2");
  });

  it("handles a compressed mixed fraction on one side", () => {
    const out = parseSizePair("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ 11/4x1/2")!;
    expect(out.primary.sizeKey).toBe("in:1.25");
    expect(out.secondary?.sizeKey).toBe("in:0.5");
  });

  it("handles mixed fractions on both sides", () => {
    const out = parseSizePair("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ ຂະໜາດ 1 1/2 x1 1/4")!;
    expect(out.primary.sizeKey).toBe("in:1.5");
    expect(out.secondary?.sizeKey).toBe("in:1.25");
  });

  it("orders by size, not by which side was written first", () => {
    const out = parseSizePair("ຂະໜາດ 1/2 x 2")!;
    expect(out.primary.sizeKey).toBe("in:2");
    expect(out.secondary?.sizeKey).toBe("in:0.5");
  });

  it("falls back to the readable side when one side is unparseable", () => {
    const out = parseSizePair("ຂະໜາດ 2 x ພິເສດ")!;
    expect(out.primary.sizeKey).toBe("in:2");
    expect(out.secondary).toBeNull();
  });

  it("reads a single size when there is no pair", () => {
    const out = parseSizePair("ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ")!;
    expect(out.primary.sizeKey).toBe("in:2");
    expect(out.secondary).toBeNull();
  });

  it("returns null when nothing is readable", () => {
    expect(parseSizePair("ບໍ່ມີຂະໜາດເລີຍ")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { estimatePieceM3, makeMatchKey, parseFamily, parseItemPack } from "./item-pack";

// ຊື່ທຸກອັນຢູ່ນີ້ແມ່ນຊື່ຈິງຈາກ odg_tms_detail_item (ຖ້ຽວ 90 ວັນ)

describe("parseFamily", () => {
  it("takes the text before ຂະໜາດ", () => {
    expect(parseFamily("ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ")).toBe("ຂໍ້ງໍບາງ");
    expect(parseFamily("ສາມຕາໜາ ຊ້າງ ຂະໜາດ 1/2  1ຫີບ= 120 ຕົວ")).toBe("ສາມຕາໜາ");
  });

  it("collapses repeated whitespace", () => {
    expect(parseFamily("ຂໍ້ຕໍ່ຊື່ໜາ    ຂະໜາດ 2")).toBe("ຂໍ້ຕໍ່ຊື່ໜາ");
  });

  it("keeps the whole name for single-size goods with no ຂະໜາດ", () => {
    expect(parseFamily("ກາວໃສກາຊ້າງ 500g 1ຫີບ= 12 ປ໋ອງ")).toBe("ກາວໃສກາຊ້າງ 500g");
  });

  it("drops the pack clause so it never lands in the family", () => {
    expect(parseFamily("ແຮງເກີ້ ຂະໜາດ 4\" 1ກ່ອງ= 60 ຕົວ")).toBe("ແຮງເກີ້");
  });

  it("groups the same fitting sold under different brand suffixes", () => {
    // ຊື່ຈິງມີທັງ "... ຂະໜາດ 1/2 1ກ່ອງ=120" ແລະ "... ຂະໜາດ 1/2 ກາຊ້າງ 1ຫີບ=150"
    expect(parseFamily("ຂໍ້ຕໍ່ເຂົ້າກ່ອງສີເຫຼືອງ ຂະໜາດ 1/2 1ກ່ອງ= 120 ຕົວ")).toBe(
      "ຂໍ້ຕໍ່ເຂົ້າກ່ອງສີເຫຼືອງ"
    );
  });

  it("handles empty input", () => {
    expect(parseFamily("")).toBe("");
    expect(parseFamily(null)).toBe("");
  });
});

describe("parseItemPack", () => {
  it("reads family, size and pack count together", () => {
    const out = parseItemPack("ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 30 ຕົວ");
    expect(out.family).toBe("ຂໍ້ງໍບາງ");
    expect(out.size?.sizeKey).toBe("in:2");
    expect(out.packQty).toBe(30);
    expect(out.packUnit).toBe("ຫີບ");
    expect(out.pieceUnit).toBe("ຕົວ");
    expect(out.matchKey).toBe("ຂໍ້ງໍບາງ|in:2");
  });

  it("reads a reducer's two sizes, larger first", () => {
    const out = parseItemPack("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ ຂະໜາດ 1 x1/2 1ຫີບ= 150 ຕົວ");
    expect(out.size?.sizeKey).toBe("in:1");
    expect(out.secondarySize?.sizeKey).toBe("in:0.5");
    expect(out.packQty).toBe(150);
  });

  it("reads a reducer written with no spaces at all", () => {
    const out = parseItemPack("ຂໍ້ຕໍ່ລົດໜາ ຊ້າງ 11/4x1/2 1ຫີບ= 20 ຕົວ");
    expect(out.size?.sizeKey).toBe("in:1.25");
    expect(out.secondarySize?.sizeKey).toBe("in:0.5");
  });

  it("reads ກ່ອງ as the pack unit", () => {
    const out = parseItemPack('ແຮງເກີ້ ຂະໜາດ 1" 1ກ່ອງ=300 ຕົວ');
    expect(out.packUnit).toBe("ກ່ອງ");
    expect(out.packQty).toBe(300);
    expect(out.size?.sizeKey).toBe("in:1");
  });

  it("reads ຖົງ as the pack unit", () => {
    const out = parseItemPack("ກິບຮັດທໍ່ເຫຼັກ ຂະໜາດ 1/2 1ຖົງ= 500 ຕົວ");
    expect(out.packUnit).toBe("ຖົງ");
    expect(out.packQty).toBe(500);
  });

  it("still keys single-size goods so they can be measured once", () => {
    const out = parseItemPack("ກາວໃສກາຊ້າງ 500g 1ຫີບ= 12 ປ໋ອງ");
    expect(out.size).toBeNull();
    expect(out.matchKey).toBe("ກາວໃສກາຊ້າງ 500g|*");
    expect(out.packQty).toBe(12);
    expect(out.pieceUnit).toBe("ປ໋ອງ");
  });

  it("does not read ຊັ້ນ as a size", () => {
    const out = parseItemPack("ຂໍ້ຕໍ່ພິເສດ ຂະໜາດ 2 ນີ້ວ ຊັ້ນ 13.5 1ຫີບ= 10 ຕົວ");
    expect(out.size?.sizeKey).toBe("in:2");
  });
});

describe("makeMatchKey", () => {
  it("uses * for goods with no size", () => {
    expect(makeMatchKey("ກາວ", null)).toBe("ກາວ|*");
    expect(makeMatchKey("ຂໍ້ງໍບາງ", "in:2")).toBe("ຂໍ້ງໍບາງ|in:2");
  });
});

describe("estimatePieceM3", () => {
  it("returns null with nothing measured — never guesses from zero", () => {
    expect(estimatePieceM3(2, [])).toBeNull();
    expect(estimatePieceM3(2, [{ inches: 0, pieceM3: 0 }])).toBeNull();
  });

  it("returns the measured value when the size is already measured", () => {
    const out = estimatePieceM3(2, [{ inches: 2, pieceM3: 0.0012 }])!;
    expect(out.pieceM3).toBeCloseTo(0.0012, 9);
    expect(out.exponent).toBe(0);
  });

  it("scales by the cube of size from a single measurement", () => {
    // ຮູບຊົງຄືກັນ → ປະລິມານ ∝ ຂະໜາດ³
    const out = estimatePieceM3(4, [{ inches: 2, pieceM3: 0.001 }])!;
    expect(out.exponent).toBe(3);
    expect(out.pieceM3).toBeCloseTo(0.008, 9);
    expect(out.basedOn).toBe(1);
  });

  it("fits the exponent from two or more measurements", () => {
    // ສ້າງຂໍ້ມູນທີ່ເປັນກຳລັງ 2.5 ພໍດີ — ຄວນຄືນເລກກຳລັງນັ້ນ
    const points = [
      { inches: 1, pieceM3: 1e-4 },
      { inches: 2, pieceM3: 1e-4 * 2 ** 2.5 },
      { inches: 4, pieceM3: 1e-4 * 4 ** 2.5 },
    ];
    const out = estimatePieceM3(3, points)!;
    expect(out.exponent).toBeCloseTo(2.5, 4);
    expect(out.pieceM3).toBeCloseTo(1e-4 * 3 ** 2.5, 10);
    expect(out.basedOn).toBe(3);
  });

  it("clamps a nonsensical fitted exponent into the physical range", () => {
    // ຂໍ້ມູນມົ້ວ: ຂະໜາດໃຫຍ່ຂຶ້ນແຕ່ປະລິມານຫຼຸດ → ກຳລັງຕິດລົບ
    const out = estimatePieceM3(3, [
      { inches: 1, pieceM3: 0.01 },
      { inches: 4, pieceM3: 0.001 },
    ])!;
    expect(out.exponent).toBe(1.5);
  });

  it("falls back to cube scaling when every point is the same size", () => {
    const out = estimatePieceM3(4, [
      { inches: 2, pieceM3: 0.001 },
      { inches: 2, pieceM3: 0.0011 },
    ])!;
    expect(out.exponent).toBe(3);
  });

  it("interpolates within a real ຂໍ້ງໍບາງ family shape", () => {
    // ວັດ 2 ຈຸດ (2" ແລະ 4") ແລ້ວຄາດຄະເນ 3" — ຕ້ອງຢູ່ລະຫວ່າງກາງ
    const out = estimatePieceM3(3, [
      { inches: 2, pieceM3: 0.0015 },
      { inches: 4, pieceM3: 0.009 },
    ])!;
    expect(out.pieceM3).toBeGreaterThan(0.0015);
    expect(out.pieceM3).toBeLessThan(0.009);
  });
});

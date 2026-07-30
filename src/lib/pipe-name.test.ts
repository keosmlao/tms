import { describe, expect, it } from "vitest";
import { parsePipeName, pipeM3 } from "./pipe-name";

// ຊື່ທຸກອັນຢູ່ນີ້ແມ່ນຊື່ຈິງຈາກ odg_tms_detail_item (ຖ້ຽວ 90 ວັນ)

describe("parsePipeName", () => {
  it("parses a bundled PVC pipe and strips the pressure class", () => {
    const out = parsePipeName("ທໍ່ PVC ຊ້າງ ຂະໜາດ 1/2 ຊັ້ນ 13.5  1ມັດ= 25 ເສັ້ນ");
    expect(out.kind).toBe("pipe");
    expect(out.sizeKey).toBe("in:0.5");
    expect(out.packQty).toBe(25);
  });

  it("does not mistake ຊັ້ນ 8.5 for the nominal size", () => {
    const out = parsePipeName("ທໍ່ PVC ຊ້າງ ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 8.5");
    expect(out.kind).toBe("pipe");
    expect(out.sizeKey).toBe("in:4");
    expect(out.packQty).toBeNull();
  });

  it("does not mistake ຊັ້ນ 5 for the nominal size", () => {
    const out = parsePipeName("ທໍ່ PVC OK ຂະໜາດ 4 ນີ້ວ ຊັ້ນ 5");
    expect(out.sizeKey).toBe("in:4");
  });

  it("handles a size with no ຂະໜາດ keyword", () => {
    const out = parsePipeName("ທໍ່ PVC NPI ເສືອ SCG 1/2 ຊັ້ນ 13.5 1ມັດ= 25 ເສັ້ນ");
    expect(out.kind).toBe("pipe");
    expect(out.sizeKey).toBe("in:0.5");
  });

  it("ignores the JIS token when sizing a conduit", () => {
    const out = parsePipeName("ທໍ່ຮ້ອຍສາຍໄຟສີຂາວ NPI ຊ້າງ 1/2 JIS 1ມັດ=25ເສັ້ນ");
    expect(out.kind).toBe("pipe");
    expect(out.sizeKey).toBe("in:0.5");
    expect(out.packQty).toBe(25);
  });

  it("ignores PN20 when sizing a PPR pipe", () => {
    const out = parsePipeName("ທໍ່ນ້ຳຮ້ອນ PPR ຊ້າງ PN20 ຂະໜາດ 25MM  1ມັດ= 25 ເສັ້ນ");
    expect(out.kind).toBe("pipe");
    expect(out.sizeKey).toBe("mm:25");
  });

  it("rejects pipe clamps — they are not pipes", () => {
    expect(parsePipeName("ກິບຮັດທໍ່ເຫຼັກ ຂະໜາດ 4  1ຖົງ= 100 ຕົວ").kind).toBe("not_pipe");
    expect(parsePipeName("ກິບຮັດທໍ່ຢາງ ຂະໜາດ 1/2 1ຖົງ= 100ຕົວ").kind).toBe("not_pipe");
  });

  it("rejects fittings", () => {
    expect(parsePipeName("ຂໍ້ງໍບາງ ຊ້າງ ຂະໜາດ 2 ນີ້ວ 1ຫີບ= 35 ຕົວ").kind).toBe("not_pipe");
    expect(parsePipeName("ສາມຕາໜາ ຊ້າງ ຂະໜາດ 1/2  1ຫີບ= 120 ຕົວ").kind).toBe("not_pipe");
  });

  it("refuses to guess a length for ທໍ່ສັ້ນ", () => {
    const out = parsePipeName('ທໍ່ສັ້ນຝາປິດກຽວ ຊ້າງ ຂະໜາດ 4" 1ຫີບ=8 ຕົວ');
    expect(out.kind).toBe("unknown");
    expect(out.sizeKey).toBe("in:4");
    expect(out.reason).toContain("ທໍ່ສັ້ນ");
  });

  it("uses the length the name states for a flexible conduit", () => {
    const out = parsePipeName("ທໍ່ອ່ອນຮ້ອຍສາຍໄຟສີເຫຼືອງ 3/8 ຍາວ20cm 1ຖົງ=100 ຕົວ");
    expect(out.kind).toBe("pipe_explicit_length");
    expect(out.explicitLengthM).toBeCloseTo(0.2, 6);
    expect(out.sizeKey).toBe("in:0.375");
  });

  it("returns unknown, not a guess, when the size is unreadable", () => {
    const out = parsePipeName("ທໍ່ PVC ພິເສດ ບໍ່ລະບຸຂະໜາດ");
    expect(out.kind).toBe("unknown");
    expect(out.sizeKey).toBeNull();
  });

  it("handles empty and null input", () => {
    expect(parsePipeName("").kind).toBe("not_pipe");
    expect(parsePipeName(null).kind).toBe("not_pipe");
    expect(parsePipeName(undefined).kind).toBe("not_pipe");
  });
});

describe("pipeM3", () => {
  it("uses the bounding box, not the cylinder volume", () => {
    // 4" ທໍ່ OD 114mm ຍາວ 4m: 0.114² × 4 × 0.9
    expect(pipeM3(114, 4, 0.9)).toBeCloseTo(0.0467856, 7);
    // ຖ້າໃຊ້ πr² ຈະໄດ້ພຽງ 0.0408 — ໜ້ອຍກວ່າທີ່ກິນທີ່ຈິງຕອນວາງຊ້ອນ
  });

  it("scales with the square of the diameter", () => {
    const half = pipeM3(21.5, 4)!;
    const four = pipeM3(114, 4)!;
    expect(four / half).toBeCloseTo((114 / 21.5) ** 2, 3);
  });

  it("defaults the packing factor to 0.9", () => {
    expect(pipeM3(114, 4)).toBeCloseTo(pipeM3(114, 4, 0.9)!, 9);
    expect(pipeM3(114, 4, null)).toBeCloseTo(pipeM3(114, 4, 0.9)!, 9);
  });

  it("returns null on missing or nonsensical inputs", () => {
    expect(pipeM3(null, 4)).toBeNull();
    expect(pipeM3(114, null)).toBeNull();
    expect(pipeM3(0, 4)).toBeNull();
    expect(pipeM3(-114, 4)).toBeNull();
    expect(pipeM3(114, 4, 0)).toBeNull();
    expect(pipeM3(114, 4, 1.5)).toBeNull();
  });
});

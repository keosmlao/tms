import { describe, expect, it } from "vitest";
import {
  isCodDocFormat,
  normalizePaymentMethod,
  paymentMethodLabel,
  toKip,
  codSettlementStatus,
  codVariance,
  validateCodCollection,
  summarizeTripCod,
  PAYMENT_METHODS,
  type CodBillRow,
} from "./cod";

describe("isCodDocFormat", () => {
  it("ຮັບທຸກຮູບແບບ COD* ທີ່ ERP ໃຊ້ຈິງ", () => {
    // erp_doc_format: CASH ON DELIVERY (PUMPING/ELECTRONIC/AIR/SPARE PART)
    for (const code of ["CODPB", "CODCE", "CODAC", "CODSP"]) {
      expect(isCodDocFormat(code)).toBe(true);
    }
  });

  it("ປະຕິເສດຂາຍສົດ / ຕິດໜີ້ / POS", () => {
    for (const code of ["CAK", "CAKSP", "CAHCE", "CAPPB", "INHPB", "INHCE", "INK", "SPOS"]) {
      expect(isCodDocFormat(code)).toBe(false);
    }
  });

  it("ຕັດຊ່ອງຫວ່າງ ແລະ ບໍ່ສົນຕົວພິມ", () => {
    expect(isCodDocFormat(" codpb ")).toBe(true);
    expect(isCodDocFormat("CoDcE")).toBe(true);
  });

  it("ຄ່າຫວ່າງ/null ບໍ່ແມ່ນ COD", () => {
    expect(isCodDocFormat("")).toBe(false);
    expect(isCodDocFormat(null)).toBe(false);
    expect(isCodDocFormat(undefined)).toBe(false);
  });
});

describe("normalizePaymentMethod", () => {
  it("ຮັບສະເພາະຄ່າໃນຊຸດ", () => {
    for (const m of PAYMENT_METHODS) expect(normalizePaymentMethod(m)).toBe(m);
    expect(normalizePaymentMethod(" CASH ")).toBe("cash");
  });

  it("ຄ່າແປກປອມ ຄືນ null (ບໍ່ໃຫ້ string ລອຍໆ ລົງ DB)", () => {
    expect(normalizePaymentMethod("bitcoin")).toBeNull();
    expect(normalizePaymentMethod("")).toBeNull();
    expect(normalizePaymentMethod(null)).toBeNull();
  });

  it("ມີຊື່ພາສາລາວໃຫ້ທຸກຄ່າ", () => {
    expect(paymentMethodLabel("cash")).toBe("ເງິນສົດ");
    expect(paymentMethodLabel("transfer")).toBe("ໂອນ");
    expect(paymentMethodLabel("nope")).toBe("");
  });
});

describe("toKip", () => {
  it("ປັດເປັນຈຳນວນເຕັມ (ຍອດ ERP ມີທົດນິຍົມ ເຊັ່ນ 47993.52)", () => {
    expect(toKip("47993.52")).toBe(47994);
    expect(toKip(4400)).toBe(4400);
    expect(toKip(null)).toBe(0);
    expect(toKip("abc")).toBe(0);
  });
});

describe("codSettlementStatus", () => {
  it("ບິນບໍ່ແມ່ນ COD → not_required", () => {
    expect(codSettlementStatus({ expected: 0, collected: null })).toBe("not_required");
  });

  it("ເປັນ COD ແຕ່ຍັງບໍ່ບັນທຶກ → pending", () => {
    expect(codSettlementStatus({ expected: 5000, collected: null })).toBe("pending");
    expect(codSettlementStatus({ expected: 5000, collected: "" })).toBe("pending");
  });

  it("ເກັບ 0 ບໍ່ແມ່ນ pending — ແມ່ນ short (ບັນທຶກແລ້ວວ່າບໍ່ໄດ້ເງິນ)", () => {
    expect(codSettlementStatus({ expected: 5000, collected: 0 })).toBe("short");
  });

  it("ຄົບ / ຂາດ / ເກີນ", () => {
    expect(codSettlementStatus({ expected: 5000, collected: 5000 })).toBe("exact");
    expect(codSettlementStatus({ expected: 5000, collected: 4000 })).toBe("short");
    expect(codSettlementStatus({ expected: 5000, collected: 6000 })).toBe("over");
  });

  it("ຕ່າງກັນ 1 ກີບ ຍັງຖືວ່າຄົບ (ປັດເສດຄົນລະທາງ)", () => {
    expect(codSettlementStatus({ expected: "47993.52", collected: 47993 })).toBe("exact");
    expect(codSettlementStatus({ expected: 5000, collected: 4998 })).toBe("short");
  });

  it("codVariance: ລົບ = ຂາດ, ບວກ = ເກີນ, ຍັງບໍ່ບັນທຶກ = 0", () => {
    expect(codVariance(5000, 4000)).toBe(-1000);
    expect(codVariance(5000, 6000)).toBe(1000);
    expect(codVariance(5000, null)).toBe(0);
  });
});

describe("validateCodCollection", () => {
  it("ບິນທຳມະດາ ບໍ່ມີເງິນຕິດມາ → ຜ່ານ ແລະ ລ້າງຄ່າໃຫ້ null", () => {
    const r = validateCodCollection({ codAmount: 0 });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      collected_amount: null,
      payment_method: null,
      status: "not_required",
    });
  });

  it("ບິນທຳມະດາ ແຕ່ແນບເງິນມາ → ປະຕິເສດ (ກັນກົດຜິດບິນ)", () => {
    const r = validateCodCollection({ codAmount: 0, collectedAmount: 5000, paymentMethod: "cash" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ບໍ່ແມ່ນບິນເກັບເງິນປາຍທາງ");
  });

  it("ບິນ COD ຕ້ອງມີຍອດ ແລະ ວິທີຊຳລະ", () => {
    expect(validateCodCollection({ codAmount: 5000 }).error).toContain("ຕ້ອງລະບຸຍອດເງິນ");
    expect(
      validateCodCollection({ codAmount: 5000, collectedAmount: 5000 }).error
    ).toContain("ວິທີຊຳລະ");
    expect(
      validateCodCollection({ codAmount: 5000, collectedAmount: 5000, paymentMethod: "gold" }).error
    ).toContain("ວິທີຊຳລະ");
  });

  it("ຍອດຕິດລົບ → ປະຕິເສດ", () => {
    const r = validateCodCollection({ codAmount: 5000, collectedAmount: -1, paymentMethod: "cash" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ຕິດລົບ");
  });

  it("ເລືອກ 'ບໍ່ໄດ້ເກັບ' ແຕ່ມີເງິນ → ປະຕິເສດ", () => {
    const r = validateCodCollection({ codAmount: 5000, collectedAmount: 5000, paymentMethod: "none" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ບໍ່ໄດ້ເກັບ");
  });

  it("ໂອນ / ປົນ ຕ້ອງມີເລກອ້າງອີງ", () => {
    for (const method of ["transfer", "mixed"]) {
      const bad = validateCodCollection({ codAmount: 5000, collectedAmount: 5000, paymentMethod: method });
      expect(bad.ok).toBe(false);
      expect(bad.error).toContain("ເລກອ້າງອີງ");
      const good = validateCodCollection({
        codAmount: 5000,
        collectedAmount: 5000,
        paymentMethod: method,
        reference: "TRX-99",
      });
      expect(good.ok).toBe(true);
      expect(good.value?.reference).toBe("TRX-99");
    }
  });

  it("ເງິນສົດບໍ່ຕ້ອງມີເລກອ້າງອີງ", () => {
    const r = validateCodCollection({ codAmount: 5000, collectedAmount: 5000, paymentMethod: "cash" });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ status: "exact", variance: 0, variance_reason: null });
  });

  it("ເກັບຂາດ/ເກີນ ຕ້ອງມີເຫດຜົນ ຈຶ່ງຜ່ານ", () => {
    const short = validateCodCollection({ codAmount: 5000, collectedAmount: 4000, paymentMethod: "cash" });
    expect(short.ok).toBe(false);
    expect(short.error).toContain("ເກັບຂາດ");
    expect(short.error).toContain("1,000");

    const over = validateCodCollection({ codAmount: 5000, collectedAmount: 6000, paymentMethod: "cash" });
    expect(over.ok).toBe(false);
    expect(over.error).toContain("ເກັບເກີນ");

    const withReason = validateCodCollection({
      codAmount: 5000,
      collectedAmount: 4000,
      paymentMethod: "cash",
      varianceReason: "ລູກຄ້າຈ່າຍບາງສ່ວນ",
    });
    expect(withReason.ok).toBe(true);
    expect(withReason.value).toMatchObject({ status: "short", variance: -1000 });
    expect(withReason.value?.variance_reason).toBe("ລູກຄ້າຈ່າຍບາງສ່ວນ");
  });

  it("ບໍ່ໄດ້ເກັບເລີຍ (0 ກີບ) ຕ້ອງມີເຫດຜົນ ແລະ ຜ່ານໄດ້ດ້ວຍ none", () => {
    const r = validateCodCollection({
      codAmount: 5000,
      collectedAmount: 0,
      paymentMethod: "none",
      varianceReason: "ລູກຄ້າຂໍຈ່າຍພາຍຫຼັງ",
    });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ status: "short", variance: -5000, payment_method: "none" });
  });
});

describe("summarizeTripCod", () => {
  const rows: CodBillRow[] = [
    { cod_amount: 5000, collected_amount: 5000, payment_method: "cash", status: 1 },
    { cod_amount: 10000, collected_amount: 10000, payment_method: "transfer", status: 1 },
    { cod_amount: 3000, collected_amount: 2000, payment_method: "cash", status: 1 }, // ຂາດ
    { cod_amount: 2000, collected_amount: null, status: 0 }, // ຍັງບໍ່ບັນທຶກ
    { cod_amount: 0, collected_amount: null, status: 1 }, // ບໍ່ແມ່ນ COD
    { cod_amount: 9000, collected_amount: null, status: 2 }, // ຍົກເລີກ → ບໍ່ນັບ
  ];

  it("ນັບສະເພາະບິນ COD ທີ່ບໍ່ຖືກຍົກເລີກ", () => {
    const s = summarizeTripCod(rows);
    expect(s.cod_bill_count).toBe(4);
    expect(s.expected_total).toBe(20000);
    expect(s.collected_total).toBe(17000);
    expect(s.pending_count).toBe(1);
    expect(s.short_count).toBe(1);
    expect(s.over_count).toBe(0);
    expect(s.variance_total).toBe(-1000);
  });

  it("ແຍກເງິນສົດ ກັບ ເງິນໂອນ (ສົດຄືສ່ວນທີ່ຕ້ອງມອບການເງິນ)", () => {
    const s = summarizeTripCod(rows);
    expect(s.cash_total).toBe(7000);
    expect(s.transfer_total).toBe(10000);
  });

  it("ບິນຍົກເລີກບໍ່ສ້າງໜີ້ໃຫ້ຄົນຂັບ", () => {
    const s = summarizeTripCod([{ cod_amount: 9000, collected_amount: null, status: 2 }]);
    expect(s).toMatchObject({ cod_bill_count: 0, expected_total: 0, pending_count: 0 });
  });

  it("ລາຍການຫວ່າງ / ບໍ່ແມ່ນ array", () => {
    expect(summarizeTripCod([])).toMatchObject({ cod_bill_count: 0, expected_total: 0 });
    expect(summarizeTripCod(undefined as never)).toMatchObject({ cod_bill_count: 0 });
  });
});

import { describe, expect, it } from "vitest";
import {
  FUEL_PAYMENT_TYPES,
  FUEL_PAYMENT_TYPE_CODES,
  fuelPaymentTypeLabel,
  normalizeFuelPaymentType,
} from "./fuel-payment-type";

describe("normalizeFuelPaymentType", () => {
  it("accepts every declared code", () => {
    for (const t of FUEL_PAYMENT_TYPES) {
      expect(normalizeFuelPaymentType(t.code)).toBe(t.code);
    }
  });

  it("trims and lowercases what a form posts", () => {
    expect(normalizeFuelPaymentType("  PTT_Voucher ")).toBe("ptt_voucher");
  });

  // ແອັບຮຸ່ນເກົ່າບໍ່ສົ່ງຖັນນີ້ມາ — ຕ້ອງເປັນ null ບໍ່ແມ່ນ error,
  // ບໍ່ດັ່ງນັ້ນການເຕີມທີ່ຖືກຕ້ອງຈະບັນທຶກບໍ່ໄດ້.
  it("maps missing or unknown values to null", () => {
    expect(normalizeFuelPaymentType(undefined)).toBeNull();
    expect(normalizeFuelPaymentType(null)).toBeNull();
    expect(normalizeFuelPaymentType("")).toBeNull();
    expect(normalizeFuelPaymentType("   ")).toBeNull();
    expect(normalizeFuelPaymentType("credit_card")).toBeNull();
    expect(normalizeFuelPaymentType(7)).toBeNull();
  });
});

describe("fuelPaymentTypeLabel", () => {
  it("returns the Lao label of a known code", () => {
    expect(fuelPaymentTypeLabel("cash")).toBe("ຈ່າຍເງິນສົດ");
    expect(fuelPaymentTypeLabel("fuel_pass")).toBe("ນ້ຳມັນພັສ");
    expect(fuelPaymentTypeLabel("odien_station")).toBe("ປ້ຳໂອດ້ຽນ");
  });

  // ທຸກ code ຕ້ອງມີ label ຂອງມັນເອງ — ຖ້າເພີ່ມ code ໃສ່ CODES ແຕ່ລືມໃສ່
  // FUEL_PAYMENT_TYPES ໜ້າຈໍຈະສະແດງ "-" ແທນຊື່ ໂດຍບໍ່ມີໃຜຮູ້.
  it("gives every declared code a label", () => {
    for (const code of FUEL_PAYMENT_TYPE_CODES) {
      expect(fuelPaymentTypeLabel(code)).not.toBe("-");
    }
    expect(FUEL_PAYMENT_TYPES.length).toBe(FUEL_PAYMENT_TYPE_CODES.length);
  });

  it("returns a dash for legacy rows with no type", () => {
    expect(fuelPaymentTypeLabel(null)).toBe("-");
    expect(fuelPaymentTypeLabel("nope")).toBe("-");
  });
});

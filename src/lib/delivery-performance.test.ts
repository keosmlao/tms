import { describe, expect, it } from "vitest";
import {
  EMPTY_PERF_BUCKET,
  deliveryPerfRates,
  formatLeadHours,
  jumpedRate,
  jumpedReadyRate,
  perfBalanceIsSound,
  perfPercent,
  type DeliveryPerfBucket,
} from "./delivery-performance";

// ຕົວເລກຈິງຂອງເດືອນ 07/2026 (ລວມ 3 ສາຂາ) ທີ່ດຶງມາຈາກຖານຂໍ້ມູນຕອນສ້າງລາຍງານ —
// ໃຊ້ເປັນ fixture ເພື່ອໃຫ້ການຄິດເປີເຊັນຖືກກວດກັບຮູບຮ່າງຂໍ້ມູນຈິງ ບໍ່ແມ່ນຄ່າສົມມຸດ.
const JULY: DeliveryPerfBucket = {
  carry_in: 136,
  opened: 2619,
  delivered: 2608,
  closed_other: 49,
  carry_out: 98,
  handled: 2755,
  from_open: { le_24h: 2019, h24_48: 360, gt_48h: 229 },
  from_schedule: { le_24h: 2544, h24_48: 50, gt_48h: 14, no_schedule: 0 },
  rescheduled_over_2: 3,
  jumped: { d1: 440, d3: 142, d7: 79 },
  jumped_ready: { d1: 397, d3: 101, d7: 43 },
  multi_leg_bills: 24,
  short_bills: 9,
  cancelled_bills: 54,
  cancelled_legs: 55,
  avg_lead_open_h: 28.91,
  median_lead_open_h: 17.97,
};

describe("perfPercent", () => {
  it("ຄິດເປີເຊັນປົກກະຕິ", () => {
    expect(perfPercent(1, 4)).toBe(25);
  });

  it("ຄືນ 0 ເມື່ອໂຕຫານເປັນ 0 ແທນທີ່ຈະເປັນ Infinity/NaN", () => {
    expect(perfPercent(5, 0)).toBe(0);
    expect(perfPercent(0, 0)).toBe(0);
  });

  it("ຄືນ 0 ເມື່ອຄ່າບໍ່ແມ່ນຕົວເລກທີ່ໃຊ້ໄດ້", () => {
    expect(perfPercent(Number.NaN, 10)).toBe(0);
    expect(perfPercent(1, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("perfBalanceIsSound", () => {
  it("ຍົກມາ + ເປີດໃໝ່ − ສຳເລັດ − ຫຼຸດອອກ = ຍົກໄປ", () => {
    expect(perfBalanceIsSound(JULY)).toBe(true);
    expect(perfBalanceIsSound(EMPTY_PERF_BUCKET)).toBe(true);
  });

  it("ຈັບໄດ້ເມື່ອຍອດບໍ່ສົມດຸນ", () => {
    expect(perfBalanceIsSound({ ...JULY, carry_out: 99 })).toBe(false);
  });

  it("ລືມນັບບິນທີ່ຫຼຸດອອກ ຖືວ່າບໍ່ສົມດຸນ", () => {
    expect(perfBalanceIsSound({ ...JULY, closed_other: 0 })).toBe(false);
  });
});

describe("deliveryPerfRates", () => {
  const rates = deliveryPerfRates(JULY);

  it("ຊັ້ນເວລານັບແຕ່ເປີດບິນ ບວກກັນໄດ້ 100%", () => {
    const sum = rates.openOnTimeRate + rates.open24to48Rate + rates.openOver48Rate;
    expect(sum).toBeCloseTo(100, 6);
    expect(rates.openOnTimeRate).toBeCloseTo(77.42, 2);
  });

  it("ຊັ້ນເວລານັບແຕ່ວັນນັດ ລວມກຸ່ມບໍ່ມີວັນນັດແລ້ວ ໄດ້ 100%", () => {
    const sum =
      rates.schedOnTimeRate +
      rates.sched24to48Rate +
      rates.schedOver48Rate +
      rates.schedUnknownRate;
    expect(sum).toBeCloseTo(100, 6);
  });

  it("ບິນທີ່ບໍ່ມີວັນນັດຢູ່ໃນໂຕຫານ ຈຶ່ງບໍ່ດັນອັດຕາທັນເວລາໃຫ້ສູງເກີນຈິງ", () => {
    const half = deliveryPerfRates({
      ...JULY,
      delivered: 100,
      from_schedule: { le_24h: 50, h24_48: 0, gt_48h: 0, no_schedule: 50 },
    });
    expect(half.schedOnTimeRate).toBe(50);
    expect(half.schedUnknownRate).toBe(50);
  });

  it("ອັດຕາຄຸນນະພາບໃຊ້ບິນທີ່ຢູ່ໃນມືເດືອນນີ້ເປັນໂຕຫານ", () => {
    expect(rates.cancelledRate).toBeCloseTo((54 / 2755) * 100, 6);
    expect(rates.multiLegRate).toBeCloseTo((24 / 2755) * 100, 6);
    expect(rates.rescheduledRate).toBeCloseTo((3 / 2755) * 100, 6);
    expect(rates.shortRate).toBeCloseTo((9 / 2755) * 100, 6);
  });

  it("ອັດຕາລັດຄິວ ໃຊ້ບິນທີ່ຢູ່ໃນມືເປັນໂຕຫານ ແລະ ເກນຍິ່ງກວ້າງຍິ່ງໜ້ອຍ", () => {
    expect(jumpedRate(JULY, "d1")).toBeCloseTo((440 / 2755) * 100, 6);
    expect(jumpedRate(JULY, "d3")).toBeCloseTo((142 / 2755) * 100, 6);
    expect(jumpedRate(JULY, "d7")).toBeCloseTo((79 / 2755) * 100, 6);
    // ເກນ N ໃຫຍ່ຂຶ້ນ ຕ້ອງກອງໄດ້ໜ້ອຍລົງສະເໝີ
    expect(jumpedRate(JULY, "d1")).toBeGreaterThan(jumpedRate(JULY, "d3"));
    expect(jumpedRate(JULY, "d3")).toBeGreaterThan(jumpedRate(JULY, "d7"));
  });

  it("ບິນ 'ພ້ອມສົ່ງແຕ່ຖືກຂ້າມ' ເປັນສ່ວນຍ່ອຍຂອງບິນລັດຄິວ", () => {
    for (const win of ["d1", "d3", "d7"] as const) {
      expect(JULY.jumped_ready[win]).toBeLessThanOrEqual(JULY.jumped[win]);
      expect(jumpedReadyRate(JULY, win)).toBeLessThanOrEqual(jumpedRate(JULY, win));
    }
  });

  it("ເດືອນທີ່ບໍ່ມີຂໍ້ມູນ ອັດຕາລັດຄິວເປັນ 0 ບໍ່ແມ່ນ NaN", () => {
    expect(jumpedRate(EMPTY_PERF_BUCKET, "d1")).toBe(0);
    expect(jumpedReadyRate(EMPTY_PERF_BUCKET, "d7")).toBe(0);
  });

  it("ຍອດອອກ 2 ທາງ ບວກກັບຍອດຍົກໄປ ໄດ້ 100% ຂອງບິນທີ່ຢູ່ໃນມື", () => {
    const sum = rates.deliveredRate + rates.closedOtherRate + rates.carryOutRate;
    expect(sum).toBeCloseTo(100, 6);
  });

  it("ເດືອນທີ່ບໍ່ມີຂໍ້ມູນ ຄືນ 0 ໝົດ ບໍ່ແມ່ນ NaN", () => {
    const empty = deliveryPerfRates(EMPTY_PERF_BUCKET);
    for (const value of Object.values(empty)) expect(value).toBe(0);
  });
});

describe("formatLeadHours", () => {
  it("ຕ່ຳກວ່າ 48 ຊົ່ວໂມງ ສະແດງເປັນຊົ່ວໂມງ", () => {
    expect(formatLeadHours(13.86)).toBe("13.9 ຊມ");
    expect(formatLeadHours(47.9)).toBe("47.9 ຊມ");
  });

  it("ຕັ້ງແຕ່ 48 ຊົ່ວໂມງຂຶ້ນໄປ ສະແດງເປັນມື້", () => {
    expect(formatLeadHours(48)).toBe("2.0 ມື້");
    expect(formatLeadHours(74.4)).toBe("3.1 ມື້");
  });

  it("ບໍ່ມີຂໍ້ມູນ ສະແດງຂີດ", () => {
    expect(formatLeadHours(null)).toBe("—");
    expect(formatLeadHours(Number.NaN)).toBe("—");
  });
});

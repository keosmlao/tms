import { describe, it, expect } from "vitest";
import { suggestTrips, type SuggestBill, type SuggestVehicle } from "./trip-suggest";

const WAREHOUSE = { lat: 18.064334, lng: 102.669599 };

const bill = (
  no: string,
  lat: number,
  lng: number,
  m3: number,
  dataSufficient = true
): SuggestBill => ({
  bill_no: no,
  cust_code: `C${no}`,
  cust_name: `ລູກຄ້າ ${no}`,
  point: { lat, lng },
  m3,
  dataSufficient,
});

const truck = (code: string, usableM3: number): SuggestVehicle => ({
  code,
  name: `ລົດ ${code}`,
  usableM3,
});

describe("suggestTrips", () => {
  it("ບໍ່ບັນຈຸເກີນຄວາມຈຸລົດ", () => {
    const bills = [
      bill("A", 18.07, 102.67, 5),
      bill("B", 18.071, 102.671, 5),
      bill("C", 18.072, 102.672, 5),
    ];
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("T1", 10)]);
    expect(trips).toHaveLength(1);
    // 95% ຂອງ 10 = 9.5 ຈຶ່ງໃສ່ໄດ້ 1 ບິນ (5) + ອີກ 1 ບິນ = 10 ເກີນ
    expect(trips[0].m3).toBeLessThanOrEqual(9.5);
  });

  it("ບິນທີ່ໃສ່ບໍ່ໝົດ ຕ້ອງຢູ່ leftover ບໍ່ແມ່ນຫາຍໄປ", () => {
    const bills = [
      bill("A", 18.07, 102.67, 6),
      bill("B", 18.071, 102.671, 6),
      bill("C", 18.072, 102.672, 6),
    ];
    const { trips, leftover } = suggestTrips(WAREHOUSE, bills, [truck("T1", 10)]);
    const placed = trips.flatMap((t) => t.bills.map((b) => b.bill_no));
    expect([...placed, ...leftover.map((b) => b.bill_no)].sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("ບິນຢູ່ຄົນລະຝັ່ງເມືອງ ບໍ່ຄວນຢູ່ຖ້ຽວດຽວກັນ", () => {
    // ຫ່າງກັນປະມານ 60 ກມ. — ເກີນ maxSpreadKm ຄ່າເລີ່ມຕົ້ນ 25
    const bills = [
      bill("ໃກ້1", 18.07, 102.67, 1),
      bill("ໃກ້2", 18.075, 102.675, 1),
      bill("ໄກ", 18.6, 102.67, 1),
    ];
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("T1", 20), truck("T2", 20)]);
    const tripOf = (no: string) =>
      trips.findIndex((t) => t.bills.some((b) => b.bill_no === no));
    expect(tripOf("ໃກ້1")).toBe(tripOf("ໃກ້2"));
    expect(tripOf("ໄກ")).not.toBe(tripOf("ໃກ້1"));
  });

  it("ລົດຄັນໃຫຍ່ໄດ້ເລືອກກ່ອນ", () => {
    const bills = [bill("A", 18.07, 102.67, 8), bill("B", 18.071, 102.671, 8)];
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("ນ້ອຍ", 10), truck("ໃຫຍ່", 20)]);
    // ຄັນໃຫຍ່ຮັບໄດ້ 2 ບິນ (16 ≤ 19) ຈຶ່ງຄວນໄດ້ທັງສອງ
    expect(trips[0].vehicle.code).toBe("ໃຫຍ່");
    expect(trips[0].bills).toHaveLength(2);
  });

  it("ບິນທີ່ໃຫຍ່ກວ່າລົດທຸກຄັນ ຍັງຖືກສະແດງ ບໍ່ແມ່ນຖິ້ມງຽບໆ", () => {
    // ຖ້າຖິ້ມງຽບໆ ຄົນຈັດຖ້ຽວຈະບໍ່ຮູ້ວ່າມີບິນນີ້ຢູ່ເລີຍ
    const bills = [bill("ໃຫຍ່ຫຼາຍ", 18.07, 102.67, 50)];
    const { trips, leftover } = suggestTrips(WAREHOUSE, bills, [truck("T1", 10)]);
    const seen = [
      ...trips.flatMap((t) => t.bills.map((b) => b.bill_no)),
      ...leftover.map((b) => b.bill_no),
    ];
    expect(seen).toContain("ໃຫຍ່ຫຼາຍ");
  });

  it("ບອກເມື່ອຖ້ຽວມີບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດ", () => {
    const bills = [bill("A", 18.07, 102.67, 1, false)];
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("T1", 10)]);
    expect(trips[0].hasUnknownVolume).toBe(true);
  });

  it("ຈຸດສົ່ງໃນຖ້ຽວຖືກຮຽງຕາມເສັ້ນທາງ", () => {
    const bills = [
      bill("ໄກ", 18.12, 102.669599, 1),
      bill("ໃກ້", 18.08, 102.669599, 1),
      bill("ກາງ", 18.1, 102.669599, 1),
    ];
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("T1", 20)]);
    expect(trips[0].bills.map((b) => b.bill_no)).toEqual(["ໃກ້", "ກາງ", "ໄກ"]);
    expect(trips[0].bills[0].order).toBe(1);
  });

  it("ບໍ່ມີລົດ = ບໍ່ມີຖ້ຽວ ແລະ ບິນທັງໝົດຢູ່ leftover", () => {
    const bills = [bill("A", 18.07, 102.67, 1)];
    const { trips, leftover } = suggestTrips(WAREHOUSE, bills, []);
    expect(trips).toEqual([]);
    expect(leftover).toHaveLength(1);
  });
});

describe("ຈຳກັດຈຳນວນຈຸດຕໍ່ຖ້ຽວ", () => {
  it("ບິນທີ່ຍັງບໍ່ຮູ້ຂະໜາດ (m³=0) ບໍ່ເຮັດໃຫ້ຖ້ຽວຍາວບໍ່ມີທີ່ສິ້ນສຸດ", () => {
    // ວັດກັບຂໍ້ມູນຈິງແລ້ວ: ບໍ່ຈຳກັດ = ຖ້ຽວດຽວໄດ້ 111 ບິນ ໃຊ້ບໍ່ໄດ້
    const bills = Array.from({ length: 40 }, (_, i) =>
      bill(`B${i}`, 18.07 + i * 0.001, 102.67 + i * 0.001, 0, false)
    );
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("T1", 20)], { maxStops: 12 });
    expect(trips[0].bills.length).toBeLessThanOrEqual(12);
  });

  it("ຈຳກັດຈຸດ ບໍ່ໄດ້ຫ້າມລົດເຕັມກ່ອນ", () => {
    const bills = Array.from({ length: 10 }, (_, i) =>
      bill(`B${i}`, 18.07 + i * 0.001, 102.67, 3)
    );
    const { trips } = suggestTrips(WAREHOUSE, bills, [truck("T1", 10)], { maxStops: 12 });
    expect(trips[0].m3).toBeLessThanOrEqual(9.5);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ແຈ້ງເຕືອນລົດ: ຈອດດົນ · ອອກຈາກສາງແຕ່ບໍ່ກົດເລີ່ມ · ຂັບໄວ · ຈອດບໍ່ຕົງຈຸດ ·
// ອອກນອກເສັ້ນທາງ. ເທສນີ້ອ່ານໄຟລ໌ຈິງ ຈຶ່ງຈັບການລຶບ/ປ່ຽນກົດໄດ້ ໂດຍບໍ່ຕ້ອງມີ DB.
const src = readFileSync(
  join(process.cwd(), "src", "queries", "fleet-alert.js"),
  "utf8"
);

describe("ຊະນິດຂອງແຈ້ງເຕືອນລົດ", () => {
  it("ມີຄົບທັງ 5 ຊະນິດ", () => {
    for (const kind of [
      '"parked"',
      '"left_no_start"',
      '"speeding"',
      '"parked_off_point"',
      '"off_route"',
    ]) {
      expect(src).toContain(kind);
    }
  });

  // ຄັນທີ່ເຂົ້າທັງ "ຈອດດົນ" ແລະ "ຈອດບໍ່ຕົງຈຸດ" ຕ້ອງໄດ້ຂໍ້ຄວາມດຽວ — ບໍ່ດັ່ງນັ້ນ
  // ຫົວໜ້າໄດ້ສອງ LINE ກ່ຽວກັບການຈອດຄັ້ງດຽວກັນ.
  it("ຈອດບໍ່ຕົງຈຸດ ບຽດ ຈອດດົນ ອອກ ບໍ່ສົ່ງຊ້ຳ", () => {
    expect(src).toContain("const offPointCars = new Set(");
    expect(src).toContain("!offPointCars.has(");
  });

  // gps_current ເປັນພາບຖ່າຍ ບໍ່ແມ່ນສາຍເຫດການ — ຖ້າຈອງດ້ວຍເວລາຈຸດເຕັມ ມັນຈະ
  // ຍິງທຸກຮອບ cron ຕະຫຼອດທີ່ລົດຍັງແລ່ນໄວ / ຍັງຢູ່ນອກເສັ້ນທາງ.
  it("ຂັບໄວ ແລະ ອອກນອກເສັ້ນທາງ ຈຳກັດຄັນລະເທື່ອຕໍ່ຊົ່ວໂມງ", () => {
    const hourly = src.match(/String\(row\.seen_at \?\? ""\)\.slice\(0, 13\)/g) ?? [];
    expect(hourly.length).toBe(2);
  });

  // ບໍ່ມີ polyline ຂອງເສັ້ນທາງໃນລະບົບ ຈຶ່ງເກນຂຶ້ນກັບສາຂາຫຼາຍ — ເປີດເອງບໍ່ໄດ້.
  it("ອອກນອກເສັ້ນທາງ ປິດຢູ່ຈົນກວ່າຈະຕັ້ງເກນເອງ", () => {
    expect(src).toContain('getSetting("fleet.off_route_km", "")');
    expect(src).toContain("offRouteKm > 0 ? findOffRoute(");
  });

  // ບໍ່ມີພິກັດໃຫ້ທຽບ = ບໍ່ຮູ້ ບໍ່ແມ່ນ "ໄກ" — ຢ່າເຕືອນ.
  it("ບໍ່ມີພິກັດໃຫ້ທຽບ ຈະບໍ່ເຕືອນ", () => {
    expect(src).toContain("metres < 2147483647");
  });

  it("ເກນທັງໝົດອ່ານຈາກຕັ້ງຄ່າ ບໍ່ແມ່ນຝັງໄວ້", () => {
    for (const key of [
      "fleet.speed_limit_kmh",
      "fleet.off_point_metres",
      "fleet.off_route_km",
    ]) {
      expect(src).toContain(key);
    }
  });
});

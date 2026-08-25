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
  it("ມີຄົບທັງ 6 ຊະນິດ", () => {
    for (const kind of [
      '"parked"',
      '"left_no_start"',
      '"speeding"',
      '"parked_off_point"',
      '"off_route"',
      '"back_no_close"',
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
    expect(src).toContain("offRouteKm > 0");
    expect(src).toContain("findOffRoute(today, offRouteKm * 1000)");
  });

  // ບໍ່ມີພິກັດໃຫ້ທຽບ = ບໍ່ຮູ້ ບໍ່ແມ່ນ "ໄກ" — ຢ່າເຕືອນ.
  it("ບໍ່ມີພິກັດໃຫ້ທຽບ ຈະບໍ່ເຕືອນ", () => {
    expect(src).toContain("metres < 2147483647");
  });

  // ຄົນຂັບຕ້ອງໄດ້ຮັບເອງຜ່ານແອັບ ບໍ່ແມ່ນລໍໃຫ້ຫົວໜ້າບອກ — ແລະ ຕ້ອງສົ່ງກ່ອນ
  // ກວດຜູ້ຮັບ LINE ບໍ່ດັ່ງນັ້ນສາຂາທີ່ບໍ່ມີໃຜຕັ້ງ line_id ຈະບໍ່ມີໃຜເຕືອນເລີຍ.
  it("ຮອດສາງບໍ່ປິດຖ້ຽວ ເຕືອນຄົນຂັບຜ່ານ push ກ່ອນກວດ LINE", () => {
    const pushAt = src.indexOf("await pushCloseReminder(row)");
    const lineAt = src.indexOf("recipientCache.set(code, await findRecipients");
    expect(pushAt).toBeGreaterThan(-1);
    expect(lineAt).toBeGreaterThan(-1);
    expect(pushAt).toBeLessThan(lineAt);
    // ຫົວໜ້າທີ່ຕິກຕິດຕາມກໍ່ໄດ້ຮັບ (observer) ບໍ່ແມ່ນສະເພາະຄົນຂັບ.
    expect(src).toContain("observerTitle:");
  });

  // ຈອດຢູ່ລານສາງເຂົ້າໄດ້ທັງ ຈອດດົນ / ຈອດບໍ່ຕົງຈຸດ / ຮອດສາງບໍ່ປິດ — ຕ້ອງໄດ້
  // ຂໍ້ຄວາມດຽວ ອັນທີ່ບອກສິ່ງທີ່ຕ້ອງເຮັດຊັດທີ່ສຸດ.
  it("ຮອດສາງບໍ່ປິດຖ້ຽວ ບຽດອີກສອງອັນອອກ", () => {
    expect(src).toContain("const backKeys = new Set(");
    const guards = src.match(/!backKeys\.has\(/g) ?? [];
    expect(guards.length).toBe(2);
  });

  // ບອກຄົນຂັບໃຫ້ກົດປຸ່ມໃດ — ຮັບຖ້ຽວ ຫຼື ເລີ່ມຈັດສົ່ງ ບໍ່ແມ່ນຂໍ້ຄວາມລວມ.
  it("ອອກຈາກສາງ ແຍກ ຍັງບໍ່ຮັບຖ້ຽວ ກັບ ຮັບແລ້ວແຕ່ບໍ່ເລີ່ມ", () => {
    expect(src).toContain('Number(row.job_status ?? 0) === 0');
    expect(src).toContain('ຍັງບໍ່ກົດ "ຮັບຖ້ຽວ"');
    expect(src).toContain('ຍັງບໍ່ກົດ "ເລີ່ມຈັດສົ່ງ"');
  });

  // ຜູ້ໃຊ້ຂໍໃຫ້ກຳນົດຜູ້ຮັບ LINE ເອງ. ຕັ້ງໄວ້ຕ້ອງ **ແທນ** ວິທີເກົ່າ ບໍ່ແມ່ນ
  // ບວກເພີ່ມ — ບໍ່ດັ່ງນັ້ນຍັງສົ່ງຫາ 280 ຄົນຢູ່ດີ.
  it("ຜູ້ຮັບ LINE ທີ່ກຳນົດເອງ ແທນການໄລ່ຫາພະນັກງານສາຂາ", () => {
    expect(src).toContain('getSetting("fleet.alert_line_to", "")');
    expect(src).toContain("if (override.length > 0) return override;");
    expect(src).toContain("findRecipients(code, lineOverride)");
  });

  it("ຮັບຫຼາຍຜູ້ຮັບ ຄັ່ນດ້ວຍຈຸດ ຫຼື ຂຶ້ນແຖວໃໝ່", () => {
    expect(src).toContain("split(/[\\n,]/)");
  });

  // ເກັບ **ລະຫັດພະນັກງານ** ບໍ່ແມ່ນ LINE id — ພະນັກງານປ່ຽນ LINE ເມື່ອໃດ
  // ແຈ້ງເຕືອນຕ້ອງຕາມໄປເອງ ໂດຍບໍ່ຕ້ອງມາແກ້ຕັ້ງຄ່າ.
  it("ແປງລະຫັດພະນັກງານເປັນ LINE id ຕອນສົ່ງ", () => {
    expect(src).toContain("async function resolveLineTargets(");
    expect(src).toContain("FROM public.odg_employee e");
    expect(src).toContain("await resolveLineTargets(parseLineTargets(rawLineTo))");
  });

  // ຄ່າທີ່ຕັ້ງໄວ້ກ່ອນມີໜ້າເລືອກ (LINE id ດິບ) ແລະ ກຸ່ມ LINE (C…) ຕ້ອງຍັງໃຊ້ໄດ້.
  it("ຍັງຮັບ LINE id ດິບ ໄດ້ຢູ່", () => {
    expect(src).toContain("/^[UC][0-9a-f]{20,}$/i");
  });

  // ລາຍຊື່ໃຫ້ເລືອກຕ້ອງເປັນຄົນທີ່ຍັງເຮັດວຽກ ແລະ ຜູກ LINE ແລ້ວ — ບໍ່ດັ່ງນັ້ນ
  // ເລືອກໄປແລ້ວກໍ່ບໍ່ມີໃຜໄດ້ຮັບ.
  it("ລາຍຊື່ໃຫ້ເລືອກ ກັ່ນຕອງ active + ມີ LINE", () => {
    expect(src).toContain("async function listLineRecipientOptions(");
    expect(src).toContain("ILIKE 'active'");
    expect(src).toContain("NULLIF(TRIM(e.line_id), '') IS NOT NULL");
  });

  it("ເກນທັງໝົດອ່ານຈາກຕັ້ງຄ່າ ບໍ່ແມ່ນຝັງໄວ້", () => {
    for (const key of [
      "fleet.speed_limit_kmh",
      "fleet.off_point_metres",
      "fleet.off_route_km",
      "fleet.close_reminder_minutes",
      "fleet.alert_line_to",
    ]) {
      expect(src).toContain(key);
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── ໂຕແທນຂອງ settings ແລະ DB ────────────────────────────────────────────
const settings: Record<string, string> = {};
let openTrip = false;
let openTripThrows = false;
let openTripCalls = 0;

vi.mock("@/queries/settings.js", () => ({
  getSettings: async (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, settings[k] ?? ""])),
}));

vi.mock("@/queries/mobile.js", () => ({
  driverHasOpenTrip: async () => {
    openTripCalls += 1;
    if (openTripThrows) throw new Error("db down");
    return openTrip;
  },
}));

let shipped = "";
let laoHour = "09";
vi.mock("@/lib/lao-date.js", () => ({
  getLaoParts: () => ({ hour: laoHour }),
}));
vi.mock("@/lib/shipped-app-version", () => ({
  shippedAppVersion: async () => shipped,
}));

const { evaluateMobileAppVersion, assertMobileAppVersion } = await import(
  "./app-version"
);

function req(version: string): Request {
  return new Request("https://x/api/mobile/jobs", {
    headers: { "x-app-version": version, "x-app-platform": "android" },
  });
}

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k];
  openTrip = false;
  openTripThrows = false;
  openTripCalls = 0;
  shipped = "";
});

describe("ໂໝດອັດຕະໂນມັດ — ຂັ້ນຕ່ຳຕິດຕາມ APK ທີ່ວາງໃຫ້ໂຫຼດ", () => {
  it("ໃຊ້ເວີຊັນຂອງ APK ເປັນຂັ້ນຕ່ຳ ໂດຍບໍ່ຕ້ອງພິມເລກ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    shipped = "1.3.4";
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.min_version).toBe("1.3.4");
    expect(r.force_update).toBe(true);
  });

  it("ລຸ້ນທີ່ຕົງກັບ APK ຜ່ານ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    shipped = "1.3.4";
    const r = await evaluateMobileAppVersion(req("1.3.4"), "D001");
    expect(r.force_update).toBe(false);
    expect(r.update_available).toBe(false);
  });

  // ໄຟລ໌ເວີຊັນຫາຍ (deploy ບໍ່ຄົບ) ບໍ່ຄວນລັອກຄົນຂັບອອກທັງກອງ.
  it("ອ່ານເວີຊັນ APK ບໍ່ໄດ້ → ຕົກກັບໄປໃຊ້ຄ່າທີ່ພິມເອງ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    settings["app.mobile.min_version"] = "1.2.0";
    shipped = "";
    const r = await evaluateMobileAppVersion(req("1.3.0"), "D001");
    expect(r.min_version).toBe("1.2.0");
    expect(r.force_update).toBe(false);
  });

  it("ບໍ່ໄດ້ຕັ້ງທັງສອງ → gate ປິດ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    const r = await evaluateMobileAppVersion(req(""), "D001");
    expect(r.min_version).toBe("");
    expect(r.force_update).toBe(false);
  });

  // ຄ່າ latest_version ທີ່ພິມໄວ້ແຕ່ດົນມັກຄ້າງເປັນເລກເກົ່າ.
  it("ເວີຊັນ APK ທັບຄ່າ latest_version ທີ່ພິມໄວ້ເກົ່າ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    settings["app.mobile.latest_version"] = "1.3.3";
    shipped = "1.3.5";
    const r = await evaluateMobileAppVersion(req("1.3.5"), "D001");
    expect(r.latest_version).toBe("1.3.5");
    expect(r.force_update).toBe(false);
    expect(r.update_available).toBe(false);
  });

  it("ໂໝດພິມເອງ ບໍ່ສົນໃຈເວີຊັນ APK", async () => {
    settings["app.mobile.min_version_mode"] = "manual";
    settings["app.mobile.min_version"] = "1.2.0";
    shipped = "9.9.9";
    const r = await evaluateMobileAppVersion(req("1.2.0"), "D001");
    expect(r.min_version).toBe("1.2.0");
    expect(r.force_update).toBe(false);
  });
});

describe("ບັງຄັບຫຼັງປິດຖ້ຽວ", () => {
  beforeEach(() => {
    settings["app.mobile.min_version_mode"] = "auto";
    shipped = "1.3.4";
  });

  it("ກຳລັງແລ່ນຖ້ຽວ → ຍັງບໍ່ບັງຄັບ ແຕ່ໝາຍໄວ້", async () => {
    openTrip = true;
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(false);
    expect(r.update_after_trip).toBe(true);
  });

  // ແອັບບລັອກຕົວເອງເມື່ອເຫັນ update_available (ທຸກການອັບເດດເປັນການບັງຄັບ).
  // ຕອນເລື່ອນຕ້ອງປິດທຸງນີ້ນຳ ບໍ່ດັ່ງນັ້ນລຸ້ນເກົ່າທີ່ຍັງບໍ່ຮູ້ຈັກ
  // update_after_trip ຈະດີດຄົນຂັບອອກກາງຖ້ຽວຢູ່ດີ.
  it("ຕອນເລື່ອນ ບໍ່ບອກວ່າມີລຸ້ນໃໝ່ — ລຸ້ນເກົ່າຈຶ່ງບໍ່ບລັອກຕົວເອງ", async () => {
    openTrip = true;
    settings["app.mobile.latest_version"] = "9.9.9";
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.update_available).toBe(false);
    expect(r.update_after_trip).toBe(true);
  });

  it("ປິດຖ້ຽວໝົດແລ້ວ → ບັງຄັບ", async () => {
    openTrip = false;
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(true);
    expect(r.update_after_trip).toBe(false);
  });

  it("ປິດການເລື່ອນ → ບັງຄັບເຖິງວ່າຢູ່ກາງຖ້ຽວ", async () => {
    settings["app.mobile.force_after_trip"] = "0";
    openTrip = true;
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(true);
    expect(r.update_after_trip).toBe(false);
  });

  // ຖາມ DB ບໍ່ໄດ້ = ບໍ່ຮູ້ວ່າມີຖ້ຽວຄ້າງບໍ່. ຢຸດວຽກທັງກອງເພາະ DB ສະດຸດ
  // ແພງກວ່າການປ່ອຍລຸ້ນເກົ່າແລ່ນຕໍ່ອີກໜ້ອຍໜຶ່ງ.
  it("ຖາມ DB ບໍ່ໄດ້ → ບໍ່ບັງຄັບ", async () => {
    openTripThrows = true;
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(false);
    expect(r.update_after_trip).toBe(true);
  });

  // ຄຳຖາມນີ້ຢູ່ໃນເສັ້ນທາງຂອງທຸກ request — ຢ່າຍິງເມື່ອບໍ່ຈຳເປັນ.
  it("ລຸ້ນໃໝ່ພໍແລ້ວ → ບໍ່ຖາມ DB ເລີຍ", async () => {
    openTrip = true;
    await evaluateMobileAppVersion(req("1.3.4"), "D001");
    expect(openTripCalls).toBe(0);
  });

  it("ບໍ່ມີລະຫັດຄົນຂັບ (ຕອນ login) → ບັງຄັບຕາມປົກກະຕິ", async () => {
    openTrip = true;
    const r = await evaluateMobileAppVersion(req("1.3.3"));
    expect(r.force_update).toBe(true);
    expect(openTripCalls).toBe(0);
  });
});

// ຜູ້ໃຊ້ຂໍ: ຢ່າໄປຢຸດຄົນຂັບກາງມື້ — ປ່ອຍໃຫ້ອັບເດດຕອນ 18:00.
describe("ບັງຄັບຕັ້ງແຕ່ໂມງທີ່ກຳນົດ", () => {
  beforeEach(() => {
    settings["app.mobile.min_version_mode"] = "auto";
    settings["app.mobile.force_from_hour"] = "18";
    shipped = "1.3.4";
    laoHour = "09";
  });

  it("ກ່ອນຮອດໂມງ → ຍັງບໍ່ບັງຄັບ", async () => {
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(false);
    expect(r.update_after_trip).toBe(true);
    // ລຸ້ນເກົ່າບໍ່ຮູ້ຈັກທຸງໃໝ່ ຈຶ່ງຕ້ອງບໍ່ເຫັນ "ມີລຸ້ນໃໝ່" ນຳ
    expect(r.update_available).toBe(false);
  });

  it("ຮອດໂມງແລ້ວ → ບັງຄັບ", async () => {
    laoHour = "18";
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(true);
  });

  // ຄຳຕອບບໍ່ປ່ຽນບໍ່ວ່າຈະມີຖ້ຽວຄ້າງບໍ່ — ຢ່າຍິງ query ໃສ່ທຸກ request.
  it("ກ່ອນຮອດໂມງ ບໍ່ຖາມ DB ວ່າມີຖ້ຽວຄ້າງບໍ່", async () => {
    openTrip = true;
    await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(openTripCalls).toBe(0);
  });

  it("ບໍ່ຕັ້ງໂມງ → ບັງຄັບໄດ້ຕະຫຼອດເວລາ", async () => {
    settings["app.mobile.force_from_hour"] = "";
    const r = await evaluateMobileAppVersion(req("1.3.3"), "D001");
    expect(r.force_update).toBe(true);
  });
});

describe("assertMobileAppVersion", () => {
  it("ໂຍນ 426 ພ້ອມລິ້ງອັບເດດ ເມື່ອຕ້ອງບັງຄັບ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    settings["app.mobile.update_url_android"] = "https://tms/tms.apk";
    shipped = "1.3.4";
    await expect(
      assertMobileAppVersion(req("1.0.0"), "D001")
    ).rejects.toMatchObject({
      status: 426,
      details: { force_update: true },
    });
  });

  it("ບໍ່ໂຍນ ເມື່ອຄົນຂັບຍັງມີຖ້ຽວຄ້າງ", async () => {
    settings["app.mobile.min_version_mode"] = "auto";
    shipped = "1.3.4";
    openTrip = true;
    const r = await assertMobileAppVersion(req("1.0.0"), "D001");
    expect(r.update_after_trip).toBe(true);
  });
});

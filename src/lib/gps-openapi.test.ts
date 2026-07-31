import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  utcIsoToLaoStamp,
  mapPositionRow,
  isOpenApiConfigured,
} = require("../queries/gps-openapi.js") as {
  utcIsoToLaoStamp: (v: unknown) => string;
  mapPositionRow: (
    pos: unknown,
    opts?: { carCode?: string; carName?: string; syncedAt?: string }
  ) => Record<string, string>;
  isOpenApiConfigured: () => boolean;
};

describe("utcIsoToLaoStamp", () => {
  it("ປ່ຽນ UTC ເປັນເວລາລາວ (+07)", () => {
    // ຖ້າບໍ່ບວກ 7 ຊົ່ວໂມງ ເວລາໃນ DB ຈະຜິດໄປທັງລະບົບ ໂດຍບໍ່ມີໃຜເຫັນ
    expect(utcIsoToLaoStamp("2026-07-25T09:01:55.000Z")).toBe("2026-07-25 16:01:55");
  });

  it("ຂ້າມມື້ໄດ້ຖືກຕ້ອງ", () => {
    expect(utcIsoToLaoStamp("2026-07-24T17:00:53.000Z")).toBe("2026-07-25 00:00:53");
  });

  it("ຄ່າຫວ່າງ ຫຼື ອ່ານບໍ່ໄດ້ ບໍ່ພັງ", () => {
    expect(utcIsoToLaoStamp("")).toBe("");
    expect(utcIsoToLaoStamp(null)).toBe("");
    expect(utcIsoToLaoStamp("not-a-date")).toBe("not-a-date");
  });
});

describe("mapPositionRow", () => {
  const pos = {
    vehicle_id: 286,
    imei: "864022088337125",
    plate: "ກນ-9855",
    time: "2026-07-25T09:01:55.000Z",
    latitude: 18.064628,
    longitude: 102.669808,
    speed_kmh: 42,
    direction: "180",
    engine_on: true,
    mileage_km: 40337.9,
    address: "ບ້ານ ໂພນສະຫວັນ",
    fuel_percent: 42,
    fuel_litre: 27.3,
    source: "live",
  };

  it("ແປງເປັນຮູບແບບແຖວທີ່ລະບົບໃຊ້ຢູ່", () => {
    const row = mapPositionRow(pos, { carCode: "0001", carName: "ກນ-9855", syncedAt: "2026-07-25 16:02:00" });
    expect(row).toMatchObject({
      imei: "864022088337125",
      lat: "18.064628",
      lng: "102.669808",
      speed: "42",
      heading: "180",
      recorded_at: "2026-07-25 16:01:55",
      address: "ບ້ານ ໂພນສະຫວັນ",
      engine_state: "1",
      mileage: "40337.9",
      oil: "42",
      car_code: "0001",
      car_name: "ກນ-9855",
      provider_synced_at: "2026-07-25 16:02:00",
    });
  });

  it("ບໍ່ມີພິກັດ ໃຫ້ເປັນຄ່າຫວ່າງ ບໍ່ແມ່ນ 0", () => {
    // lat/lng = 0 ຈະແຕ້ມລົດໄປຢູ່ກາງມະຫາສະໝຸດ; ຫວ່າງ = ບໍ່ຮູ້
    const row = mapPositionRow({ ...pos, latitude: null, longitude: null });
    expect(row.lat).toBe("");
    expect(row.lng).toBe("");
  });

  it("engine_on ເປັນ false ໃຫ້ເປັນ '0' ບໍ່ແມ່ນຫວ່າງ", () => {
    expect(mapPositionRow({ ...pos, engine_on: false }).engine_state).toBe("0");
    expect(mapPositionRow({ ...pos, engine_on: null }).engine_state).toBe("");
  });

  it("fuel_percent ເປັນ 0 ຕ້ອງເກັບເປັນ '0' ບໍ່ແມ່ນຫວ່າງ", () => {
    expect(mapPositionRow({ ...pos, fuel_percent: 0 }).oil).toBe("0");
    expect(mapPositionRow({ ...pos, fuel_percent: null }).oil).toBe("");
  });
});

describe("isOpenApiConfigured", () => {
  it("ບອກໄດ້ວ່າມີ credential ຫຼືບໍ່", () => {
    const prevUser = process.env.GPS_OPENAPI_USER;
    const prevPass = process.env.GPS_OPENAPI_PASS;
    const prevLegacyUser = process.env.GPS_TRACKER_USER;
    const prevLegacyPass = process.env.GPS_TRACKER_PASS;
    try {
      process.env.GPS_OPENAPI_USER = "";
      process.env.GPS_OPENAPI_PASS = "";
      // credential ຂອງ provider ເກົ່າຕ້ອງບໍ່ຖືກນັບວ່າ "ຕັ້ງແລ້ວ" —
      // Lao GPS ປະຕິເສດມັນ ແລະ login ຜິດຊ້ຳໆຈະລັອກບັນຊີ
      process.env.GPS_TRACKER_USER = "legacy-user";
      process.env.GPS_TRACKER_PASS = "legacy-pass";
      expect(isOpenApiConfigured()).toBe(false);
      process.env.GPS_OPENAPI_USER = "u";
      process.env.GPS_OPENAPI_PASS = "p";
      expect(isOpenApiConfigured()).toBe(true);
    } finally {
      process.env.GPS_OPENAPI_USER = prevUser ?? "";
      process.env.GPS_OPENAPI_PASS = prevPass ?? "";
      process.env.GPS_TRACKER_USER = prevLegacyUser ?? "";
      process.env.GPS_TRACKER_PASS = prevLegacyPass ?? "";
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-prod-32bytes!!";
});
afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_SECRET;
});

/** ຄຳຂໍທີ່ບໍ່ມີ cookie token — ຄືຜູ້ໃຊ້ທີ່ຍັງບໍ່ໄດ້ login. */
function anonymousRequest(pathname: string) {
  return new NextRequest(new URL(pathname, "https://tms.test"));
}

describe("proxy — ການເຂົ້າເຖິງແບບບໍ່ມີ session", () => {
  it("ປ່ອຍໄຟລ໌ໂລໂກ້ຜ່ານ ເພາະໜ້າ login ເອງອ້າງອີງມັນ", async () => {
    const { proxy } = await import("./proxy");
    for (const p of [
      "/brand/odien-logo.png",
      "/brand/odien-logo-white.png",
      "/brand/odien-logo-navy.png",
      "/odg.png",
    ]) {
      const res = await proxy(anonymousRequest(p));
      expect(res.status, p).toBe(200);
      expect(res.headers.get("location"), p).toBeNull();
    }
  });

  it("ຍັງກັນໜ້າພາຍໃນ ແລະ ໄຟລ໌ອື່ນໃນ public ຢູ່", async () => {
    const { proxy } = await import("./proxy");
    for (const p of ["/", "/jobs", "/reports/by-car", "/firebase-config.json"]) {
      const res = await proxy(anonymousRequest(p));
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname, p).toBe("/login");
    }
  });

  it("ຍັງປ່ອຍ APK ແລະ ເສັ້ນທາງສາທາລະນະຜ່ານຄືເກົ່າ", async () => {
    const { proxy } = await import("./proxy");
    for (const p of ["/tms.apk", "/track", "/track/ABC123", "/tv", "/login"]) {
      const res = await proxy(anonymousRequest(p));
      expect(res.status, p).toBe(200);
    }
  });
});

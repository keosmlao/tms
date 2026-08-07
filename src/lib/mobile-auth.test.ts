import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";

// mobile-auth ດຶງ presence → db.js ເຊິ່ງສ້າງ pool ຕອນ import (ບໍ່ໄດ້ຕໍ່ຈິງ) —
// ຕັ້ງ env ປອມກ່ອນ import ຈຶ່ງທົດສອບໄດ້ໂດຍບໍ່ຕ້ອງມີຖານຂໍ້ມູນ.
process.env.PG_HOST ??= "127.0.0.1";
process.env.PG_DATABASE ??= "test";
process.env.PG_USER ??= "test";
process.env.PG_HOST_B ??= "127.0.0.1";
process.env.PG_DATABASE_B ??= "test";
process.env.PG_USER_B ??= "test";
process.env.JWT_SECRET ??= "test-secret-for-mobile-auth-unit-tests";

const { requireMobileSession, mobileErrorResponse } = await import("./mobile-auth");

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

const sign = (payload: Record<string, unknown>, exp: string | number) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(secret());

const request = (auth?: string) =>
  new Request("https://tms.test/api/mobile/jobs?scope=all", {
    headers: auth ? { authorization: auth } : {},
  });

/** ດັກ error ຈາກ requireMobileSession ອອກມາເປັນ object ທີ່ອ່ານໄດ້ */
async function reject(auth?: string) {
  try {
    await requireMobileSession(request(auth));
    throw new Error("ຄວນຈະ throw ແຕ່ບໍ່ throw");
  } catch (error) {
    return error as Error & {
      status?: number;
      details?: { code?: string; reason?: string };
    };
  }
}

describe("requireMobileSession — 401 ພ້ອມເຫດຜົນ", () => {
  it("ບໍ່ມີ header → missing_token", async () => {
    const error = await reject();
    expect(error.status).toBe(401);
    expect(error.details?.code).toBe("missing_token");
  });

  it("token ຂີ້ເຫຍື້ອ → token_expired", async () => {
    const error = await reject("Bearer not-a-jwt");
    expect(error.status).toBe(401);
    expect(error.details?.code).toBe("token_expired");
  });

  it("token ໝົດອາຍຸ → token_expired (ອາການທີ່ຫົວໜ້າພົບຢູ່ໜ້າແອັບ)", async () => {
    const token = await sign(
      { usercode: "22020", driver_id: "22020", is_driver: false },
      Math.floor(Date.now() / 1000) - 60
    );
    const error = await reject(`Bearer ${token}`);
    expect(error.status).toBe(401);
    expect(error.details?.code).toBe("token_expired");
  });

  it("token ຍັງດີແຕ່ບໍ່ມີ usercode → token_expired", async () => {
    const token = await sign({ username: "ບໍ່ມີລະຫັດ" }, "1h");
    const error = await reject(`Bearer ${token}`);
    expect(error.status).toBe(401);
    expect(error.details?.code).toBe("token_expired");
  });
});

describe("isSupervisorSession — ຄ່າເລີ່ມຕົ້ນຕ້ອງເປັນສິດຕ່ຳສຸດ", () => {
  it("is_driver=false (ຫົວໜ້າແທ້) → ຫົວໜ້າ", async () => {
    const { isSupervisorSession } = await import("./mobile-auth");
    expect(isSupervisorSession({ is_driver: false, roles: "employee" })).toBe(true);
  });

  it("token ເກົ່າທີ່ບໍ່ມີ claim ແລະ roles ບໍ່ບອກຕຳແໜ່ງ → ບໍ່ແມ່ນຫົວໜ້າ", async () => {
    const { isSupervisorSession } = await import("./mobile-auth");
    expect(isSupervisorSession({ roles: "driver" })).toBe(false);
    expect(isSupervisorSession({ roles: "employee" })).toBe(false);
  });

  it("token ເກົ່າແຕ່ roles ບອກວ່າເປັນຫ້ອງການ → ຍັງເປັນຫົວໜ້າ", async () => {
    const { isSupervisorSession } = await import("./mobile-auth");
    expect(isSupervisorSession({ roles: "manager" })).toBe(true);
    expect(isSupervisorSession({ title: "supervisor" })).toBe(true);
  });
});

describe("mobileErrorResponse", () => {
  it("ສົ່ງ code ອອກໄປນຳ ເພື່ອໃຫ້ແອັບພາໄປໜ້າ login ແທນທີ່ຈະເດົາວ່າ API ຂາດ", async () => {
    const error = await reject();
    const response = mobileErrorResponse(error);
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("Unauthorized");
    expect(body.code).toBe("missing_token");
    expect(typeof body.reason).toBe("string");
  });

  it("error ທົ່ວໄປຍັງເປັນ 500 ຮູບແບບເກົ່າ", async () => {
    const response = mobileErrorResponse(new Error("boom"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("boom");
    expect(body.code).toBeUndefined();
  });
});

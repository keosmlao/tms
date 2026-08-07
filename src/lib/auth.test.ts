import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORIGINAL_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-prod-32bytes!!";
});
afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_SECRET;
});

describe("auth tokens", () => {
  it("creates a token that verifies back to the same payload", async () => {
    const { createToken, verifyToken } = await import("./auth");
    const token = await createToken({
      usercode: "U1",
      username: "alice",
      driver_id: "D1",
      logistic_code: "L1",
      title: "driver",
    });
    expect(token.split(".")).toHaveLength(3);
    const verified = await verifyToken(token);
    expect(verified).toMatchObject({
      usercode: "U1",
      username: "alice",
      driver_id: "D1",
    });
  });

  it("ຄ່າເລີ່ມຕົ້ນຍັງມີອາຍຸ 8 ຊົ່ວໂມງ (session ຂອງເວັບ)", async () => {
    const { createToken } = await import("./auth");
    const token = await createToken({ usercode: "U1" });
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    ) as { exp?: number };
    expect(claims.exp).toBeTypeOf("number");
    const hours = (claims.exp! - Math.floor(Date.now() / 1000)) / 3600;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThan(8.1);
  });

  it("expiresIn = null → ບໍ່ມີ exp ເລີຍ ແລະ ຍັງ verify ຜ່ານ (token ຂອງແອັບມືຖື)", async () => {
    const { createToken, verifyToken } = await import("./auth");
    const token = await createToken({ usercode: "U1", is_driver: false }, null);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    ) as { exp?: number };
    expect(claims.exp).toBeUndefined();
    expect(await verifyToken(token)).toMatchObject({ usercode: "U1" });
  });

  it("ໃສ່ອາຍຸເອງໄດ້ (MOBILE_TOKEN_TTL)", async () => {
    const { createToken } = await import("./auth");
    const token = await createToken({ usercode: "U1" }, "30d");
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    ) as { exp?: number };
    const days = (claims.exp! - Math.floor(Date.now() / 1000)) / 86_400;
    expect(days).toBeGreaterThan(29.9);
  });

  it("returns null for malformed tokens", async () => {
    const { verifyToken } = await import("./auth");
    expect(await verifyToken("garbage")).toBeNull();
  });

  it("returns null for tokens signed with a different secret", async () => {
    const { createToken } = await import("./auth");
    const token = await createToken({ usercode: "U1" });

    process.env.JWT_SECRET = "different-secret-also-32-bytes-please!!";
    // Re-import — the module reads the env at call-time, so this works in
    // either case, but resetting modules guarantees fresh state.
    const { verifyToken } = await import("./auth");
    expect(await verifyToken(token)).toBeNull();

    process.env.JWT_SECRET = "test-secret-do-not-use-in-prod-32bytes!!";
  });
});

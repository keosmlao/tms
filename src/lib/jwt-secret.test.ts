import { describe, expect, it } from "vitest";
import {
  MIN_JWT_SECRET_LENGTH,
  describeJwtSecretProblem,
  isUsableJwtSecret,
} from "./jwt-secret";

describe("describeJwtSecretProblem", () => {
  it("rejects the placeholder that shipped in .env", () => {
    // The exact value found in production — it passed the old one-string check.
    const problem = describeJwtSecretProblem(
      "your-secret-key-change-this-in-production"
    );
    expect(problem).not.toBeNull();
    expect(problem).toContain("ຄ່າຕົວຢ່າງ");
  });

  it("rejects the other placeholders people paste in", () => {
    for (const value of [
      "default-secret-change-me",
      "CHANGEME-CHANGEME-CHANGEME-CHANGEME",
      "replace-me-with-a-real-secret-value!!",
      "TODO-generate-a-proper-signing-key-xx",
      "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ]) {
      expect(isUsableJwtSecret(value), value).toBe(false);
    }
  });

  it("rejects a missing or blank secret", () => {
    expect(describeJwtSecretProblem(undefined)).toContain("required");
    expect(describeJwtSecretProblem("")).toContain("required");
    expect(describeJwtSecretProblem("    ")).toContain("required");
    expect(describeJwtSecretProblem(null)).toContain("required");
  });

  it("rejects a secret shorter than the HS256 digest", () => {
    const short = "a1b2c3d4e5f6g7h8";
    expect(short.length).toBeLessThan(MIN_JWT_SECRET_LENGTH);
    expect(describeJwtSecretProblem(short)).toContain("ສັ້ນເກີນໄປ");
  });

  it("rejects a long but repetitive key", () => {
    // Length alone is not entropy.
    expect(describeJwtSecretProblem("a".repeat(64))).toContain("ຊ້ຳກັນ");
    expect(describeJwtSecretProblem("abab".repeat(16))).not.toBeNull();
  });

  it("accepts a real generated key", () => {
    // `openssl rand -base64 48` output.
    expect(
      isUsableJwtSecret(
        "kQ8x2Vv7Zt0pLmR4sNbHwYcJfEgUaDiOx3PqWnTlKzMvBrScFyXhAudGeNjIt5Q="
      )
    ).toBe(true);
  });

  it("does not reject a good key that merely contains the word secret", () => {
    // The blocklist is phrase-based on purpose: banning "secret" or "test"
    // outright would reject valid random keys.
    expect(isUsableJwtSecret("aSecret9fJ2mQx7Vt4Zb8LnR3Wd6Yc1Hk5Pg0Su")).toBe(
      true
    );
    expect(
      isUsableJwtSecret("test-secret-do-not-use-in-prod-32bytes!!")
    ).toBe(true);
  });

  it("ignores case when matching placeholders", () => {
    expect(isUsableJwtSecret("Your-Secret-Key-Change-This-In-Production")).toBe(
      false
    );
  });

  it("trims before measuring length", () => {
    const padded = `   ${"k7Qx".repeat(4)}   `;
    // 16 real characters — still too short once trimmed.
    expect(describeJwtSecretProblem(padded)).toContain("ສັ້ນເກີນໄປ");
  });

  it("always tells the operator how to fix it", () => {
    for (const bad of ["", "short", "changeme-changeme-changeme-changeme"]) {
      expect(describeJwtSecretProblem(bad)).toContain("openssl rand");
    }
  });
});

describe("auth reaction to a weak secret", () => {
  const PLACEHOLDER = "your-secret-key-change-this-in-production";

  it("warns but keeps working — a config value must not stop deliveries", async () => {
    // ເມື່ອກ່ອນອັນນີ້ໂຍນ 503: deploy ເທື່ອດຽວແລ້ວທັງເວັບ ແລະ ແອັບໃຊ້ບໍ່ໄດ້
    // ທັງບໍລິສັດ. ຄວາມສ່ຽງຂອງກະແຈອ່ອນຕ້ອງແກ້ ແຕ່ບໍ່ຄຸ້ມທີ່ຈະຢຸດການຈັດສົ່ງ.
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = PLACEHOLDER;
    const { createToken, verifyToken } = await import("./auth");
    const token = await createToken({ usercode: "U1" });
    expect(token.split(".")).toHaveLength(3);
    expect(await verifyToken(token)).toMatchObject({ usercode: "U1" });
    process.env.JWT_SECRET = original;
  });

  it("blocks only when JWT_SECRET_STRICT=1 (CI / staging)", async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = PLACEHOLDER;
    process.env.JWT_SECRET_STRICT = "1";
    const { createToken } = await import("./auth");
    await expect(createToken({ usercode: "U1" })).rejects.toThrow(
      "ລະບົບຍັງຕັ້ງຄ່າບໍ່ຄົບ"
    );
    // ລາຍລະອຽດຂອງກະແຈຕ້ອງບໍ່ຮົ່ວໄປຫາຜູ້ໃຊ້ປາຍທາງ.
    await expect(createToken({ usercode: "U1" })).rejects.not.toThrow(
      /change-this/
    );
    process.env.JWT_SECRET_STRICT = "";
    process.env.JWT_SECRET = original;
  });

  it("still fails when there is no secret at all — nothing to sign with", async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "";
    const { createToken } = await import("./auth");
    await expect(createToken({ usercode: "U1" })).rejects.toThrow(
      "ລະບົບຍັງຕັ້ງຄ່າບໍ່ຄົບ"
    );
    process.env.JWT_SECRET = original;
  });
});

import { describe, expect, it } from "vitest";
import {
  USER_ERROR_DIGEST_PREFIX,
  decodeUserErrorDigest,
  isUserError,
  userError,
  userErrorMessage,
} from "./action-error";

// ຂໍ້ຄວາມທີ່ React ໃສ່ແທນ message ຈິງຢູ່ production — ນີ້ຄືສິ່ງທີ່ຜູ້ໃຊ້ເຫັນ
// ຢູ່ໜ້າຈໍກ່ອນມີ userError().
const REDACTED =
  "An error occurred in the Server Components render. The specific message is " +
  "omitted in production builds to avoid leaking sensitive details. A digest " +
  "property is included on this error instance which may provide additional " +
  "details about the nature of the error.";

/** ຈຳລອງສິ່ງທີ່ client ໄດ້ຮັບ: message ຖືກລົບ ແຕ່ digest ຕິດມາ. */
function asProductionError(error: Error): Error {
  const redacted = new Error(REDACTED);
  (redacted as Error & { digest?: string }).digest = (
    error as Error & { digest?: string }
  ).digest;
  return redacted;
}

describe("userError", () => {
  it("ຝາກຂໍ້ຄວາມໄວ້ໃນ digest ພ້ອມກັບ message", () => {
    const error = userError("ບໍ່ມີສິດໃນການຈັດການຖ້ຽວ");
    expect(error.message).toBe("ບໍ່ມີສິດໃນການຈັດການຖ້ຽວ");
    expect((error as Error & { digest?: string }).digest).toBe(
      `${USER_ERROR_DIGEST_PREFIX}${encodeURIComponent("ບໍ່ມີສິດໃນການຈັດການຖ້ຽວ")}`
    );
  });

  it("digest ບໍ່ມີຕົວອັກສອນທີ່ພັງ JSON ຫຼື ຂຶ້ນແຖວໃໝ່", () => {
    const digest = (userError('ບິນ "A/1"\nຊ້ຳ') as Error & { digest?: string }).digest;
    expect(digest).not.toMatch(/[\n"]/);
    expect(decodeUserErrorDigest(digest)).toBe('ບິນ "A/1"\nຊ້ຳ');
  });

  it("isUserError ຮູ້ຈັກສະເພາະ error ຂອງຕົນ", () => {
    expect(isUserError(userError("ຜິດ"))).toBe(true);
    expect(isUserError(new Error("ຜິດ"))).toBe(false);
    expect(isUserError(null)).toBe(false);
    expect(isUserError("ຜິດ")).toBe(false);
  });

  it("decodeUserErrorDigest ບໍ່ຮັບ digest ຂອງຄົນອື່ນ", () => {
    expect(decodeUserErrorDigest("1234567890")).toBeNull();
    expect(decodeUserErrorDigest(undefined)).toBeNull();
    expect(decodeUserErrorDigest(`${USER_ERROR_DIGEST_PREFIX}%E0%`)).toBeNull();
  });
});

describe("userErrorMessage", () => {
  it("ຄືນຂໍ້ຄວາມລາວ ເຖິງແມ່ນ Next ຈະລົບ message ຖິ້ມແລ້ວ", () => {
    const onClient = asProductionError(
      userError("ສາມາດປິດຖ້ຽວໄດ້ເມື່ອຄົນຂັບປິດງານແລ້ວເທົ່ານັ້ນ")
    );
    expect(userErrorMessage(onClient, "ບໍ່ສາມາດປິດຖ້ຽວໄດ້")).toBe(
      "ສາມາດປິດຖ້ຽວໄດ້ເມື່ອຄົນຂັບປິດງານແລ້ວເທົ່ານັ້ນ"
    );
  });

  it("ຢູ່ dev (message ຍັງຄົບ) ກໍ່ຄືນອັນດຽວກັນ", () => {
    expect(
      userErrorMessage(userError("ບິນນີ້ຢູ່ໃນຖ້ຽວແລ້ວ"), "ບັນທຶກບໍ່ສຳເລັດ")
    ).toBe("ບິນນີ້ຢູ່ໃນຖ້ຽວແລ້ວ");
  });

  it("bug ຈິງທີ່ຖືກລົບຂໍ້ຄວາມ → ຂໍ້ຄວາມສຳຮອງ + ລະຫັດໄວ້ຄົ້ນ log", () => {
    const crash = new Error(REDACTED);
    (crash as Error & { digest?: string }).digest = "2246335556";
    expect(userErrorMessage(crash, "ບໍ່ສາມາດປິດຖ້ຽວໄດ້")).toBe(
      "ບໍ່ສາມາດປິດຖ້ຽວໄດ້ (ລະຫັດຂໍ້ຜິດພາດ: 2246335556)"
    );
  });

  it("ບໍ່ເອົາປະໂຫຍກອັງກິດຂອງ Next ມາໂຊ້ຜູ້ໃຊ້ ເຖິງບໍ່ມີ digest", () => {
    expect(userErrorMessage(new Error(REDACTED), "ໂຫຼດບໍ່ສຳເລັດ")).toBe(
      "ໂຫຼດບໍ່ສຳເລັດ"
    );
  });

  it("error ທຳມະດາຝັ່ງ client ຍັງໃຊ້ message ຂອງມັນ", () => {
    expect(userErrorMessage(new TypeError("fetch failed"), "ໂຫຼດບໍ່ສຳເລັດ")).toBe(
      "fetch failed"
    );
  });

  it("ສິ່ງທີ່ບໍ່ແມ່ນ Error → ຂໍ້ຄວາມສຳຮອງ", () => {
    expect(userErrorMessage("boom", "ລຶບບໍ່ສຳເລັດ")).toBe("ລຶບບໍ່ສຳເລັດ");
    expect(userErrorMessage(undefined, "ລຶບບໍ່ສຳເລັດ")).toBe("ລຶບບໍ່ສຳເລັດ");
    expect(userErrorMessage(new Error(""), "ລຶບບໍ່ສຳເລັດ")).toBe("ລຶບບໍ່ສຳເລັດ");
  });
});

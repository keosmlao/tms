// ຂໍ້ຄວາມເຕືອນພາສາລາວ ຂ້າມເສັ້ນແບ່ງ server → client ໄດ້ແນວໃດ
//
// ຢູ່ production, Next.js ລົບ message ຂອງທຸກ Error ທີ່ໂຍນອອກຈາກ Server
// Component ຫຼື Server Action ຖິ້ມ ແລ້ວປ່ຽນເປັນປະໂຫຍກອັງກິດ "An error
// occurred in the Server Components render…" — ເພື່ອບໍ່ໃຫ້ຂໍ້ມູນພາຍໃນຮົ່ວ.
// ໝາຍຄວາມວ່າ `throw new Error("ສາມາດປິດຖ້ຽວໄດ້ເມື່ອ…")` ຜູ້ໃຊ້ບໍ່ເຄີຍໄດ້ເຫັນ
// ຢູ່ເຄື່ອງຈິງ ເຫັນແຕ່ປະໂຫຍກອັງກິດນັ້ນ.
//
// ແຕ່ Next ສົ່ງ `error.digest` ໄປຫາ client ຄືເກົ່າ ແລະ ຖ້າ Error ມີ digest
// ຢູ່ແລ້ວມັນຮັກສາຂອງເດີມໄວ້ ບໍ່ສ້າງໃໝ່ ("If the error already has a digest,
// respect the original digest" — next/dist/server/app-render/create-error-handler).
// ຝັ່ງ client React ຕິດ digest ນັ້ນໃສ່ Error ທີ່ຖືກລົບ message ແລ້ວ. ດັ່ງນັ້ນ
// ເຮົາຝາກຂໍ້ຄວາມລາວໄປກັບ digest ໄດ້ — ນີ້ຄືສິ່ງທີ່ userError() ເຮັດ.
//
// ⚠️ ໄຟລ໌ນີ້ເປັນ CommonJS (.js) ໂດຍເຈດຕະນາ ຄືກັນກັບ lib/fixed-year.js:
// src/queries/*.js ຮຽກມັນດ້ວຍ require(). type ຢູ່ action-error.d.ts.
"use strict";

/** ຄຳນຳໜ້າ digest ທີ່ໝາຍວ່າ "ນີ້ແມ່ນຂໍ້ຄວາມສຳລັບຜູ້ໃຊ້ ບໍ່ແມ່ນ hash" */
const USER_ERROR_DIGEST_PREFIX = "TMS_USER_ERROR.";

// ປະໂຫຍກທີ່ React ໃສ່ແທນ message ຈິງຢູ່ production. ບໍ່ມີປະໂຫຍດຫຍັງຕໍ່ຜູ້ໃຊ້
// ຈຶ່ງຕ້ອງກັ່ນອອກ ແລ້ວສະແດງຂໍ້ຄວາມສຳຮອງຂອງໜ້ານັ້ນແທນ.
const REDACTED_MARKER = "omitted in production builds";

/**
 * ຂໍ້ຜິດພາດ "ຜູ້ໃຊ້ອ່ານໄດ້" — ກົດລະບຽບທຸລະກິດ ບໍ່ແມ່ນ bug.
 * ໃຊ້ແທນ `new Error(...)` ທຸກບ່ອນທີ່ຂໍ້ຄວາມນັ້ນຕັ້ງໃຈໃຫ້ຜູ້ໃຊ້ອ່ານ.
 *
 * @param {string} message
 * @returns {Error}
 */
function userError(message) {
  const error = new Error(message);
  // encodeURIComponent ເພາະ digest ຖືກສົ່ງເປັນ JSON ແລະ ຖືກໃຊ້ເປັນ key ຂອງ
  // Map ຢູ່ Next — ຂຶ້ນແຖວໃໝ່ ຫຼື ຕົວອັກສອນພິເສດຈຶ່ງບໍ່ຄວນຫຼຸດອອກໄປດິບໆ.
  error.digest = USER_ERROR_DIGEST_PREFIX + encodeURIComponent(message);
  return error;
}

/**
 * ຖອດຂໍ້ຄວາມລາວອອກຈາກ digest. ຄືນ null ຖ້າ digest ນີ້ບໍ່ແມ່ນຂອງ userError().
 *
 * @param {unknown} digest
 * @returns {string | null}
 */
function decodeUserErrorDigest(digest) {
  if (typeof digest !== "string") return null;
  if (!digest.startsWith(USER_ERROR_DIGEST_PREFIX)) return null;
  try {
    return decodeURIComponent(digest.slice(USER_ERROR_DIGEST_PREFIX.length)) || null;
  } catch {
    return null;
  }
}

/** @param {unknown} error */
function isUserError(error) {
  return (
    !!error &&
    typeof error === "object" &&
    decodeUserErrorDigest(/** @type {{ digest?: unknown }} */ (error).digest) !== null
  );
}

/**
 * ຂໍ້ຄວາມທີ່ຄວນເອົາໄປໂຊ້ຜູ້ໃຊ້ ຈາກ error ອັນໃດກໍ່ໄດ້ທີ່ catch ມາ.
 *
 * ລຳດັບ:
 *  1. ຂໍ້ຄວາມທີ່ຝາກມາກັບ digest (userError ຢູ່ຝັ່ງ server) — ໃຊ້ໄດ້ທັງ dev/prod.
 *  2. error.message ປົກກະຕິ (error ຢູ່ຝັ່ງ client, ຫຼື ຢູ່ dev).
 *  3. ຂໍ້ຄວາມສຳຮອງຂອງໜ້ານັ້ນ — ໃຊ້ເມື່ອ message ຖືກ Next ລົບຖິ້ມ. ຖ້າມີ
 *     digest ຕິດມາ ຈະຕໍ່ທ້າຍໃຫ້ ເພື່ອໃຫ້ຜູ້ໃຊ້ແຈ້ງລະຫັດນີ້ໄປຫາ IT ແລ້ວ
 *     ຄົ້ນຫາຂໍ້ຜິດພາດຈິງໃນ log ຂອງ server ໄດ້.
 *
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function userErrorMessage(error, fallback) {
  const digest =
    error && typeof error === "object"
      ? /** @type {{ digest?: unknown }} */ (error).digest
      : undefined;

  const fromDigest = decodeUserErrorDigest(digest);
  if (fromDigest) return fromDigest;

  const message = error instanceof Error ? error.message : "";
  if (message && !message.includes(REDACTED_MARKER)) return message;

  return typeof digest === "string" && digest
    ? `${fallback} (ລະຫັດຂໍ້ຜິດພາດ: ${digest})`
    : fallback;
}

module.exports = {
  USER_ERROR_DIGEST_PREFIX,
  userError,
  isUserError,
  decodeUserErrorDigest,
  userErrorMessage,
};

// ປະເພດການເຕີມນ້ຳມັນ — ບ່ອນດຽວທີ່ນິຍາມລາຍການ.
//
// ⚠️ ໄຟລ໌ນີ້ເປັນ CommonJS (.js) ດ້ວຍເຫດຜົນດຽວກັບ fuel-sanity.js: src/queries/*.js
// ຮຽກມັນດ້ວຍ require() ໄດ້ ແລະ ຝັ່ງ TypeScript ຍັງ import ໄດ້ຄົບ type ຈາກ JSDoc.
//
// ຄ່າທີ່ເກັບໃນ DB ແມ່ນ `code` (ອັກສອນລາຕິນ) ບໍ່ແມ່ນ label ພາສາລາວ —
// ປ່ຽນຄຳອະທິບາຍພາຍຫຼັງໄດ້ໂດຍບໍ່ຕ້ອງແກ້ຂໍ້ມູນເກົ່າ.
"use strict";

/**
 * @typedef {"ptt_voucher" | "odien_station" | "fuel_pass" | "cash" | "other"} FuelPaymentTypeCode
 */

/** @type {readonly ["ptt_voucher", "odien_station", "fuel_pass", "cash", "other"]} */
const FUEL_PAYMENT_TYPE_CODES = ["ptt_voucher", "odien_station", "fuel_pass", "cash", "other"];

/** @type {ReadonlyArray<{ code: FuelPaymentTypeCode, label: string }>} */
const FUEL_PAYMENT_TYPES = [
  { code: "ptt_voucher", label: "ນ້ຳມັນຂຽນບົງ PTT" },
  { code: "odien_station", label: "ປ້ຳໂອດ້ຽນ" },
  { code: "fuel_pass", label: "ນ້ຳມັນພັສ" },
  { code: "cash", label: "ຈ່າຍເງິນສົດ" },
  { code: "other", label: "ອື່ນໆ" },
];

/**
 * ຮັບຄ່າດິບຈາກ form / mobile ແລ້ວຄືນ code ທີ່ຖືກຕ້ອງ ຫຼື null.
 * ຄ່າທີ່ບໍ່ຮູ້ຈັກຄືນ null ແທນທີ່ຈະຖິ້ມ error — ແອັບຮຸ່ນເກົ່າທີ່ບໍ່ສົ່ງຖັນນີ້ມາ
 * ຍັງບັນທຶກໄດ້ຕາມປົກກະຕິ (ແຖວເກົ່າກໍ່ເປັນ null ຄືກັນ).
 * @param {unknown} value
 * @returns {FuelPaymentTypeCode | null}
 */
function normalizeFuelPaymentType(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!v) return null;
  const found = FUEL_PAYMENT_TYPE_CODES.find((code) => code === v);
  return found ?? null;
}

/**
 * ຄຳອະທິບາຍພາສາລາວຂອງ code — ແຖວເກົ່າ (null) ຄືນ "-".
 * @param {unknown} code
 * @returns {string}
 */
function fuelPaymentTypeLabel(code) {
  const normalized = normalizeFuelPaymentType(code);
  if (!normalized) return "-";
  const found = FUEL_PAYMENT_TYPES.find((t) => t.code === normalized);
  return found ? found.label : "-";
}

module.exports = {
  FUEL_PAYMENT_TYPES,
  FUEL_PAYMENT_TYPE_CODES,
  normalizeFuelPaymentType,
  fuelPaymentTypeLabel,
};

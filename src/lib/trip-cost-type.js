// ປະເພດຕົ້ນທຶນຂົນສົ່ງ ນອກເໜືອຈາກຄ່ານ້ຳມັນ — ບ່ອນດຽວທີ່ນິຍາມລາຍການ.
//
// ⚠️ ໄຟລ໌ນີ້ເປັນ CommonJS (.js) ດ້ວຍເຫດຜົນດຽວກັບ fuel-payment-type.js:
// src/queries/*.js ຮຽກມັນດ້ວຍ require() ໄດ້ ແລະ ຝັ່ງ TypeScript ຍັງ import
// ໄດ້ຄົບ type ຈາກ JSDoc.
//
// ຄ່າທີ່ເກັບໃນ DB ແມ່ນ `code` (ອັກສອນລາຕິນ) ບໍ່ແມ່ນ label ພາສາລາວ — ປ່ຽນ
// ຄຳອະທິບາຍພາຍຫຼັງໄດ້ໂດຍບໍ່ຕ້ອງແກ້ຂໍ້ມູນເກົ່າ.
//
// ຄ່ານ້ຳມັນ **ບໍ່ຢູ່ໃນລາຍການນີ້** ໂດຍເຈດຕະນາ — ມັນມີຕາຕະລາງຂອງມັນເອງ
// (odg_tms_fuel_log) ພ້ອມການກວດຄວາມສົມເຫດສົມຜົນຂອງລິດ. ຖ້າໃສ່ຊ້ຳຢູ່ນີ້
// ຍອດຕົ້ນທຶນຈະຖືກນັບສອງເທື່ອ.
"use strict";

/**
 * @typedef {"driver_pay" | "toll" | "repair" | "hired_truck" | "fine" | "other"} TripCostTypeCode
 */

/** @type {readonly ["driver_pay", "toll", "repair", "hired_truck", "fine", "other"]} */
const TRIP_COST_TYPE_CODES = ["driver_pay", "toll", "repair", "hired_truck", "fine", "other"];

/** @type {ReadonlyArray<{ code: TripCostTypeCode, label: string }>} */
const TRIP_COST_TYPES = [
  { code: "driver_pay", label: "ຄ່າແຮງຄົນຂັບ" },
  { code: "toll", label: "ຄ່າຜ່ານທາງ / ຄ່າຂ້າມຂົວ" },
  { code: "repair", label: "ຄ່າສ້ອມແປງ / ບຳລຸງຮັກສາ" },
  { code: "hired_truck", label: "ຄ່າຈ້າງລົດນອກ" },
  { code: "fine", label: "ຄ່າປັບໃໝ" },
  { code: "other", label: "ອື່ນໆ" },
];

/**
 * ຮັບຄ່າດິບຈາກ form ແລ້ວຄືນ code ທີ່ຖືກຕ້ອງ ຫຼື null.
 * ຄ່າທີ່ບໍ່ຮູ້ຈັກຄືນ null ແທນທີ່ຈະຖິ້ມ error — ຜູ້ຮຽກເປັນຄົນຕັດສິນວ່າຈະປະຕິເສດ
 * ຫຼື ບັນທຶກເປັນ "ອື່ນໆ".
 * @param {unknown} value
 * @returns {TripCostTypeCode | null}
 */
function normalizeTripCostType(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!v) return null;
  const found = TRIP_COST_TYPE_CODES.find((code) => code === v);
  return found ?? null;
}

/**
 * ຄຳອະທິບາຍພາສາລາວ — ຄ່າທີ່ບໍ່ຮູ້ຈັກຄືນຄ່າດິບ ເພື່ອບໍ່ໃຫ້ໜ້າຈໍວ່າງເປົ່າ.
 * @param {unknown} value
 * @returns {string}
 */
function tripCostTypeLabel(value) {
  const code = normalizeTripCostType(value);
  if (!code) return String(value ?? "").trim() || "ບໍ່ໄດ້ລະບຸປະເພດ";
  return TRIP_COST_TYPES.find((t) => t.code === code)?.label ?? code;
}

module.exports = {
  TRIP_COST_TYPE_CODES,
  TRIP_COST_TYPES,
  normalizeTripCostType,
  tripCostTypeLabel,
};

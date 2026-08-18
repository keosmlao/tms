// ⚠️ CommonJS (.js) ໂດຍເຈດຕະນາ — src/queries/*.js require ໄຟລ໌ນີ້ ແລະ
// require() ໂຫຼດ .ts ໄດ້ສະເພາະໃນ bundler ຂອງ Next. type ຢູ່ .d.ts ຄູ່ກັນ.
//
// ── COD (ເກັບເງິນປາຍທາງ / cash on delivery) — pure rules ──────────────────
//
// ERP ໝາຍບິນ COD ໄວ້ໃຫ້ແລ້ວ ຜ່ານ ic_trans.doc_format_code: ທຸກລະຫັດທີ່ຂຶ້ນຕົ້ນ
// ດ້ວຍ "COD" ແມ່ນ CASH ON DELIVERY (erp_doc_format):
//   CODPB  CASH ON DELIVERY (PUMPING)     — ອຸປະກອນປະປາ
//   CODCE  CASH ON DELIVERY (ELECTRONIC)  — ໄຟຟ້າ
//   CODAC  CASH ON DELIVERY (AIR)         — ແອ
//   CODSP  CASH ON DELIVERY (SPARE PART)  — ອາໄຫຼ່
// ສ່ວນລະຫັດອື່ນບໍ່ແມ່ນ COD ແລະ ຄົນຂັບບໍ່ຕ້ອງເກັບເງິນ:
//   CA…  = ຂາຍເງິນສົດ  → ລູກຄ້າຈ່າຍທີ່ເຄົາເຕີແລ້ວ
//   IN…  = ຂາຍຕິດໜີ້    → ໄປລົງບັນຊີລູກໜີ້ ບໍ່ເກັບປາຍທາງ
//   SPOS = ບິນ POS      → ຈ່າຍແລ້ວ
//
// ໄຟລ໌ນີ້ບໍ່ແຕະ DB/IO ຈຶ່ງ unit-test ໄດ້ ແລະ require ຈາກຊັ້ນ query (CommonJS) ໄດ້.
"use strict";

// ຄຳນຳໜ້າຂອງ doc_format_code ທີ່ໝາຍວ່າ "ເກັບເງິນປາຍທາງ".
const COD_DOC_FORMAT_PREFIX = "COD";

/**
 * ບິນນີ້ຕ້ອງເກັບເງິນປາຍທາງບໍ — ຕັດສິນຈາກ doc_format_code ຂອງ ERP ຢ່າງດຽວ.
 * @param {unknown} docFormatCode
 * @returns {boolean}
 */
function isCodDocFormat(docFormatCode) {
  const code = String(docFormatCode ?? "").trim().toUpperCase();
  return code.startsWith(COD_DOC_FORMAT_PREFIX);
}

// ວິທີຊຳລະທີ່ຮັບໄດ້ ຕອນຄົນຂັບປິດບິນ COD.
//   cash     ເງິນສົດ
//   transfer ໂອນເຂົ້າບັນຊີ (ຕ້ອງມີເລກອ້າງອີງ/ສະລິບ)
//   mixed    ສົດ + ໂອນ ປົນກັນ (ຕ້ອງມີເລກອ້າງອີງ)
//   none     ບໍ່ໄດ້ເກັບ (ບິນບໍ່ແມ່ນ COD ຫຼື ລູກຄ້າບໍ່ຈ່າຍ)
const PAYMENT_METHODS = ["cash", "transfer", "mixed", "none"];

// ວິທີຊຳລະທີ່ຕ້ອງມີເລກອ້າງອີງ/ສະລິບ ຈຶ່ງກວດຄືນກັບ statement ທະນາຄານໄດ້.
const METHODS_REQUIRING_REFERENCE = ["transfer", "mixed"];

const PAYMENT_METHOD_LABELS = {
  cash: "ເງິນສົດ",
  transfer: "ໂອນ",
  mixed: "ສົດ + ໂອນ",
  none: "ບໍ່ໄດ້ເກັບ",
};

/**
 * ປັບຄ່າ payment_method ໃຫ້ເປັນ 1 ໃນຊຸດທີ່ຮັບໄດ້ — ຄ່າອື່ນ/ຫວ່າງ ຄືນ null.
 * @param {unknown} value
 * @returns {"cash"|"transfer"|"mixed"|"none"|null}
 */
function normalizePaymentMethod(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return PAYMENT_METHODS.includes(raw) ? /** @type {any} */ (raw) : null;
}

/**
 * ຊື່ພາສາລາວຂອງວິທີຊຳລະ (ສຳລັບ UI / push / ລາຍງານ).
 * @param {unknown} value
 * @returns {string}
 */
function paymentMethodLabel(value) {
  const method = normalizePaymentMethod(value);
  return method ? PAYMENT_METHOD_LABELS[method] : "";
}

// ປັດເສດເປັນຈຳນວນເຕັມກີບ. ກີບບໍ່ມີຫົວໜ່ວຍຍ່ອຍທີ່ໃຊ້ຈິງ ແລະ ຍອດ ERP ມີທົດ
// ນິຍົມ (ເຊັ່ນ 47993.52) ຈຶ່ງປັດໃຫ້ເປັນຈຳນວນເຕັມກ່ອນປຽບທຽບ ບໍ່ດັ່ງນັ້ນທຸກບິນ
// ຈະຖືກຫາວ່າ "ເກັບຂາດ 0.52 ກີບ" ທັງທີ່ຄົນຂັບເກັບຄົບ.
/**
 * @param {unknown} value
 * @returns {number}
 */
function toKip(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

// ຍອດຕ່າງທີ່ຍັງຖືວ່າ "ຄົບ" — ປັດເສດແລ້ວຈຶ່ງເປັນ 0 ໄດ້ ແຕ່ເຜື່ອໄວ້ 1 ກີບ
// ສຳລັບການປັດເສດຄົນລະທາງລະຫວ່າງແອັບກັບ ERP.
const KIP_TOLERANCE = 1;

/**
 * ສະຖານະການເກັບເງິນຂອງ 1 ບິນ.
 *   not_required ບໍ່ແມ່ນບິນ COD (ບໍ່ຕ້ອງເກັບ)
 *   pending      ເປັນ COD ແຕ່ຍັງບໍ່ໄດ້ບັນທຶກວ່າເກັບເທົ່າໃດ
 *   exact        ເກັບຄົບ
 *   short        ເກັບຂາດ (ຕ້ອງມີເຫດຜົນ)
 *   over         ເກັບເກີນ (ຜິດປົກກະຕິ ຕ້ອງມີເຫດຜົນ)
 * @param {{ expected?: unknown, collected?: unknown }} input
 * @returns {"not_required"|"pending"|"exact"|"short"|"over"}
 */
function codSettlementStatus({ expected, collected } = {}) {
  const want = toKip(expected);
  if (want <= 0) return "not_required";
  if (collected == null || collected === "") return "pending";
  const got = toKip(collected);
  const diff = got - want;
  if (Math.abs(diff) <= KIP_TOLERANCE) return "exact";
  return diff < 0 ? "short" : "over";
}

/**
 * ຍອດຕ່າງ (ເກັບ − ຕ້ອງເກັບ): ລົບ = ຂາດ, ບວກ = ເກີນ.
 * @param {unknown} expected
 * @param {unknown} collected
 * @returns {number}
 */
function codVariance(expected, collected) {
  if (collected == null || collected === "") return 0;
  return toKip(collected) - toKip(expected);
}

/**
 * ຢືນຢັນຂໍ້ມູນການເກັບເງິນທີ່ຄົນຂັບສົ່ງມາ ຕອນປິດບິນ.
 *
 * ກົດ:
 *   • ບິນທີ່ບໍ່ແມ່ນ COD — ຫ້າມແນບຍອດເງິນມາ (ກັນກົດຜິດບິນ)
 *   • ບິນ COD — ຕ້ອງມີ collected_amount ແລະ payment_method ທີ່ຖືກຕ້ອງ
 *   • ໂອນ/ປົນ — ຕ້ອງມີເລກອ້າງອີງ
 *   • ເກັບບໍ່ຄົບ/ເກີນ — ຕ້ອງມີເຫດຜົນ
 * ຄືນ { ok: true, value } ຫຼື { ok: false, error } (ຂໍ້ຄວາມພາສາລາວ ສົ່ງໃຫ້ແອັບ).
 *
 * @param {{
 *   codAmount?: unknown,
 *   collectedAmount?: unknown,
 *   paymentMethod?: unknown,
 *   reference?: unknown,
 *   varianceReason?: unknown,
 * }} input
 * @returns {import("./cod").CodValidationResult}
 */
function validateCodCollection(input = {}) {
  const expected = toKip(input.codAmount);
  const hasAmount = input.collectedAmount != null && `${input.collectedAmount}` !== "";
  const method = normalizePaymentMethod(input.paymentMethod);
  const reference = String(input.reference ?? "").trim();
  const reason = String(input.varianceReason ?? "").trim();

  // ບິນທຳມະດາ (ຈ່າຍໜ້າຮ້ານ / ຕິດໜີ້) — ບໍ່ຄວນມີເງິນຕິດມາ
  if (expected <= 0) {
    if (hasAmount && toKip(input.collectedAmount) > 0) {
      return { ok: false, error: "ບິນນີ້ບໍ່ແມ່ນບິນເກັບເງິນປາຍທາງ (COD) — ບັນທຶກຍອດເງິນບໍ່ໄດ້" };
    }
    return {
      ok: true,
      value: {
        collected_amount: null,
        payment_method: null,
        reference: null,
        variance_reason: null,
        status: "not_required",
        variance: 0,
      },
    };
  }

  if (!hasAmount) {
    return { ok: false, error: "ບິນ COD — ຕ້ອງລະບຸຍອດເງິນທີ່ເກັບໄດ້" };
  }
  const collected = toKip(input.collectedAmount);
  if (collected < 0) {
    return { ok: false, error: "ຍອດເງິນທີ່ເກັບຕ້ອງບໍ່ຕິດລົບ" };
  }
  if (!method) {
    return {
      ok: false,
      error: `ຕ້ອງເລືອກວິທີຊຳລະ (${PAYMENT_METHODS.join(" | ")})`,
    };
  }
  // ເກັບໄດ້ເງິນ ແຕ່ບອກວ່າ "ບໍ່ໄດ້ເກັບ" — ຂັດກັນເອງ
  if (method === "none" && collected > 0) {
    return { ok: false, error: "ເລືອກ 'ບໍ່ໄດ້ເກັບ' ແຕ່ມີຍອດເງິນ — ກະລຸນາເລືອກວິທີຊຳລະໃຫ້ຖືກ" };
  }
  if (METHODS_REQUIRING_REFERENCE.includes(method) && !reference) {
    return { ok: false, error: "ຊຳລະແບບໂອນ — ຕ້ອງໃສ່ເລກອ້າງອີງ / ເລກສະລິບ" };
  }
  const status = codSettlementStatus({ expected, collected });
  if ((status === "short" || status === "over") && !reason) {
    const diff = Math.abs(codVariance(expected, collected)).toLocaleString("en-US");
    return {
      ok: false,
      error:
        status === "short"
          ? `ເກັບຂາດ ${diff} ກີບ — ຕ້ອງລະບຸເຫດຜົນ`
          : `ເກັບເກີນ ${diff} ກີບ — ຕ້ອງລະບຸເຫດຜົນ`,
    };
  }
  return {
    ok: true,
    value: {
      collected_amount: collected,
      payment_method: method,
      reference: reference || null,
      variance_reason: status === "exact" ? null : reason || null,
      status,
      variance: codVariance(expected, collected),
    },
  };
}

/**
 * ສະຫຼຸບເງິນ COD ຂອງ 1 ຖ້ຽວ — ໃຊ້ຕອນຄົນຂັບປິດຖ້ຽວ ແລະ ຕອນມອບເງິນໃຫ້ການເງິນ.
 * ນັບສະເພາະບິນທີ່ສົ່ງສຳເລັດ (delivered): ບິນທີ່ຍົກເລີກບໍ່ມີເງິນ.
 * @param {import("./cod").CodBillRow[]} bills
 * @returns {import("./cod").CodTripSummary}
 */
function summarizeTripCod(bills) {
  const rows = Array.isArray(bills) ? bills : [];
  const summary = {
    cod_bill_count: 0,
    expected_total: 0,
    collected_total: 0,
    cash_total: 0,
    transfer_total: 0,
    variance_total: 0,
    pending_count: 0,
    short_count: 0,
    over_count: 0,
  };
  for (const row of rows) {
    const expected = toKip(row?.cod_amount);
    if (expected <= 0) continue;
    // ບິນຍົກເລີກ (status=2) ບໍ່ໄດ້ສົ່ງ ຈຶ່ງບໍ່ມີເງິນຕ້ອງເກັບ
    if (Number(row?.status ?? 0) === 2) continue;
    summary.cod_bill_count += 1;
    summary.expected_total += expected;
    const status = codSettlementStatus({ expected, collected: row?.collected_amount });
    if (status === "pending") {
      summary.pending_count += 1;
      continue;
    }
    const collected = toKip(row?.collected_amount);
    summary.collected_total += collected;
    summary.variance_total += collected - expected;
    const method = normalizePaymentMethod(row?.payment_method);
    // "ປົນ" ນັບເປັນເງິນສົດ ເພາະສ່ວນທີ່ຕ້ອງມອບໃຫ້ການເງິນຄືເງິນສົດ ແລະ ເລກ
    // ອ້າງອີງບອກສ່ວນທີ່ໂອນແລ້ວ — ຄວາມລະອຽດກວ່ານີ້ຕ້ອງແຍກ 2 ຊ່ອງ ຈຶ່ງເກັບ
    // ໄວ້ຕອນມີຄວາມຕ້ອງການຈິງ.
    if (method === "transfer") summary.transfer_total += collected;
    else summary.cash_total += collected;
    if (status === "short") summary.short_count += 1;
    else if (status === "over") summary.over_count += 1;
  }
  return summary;
}

module.exports = {
  COD_DOC_FORMAT_PREFIX,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  METHODS_REQUIRING_REFERENCE,
  KIP_TOLERANCE,
  isCodDocFormat,
  normalizePaymentMethod,
  paymentMethodLabel,
  toKip,
  codSettlementStatus,
  codVariance,
  validateCodCollection,
  summarizeTripCod,
};

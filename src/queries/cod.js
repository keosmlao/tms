// ── COD (ເກັບເງິນປາຍທາງ) — ຊັ້ນຂໍ້ມູນ ──────────────────────────────────────
//
// ຫຼັກການ: **ERP ເປັນເຈົ້າຂອງຄວາມຈິງ** ວ່າບິນໃດຕ້ອງເກັບເງິນ ແລະ ເທົ່າໃດ.
// ic_trans.doc_format_code ທີ່ຂຶ້ນຕົ້ນດ້ວຍ "COD" ຄືບິນເກັບເງິນປາຍທາງ
// (CODPB/CODCE/CODAC/CODSP — ເບິ່ງ lib/cod.js) ແລະ ຍອດທີ່ຕ້ອງເກັບ =
// ic_trans.total_amount. TMS ບໍ່ຄິດຍອດເອງ ພຽງແຕ່ຄັດລອກມາເກັບໄວ້ທີ່
// odg_tms_detail.cod_amount ຕອນບິນຖືກຈັດຂຶ້ນຖ້ຽວ ເພື່ອໃຫ້:
//   1. ຄົນຂັບເຫັນ "ຕ້ອງເກັບ X ກີບ" ໃນແອັບ ໂດຍບໍ່ຕ້ອງຍິງ ERP ຕໍ່ບິນ
//   2. ຍອດຄົງທີ່ ຕໍ່ໃຫ້ ERP ແກ້ບິນພາຍຫຼັງ — ກະທົບຍອດເງິນຈຶ່ງອ້າງອີງໄດ້
//
// ຄໍລຳທີ່ກ່ຽວຂ້ອງຢູ່ odg_tms_detail (DDL ຢູ່ queries/delivery.js):
//   cod_amount           ຕ້ອງເກັບເທົ່າໃດ (ຄັດຈາກ ERP)
//   collected_amount     ເກັບໄດ້ຈິງເທົ່າໃດ (ຄົນຂັບບັນທຶກຕອນປິດບິນ)
//   payment_method       cash | transfer | mixed | none
//   cod_reference        ເລກສະລິບ/ອ້າງອີງ ຕອນໂອນ
//   cod_variance_reason  ເຫດຜົນ ຕອນເກັບບໍ່ຄົບ/ເກີນ
//   collected_at         ເວລາທີ່ບັນທຶກ
"use strict";

const { userError } = require("../lib/action-error");
const { pool, query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const { COD_DOC_FORMAT_PREFIX, summarizeTripCod, toKip } = require("../lib/cod");
const { getBranchScope, branchFilterJob } = require("./helpers");

// SQL ທີ່ບອກວ່າ ic_trans ແຖວນີ້ເປັນບິນ COD ບໍ — ນິຍາມບ່ອນດຽວ ໃຊ້ທຸກຄຳຂໍ.
// ໃຊ້ upper()+like ແທນ ILIKE ເພື່ອໃຫ້ຄືກັບ isCodDocFormat() ໃນ lib/cod.js ແປະໆ.
function codDocFormatSql(alias = "t") {
  return `upper(TRIM(${alias}.doc_format_code)) LIKE '${COD_DOC_FORMAT_PREFIX}%'`;
}

async function ensureCodSchema() {
  const { ensureDeliveryWorkflowSchema } = require("./delivery");
  await ensureDeliveryWorkflowSchema();
}

/**
 * ຄັດຍອດ COD ຈາກ ERP ມາໃສ່ແຖວຈັດສົ່ງ.
 *
 * ເອີ້ນຕອນສ້າງ/ແກ້ຖ້ຽວ (ພາຍໃນ transaction ດຽວກັນ ຈຶ່ງຮັບ client ໄດ້) ແລະ
 * ຈາກ syncCodAmountsForOpenTrips() ສຳລັບຖ້ຽວເກົ່າ.
 *
 * ຂຽນທັບສະເພາະແຖວທີ່ **ຍັງບໍ່ໄດ້ເກັບເງິນ** (collected_at IS NULL) — ບິນທີ່
 * ຄົນຂັບປິດແລ້ວຕ້ອງຄົງຍອດເດີມໄວ້ ບໍ່ດັ່ງນັ້ນການແກ້ບິນຢູ່ ERP ຈະໄປປ່ຽນ
 * ປະຫວັດການເກັບເງິນທີ່ກະທົບຍອດໄປແລ້ວ.
 *
 * @param {string[]} billNos
 * @param {import("pg").PoolClient | null} client
 * @returns {Promise<number>} ຈຳນວນແຖວທີ່ອັບເດດ
 */
async function syncCodAmounts(billNos, client = null) {
  const bills = Array.from(
    new Set((billNos ?? []).map((b) => String(b ?? "").trim()).filter(Boolean))
  );
  if (bills.length === 0) return 0;
  const db = client ?? pool;
  const result = await db.query(
    `UPDATE public.odg_tms_detail d
     SET cod_amount = CASE WHEN ${codDocFormatSql("t")} THEN COALESCE(t.total_amount, 0) ELSE 0 END
     FROM ic_trans t
     WHERE t.doc_no = d.bill_no
       AND d.bill_no = ANY($1::varchar[])
       AND d.collected_at IS NULL
       AND ${getFixedYearSqlFilter("d.doc_date")}
       AND COALESCE(d.cod_amount, 0)
           IS DISTINCT FROM
           CASE WHEN ${codDocFormatSql("t")} THEN COALESCE(t.total_amount, 0) ELSE 0 END`,
    [bills]
  );
  return result.rowCount ?? 0;
}

// ຖ້ຽວທີ່ສ້າງກ່ອນມີ feature ນີ້ ຫຼື ບິນທີ່ ERP ແກ້ພາຍຫຼັງ ຍັງບໍ່ມີຍອດ COD.
// ກວາດໃຫ້ຄົບຕອນມີຄົນເປີດໜ້າ — throttle ຄືກັບ branch-leg.js.
//
// ⚠️ ບໍ່ກັ່ນຕອງດ້ວຍ job_status ໂດຍເຈດຕະນາ: **ການມອບເງິນເກີດຫຼັງປິດຖ້ຽວ**.
// ຮຸ່ນທຳອິດກັນສະເພາະຖ້ຽວທີ່ຍັງເປີດ (job_status NOT IN (4,5)) ຜົນຄື ບິນ COD
// ທຸກໃບຢູ່ຖ້ຽວທີ່ປິດແລ້ວ ຈຶ່ງບໍ່ເຄີຍໄດ້ຍອດ ແລະ ໜ້າກະທົບຍອດຫວ່າງເປົ່າ.
// ຕົວກັນທີ່ແທ້ຈິງແມ່ນ collected_at IS NULL (ບິນທີ່ບັນທຶກເງິນແລ້ວ ຫ້າມແຕະ).
const SYNC_THROTTLE_MS = 60_000;
const codCache = globalThis;
function throttleState() {
  if (!codCache.__tmsCodSync) codCache.__tmsCodSync = { lastRunAt: 0, inflight: null };
  return codCache.__tmsCodSync;
}

async function runOpenTripSync() {
  await ensureCodSchema();
  const result = await pool.query(
    `UPDATE public.odg_tms_detail d
     SET cod_amount = CASE WHEN ${codDocFormatSql("t")} THEN COALESCE(t.total_amount, 0) ELSE 0 END
     FROM ic_trans t
     WHERE t.doc_no = d.bill_no
       AND d.collected_at IS NULL
       AND ${getFixedYearSqlFilter("d.doc_date")}
       AND COALESCE(d.cod_amount, 0)
           IS DISTINCT FROM
           CASE WHEN ${codDocFormatSql("t")} THEN COALESCE(t.total_amount, 0) ELSE 0 END`
  );
  const updated = result.rowCount ?? 0;
  if (updated > 0) console.log(`[cod] synced cod_amount on ${updated} row(s)`);
  return { updated };
}

/**
 * ອັບເດດຍອດ COD ຂອງທຸກຖ້ຽວທີ່ຍັງເປີດ (throttled, ບໍ່ throw).
 * @param {{ force?: boolean }} [opts]
 */
async function syncCodAmountsForOpenTrips({ force = false } = {}) {
  const state = throttleState();
  if (state.inflight) return state.inflight;
  if (!force && Date.now() - state.lastRunAt < SYNC_THROTTLE_MS) {
    return { updated: 0, skipped: true };
  }
  state.inflight = runOpenTripSync()
    .catch((err) => {
      console.error("[cod] sync failed:", err);
      return { updated: 0, error: String(err?.message ?? err) };
    })
    .finally(() => {
      state.lastRunAt = Date.now();
      state.inflight = null;
    });
  return state.inflight;
}

/**
 * ບິນໃດແດ່ໃນຊຸດນີ້ເປັນ COD ແລະ ຕ້ອງເກັບເທົ່າໃດ — ອ່ານຈາກ ERP ໂດຍກົງ.
 * ໃຊ້ຢູ່ໜ້າຈັດຖ້ຽວ/ຄິວ ບ່ອນທີ່ບິນຍັງບໍ່ທັນມີແຖວ odg_tms_detail.
 * @param {string[]} billNos
 * @returns {Promise<Map<string, { cod_amount: number, doc_format_code: string }>>}
 */
async function getCodAmountMap(billNos) {
  const bills = Array.from(
    new Set((billNos ?? []).map((b) => String(b ?? "").trim()).filter(Boolean))
  );
  const map = new Map();
  if (bills.length === 0) return map;
  const rows = await query(
    `SELECT t.doc_no,
            COALESCE(t.total_amount, 0)::numeric AS cod_amount,
            COALESCE(NULLIF(TRIM(t.doc_format_code), ''), '') AS doc_format_code
     FROM ic_trans t
     WHERE t.doc_no = ANY($1::varchar[])
       AND ${codDocFormatSql("t")}`,
    [bills]
  );
  for (const row of rows) {
    map.set(row.doc_no, {
      cod_amount: toKip(row.cod_amount),
      doc_format_code: row.doc_format_code,
    });
  }
  return map;
}

// ແຖວບິນ COD ຂອງ 1 ຖ້ຽວ — ໃຊ້ທັງໜ້າກະທົບຍອດ ແລະ ສະຫຼຸບໃນແອັບ.
async function getTripCodBills(docNo, client = null) {
  const db = client ?? pool;
  const { rows } = await db.query(
    `SELECT d.bill_no,
            COALESCE(d.cod_amount, 0)::numeric AS cod_amount,
            d.collected_amount,
            COALESCE(d.payment_method, '') AS payment_method,
            COALESCE(d.cod_reference, '') AS cod_reference,
            COALESCE(d.cod_variance_reason, '') AS cod_variance_reason,
            to_char(d.collected_at, 'DD-MM-YYYY HH24:MI') AS collected_at,
            COALESCE(d.status, 0)::int AS status,
            COALESCE(NULLIF(TRIM(c.name_1), ''), d.cust_code, '') AS cust_name
     FROM public.odg_tms_detail d
     LEFT JOIN ar_customer c ON c.code = d.cust_code
     WHERE d.doc_no = $1
       AND COALESCE(d.cod_amount, 0) > 0
       AND ${getFixedYearSqlFilter("d.doc_date")}
     ORDER BY d.roworder`,
    [docNo]
  );
  return rows;
}

/**
 * ສະຫຼຸບເງິນ COD ຂອງ 1 ຖ້ຽວ + ລາຍການບິນ + ສະຖານະການມອບເງິນ.
 * @param {string} docNo
 */
async function getTripCodSummary(docNo) {
  await ensureCodSchema();
  const doc = String(docNo ?? "").trim();
  if (!doc) return null;
  const [bills, handover] = await Promise.all([
    getTripCodBills(doc),
    queryOne(
      `SELECT doc_no,
              COALESCE(expected_amount, 0)::numeric AS expected_amount,
              COALESCE(counted_amount, 0)::numeric AS counted_amount,
              COALESCE(variance_reason, '') AS variance_reason,
              COALESCE(remark, '') AS remark,
              COALESCE(received_by, '') AS received_by,
              to_char(received_at, 'DD-MM-YYYY HH24:MI') AS received_at
       FROM public.odg_tms_cod_handover WHERE doc_no = $1`,
      [doc]
    ),
  ]);
  return {
    doc_no: doc,
    summary: summarizeTripCod(bills),
    bills,
    handover: handover ?? null,
  };
}

/**
 * ການເງິນຮັບເງິນສົດຈາກຄົນຂັບ. counted = ຍອດທີ່ນັບໄດ້ຈິງຕໍ່ໜ້າ.
 * ຕ່າງຈາກຍອດທີ່ລະບົບຄິດໄດ້ → ຕ້ອງມີເຫດຜົນ.
 * @param {{ docNo: string, countedAmount: unknown, varianceReason?: string|null, remark?: string|null, receivedBy?: string|null }} input
 */
async function recordCodHandover(input) {
  await ensureCodSchema();
  const doc = String(input?.docNo ?? "").trim();
  if (!doc) throw new Error("doc_no is required");
  const bills = await getTripCodBills(doc);
  const summary = summarizeTripCod(bills);
  if (summary.cod_bill_count === 0) {
    throw userError("ຖ້ຽວນີ້ບໍ່ມີບິນເກັບເງິນປາຍທາງ");
  }
  if (summary.pending_count > 0) {
    throw userError(
      `ຍັງມີ ${summary.pending_count} ບິນທີ່ຄົນຂັບບໍ່ທັນບັນທຶກການເກັບເງິນ — ປິດບິນໃຫ້ຄົບກ່ອນ`
    );
  }
  const counted = toKip(input?.countedAmount);
  if (counted < 0) throw userError("ຍອດທີ່ນັບໄດ້ຕ້ອງບໍ່ຕິດລົບ");
  // ການເງິນຮັບສະເພາະ "ເງິນສົດ" — ສ່ວນທີ່ລູກຄ້າໂອນເຂົ້າບັນຊີແລ້ວ ບໍ່ໄດ້ຜ່ານມືຄົນຂັບ
  const expected = summary.cash_total;
  const reason = String(input?.varianceReason ?? "").trim();
  if (counted !== expected && !reason) {
    const diff = Math.abs(counted - expected).toLocaleString("en-US");
    throw userError(
      counted < expected
        ? `ເງິນຂາດ ${diff} ກີບ ທຽບກັບທີ່ຄວນມອບ — ຕ້ອງລະບຸເຫດຜົນ`
        : `ເງິນເກີນ ${diff} ກີບ ທຽບກັບທີ່ຄວນມອບ — ຕ້ອງລະບຸເຫດຜົນ`
    );
  }
  const driver = await queryOne(
    `SELECT COALESCE(driver, '') AS driver FROM public.odg_tms WHERE doc_no = $1`,
    [doc]
  );
  await query(
    `INSERT INTO public.odg_tms_cod_handover
       (doc_no, driver_code, expected_amount, counted_amount, variance_reason, remark, received_by, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, LOCALTIMESTAMP(0))
     ON CONFLICT (doc_no) DO UPDATE
       SET expected_amount = EXCLUDED.expected_amount,
           counted_amount = EXCLUDED.counted_amount,
           variance_reason = EXCLUDED.variance_reason,
           remark = EXCLUDED.remark,
           received_by = EXCLUDED.received_by,
           received_at = LOCALTIMESTAMP(0)`,
    [
      doc,
      driver?.driver ?? null,
      expected,
      counted,
      reason || null,
      String(input?.remark ?? "").trim() || null,
      input?.receivedBy ? String(input.receivedBy) : null,
    ]
  );
  return { success: true, doc_no: doc, expected_amount: expected, counted_amount: counted };
}

/**
 * ຍົກເລີກການມອບເງິນ (ມອບຜິດຖ້ຽວ / ນັບຜິດ) — ລົບແຖວອອກໃຫ້ມອບໃໝ່ໄດ້.
 * @param {string} docNo
 */
async function deleteCodHandover(docNo) {
  await ensureCodSchema();
  const doc = String(docNo ?? "").trim();
  if (!doc) throw new Error("doc_no is required");
  await query(`DELETE FROM public.odg_tms_cod_handover WHERE doc_no = $1`, [doc]);
  return { success: true };
}

/**
 * ໜ້າກະທົບຍອດເງິນ COD: 1 ແຖວ = 1 ຖ້ຽວ ທີ່ມີບິນ COD ໃນຊ່ວງວັນທີ່ເລືອກ.
 * ຈັດລຳດັບໃຫ້ຖ້ຽວທີ່ **ຍັງບໍ່ໄດ້ມອບເງິນ** ຂຶ້ນກ່ອນ ເພາະນັ້ນຄືວຽກທີ່ຄ້າງ.
 *
 * @param {object} session
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate   YYYY-MM-DD
 * @param {{ onlyOutstanding?: boolean }} [opts]
 */
async function getCodReconciliation(session, fromDate, toDate, opts = {}) {
  await ensureCodSchema();
  const scope = getBranchScope(session);
  const rows = await query(
    `WITH cod AS (
       SELECT d.doc_no,
              COUNT(*)::int AS cod_bill_count,
              SUM(COALESCE(d.cod_amount, 0))::numeric AS expected_total,
              SUM(COALESCE(d.collected_amount, 0))::numeric AS collected_total,
              SUM(CASE WHEN COALESCE(d.payment_method,'') = 'transfer'
                       THEN COALESCE(d.collected_amount, 0) ELSE 0 END)::numeric AS transfer_total,
              SUM(CASE WHEN COALESCE(d.payment_method,'') <> 'transfer'
                       THEN COALESCE(d.collected_amount, 0) ELSE 0 END)::numeric AS cash_total,
              COUNT(*) FILTER (WHERE d.collected_at IS NULL)::int AS pending_count,
              COUNT(*) FILTER (
                WHERE d.collected_at IS NOT NULL
                  AND COALESCE(d.collected_amount, 0) < COALESCE(d.cod_amount, 0) - 1
              )::int AS short_count,
              -- ສ່ວນຕ່າງນັບສະເພາະບິນທີ່ **ບັນທຶກການເກັບເງິນແລ້ວ**. ຖ້າລວມບິນ
              -- ທີ່ຍັງບໍ່ບັນທຶກນຳ ຈະອອກມາຕິດລົບເທົ່າກັບຍອດເຕັມ ແລ້ວອ່ານຄືກັບ
              -- ວ່າຄົນຂັບເອົາເງິນໄປ ທັງທີ່ພຽງແຕ່ຍັງບໍ່ໄດ້ບັນທຶກ.
              SUM(CASE WHEN d.collected_at IS NOT NULL
                       THEN COALESCE(d.collected_amount, 0) - COALESCE(d.cod_amount, 0)
                       ELSE 0 END)::numeric AS variance_total
       FROM public.odg_tms_detail d
       WHERE COALESCE(d.cod_amount, 0) > 0
         AND COALESCE(d.status, 0) <> 2
         AND ${getFixedYearSqlFilter("d.doc_date")}
       GROUP BY d.doc_no
     )
     SELECT j.doc_no,
            to_char(j.date_logistic, 'DD-MM-YYYY') AS date_logistic,
            to_char(j.date_logistic, 'YYYY-MM-DD') AS date_logistic_iso,
            COALESCE(NULLIF(TRIM(dr.name_1), ''), j.driver, '') AS driver_name,
            COALESCE(j.driver, '') AS driver_code,
            COALESCE(NULLIF(TRIM(car.name_1), ''), j.car, '') AS car_name,
            COALESCE(j.origin_transport_code, '') AS transport_code,
            COALESCE(NULLIF(TRIM(tt.name_1), ''), j.origin_transport_code, '') AS transport_name,
            COALESCE(j.job_status, 0)::int AS job_status,
            cod.cod_bill_count, cod.expected_total, cod.collected_total,
            cod.cash_total, cod.transfer_total, cod.pending_count, cod.short_count,
            cod.variance_total,
            h.doc_no IS NOT NULL AS handed_over,
            COALESCE(h.counted_amount, 0)::numeric AS counted_amount,
            COALESCE(h.received_by, '') AS received_by,
            to_char(h.received_at, 'DD-MM-YYYY HH24:MI') AS received_at,
            COALESCE(h.variance_reason, '') AS handover_variance_reason
     FROM cod
     JOIN public.odg_tms j ON j.doc_no = cod.doc_no
     LEFT JOIN public.odg_tms_driver dr ON dr.code = j.driver
     LEFT JOIN public.odg_tms_car car ON car.code = j.car
     LEFT JOIN public.transport_type tt ON tt.code = j.origin_transport_code
     LEFT JOIN public.odg_tms_cod_handover h ON h.doc_no = cod.doc_no
     WHERE j.date_logistic BETWEEN $1::date AND $2::date
       ${opts?.onlyOutstanding ? "AND h.doc_no IS NULL" : ""}
       ${branchFilterJob(scope, "j")}
       AND ${getFixedYearSqlFilter("j.doc_date")}
     ORDER BY (h.doc_no IS NOT NULL) ASC, j.date_logistic DESC, j.doc_no DESC`,
    [fromDate, toDate]
  );
  const totals = rows.reduce(
    (acc, row) => {
      acc.expected_total += Number(row.expected_total ?? 0);
      acc.collected_total += Number(row.collected_total ?? 0);
      acc.cash_total += Number(row.cash_total ?? 0);
      acc.transfer_total += Number(row.transfer_total ?? 0);
      acc.pending_count += Number(row.pending_count ?? 0);
      acc.trip_count += 1;
      if (!row.handed_over) acc.outstanding_cash += Number(row.cash_total ?? 0);
      else acc.handed_over_count += 1;
      return acc;
    },
    {
      trip_count: 0,
      expected_total: 0,
      collected_total: 0,
      cash_total: 0,
      transfer_total: 0,
      pending_count: 0,
      outstanding_cash: 0,
      handed_over_count: 0,
    }
  );
  return { rows, totals };
}

/**
 * ລາຍງານ COD ຕໍ່ຄົນຂັບ ໃນຊ່ວງວັນທີ່ເລືອກ — ໃຊ້ຢູ່ໜ້າລາຍງານ.
 * @param {object} session
 * @param {string} fromDate
 * @param {string} toDate
 */
async function getCodByDriver(session, fromDate, toDate) {
  await ensureCodSchema();
  const scope = getBranchScope(session);
  return query(
    `SELECT COALESCE(NULLIF(TRIM(dr.name_1), ''), j.driver, '-') AS driver_name,
            COALESCE(j.driver, '') AS driver_code,
            COUNT(DISTINCT j.doc_no)::int AS trip_count,
            COUNT(*)::int AS cod_bill_count,
            SUM(COALESCE(d.cod_amount, 0))::numeric AS expected_total,
            SUM(COALESCE(d.collected_amount, 0))::numeric AS collected_total,
            SUM(CASE WHEN COALESCE(d.payment_method,'') = 'transfer'
                     THEN COALESCE(d.collected_amount, 0) ELSE 0 END)::numeric AS transfer_total,
            SUM(CASE WHEN COALESCE(d.payment_method,'') <> 'transfer'
                     THEN COALESCE(d.collected_amount, 0) ELSE 0 END)::numeric AS cash_total,
            COUNT(*) FILTER (WHERE d.collected_at IS NULL)::int AS pending_count,
            -- ຍອດທີ່ຄວນເກັບ ສະເພາະບິນທີ່ບັນທຶກແລ້ວ — ໃຊ້ຄູ່ກັບ variance_total
            SUM(CASE WHEN d.collected_at IS NOT NULL
                     THEN COALESCE(d.cod_amount, 0) ELSE 0 END)::numeric AS recorded_expected_total,
            -- ສ່ວນຕ່າງນັບສະເພາະບິນທີ່ບັນທຶກແລ້ວ (ເບິ່ງເຫດຜົນທີ່ getCodReconciliation)
            SUM(CASE WHEN d.collected_at IS NOT NULL
                     THEN COALESCE(d.collected_amount, 0) - COALESCE(d.cod_amount, 0)
                     ELSE 0 END)::numeric AS variance_total
     FROM public.odg_tms_detail d
     JOIN public.odg_tms j ON j.doc_no = d.doc_no
     LEFT JOIN public.odg_tms_driver dr ON dr.code = j.driver
     WHERE COALESCE(d.cod_amount, 0) > 0
       AND COALESCE(d.status, 0) <> 2
       AND j.date_logistic BETWEEN $1::date AND $2::date
       ${branchFilterJob(scope, "j")}
       AND ${getFixedYearSqlFilter("d.doc_date")}
       AND ${getFixedYearSqlFilter("j.doc_date")}
     GROUP BY 1, 2
     ORDER BY expected_total DESC`,
    [fromDate, toDate]
  );
}

module.exports = {
  codDocFormatSql,
  ensureCodSchema,
  syncCodAmounts,
  syncCodAmountsForOpenTrips,
  getCodAmountMap,
  getTripCodBills,
  getTripCodSummary,
  recordCodHandover,
  deleteCodHandover,
  getCodReconciliation,
  getCodByDriver,
};

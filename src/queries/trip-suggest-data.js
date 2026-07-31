// ບິນທີ່ລໍຖ້າຈັດຖ້ຽວ ພ້ອມພິກັດ + ລົດທີ່ວ່າງ — ອ່ານຢ່າງດຽວ.
//
// ໃຊ້ຄູ່ກັບ src/lib/trip-suggest.ts (ຕົວຄິດ) — ໄຟລ໌ນີ້ດຶງຂໍ້ມູນເທົ່ານັ້ນ.
const { query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");

/**
 * ບິນລໍຈັດຖ້ຽວຂອງສາຂາໜຶ່ງ ພ້ອມພິກັດ (ປັກໝຸດເອງ → ຈຸດສົ່ງຄັ້ງກ່ອນ → ທະບຽນ).
 *
 * ບິນທີ່ຢູ່ໃນຖ້ຽວແລ້ວ (odg_tms_detail) ຖືກຕັດອອກ — ບໍ່ດັ່ງນັ້ນຈະແນະນຳໃຫ້
 * ຈັດຊ້ຳ ເຊິ່ງເປັນຮູຮົ່ວແບບດຽວກັບທີ່ເຄີຍເຮັດໃຫ້ 461 ບິນຖືກຈັດຫຼາຍຖ້ຽວ.
 *
 * @param {{ branch?: string, limit?: number }} opts
 */
async function getSuggestCandidates(opts = {}) {
  const branch = String(opts.branch ?? "").trim();
  const limit = Math.min(Math.max(Number(opts.limit ?? 200), 1), 500);
  const params = [];
  let branchWhere = "";
  if (branch && branch !== "all") {
    params.push(branch);
    branchWhere = ` AND COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code, '') = $${params.length}`;
  }
  params.push(limit);

  return query(
    `SELECT a.doc_no AS bill_no,
            to_char(a.doc_date, 'DD-MM-YYYY') AS bill_date,
            COALESCE(a.cust_code, '') AS cust_code,
            COALESCE(NULLIF(TRIM(c.name_1), ''), a.cust_code, '-') AS cust_name,
            COALESCE(NULLIF(TRIM(pb.transport_code), ''), a.transport_code, '') AS transport_code,
            COALESCE(
              NULLIF(TRIM(pb.planned_lat::text), ''),
              NULLIF(TRIM(cp.lat::text), ''),
              NULLIF(TRIM(acd.latitude::text), ''),
              ''
            ) AS lat,
            COALESCE(
              NULLIF(TRIM(pb.planned_lng::text), ''),
              NULLIF(TRIM(cp.lng::text), ''),
              NULLIF(TRIM(acd.longitude::text), ''),
              ''
            ) AS lng,
            CASE
              WHEN NULLIF(TRIM(pb.planned_lat::text), '') IS NOT NULL THEN 'planned'
              WHEN NULLIF(TRIM(cp.lat::text), '') IS NOT NULL THEN 'last'
              WHEN NULLIF(TRIM(acd.latitude::text), '') IS NOT NULL THEN 'customer'
              ELSE ''
            END AS point_source
       FROM ic_trans_shipment a
       LEFT JOIN ar_customer c ON c.code = a.cust_code
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.doc_no
       LEFT JOIN public.odg_tms_customer_point cp ON cp.cust_code = a.cust_code
       LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
      WHERE a.trans_flag = 44
        AND ${getFixedYearSqlFilter("a.doc_date")}
        AND NOT EXISTS (
          SELECT 1 FROM public.odg_tms_detail d
           WHERE d.bill_no = a.doc_no AND ${getFixedYearSqlFilter("d.doc_date")}
        )
        ${branchWhere}
      ORDER BY a.doc_date, a.doc_no
      LIMIT $${params.length}`,
    params
  );
}

/** ລົດທີ່ຮູ້ຂະໜາດຕູ້ ພ້ອມພື້ນທີ່ໃຊ້ໄດ້ (m³) */
async function getFleetCapacity() {
  return query(
    `SELECT code,
            COALESCE(NULLIF(TRIM(name_1), ''), code) AS name,
            ROUND((cargo_width_cm / 100) * (cargo_length_cm / 100) * (cargo_height_cm / 100)
                  * COALESCE(stowage_pct, 80) / 100, 3)::numeric AS usable_m3,
            COALESCE(capacity_verified, false) AS verified
       FROM public.odg_tms_car
      WHERE cargo_width_cm > 0 AND cargo_length_cm > 0 AND cargo_height_cm > 0
      ORDER BY usable_m3 DESC`
  );
}

module.exports = { getSuggestCandidates, getFleetCapacity };

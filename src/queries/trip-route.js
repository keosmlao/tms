// ຈຸດສົ່ງຂອງແຕ່ລະຖ້ຽວ ພ້ອມພິກັດ — ອ່ານຢ່າງດຽວ ສຳລັບການຈັດລຳດັບເສັ້ນທາງ.
//
// ພິກັດຂອງ 1 ບິນ ມາໄດ້ 3 ທາງ ຈຶ່ງເລືອກຕາມລຳດັບຄວາມໜ້າເຊື່ອຖື:
//   1. planned  — ຄົນຈັດຖ້ຽວປັກໝຸດເອງ (ແມ່ນຍຳສຸດ ເພາະຕັ້ງໃຈປັກໃຫ້ບິນນີ້)
//   2. last     — ຈຸດທີ່ເຄີຍສົ່ງໃຫ້ລູກຄ້ານີ້ຄັ້ງລ່າສຸດ (GPS ຕອນປິດບິນ)
//   3. customer — ພິກັດໃນທະບຽນລູກຄ້າ (ເກົ່າ ແລະ ມີພຽງ 251 ລາຍ)
const { query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");

/**
 * ຫົວຖ້ຽວ + ບິນທຸກໃບພ້ອມພິກັດ.
 *
 * @param {string} docNo
 * @returns {Promise<{
 *   doc_no: string,
 *   origin_transport_code: string,
 *   stops: Array<{
 *     bill_no: string, cust_code: string, cust_name: string,
 *     lat: string, lng: string, point_source: string,
 *     roworder: number, item_count: number
 *   }>
 * }>}
 */
async function getTripStops(docNo) {
  const doc = String(docNo ?? "").trim();
  if (!doc) return { doc_no: "", origin_transport_code: "", stops: [] };

  const [head] = await query(
    `SELECT COALESCE(origin_transport_code, '') AS origin_transport_code
       FROM public.odg_tms
      WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}
      LIMIT 1`,
    [doc]
  );

  const stops = await query(
    `SELECT d.bill_no,
            COALESCE(d.cust_code, '') AS cust_code,
            COALESCE(NULLIF(TRIM(c.name_1), ''), d.cust_code, '-') AS cust_name,
            COALESCE(d.roworder, 0)::int AS roworder,
            COALESCE(cnt.n, 0)::int AS item_count,
            -- ລຳດັບຄວາມໜ້າເຊື່ອຖືຂອງພິກັດ (ເບິ່ງຫົວໄຟລ໌)
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
       FROM public.odg_tms_detail d
       LEFT JOIN ar_customer c ON c.code = d.cust_code
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN public.odg_tms_customer_point cp ON cp.cust_code = d.cust_code
       LEFT JOIN ar_customer_detail acd ON acd.ar_code = d.cust_code
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS n
           FROM public.odg_tms_detail_item i
          WHERE i.doc_no = d.doc_no AND i.bill_no = d.bill_no
       ) cnt ON true
      WHERE d.doc_no = $1 AND ${getFixedYearSqlFilter("d.doc_date")}
      ORDER BY d.roworder`,
    [doc]
  );

  return {
    doc_no: doc,
    origin_transport_code: String(head?.origin_transport_code ?? ""),
    stops: stops.map((s) => ({
      bill_no: String(s.bill_no ?? ""),
      cust_code: String(s.cust_code ?? ""),
      cust_name: String(s.cust_name ?? ""),
      lat: String(s.lat ?? ""),
      lng: String(s.lng ?? ""),
      point_source: String(s.point_source ?? ""),
      roworder: Number(s.roworder ?? 0),
      item_count: Number(s.item_count ?? 0),
    })),
  };
}

module.exports = { getTripStops };

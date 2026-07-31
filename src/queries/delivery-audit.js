// ກວດວ່າ "ຈຸດທີ່ຄົນຂັບກົດສຳເລັດ" ຢູ່ໃກ້ຈຸດສົ່ງຂອງລູກຄ້າບໍ — ອ່ານຢ່າງດຽວ.
//
// ⚠️ ອ່ານຜົນຢ່າງລະມັດລະວັງ: ຈຸດອ້າງອີງ (odg_tms_customer_point) ມາຈາກການ
// ສົ່ງຄັ້ງລ່າສຸດຂອງລູກຄ້ານັ້ນເອງ. ລູກຄ້າທີ່ມີຫຼາຍບ່ອນ (ຮ້ານ + ສາງ, ຫຼື
// ຍ້າຍທີ່) ຈະຫ່າງເປັນທຳມະດາ. ວັດແລ້ວ 60% ຂອງບິນຢູ່ໃນ 300 ແມັດ ແລະ ຄ່າກາງ
// 43 ແມັດ ສ່ວນອັນທີ່ໄກກະຈາຍຢູ່ຫຼາຍຄົນຂັບ (29, 27, 24 ບິນ...) ບໍ່ແມ່ນ
// ກະຈຸກຢູ່ຄົນດຽວ. ຈຶ່ງເປັນ "ລາຍການທີ່ຄວນເບິ່ງ" ບໍ່ແມ່ນ "ຫຼັກຖານ".
const { query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");

// ໄລຍະ haversine ໃນ SQL — ຄິດຢູ່ DB ເພື່ອບໍ່ຕ້ອງດຶງທຸກແຖວມາຄິດຢູ່ node
const DIST_KM_SQL = `
  6371 * 2 * asin(sqrt(
    power(sin(radians(cp.lat::numeric - d.lat_end::numeric) / 2), 2) +
    cos(radians(d.lat_end::numeric)) * cos(radians(cp.lat::numeric)) *
    power(sin(radians(cp.lng::numeric - d.lng_end::numeric) / 2), 2)
  ))`;

/**
 * ບິນທີ່ປິດຫ່າງຈາກຈຸດອ້າງອີງເກີນ minKm.
 *
 * @param {{ fromDate?: string, toDate?: string, minKm?: number, branch?: string, limit?: number }} opts
 */
async function getDeliveryLocationAudit(opts = {}) {
  const fromDate = String(opts.fromDate ?? "").trim();
  const toDate = String(opts.toDate ?? "").trim();
  const minKm = Number.isFinite(Number(opts.minKm)) ? Number(opts.minKm) : 2;
  const branch = String(opts.branch ?? "").trim();
  const limit = Math.min(Math.max(Number(opts.limit ?? 200), 1), 1000);

  const params = [minKm];
  let where = "";
  if (fromDate) {
    params.push(fromDate);
    where += ` AND d.doc_date >= $${params.length}::date`;
  }
  if (toDate) {
    params.push(toDate);
    where += ` AND d.doc_date <= $${params.length}::date`;
  }
  if (branch && branch !== "all") {
    params.push(branch);
    where += ` AND COALESCE(j.origin_transport_code, '') = $${params.length}`;
  }
  params.push(limit);

  return query(
    `SELECT d.bill_no,
            d.doc_no,
            to_char(d.doc_date, 'DD-MM-YYYY') AS doc_date,
            to_char(d.sent_end, 'DD-MM-YYYY HH24:MI') AS closed_at,
            COALESCE(d.cust_code, '') AS cust_code,
            COALESCE(NULLIF(TRIM(c.name_1), ''), d.cust_code, '-') AS cust_name,
            COALESCE(NULLIF(TRIM(dr.name_1), ''), j.driver, '-') AS driver_name,
            COALESCE(j.origin_transport_code, '') AS transport_code,
            COALESCE(NULLIF(TRIM(tt.name_1), ''), '') AS transport_name,
            d.lat_end, d.lng_end,
            cp.lat::text AS ref_lat, cp.lng::text AS ref_lng,
            COALESCE(cp.bill_no, '') AS ref_bill_no,
            to_char(cp.delivered_at, 'DD-MM-YYYY') AS ref_at,
            round(${DIST_KM_SQL}::numeric, 2) AS distance_km
       FROM public.odg_tms_detail d
       JOIN public.odg_tms_customer_point cp ON cp.cust_code = d.cust_code
       LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
       LEFT JOIN ar_customer c ON c.code = d.cust_code
       LEFT JOIN public.odg_tms_driver dr ON dr.code = j.driver
       LEFT JOIN public.transport_type tt ON tt.code = j.origin_transport_code
      WHERE d.status = 1
        AND COALESCE(NULLIF(TRIM(d.lat_end), ''), '') <> ''
        AND COALESCE(NULLIF(TRIM(d.lng_end), ''), '') <> ''
        -- ຢ່າທຽບບິນກັບຕົວມັນເອງ: ຈຸດອ້າງອີງອາດມາຈາກບິນໃບນີ້
        AND cp.bill_no <> d.bill_no
        AND ${getFixedYearSqlFilter("d.doc_date")}
        AND ${DIST_KM_SQL} > $1
        ${where}
      ORDER BY ${DIST_KM_SQL} DESC
      LIMIT $${params.length}`,
    params
  );
}

/** ສະຫຼຸບພາບລວມ — ໃຫ້ຮູ້ວ່າ "ໄກ" ເປັນສ່ວນນ້ອຍ ຫຼື ເປັນປົກກະຕິ */
async function getDeliveryLocationSummary(opts = {}) {
  const fromDate = String(opts.fromDate ?? "").trim();
  const toDate = String(opts.toDate ?? "").trim();
  const params = [];
  let where = "";
  if (fromDate) {
    params.push(fromDate);
    where += ` AND d.doc_date >= $${params.length}::date`;
  }
  if (toDate) {
    params.push(toDate);
    where += ` AND d.doc_date <= $${params.length}::date`;
  }

  const [row] = await query(
    `SELECT count(*)::int AS compared,
            count(*) FILTER (WHERE dist <= 0.3)::int AS within_300m,
            count(*) FILTER (WHERE dist > 0.3 AND dist <= 2)::int AS within_2km,
            count(*) FILTER (WHERE dist > 2 AND dist <= 20)::int AS within_20km,
            count(*) FILTER (WHERE dist > 20)::int AS beyond_20km,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dist)::numeric, 3) AS median_km
       FROM (
         SELECT ${DIST_KM_SQL} AS dist
           FROM public.odg_tms_detail d
           JOIN public.odg_tms_customer_point cp ON cp.cust_code = d.cust_code
          WHERE d.status = 1
            AND COALESCE(NULLIF(TRIM(d.lat_end), ''), '') <> ''
            AND COALESCE(NULLIF(TRIM(d.lng_end), ''), '') <> ''
            AND cp.bill_no <> d.bill_no
            AND ${getFixedYearSqlFilter("d.doc_date")}
            ${where}
       ) t`,
    params
  );

  // ບິນທີ່ປິດໂດຍບໍ່ມີ GPS ເລີຍ — ຊ່ອງວ່າງອີກແບບໜຶ່ງ
  const [noGps] = await query(
    `SELECT count(*)::int AS closed,
            count(*) FILTER (WHERE COALESCE(NULLIF(TRIM(lat_end), ''), '') = '')::int AS without_gps
       FROM public.odg_tms_detail d
      WHERE d.status = 1 AND ${getFixedYearSqlFilter("d.doc_date")} ${where}`,
    params
  );

  return {
    compared: Number(row?.compared ?? 0),
    within_300m: Number(row?.within_300m ?? 0),
    within_2km: Number(row?.within_2km ?? 0),
    within_20km: Number(row?.within_20km ?? 0),
    beyond_20km: Number(row?.beyond_20km ?? 0),
    median_km: Number(row?.median_km ?? 0),
    closed: Number(noGps?.closed ?? 0),
    without_gps: Number(noGps?.without_gps ?? 0),
  };
}

module.exports = { getDeliveryLocationAudit, getDeliveryLocationSummary };

// ຈຸດຕັ້ງຕົ້ນ (ສາງ) ຂອງແຕ່ລະສາຂາຂົນສົ່ງ — ອ່ານຢ່າງດຽວ.
//
// ບໍ່ມີໃຜເຄີຍປັກໝຸດສາງໄວ້: odg_tms_delivery_route.origin_lat ຫວ່າງທັງ 11 ສາຍ
// ແລະ transport_type ບໍ່ມີຄໍລຳພິກັດ. ແຕ່ລະບົບມີ GPS ຕອນລົດ "ເລີ່ມອອກຖ້ຽວ"
// ເກັບໄວ້ໃນ odg_tms.lat_start ຢູ່ແລ້ວ (02-0002 ມີ 1,022 ຄັ້ງ) ຈຶ່ງເອົາ
// ຄ່າກາງ (median) ຂອງມັນເປັນຈຸດສາງ.
//
// ເປັນຫຍັງໃຊ້ median ບໍ່ແມ່ນ average: ຄົນຂັບບາງຄົນກົດ "ເລີ່ມ" ຕອນອອກໄປໄກ
// ແລ້ວ — ຄ່າສະເລ່ຍຈະຖືກລາກອອກໄປຕາມ ແຕ່ median ບໍ່ສະເທືອນ.
const { query } = require("../lib/db");

const CACHE_TTL_MS = 10 * 60_000;
const cache = globalThis;

/**
 * ຈຸດສາງຕໍ່ລະຫັດສາຂາ: Map<transport_code, {lat, lng, samples}>
 *
 * ຕ້ອງມີຢ່າງໜ້ອຍ 5 ຄັ້ງຈຶ່ງເຊື່ອ — ນ້ອຍກວ່ານັ້ນອາດເປັນລົດທີ່ກົດເລີ່ມຜິດບ່ອນ
 * ພຽງເທື່ອດຽວ ແລ້ວກາຍເປັນ "ສາງ" ຂອງທັງສາຂາ.
 */
async function getBranchOrigins() {
  const hit = cache.__tmsBranchOrigins;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.map;

  const rows = await query(
    `SELECT COALESCE(NULLIF(TRIM(origin_transport_code), ''), '') AS code,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY lat_start::numeric) AS lat,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY lng_start::numeric) AS lng,
            count(*)::int AS samples
       FROM public.odg_tms
      WHERE COALESCE(NULLIF(TRIM(lat_start::text), ''), '') NOT IN ('', '0')
        AND COALESCE(NULLIF(TRIM(lng_start::text), ''), '') NOT IN ('', '0')
      GROUP BY 1
     HAVING count(*) >= 5`
  );

  const map = new Map();
  for (const row of rows) {
    const code = String(row.code ?? "").trim();
    if (!code) continue;
    map.set(code, {
      lat: Number(row.lat),
      lng: Number(row.lng),
      samples: Number(row.samples ?? 0),
    });
  }
  cache.__tmsBranchOrigins = { at: Date.now(), map };
  return map;
}

function invalidateBranchOrigins() {
  cache.__tmsBranchOrigins = null;
}

module.exports = { getBranchOrigins, invalidateBranchOrigins };

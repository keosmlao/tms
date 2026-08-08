const { query } = require("../lib/db");

/**
 * ແນະນຳວ່າບິນທີ່ຍັງລໍຈັດຖ້ຽວ ຄວນເຂົ້າ **ສາຍ** ໃດ.
 *
 * ເປັນໄປໄດ້ຍ້ອນເສັ້ນທາງຊຸດ `RTD*` ຖືກສ້າງຈາກຂອບເຂດເມືອງຈິງ. ປ້າຍເສັ້ນທາງ
 * ຊຸດເກົ່າ (`RT*`) ໃຊ້ບໍ່ໄດ້ເພາະຮ້ານດຽວກັນຖືກຕິດຫຼາຍສາຍປົນກັນ (RT020 ↔ RT042
 * ໃຊ້ຮ້ານຮ່ວມກັນ 63%) ຈຶ່ງເດົາໄດ້ໝັ້ນໃຈພຽງ 14%. ຊຸດໃໝ່ແນະນຳໄດ້ 97%.
 *
 * ລຳດັບແຫຼ່ງທີ່ໃຊ້ຕັດສິນ:
 *   1. `point`  — ຈຸດສົ່ງຈິງຈາກປະຫວັດ (median) → ໃກ້ໃຈກາງເມືອງໃດສຸດ
 *   2. `muang`  — ເມືອງໃນທະບຽນລູກຄ້າ (ໃຊ້ເມື່ອຮ້ານໃໝ່ ຍັງບໍ່ເຄີຍສົ່ງ)
 *   3. ບໍ່ຮູ້   — ປ່ອຍຫວ່າງ ດີກວ່າເດົາມົ້ວ
 */

/** ເມືອງ → ສາຍ. ຕ້ອງກົງກັບຊື່ເສັ້ນທາງ RTD01-04 ທີ່ສ້າງໄວ້. */
const DISTRICT_ROUTE = {
  ໄຊເສດຖາ: "RTD01",
  ສີສັດຕະນາກ: "RTD01",
  ຫາດຊາຍຟອງ: "RTD01",
  ຈັນທະບູລີ: "RTD02",
  ໄຊທານີ: "RTD03",
  ນາຊາຍທອງ: "RTD03",
  ສີໂຄດຕະບອງ: "RTD04",
};

const DEPOT_BRANCH = "02-0002"; // ຂົນສົ່ງດອນຕິ້ວ

const usable = (col) =>
  `NULLIF(TRIM(${col}), '') IS NOT NULL
   AND TRIM(${col}) ~ '^-?[0-9]+(\\.[0-9]+)?$'
   AND TRIM(${col})::numeric <> 0`;

const R = 6371;
const rad = Math.PI / 180;
function km(a, b) {
  const h =
    Math.sin(((b.la - a.la) * rad) / 2) ** 2 +
    Math.cos(a.la * rad) *
      Math.cos(b.la * rad) *
      Math.sin(((b.ln - a.ln) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ໃຈກາງແທ້ຂອງແຕ່ລະເມືອງ — ຄິດຈາກຈຸດປິດບິນຂອງດອນຕິ້ວ ບໍ່ແມ່ນຈາກ erp_amper
 *  ເຊິ່ງເກັບ lat/lng ເປັນ 0 ທັງໝົດ. */
async function districtCentres() {
  const rows = await query(
    `SELECT COALESCE(NULLIF(TRIM(a.name_1), ''), '') AS muang,
            AVG(TRIM(d.lat_end)::numeric) AS la,
            AVG(TRIM(d.lng_end)::numeric) AS ln,
            COUNT(*)::int AS n
       FROM public.odg_tms_detail d
       JOIN public.odg_tms t ON t.doc_no = d.doc_no
       LEFT JOIN public.ar_customer c ON c.code = d.cust_code
       LEFT JOIN public.erp_amper a ON a.code = NULLIF(TRIM(c.amper), '')
      WHERE TRIM(t.origin_transport_code) = $1
        AND d.status = 1
        AND ${usable("d.lat_end")} AND ${usable("d.lng_end")}
      GROUP BY 1`,
    [DEPOT_BRANCH]
  );
  const out = [];
  for (const r of rows ?? []) {
    const route = DISTRICT_ROUTE[String(r.muang ?? "").trim()];
    if (!route) continue;
    out.push({ muang: r.muang, route, la: Number(r.la), ln: Number(r.ln) });
  }
  return out;
}

/**
 * ບິນທີ່ຍັງລໍຈັດຖ້ຽວ ພ້ອມ **ສາຍທີ່ແນະນຳ** ແລະ **ຈຸດສົ່ງ**.
 *
 * ຈຸດສົ່ງໃຊ້ລຳດັບດຽວກັບໜ້າ pending ຢູ່ແລ້ວ (ໝຸດທີ່ຄົນປັກ → ຄັ້ງກ່ອນ →
 * ທະບຽນ) ຈຶ່ງບໍ່ຂັດກັນ.
 */
async function suggestRouteForPendingBills(billNos) {
  // ⚠️ ຕ້ອງຮັບລາຍການບິນມາຈາກໜ້າຈໍ ບໍ່ແມ່ນສະແກນຕາຕະລາງເອງ.
  //
  // ໜ້າ pending ນັບບິນຈາກ ic_trans_shipment ພ້ອມຊ່ວງວັນທີ່ + ຂອບເຂດສາຂາ +
  // ປີທີ່ກຳນົດ. ຮອບກ່ອນຂ້ອຍສະແກນ odg_tms_pending_bill ທັງຕາຕະລາງແທນ ແລ້ວ
  // ໄດ້ 334 ບິນ ທັງທີ່ໜ້າຈໍສະແດງ 33 — ຕົວເລກສອງບ່ອນຂັດກັນ ຄົນໃຊ້ເຊື່ອບໍ່ໄດ້.
  const codes = [
    ...new Set((billNos ?? []).map((b) => String(b ?? "").trim()).filter(Boolean)),
  ];
  if (codes.length === 0) return { routes: [], unassigned: 0, bills: [] };

  const centres = await districtCentres();
  if (centres.length === 0) return { routes: [], unassigned: 0, bills: [] };

  const rows = await query(
    `WITH last_point AS (
       SELECT d.cust_code,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY TRIM(d.lat_end)::numeric) AS la,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY TRIM(d.lng_end)::numeric) AS ln
         FROM public.odg_tms_detail d
        WHERE d.status = 1
          AND ${usable("d.lat_end")} AND ${usable("d.lng_end")}
        GROUP BY d.cust_code
     )
     SELECT pb.bill_no,
            COALESCE(ic.cust_code, '')                        AS cust_code,
            COALESCE(NULLIF(TRIM(c.name_1), ''), '')          AS cust_name,
            COALESCE(NULLIF(TRIM(a.name_1), ''), '')          AS muang,
            NULLIF(TRIM(pb.planned_lat::text), '')            AS planned_lat,
            NULLIF(TRIM(pb.planned_lng::text), '')            AS planned_lng,
            lp.la::text                                       AS last_lat,
            lp.ln::text                                       AS last_lng
       FROM public.odg_tms_pending_bill pb
       LEFT JOIN public.ic_trans ic ON ic.doc_no = pb.bill_no
       LEFT JOIN public.ar_customer c ON c.code = ic.cust_code
       LEFT JOIN public.erp_amper a ON a.code = NULLIF(TRIM(c.amper), '')
       LEFT JOIN last_point lp ON lp.cust_code = ic.cust_code
      WHERE pb.bill_no = ANY($1::varchar[])`,
    [codes]
  );

  const names = new Map(
    (
      await query(
        "SELECT code, name FROM public.odg_tms_delivery_route WHERE code LIKE 'RTD%'"
      )
    ).map((r) => [String(r.code), String(r.name)])
  );

  // ບາງບິນຍັງບໍ່ມີແຖວໃນ odg_tms_pending_bill (ຫາກໍເຂົ້າມາ) — ຕ້ອງໄດ້ຂໍ້ມູນ
  // ລູກຄ້າຈາກ ic_trans ໂດຍກົງ ບໍ່ດັ່ງນັ້ນມັນຫາຍໄປຈາກຄຳແນະນຳງຽບໆ.
  const seen = new Set((rows ?? []).map((r) => String(r.bill_no)));
  const missing = codes.filter((c) => !seen.has(c));
  if (missing.length > 0) {
    const extra = await query(
      `WITH last_point AS (
         SELECT d.cust_code,
                percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY TRIM(d.lat_end)::numeric) AS la,
                percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY TRIM(d.lng_end)::numeric) AS ln
           FROM public.odg_tms_detail d
          WHERE d.status = 1
            AND ${usable("d.lat_end")} AND ${usable("d.lng_end")}
          GROUP BY d.cust_code
       )
       SELECT ic.doc_no AS bill_no,
              COALESCE(ic.cust_code, '')               AS cust_code,
              COALESCE(NULLIF(TRIM(c.name_1), ''), '') AS cust_name,
              COALESCE(NULLIF(TRIM(a.name_1), ''), '') AS muang,
              NULL::text AS planned_lat, NULL::text AS planned_lng,
              lp.la::text AS last_lat, lp.ln::text AS last_lng
         FROM public.ic_trans ic
         LEFT JOIN public.ar_customer c ON c.code = ic.cust_code
         LEFT JOIN public.erp_amper a ON a.code = NULLIF(TRIM(c.amper), '')
         LEFT JOIN last_point lp ON lp.cust_code = ic.cust_code
        WHERE ic.doc_no = ANY($1::varchar[])`,
      [missing]
    );
    rows.push(...(extra ?? []));
  }

  const bills = (rows ?? []).map((r) => {
    const pLat = Number(r.planned_lat);
    const pLng = Number(r.planned_lng);
    const lLat = Number(r.last_lat);
    const lLng = Number(r.last_lng);
    // ໝຸດທີ່ຄົນປັກຊະນະ, ບໍ່ດັ່ງນັ້ນໃຊ້ຈຸດສົ່ງຄັ້ງກ່ອນ
    const point =
      Number.isFinite(pLat) && Number.isFinite(pLng) && pLat !== 0 && pLng !== 0
        ? { la: pLat, ln: pLng, source: "planned" }
        : Number.isFinite(lLat) && Number.isFinite(lLng) && lLat !== 0
          ? { la: lLat, ln: lLng, source: "last_delivery" }
          : null;

    let route = "";
    let by = "";
    if (point) {
      let best = Infinity;
      for (const c of centres) {
        const d = km(point, c);
        if (d < best) {
          best = d;
          route = c.route;
        }
      }
      by = "point";
    } else {
      const muang = String(r.muang ?? "").trim();
      if (DISTRICT_ROUTE[muang]) {
        route = DISTRICT_ROUTE[muang];
        by = "muang";
      }
    }

    // ຈຸດສົ່ງຈິງກັບເມືອງໃນທະບຽນບອກຄົນລະສາຍ = ທະບຽນລູກຄ້າອາດຜິດ ຫຼື ຮ້ານຍ້າຍ.
    // ບອກໃຫ້ຮູ້ ດີກວ່າປ່ຽນໃຫ້ງຽບໆ — ຄົນຈັດຖ້ຽວເປັນຜູ້ຕັດສິນ.
    const muang = String(r.muang ?? "").trim();
    const byDistrict = DISTRICT_ROUTE[muang] ?? "";
    const conflict = Boolean(
      by === "point" && byDistrict && byDistrict !== route
    );

    return {
      bill_no: String(r.bill_no ?? ""),
      cust_code: String(r.cust_code ?? ""),
      cust_name: String(r.cust_name ?? "").trim(),
      muang,
      route_code: route,
      route_name: route ? (names.get(route) ?? route) : "",
      // ວິທີທີ່ໄດ້ມາ — ໜ້າຈໍຄວນບອກຜູ້ໃຊ້ ບໍ່ໃຫ້ເຂົ້າໃຈວ່າຢືນຢັນແລ້ວ
      assigned_by: by,
      /** true = ຈຸດສົ່ງຈິງບໍ່ຕົງກັບເມືອງໃນທະບຽນ */
      district_conflict: conflict,
      district_route: byDistrict,
      lat: point ? String(point.la) : "",
      lng: point ? String(point.ln) : "",
      location_source: point?.source ?? "",
    };
  });

  const tally = new Map();
  for (const b of bills) {
    const k = b.route_code || "";
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const routes = [...names.entries()]
    .map(([code, name]) => ({ code, name, count: tally.get(code) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    routes,
    unassigned: tally.get("") ?? 0,
    bills,
  };
}

module.exports = {
  DISTRICT_ROUTE,
  districtCentres,
  suggestRouteForPendingBills,
};

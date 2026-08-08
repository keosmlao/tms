const { query } = require("../lib/db");

/**
 * ຮູບຮ່າງຈິງຂອງແຕ່ລະເສັ້ນທາງ ຄິດຈາກການສົ່ງທີ່ຜ່ານມາ.
 *
 * ໜ້າຕັ້ງຄ່າເສັ້ນທາງມີ 12 ເສັ້ນທາງທີ່ **ບໍ່ມີໝຸດຈັກອັນ** (0/2, 0/3) ແລະ
 * ໄລຍະເປັນຂີດໝົດ ເພາະຕ້ອງປັກດ້ວຍມືທີລະຈຸດ. ແຕ່ຂໍ້ມູນທີ່ຈຳເປັນມີຢູ່ແລ້ວ:
 * ບິນ 96.6% ຕິດປ້າຍເສັ້ນທາງໄວ້ ແລະ ບິນທີ່ສົ່ງແລ້ວ 96.8% ມີພິກັດຈຸດສົ່ງ.
 *
 * ເສັ້ນທາງ → ບິນ (odg_tms_pending_bill.delivery_route_code) → ຈຸດສົ່ງຈິງ
 * (odg_tms_detail.lat_end/lng_end) → ຈຸດກາງ ແລະ ຂອບເຂດພື້ນທີ່.
 */

/** ຄ່າຕ່ຳສຸດທີ່ຍັງເຊື່ອຖືໄດ້ວ່າ "ລົດແລ່ນຈິງ" ບໍ່ແມ່ນ "ບໍ່ໄດ້ເກັບ GPS". */
const MIN_TRUSTED_KM = 1;

/** ຕ້ອງມີຫຼາຍກວ່ານີ້ຈຶ່ງເອົາ median ມາໃຊ້ — ຖ້ຽວດຽວອາດຜິດປົກກະຕິ. */
const MIN_TRIPS_FOR_DISTANCE = 3;

const usableCoord = (col) =>
  `NULLIF(TRIM(${col}), '') IS NOT NULL
   AND TRIM(${col}) ~ '^-?[0-9]+(\\.[0-9]+)?$'
   AND TRIM(${col})::numeric <> 0`;

/**
 * ຈຸດກາງ ແລະ ຂອບເຂດຂອງແຕ່ລະເສັ້ນທາງ.
 *
 * ໃຊ້ **median** ບໍ່ແມ່ນຄ່າສະເລ່ຍ: ຄົນຂັບບາງຄັ້ງກົດປິດບິນຕອນຂັບອອກໄປໄກແລ້ວ
 * ຫຼື ຢູ່ສາງກ່ອນອອກ ຈຶ່ງມີຈຸດຫຼົງປົນ. ຄ່າສະເລ່ຍຖືກຈຸດພວກນັ້ນດຶງອອກນອກ
 * ແຕ່ median ບໍ່ຫວັ່ນໄຫວ.
 */
async function routeDeliveryCentres({ days = 180 } = {}) {
  const windowDays = Math.min(Math.max(Number(days) || 180, 1), 365);
  return query(
    `SELECT
       r.code,
       COUNT(*)::int                                  AS point_count,
       COUNT(DISTINCT d.cust_code)::int               AS shop_count,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY TRIM(d.lat_end)::numeric)::numeric, 6)::text AS lat,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY TRIM(d.lng_end)::numeric)::numeric, 6)::text AS lng,
       to_char(MAX(d.sent_end), 'YYYY-MM-DD')         AS last_delivered
     FROM public.odg_tms_delivery_route r
     JOIN public.odg_tms_pending_bill pb
       ON NULLIF(TRIM(pb.delivery_route_code), '') = r.code
     JOIN public.odg_tms_detail d
       ON d.bill_no = pb.bill_no AND d.status = 1
    WHERE d.sent_end > LOCALTIMESTAMP - ($1 || ' days')::interval
      AND ${usableCoord("d.lat_end")}
      AND ${usableCoord("d.lng_end")}
    GROUP BY r.code`,
    [String(windowDays)]
  );
}

/**
 * ໄລຍະທີ່ **ແລ່ນຈິງ** ຕໍ່ຖ້ຽວ ຂອງແຕ່ລະເສັ້ນທາງ (median).
 *
 * ⚠️ ການກອງສັນຍານລົບກວນຕ້ອງກອງດ້ວຍ **ຄວາມໄວ ບໍ່ແມ່ນໄລຍະ**. ຮອບທຳອິດຂ້ອຍ
 * ຕັດ segment ທີ່ຍາວກວ່າ 5 ກມ ຖິ້ມ ແລ້ວ "ວຽງຈັນ-ປາກເຊ" ອອກມາ 50 ກມ ທັງທີ່
 * ຈິງ ~680 ກມ — ເພາະເທິງທາງດ່ວນ ຈຸດ GPS ຫ່າງກັນ 10 ນາທີ ໄລຍະຈິງກໍ່ເກີນ
 * 5 ກມ ຈຶ່ງຖືກຖິ້ມໝົດເສັ້ນ. ກອງທີ່ >120 ກມ/ຊມ ຈັບ GPS ກະໂດດໄດ້ ໂດຍບໍ່ຕັດ
 * ການແລ່ນທາງໄກ.
 */
async function routeDrivenDistance() {
  return query(
    `WITH pts AS (
       SELECT doc_no,
              lat::numeric AS la, lng::numeric AS ln, recorded_at,
              LAG(lat::numeric) OVER w AS pla,
              LAG(lng::numeric) OVER w AS pln,
              LAG(recorded_at)  OVER w AS pat
         FROM public.odg_tms_travel_history
        WHERE lat IS NOT NULL AND lng IS NOT NULL
       WINDOW w AS (PARTITION BY doc_no ORDER BY recorded_at)
     ), seg AS (
       SELECT doc_no,
              2 * 6371 * asin(sqrt(
                power(sin(radians(la - pla) / 2), 2)
                + cos(radians(pla)) * cos(radians(la))
                  * power(sin(radians(ln - pln) / 2), 2))) AS km,
              EXTRACT(EPOCH FROM (recorded_at - pat)) / 3600.0 AS hrs
         FROM pts
        WHERE pla IS NOT NULL AND recorded_at > pat
     ), trip AS (
       SELECT doc_no, SUM(km) AS km
         FROM seg
        WHERE hrs > 0 AND km / hrs < 120
        GROUP BY doc_no
     )
     SELECT r.code,
            COUNT(DISTINCT t.doc_no)::int AS trip_count,
            round(percentile_cont(0.5) WITHIN GROUP (
              ORDER BY t.km)::numeric, 1)::text AS median_km
       FROM public.odg_tms_delivery_route r
       JOIN public.odg_tms_pending_bill pb
         ON NULLIF(TRIM(pb.delivery_route_code), '') = r.code
       JOIN public.odg_tms_detail d ON d.bill_no = pb.bill_no
       JOIN trip t ON t.doc_no = d.doc_no
      GROUP BY r.code`
  );
}

/**
 * ລວມສອງດ້ານເຂົ້າກັນເປັນ "ສິ່ງທີ່ແນະນຳໃຫ້ຕື່ມ" ຕໍ່ເສັ້ນທາງ.
 *
 * ໄລຍະຖືກປ່ອຍເປັນ null ເມື່ອຖ້ຽວໜ້ອຍເກີນ ຫຼື ໄລຍະ median ຕ່ຳກວ່າ 1 ກມ.
 * ອັນຫຼັງສຳຄັນ: ສາຍປາກເຊມີ 95 ຖ້ຽວ ແຕ່ median ພຽງ 0.2 ກມ — ນັ້ນບໍ່ແມ່ນ
 * ເສັ້ນທາງສັ້ນ ແຕ່ແມ່ນ **ບໍ່ໄດ້ເກັບ GPS ຢູ່ສາຂານັ້ນ**. ຕື່ມ 0.2 ກມ ລົງໄປ
 * ຈະກາຍເປັນຕົວເລກຜິດທີ່ເບິ່ງຄືຖືກ ເຊິ່ງຮ້າຍກວ່າຊ່ອງຫວ່າງ.
 */
async function routeFootprints(opts = {}) {
  const [centres, distances] = await Promise.all([
    routeDeliveryCentres(opts),
    routeDrivenDistance(),
  ]);

  const byCode = new Map();
  for (const row of centres ?? []) {
    byCode.set(String(row.code), {
      code: String(row.code),
      point_count: Number(row.point_count ?? 0),
      shop_count: Number(row.shop_count ?? 0),
      lat: String(row.lat ?? ""),
      lng: String(row.lng ?? ""),
      last_delivered: String(row.last_delivered ?? ""),
      trip_count: 0,
      median_km: null,
      distance_unavailable: "",
    });
  }

  for (const row of distances ?? []) {
    const code = String(row.code);
    const entry = byCode.get(code) ?? {
      code,
      point_count: 0,
      shop_count: 0,
      lat: "",
      lng: "",
      last_delivered: "",
      trip_count: 0,
      median_km: null,
      distance_unavailable: "",
    };
    entry.trip_count = Number(row.trip_count ?? 0);
    const km = Number(row.median_km ?? 0);
    if (entry.trip_count < MIN_TRIPS_FOR_DISTANCE) {
      entry.distance_unavailable = `ມີພຽງ ${entry.trip_count} ຖ້ຽວ — ໜ້ອຍເກີນທີ່ຈະເຊື່ອ`;
    } else if (!(km >= MIN_TRUSTED_KM)) {
      entry.distance_unavailable = "ຍັງບໍ່ໄດ້ເກັບ GPS ຂອງເສັ້ນທາງນີ້";
    } else {
      entry.median_km = km;
    }
    byCode.set(code, entry);
  }

  return [...byCode.values()].sort((a, b) => b.point_count - a.point_count);
}

/**
 * ຈຸດຈອດທີ່ແນະນຳຂອງເສັ້ນທາງໜຶ່ງ — **ຮຽງຕາມລຳດັບທີ່ຄົນຂັບແວ່ຈິງ**.
 *
 * ວິທີ: ໃນແຕ່ລະຖ້ຽວ ບິນຖືກປິດຕາມລຳດັບເວລາ (`sent_end`) ຈຶ່ງໄດ້ລຳດັບການແວ່.
 * ປ່ຽນເປັນຕຳແໜ່ງ **ທຽບສ່ວນ** (ລຳດັບ ÷ ຈຳນວນຈຸດຂອງຖ້ຽວນັ້ນ) ກ່ອນ ເພາະ
 * ຖ້ຽວໜຶ່ງມີ 5 ຈຸດ ອີກຖ້ຽວມີ 22 ຈຸດ — ເອົາລຳດັບດິບມາທຽບກັນຈະບໍ່ມີຄວາມໝາຍ.
 * ແລ້ວເອົາ median ຂອງຕຳແໜ່ງທຽບສ່ວນຕໍ່ຮ້ານ = ຮ້ານນີ້ມັກຖືກແວ່ຊ່ວງໃດຂອງຖ້ຽວ.
 *
 * ເລືອກຮ້ານທີ່ແວ່ຖີ່ສຸດ N ອັນ (RT020 ແວ່ສະເລ່ຍ 7.7 ຈຸດ/ຖ້ຽວ ຈຶ່ງເອົາ 8 ພໍດີ)
 * ແລ້ວຮຽງຕາມ median ນັ້ນ ໄດ້ເປັນໝຸດ 1..N ທີ່ຕາມເສັ້ນທາງແທ້.
 */
async function suggestRouteWaypoints(routeCode, { count = 8, days = 180 } = {}) {
  const code = String(routeCode ?? "").trim();
  if (!code) return [];
  const max = Math.min(Math.max(Number(count) || 8, 1), 25);
  const windowDays = Math.min(Math.max(Number(days) || 180, 1), 365);

  const rows = await query(
    `WITH seq AS (
       SELECT d.cust_code, d.lat_end, d.lng_end,
              ROW_NUMBER() OVER (PARTITION BY d.doc_no ORDER BY d.sent_end)::numeric
                / NULLIF(COUNT(*) OVER (PARTITION BY d.doc_no), 0) AS rel_pos
         FROM public.odg_tms_pending_bill pb
         JOIN public.odg_tms_detail d
           ON d.bill_no = pb.bill_no AND d.status = 1
        WHERE NULLIF(TRIM(pb.delivery_route_code), '') = $1
          AND d.sent_end IS NOT NULL
          AND d.sent_end > LOCALTIMESTAMP - ($2 || ' days')::interval
          AND ${usableCoord("d.lat_end")}
          AND ${usableCoord("d.lng_end")}
     ), shops AS (
       SELECT s.cust_code,
              COALESCE(NULLIF(TRIM(c.name_1), ''), s.cust_code) AS name,
              COUNT(*)::int AS visits,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY s.rel_pos) AS visit_order,
              round(percentile_cont(0.5) WITHIN GROUP (
                ORDER BY TRIM(s.lat_end)::numeric)::numeric, 6)::text AS lat,
              round(percentile_cont(0.5) WITHIN GROUP (
                ORDER BY TRIM(s.lng_end)::numeric)::numeric, 6)::text AS lng
         FROM seq s
         LEFT JOIN public.ar_customer c ON c.code = s.cust_code
        GROUP BY s.cust_code, c.name_1
        ORDER BY COUNT(*) DESC
        LIMIT ${max}
     )
     SELECT cust_code, name, visits, lat, lng,
            round(visit_order::numeric, 3)::text AS visit_order
       FROM shops
      ORDER BY visit_order, visits DESC`,
    [code, String(windowDays)]
  );

  return (rows ?? []).map((r, i) => ({
    seq: i + 1,
    code: String(r.cust_code ?? ""),
    name: String(r.name ?? "").trim(),
    lat: String(r.lat ?? ""),
    lng: String(r.lng ?? ""),
    visits: Number(r.visits ?? 0),
    visit_order: Number(r.visit_order ?? 0),
  }));
}

/** ຈຳນວນຈຸດສະເລ່ຍຕໍ່ຖ້ຽວຂອງເສັ້ນທາງ — ໃຊ້ຕັ້ງຄ່າເລີ່ມຕົ້ນຂອງ `count`. */
async function routeTypicalStopCount(routeCode) {
  const code = String(routeCode ?? "").trim();
  if (!code) return 0;
  const rows = await query(
    `SELECT round(AVG(stops))::int AS typical
       FROM (
         SELECT COUNT(*)::int AS stops
           FROM public.odg_tms_pending_bill pb
           JOIN public.odg_tms_detail d
             ON d.bill_no = pb.bill_no AND d.status = 1
          WHERE NULLIF(TRIM(pb.delivery_route_code), '') = $1
            AND d.sent_end IS NOT NULL
          GROUP BY d.doc_no
       ) t`,
    [code]
  );
  return Number(rows?.[0]?.typical ?? 0);
}

/**
 * ຕື່ມໝຸດ ແລະ ໄລຍະໃຫ້ທຸກເສັ້ນທາງທີ່ຕື່ມໄດ້ — ບໍ່ແຕະຂອງທີ່ຄົນຕັ້ງໄວ້ແລ້ວ.
 *
 * ສາມກໍລະນີທີ່ຕ້ອງແຍກກັນ (ພົບຈາກຂໍ້ມູນຈິງ):
 *
 * * **ມີໝຸດພ້ອມພິກັດແລ້ວ** → ຂ້າມທັງເສັ້ນ. ຄົນປັກດ້ວຍມືມາແລ້ວ ບໍ່ຄວນເສຍວຽກ.
 * * **ມີຊື່ຈຸດຜ່ານ ແຕ່ຍັງບໍ່ມີພິກັດ** → ຂ້າມການຕື່ມໝຸດ ແຕ່ຍັງຕື່ມໄລຍະໄດ້.
 *   ຊື່ທີ່ຄົນຕັ້ງເປັນຊື່ບ້ານ ("ຫວ້ຍປູນ, ໂພນງາມ") ເຊິ່ງມີຄວາມໝາຍກວ່າຊື່ຮ້ານ
 *   ທີ່ລະບົບຈະໃສ່ແທນ — ທັບລົງໄປແມ່ນທຳລາຍຂໍ້ມູນທີ່ຄົນຕັ້ງໃຈໃສ່.
 * * **ຫວ່າງເປົ່າ** → ຕື່ມທັງໝຸດ ແລະ ໄລຍະ.
 *
 * `dryRun` ຄືນລາຍງານໂດຍບໍ່ຂຽນ — ໃຫ້ເບິ່ງກ່ອນວ່າຈະປ່ຽນຫຍັງແດ່.
 */
async function autoFillRouteGeography({ dryRun = true } = {}) {
  const routes = await query(
    `SELECT code, COALESCE(waypoints, '[]'::jsonb) AS waypoints,
            COALESCE(distance_km, 0) AS distance_km
       FROM public.odg_tms_delivery_route ORDER BY code`
  );
  const footprints = new Map(
    (await routeFootprints()).map((f) => [f.code, f])
  );

  const report = [];
  for (const route of routes ?? []) {
    const code = String(route.code);
    const stops = Array.isArray(route.waypoints) ? route.waypoints : [];
    const anyPinned = stops.some(
      (s) => s && s.lat != null && s.lng != null && s.lat !== "" && s.lng !== ""
    );
    const foot = footprints.get(code);

    const entry = { code, waypoints_added: 0, distance_set: null, skipped: "" };

    if (anyPinned) {
      entry.skipped = "ມີໝຸດພ້ອມພິກັດແລ້ວ — ບໍ່ແຕະ";
      report.push(entry);
      continue;
    }
    if (!foot) {
      entry.skipped = "ບໍ່ມີປະຫວັດການສົ່ງທີ່ມີພິກັດ";
      report.push(entry);
      continue;
    }

    // ໝຸດ: ຕື່ມສະເພາະເສັ້ນທີ່ຍັງບໍ່ມີຈຸດຜ່ານເລີຍ
    let newStops = null;
    if (stops.length === 0) {
      const typical = await routeTypicalStopCount(code);
      const suggested = await suggestRouteWaypoints(code, {
        count: typical || 8,
      });
      if (suggested.length > 0) {
        newStops = suggested.map((s) => ({
          name: s.name,
          lat: Number(s.lat),
          lng: Number(s.lng),
        }));
        entry.waypoints_added = newStops.length;
      }
    } else {
      entry.skipped = "ມີຊື່ຈຸດຜ່ານທີ່ຄົນຕັ້ງໄວ້ — ຕື່ມແຕ່ໄລຍະ";
    }

    // ໄລຍະ: ຕື່ມເມື່ອເຊື່ອຖືໄດ້ ແລະ ຍັງບໍ່ໄດ້ຕັ້ງ
    const km = foot.median_km;
    const currentKm = Number(route.distance_km ?? 0);
    const setKm = km != null && currentKm <= 0 ? km : null;
    if (setKm != null) entry.distance_set = setKm;

    if (!dryRun && (newStops || setKm != null)) {
      const sets = [];
      const params = [code];
      if (newStops) {
        params.push(JSON.stringify(newStops));
        sets.push(`waypoints = $${params.length}::jsonb`);
      }
      if (setKm != null) {
        params.push(setKm);
        sets.push(`distance_km = $${params.length}`);
      }
      await query(
        `UPDATE public.odg_tms_delivery_route
            SET ${sets.join(", ")}
          WHERE code = $1`,
        params
      );
    }
    report.push(entry);
  }
  return report;
}

module.exports = {
  autoFillRouteGeography,
  routeFootprints,
  routeDeliveryCentres,
  routeDrivenDistance,
  suggestRouteWaypoints,
  routeTypicalStopCount,
  MIN_TRUSTED_KM,
  MIN_TRIPS_FOR_DISTANCE,
};

// ຕົ້ນທຶນຂົນສົ່ງ ນອກເໜືອຈາກຄ່ານ້ຳມັນ — ຄ່າແຮງຄົນຂັບ, ຄ່າຜ່ານທາງ, ຄ່າສ້ອມແປງ,
// ຄ່າຈ້າງລົດນອກ, ຄ່າປັບໃໝ.
//
// ເປັນຫຍັງຕ້ອງມີ: ກ່ອນນີ້ TMS ເກັບແຕ່ຄ່ານ້ຳມັນ ຈຶ່ງເຮັດໃຫ້ "ຕົ້ນທຶນ/ຖ້ຽວ" ໃນ
// ລາຍງານເປັນພຽງຕົ້ນທຶນຂັ້ນຕ່ຳ ບໍ່ແມ່ນຕົ້ນທຶນຈິງ. ຕາຕະລາງນີ້ຕື່ມສ່ວນທີ່ຂາດ
// ໂດຍບໍ່ແຕະ odg_tms_fuel_log — ຄ່ານ້ຳມັນຍັງຢູ່ບ່ອນເກົ່າ ຈຶ່ງບໍ່ມີການນັບຊ້ຳ.
//
// ⚠️ ເວລາ: ຕາຕະລາງ odg_tms* ເກັບເວລາລາວ ຈຶ່ງໃຊ້ LOCALTIMESTAMP(0) ບໍ່ແມ່ນ now().
// ⚠️ ການສ້າງ schema ຢູ່ໃນເສັ້ນທາງອ່ານມີລາຄາແພງ (ວັດແລ້ວ ~6 ວິນາທີ) ຈຶ່ງເອີ້ນ
//    ensureTripCostSchema ສະເພາະຕອນຂຽນ; ຝັ່ງອ່ານແທນທີ່ຈະສ້າງ ຖ້າຕາຕະລາງຍັງ
//    ບໍ່ມີກໍ່ຄືນຄ່າວ່າງເປົ່າ (ຍັງບໍ່ມີໃຜບັນທຶກຕົ້ນທຶນຈັກລາຍ = ຍອດ 0 ຢູ່ແລ້ວ).
"use strict";

const { pool, query, queryOne } = require("../lib/db");
const { getBranchScope } = require("./helpers");
const { normalizeTripCostType } = require("../lib/trip-cost-type");

const UNDEFINED_TABLE = "42P01";

async function safeDdl(db, sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (err?.code === "23505" || /already exists/i.test(msg)) return;
    throw err;
  }
}

let schemaReady = false;

/** ສ້າງຕາຕະລາງເມື່ອບັນທຶກຄັ້ງທຳອິດ — ບໍ່ເອີ້ນຈາກເສັ້ນທາງອ່ານ */
async function ensureTripCostSchema(db = pool) {
  if (schemaReady) return;
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_trip_cost (
      id BIGSERIAL PRIMARY KEY,
      cost_date date NOT NULL DEFAULT CURRENT_DATE,
      cost_type character varying NOT NULL,
      amount numeric NOT NULL DEFAULT 0,
      car character varying,
      doc_no character varying,
      driver character varying,
      transport_code character varying,
      note text,
      created_by character varying,
      created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS odg_tms_trip_cost_date_idx
      ON public.odg_tms_trip_cost (cost_date, transport_code)
  `);
  schemaReady = true;
}

/** ຄືນ [] ຫຼື fallback ຖ້າຕາຕະລາງຍັງບໍ່ຖືກສ້າງ — ບໍ່ໄປສ້າງເອງໃນເສັ້ນທາງອ່ານ */
async function tolerateMissing(run, fallback) {
  try {
    return await run();
  } catch (err) {
    if (err?.code === UNDEFINED_TABLE) return fallback;
    throw err;
  }
}

const asText = (v) => String(v ?? "").trim();
const asNullableText = (v) => asText(v) || null;

function asAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * ບັນທຶກ 1 ລາຍການຕົ້ນທຶນ.
 * @param {{cost_date?: string, cost_type?: string, amount?: unknown, car?: string,
 *          doc_no?: string, driver?: string, transport_code?: string, note?: string,
 *          created_by?: string}} payload
 */
async function saveTripCost(payload) {
  const type = normalizeTripCostType(payload?.cost_type);
  if (!type) throw new Error("ກະລຸນາເລືອກປະເພດຕົ້ນທຶນ");
  const amount = asAmount(payload?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
  await ensureTripCostSchema();
  const row = await queryOne(
    `INSERT INTO public.odg_tms_trip_cost
       (cost_date, cost_type, amount, car, doc_no, driver, transport_code, note, created_by)
     VALUES (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      asNullableText(payload?.cost_date),
      type,
      amount,
      asNullableText(payload?.car),
      asNullableText(payload?.doc_no),
      asNullableText(payload?.driver),
      asNullableText(payload?.transport_code),
      asNullableText(payload?.note),
      asNullableText(payload?.created_by),
    ]
  );
  return { success: true, id: Number(row?.id) || 0 };
}

/** ລຶບ 1 ລາຍການ */
async function deleteTripCost(id) {
  const value = Number(id);
  if (!Number.isFinite(value) || value <= 0) throw new Error("ລະຫັດລາຍການບໍ່ຖືກຕ້ອງ");
  await tolerateMissing(
    () => query(`DELETE FROM public.odg_tms_trip_cost WHERE id = $1`, [value]),
    []
  );
  return { success: true };
}

/** ລາຍການທັງໝົດໃນຊ່ວງ — ໃໝ່ສຸດຂຶ້ນກ່ອນ */
async function listTripCosts(session, fromDate, toDate, carCode) {
  const scope = getBranchScope(session);
  const params = [asText(fromDate), asText(toDate)];
  const clauses = [`c.cost_date >= $1::date`, `c.cost_date <= $2::date`];
  if (scope.scoped) {
    params.push(scope.branches);
    clauses.push(`(c.transport_code = ANY($${params.length}) OR c.transport_code IS NULL)`);
  }
  const car = asText(carCode);
  if (car) {
    params.push(car);
    clauses.push(`TRIM(c.car) = $${params.length}`);
  }
  const rows = await tolerateMissing(
    () =>
      query(
        `SELECT c.id, to_char(c.cost_date, 'YYYY-MM-DD') AS cost_date, c.cost_type,
                c.amount::float AS amount,
                COALESCE(NULLIF(TRIM(c.car), ''), '') AS car,
                COALESCE(NULLIF(TRIM(cr.name_1), ''), NULLIF(TRIM(c.car), ''), '') AS car_name,
                COALESCE(NULLIF(TRIM(c.doc_no), ''), '') AS doc_no,
                COALESCE(NULLIF(TRIM(c.driver), ''), '') AS driver,
                COALESCE(NULLIF(TRIM(c.transport_code), ''), '') AS transport_code,
                COALESCE(c.note, '') AS note,
                COALESCE(NULLIF(TRIM(c.created_by), ''), '') AS created_by,
                to_char(c.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM public.odg_tms_trip_cost c
         LEFT JOIN public.odg_tms_car cr ON cr.code = c.car
         WHERE ${clauses.join(" AND ")}
         ORDER BY c.cost_date DESC, c.id DESC
         LIMIT 500`,
        params
      ),
    []
  );
  return rows.map((r) => ({
    id: Number(r.id) || 0,
    cost_date: r.cost_date,
    cost_type: r.cost_type,
    amount: Number(r.amount) || 0,
    car: r.car,
    car_name: r.car_name,
    doc_no: r.doc_no,
    driver: r.driver,
    transport_code: r.transport_code,
    note: r.note,
    created_by: r.created_by,
    created_at: r.created_at,
  }));
}

/**
 * ຍອດລວມໃນຊ່ວງ ພ້ອມການແຍກຕາມປະເພດ — ໃຊ້ໂດຍໜ້າ /reports/bi.
 * @param {{from: string, to: string}} range ລວມວັນທ້າຍ
 */
async function getTripCostSummary(session, range, carCode) {
  const scope = getBranchScope(session);
  const params = [String(range?.from ?? "").slice(0, 10), String(range?.to ?? "").slice(0, 10)];
  const clauses = [`cost_date >= $1::date`, `cost_date <= $2::date`];
  if (scope.scoped) {
    params.push(scope.branches);
    clauses.push(`(transport_code = ANY($${params.length}) OR transport_code IS NULL)`);
  }
  const car = asText(carCode);
  if (car) {
    params.push(car);
    clauses.push(`TRIM(car) = $${params.length}`);
  }
  const rows = await tolerateMissing(
    () =>
      query(
        `SELECT cost_type, COUNT(*)::int AS entries, COALESCE(SUM(amount), 0)::float AS amount
         FROM public.odg_tms_trip_cost
         WHERE ${clauses.join(" AND ")}
         GROUP BY cost_type
         ORDER BY 3 DESC`,
        params
      ),
    []
  );
  const by_type = rows.map((r) => ({
    cost_type: r.cost_type,
    entries: Number(r.entries) || 0,
    amount: Number(r.amount) || 0,
  }));
  return {
    total: by_type.reduce((sum, r) => sum + r.amount, 0),
    entries: by_type.reduce((sum, r) => sum + r.entries, 0),
    by_type,
  };
}

module.exports = {
  ensureTripCostSchema,
  saveTripCost,
  deleteTripCost,
  listTripCosts,
  getTripCostSummary,
};

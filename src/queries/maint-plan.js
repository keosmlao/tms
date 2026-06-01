const { pool, query } = require("../lib/db");

const cache = globalThis;
cache.__tmsMaintPlanSchemaReady = false;
cache.__tmsMaintPlanSchemaPromise = null;

async function safeDdl(db, sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (err?.code === "23505" || /already exists/i.test(msg)) return;
    throw err;
  }
}

async function ensureMaintPlanSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_maint_plan (
      plan_code VARCHAR(50) PRIMARY KEY,
      car_code  VARCHAR(255) NOT NULL,
      rule_code VARCHAR(100),
      inspect_code VARCHAR(100),
      next_due_km NUMERIC(15,2) NOT NULL,
      maint_note TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      created_by VARCHAR(255)
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_maint_plan_car_code
    ON public.odg_tms_maint_plan(car_code)
  `);
}

async function ensureMaintPlanSchema() {
  if (cache.__tmsMaintPlanSchemaReady) return;
  if (!cache.__tmsMaintPlanSchemaPromise) {
    cache.__tmsMaintPlanSchemaPromise = ensureMaintPlanSchemaInternal(pool)
      .then(() => { cache.__tmsMaintPlanSchemaReady = true; })
      .catch((err) => { cache.__tmsMaintPlanSchemaPromise = null; throw err; });
  }
  await cache.__tmsMaintPlanSchemaPromise;
}

async function getMaintPlans() {
  await ensureMaintPlanSchema();
  return query(
    `SELECT plan_code, car_code, rule_code, next_due_km, maint_note,
       TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at, created_by
     FROM public.odg_tms_maint_plan
     ORDER BY car_code, next_due_km`,
    []
  );
}

async function getMaintPlanAlerts() {
  await ensureMaintPlanSchema();
  return query(
    `SELECT
       mp.plan_code,
       mp.car_code,
       mp.rule_code,
       mp.next_due_km,
       mp.maint_note,
       COALESCE(insp.odometer, 0)::numeric AS current_odometer,
       (mp.next_due_km - COALESCE(insp.odometer, 0))::numeric AS remaining_km
     FROM public.odg_tms_maint_plan mp
     LEFT JOIN (
       SELECT car_code, MAX(odometer) AS odometer
       FROM public.odg_tms_inspect
       WHERE odometer IS NOT NULL
       GROUP BY car_code
     ) insp ON insp.car_code = mp.car_code
     WHERE (mp.next_due_km - COALESCE(insp.odometer, 0)) < 500
     ORDER BY (mp.next_due_km - COALESCE(insp.odometer, 0)) ASC`,
    []
  );
}

async function saveMaintPlan(payload) {
  await ensureMaintPlanSchema();

  const planCode = (payload?.plan_code ?? "").trim();
  if (!planCode) throw new Error("plan_code is required");
  const carCode = (payload?.car_code ?? "").trim();
  if (!carCode) throw new Error("car_code is required");
  const nextDueKm = Number(payload?.next_due_km);
  if (!Number.isFinite(nextDueKm) || nextDueKm < 0) throw new Error("next_due_km ຕ້ອງເປັນຕົວເລກ >= 0");

  await pool.query(
    `INSERT INTO public.odg_tms_maint_plan
       (plan_code, car_code, rule_code, inspect_code, next_due_km, maint_note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (plan_code) DO UPDATE SET
       car_code    = EXCLUDED.car_code,
       rule_code   = EXCLUDED.rule_code,
       inspect_code= EXCLUDED.inspect_code,
       next_due_km = EXCLUDED.next_due_km,
       maint_note  = EXCLUDED.maint_note`,
    [
      planCode,
      carCode,
      (payload?.rule_code ?? "").trim() || null,
      (payload?.inspect_code ?? "").trim() || null,
      nextDueKm,
      (payload?.maint_note ?? "").trim() || null,
      (payload?.created_by ?? "").trim() || null,
    ]
  );
  return { success: true };
}

async function deleteMaintPlan(planCode) {
  await ensureMaintPlanSchema();
  await pool.query(`DELETE FROM public.odg_tms_maint_plan WHERE plan_code = $1`, [planCode]);
  return { success: true };
}

module.exports = { getMaintPlans, getMaintPlanAlerts, saveMaintPlan, deleteMaintPlan };

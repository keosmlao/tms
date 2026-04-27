const { query, queryOne } = require("../lib/db");

// ==================== Cars ====================

async function ensureTmsCarAssignmentTables() {
  await query(`ALTER TABLE public.odg_tms_car ADD COLUMN IF NOT EXISTS imei character varying`);
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_car_driver (
      roworder BIGSERIAL PRIMARY KEY,
      car_code character varying NOT NULL,
      driver_code character varying NOT NULL,
      driver_name character varying NOT NULL,
      user_create character varying,
      create_date_time_now timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      CONSTRAINT odg_tms_car_driver_unique UNIQUE (car_code, driver_code)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_car_worker (
      roworder BIGSERIAL PRIMARY KEY,
      car_code character varying NOT NULL,
      worker_code character varying NOT NULL,
      worker_name character varying NOT NULL,
      user_create character varying,
      create_date_time_now timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      CONSTRAINT odg_tms_car_worker_unique UNIQUE (car_code, worker_code)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_odg_tms_car_driver_car_code ON public.odg_tms_car_driver (car_code)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_odg_tms_car_worker_car_code ON public.odg_tms_car_worker (car_code)`);
}

async function getTransportEmployeesByCodes(codes) {
  if (codes.length === 0) return [];
  return query(
    `SELECT e.employee_code AS code,
      COALESCE(NULLIF(TRIM(e.fullname_lo), ''), NULLIF(TRIM(e.nickname), ''), e.employee_code) AS name_1
    FROM public.odg_employee e
    LEFT JOIN public.odg_department d ON d.department_code = e.department_code
    WHERE e.employee_code = ANY($1::varchar[])
      AND e.employment_status = 'ACTIVE'
      AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'
    ORDER BY name_1 ASC, e.employee_code ASC`,
    [codes]
  );
}

async function replaceCarDriverAssignments(carCode, driverCodes, userCreate) {
  await ensureTmsCarAssignmentTables();
  await queryOne("DELETE FROM public.odg_tms_car_driver WHERE car_code=$1", [carCode]);
  const drivers = await getTransportEmployeesByCodes(Array.from(new Set(driverCodes.filter(Boolean))));
  for (const driver of drivers) {
    await queryOne(
      `INSERT INTO public.odg_tms_car_driver(car_code, driver_code, driver_name, user_create, create_date_time_now)
       VALUES ($1, $2, $3, $4, LOCALTIMESTAMP(0))`,
      [carCode, driver.code, driver.name_1, userCreate]
    );
  }
}

async function replaceCarWorkerAssignments(carCode, workerCodes, excludedDriverCodes, userCreate) {
  await ensureTmsCarAssignmentTables();
  await queryOne("DELETE FROM public.odg_tms_car_worker WHERE car_code=$1", [carCode]);
  const normalizedWorkers = Array.from(
    new Set(
      workerCodes
        .filter(Boolean)
        .filter((workerCode) => !excludedDriverCodes.includes(workerCode))
    )
  );
  const workers = await getTransportEmployeesByCodes(normalizedWorkers);
  for (const worker of workers) {
    await queryOne(
      `INSERT INTO public.odg_tms_car_worker(car_code, worker_code, worker_name, user_create, create_date_time_now)
       VALUES ($1, $2, $3, $4, LOCALTIMESTAMP(0))`,
      [carCode, worker.code, worker.name_1, userCreate]
    );
  }
}

async function getCars() { return query("SELECT code, name_1 FROM public.odg_tms_car"); }
async function addCar(code, name_1) { await queryOne("INSERT INTO public.odg_tms_car(code, name_1) VALUES ($1, $2)", [code, name_1]); }
async function updateCar(code, name_1) { await queryOne("UPDATE odg_tms_car SET name_1=$1 WHERE code=$2", [name_1, code]); }
async function deleteCar(code) { await queryOne("DELETE FROM odg_tms_car WHERE code=$1", [code]); }

async function getCarDefaults(carCode) {
  await ensureTmsCarAssignmentTables();
  const drivers = await query(
    `SELECT driver_code AS code, driver_name AS name_1 FROM public.odg_tms_car_driver WHERE car_code=$1 ORDER BY driver_name ASC`,
    [carCode]
  );
  const workers = await query(
    `SELECT worker_code AS code, worker_name AS name_1 FROM public.odg_tms_car_worker WHERE car_code=$1 ORDER BY worker_name ASC`,
    [carCode]
  );
  return { drivers, workers };
}

async function getCarProfiles() {
  await ensureTmsCarAssignmentTables();
  const [cars, carDrivers, carWorkers] = await Promise.all([
    query("SELECT code, name_1, COALESCE(imei,'') AS imei FROM public.odg_tms_car ORDER BY name_1 ASC, code ASC"),
    query(`SELECT car_code, driver_code AS code, driver_name AS name_1 FROM public.odg_tms_car_driver ORDER BY car_code ASC, driver_name ASC, driver_code ASC`),
    query(`SELECT car_code, worker_code AS code, worker_name AS name_1 FROM public.odg_tms_car_worker ORDER BY car_code ASC, worker_name ASC, worker_code ASC`),
  ]);

  const driversByCar = new Map();
  const workersByCar = new Map();

  for (const driver of carDrivers) {
    const current = driversByCar.get(driver.car_code) ?? [];
    current.push({ code: driver.code, name_1: driver.name_1 });
    driversByCar.set(driver.car_code, current);
  }
  for (const worker of carWorkers) {
    const current = workersByCar.get(worker.car_code) ?? [];
    current.push({ code: worker.code, name_1: worker.name_1 });
    workersByCar.set(worker.car_code, current);
  }

  return cars.map((car) => ({
    ...car,
    drivers: driversByCar.get(car.code) ?? [],
    workers: workersByCar.get(car.code) ?? [],
  }));
}

async function addCarProfile(session, data) {
  await ensureTmsCarAssignmentTables();
  const existingCar = await queryOne("SELECT code FROM public.odg_tms_car WHERE code=$1", [data.code]);
  if (existingCar) throw new Error("Car code already exists");

  const userCreate = session?.usercode ?? null;
  const driverCodes = Array.from(new Set(data.driverCodes.filter(Boolean)));
  const imei = data.imei?.trim() ?? "";

  await queryOne(
    "INSERT INTO public.odg_tms_car(code, name_1, imei, create_date_time_now) VALUES ($1, $2, $3, LOCALTIMESTAMP(0))",
    [data.code, data.name_1, imei]
  );
  await replaceCarDriverAssignments(data.code, driverCodes, userCreate);
  await replaceCarWorkerAssignments(data.code, data.workerCodes, driverCodes, userCreate);
}

async function updateCarProfile(session, data) {
  await ensureTmsCarAssignmentTables();
  const userCreate = session?.usercode ?? null;
  const driverCodes = Array.from(new Set(data.driverCodes.filter(Boolean)));
  const imei = data.imei?.trim() ?? "";

  await queryOne("UPDATE public.odg_tms_car SET name_1=$1, imei=$2 WHERE code=$3", [data.name_1, imei, data.code]);
  await replaceCarDriverAssignments(data.code, driverCodes, userCreate);
  await replaceCarWorkerAssignments(data.code, data.workerCodes, driverCodes, userCreate);
}

async function deleteCarProfile(code) {
  await ensureTmsCarAssignmentTables();
  await queryOne("DELETE FROM public.odg_tms_car_driver WHERE car_code=$1", [code]);
  await queryOne("DELETE FROM public.odg_tms_car_worker WHERE car_code=$1", [code]);
  await queryOne("DELETE FROM public.odg_tms_car WHERE code=$1", [code]);
}

// ==================== Drivers & Workers ====================

async function getDispatchDriverByCode(code) {
  return queryOne(
    `SELECT e.employee_code AS code,
      COALESCE(NULLIF(TRIM(e.fullname_lo), ''), NULLIF(TRIM(e.nickname), ''), e.employee_code) AS name_1
    FROM public.odg_employee e
    LEFT JOIN public.odg_department d ON d.department_code = e.department_code
    WHERE e.employee_code = $1
      AND e.employment_status = 'ACTIVE'
      AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'`,
    [code]
  );
}

async function getTransportDepartmentEmployees(session) {
  await ensureWorkerBranchTable();
  const branch = session?.logistic_code?.trim() ?? "";
  const scoped = !!branch && branch !== "02-0004";

  if (!scoped) {
    return query(
      `SELECT e.employee_code AS code,
        COALESCE(NULLIF(TRIM(e.fullname_lo), ''), NULLIF(TRIM(e.nickname), ''), e.employee_code) AS name_1
      FROM public.odg_employee e
      LEFT JOIN public.odg_department d ON d.department_code = e.department_code
      WHERE e.employment_status = 'ACTIVE'
        AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'
      ORDER BY name_1 ASC, e.employee_code ASC`
    );
  }

  // Branch admin: only show employees assigned to this branch
  return query(
    `SELECT e.employee_code AS code,
      COALESCE(NULLIF(TRIM(e.fullname_lo), ''), NULLIF(TRIM(e.nickname), ''), e.employee_code) AS name_1
    FROM public.odg_employee e
    LEFT JOIN public.odg_department d ON d.department_code = e.department_code
    INNER JOIN public.odg_tms_worker_branch wb ON wb.worker_code = e.employee_code
    WHERE e.employment_status = 'ACTIVE'
      AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'
      AND wb.transport_code = $1
    ORDER BY name_1 ASC, e.employee_code ASC`,
    [branch]
  );
}

async function getDispatchDrivers(session) { return getTransportDepartmentEmployees(session); }
async function getDispatchWorkers(session) { return getTransportDepartmentEmployees(session); }

async function ensureWorkerBranchTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_worker_branch (
      worker_code character varying PRIMARY KEY,
      transport_code character varying NOT NULL,
      updated_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      updated_by character varying
    )
  `);
}

async function getTransportBranches() {
  return query(`SELECT code, name_1 FROM public.transport_type WHERE code LIKE '02-%' AND code <> '02-0004' ORDER BY code ASC`);
}

async function getDispatchWorkersWithBranch() {
  await ensureWorkerBranchTable();
  return query(
    `SELECT e.employee_code AS code,
      COALESCE(NULLIF(TRIM(e.fullname_lo), ''), NULLIF(TRIM(e.nickname), ''), e.employee_code) AS name_1,
      wb.transport_code AS branch_code, tt.name_1 AS branch_name
    FROM public.odg_employee e
    LEFT JOIN public.odg_department d ON d.department_code = e.department_code
    LEFT JOIN public.odg_tms_worker_branch wb ON wb.worker_code = e.employee_code
    LEFT JOIN public.transport_type tt ON tt.code = wb.transport_code
    WHERE e.employment_status = 'ACTIVE'
      AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'
    ORDER BY name_1 ASC, e.employee_code ASC`
  );
}

async function setWorkerBranch(session, workerCode, transportCode) {
  await ensureWorkerBranchTable();
  if (!transportCode) {
    await queryOne("DELETE FROM public.odg_tms_worker_branch WHERE worker_code=$1", [workerCode]);
    return;
  }
  await queryOne(
    `INSERT INTO public.odg_tms_worker_branch(worker_code, transport_code, updated_at, updated_by)
     VALUES ($1, $2, LOCALTIMESTAMP(0), $3)
     ON CONFLICT (worker_code) DO UPDATE
     SET transport_code = EXCLUDED.transport_code,
         updated_at = LOCALTIMESTAMP(0),
         updated_by = EXCLUDED.updated_by`,
    [workerCode, transportCode, session?.usercode ?? null]
  );
}

async function getDrivers() { return query("SELECT code, name_1 FROM public.odg_tms_driver"); }
async function addDriver(code, name_1) { await queryOne("INSERT INTO public.odg_tms_driver(code, name_1) VALUES ($1, $2)", [code, name_1]); }
async function updateDriver(code, name_1) { await queryOne("UPDATE odg_tms_driver SET name_1=$1 WHERE code=$2", [name_1, code]); }
async function deleteDriver(code) { await queryOne("DELETE FROM odg_tms_driver WHERE code=$1", [code]); }

async function getWarehouseWorkers() { return query("SELECT code, name_1 FROM public.odg_tms_warehouse_worker ORDER BY name_1 ASC, code ASC"); }
async function addWarehouseWorker(code, name_1) { await queryOne("INSERT INTO public.odg_tms_warehouse_worker(code, name_1) VALUES ($1, $2)", [code, name_1]); }
async function updateWarehouseWorker(code, name_1) { await queryOne("UPDATE public.odg_tms_warehouse_worker SET name_1=$1 WHERE code=$2", [name_1, code]); }
async function deleteWarehouseWorker(code) { await queryOne("DELETE FROM public.odg_tms_warehouse_worker WHERE code=$1", [code]); }

module.exports = {
  getCars,
  addCar,
  updateCar,
  deleteCar,
  getCarDefaults,
  getCarProfiles,
  addCarProfile,
  updateCarProfile,
  deleteCarProfile,
  getDispatchDriverByCode,
  getTransportDepartmentEmployees,
  getDispatchDrivers,
  getDispatchWorkers,
  getDispatchWorkersWithBranch,
  setWorkerBranch,
  getTransportBranches,
  getDrivers,
  addDriver,
  updateDriver,
  deleteDriver,
  getWarehouseWorkers,
  addWarehouseWorker,
  updateWarehouseWorker,
  deleteWarehouseWorker,
};

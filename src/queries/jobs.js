const { query, queryOne } = require("../lib/db");
const { ensureDeliveryWorkflowSchema } = require("./delivery");
const {
  coerceDateToFixedYear,
  getFixedTodayDate,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterShipment,
  ensureForwardBranchColumn,
  ensureTmsWorkerTable,
  ensurePendingJobListIndex,
  ensureTmsDetailItemTable,
  getRemainingBillProducts,
} = require("./helpers");
const { pushToDriver } = require("./push");

async function getJobs(session) {
  await ensureTmsWorkerTable();
  await ensurePendingJobListIndex();
  await ensureForwardBranchColumn();
  return query(
    `WITH worker_summary AS (
      SELECT doc_no, COUNT(*)::int AS worker_count,
        string_agg(worker_name, ', ' ORDER BY worker_name) AS workers
      FROM public.odg_tms_worker
      GROUP BY doc_no
    ),
    forward_summary AS (
      SELECT doc_no, MAX(forward_transport_code) AS forward_transport_code
      FROM public.odg_tms_detail
      WHERE forward_transport_code IS NOT NULL
        AND ${getFixedYearSqlFilter("doc_date")}
      GROUP BY doc_no
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at,
      b.name_1 as car, c.name_1 as driver, a.item_bill, d.name_1 as user_created,
      a.approve_status,
      case when a.approve_status=0 then 'ລໍຖ້າອະນຸມັດ'
        else case when a.job_status=0 then 'ລໍຖ້າຈັດສົ່ງ'
          when a.job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ'
          when a.job_status=2 then 'ກຳລັງຈັດສົ່ງ'
          when a.job_status=3 then 'ຄົນຂັບປິດງານ'
          else 'admin ປິດຖ້ຽວ' end
      end as status,
      a.job_status,
      COALESCE(w.worker_count, 0) as worker_count,
      COALESCE(w.workers, '') as workers,
      COALESCE(fs.forward_transport_code, '') as forward_transport_code,
      COALESCE(ftt.name_1, '') as forward_transport_name
    FROM odg_tms a
    LEFT JOIN public.odg_tms_car b ON b.code=a.car
    LEFT JOIN public.odg_tms_driver c ON c.code=a.driver
    LEFT JOIN erp_user d ON d.code=a.user_created
    LEFT JOIN worker_summary w ON w.doc_no = a.doc_no
    LEFT JOIN forward_summary fs ON fs.doc_no = a.doc_no
    LEFT JOIN public.transport_type ftt ON ftt.code = fs.forward_transport_code
    WHERE a.user_created=$1
      AND (a.approve_status = 0 OR a.approve_status IS NULL)
      AND ${getFixedYearSqlFilter("a.doc_date")}
    ORDER BY a.doc_no DESC
    LIMIT 20`,
    [session.usercode]
  );
}

async function createJob(session, data) {
  // Lazy-require to avoid circular dependencies
  const { getDispatchDriverByCode, getTransportDepartmentEmployees } = require("./master-data");

  const fixedDocDate = coerceDateToFixedYear(data.doc_date);
  const fixedDateLog = coerceDateToFixedYear(data.date_log);
  const uniqueWorkers = Array.from(
    new Set((data.workers ?? []).filter(Boolean).filter((workerCode) => workerCode !== data.driver))
  );
  const selectedDriver = await getDispatchDriverByCode(data.driver);
  if (!selectedDriver) {
    throw new Error("Selected driver was not found in odg_employee transport department");
  }
  const existingDriver = await queryOne("SELECT code FROM public.odg_tms_driver WHERE code=$1", [selectedDriver.code]);
  if (existingDriver) {
    await queryOne("UPDATE public.odg_tms_driver SET name_1=$1 WHERE code=$2", [selectedDriver.name_1, selectedDriver.code]);
  } else {
    await queryOne("INSERT INTO public.odg_tms_driver(code, name_1) VALUES ($1, $2)", [selectedDriver.code, selectedDriver.name_1]);
  }
  await ensureTmsWorkerTable();
  await ensureTmsDetailItemTable();
  await ensureForwardBranchColumn();

  const billsList = data.bills && data.bills.length > 0
    ? data.bills
    : await query(`SELECT bill_date, bill_no, cust_code, count_item, telephone FROM odg_tms_listbill_draft WHERE user_create=$1 AND ${getFixedYearSqlFilter("bill_date")}`, [session.usercode]);

  const normalizedBills = await Promise.all(
    billsList.map(async (bill) => {
      const remainingProducts = await getRemainingBillProducts(bill.bill_no);
      const remainingByItem = new Map(remainingProducts.map((item) => [item.item_code, item]));
      const billItems = bill.items;

      const itemsToSave =
        billItems && billItems.length > 0
          ? billItems.map((item) => {
              const remainingItem = remainingByItem.get(item.item_code);
              const selectedQty = Number(item.selectedQty ?? 0);
              if (!remainingItem) {
                throw new Error(`ບິນ ${bill.bill_no} ລາຍການ ${item.item_code} ຖືກຈັດຄົບແລ້ວ`);
              }
              if (!Number.isFinite(selectedQty) || selectedQty <= 0) {
                throw new Error(`ຈໍານວນຈັດສົ່ງຂອງ ${item.item_code} ບໍ່ຖືກຕ້ອງ`);
              }
              if (selectedQty > remainingItem.qty) {
                throw new Error(`ບິນ ${bill.bill_no} ລາຍການ ${item.item_code} ເຫຼືອຈັດໄດ້ພຽງ ${remainingItem.qty}`);
              }
              return {
                item_code: item.item_code,
                item_name: item.item_name || remainingItem.item_name,
                qty: remainingItem.qty,
                selectedQty,
                unit_code: item.unit_code || remainingItem.unit_code,
              };
            })
          : remainingProducts.map((item) => ({
              item_code: item.item_code,
              item_name: item.item_name,
              qty: item.qty,
              selectedQty: item.qty,
              unit_code: item.unit_code,
            }));

      if (itemsToSave.length === 0) {
        throw new Error(`ບິນ ${bill.bill_no} ບໍ່ມີລາຍການຄົງເຫຼືອໃຫ້ຈັດຖ້ຽວ`);
      }

      return { ...bill, count_item: itemsToSave.length, items: itemsToSave };
    })
  );

  const originBranch = (session.logistic_code ?? "").trim() || null;
  await queryOne(
    `INSERT INTO public.odg_tms(doc_no, doc_date, date_logistic, car, driver, item_bill, user_created, create_date_time_now, approve_status, job_status, origin_transport_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,LOCALTIMESTAMP(0),0,0,$8)`,
    [data.doc_no, fixedDocDate, fixedDateLog, data.car, data.driver, normalizedBills.length, session.usercode, originBranch]
  );

  for (const bill of normalizedBills) {
    const forwardCode = bill.forward_transport_code && String(bill.forward_transport_code).trim()
      ? String(bill.forward_transport_code).trim()
      : null;
    await queryOne(
      `INSERT INTO public.odg_tms_detail(doc_no, doc_date, car, bill_no, bill_date, cust_code, create_date_time_now, date_logistic, count_item, telephone, forward_transport_code)
       VALUES ($1,$2,$3,$4,$5,$6,LOCALTIMESTAMP(0),$7,$8,$9,$10)`,
      [data.doc_no, fixedDocDate, data.car, bill.bill_no, coerceDateToFixedYear(bill.bill_date), bill.cust_code, fixedDateLog, bill.count_item, bill.telephone, forwardCode]
    );
    if (bill.items && bill.items.length > 0) {
      for (const item of bill.items) {
        await queryOne(
          `INSERT INTO public.odg_tms_detail_item(doc_no, bill_no, item_code, item_name, qty, selected_qty, unit_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [data.doc_no, bill.bill_no, item.item_code, item.item_name, item.qty, item.selectedQty, item.unit_code]
        );
      }
    }
  }

  if (uniqueWorkers.length > 0) {
    const workerRows = await query(
      `SELECT e.employee_code AS code,
        COALESCE(NULLIF(TRIM(e.fullname_lo), ''), NULLIF(TRIM(e.nickname), ''), e.employee_code) AS name_1
      FROM public.odg_employee e
      LEFT JOIN public.odg_department d ON d.department_code = e.department_code
      WHERE e.employee_code = ANY($1::varchar[])
        AND e.employment_status = 'ACTIVE'
        AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'
      ORDER BY name_1 ASC, e.employee_code ASC`,
      [uniqueWorkers]
    );

    for (const worker of workerRows) {
      await queryOne(
        `INSERT INTO public.odg_tms_worker(doc_no, doc_date, worker_code, worker_name, user_create, create_date_time_now)
        VALUES ($1, $2, $3, $4, $5, LOCALTIMESTAMP(0))
        ON CONFLICT (doc_no, worker_code)
        DO UPDATE SET doc_date = EXCLUDED.doc_date, worker_name = EXCLUDED.worker_name, user_create = EXCLUDED.user_create`,
        [data.doc_no, fixedDocDate, worker.code, worker.name_1, session.usercode]
      );
    }
  }
  await queryOne("DELETE FROM public.odg_tms_listbill_draft WHERE user_create=$1", [session.usercode]);

  // Notify driver about the new dispatch
  if (data.driver) {
    const carRow = data.car
      ? await queryOne(
          "SELECT name_1 FROM public.odg_tms_car WHERE code = $1",
          [data.car]
        )
      : null;
    const carName = carRow?.name_1 ?? data.car ?? "";
    const logisticDate = data.date_log
      ? new Date(coerceDateToFixedYear(data.date_log)).toLocaleDateString("lo-LA")
      : "";
    const billCount = normalizedBills.length;
    const lines = [
      `📋 ຖ້ຽວ ${data.doc_no}`,
      logisticDate ? `📅 ສົ່ງວັນທີ ${logisticDate}` : null,
      carName ? `🚚 ລົດ ${carName}` : null,
      `📦 ${billCount} ບິນ`,
    ].filter(Boolean);
    void pushToDriver(
      data.driver,
      "🚚 ມີຖ້ຽວໃໝ່ໃຫ້ທ່ານ",
      lines.join("\n"),
      { type: "job_created", doc_no: data.doc_no }
    );
  }
}

async function deleteJob(docNo) {
  await ensureTmsWorkerTable();
  await ensureTmsDetailItemTable();
  // Grab the driver before delete so we can notify
  const job = await queryOne(
    `SELECT driver FROM odg_tms WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`,
    [docNo]
  );
  await queryOne(`UPDATE ic_trans_shipment SET check_status=0 WHERE doc_no IN (SELECT bill_no FROM odg_tms_detail WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")})`, [docNo]);
  await queryOne("DELETE FROM public.odg_tms_worker WHERE doc_no=$1", [docNo]);
  await queryOne("DELETE FROM public.odg_tms_detail_item WHERE doc_no=$1", [docNo]);
  await queryOne(`DELETE FROM public.odg_tms WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`, [docNo]);
  await queryOne(`DELETE FROM public.odg_tms_detail WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`, [docNo]);
  if (job?.driver) {
    void pushToDriver(
      job.driver,
      "❌ ຖ້ຽວຖືກຍົກເລີກ",
      `📋 ຖ້ຽວ ${docNo}\n⚠️ admin ໄດ້ລຶບຖ້ຽວນີ້ແລ້ວ`,
      { type: "job_deleted", doc_no: docNo }
    );
  }
}

async function closeJob(session, docNo) {
  await ensureDeliveryWorkflowSchema();
  const currentJob = await queryOne(
    `SELECT job_status, driver FROM odg_tms WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`,
    [docNo]
  );
  if (!currentJob) throw new Error("Job not found");
  if (Number(currentJob.job_status ?? 0) !== 3) {
    throw new Error("ສາມາດປິດຖ້ຽວໄດ້ເມື່ອຄົນຂັບປິດງານແລ້ວເທົ່ານັ້ນ");
  }
  await queryOne(
    `UPDATE odg_tms
     SET job_status=4, admin_close_at=LOCALTIMESTAMP(0), admin_close_user=$2
     WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`,
    [docNo, session.usercode]
  );
  if (currentJob.driver) {
    void pushToDriver(
      currentJob.driver,
      "✅ ຖ້ຽວຖືກປິດແລ້ວ",
      `📋 ຖ້ຽວ ${docNo}\n🏁 admin ປິດຖ້ຽວສຳເລັດ`,
      { type: "job_closed", doc_no: docNo }
    );
  }
}

async function getJobInit(session) {
  const fixedToday = getFixedTodayDate();
  const fixedMonth = fixedToday.slice(0, 7);
  const result = await queryOne("SELECT max(doc_no) as doc_no FROM public.odg_tms WHERE to_char(doc_date,'YYYY-MM')=$1", [fixedMonth]);
  const pfx = fixedMonth.replace("-", "");
  const doc_no = !result?.doc_no ? pfx + "00001" : String(parseInt(result.doc_no) + 1);
  const drafts = await query(`SELECT bill_date, to_char(bill_date,'DD-MM-YYYY') as bill_date_display, bill_no, cust_code, telephone, count_item FROM odg_tms_listbill_draft WHERE user_create=$1 AND ${getFixedYearSqlFilter("bill_date")}`, [session.usercode]);
  const scope = getBranchScope(session);
  const bills = await query(`SELECT doc_no, doc_date, to_char(doc_date,'DD-MM-YYYY') as doc_date_display, cust_code, b.telephone, (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no) as count_item FROM ic_trans_shipment a LEFT JOIN ar_customer b ON b.code=a.cust_code WHERE trans_flag=44 AND check_status=0 AND doc_no NOT IN (SELECT bill_no FROM odg_tms_listbill_draft) ${branchFilterShipment(scope, "a")} AND ${getFixedYearSqlFilter("a.doc_date")}`);
  return { doc_no, drafts, bills };
}

async function getJobAddPageData(session) {
  const { getAvailableBills } = require("./bills");
  const { getTransportDepartmentEmployees } = require("./master-data");

  const fixedToday = getFixedTodayDate();
  const fixedMonth = fixedToday.slice(0, 7);

  const [result, cars, employees, bills] = await Promise.allSettled([
    queryOne(
      "SELECT max(doc_no) as doc_no FROM public.odg_tms WHERE to_char(doc_date,'YYYY-MM')=$1",
      [fixedMonth]
    ),
    query("SELECT code, name_1 FROM public.odg_tms_car ORDER BY name_1 ASC, code ASC"),
    getTransportDepartmentEmployees(),
    getAvailableBills(session),
  ]);

  const pfx = fixedMonth.replace("-", "");
  const maxDocNo = result.status === "fulfilled" ? result.value?.doc_no : null;
  const doc_no = !maxDocNo ? pfx + "00001" : String(parseInt(maxDocNo) + 1);

  if (result.status === "rejected") console.error("getJobAddPageData/docNo", result.reason);
  if (cars.status === "rejected") console.error("getJobAddPageData/cars", cars.reason);
  if (employees.status === "rejected") console.error("getJobAddPageData/employees", employees.reason);
  if (bills.status === "rejected") console.error("getJobAddPageData/bills", bills.reason);

  const carList = cars.status === "fulfilled" ? cars.value : [];
  const employeeList = employees.status === "fulfilled" ? employees.value : [];
  const billList = bills.status === "fulfilled" ? bills.value : [];

  return { doc_no, cars: carList, drivers: employeeList, workers: employeeList, bills: billList };
}

async function getJobBillsWithProducts(docNo) {
  const bills = await query(
    `SELECT a.bill_no, to_char(a.bill_date,'DD-MM-YYYY') as bill_date, a.cust_code, b.name_1 as cust_name, a.count_item, a.telephone
     FROM public.odg_tms_detail a
     LEFT JOIN ar_customer b ON b.code=a.cust_code
     WHERE a.doc_no=$1 ORDER BY a.roworder`,
    [docNo]
  );
  if (bills.length === 0) return [];

  const selectedProducts = await query(
    `SELECT bill_no, item_code, item_name, selected_qty as qty, unit_code
     FROM public.odg_tms_detail_item
     WHERE doc_no=$1
     ORDER BY bill_no, roworder`,
    [docNo]
  ).catch(() => []);

  const selectedByBill = new Map();
  for (const product of selectedProducts) {
    const list = selectedByBill.get(product.bill_no) ?? [];
    list.push(product);
    selectedByBill.set(product.bill_no, list);
  }

  const missingBillNos = bills
    .map((bill) => bill.bill_no)
    .filter((billNo) => !selectedByBill.has(billNo));

  const fallbackProducts = missingBillNos.length
    ? await query(
        `SELECT doc_no as bill_no, item_code, item_name, qty, unit_code
         FROM ic_trans_detail
         WHERE doc_no = ANY($1::varchar[])
         ORDER BY doc_no, item_code`,
        [missingBillNos]
      )
    : [];

  const fallbackByBill = new Map();
  for (const product of fallbackProducts) {
    const list = fallbackByBill.get(product.bill_no) ?? [];
    list.push(product);
    fallbackByBill.set(product.bill_no, list);
  }

  return bills.map((bill) => ({
    ...bill,
    products: (selectedByBill.get(bill.bill_no) ?? fallbackByBill.get(bill.bill_no) ?? []).map(
      (product) => ({ ...product, qty: Number(product.qty ?? 0) })
    ),
  }));
}

async function addBillToDraft(session, data) {
  const fixedDocDate = coerceDateToFixedYear(data.ref_doc_date);
  await queryOne(
    "INSERT INTO odg_tms_listbill_draft(bill_date, bill_no, cust_code, user_create, count_item, telephone) VALUES($1,$2,$3,$4,$5,$6)",
    [fixedDocDate, data.ref_doc_no, data.ref_cust_code, session.usercode, data.count_item, data.telephone]
  );
  await queryOne(`UPDATE ic_trans_shipment SET check_status=1 WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`, [data.ref_doc_no]);
  const scope = getBranchScope(session);
  const drafts = await query(`SELECT bill_date, to_char(bill_date,'DD-MM-YYYY') as bill_date_display, bill_no, cust_code, telephone, count_item FROM odg_tms_listbill_draft WHERE user_create=$1 AND ${getFixedYearSqlFilter("bill_date")}`, [session.usercode]);
  const bills = await query(`SELECT doc_no, doc_date, to_char(doc_date,'DD-MM-YYYY') as doc_date_display, cust_code, b.telephone, (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no) as count_item FROM ic_trans_shipment a LEFT JOIN ar_customer b ON b.code=a.cust_code WHERE trans_flag=44 AND check_status=0 AND doc_no NOT IN (SELECT bill_no FROM odg_tms_listbill_draft) ${branchFilterShipment(scope, "a")} AND ${getFixedYearSqlFilter("a.doc_date")}`);
  return { drafts, bills };
}

async function removeBillFromDraft(session, billNo) {
  await queryOne(`DELETE FROM odg_tms_listbill_draft WHERE bill_no=$1 AND ${getFixedYearSqlFilter("bill_date")}`, [billNo]);
  await queryOne(`UPDATE ic_trans_shipment SET check_status=0 WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`, [billNo]);
  const scope = getBranchScope(session);
  const drafts = await query(`SELECT bill_date, to_char(bill_date,'DD-MM-YYYY') as bill_date_display, bill_no, cust_code, telephone, count_item FROM odg_tms_listbill_draft WHERE user_create=$1 AND ${getFixedYearSqlFilter("bill_date")}`, [session.usercode]);
  const bills = await query(`SELECT doc_no, doc_date, to_char(doc_date,'DD-MM-YYYY') as doc_date_display, cust_code, b.telephone, (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no) as count_item FROM ic_trans_shipment a LEFT JOIN ar_customer b ON b.code=a.cust_code WHERE trans_flag=44 AND check_status=0 AND doc_no NOT IN (SELECT bill_no FROM odg_tms_listbill_draft) ${branchFilterShipment(scope, "a")} AND ${getFixedYearSqlFilter("a.doc_date")}`);
  return { drafts, bills };
}

async function searchBills(session, q) {
  const scope = getBranchScope(session);
  return query(`SELECT doc_no, doc_date, to_char(doc_date,'DD-MM-YYYY') as doc_date_display, cust_code, b.telephone, (SELECT count(item_code) FROM ic_trans_detail WHERE doc_no=a.doc_no) as count_item FROM ic_trans_shipment a LEFT JOIN ar_customer b ON b.code=a.cust_code WHERE trans_flag=44 AND check_status=0 AND doc_no NOT IN (SELECT bill_no FROM odg_tms_listbill_draft) ${branchFilterShipment(scope, "a")} AND ${getFixedYearSqlFilter("a.doc_date")} AND (doc_no LIKE $1 OR cust_code LIKE $1) LIMIT 10`, [`%${q}%`]);
}

module.exports = {
  getJobs,
  createJob,
  deleteJob,
  closeJob,
  getJobInit,
  getJobAddPageData,
  getJobBillsWithProducts,
  addBillToDraft,
  removeBillFromDraft,
  searchBills,
};

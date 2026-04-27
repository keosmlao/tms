const { query } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterJob,
  ensureForwardBranchColumn,
} = require("./helpers");

async function getReportDaily(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH:MI') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status, coalesce(b.imei,'') as imei FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 ${branchFilterJob(scope, "a")} ORDER BY a.create_date_time_now`, [fromDate, toDate]);
}

async function getReportByDriver(session, fromDate, toDate, driverId) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  const drivers = await getTransportDepartmentEmployees();
  let listitem = [];
  if (driverId) {
    const scope = getBranchScope(session);
    await ensureForwardBranchColumn();
    listitem = await query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH:MI') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 AND a.driver=$3 ${branchFilterJob(scope, "a")} ORDER BY doc_no`, [fromDate, toDate, driverId]);
  }
  return { drivers, listitem };
}

async function getReportByCar(session, fromDate, toDate, carId) {
  const cars = await query("SELECT code, name_1 FROM public.odg_tms_car");
  let listitem = [];
  if (carId) {
    const scope = getBranchScope(session);
    await ensureForwardBranchColumn();
    listitem = await query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 AND a.car=$3 ${branchFilterJob(scope, "a")} ORDER BY doc_no`, [fromDate, toDate, carId]);
  }
  return { cars, listitem };
}

async function getReportByBill(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  return query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH:MI') as doc_date, a.doc_no, bill_no, to_char(bill_date,'DD-MM-YYYY') as bill_date, b.name_1 as cust_code, to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic, a.status, url_img, case when sent_start IS NULL then 'ລໍຖ້າຈັດສົ່ງ / ເບີກເຄື່ອງ' when sent_start IS NOT NULL AND sent_end IS NULL then 'ກຳລັງຈັດສົ່ງ' else case when a.status=1 then 'ຈັດສົ່ງສຳເລັດ' else 'ຍົກເລີກຈັດສົ່ງ' end end as status_trans, d.name_1 as car, e.name_1 as driver, count_item, a.remark, to_char(a.recipt_job,'DD-MM-YYYY HH:MI') as recipt_job, to_char(a.sent_start,'DD-MM-YYYY HH:MI') as sent_start, to_char(a.sent_end,'DD-MM-YYYY HH:MI') as sent_end FROM public.odg_tms_detail a LEFT JOIN ar_customer b ON b.code=a.cust_code LEFT JOIN odg_tms c ON c.doc_no=a.doc_no LEFT JOIN public.odg_tms_car d ON d.code=a.car LEFT JOIN public.odg_tms_driver e ON e.code=c.driver LEFT JOIN public.ic_trans_shipment s ON s.doc_no=a.bill_no WHERE a.doc_date BETWEEN $1 AND $2 ${scope.scoped ? `AND s.transport_code = '${scope.branch}'` : ""} ORDER BY a.roworder`, [fromDate, toDate]);
}

async function getReportMonthlyCar(session, monthly) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(
    `SELECT
       a.car AS car_code,
       b.name_1 AS car,
       COALESCE(b.imei, '') AS imei,
       COUNT(a.doc_no)::int AS qty,
       to_char(a.doc_date,'MM') AS month,
       to_char(a.doc_date,'yyyy') AS year
     FROM odg_tms a
     LEFT JOIN public.odg_tms_car b ON b.code = a.car
     WHERE to_char(a.doc_date,'yyyy-MM') = $1
       ${branchFilterJob(scope, "a")}
     GROUP BY a.car, b.name_1, b.imei, to_char(a.doc_date,'MM'), to_char(a.doc_date,'yyyy')
     ORDER BY COUNT(a.doc_no) DESC, b.name_1 ASC`,
    [monthly]
  );
}

async function getReportMonthlyDriver(session, monthly) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  const scope = getBranchScope(session);
  const employees = await getTransportDepartmentEmployees();
  const jobBranchFilter = scope.scoped
    ? `AND EXISTS (
        SELECT 1 FROM public.odg_tms_detail __dd
        JOIN public.ic_trans_shipment __ss ON __ss.doc_no = __dd.bill_no
        WHERE __dd.doc_no = a.doc_no AND __ss.transport_code = '${scope.branch}'
      )`
    : "";
  const counts = await query(
    `SELECT a.driver, COUNT(a.doc_no)::int AS qty
     FROM public.odg_tms a
     WHERE to_char(a.doc_date, 'yyyy-MM') = $1
       ${jobBranchFilter}
     GROUP BY a.driver`,
    [monthly]
  );
  const countMap = new Map();
  for (const row of counts) countMap.set(row.driver, Number(row.qty) || 0);

  const [year, month] = monthly.split("-");
  const result = employees.map((e) => ({
    driver: e.name_1,
    driver_code: e.code,
    qty: countMap.get(e.code) ?? 0,
    month,
    year,
  }));
  result.sort((a, b) => {
    const diff = b.qty - a.qty;
    if (diff !== 0) return diff;
    return a.driver.localeCompare(b.driver);
  });
  return result;
}

module.exports = {
  getReportDaily,
  getReportByDriver,
  getReportByCar,
  getReportByBill,
  getReportMonthlyCar,
  getReportMonthlyDriver,
};

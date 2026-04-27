const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterJob,
  ensureForwardBranchColumn,
} = require("./helpers");
const { pushToDriver } = require("./push");

async function getApproveList(session) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE (approve_status=0 OR approve_status IS NULL) AND ${getFixedYearSqlFilter("doc_date")} ${branchFilterJob(scope, "a")}`);
}

async function approveJob(session, docNo) {
  await queryOne(`UPDATE odg_tms SET approve_status=1, approve_user=$1 WHERE doc_no=$2 AND ${getFixedYearSqlFilter("doc_date")}`, [session.usercode, docNo]);

  // Notify the driver that the job is now approved and ready to receive.
  const job = await queryOne(
    `SELECT driver, date_logistic FROM odg_tms
     WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
    [docNo]
  );
  if (job?.driver) {
    const logisticDate = job.date_logistic
      ? new Date(job.date_logistic).toLocaleDateString("lo-LA")
      : "";
    void pushToDriver(
      job.driver,
      "ມີຖ້ຽວໃໝ່ຖືກອະນຸມັດ",
      `ຖ້ຽວ ${docNo}${logisticDate ? ` · ວັນຈັດສົ່ງ ${logisticDate}` : ""}`,
      { type: "job_approved", doc_no: docNo }
    );
  }
}

async function getApproveReport(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, b.name_1 as car, driver||'-'||c.name_1 as driver, item_bill, approve_user||'-'||e.name_1 as approve_user, user_created||'-'||d.name_1 as user_created, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as job_status FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created LEFT JOIN erp_user e ON e.code=a.approve_user WHERE doc_date BETWEEN $1 AND $2 ${branchFilterJob(scope, "a")} ORDER BY doc_date`, [fromDate, toDate]);
}

module.exports = { getApproveList, approveJob, getApproveReport };

const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterJob,
  ensureForwardBranchColumn,
} = require("./helpers");
const { pushToTopic } = require("./push");

async function getApproveList(session) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE (approve_status=0 OR approve_status IS NULL) AND ${getFixedYearSqlFilter("doc_date")} ${branchFilterJob(scope, "a")}`);
}

async function approveJob(session, docNo) {
  // Don't approve a trip that can't actually be dispatched: a driver-less or
  // car-less trip can never be received, and an empty trip (every bill
  // cancelled) has nothing to deliver.
  const job = await queryOne(
    `SELECT
       NULLIF(TRIM(a.driver), '') AS driver,
       NULLIF(TRIM(a.car), '') AS car,
       a.date_logistic AS date_logistic,
       (SELECT COUNT(*) FROM public.odg_tms_detail d
         WHERE d.doc_no = a.doc_no
           AND ${getFixedYearSqlFilter("d.doc_date")}
           AND COALESCE(d.status, 0) <> 2) AS open_bills
     FROM odg_tms a
     WHERE a.doc_no=$1 AND ${getFixedYearSqlFilter("a.doc_date")}`,
    [docNo]
  );
  if (!job) throw new Error("ບໍ່ພົບຖ້ຽວ");
  if (!job.driver) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ໄດ້ກຳນົດຄົນຂັບ — ບໍ່ສາມາດອະນຸມັດ");
  if (!job.car) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ໄດ້ກຳນົດລົດ — ບໍ່ສາມາດອະນຸມັດ");
  if (Number(job.open_bills) < 1) throw new Error("ຖ້ຽວນີ້ບໍ່ມີບິນທີ່ຈັດສົ່ງໄດ້ — ບໍ່ສາມາດອະນຸມັດ");

  await queryOne(`UPDATE odg_tms SET approve_status=1, approve_user=$1 WHERE doc_no=$2 AND ${getFixedYearSqlFilter("doc_date")}`, [session.usercode, docNo]);

  // Notify the driver that the job is now approved and ready to receive
  // (the trip was already fetched + validated above).
  if (job.driver) {
    const logisticDate = job.date_logistic
      ? new Date(job.date_logistic).toLocaleDateString("lo-LA")
      : "";
    const lines = [
      `📋 ຖ້ຽວ ${docNo}`,
      logisticDate ? `📅 ສົ່ງວັນທີ ${logisticDate}` : null,
      `✨ ພ້ອມຮັບຖ້ຽວແລ້ວ`,
    ].filter(Boolean);
    // ຄົນຂັບ + ຄົນທີ່ຕິກເປີດ "ອະນຸມັດ / ຍົກເລີກ / ປິດຖ້ຽວ" ໄວ້ເອງ.
    // ຫົວຂໍ້ເປັນກາງຢູ່ແລ້ວ ຈຶ່ງບໍ່ຕ້ອງມີສະບັບຜູ້ເຝົ້າເບິ່ງ.
    void pushToTopic({
      candidates: [job.driver],
      title: "✅ ຖ້ຽວຖືກອະນຸມັດແລ້ວ",
      body: lines.join("\n"),
      data: { type: "job_approved", doc_no: docNo },
      sales: false,
    });
  }
}

async function getApproveReport(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, b.name_1 as car, driver||'-'||c.name_1 as driver, item_bill, approve_user||'-'||e.name_1 as approve_user, user_created||'-'||d.name_1 as user_created, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as job_status FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created LEFT JOIN erp_user e ON e.code=a.approve_user WHERE doc_date BETWEEN $1 AND $2 ${branchFilterJob(scope, "a")} ORDER BY doc_date`, [fromDate, toDate]);
}

// Approved jobs (approve_status=1) — for the "ອະນຸມັດແລ້ວ" page
async function getApprovedList(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  await ensureForwardBranchColumn();
  return query(
    `SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date,
      a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as created_at,
      COALESCE(NULLIF(TRIM(b.name_1), ''), a.car, '-') as car,
      COALESCE(NULLIF(TRIM(c.name_1), ''), a.driver, '-') as driver,
      COALESCE(NULLIF(TRIM(uc.name_1), ''), a.user_created, '-') as user_created,
      COALESCE(NULLIF(TRIM(ap.name_1), ''), a.approve_user, '-') as approve_user,
      a.item_bill,
      COALESCE(a.job_status, 0) as job_status,
      case when a.job_status=0 then 'ລໍຖ້າຈັດສົ່ງ'
           when a.job_status=1 then 'ຮັບຖ້ຽວ'
           when a.job_status=2 then 'ກຳລັງຈັດສົ່ງ'
           when a.job_status=3 then 'ຄົນຂັບປິດງານ'
           else 'admin ປິດຖ້ຽວ' end as job_status_text
    FROM odg_tms a
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user uc ON uc.code = a.user_created
    LEFT JOIN erp_user ap ON ap.code = a.approve_user
    WHERE COALESCE(a.approve_status, 0) = 1
      AND a.doc_date BETWEEN $1 AND $2
      AND ${getFixedYearSqlFilter("a.doc_date")}
      ${branchFilterJob(scope, "a")}
    ORDER BY a.doc_date DESC, a.doc_no DESC`,
    [fromDate, toDate]
  );
}

module.exports = { getApproveList, approveJob, getApproveReport, getApprovedList };

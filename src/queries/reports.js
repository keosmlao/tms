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
  return query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status, coalesce(b.imei,'') as imei FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 ${branchFilterJob(scope, "a")} ORDER BY a.create_date_time_now`, [fromDate, toDate]);
}

async function getReportByDriver(session, fromDate, toDate, driverId) {
  const { getTransportDepartmentEmployees } = require("./master-data");
  const drivers = await getTransportDepartmentEmployees();
  let listitem = [];
  if (driverId) {
    const scope = getBranchScope(session);
    await ensureForwardBranchColumn();
    listitem = await query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 AND a.driver=$3 ${branchFilterJob(scope, "a")} ORDER BY doc_no`, [fromDate, toDate, driverId]);
  }
  return { drivers, listitem };
}

async function getReportByCar(session, fromDate, toDate, carId) {
  const cars = await query("SELECT code, name_1 FROM public.odg_tms_car");
  let listitem = [];
  if (carId) {
    const scope = getBranchScope(session);
    await ensureForwardBranchColumn();
    listitem = await query(`SELECT to_char(doc_date,'DD-MM-YYYY') as doc_date, doc_no, to_char(date_logistic,'DD-MM-YYYY') as date_logistic, to_char(a.job_close,'DD-MM-YYYY HH24:MI') as job_code, b.name_1 as car, c.name_1 as driver, item_bill, d.name_1 as user_created, approve_status, case when approve_status=0 then 'ລໍຖ້າອະນຸມັດ' else case when job_status=0 then 'ລໍຖ້າຈັດສົ່ງ' when job_status=1 then 'ຮັບຖ້ຽວ / ເບີກເຄື່ອງ' when job_status=2 then 'ກຳລັງຈັດສົ່ງ' when job_status=3 then 'ຄົນຂັບປິດງານ' else 'admin ປິດຖ້ຽວ' end end as status, job_status, COALESCE(a.miles_start,'') as miles_start, COALESCE(a.miles_end,'') as miles_end, CASE WHEN regexp_replace(COALESCE(a.miles_start,''), '[^0-9.]', '', 'g') ~ E'^\\\\d+(\\\\.\\\\d+)?$' AND regexp_replace(COALESCE(a.miles_end,''), '[^0-9.]', '', 'g') ~ E'^\\\\d+(\\\\.\\\\d+)?$' AND regexp_replace(a.miles_end, '[^0-9.]', '', 'g')::numeric >= regexp_replace(a.miles_start, '[^0-9.]', '', 'g')::numeric THEN (regexp_replace(a.miles_end, '[^0-9.]', '', 'g')::numeric - regexp_replace(a.miles_start, '[^0-9.]', '', 'g')::numeric) ELSE NULL END as distance_km FROM odg_tms a LEFT JOIN public.odg_tms_car b ON b.code=a.car LEFT JOIN public.odg_tms_driver c ON c.code=a.driver LEFT JOIN erp_user d ON d.code=a.user_created WHERE doc_date BETWEEN $1 AND $2 AND a.car=$3 ${branchFilterJob(scope, "a")} ORDER BY doc_no`, [fromDate, toDate, carId]);
  }
  return { cars, listitem };
}

async function getReportByBill(session, fromDate, toDate) {
  const scope = getBranchScope(session);
  return query(`SELECT to_char(a.create_date_time_now,'DD-MM-YYYY HH24:MI') as doc_date, a.doc_no, bill_no, to_char(bill_date,'DD-MM-YYYY') as bill_date, b.name_1 as cust_code, to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic, a.status, url_img, COALESCE(a.sight_img,'') as sight_img, COALESCE(img.delivery_images, ARRAY[]::text[]) as delivery_images, case when sent_start IS NULL then 'ລໍຖ້າຈັດສົ່ງ / ເບີກເຄື່ອງ' when sent_start IS NOT NULL AND sent_end IS NULL then 'ກຳລັງຈັດສົ່ງ' else case when a.status=1 then 'ຈັດສົ່ງສຳເລັດ' else 'ຍົກເລີກຈັດສົ່ງ' end end as status_trans, d.name_1 as car, e.name_1 as driver, count_item, a.remark, to_char(a.recipt_job,'DD-MM-YYYY HH24:MI') as recipt_job, to_char(a.sent_start,'DD-MM-YYYY HH24:MI') as sent_start, to_char(a.sent_end,'DD-MM-YYYY HH24:MI') as sent_end FROM public.odg_tms_detail a LEFT JOIN ar_customer b ON b.code=a.cust_code LEFT JOIN odg_tms c ON c.doc_no=a.doc_no LEFT JOIN public.odg_tms_car d ON d.code=a.car LEFT JOIN public.odg_tms_driver e ON e.code=c.driver LEFT JOIN public.ic_trans_shipment s ON s.doc_no=a.bill_no LEFT JOIN LATERAL (SELECT array_agg(di.image_data ORDER BY di.created_at ASC, di.roworder ASC) as delivery_images FROM public.odg_tms_delivery_images di WHERE di.bill_no = a.bill_no) img ON true WHERE a.doc_date BETWEEN $1 AND $2 ${scope.scoped ? `AND s.transport_code = '${scope.branch}'` : ""} ORDER BY a.roworder`, [fromDate, toDate]);
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
       COALESCE(MAX(gps.total_km), 0)::numeric AS total_km,
       to_char(a.doc_date,'MM') AS month,
       to_char(a.doc_date,'yyyy') AS year
     FROM odg_tms a
     LEFT JOIN public.odg_tms_car b ON b.code = a.car
     LEFT JOIN (
       SELECT imei, SUM(COALESCE(distance_km, 0))::numeric AS total_km
       FROM public.odg_tms_gps_daily
       WHERE to_char(usage_date, 'yyyy-MM') = $1
       GROUP BY imei
     ) gps ON gps.imei = NULLIF(TRIM(b.imei), '')
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

// Monthly delivery completion-rate KPI ("ອັດຕາການຈັດສົ່ງສຳເລັດ / ເດືອນ").
// For bills dispatched in the given month it measures how many were delivered
// successfully vs still outstanding — the rate the ops team tracks.
//
// Universe = bills (odg_tms_detail) belonging to an APPROVED, non-admin-closed
// job (approve_status=1, job_status<>4) whose job date (doc_date) falls in the
// month. Month is keyed on doc_date for consistency with every other monthly
// report + the fixed-year filter (sent_end is NULL for not-yet-delivered bills,
// so it can't key the denominator). Cancelled bills (status=2) are EXCLUDED so
// they neither help nor hurt the rate — total = delivered + pending exactly.
//   delivered (ສົ່ງສຳເລັດ) : status=1 AND sent_end set       — canonical "done"
//   pending   (ຄ້າງສົ່ງ)    : status NOT IN (1,2)             — waiting + in transit
//   on_time                : delivered AND sent_end::date <= target date
//                            (scheduled_date | send_date | bill_date) — the same
//                            canonical on-time rule the dashboard/KPI-alert use.
// One pass returns an overall rollup PLUS a per-branch (transport_code)
// breakdown via GROUPING SETS; the rollup row is the one with branch_code NULL.
async function getReportMonthlyDelivery(session, monthly) {
  const scope = getBranchScope(session);
  const branchClause = scope.scoped
    ? `AND EXISTS (SELECT 1 FROM ic_trans_shipment __ts WHERE __ts.doc_no = d.bill_no AND __ts.transport_code = '${scope.branch}')`
    : "";
  const rows = await query(
    `WITH base AS (
       SELECT
         COALESCE(s.transport_code, '') AS branch_code,
         d.status,
         d.sent_end,
         CASE
           WHEN d.status = 1 AND d.sent_end IS NOT NULL THEN
             CASE
               WHEN COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) IS NULL THEN NULL
               WHEN d.sent_end::date <= COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) THEN true
               ELSE false
             END
         END AS is_on_time
       FROM public.odg_tms_detail d
       INNER JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN ic_trans t ON t.doc_no = d.bill_no
       LEFT JOIN ic_trans_shipment s ON s.doc_no = d.bill_no
       WHERE to_char(d.doc_date,'yyyy-MM') = $1
         AND ${getFixedYearSqlFilter("d.doc_date")}
         AND COALESCE(a.approve_status,0) = 1
         AND COALESCE(a.job_status,0) <> 4
         ${branchClause}
     )
     SELECT
       branch_code,
       COUNT(*) FILTER (WHERE status = 1 AND sent_end IS NOT NULL)::int AS delivered,
       COUNT(*) FILTER (WHERE COALESCE(status,0) NOT IN (1,2))::int   AS pending,
       COUNT(*) FILTER (WHERE status = 2)::int                        AS cancelled,
       COUNT(*) FILTER (WHERE is_on_time = true)::int                 AS on_time,
       COUNT(*) FILTER (WHERE is_on_time = false)::int                AS breach
     FROM base
     GROUP BY GROUPING SETS ((), (branch_code))`,
    [monthly]
  );

  const branchNameRows = await query(
    `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name
     FROM transport_type WHERE code IN ('02-0001','02-0002','02-0003')`
  );
  const branchNames = Object.fromEntries(branchNameRows.map((r) => [r.code, r.name]));

  const toEntry = (r) => ({
    delivered: Number(r.delivered) || 0,
    pending: Number(r.pending) || 0,
    cancelled: Number(r.cancelled) || 0,
    on_time: Number(r.on_time) || 0,
    breach: Number(r.breach) || 0,
  });

  let overall = { delivered: 0, pending: 0, cancelled: 0, on_time: 0, breach: 0 };
  const branches = [];
  for (const r of rows) {
    // GROUPING SETS marks the all-branches rollup row with branch_code = NULL;
    // the per-branch rows carry the (possibly empty) transport_code.
    if (r.branch_code === null) {
      overall = toEntry(r);
    } else {
      const code = String(r.branch_code || "").trim();
      branches.push({
        branch_code: code || "unknown",
        branch_name: (code && branchNames[code]) || code || "ບໍ່ລະບຸສາຂາ",
        ...toEntry(r),
      });
    }
  }
  branches.sort((a, b) => a.branch_code.localeCompare(b.branch_code));
  return { month: monthly, overall, branches };
}

async function getMonthlyDeliveryKpi(session, monthly) {
  const report = await getReportMonthlyDelivery(session, monthly);
  return {
    branches: report.branches.map((branch) => {
      const opened = Number(branch.delivered) + Number(branch.pending);
      return {
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        opened,
        assigned: opened,
        dispatched: opened,
        delivered: Number(branch.delivered) || 0,
        pending: Number(branch.pending) || 0,
        kpi_success: Number(branch.on_time) || 0,
        returns: 0,
        failed_closed: Number(branch.cancelled) || 0,
        avg_days_from_appt: null,
      };
    }),
    fleet: {
      active_vehicles: 0,
      active_drivers: 0,
      total_trips: 0,
      vehicle_days: 0,
    },
  };
}

// Daily pending-bills report grouped by sale department + transport branch.
// Reuses getBillsPending so the figures stay in sync with /bills-pending and
// the dashboard's "ຄ້າງສົ່ງ" tile — no duplicated WHERE clauses to drift.
//
// Returns:
//   { rows, days, departments, transports, totals }
//   - rows: per-bill records (date, department, transport, bill_no, ...)
//   - days/departments/transports: distinct sorted dimensions for filter UI
//   - totals: aggregate { bills, items, qty } for the whole range
async function getReportPendingDaily(session, fromDate, toDate) {
  const { getBillsPending } = require("./bills");
  const { trans } = await getBillsPending(session, fromDate, toDate, "all");

  const rows = trans.map((bill) => ({
    send_date: bill.send_date ?? null,
    send_date_display: bill.send_date_display ?? bill.send_date ?? "-",
    department: (bill.department && String(bill.department).trim()) || "(ບໍ່ກຳນົດພະແນກ)",
    transport_code: bill.transport_code ?? "",
    transport: (bill.transport && String(bill.transport).trim()) || "(ບໍ່ກຳນົດຂົນສົ່ງ)",
    doc_no: bill.doc_no,
    customer: bill.transport_name || bill.cust_name || bill.cust_code || "-",
    sale: bill.sale ?? "",
    remaining_count: Number(bill.remaining_count ?? 0),
    remaining_qty_total: Number(bill.remaining_qty_total ?? 0),
    scheduled_date_display: bill.scheduled_date_display ?? "",
    action_status: bill.action_status ?? "",
    source_type: bill.source_type ?? "ic_trans_shipment",
  }));

  const sortedUnique = (vals) => Array.from(new Set(vals)).sort();
  const totals = rows.reduce(
    (acc, r) => {
      acc.bills += 1;
      acc.items += r.remaining_count;
      acc.qty += r.remaining_qty_total;
      return acc;
    },
    { bills: 0, items: 0, qty: 0 }
  );

  return {
    rows,
    days: sortedUnique(rows.map((r) => r.send_date_display).filter(Boolean)),
    departments: sortedUnique(rows.map((r) => r.department)),
    transports: sortedUnique(rows.map((r) => r.transport)),
    totals,
  };
}

// Helper: per-bill rows for a given final status (1 = ສຳເລັດ, 2 = ຍົກເລີກ),
// grouped + filterable by sale department + transport branch the same way
// the pending report does. Driven by sent_end so partial deliveries on the
// same bill across multiple trips each count once per attempt.
async function getReportByDeliveryStatus(session, fromDate, toDate, status) {
  const scope = getBranchScope(session);
  const branchClause = scope.scoped
    ? `AND s.transport_code = '${scope.branch}'`
    : "";
  const rows = await query(
    `SELECT
       to_char(d.sent_end, 'YYYY-MM-DD') AS finished_date,
       to_char(d.sent_end, 'DD-MM-YYYY') AS finished_date_display,
       to_char(d.sent_end, 'HH24:MI') AS finished_time,
       d.bill_no,
       d.doc_no,
       COALESCE(NULLIF(TRIM(cust.name_1), ''), d.cust_code, '-') AS customer,
       COALESCE(NULLIF(TRIM(dep.name_1::text), ''), NULLIF(TRIM(saleU.department::text), ''), '(ບໍ່ກຳນົດພະແນກ)') AS department,
       COALESCE(NULLIF(TRIM(saleU.name_1::text), ''), '') AS sale,
       COALESCE(NULLIF(TRIM(s.transport_code), ''), '') AS transport_code,
       COALESCE(NULLIF(TRIM(tt.name_1::text), ''), '(ບໍ່ກຳນົດຂົນສົ່ງ)') AS transport,
       COALESCE(NULLIF(TRIM(carT.name_1::text), ''), d.car, '-') AS car,
       COALESCE(NULLIF(TRIM(drvT.name_1::text), ''), j.driver, '-') AS driver,
       COALESCE(NULLIF(TRIM(d.count_item::text), ''), '0')::int AS item_count,
       COALESCE(d.remark, '') AS remark
     FROM public.odg_tms_detail d
     LEFT JOIN odg_tms j ON j.doc_no = d.doc_no
     LEFT JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
     LEFT JOIN public.ic_trans ic ON ic.doc_no = d.bill_no
     LEFT JOIN erp_user saleU ON saleU.code = ic.sale_code
     LEFT JOIN erp_department_list dep ON dep.code = saleU.department
     LEFT JOIN public.transport_type tt ON tt.code = s.transport_code
     LEFT JOIN ar_customer cust ON cust.code = d.cust_code
     LEFT JOIN public.odg_tms_car carT ON carT.code = d.car
     LEFT JOIN public.odg_tms_driver drvT ON drvT.code = j.driver
     WHERE COALESCE(d.status, 0) = $3
       AND d.sent_end IS NOT NULL
       AND d.sent_end::date BETWEEN $1::date AND $2::date
       AND ${getFixedYearSqlFilter("d.doc_date")}
       ${branchClause}
     ORDER BY d.sent_end DESC, d.bill_no`,
    [fromDate, toDate, status]
  );

  const sortedUnique = (vals) => Array.from(new Set(vals)).sort();
  const totals = rows.reduce(
    (acc, r) => {
      acc.bills += 1;
      acc.items += Number(r.item_count) || 0;
      return acc;
    },
    { bills: 0, items: 0 }
  );
  return {
    rows,
    days: sortedUnique(rows.map((r) => r.finished_date_display)),
    departments: sortedUnique(rows.map((r) => r.department)),
    transports: sortedUnique(rows.map((r) => r.transport)),
    totals,
  };
}

async function getReportDeliveredDaily(session, fromDate, toDate) {
  return getReportByDeliveryStatus(session, fromDate, toDate, 1);
}

async function getReportCancelledDaily(session, fromDate, toDate) {
  return getReportByDeliveryStatus(session, fromDate, toDate, 2);
}

// Per-attempt items: what was loaded into this trip for this bill, and how
// much actually got delivered. Falls back to ic_trans_detail when the row
// table is empty (cancelled before pickup) so the UI can still show what
// the bill contained.
async function getAttemptDeliveryItems(docNo, billNo) {
  const items = await query(
    `SELECT i.item_code,
            i.item_name,
            COALESCE(i.qty, 0)::numeric AS qty,
            COALESCE(i.selected_qty, 0)::numeric AS selected_qty,
            COALESCE(i.delivered_qty, 0)::numeric AS delivered_qty,
            i.unit_code
     FROM public.odg_tms_detail_item i
     WHERE i.doc_no = $1 AND i.bill_no = $2
     ORDER BY i.roworder NULLS LAST, i.item_code`,
    [docNo, billNo]
  );
  if (items.length > 0) return items;
  return query(
    `SELECT t.item_code,
            MAX(t.item_name) AS item_name,
            SUM(COALESCE(t.qty, 0))::numeric AS qty,
            SUM(COALESCE(t.qty, 0))::numeric AS selected_qty,
            0::numeric AS delivered_qty,
            MAX(t.unit_code) AS unit_code
     FROM ic_trans_detail t
     WHERE t.doc_no = $1 AND t.item_code NOT LIKE '97%'
     GROUP BY t.item_code
     ORDER BY t.item_code`,
    [billNo]
  );
}

module.exports = {
  getReportDaily,
  getReportByDriver,
  getReportByCar,
  getReportByBill,
  getReportMonthlyCar,
  getReportMonthlyDriver,
  getReportMonthlyDelivery,
  getMonthlyDeliveryKpi,
  getReportPendingDaily,
  getReportDeliveredDaily,
  getReportCancelledDaily,
  getAttemptDeliveryItems,
};

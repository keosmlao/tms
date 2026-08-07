const { pool, query, queryOne, queryOneB } = require("../lib/db");
const {
  ensureBillDeliveryItems,
  ensureDeliveryWorkflowSchema,
  ensureJobDeliveryItems,
  getBillDeliveryItems,
  getBillDeliveryItemSummary,
  getBillPhaseSummary,
  getOpenBillCount,
  saveDeliveryImages,
} = require("./delivery");
const {
  getLastDeliveredPoints,
  saveCustomerPoint,
  saveCustomerMasterPoint,
} = require("./customer-point");
const {
  coerceDateToFixedYear,
  getFixedTodayDate,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const { getLaoToday } = require("../lib/lao-date");
const {
  effectivePickupCodeSql,
  customerAreaSql,
  ensureTmsWorkerTable,
  invalidateRemainingSummary,
  billOpenedAtSql,
} = require("./helpers");
const { saveToken: saveFcmToken, deleteToken: deleteFcmToken } = require("./push");
const { saveFuelRefill, getFuelLogs, getFuelSummary } = require("./fuel");
const {
  notifyBillStatus,
  notifyPickupVariance,
  notifyBillDelivered,
} = require("./notifications");
const { computePickupVariance } = require("../lib/pickup-variance");
const { assertJobGeofence } = require("./geofence");
const { ensureDeliveryRouteSchema } = require("./delivery-route");
const { ensureDeliveryRoundSchema } = require("./delivery-round");

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function createAuthPayload(input) {
  const username = asText(input.username) || asText(input.code);
  const code = asText(input.code) || username;
  const driverId = asText(input.driver_id) || code || username;

  return {
    username,
    code,
    name_1: asText(input.name_1) || username,
    department: asText(input.department),
    roles: asText(input.roles) || asText(input.title),
    driver_id: driverId,
    logistic_code: asText(input.logistic_code),
    title: asText(input.title),
    // Overwritten by mobileLogin after a DB check; default driver.
    is_driver: true,
  };
}

// A user is a DRIVER iff they are a transport-department ("ຂົນສົ່ງ") employee in
// odg_employee — the exact definition the dispatch flow (getDispatchDriverByCode)
// and the web login use. Everyone else (other departments, or non-employee
// `users` accounts) is treated as a supervisor/manager by the app.
async function resolveIsDriver(code, rolesText) {
  const role = `${rolesText ?? ""}`.toLowerCase();
  const isOperationsRole =
    role.includes("supervisor") ||
    role.includes("head") ||
    role.includes("team_lead") ||
    role.includes("manager") ||
    role.includes("admin") ||
    role.includes("director") ||
    role.includes("executive") ||
    role.includes("transport_head") ||
    role.includes("ຫົວໜ້າ") ||
    role.includes("ຜູ້ຈັດການ");
  // A management title must win over department membership. Otherwise a
  // transport manager/head is incorrectly issued a driver-scoped token.
  if (isOperationsRole) return false;

  if (code) {
    const emp = await queryOne(
      `SELECT (d.department_name_lo ILIKE '%ຂົນສົ່ງ%') AS is_transport
       FROM public.odg_employee e
       LEFT JOIN public.odg_department d ON d.department_code = e.department_code
       WHERE e.employee_code = $1
       LIMIT 1`,
      [code]
    );
    if (emp) return emp.is_transport === true;
  }
  // Non-employee login (e.g. web `users` account) → supervisor unless the role
  // explicitly says driver.
  return role.includes("driver");
}

async function mobileLogin(body) {
  const username = asText(body?.username);
  const password = asText(body?.password);

  if (!username || !password) {
    const err = new Error("ກະລຸນາໃສ່ username ແລະ password");
    err.status = 400;
    throw err;
  }

  const user = await queryOne(
    `SELECT u.code, u.name_1, u.department, u.logistic_code,
            COALESCE(
              NULLIF(TRIM(wb.position_code), ''),
              NULLIF(TRIM(e.app_role), ''),
              NULLIF(TRIM(u.title), ''),
              ''
            ) AS title
     FROM erp_user u
     LEFT JOIN public.odg_employee e ON e.employee_code = u.code
     LEFT JOIN public.odg_tms_worker_branch wb ON wb.worker_code = u.code
     WHERE u.code = $1 AND u.password = $2`,
    [username, password]
  );
  if (user) {
    const payload = createAuthPayload({
      username: user.code,
      code: user.code,
      name_1: user.name_1 ?? user.code,
      department: user.department ?? "",
      driver_id: user.code,
      logistic_code: user.logistic_code ?? "",
      title: user.title ?? "",
    });
    payload.is_driver = await resolveIsDriver(payload.code, payload.roles);
    return payload;
  }

  const userB = await queryOneB(
    "SELECT username, roles FROM users WHERE username = $1 AND password = $2",
    [username, password]
  );
  if (userB) {
    const payload = createAuthPayload({
      username: userB.username,
      code: userB.username,
      name_1: userB.username,
      roles: userB.roles ?? "",
      driver_id: userB.username,
    });
    payload.is_driver = await resolveIsDriver(payload.code, payload.roles);
    return payload;
  }

  const err = new Error("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກ");
  err.status = 401;
  throw err;
}

// ±days window around the fixed "today" for pruning closed trips. Open trips
// (job_status < 3) always pass the filter — only the ever-growing tail of
// closed trips gets cut, so overdue unfinished work never disappears.
function closedTripWindow(days) {
  const base = new Date(`${getFixedTodayDate()}T00:00:00Z`);
  const shift = (delta) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };
  return { from: shift(-days), to: shift(days) };
}

async function mobileJobsList(driverId, date, options = {}) {
  await Promise.all([
    ensureTmsWorkerTable(),
    ensureDeliveryRouteSchema(),
    ensureDeliveryRoundSchema(),
  ]);
  const fixedDate = date ? coerceDateToFixedYear(date) : null;
  const reportFrom = options.fromDate
    ? coerceDateToFixedYear(options.fromDate)
    : null;
  const reportTo = options.toDate
    ? coerceDateToFixedYear(options.toDate)
    : null;
  let sql = `
    WITH bill_summary AS (
      SELECT
        d.doc_no, COUNT(*)::int AS total_bills,
        SUM(
          CASE
            WHEN COALESCE(d.count_item::text, '') ~ '^[0-9]+$'
              THEN d.count_item::text::int
            ELSE 0
          END
        )::int AS item_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NULL)::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NOT NULL)::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count,
        MIN(d.recipt_job) AS received_at,
        MIN(d.sent_start) FILTER (WHERE d.sent_start IS NOT NULL) AS first_bill_started_at
      FROM public.odg_tms_detail d
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY d.doc_no
    ),
    -- ຈຸດຕໍ່ໄປ: ບິນທຳອິດທີ່ຍັງບໍ່ປິດ. ໃສ່ມາກັບລາຍການຖ້ຽວເພື່ອໃຫ້ບັດຖ້ຽວ
    -- ບອກໄດ້ວ່າ "ຕໍ່ໄປໄປໃສ" ໂດຍບໍ່ຕ້ອງເປີດເຂົ້າໄປເບິ່ງບິນ.
    next_stop AS (
      SELECT DISTINCT ON (d.doc_no)
        d.doc_no,
        COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '') AS next_stop_name,
        acd.latitude  AS next_stop_lat,
        acd.longitude AS next_stop_lng
      FROM public.odg_tms_detail d
      LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
      LEFT JOIN public.ar_customer_detail acd ON acd.ar_code = d.cust_code
      WHERE COALESCE(d.status, 0) NOT IN (1, 2)
        AND ${getFixedYearSqlFilter("d.doc_date")}
      ORDER BY d.doc_no, d.sent_start NULLS LAST, d.bill_no
    ),
    -- ຕຳແໜ່ງລ່າສຸດຂອງລົດ — ໄລຍະຕ້ອງວັດຈາກ "ບ່ອນລົດຢູ່ດຽວນີ້" ບໍ່ແມ່ນຈາກສາງ
    -- ຈຶ່ງຈະເປັນຕົວເລກທີ່ຄົນຂັບໃຊ້ຕັດສິນໃຈໄດ້.
    last_fix AS (
      SELECT DISTINCT ON (th.doc_no) th.doc_no, th.lat, th.lng
      FROM public.odg_tms_travel_history th
      ORDER BY th.doc_no, th.recorded_at DESC
    ),
    worker_summary AS (
      SELECT doc_no, COUNT(*)::int AS worker_count,
        string_agg(worker_name, ', ' ORDER BY worker_name) AS workers
      FROM public.odg_tms_worker
      GROUP BY doc_no
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      a.car as car_code, b.name_1 as car, c.name_1 as driver,
      COALESCE(bs.total_bills, 0) as item_bill,
      COALESCE(bs.item_count, 0) as item_count,
      COALESCE(ws.worker_count, 0) as worker_count,
      COALESCE(ws.workers, '') as workers,
      COALESCE(a.delivery_route_code, '') as delivery_route_code,
      COALESCE(rt.name, '') as delivery_route_name,
      COALESCE(a.delivery_round_code, '') as delivery_round_code,
      COALESCE(dr.name, '') as delivery_round_name,
      COALESCE(dr.time_label, '') as delivery_round_time_label,
      d.name_1 as user_created,
      a.approve_status::text, a.job_status,
      COALESCE(bs.waiting_bill_count, 0) as waiting_bill_count,
      COALESCE(bs.inprogress_bill_count, 0) as inprogress_bill_count,
      COALESCE(bs.completed_bill_count, 0) as completed_bill_count,
      COALESCE(bs.cancelled_bill_count, 0) as cancelled_bill_count,
      COALESCE(ns.next_stop_name, '') as next_stop_name,
      -- ໄລຍະເສັ້ນຊື່ (ກມ) ຈາກລົດຫາຈຸດຕໍ່ໄປ. ວ່າງ = ຂາດພິກັດຝ່າຍໃດຝ່າຍໜຶ່ງ
      -- → ຈໍບໍ່ສະແດງ ດີກວ່າສະແດງ 0 ໃຫ້ເຂົ້າໃຈຜິດວ່າຮອດແລ້ວ.
      COALESCE(
        CASE
          WHEN COALESCE(ns.next_stop_lat, 0) = 0
            OR COALESCE(ns.next_stop_lng, 0) = 0
            OR lf.lat IS NULL OR lf.lng IS NULL
            OR lf.lat !~ '^-?[0-9.]+$' OR lf.lng !~ '^-?[0-9.]+$'
          THEN NULL
          ELSE round((6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians(lf.lat::numeric)) * cos(radians(ns.next_stop_lat))
              * cos(radians(ns.next_stop_lng) - radians(lf.lng::numeric))
              + sin(radians(lf.lat::numeric)) * sin(radians(ns.next_stop_lat))
            ))))::numeric, 1)::text
        END, '') as next_stop_km,
      COALESCE(to_char(bs.received_at,'DD-MM-YYYY HH24:MI'), '-') as received_at,
      COALESCE(to_char(a.dispatch_started_at,'DD-MM-YYYY HH24:MI'), '-') as dispatch_started_at,
      COALESCE(a.miles_start, '') as miles_start,
      COALESCE(lm.latest_miles, '') as latest_miles,
      -- Same rationale as the bills query — keep image bytes out of the list
      -- response, expose only a presence flag. Drivers rarely need to see
      -- their own odometer photo, so lazy-loading is fine when they do.
      '' as img_start,
      (a.img_start IS NOT NULL AND a.img_start <> '') as has_img_start,
      COALESCE(a.miles_end, '') as miles_end,
      '' as img_end,
      (a.img_end IS NOT NULL AND a.img_end <> '') as has_img_end,
      case when a.approve_status = 0 then 'ລໍຖ້າອະນຸມັດ'
        else case
          when a.job_status = 0 then 'ລໍຖ້າຈັດສົ່ງ'
          when a.job_status = 1 then 'ຮັບຖ້ຽວ'
          when a.job_status = 2 then 'ກຳລັງຈັດສົ່ງ'
          when a.job_status = 3 then 'ຄົນຂັບປິດງານ'
          else 'admin ປິດຖ້ຽວ'
        end
      end as status
    FROM odg_tms a
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user d ON d.code = a.user_created
    LEFT JOIN bill_summary bs ON bs.doc_no = a.doc_no
    LEFT JOIN worker_summary ws ON ws.doc_no = a.doc_no
    LEFT JOIN next_stop ns ON ns.doc_no = a.doc_no
    LEFT JOIN last_fix lf ON lf.doc_no = a.doc_no
    LEFT JOIN public.odg_tms_delivery_route rt
      ON rt.code = a.delivery_route_code
    LEFT JOIN public.odg_tms_delivery_round dr
      ON dr.code = a.delivery_round_code
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        NULLIF(TRIM(previous.miles_end), ''),
        NULLIF(TRIM(previous.miles_start), '')
      ) AS latest_miles
      FROM public.odg_tms previous
      WHERE previous.car = a.car
        AND previous.doc_no <> a.doc_no
        AND (
          NULLIF(TRIM(previous.miles_end), '') IS NOT NULL
          OR NULLIF(TRIM(previous.miles_start), '') IS NOT NULL
        )
      ORDER BY previous.doc_date DESC,
        previous.create_date_time_now DESC NULLS LAST,
        previous.doc_no DESC
      LIMIT 1
    ) lm ON TRUE`;

  if (reportFrom && reportTo) {
    sql += ` WHERE a.driver=$1
      AND a.date_logistic BETWEEN $2 AND $3
      AND ${getFixedYearSqlFilter("a.doc_date")}
      ORDER BY a.date_logistic DESC, a.doc_no DESC`;
    return await query(sql, [driverId, reportFrom, reportTo]);
  }

  if (date) {
    sql += ` WHERE a.driver=$1 AND a.job_status != 4 AND a.doc_date=$2 AND ${getFixedYearSqlFilter("a.doc_date")} ORDER BY a.doc_no`;
    return await query(sql, [driverId, fixedDate]);
  }

  if (options.windowDays) {
    const win = closedTripWindow(options.windowDays);
    sql += ` WHERE a.driver=$1 AND a.job_status != 4
      AND ${getFixedYearSqlFilter("a.doc_date")}
      AND (a.job_status < 3 OR COALESCE(a.date_logistic, a.doc_date) BETWEEN $2 AND $3)
      ORDER BY a.doc_no`;
    return await query(sql, [driverId, win.from, win.to]);
  }

  sql += ` WHERE a.driver=$1 AND a.job_status != 4 AND ${getFixedYearSqlFilter("a.doc_date")} ORDER BY a.doc_no`;
  return await query(sql, [driverId]);
}

function normalizeSupervisorStatus(value) {
  const status = asText(value).toLowerCase();
  if (["pending", "active", "done", "issue"].includes(status)) return status;
  return "";
}

async function mobileJobsListAll({
  date = "",
  driverId = "",
  status = "",
  windowDays = 0,
} = {}) {
  const fixedDate = date ? coerceDateToFixedYear(date) : null;
  const normalizedStatus = normalizeSupervisorStatus(status);
  const where = ["a.job_status != 4", getFixedYearSqlFilter("a.doc_date")];
  const params = [];

  if (fixedDate) {
    params.push(fixedDate);
    where.push(`a.doc_date=$${params.length}`);
  } else if (windowDays) {
    // Same pruning as the driver list: open trips always included, closed
    // trips only within the window around today.
    const win = closedTripWindow(windowDays);
    params.push(win.from, win.to);
    where.push(
      `(a.job_status < 3 OR COALESCE(a.date_logistic, a.doc_date) BETWEEN $${params.length - 1} AND $${params.length})`
    );
  }
  if (asText(driverId)) {
    params.push(asText(driverId));
    where.push(`a.driver=$${params.length}`);
  }
  if (normalizedStatus === "pending") {
    where.push(`COALESCE(a.approve_status, 0) = 0`);
  } else if (normalizedStatus === "active") {
    where.push(`a.job_status IN (1, 2)`);
  } else if (normalizedStatus === "done") {
    where.push(`a.job_status >= 3`);
  }
  const issueWhere =
    normalizedStatus === "issue"
      ? " AND COALESCE(bs.cancelled_bill_count, 0) > 0"
      : "";

  const sql = `
    WITH candidate_jobs AS (
      SELECT a.doc_no
      FROM odg_tms a
      WHERE ${where.join(" AND ")}
    ),
    bill_summary AS (
      SELECT
        d.doc_no, COUNT(*)::int AS total_bills,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NULL)::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NOT NULL)::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count,
        MIN(d.recipt_job) AS received_at,
        MIN(d.sent_start) FILTER (WHERE d.sent_start IS NOT NULL) AS first_bill_started_at
      FROM public.odg_tms_detail d
      INNER JOIN candidate_jobs cj ON cj.doc_no = d.doc_no
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY d.doc_no
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      a.car as car_code, b.name_1 as car, c.name_1 as driver,
      COALESCE(bs.total_bills, 0) as item_bill, d.name_1 as user_created,
      a.approve_status::text, a.job_status,
      COALESCE(bs.waiting_bill_count, 0) as waiting_bill_count,
      COALESCE(bs.inprogress_bill_count, 0) as inprogress_bill_count,
      COALESCE(bs.completed_bill_count, 0) as completed_bill_count,
      COALESCE(bs.cancelled_bill_count, 0) as cancelled_bill_count,
      COALESCE(to_char(bs.received_at,'DD-MM-YYYY HH24:MI'), '-') as received_at,
      COALESCE(to_char(a.dispatch_started_at,'DD-MM-YYYY HH24:MI'), '-') as dispatch_started_at,
      COALESCE(a.miles_start, '') as miles_start,
      '' as img_start,
      (a.img_start IS NOT NULL AND a.img_start <> '') as has_img_start,
      COALESCE(a.miles_end, '') as miles_end,
      '' as img_end,
      (a.img_end IS NOT NULL AND a.img_end <> '') as has_img_end,
      case when a.approve_status = 0 then 'ລໍຖ້າອະນຸມັດ'
        else case
          when a.job_status = 0 then 'ລໍຖ້າຈັດສົ່ງ'
          when a.job_status = 1 then 'ຮັບຖ້ຽວ'
          when a.job_status = 2 then 'ກຳລັງຈັດສົ່ງ'
          when a.job_status = 3 then 'ຄົນຂັບປິດງານ'
          else 'admin ປິດຖ້ຽວ'
        end
      end as status
    FROM odg_tms a
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user d ON d.code = a.user_created
    LEFT JOIN bill_summary bs ON bs.doc_no = a.doc_no
    WHERE ${where.join(" AND ")}${issueWhere}
    ORDER BY a.doc_no`;
  return await query(sql, params);
}

// Pickup quantities keep their zeros — "ຮັບ 0 ອັນ" is a meaningful report from
// the warehouse floor, whereas normalizeItems() drops zero lines because for a
// delivery they mean "nothing to record".
function parsePickupItems(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    const itemCode = asText(raw?.item_code);
    if (!itemCode) continue;
    const qty = Number(raw?.qty ?? 0);
    out.push({ item_code: itemCode, qty: Number.isFinite(qty) ? qty : 0 });
  }
  return out;
}

function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  const grouped = new Map();
  for (const raw of value) {
    const itemCode = asText(raw?.item_code);
    const qty = Number(raw?.qty ?? 0);
    if (!itemCode || !Number.isFinite(qty) || qty <= 0) continue;
    grouped.set(itemCode, (grouped.get(itemCode) ?? 0) + qty);
  }
  return Array.from(grouped.entries()).map(([item_code, qty]) => ({ item_code, qty }));
}

async function notifyJobDispatchStarted(docNo) {
  try {
    const dispatchBills = await query(
      `SELECT d.bill_no, to_char(j.dispatch_started_at, 'DD-MM HH24:MI') AS dispatch_at,
              COALESCE(s.cust_code, '') AS cust_code,
              COALESCE(NULLIF(TRIM(cust.name_1), ''), '') AS cust_name,
              COALESCE(NULLIF(TRIM(carn.name_1), ''), '') AS car_name,
              COALESCE(NULLIF(TRIM(drv.name_1), ''), '') AS driver_name
       FROM public.odg_tms_detail d
       LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
       LEFT JOIN public.ic_trans_shipment s ON s.doc_no = d.bill_no
       LEFT JOIN ar_customer cust ON cust.code = s.cust_code
       LEFT JOIN public.odg_tms_car carn ON carn.code = j.car
       LEFT JOIN public.odg_tms_driver drv ON drv.code = j.driver
       WHERE d.doc_no=$1
         AND COALESCE(d.status, 0) NOT IN (1, 2)
         AND ${getFixedYearSqlFilter("d.doc_date")}`,
      [docNo]
    );
    const { getCustomerLineId } = require("./customer-line");
    const { sendDeliveryFlex } = require("../lib/line");
    const base = process.env.PUBLIC_BASE_URL || "https://tms.odienmall.com";
    for (const b of dispatchBills) {
      void notifyBillStatus(b.bill_no, "🚚 ເລີ່ມຈັດສົ່ງ", {
        dispatchAt: b.dispatch_at,
      });
      // Auto-notify the CUSTOMER via LINE — only those who have linked their
      // LINE account (odg_tms_customer_line). Customers without LINE are skipped.
      if (b.cust_code) {
        const lineId = await getCustomerLineId(b.cust_code);
        if (lineId) {
          void sendDeliveryFlex({
            to: lineId,
            statusLabel: "🚚 ສິນຄ້າຂອງທ່ານກຳລັງຈັດສົ່ງ",
            color: "sky",
            billNo: b.bill_no,
            customerName: b.cust_name,
            carName: b.car_name,
            driverName: b.driver_name,
            trackingUrl: `${base}/track?bill=${encodeURIComponent(b.bill_no)}`,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[mobile] dispatch notification failed:", err?.message ?? err);
  }
}

// ໄລຍະທາງຈາກ tracker — ຍິງແບບບໍ່ລໍ ແລະ ກືນຄວາມຜິດພາດ ເພາະການບັນທຶກ
// ໄລຍະບໍ່ຄວນເຮັດໃຫ້ການເລີ່ມ/ປິດຖ້ຽວຂອງຄົນຂັບລົ້ມເຫຼວ.
function recordTripDistanceStart(docNo, carCode) {
  const { captureStart } = require("./trip-distance");
  Promise.resolve(captureStart(docNo, carCode)).catch((error) =>
    console.error("[trip-distance] start failed", docNo, error?.message ?? error)
  );
}

function recordTripDistanceEnd(docNo, carCode) {
  const { captureEnd } = require("./trip-distance");
  Promise.resolve(captureEnd(docNo, carCode)).catch((error) =>
    console.error("[trip-distance] end failed", docNo, error?.message ?? error)
  );
}

async function mobileJobAction(body) {
  const client = await pool.connect();
  // Any driver action can change what a bill still owes (pickup corrections,
  // deliveries, returns, cancels). Instead of sprinkling invalidation through a
  // dozen switch branches, clear this bill's cached remaining count once the
  // action finishes — the next read recomputes it.
  const invalidateAfter = () => {
    const bill = asText(body?.bill_no);
    if (bill) invalidateRemainingSummary(bill);
  };
  try {
    const action = asText(body.action);
    const docNo = asText(body.doc_no);
    const billNo = asText(body.bill_no);
    const driverId = asText(body.driver_id);
    const carCode = asText(body.car_code ?? body.car);
    const milesStart = asNullableText(body.miles_start);
    const milesEnd = asNullableText(body.miles_end);
    const startImage = asNullableText(body.img_start ?? body.start_image);
    const endImage = asNullableText(body.img_end ?? body.end_image);
    const deliveryImages = Array.isArray(body.delivery_images)
      ? body.delivery_images.filter((img) => typeof img === "string" && img.length > 0)
      : body.delivery_image
      ? [body.delivery_image]
      : [];
    const deliveryImage = deliveryImages.length > 0 ? deliveryImages[0] : null;
    const signatureImage = asNullableText(body.signature_image ?? body.sight_img);
    const comment = asNullableText(body.comment ?? body.remark);
    const lat = asNullableText(body.lat);
    const lng = asNullableText(body.lng);
    const latEnd = asNullableText(body.lat_end);
    const lngEnd = asNullableText(body.lng_end);

    await client.query("BEGIN");
    await ensureDeliveryWorkflowSchema(client);
    if (!driverId) {
      const err = new Error("Unauthorized");
      err.status = 401;
      throw err;
    }
    if (docNo) {
      const carClause = carCode ? "AND car = $3" : "";
      const allowedParams = carCode ? [docNo, driverId, carCode] : [docNo, driverId];
      const allowedJob = await client.query(
        `SELECT 1 FROM odg_tms
         WHERE doc_no = $1 AND driver = $2 ${carClause} AND ${getFixedYearSqlFilter("doc_date")}
         LIMIT 1`,
        allowedParams
      );
      if (allowedJob.rowCount === 0) {
        const err = new Error("Forbidden");
        err.status = 403;
        throw err;
      }
    }
    if (billNo) {
      const allowedBill = await client.query(
        `SELECT 1
         FROM public.odg_tms_detail d
         INNER JOIN odg_tms t ON t.doc_no = d.doc_no
         WHERE d.bill_no = $1
           AND t.driver = $2
           AND ${getFixedYearSqlFilter("d.doc_date")}
         LIMIT 1`,
        [billNo, driverId]
      );
      if (allowedBill.rowCount === 0) {
        const err = new Error("Forbidden");
        err.status = 403;
        throw err;
      }
    }

    // Serialize concurrent driver actions on the same bill / trip so a
    // double-submit (two devices, or a manual tap racing the offline-outbox
    // flush) can't read-modify-write the same delivery twice — e.g. add
    // delivered_qty / COD twice, or two complete_job closes. Advisory xact
    // locks, released at COMMIT/ROLLBACK; always taken bill-then-job so the
    // order is consistent (no deadlock).
    if (billNo) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tms_exec_bill:${billNo}`]);
    }
    if (docNo) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tms_exec_job:${docNo}`]);
    }

    // Idempotency: claim this action's client-generated id once. A replayed or
    // duplicated request (offline-outbox flush, or a retry after the first
    // attempt's response was lost) finds the id already taken and is skipped
    // instead of re-applying the mutation — the gap the status guards miss when
    // a bill was reverted between the original send and the replay. The claim is
    // in the same txn, so a failed action ROLLs BACK and the id stays free.
    const actionId = asText(body.action_id);
    if (actionId) {
      const claim = await client.query(
        `INSERT INTO public.odg_tms_mobile_action_log(action_id, action, bill_no, doc_no)
         VALUES ($1, $2, $3, $4) ON CONFLICT (action_id) DO NOTHING RETURNING action_id`,
        [actionId, action, billNo || null, docNo || null]
      );
      if (claim.rowCount === 0) {
        await client.query("COMMIT");
        return {
          success: true,
          idempotent_skip: true,
          action,
          bill_no: billNo || null,
          doc_no: docNo || null,
        };
      }
    }

    switch (action) {
      case "receive": {
        if (!docNo) throw new Error("doc_no is required");
        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 1 THEN 1 ELSE job_status END
           WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo]
        );
        await client.query("COMMIT");
        return { success: true };
      }

      case "pickup_bill": {
        if (!billNo) throw new Error("bill_no is required");
        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status,
                  (${effectivePickupCodeSql('d')} <> COALESCE(t.origin_transport_code, '')) AS is_other_branch
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentJob = billRow.rows[0];
        const currentDocNo = currentJob?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentJob.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        // Bills sitting at ANOTHER branch's warehouse can only be picked up once
        // the trip has actually started dispatching (job_status >= 2). Own-branch
        // bills load first, before dispatch starts.
        if (currentJob.is_other_branch && Number(currentJob.job_status ?? 0) < 2) {
          throw new Error("ບິນສາຂາອື່ນ: ຕ້ອງເລີ່ມຈັດສົ່ງກ່ອນຈຶ່ງເບີກໄດ້");
        }
        // ຮັບຖ້ຽວ is a required first step: the driver must take the trip before
        // any goods leave the warehouse against it. This used to auto-receive
        // (job_status 0 → 1) to save a tap, which let the pickup silently skip
        // the step; the app now hides every pickup control until the trip is
        // received, and this guard makes the rule hold for any other client.
        if (Number(currentJob.job_status ?? 0) === 0) {
          throw new Error("ຕ້ອງກົດ 'ຮັບຖ້ຽວ' ກ່ອນ ຈຶ່ງເບີກເຄື່ອງໄດ້");
        }
        if (Number(currentJob.job_status ?? 0) > 2) {
          throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດເບີກເຄື່ອງ");
        }

        await ensureBillDeliveryItems(billNo, client);

        // ── ຈຳນວນທີ່ຮັບຕົວຈິງ (optional) ──
        // The app may report what the warehouse actually handed over. Anything
        // short of the trip plan corrects selected_qty right here — which puts
        // the shortfall straight back into the bill's pending pool, since
        // "available" is ERP qty − selected_qty on active trips — and files a
        // variance for the dispatcher. Sending no items keeps the old
        // behaviour (a plain tap picks up the full planned quantity).
        const reportedItems = parsePickupItems(body.items);
        let variance = null;
        if (reportedItems.length > 0) {
          const plannedRows = await client.query(
            `SELECT item_code, item_name, unit_code,
                    COALESCE(selected_qty, 0)::numeric AS selected_qty
             FROM public.odg_tms_detail_item
             WHERE doc_no = $1 AND bill_no = $2
             ORDER BY roworder`,
            [currentDocNo, billNo]
          );
          const result = computePickupVariance(
            plannedRows.rows.map((row) => ({
              item_code: row.item_code,
              item_name: row.item_name,
              unit_code: row.unit_code,
              selected_qty: Number(row.selected_qty ?? 0),
            })),
            reportedItems
          );
          if (result.emptyPickup) {
            throw new Error(
              "ບໍ່ໄດ້ຮັບສິນຄ້າແມ່ນແຕ່ລາຍການດຽວ — ໃຫ້ໃຊ້ 'ຍົກເລີກບິນ' ແທນການເບີກເຄື່ອງ"
            );
          }
          for (const line of result.lines) {
            // over_reported lines keep their planned qty (actual === planned),
            // so this only ever writes a correction downwards.
            if (line.actual_qty !== line.planned_qty) {
              await client.query(
                `UPDATE public.odg_tms_detail_item
                 SET selected_qty = $4
                 WHERE doc_no = $1 AND bill_no = $2 AND item_code = $3`,
                [currentDocNo, billNo, line.item_code, line.actual_qty]
              );
            }
            await client.query(
              `INSERT INTO public.odg_tms_pickup_variance
                 (doc_no, bill_no, item_code, item_name, unit_code,
                  planned_qty, reported_qty, actual_qty, diff_qty, over_reported, driver, remark)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                currentDocNo,
                billNo,
                line.item_code,
                line.item_name,
                line.unit_code,
                line.planned_qty,
                line.reported_qty,
                line.actual_qty,
                line.diff_qty,
                line.over_reported,
                driverId,
                comment,
              ]
            );
          }
          if (result.hasVariance) variance = result;
        }

        await client.query(
          `UPDATE public.odg_tms_detail
           SET recipt_job = COALESCE(recipt_job, LOCALTIMESTAMP(0))
           WHERE bill_no = $1 AND doc_no = $2 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, currentDocNo]
        );

        // Cascade sent_start = recipt_job when picked up away from the trip's
        // origin warehouse — those bills leave that warehouse immediately
        // (no separate "ເລີ່ມຈັດສົ່ງ" step happens from there).
        await client.query(
          `UPDATE public.odg_tms_detail d
           SET sent_start = COALESCE(d.sent_start, d.recipt_job, LOCALTIMESTAMP(0))
           FROM odg_tms j
           WHERE d.bill_no = $1
             AND d.doc_no = $2
             AND j.doc_no = d.doc_no
             AND d.sent_start IS NULL
             AND ${effectivePickupCodeSql('d')} <> COALESCE(j.origin_transport_code, '')
             AND ${getFixedYearSqlFilter("d.doc_date")}`,
          [billNo, currentDocNo]
        );

        await client.query("COMMIT");
        invalidateRemainingSummary(billNo);
        void notifyBillStatus(billNo, "📦 ເບີກເຄື່ອງແລ້ວ");
        if (variance) {
          // Fire-and-forget: the pickup itself must not fail because a push
          // token is stale or the dispatcher lookup is slow.
          void notifyPickupVariance({
            billNo,
            docNo: currentDocNo,
            driverCode: driverId,
            variance,
          });
        }
        return {
          success: true,
          doc_no: currentDocNo,
          // Lets the app show "ປັບຈຳນວນໃນຖ້ຽວແລ້ວ" and refresh its item list.
          variance: variance
            ? {
                lines: variance.lines,
                planned_total: variance.plannedTotal,
                actual_total: variance.actualTotal,
              }
            : null,
        };
      }

      // Receive goods AT the customer's home/shop ("ຮັບສິນຄ້າຈາກລານລູກຄ້າ").
      // Used by the driver app for '__CUSTOMER__' pickup bills, where the goods
      // are collected from the customer (reverse logistics) before being driven
      // on to the real drop-off. Unlike pickup_bill, this captures the receive
      // GPS + a photo + the customer's signature (attached separately via
      // attach_bill_image kind=pickup / pickup_signature) and DELIBERATELY does
      // NOT set sent_start — the bill stays in the "pickup" phase so the driver
      // still does a separate Check in + ສຳເລັດ at the delivery destination.
      case "receive_customer_bill": {
        if (!billNo) throw new Error("bill_no is required");
        const billRow = await client.query(
          `SELECT d.doc_no, d.cust_code, d.pickup_transport_code,
                  t.approve_status, t.job_status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) >= 3) throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດຮັບເຄື່ອງ");
        if (currentBill.pickup_transport_code !== "__CUSTOMER__") {
          throw new Error("ບິນນີ້ບໍ່ແມ່ນການຮັບຈາກລານລູກຄ້າ");
        }
        // Same first-step rule as pickup_bill: the trip must be received before
        // any goods are collected against it (was an auto-receive).
        if (Number(currentBill.job_status ?? 0) === 0) {
          throw new Error("ຕ້ອງກົດ 'ຮັບຖ້ຽວ' ກ່ອນ ຈຶ່ງຮັບສິນຄ້າໄດ້");
        }

        await ensureBillDeliveryItems(billNo, client);

        // Mark goods received + stamp the receive GPS. sent_start is left NULL
        // on purpose so the bill remains in the "pickup" phase for the delivery
        // leg. The photo + signature are stored by attach_bill_image beforehand.
        await client.query(
          `UPDATE public.odg_tms_detail
           SET recipt_job = COALESCE(recipt_job, LOCALTIMESTAMP(0)),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng)
           WHERE bill_no = $1 AND doc_no = $4 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, currentDocNo]
        );

        // Backfill the customer's stored location when it's missing — same
        // guarded write as checkin_bill (only fills empty/zero). Not an
        // overwrite: complete_bill owns that, using the shop-front fix.
        await saveCustomerMasterPoint(
          { custCode: currentBill.cust_code, lat, lng },
          client
        );

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "📦 ຮັບສິນຄ້າຈາກລານລູກຄ້າແລ້ວ");
        return { success: true, doc_no: currentDocNo };
      }

      case "dispatch":
      case "start_dispatch": {
        if (!docNo) throw new Error("doc_no is required");
        const jobRow = await client.query(
          `SELECT approve_status, job_status
           FROM odg_tms
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo]
        );
        const currentJob = jobRow.rows[0];
        if (!currentJob) throw new Error("Job was not found");
        if (Number(currentJob.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        const currentJobStatus = Number(currentJob.job_status ?? 0);
        if (currentJobStatus === 2) {
          await client.query("COMMIT");
          return { success: true, already_started: true };
        }
        if (currentJobStatus > 2) throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດເລີ່ມຈັດສົ່ງ");

        // Goods owned by the trip's origin branch must be explicitly picked up
        // before the truck may leave. Bills collected at the customer or at a
        // different branch are intentionally excluded because they are picked
        // up later along the route.
        const pendingOriginPickup = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms j ON j.doc_no = d.doc_no
           WHERE d.doc_no = $1
             AND COALESCE(d.status, 0) NOT IN (1, 2)
             AND d.recipt_job IS NULL
             AND COALESCE(d.pickup_transport_code, '') <> '__CUSTOMER__'
             AND ${effectivePickupCodeSql('d')} = COALESCE(j.origin_transport_code, '')
             AND ${getFixedYearSqlFilter("d.doc_date")}`,
          [docNo]
        );
        const pendingOriginPickupCount = Number(pendingOriginPickup.rows[0]?.count ?? 0);
        if (pendingOriginPickupCount > 0) {
          throw new Error(
            `ຕ້ອງເບີກສິນຄ້າຂອງສາຂານີ້ໃຫ້ຄົບກ່ອນ (ຍັງເຫຼືອ ${pendingOriginPickupCount} ບິນ)`
          );
        }

        // Geofence: when the branch requires it, the driver must be at the
        // configured start point (within radius) to begin dispatch. No-op when
        // the branch hasn't enabled it. Runs before any write so a blocked
        // start leaves no side effects.
        await assertJobGeofence(client, { docNo, kind: "start", lat, lng });
        // Auto-receive when the driver skipped tapping "ຮັບຖ້ຽວ" — starting
        // dispatch implies the trip is in hand, so don't block on a missing
        // intermediate step.

        await client.query(
          `UPDATE odg_tms
           SET job_status = 2,
               dispatch_started_at = COALESCE(dispatch_started_at, LOCALTIMESTAMP(0)),
               miles_start = COALESCE($2, miles_start),
               img_start = COALESCE($3, img_start),
               lat_start = COALESCE($4, lat_start),
               lng_start = COALESCE($5, lng_start)
           WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo, milesStart, startImage, lat, lng]
        );

        // ຈົດເລກໄມລ໌ຈາກ tracker ໄວ້ເປັນຈຸດເລີ່ມນັບໄລຍະຂອງຖ້ຽວນີ້.
        // ບໍ່ໃຫ້ລົ້ມທັງ transaction ຖ້າ tracker ບໍ່ຕອບ — ໄລຍະທາງເປັນຂໍ້ມູນ
        // ປະກອບ ບໍ່ຄວນຂວາງຄົນຂັບບໍ່ໃຫ້ເລີ່ມສົ່ງ.
        recordTripDistanceStart(docNo, carCode);

        // Cascade sent_start = dispatch_started_at for bills picked up at
        // the trip's origin warehouse — for those bills, "leaving the depot"
        // and "starting delivery" are the same moment. Bills picked up at a
        // different warehouse (or at the customer) get sent_start set during
        // pickup_bill / checkin_bill instead.
        await client.query(
          `UPDATE public.odg_tms_detail d
           SET sent_start = COALESCE(d.sent_start, j.dispatch_started_at)
           FROM odg_tms j
           LEFT JOIN public.ic_trans_shipment s_inner ON FALSE
           WHERE d.doc_no = $1
             AND j.doc_no = d.doc_no
             AND d.sent_start IS NULL
             AND ${effectivePickupCodeSql('d')} = COALESCE(j.origin_transport_code, '')
             AND ${getFixedYearSqlFilter("d.doc_date")}`,
          [docNo]
        );

        // ເບີກເຄື່ອງ is implicit for bills picked up at the trip's origin
        // warehouse — they leave with the driver the moment dispatch starts —
        // so backfill recipt_job here too. Bills picked up at another warehouse
        // keep recipt_job NULL until the driver taps "ຮັບເຄື່ອງ" there.
        await client.query(
          `UPDATE public.odg_tms_detail d
           SET recipt_job = COALESCE(d.recipt_job, j.dispatch_started_at, LOCALTIMESTAMP(0))
           FROM odg_tms j
           WHERE d.doc_no = $1
             AND j.doc_no = d.doc_no
             AND d.recipt_job IS NULL
             AND ${effectivePickupCodeSql('d')} = COALESCE(j.origin_transport_code, '')
             AND ${getFixedYearSqlFilter("d.doc_date")}`,
          [docNo]
        );

        await client.query("COMMIT");
        void notifyJobDispatchStarted(docNo);
        return { success: true };
      }

      case "checkin_bill": {
        if (!billNo) throw new Error("bill_no is required");
        await ensureBillDeliveryItems(billNo, client);

        const billRow = await client.query(
          `SELECT d.doc_no, d.cust_code, t.approve_status, t.job_status, d.recipt_job,
                  d.pickup_transport_code, t.dispatch_started_at,
                  COALESCE(t.origin_transport_code, '') AS origin_transport_code,
                  ${effectivePickupCodeSql('d')} AS effective_pickup_code
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) >= 3) throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດ checkin");
        // Auto-receive + auto-dispatch: the UPDATE below sets job_status=2
        // regardless of current value, so a driver who jumped straight to
        // check-in (skipped "ຮັບຖ້ຽວ" / "ເລີ່ມຈັດສົ່ງ") still progresses cleanly.
        // ເບີກເຄື່ອງ (goods receipt) is automatic in two cases, so we skip the
        // gate and backfill recipt_job in the UPDATE below:
        //   1. Pickup-at-customer — the driver arrives at the customer, hands
        //      over the freshly received goods; one checkin counts as both.
        //   2. Pickup at the trip's origin warehouse — the goods left that
        //      warehouse with the driver, so receiving is implicit.
        // Bills picked up at a *different* warehouse still require the driver to
        // tap "ຮັບເຄື່ອງ" at that location first.
        const pickupAtCustomer = currentBill.pickup_transport_code === "__CUSTOMER__";
        const pickupAtOrigin =
          (currentBill.effective_pickup_code ?? "") === (currentBill.origin_transport_code ?? "");
        const autoReceive = pickupAtCustomer || pickupAtOrigin;
        if (!autoReceive && !currentBill.recipt_job) {
          throw new Error("ກະລຸນາເບີກເຄື່ອງກ່ອນ");
        }
        // Driver may skip the explicit "ເລີ່ມຈັດສົ່ງ" button (older trips, or
        // they jumped straight to the customer). Backfill dispatch_started_at
        // here so the timeline + LINE notification still get a real timestamp.
        const dispatchAutoStarted = !currentBill.dispatch_started_at;

        // One active checkin per job — block until the previously checked-in
        // bill is completed or cancelled. "Active" now means checkin_at is
        // set (driver tapped Check in) and the bill hasn't been finalised.
        // sent_start can be set ahead of checkin (e.g. start_dispatch fills
        // it for default-warehouse bills), so it's no longer the right gate.
        const activeCheckin = await client.query(
          `SELECT bill_no FROM public.odg_tms_detail
           WHERE doc_no = $1
             AND bill_no <> $2
             AND checkin_at IS NOT NULL
             AND sent_end IS NULL
             AND COALESCE(status, 0) NOT IN (1, 2)
             AND ${getFixedYearSqlFilter("doc_date")}
           LIMIT 1`,
          [currentDocNo, billNo]
        );
        if (activeCheckin.rows.length > 0) {
          throw new Error(
            `ກະລຸນາສຳເລັດ ຫຼື ຍົກເລີກບິນ ${activeCheckin.rows[0].bill_no} ກ່ອນ checkin ບິນອື່ນ`
          );
        }

        // checkin_at = arrival at the destination (always set here).
        // For customer-pickup bills the same checkin doubles as the moment
        // the driver picks up + starts delivering, so backfill recipt_job
        // and sent_start too.
        await client.query(
          `UPDATE public.odg_tms_detail
           SET checkin_at = COALESCE(checkin_at, LOCALTIMESTAMP(0)),
               recipt_job = CASE
                 WHEN $4::boolean
                   THEN COALESCE(recipt_job, LOCALTIMESTAMP(0))
                 ELSE recipt_job
               END,
               sent_start = CASE
                 WHEN pickup_transport_code = '__CUSTOMER__'
                   THEN COALESCE(sent_start, LOCALTIMESTAMP(0))
                 ELSE sent_start
               END,
               lat = COALESCE($2, lat), lng = COALESCE($3, lng)
           WHERE bill_no = $1 AND doc_no = $5 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, autoReceive, currentDocNo]
        );

        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END,
               dispatch_started_at = COALESCE(dispatch_started_at, LOCALTIMESTAMP(0))
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [currentDocNo]
        );

        // When dispatch is auto-started here (driver skipped start_dispatch),
        // cascade sent_start for sibling bills picked up at the trip's origin
        // warehouse — same rule as start_dispatch. Without this, those bills
        // would have sent_start IS NULL until they themselves get completed.
        if (dispatchAutoStarted) {
          await client.query(
            `UPDATE public.odg_tms_detail d
             SET sent_start = COALESCE(d.sent_start, j.dispatch_started_at)
             FROM odg_tms j
             WHERE d.doc_no = $1
               AND j.doc_no = d.doc_no
               AND d.sent_start IS NULL
               AND ${effectivePickupCodeSql('d')} = COALESCE(j.origin_transport_code, '')
               AND ${getFixedYearSqlFilter("d.doc_date")}`,
            [currentDocNo]
          );
        }

        // Backfill the customer's location if it's missing. Only fills when the
        // existing latitude/longitude is empty/zero — the driver may check in
        // from the road, so this must not overwrite a better fix. complete_bill
        // is where the shop-front coordinate overwrites unconditionally.
        await saveCustomerMasterPoint(
          { custCode: currentBill.cust_code, lat, lng },
          client
        );

        await client.query("COMMIT");
        if (dispatchAutoStarted) void notifyJobDispatchStarted(currentDocNo);
        void notifyBillStatus(billNo, "📍 ຮອດຈຸດສົ່ງ");
        return { success: true, doc_no: currentDocNo };
      }

      case "attach_bill_image": {
        // Upload one image at a time so the JSON payload stays small. The app
        // calls this per image before issuing complete_bill / cancel_bill so
        // the close action can run with no images in its body.
        if (!billNo) throw new Error("bill_no is required");
        const kind = asText(body.kind);
        const imageData = asNullableText(body.image_data);
        if (!imageData) throw new Error("image_data is required");

        // Per-trip image columns (sight/url/recipt) live on odg_tms_detail, so
        // resolve the bill's active trip row (same most-progressed pick the
        // close actions use) and scope the writes to it — a bill_no that exists
        // on two trips must not get its image stamped on the wrong row.
        const imgDocRow = await client.query(
          `SELECT d.doc_no FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1 AND t.driver = $2 AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentDocNo = imgDocRow.rows[0]?.doc_no ?? null;

        if (kind === "delivery") {
          if (body.replace) {
            // Edit flow: wipe existing delivery images for this bill before
            // inserting the new one. Sent on the first attach of an edit batch.
            await client.query(
              `DELETE FROM public.odg_tms_delivery_images WHERE bill_no = $1`,
              [billNo]
            );
          }
          await saveDeliveryImages(billNo, [imageData], client);
        } else if (kind === "signature") {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET sight_img = $2
             WHERE bill_no = $1 AND doc_no = $3 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, imageData, currentDocNo]
          );
        } else if (kind === "primary") {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET url_img = $2
             WHERE bill_no = $1 AND doc_no = $3 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, imageData, currentDocNo]
          );
        } else if (kind === "pickup") {
          // Proof-of-pickup photo captured at the customer's home/shop for
          // '__CUSTOMER__' bills — kept apart from the delivery photo (url_img).
          await client.query(
            `UPDATE public.odg_tms_detail
             SET recipt_img = $2
             WHERE bill_no = $1 AND doc_no = $3 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, imageData, currentDocNo]
          );
        } else if (kind === "pickup_signature") {
          // Customer's signature confirming the goods were handed over at pickup.
          await client.query(
            `UPDATE public.odg_tms_detail
             SET recipt_sign_img = $2
             WHERE bill_no = $1 AND doc_no = $3 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, imageData, currentDocNo]
          );
        } else {
          throw new Error("kind must be delivery|signature|primary|pickup|pickup_signature");
        }

        await client.query("COMMIT");
        return { success: true };
      }

      case "attach_job_image": {
        // Per-job odometer photos (start / end). Same rationale as
        // attach_bill_image — keeps each upload payload tiny.
        if (!docNo) throw new Error("doc_no is required");
        const kind = asText(body.kind);
        const imageData = asNullableText(body.image_data);
        if (!imageData) throw new Error("image_data is required");

        const col = kind === "start" ? "img_start" : kind === "end" ? "img_end" : null;
        if (!col) throw new Error("kind must be start|end");

        await client.query(
          `UPDATE odg_tms SET ${col} = $2 WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo, imageData]
        );

        await client.query("COMMIT");
        return { success: true };
      }

      case "complete_bill": {
        if (!billNo) throw new Error("bill_no is required");
        await ensureBillDeliveryItems(billNo, client);

        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status, d.recipt_job, d.forward_transport_code,
                  d.pickup_transport_code, d.url_img,
                  COALESCE(t.origin_transport_code, '') AS origin_transport_code,
                  ${effectivePickupCodeSql('d')} AS effective_pickup_code,
                  COALESCE(d.status, 0) AS status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.status ?? 0) === 1) {
          const openBillCount = await getOpenBillCount(currentDocNo, client);
          await client.query("COMMIT");
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            finished: true,
            already_completed: true,
            open_bill_count: openBillCount,
          };
        }
        // Current app uploads photos in separate attach_bill_image requests
        // before complete_bill, so accept either an inline image or the primary
        // image already persisted on the bill.
        if (deliveryImages.length === 0 && !asNullableText(currentBill.url_img)) {
          throw new Error("ຕ້ອງຖ່າຍຮູບຫຼັກຖານກ່ອນສົ່ງສຳເລັດ");
        }
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) >= 3) throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດສຳເລັດ");
        // Same origin-aware ເບີກເຄື່ອງ rule as checkin_bill: auto-receive when
        // the goods came from the trip's origin warehouse or from the customer;
        // otherwise the driver must still tap "ຮັບເຄື່ອງ" first.
        const pickupAtCustomer = currentBill.pickup_transport_code === "__CUSTOMER__";
        const pickupAtOrigin =
          (currentBill.effective_pickup_code ?? "") === (currentBill.origin_transport_code ?? "");
        const autoReceive = pickupAtCustomer || pickupAtOrigin;
        if (!currentBill.recipt_job) {
          if (!autoReceive) throw new Error("ກະລຸນາເບີກເຄື່ອງກ່ອນ");
          await client.query(
            `UPDATE public.odg_tms_detail
             SET recipt_job = COALESCE(recipt_job, LOCALTIMESTAMP(0))
             WHERE bill_no = $1 AND doc_no = $2 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, currentDocNo]
          );
        }
        // Auto-progress through receive + dispatch when the driver skipped
        // those steps. The two UPDATE odg_tms statements below already bump
        // job_status to 2; we also backfill dispatch_started_at so the
        // timeline + LINE notification reflect a real start time.
        const dispatchAutoStarted = Number(currentBill.job_status ?? 0) < 2;

        const forwardToBranch = currentBill.forward_transport_code
          ? String(currentBill.forward_transport_code).trim()
          : null;

        if (forwardToBranch) {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
                 status = 1,
                 sent_end = LOCALTIMESTAMP(0),
                 lat = COALESCE($2, lat), lng = COALESCE($3, lng),
                 lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
                 url_img = COALESCE($6, url_img),
                 sight_img = COALESCE($7, sight_img),
                 remark = COALESCE($8, remark)
             WHERE bill_no = $1 AND doc_no = $9 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, lat, lng, latEnd, lngEnd, deliveryImage, signatureImage, comment, currentDocNo]
          );

          await saveDeliveryImages(billNo, deliveryImages, client);

          // Capture the bill's CURRENT shipment branch before we move it — used
          // below to backfill the anchor on a legacy NULL-origin trip so it stays
          // in the operating branch's scoped lists once the shipment leaves.
          const shipBefore = await client.query(
            `SELECT NULLIF(TRIM(transport_code), '') AS transport_code
             FROM ic_trans_shipment WHERE doc_no = $1`,
            [billNo]
          );
          const sourceBranch = shipBefore.rows[0]?.transport_code ?? "";

          await client.query(
            `UPDATE ic_trans_shipment
             SET transport_code = $2, check_status = 0
             WHERE doc_no = $1`,
            [billNo, forwardToBranch]
          );

          // Re-home the bill onto the receiving branch's pending queue: pin its
          // transport to that branch and clear the originating branch's stale
          // schedule so it surfaces in "ລໍຖ້າຈັດຖ້ຽວ" as a fresh, to-be-scheduled
          // stop (flagged incoming-forwarded). Mirrors reclassifyDeliveredBillToBranch.
          const { ensurePendingBillSchema } = require("./pending-bill");
          await ensurePendingBillSchema();
          await client.query(
            `INSERT INTO public.odg_tms_pending_bill (bill_no, transport_code, scheduled_date, delivery_round_code, delivery_route_code, updated_at)
             VALUES ($1, $2, NULL, NULL, NULL, LOCALTIMESTAMP(0))
             ON CONFLICT (bill_no) DO UPDATE
               SET transport_code = EXCLUDED.transport_code,
                   scheduled_date = NULL,
                   delivery_round_code = NULL,
                   delivery_route_code = NULL,
                   updated_at = LOCALTIMESTAMP(0)`,
            [billNo, forwardToBranch]
          );

          await client.query(
            `UPDATE odg_tms
             SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END,
                 dispatch_started_at = COALESCE(dispatch_started_at, LOCALTIMESTAMP(0))
             WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [currentDocNo]
          );

          // Anchor a legacy NULL-origin trip to the branch that operated it so the
          // forwarded 'ສົ່ງຕໍ່ → ສາຂາ' row stays visible in that branch's scoped
          // lists after the shipment moves to the destination.
          const tripOrigin = String(currentBill.origin_transport_code ?? "").trim();
          if (!tripOrigin && sourceBranch && sourceBranch !== forwardToBranch) {
            await client.query(
              `UPDATE odg_tms SET origin_transport_code = $2
                WHERE doc_no = $1
                  AND NULLIF(TRIM(origin_transport_code), '') IS NULL
                  AND ${getFixedYearSqlFilter("doc_date")}`,
              [currentDocNo, sourceBranch]
            );
          }

          // Cascade sent_start for sibling bills picked up at the trip's
          // origin warehouse when dispatch was auto-started here.
          if (dispatchAutoStarted) {
            await client.query(
              `UPDATE public.odg_tms_detail d
               SET sent_start = COALESCE(d.sent_start, j.dispatch_started_at)
               FROM odg_tms j
               WHERE d.doc_no = $1
                 AND j.doc_no = d.doc_no
                 AND d.sent_start IS NULL
                 AND ${effectivePickupCodeSql('d')} = COALESCE(j.origin_transport_code, '')
                 AND ${getFixedYearSqlFilter("d.doc_date")}`,
              [currentDocNo]
            );
          }

          const openBillCount = await getOpenBillCount(currentDocNo, client);

          await client.query("COMMIT");
          if (dispatchAutoStarted) void notifyJobDispatchStarted(currentDocNo);
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            finished: true,
            forwarded_to: forwardToBranch,
            open_bill_count: openBillCount,
          };
        }

        const itemRows = await client.query(
          `SELECT item_code, selected_qty, delivered_qty
           FROM public.odg_tms_detail_item
           WHERE bill_no = $1 AND doc_no = $2
           ORDER BY item_code`,
          [billNo, currentDocNo]
        );

        if (itemRows.rows.length === 0) {
          throw new Error("No delivery items found for this bill");
        }

        const requestedItems = normalizeItems(body.items);
        const itemsToDeliver =
          requestedItems.length > 0
            ? requestedItems
            : itemRows.rows
                .map((row) => ({
                  item_code: row.item_code,
                  qty: Number(row.selected_qty ?? 0) - Number(row.delivered_qty ?? 0),
                }))
                .filter((row) => row.qty > 0);

        if (itemsToDeliver.length === 0) {
          const openBillCount = await getOpenBillCount(currentDocNo, client);
          await client.query("COMMIT");
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            finished: true,
            already_completed: true,
            open_bill_count: openBillCount,
          };
        }

        const currentItems = new Map(
          itemRows.rows.map((row) => [
            row.item_code,
            {
              selectedQty: Number(row.selected_qty ?? 0),
              deliveredQty: Number(row.delivered_qty ?? 0),
            },
          ])
        );

        for (const item of itemsToDeliver) {
          const currentItem = currentItems.get(item.item_code);
          if (!currentItem) throw new Error(`Item ${item.item_code} was not found`);
          const remainingQty = currentItem.selectedQty - currentItem.deliveredQty;
          const deliverQty = Math.min(item.qty, Math.max(remainingQty, 0));
          if (deliverQty <= 0) continue;

          await client.query(
            `UPDATE public.odg_tms_detail_item
             SET delivered_qty = COALESCE(delivered_qty, 0)::numeric + $2::numeric
             WHERE bill_no = $1 AND item_code = $3 AND doc_no = $4`,
            [billNo, deliverQty, item.item_code, currentDocNo]
          );
        }

        // Partial delivery (ຈັດສົ່ງຫຼາຍຄັ້ງ/ບິນດຽວ): only close the bill (status=1)
        // once nothing is left owed to the customer. While qty remains, we set
        // sent_start so the bill sits in the "inprogress" phase — the driver can
        // tap "ສຳເລັດ" again for the next batch, or "ຄືນສາງ" for the rest.
        const summaryAfterDeliver = await getBillDeliveryItemSummary(billNo, client, currentDocNo);
        const fullyDelivered = Number(summaryAfterDeliver?.remaining_qty_total ?? 0) <= 0;

        await client.query(
          `UPDATE public.odg_tms_detail
           SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
               status = CASE WHEN $10 THEN 1 ELSE COALESCE(status, 0) END,
               sent_end = CASE WHEN $10 THEN LOCALTIMESTAMP(0) ELSE sent_end END,
               lat = COALESCE($2, lat), lng = COALESCE($3, lng),
               lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
               url_img = COALESCE($6, url_img),
               sight_img = COALESCE($7, sight_img),
               remark = COALESCE($8, remark)
           WHERE bill_no = $1 AND doc_no = $9 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, latEnd, lngEnd, deliveryImage, signatureImage, comment, currentDocNo, fullyDelivered]
        );

        await saveDeliveryImages(billNo, deliveryImages, client);

        // ຈື່ຈຸດສົ່ງຂອງລູກຄ້າຄົນນີ້ໄວ້ ເພື່ອໃຫ້ບິນຄັ້ງໜ້າມີໝຸດຕັ້ງແຕ່ເປີດບິນ.
        // ຂຽນສະເພາະຕອນປິດບິນຄົບ — ບິນທະຍອຍສົ່ງທີ່ຍັງບໍ່ຈົບ ຍັງບໍ່ແມ່ນຈຸດສຸດທ້າຍ.
        if (fullyDelivered && latEnd && lngEnd) {
          const custCodeRow = await client.query(
            `SELECT cust_code, COALESCE(NULLIF(TRIM(forward_transport_code), ''), '') AS fwd
               FROM public.odg_tms_detail
              WHERE bill_no = $1 AND doc_no = $2 AND ${getFixedYearSqlFilter("doc_date")}
              LIMIT 1`,
            [billNo, currentDocNo]
          );
          const custCode = custCodeRow.rows?.[0]?.cust_code ?? "";
          // ບິນ "ສົ່ງສາຂາ" ພິກັດເປັນສາງສາຂາ ບໍ່ແມ່ນຮ້ານລູກຄ້າ — ຢ່າຈື່
          if (custCode && !custCodeRow.rows?.[0]?.fwd) {
            await saveCustomerPoint(
              { custCode, lat: latEnd, lng: lngEnd, billNo },
              client
            );
            // ອັບເດດທະບຽນລູກຄ້ານຳທຸກຄັ້ງທີ່ປິດບິນ — ທັບຂອງເກົ່າສະເໝີ. ໃຊ້
            // lat_end/lng_end ບໍ່ແມ່ນ lat/lng ຕອນ check-in ເພາະພິກັດຕອນປິດບິນ
            // ຄືຢູ່ໜ້າຮ້ານຈິງ ຈຶ່ງໃໝ່ກວ່າ ແລະ ຖືກກວ່າຂອງທີ່ມີຢູ່.
            await saveCustomerMasterPoint(
              { custCode, lat: latEnd, lng: lngEnd, overwrite: true },
              client
            );
          }
        }

        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END,
               dispatch_started_at = COALESCE(dispatch_started_at, LOCALTIMESTAMP(0))
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [currentDocNo]
        );

        // Cascade sent_start for sibling bills picked up at the trip's origin
        // warehouse when dispatch was auto-started here — same rule as
        // start_dispatch / checkin_bill.
        if (dispatchAutoStarted) {
          await client.query(
            `UPDATE public.odg_tms_detail d
             SET sent_start = COALESCE(d.sent_start, j.dispatch_started_at)
             FROM odg_tms j
             WHERE d.doc_no = $1
               AND j.doc_no = d.doc_no
               AND d.sent_start IS NULL
               AND ${effectivePickupCodeSql('d')} = COALESCE(j.origin_transport_code, '')
               AND ${getFixedYearSqlFilter("d.doc_date")}`,
            [currentDocNo]
          );
        }

        // COD (Module B): record cash/transfer collected at delivery, if sent.
        const collectedAmount =
          body.collected_amount != null && `${body.collected_amount}` !== ""
            ? Number(body.collected_amount)
            : null;
        if (collectedAmount !== null && !Number.isNaN(collectedAmount)) {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET collected_amount = $2,
                 payment_method = COALESCE($3, payment_method),
                 collected_at = LOCALTIMESTAMP(0)
             WHERE bill_no = $1 AND doc_no = $4 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, collectedAmount, asNullableText(body.payment_method), currentDocNo]
          );
        }

        const remainingItems = Number(summaryAfterDeliver?.remaining_item_count ?? 0);
        const remainingQty = Number(summaryAfterDeliver?.remaining_qty_total ?? 0);
        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        if (dispatchAutoStarted) void notifyJobDispatchStarted(currentDocNo);
        void notifyBillStatus(
          billNo,
          fullyDelivered ? "✅ ຈັດສົ່ງສຳເລັດ" : "📦 ຈັດສົ່ງບາງສ່ວນ"
        );
        // ຫ້ອງຈັດສົ່ງເຄີຍຮູ້ພຽງຕອນເປີດຈໍເບິ່ງເອງ — ດຽວນີ້ຮູ້ທັນທີ ພ້ອມລິ້ງໄປ POD.
        void notifyBillDelivered({
          billNo,
          docNo: currentDocNo,
          driverCode: driverId,
          fullyDelivered,
          collectedAmount,
        });
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          // finished = the bill is now fully settled (nothing left to deliver).
          // On a partial drop it stays open so the driver can deliver the rest
          // or send it back to the warehouse (ຄືນສາງ).
          finished: fullyDelivered,
          remaining_item_count: remainingItems,
          remaining_qty_total: remainingQty,
          open_bill_count: openBillCount,
        };
      }

      case "return_bill": {
        // ຄືນສາງ — the driver could not deliver (part of) the bill and is
        // sending the undelivered goods back to the warehouse. Records
        // returned_qty per item for the leftover qty, then CLOSES the bill
        // (status=1). Any qty already delivered on earlier partial drops stays
        // recorded; only the remainder is marked returned.
        if (!billNo) throw new Error("bill_no is required");
        await ensureBillDeliveryItems(billNo, client);

        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status,
                  COALESCE(d.status, 0) AS status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.status ?? 0) === 1) {
          const openBillCount = await getOpenBillCount(currentDocNo, client);
          await client.query("COMMIT");
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            finished: true,
            already_completed: true,
            open_bill_count: openBillCount,
          };
        }
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) >= 3) throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດຄືນສາງ");

        const returnItemRows = await client.query(
          `SELECT item_code, selected_qty, delivered_qty, returned_qty
           FROM public.odg_tms_detail_item
           WHERE bill_no = $1 AND doc_no = $2
           ORDER BY item_code`,
          [billNo, currentDocNo]
        );
        if (returnItemRows.rows.length === 0) {
          throw new Error("No delivery items found for this bill");
        }

        // Empty items → return everything still owed on each line.
        const requestedReturns = normalizeItems(body.items);
        const currentReturnItems = new Map(
          returnItemRows.rows.map((row) => [
            row.item_code,
            {
              selectedQty: Number(row.selected_qty ?? 0),
              deliveredQty: Number(row.delivered_qty ?? 0),
              returnedQty: Number(row.returned_qty ?? 0),
            },
          ])
        );
        const itemsToReturn =
          requestedReturns.length > 0
            ? requestedReturns
            : returnItemRows.rows
                .map((row) => ({
                  item_code: row.item_code,
                  qty:
                    Number(row.selected_qty ?? 0) -
                    Number(row.delivered_qty ?? 0) -
                    Number(row.returned_qty ?? 0),
                }))
                .filter((row) => row.qty > 0);

        for (const item of itemsToReturn) {
          const currentItem = currentReturnItems.get(item.item_code);
          if (!currentItem) throw new Error(`Item ${item.item_code} was not found`);
          const remainingQty =
            currentItem.selectedQty - currentItem.deliveredQty - currentItem.returnedQty;
          const returnQty = Math.min(item.qty, Math.max(remainingQty, 0));
          if (returnQty <= 0) continue;
          await client.query(
            `UPDATE public.odg_tms_detail_item
             SET returned_qty = COALESCE(returned_qty, 0)::numeric + $2::numeric
             WHERE bill_no = $1 AND item_code = $3 AND doc_no = $4`,
            [billNo, returnQty, item.item_code, currentDocNo]
          );
        }

        const returnReasonCode = asNullableText(body.reason_code ?? body.cancel_reason_code);
        await client.query(
          `UPDATE public.odg_tms_detail
           SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
               status = 1, sent_end = LOCALTIMESTAMP(0),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng),
               lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
               url_img = COALESCE($6, url_img),
               remark = COALESCE($7, remark),
               cancel_reason_code = COALESCE($8, cancel_reason_code)
           WHERE bill_no = $1 AND doc_no = $9 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, latEnd, lngEnd, deliveryImage, comment, returnReasonCode, currentDocNo]
        );

        await saveDeliveryImages(billNo, deliveryImages, client);

        // Move the trip into "dispatching" if the driver jumped straight to a
        // return without pressing ເລີ່ມຈັດສົ່ງ — same rule as complete_bill.
        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END,
               dispatch_started_at = COALESCE(dispatch_started_at, LOCALTIMESTAMP(0))
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [currentDocNo]
        );

        const returnSummary = await getBillDeliveryItemSummary(billNo, client, currentDocNo);
        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "🔙 ຄືນສາງ", { note: comment ?? undefined });
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          finished: true,
          returned: true,
          delivered_qty_total: Number(returnSummary?.delivered_qty_total ?? 0),
          returned_qty_total: Number(returnSummary?.returned_qty_total ?? 0),
          open_bill_count: openBillCount,
        };
      }

      case "cancel_bill": {
        if (!billNo) throw new Error("bill_no is required");
        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status, d.recipt_job, d.sent_start,
                  COALESCE(d.status, 0) AS status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.status ?? 0) === 2) {
          const openBillCount = await getOpenBillCount(currentDocNo, client);
          await client.query("COMMIT");
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            already_cancelled: true,
            open_bill_count: openBillCount,
          };
        }
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");

        // Undo-pickup mode: bill was picked up but the driver hasn't pressed
        // "ເລີ່ມຈັດສົ່ງ" yet (job_status < 2). Roll back recipt_job so the
        // driver can pick up again later — not a permanent cancel.
        if (currentBill.recipt_job && Number(currentBill.job_status ?? 0) < 2) {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET recipt_job = NULL
             WHERE bill_no = $1 AND doc_no = $2 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, currentDocNo]
          );
          // Keep the trip at job_status=1 ("ຮັບຖ້ຽວແລ້ວ"). Undoing one
          // bill's warehouse pickup must not undo the driver's acceptance of
          // the whole trip or force them to tap "ຮັບຖ້ຽວ" again.
          const openBillCount = await getOpenBillCount(currentDocNo, client);
          await client.query("COMMIT");
          void notifyBillStatus(billNo, "↩️ ຍົກເລີກເບີກເຄື່ອງ", {
            note: comment ?? undefined,
          });
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            unpickup: true,
            open_bill_count: openBillCount,
          };
        }

        // Full cancel mode: bill never picked up (recipt_job NULL) or
        // dispatch already started (job_status >= 2). A remark is required
        // and the bill is marked as cancelled (status=2).
        if (!comment) throw new Error("ກະລຸນາໃສ່ໝາຍເຫດການຍົກເລີກ");

        await client.query(
          `UPDATE public.odg_tms_detail
           SET status = 2, sent_end = COALESCE(sent_end, LOCALTIMESTAMP(0)),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng),
               lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
               url_img = COALESCE($6, url_img), remark = COALESCE($7, remark)
           WHERE bill_no = $1 AND doc_no = $8 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, latEnd, lngEnd, deliveryImage, comment, currentDocNo]
        );

        // Module D: standardized failure reason + optional reschedule date so
        // the office can analyse why deliveries fail and re-dispatch deferrals.
        const reasonCode = asNullableText(body.reason_code ?? body.cancel_reason_code);
        const rescheduleDate = asNullableText(body.reschedule_date);
        if (reasonCode || rescheduleDate) {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET cancel_reason_code = COALESCE($2, cancel_reason_code),
                 reschedule_date = COALESCE($3::date, reschedule_date)
             WHERE bill_no = $1 AND doc_no = $4 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, reasonCode, rescheduleDate, currentDocNo]
          );
        }

        // ປ່ອຍ check_status ເມື່ອບໍ່ມີຖ້ຽວເປີດຄ້າງສຳລັບບິນນີ້ — ຖ້າຍັງມີ detail ອື່ນທີ່ຍັງບໍ່ປິດ (ຈັດຫຼາຍຄັ້ງ) ຈະບໍ່ປ່ອຍ
        await client.query(
          `UPDATE ic_trans_shipment s
           SET check_status = 0
           WHERE s.doc_no = $1
             AND ${getFixedYearSqlFilter("s.doc_date")}
             AND NOT EXISTS (
               SELECT 1
               FROM public.odg_tms_detail det
               WHERE det.bill_no = s.doc_no
                 AND ${getFixedYearSqlFilter("det.doc_date")}
                 AND COALESCE(det.status, 0) NOT IN (1, 2)
             )`,
          [billNo]
        );

        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "❌ ຍົກເລີກຈັດສົ່ງ", {
          note: comment,
        });
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          open_bill_count: openBillCount,
        };
      }

      case "revert_complete_bill": {
        // Driver completed delivery but realised the photo / location was
        // wrong. Roll the bill back to "ກຳລັງຈັດສົ່ງ" (phase=inprogress) so
        // they can run the complete flow again. Only allowed while the trip
        // is still open (job_status < 3) — once the driver closes the trip,
        // delivery records are locked.
        if (!billNo) throw new Error("bill_no is required");
        const billRow = await client.query(
          `SELECT d.doc_no, t.job_status,
                  COALESCE(d.status, 0) AS status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.status ?? 0) !== 1) {
          throw new Error("ບິນນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະຈັດສົ່ງສຳເລັດ");
        }
        if (Number(currentBill.job_status ?? 0) >= 3) {
          throw new Error("ປິດຖ້ຽວແລ້ວ ບໍ່ສາມາດຍົກເລີກສຳເລັດໄດ້");
        }

        // Serialize against complete_job (which holds tms_exec_job via doc_no):
        // reopening a bill (status 1→0) must not interleave with a trip-close
        // that already read open_bill_count=0, or the trip would close with an
        // open bill.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tms_exec_job:${currentDocNo}`]);

        await client.query(
          `UPDATE public.odg_tms_detail
           SET status = 0,
               sent_end = NULL,
               lat_end = NULL,
               lng_end = NULL,
               url_img = NULL,
               sight_img = NULL,
               remark = NULL,
               cancel_reason_code = NULL,
               collected_amount = NULL,
               payment_method = NULL,
               collected_at = NULL
           WHERE bill_no = $1 AND doc_no = $2 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, currentDocNo]
        );

        await client.query(
          `UPDATE public.odg_tms_detail_item
           SET delivered_qty = 0, returned_qty = 0
           WHERE bill_no = $1 AND doc_no = $2`,
          [billNo, currentDocNo]
        );

        await client.query(
          `DELETE FROM public.odg_tms_delivery_images
           WHERE bill_no = $1`,
          [billNo]
        );

        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "↩️ ຍົກເລີກສຳເລັດ");
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          open_bill_count: openBillCount,
        };
      }

      case "edit_complete_bill": {
        // Edit a completed delivery in place: update delivered_qty per item
        // and remark. Image / signature changes are uploaded ahead of this
        // call via attach_bill_image (delivery uses replace=true to wipe the
        // old set; primary + signature overwrite naturally). Lat/lng are
        // preserved — the original delivery location stays on the record.
        if (!billNo) throw new Error("bill_no is required");
        const billRow = await client.query(
          `SELECT d.doc_no, t.job_status,
                  COALESCE(d.status, 0) AS status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo, driverId]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.status ?? 0) !== 1) {
          throw new Error("ບິນນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະຈັດສົ່ງສຳເລັດ");
        }
        if (Number(currentBill.job_status ?? 0) >= 3) {
          throw new Error("ປິດຖ້ຽວແລ້ວ ບໍ່ສາມາດແກ້ໄຂໄດ້");
        }

        const itemRows = await client.query(
          `SELECT item_code, selected_qty
           FROM public.odg_tms_detail_item
           WHERE bill_no = $1 AND doc_no = $2
           ORDER BY item_code`,
          [billNo, currentDocNo]
        );
        if (itemRows.rows.length === 0) {
          throw new Error("No delivery items found for this bill");
        }
        const allowedQty = new Map(
          itemRows.rows.map((row) => [row.item_code, Number(row.selected_qty ?? 0)])
        );

        const requestedItems = normalizeItems(body.items);
        for (const item of requestedItems) {
          const maxQty = allowedQty.get(item.item_code);
          if (maxQty === undefined) {
            throw new Error(`Item ${item.item_code} was not found`);
          }
          const newQty = Math.max(0, Math.min(item.qty, maxQty));
          await client.query(
            `UPDATE public.odg_tms_detail_item
             SET delivered_qty = $2
             WHERE bill_no = $1 AND item_code = $3 AND doc_no = $4`,
            [billNo, newQty, item.item_code, currentDocNo]
          );
        }

        // Lowering delivered_qty leaves goods owed to the customer again. A bill
        // must never sit at status=1 with qty outstanding — that is what silently
        // re-queued it for a fresh trip. Reopen it so the driver settles the rest
        // (deliver again, or ຄືນສາງ), and only re-close once nothing is owed.
        const summaryAfterEdit = await getBillDeliveryItemSummary(billNo, client, currentDocNo);
        const stillOwed = Number(summaryAfterEdit?.remaining_qty_total ?? 0) > 0;

        await client.query(
          `UPDATE public.odg_tms_detail
           SET remark = COALESCE($2, remark),
               status = CASE WHEN $4 THEN 0 ELSE 1 END,
               sent_end = CASE WHEN $4 THEN NULL ELSE COALESCE(sent_end, LOCALTIMESTAMP(0)) END
           WHERE bill_no = $1 AND doc_no = $3 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, comment, currentDocNo, stillOwed]
        );

        await client.query("COMMIT");
        void notifyBillStatus(
          billNo,
          stillOwed ? "✏️ ແກ້ໄຂການຈັດສົ່ງ · ຍັງມີເຄື່ອງຄ້າງ" : "✏️ ແກ້ໄຂການຈັດສົ່ງ"
        );
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          reopened: stillOwed,
          remaining_qty_total: Number(summaryAfterEdit?.remaining_qty_total ?? 0),
        };
      }

      case "complete_job": {
        if (!docNo) throw new Error("doc_no is required");
        const jobCarClause = carCode ? "AND car = $2" : "";
        const jobParams = carCode ? [docNo, carCode] : [docNo];
        const jobRow = await client.query(
          `SELECT COALESCE(job_status, 0) AS job_status
           FROM odg_tms
           WHERE doc_no = $1 ${jobCarClause} AND ${getFixedYearSqlFilter("doc_date")}
           LIMIT 1`,
          jobParams
        );
        if (jobRow.rowCount === 0) throw new Error("Job not found for this car");
        if (Number(jobRow.rows[0]?.job_status ?? 0) >= 3) {
          await client.query("COMMIT");
          return { success: true, already_closed: true };
        }
        const openBillCount = await getOpenBillCount(docNo, client);
        if (openBillCount > 0) throw new Error("Still has pending bills");

        // Geofence: when the branch requires it, the driver must be back at the
        // configured end point (within radius) to close the trip. Uses the
        // explicit end coords when sent, else the current lat/lng.
        await assertJobGeofence(client, {
          docNo,
          kind: "end",
          lat: latEnd ?? lat,
          lng: lngEnd ?? lng,
        });

        await client.query(
          `UPDATE odg_tms
           SET job_status = 3, job_close = LOCALTIMESTAMP(0),
               miles_end = COALESCE($2, miles_end),
               img_end = COALESCE($3, img_end),
               lat_end = COALESCE($4, lat_end),
               lng_end = COALESCE($5, lng_end)
           WHERE doc_no = $1
             AND ($6::varchar IS NULL OR car = $6::varchar)
             AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo, milesEnd, endImage, latEnd ?? lat, lngEnd ?? lng, carCode || null]
        );

        // ຈົດເລກໄມລ໌ອີກເທື່ອ ແລ້ວຄິດໄລຍະທີ່ແລ່ນຈິງຂອງຖ້ຽວ.
        recordTripDistanceEnd(docNo, carCode);

        await client.query("COMMIT");
        return { success: true };
      }

      case "save_travel_history": {
        if (!docNo) throw new Error("doc_no is required");
        if (!lat || !lng) throw new Error("lat and lng are required");

        // ວັນທີລາວ ບໍ່ແມ່ນ UTC — ຄົນຂັບທີ່ອອກລົດກ່ອນ 07:00 ຈະຖືກບັນທຶກເປັນວັນວານ
        const today = getLaoToday();
        await client.query(
          `INSERT INTO odg_tms_travel_history (doc_no, doc_date, lat, lng, recorded_at)
           VALUES ($1, $2::date, $3, $4, LOCALTIMESTAMP(0))`,
          [docNo, today, lat, lng]
        );

        await client.query("COMMIT");
        return { success: true };
      }

      case "tracking_status": {
        if (!docNo) throw new Error("doc_no is required");
        const status = asText(body.status);
        if (!status) throw new Error("status is required");

        // Append-only log so the office can see when/how often a driver's
        // tracking dropped mid-trip (gps_off | no_permission | auth_expired).
        // Self-creating table — no migration needed on first use.
        await client.query(
          `CREATE TABLE IF NOT EXISTS public.odg_tms_tracking_status (
             id BIGSERIAL PRIMARY KEY,
             doc_no character varying NOT NULL,
             driver character varying,
             status character varying NOT NULL,
             recorded_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
           )`
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS idx_odg_tms_tracking_status_doc_no
           ON public.odg_tms_tracking_status (doc_no)`
        );
        await client.query(
          `INSERT INTO public.odg_tms_tracking_status (doc_no, driver, status)
           VALUES ($1, $2, $3)`,
          [docNo, driverId || null, status]
        );

        await client.query("COMMIT");
        return { success: true };
      }

      case "fuel_refill": {
        const result = await saveFuelRefill(
          {
            fuel_date: asNullableText(body.fuel_date),
            user_code: asNullableText(body.user_code),
            driver_name: asNullableText(body.driver_name),
            car: asNullableText(body.car),
            doc_no: docNo || null,
            liters: body.liters,
            amount: body.amount,
            odometer: body.odometer,
            station: asNullableText(body.station),
            note: asNullableText(body.note),
            image_data: asNullableText(body.image_data ?? body.photo),
            lat,
            lng,
            transport_code: asNullableText(body.transport_code),
          },
          client
        );
        await client.query("COMMIT");
        return result;
      }

      default:
        throw new Error("Invalid action");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    invalidateAfter();
    client.release();
  }
}

async function mobileBills({ docNo, billNo, type, driverId, isSupervisor }) {
  // The bill SELECT below references parent_bill_no (added via auto-DDL).
  // Run the schema check first so a fresh DB doesn't blow up on missing column.
  // Cached after first call so this is effectively a no-op afterwards.
  await ensureDeliveryWorkflowSchema(pool);
  // Same reason for odg_tms_custom_bill (joined below for hand-typed bills).
  const { ensurePendingBillSchema } = require("./pending-bill");
  await ensurePendingBillSchema();
  const cleanDriver = asText(driverId);
  if (!cleanDriver && !isSupervisor) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  // Supervisors may view any trip's bills; drivers are restricted to their own.
  if (docNo) {
    const allowedJob = await queryOne(
      isSupervisor
        ? `SELECT 1 FROM odg_tms
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")} LIMIT 1`
        : `SELECT 1 FROM odg_tms
           WHERE doc_no = $1 AND driver = $2 AND ${getFixedYearSqlFilter("doc_date")} LIMIT 1`,
      isSupervisor ? [docNo] : [docNo, cleanDriver]
    );
    if (!allowedJob) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
  }
  if (billNo) {
    const allowedBill = await queryOne(
      isSupervisor
        ? `SELECT 1
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1 AND ${getFixedYearSqlFilter("d.doc_date")} LIMIT 1`
        : `SELECT 1
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1
             AND t.driver = $2
             AND ${getFixedYearSqlFilter("d.doc_date")} LIMIT 1`,
      isSupervisor ? [billNo] : [billNo, cleanDriver]
    );
    if (!allowedBill) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
  }
  // Proof-of-pickup image bytes for one bill — fetched on demand so the driver
  // can re-view the photo + signature they captured at the customer's yard
  // (the list payload only carries has_recipt_img flags). Auth-gated above.
  if (type === "pickup_images" && billNo) {
    const row = await queryOne(
      `SELECT COALESCE(recipt_img, '') AS recipt_img,
              COALESCE(recipt_sign_img, '') AS recipt_sign_img
       FROM public.odg_tms_detail
       WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}
       ORDER BY (CASE WHEN COALESCE(status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                create_date_time_now DESC NULLS LAST
       LIMIT 1`,
      [billNo]
    );
    return row ?? { recipt_img: "", recipt_sign_img: "" };
  }
  if (type === "products" && docNo) {
    return await getBillDeliveryItems({ docNo });
  }
  if (type === "products" && billNo) {
    return await getBillDeliveryItems({ billNo });
  }
  if (billNo) {
    await ensureBillDeliveryItems(billNo);
    return await getBillDeliveryItems({ billNo });
  }

  if (docNo) {
    await ensureJobDeliveryItems(docNo);
    const itemSummaryRows = await getBillPhaseSummary(docNo);
    const itemSummaryByBill = new Map(
      itemSummaryRows.map((row) => [
        row.bill_no,
        {
          total_item_count: Number(row.total_item_count ?? 0),
          delivered_item_count: Number(row.delivered_item_count ?? 0),
          remaining_item_count: Number(row.remaining_item_count ?? 0),
          delivered_qty_total: Number(row.delivered_qty_total ?? 0),
          returned_qty_total: Number(row.returned_qty_total ?? 0),
          remaining_qty_total: Number(row.remaining_qty_total ?? 0),
        },
      ])
    );

    const data = await query(
      // DISTINCT ON (bill_no) collapses any accidental duplicate rows in
      // odg_tms_detail (there is no UNIQUE (doc_no, bill_no) constraint).
      // The inner ORDER BY picks the most-progressed row per bill so the
      // driver sees the latest state, not a stale dup that still has the
      // "ສຳເລັດ" button. Outer SELECT re-sorts by bill_no for display.
      `SELECT * FROM (
        SELECT DISTINCT ON (a.bill_no)
        a.bill_no, to_char(a.bill_date,'DD-MM-YYYY') as bill_date,
        a.cust_code,
        COALESCE(NULLIF(TRIM(b.name_1), ''), NULLIF(TRIM(cb.cust_name), '')) as cust_name,
        ${customerAreaSql('a.cust_code')} as cust_area,
        COALESCE(NULLIF(TRIM(b.telephone), ''), NULLIF(TRIM(a.telephone), ''), NULLIF(TRIM(cb.telephone), '')) as telephone,
        to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
        COALESCE(NULLIF(TRIM(a.lat::text), ''), NULLIF(TRIM(acd.latitude::text), '')) as lat,
        COALESCE(NULLIF(TRIM(a.lng::text), ''), NULLIF(TRIM(acd.longitude::text), '')) as lng,
        a.lat_end, a.lng_end,
        COALESCE(a.count_item, '0') as count_item,
        COALESCE(a.status, 0) as status,
        COALESCE(to_char(a.recipt_job,'DD-MM-YYYY HH24:MI'), '-') as recipt_job,
        COALESCE(to_char(a.sent_start,'DD-MM-YYYY HH24:MI'), '-') as sent_start,
        COALESCE(to_char(a.sent_end,'DD-MM-YYYY HH24:MI'), '-') as sent_end,
        COALESCE(NULLIF(TRIM(s.destination), ''), '') as destination,
        -- Pickup point: per-bill override > dispatcher's assigned branch > ERP
        -- branch (see effectivePickupCodeSql). '__CUSTOMER__' means pickup at
        -- the customer's home/shop; otherwise it's a transport_type code whose
        -- name is resolved below.
        ${effectivePickupCodeSql("a")} as pickup_transport_code,
        CASE
          WHEN a.pickup_transport_code = '__CUSTOMER__' THEN 'ບ້ານ/ຮ້ານລູກຄ້າ'
          ELSE COALESCE(NULLIF(TRIM(pt.name_1), ''), '')
        END as pickup_transport_name,
        -- Delivery type: forward_transport_code NULL = ສົ່ງລູກຄ້າ; ມີຄ່າ = ສົ່ງສາຂາ
        COALESCE(NULLIF(TRIM(a.forward_transport_code), ''), '') as forward_transport_code,
        COALESCE(NULLIF(TRIM(fwd.name_1), ''), '') as forward_transport_name,
        -- Parent sale bill: when one customer order was split across multiple
        -- warehouses, each sub-bill carries the same parent_bill_no so the
        -- driver app can group them together. Empty string = standalone bill.
        COALESCE(NULLIF(TRIM(a.parent_bill_no), ''), '') as parent_bill_no,
        -- Image bytes are excluded from the list response — they were causing
        -- huge JSON payloads (each image is 3-5MB base64) which timed out the
        -- mobile request when a bill had photos. The app uses the boolean
        -- flag below; full bytes are fetched lazily via a dedicated endpoint
        -- when the user taps to preview.
        '' as url_img,
        '' as sight_img,
        (a.url_img IS NOT NULL AND a.url_img <> '') as has_url_img,
        (a.sight_img IS NOT NULL AND a.sight_img <> '') as has_sight_img,
        -- Proof-of-pickup captured at the customer's yard ('__CUSTOMER__' bills).
        -- Bytes excluded from the list payload (same reason as url_img); flags
        -- only so the UI can show a "photo on file" indicator.
        (a.recipt_img IS NOT NULL AND a.recipt_img <> '') as has_recipt_img,
        (a.recipt_sign_img IS NOT NULL AND a.recipt_sign_img <> '') as has_recipt_sign_img,
        -- COD (Module B) + failure reason / reschedule (Module D)
        COALESCE(a.cod_amount, 0) as cod_amount,
        a.collected_amount as collected_amount,
        COALESCE(a.payment_method, '') as payment_method,
        COALESCE(a.cancel_reason_code, '') as cancel_reason_code,
        COALESCE(to_char(a.reschedule_date,'DD-MM-YYYY'), '') as reschedule_date,
        COALESCE(a.remark, '') as remark,
        COALESCE(NULLIF(TRIM(pb.planned_lat), ''), '') as planned_lat,
        COALESCE(NULLIF(TRIM(pb.planned_lng), ''), '') as planned_lng,
        -- The goods sit at a DIFFERENT branch's warehouse than the one this
        -- trip departs from. Such bills may only be picked up once the trip has
        -- started dispatching (job_status >= 2). MUST stay identical to the
        -- pickup_bill guard — both now share effectivePickupCodeSql, so the
        -- app never offers a pickup the server then rejects.
        (${effectivePickupCodeSql("a")} <> COALESCE(j.origin_transport_code, '')) as is_other_branch
      FROM public.odg_tms_detail a
      LEFT JOIN public.odg_tms j ON j.doc_no = a.doc_no
      LEFT JOIN ar_customer b ON b.code = a.cust_code
      LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
      -- Custom "ອື່ນໆ" bills have no ar_customer row; their name/phone live on
      -- the hand-typed bill itself.
      LEFT JOIN public.odg_tms_custom_bill cb ON cb.bill_no = a.bill_no
      LEFT JOIN ic_trans_shipment s ON s.doc_no = a.bill_no
      -- Name of the effective pickup point (same priority as the code above).
      LEFT JOIN public.transport_type pt
        ON pt.code = NULLIF(${effectivePickupCodeSql("a")}, '__CUSTOMER__')
      LEFT JOIN public.transport_type fwd ON fwd.code = a.forward_transport_code
      LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = a.bill_no
      WHERE a.doc_no = $1 AND ${getFixedYearSqlFilter("a.doc_date")}
      ORDER BY a.bill_no,
               -- Most-progressed wins: cancelled / done before in-progress
               -- before picked-up before waiting. Keeps the duplicate that
               -- reflects the action the driver actually took.
               CASE COALESCE(a.status, 0)
                 WHEN 1 THEN 0
                 WHEN 2 THEN 1
                 ELSE 2
               END,
               (a.sent_start IS NOT NULL) DESC,
               (a.recipt_job IS NOT NULL) DESC,
               a.create_date_time_now DESC NULLS LAST
      ) dedup
      ORDER BY bill_no`,
      [docNo]
    );

    // ຈຸດສົ່ງຄັ້ງກ່ອນ: ບິນທີ່ຍັງບໍ່ມີໝຸດ ໃຫ້ຄົນຂັບເຫັນບ່ອນທີ່ເຄີຍໄປສົ່ງລູກຄ້າ
    // ຄົນນີ້ຄັ້ງຫຼ້າສຸດ ແທນທີ່ຈະບໍ່ມີພິກັດຫຍັງເລີຍແລ້ວຕ້ອງໂທຖາມ
    const lastPointsByCust = await getLastDeliveredPoints(
      data.map((row) => row.cust_code)
    );

    return data.map((rawRow) => {
      const lastPoint = lastPointsByCust.get(String(rawRow.cust_code ?? "").trim());
      const useLast = Boolean(lastPoint) && !String(rawRow.planned_lat ?? "").trim();
      const row = useLast
        ? {
            ...rawRow,
            planned_lat: lastPoint.lat,
            planned_lng: lastPoint.lng,
            planned_from_last_delivery: true,
            last_delivery_at: lastPoint.at_display,
          }
        : { ...rawRow, planned_from_last_delivery: false, last_delivery_at: "" };
      // Fallback for bills with no odg_tms_detail_item rows (custom/service
      // bills have no ic_trans_detail to seed from). count_item is a LINE
      // count, not a quantity — never use it as a qty total.
      const summary = itemSummaryByBill.get(String(row.bill_no)) ?? {
        total_item_count: Number(row.count_item ?? 0),
        delivered_item_count: 0,
        remaining_item_count: Number(row.count_item ?? 0),
        delivered_qty_total: 0,
        returned_qty_total: 0,
        remaining_qty_total: 0,
      };
      const status = Number(row.status ?? 0);

      const phase =
        status === 2 ? "cancel"
        : status === 1 ? "done"
        : row.sent_start !== "-" ? "inprogress"
        : row.recipt_job !== "-" ? "pickup"
        : "waiting";

      // A "done" bill where some qty went back to the warehouse (ຄືນສາງ) reads
      // differently: fully returned = "ຄືນສາງ"; part delivered + part returned =
      // "ສຳເລັດ (ຄືນສາງບາງສ່ວນ)".
      const doneText =
        summary.returned_qty_total > 0 && summary.delivered_qty_total <= 0
          ? "ຄືນສາງ"
          : summary.returned_qty_total > 0
          ? "ສຳເລັດ (ຄືນສາງບາງສ່ວນ)"
          : "ຈັດສົ່ງສຳເລັດ";

      const status_text =
        phase === "cancel" ? "ຍົກເລີກຈັດສົ່ງ"
        : phase === "done" ? doneText
        : phase === "inprogress" ? "ກຳລັງຈັດສົ່ງ"
        : phase === "pickup" ? "ເບີກເຄື່ອງແລ້ວ"
        : "ລໍເບີກເຄື່ອງ";

      return {
        ...row,
        count_item: summary.total_item_count,
        delivered_item_count: summary.delivered_item_count,
        remaining_item_count: summary.remaining_item_count,
        delivered_qty_total: summary.delivered_qty_total,
        returned_qty_total: summary.returned_qty_total,
        remaining_qty_total: summary.remaining_qty_total,
        phase,
        status_text,
      };
    });
  }

  return [];
}

async function mobileFuelLogs({ userCode, fromDate, toDate, limit } = {}) {
  const code = asText(userCode);
  if (!code) {
    const err = new Error("user_code is required");
    err.status = 400;
    throw err;
  }
  const rows = await getFuelLogs({ userCode: code, fromDate, toDate });
  const summary = await getFuelSummary({ userCode: code, fromDate, toDate });
  const max = Number(limit ?? 100);
  return {
    rows: max > 0 ? rows.slice(0, max) : rows,
    summary,
  };
}

async function fcmTokenSave({ user_code, token, platform }) {
  const userCode = asText(user_code);
  const t = asText(token);
  const p = asText(platform);
  if (!userCode || !t) {
    const err = new Error("user_code and token are required");
    err.status = 400;
    throw err;
  }
  await saveFcmToken(userCode, t, p);
  return { success: true };
}

async function fcmTokenDelete(token) {
  const t = asText(token);
  if (!t) {
    const err = new Error("token is required");
    err.status = 400;
    throw err;
  }
  await deleteFcmToken(t);
  return { success: true };
}

// Bulk-ingest a buffered batch of device location points for one trip. The
// driver app samples its GPS every ~3s and POSTs the accumulated points, so
// this is one transaction + one multi-row INSERT regardless of batch size.
// Points carry their own on-device `recorded_at`; we fall back to
// LOCALTIMESTAMP only when the client omits it. doc_date is derived from each
// point's timestamp (offline-buffered points can span past midnight) so it
// matches the day the point was actually captured.
async function mobileSaveLocations({ doc_no, driver_id, imei, device, points }) {
  const docNo = asText(doc_no);
  const cleanDriver = asText(driver_id);
  const cleanImei = asNullableText(imei);
  if (!docNo) throw new Error("doc_no is required");
  if (!cleanDriver) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("at least one point is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureDeliveryWorkflowSchema(client);

    // Same ownership gate the job actions use: a driver may only log location
    // against a trip that belongs to them in the active (fixed-year) window.
    const allowedJob = await client.query(
      `SELECT 1 FROM odg_tms
       WHERE doc_no = $1 AND driver = $2 AND ${getFixedYearSqlFilter("doc_date")}
       LIMIT 1`,
      [docNo, cleanDriver]
    );
    if (allowedJob.rowCount === 0) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }

    // Upsert the device identity, keyed by IMEI. Only when we actually have an
    // IMEI — without it there's no stable key, and the per-point columns still
    // capture everything we received. COALESCE keeps the last known value when
    // a field is omitted on this batch.
    const dev = device || {};
    if (cleanImei) {
      await client.query(
        `INSERT INTO odg_tms_mobile_device
           (imei, driver, model, os_version, app_version, carrier, sim_phone, last_doc_no, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, LOCALTIMESTAMP(0))
         ON CONFLICT (imei) DO UPDATE SET
           driver = EXCLUDED.driver,
           model = COALESCE(EXCLUDED.model, odg_tms_mobile_device.model),
           os_version = COALESCE(EXCLUDED.os_version, odg_tms_mobile_device.os_version),
           app_version = COALESCE(EXCLUDED.app_version, odg_tms_mobile_device.app_version),
           carrier = COALESCE(EXCLUDED.carrier, odg_tms_mobile_device.carrier),
           sim_phone = COALESCE(EXCLUDED.sim_phone, odg_tms_mobile_device.sim_phone),
           last_doc_no = EXCLUDED.last_doc_no,
           updated_at = LOCALTIMESTAMP(0)`,
        [
          cleanImei,
          cleanDriver,
          asNullableText(dev.model),
          asNullableText(dev.os_version),
          asNullableText(dev.app_version),
          asNullableText(dev.carrier),
          asNullableText(dev.sim_phone),
          docNo,
        ]
      );
    }

    const today = getLaoToday();
    const rows = [];
    const params = [];
    let i = 1;
    for (const p of points) {
      const recordedAt = asNullableText(p.recorded_at);
      const docDate = recordedAt ? recordedAt.slice(0, 10) : today;
      rows.push(
        `($${i++}, $${i++}::date, $${i++}, $${i++}, COALESCE($${i++}::timestamp, LOCALTIMESTAMP(0)),` +
          ` $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
      );
      params.push(
        docNo,
        docDate,
        asText(p.lat),
        asText(p.lng),
        recordedAt,
        cleanImei,
        asNullableText(p.speed),
        asNullableText(p.heading),
        asNullableText(p.accuracy),
        asNullableText(p.battery),
        asNullableText(p.signal)
      );
    }
    await client.query(
      `INSERT INTO odg_tms_travel_history
         (doc_no, doc_date, lat, lng, recorded_at, imei, speed, heading, accuracy, battery, signal)
       VALUES ${rows.join(", ")}`,
      params
    );

    await client.query("COMMIT");
    return { success: true, saved: points.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Supervisor KPI summary for a single day (Module F.2). Defaults to today.
// Manager dashboard: one call returns the four blocks the manager screen shows
// — today, this month (with a per-day series), a driver leaderboard, and the
// other staff involved. Kept as a single endpoint so the app makes one request
// instead of four on a phone connection.
async function mobileManagerDashboard({ date = "", branch = "" } = {}) {
  const day = coerceDateToFixedYear(date || getFixedTodayDate());
  const monthStart = `${day.slice(0, 7)}-01`;
  const branchCode = asText(branch);
  const branchClause = branchCode
    ? `AND COALESCE(NULLIF(TRIM(t.origin_transport_code), ''), '') = '${branchCode.replace(/'/g, "''")}'`
    : "";

  // Totals for an arbitrary window — reused for both ມື້ນີ້ and ເດືອນນີ້ so the
  // two blocks can never be computed differently.
  const totalsSql = `
    SELECT
      COUNT(DISTINCT t.doc_no)::int AS trips,
      COUNT(DISTINCT t.doc_no) FILTER (WHERE COALESCE(t.job_status,0) >= 3)::int AS trips_closed,
      COUNT(d.bill_no)::int AS bills,
      COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
      COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled,
      COUNT(*) FILTER (WHERE COALESCE(d.status,0) NOT IN (1,2))::int AS pending,
      COALESCE(SUM(i.delivered_qty), 0)::numeric AS qty_delivered,
      COALESCE(SUM(d.collected_amount), 0)::numeric AS cod
    FROM odg_tms t
    LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
    LEFT JOIN LATERAL (
      SELECT SUM(COALESCE(x.delivered_qty,0))::numeric AS delivered_qty
      FROM public.odg_tms_detail_item x
      WHERE x.doc_no = d.doc_no AND x.bill_no = d.bill_no
    ) i ON true
    WHERE t.date_logistic::date BETWEEN $1::date AND $2::date
      AND ${getFixedYearSqlFilter("t.doc_date")}
      ${branchClause}`;

  const [todayRow, monthRow, series, drivers, workers, dispatchers, variance] =
    await Promise.all([
      queryOne(totalsSql, [day, day]),
      queryOne(totalsSql, [monthStart, day]),
      // Per-day series for the month chart.
      query(
        `SELECT to_char(t.date_logistic,'DD') AS day_label,
                to_char(t.date_logistic,'YYYY-MM-DD') AS day,
                COUNT(DISTINCT t.doc_no)::int AS trips,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         WHERE t.date_logistic::date BETWEEN $1::date AND $2::date
           AND ${getFixedYearSqlFilter("t.doc_date")}
           ${branchClause}
         GROUP BY 1, 2 ORDER BY 2`,
        [monthStart, day]
      ),
      // Driver leaderboard for the month.
      query(
        `SELECT COALESCE(NULLIF(TRIM(drv.name_1), ''), t.driver, '-') AS name,
                t.driver AS code,
                COUNT(DISTINCT t.doc_no)::int AS trips,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered,
                COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled,
                COUNT(d.bill_no)::int AS bills,
                COALESCE(SUM(d.collected_amount), 0)::numeric AS cod
         FROM odg_tms t
         LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
         LEFT JOIN public.odg_tms_driver drv ON drv.code = t.driver
         WHERE t.date_logistic::date BETWEEN $1::date AND $2::date
           AND NULLIF(TRIM(t.driver), '') IS NOT NULL
           AND ${getFixedYearSqlFilter("t.doc_date")}
           ${branchClause}
         GROUP BY 1, 2 ORDER BY delivered DESC, trips DESC LIMIT 40`,
        [monthStart, day]
      ),
      // Crew: how many trips each worker joined.
      query(
        `SELECT w.worker_name AS name, w.worker_code AS code,
                COUNT(DISTINCT w.doc_no)::int AS trips
         FROM public.odg_tms_worker w
         JOIN odg_tms t ON t.doc_no = w.doc_no
         WHERE t.date_logistic::date BETWEEN $1::date AND $2::date
           AND ${getFixedYearSqlFilter("t.doc_date")}
           ${branchClause}
         GROUP BY 1, 2 ORDER BY trips DESC LIMIT 40`,
        [monthStart, day]
      ),
      // Who planned the trips.
      query(
        `SELECT COALESCE(NULLIF(TRIM(u.name_1), ''), t.user_created, '-') AS name,
                t.user_created AS code,
                COUNT(*)::int AS trips
         FROM odg_tms t
         LEFT JOIN erp_user u ON u.code = t.user_created
         WHERE t.date_logistic::date BETWEEN $1::date AND $2::date
           AND NULLIF(TRIM(t.user_created), '') IS NOT NULL
           AND ${getFixedYearSqlFilter("t.doc_date")}
           ${branchClause}
         GROUP BY 1, 2 ORDER BY trips DESC LIMIT 20`,
        [monthStart, day]
      ),
      // Pickup shortfalls per driver — the quality signal for the month.
      query(
        `SELECT COALESCE(NULLIF(TRIM(drv.name_1), ''), v.driver, '-') AS name,
                COUNT(DISTINCT v.bill_no)::int AS bills,
                COALESCE(SUM(GREATEST(-v.diff_qty, 0)), 0)::numeric AS missing_qty
         FROM public.odg_tms_pickup_variance v
         LEFT JOIN public.odg_tms_driver drv ON drv.code = v.driver
         WHERE v.created_at::date BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY missing_qty DESC LIMIT 20`,
        [monthStart, day]
      ),
    ]);

  // ── Exception blocks the manager acts on ──────────────────────────────
  // Each one is a queue of work, not a statistic: bills that came back, bills
  // that were never fully picked up, trips still open, and proof that the
  // delivery actually happened at the customer's location.
  const [partial, openTrips, deliveredOnSite] = await Promise.all([
    // ສົ່ງບໍ່ໝົດ — finished, but part of the load is still owed.
    query(
      `SELECT d.bill_no, d.doc_no,
              COALESCE(NULLIF(TRIM(cu.name_1), ''), d.cust_code, '-') AS cust_name,
              COALESCE(NULLIF(TRIM(drv.name_1), ''), t.driver, '-') AS driver,
              SUM(COALESCE(i.selected_qty,0))::numeric AS planned,
              SUM(COALESCE(i.delivered_qty,0))::numeric AS delivered,
              SUM(COALESCE(i.returned_qty,0))::numeric AS returned_qty,
              SUM(GREATEST(COALESCE(i.selected_qty,0) - COALESCE(i.delivered_qty,0), 0))::numeric AS short_qty
       FROM public.odg_tms_detail_item i
       JOIN public.odg_tms_detail d ON d.doc_no = i.doc_no AND d.bill_no = i.bill_no
       JOIN odg_tms t ON t.doc_no = d.doc_no
       LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
       LEFT JOIN public.odg_tms_driver drv ON drv.code = t.driver
       WHERE COALESCE(d.status,0) = 1
         AND t.date_logistic::date BETWEEN $1::date AND $2::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         ${branchClause}
       GROUP BY d.bill_no, d.doc_no, cu.name_1, d.cust_code, drv.name_1, t.driver
       HAVING SUM(GREATEST(COALESCE(i.selected_qty,0) - COALESCE(i.delivered_qty,0), 0)) > 0
       ORDER BY short_qty DESC LIMIT 50`,
      [monthStart, day]
    ),
    // ຄ້າງປິດຖ້ຽວ — the trip left but was never closed.
    query(
      `SELECT t.doc_no,
              to_char(t.date_logistic,'DD-MM-YYYY') AS day,
              COALESCE(NULLIF(TRIM(drv.name_1), ''), t.driver, '-') AS driver,
              COALESCE(NULLIF(TRIM(car.name_1), ''), t.car, '-') AS car,
              COALESCE(t.job_status, 0)::int AS job_status,
              COUNT(d.bill_no)::int AS bills,
              COUNT(*) FILTER (WHERE COALESCE(d.status,0) NOT IN (1,2))::int AS open_bills,
              (CURRENT_DATE - t.date_logistic::date)::int AS days_open
       FROM odg_tms t
       LEFT JOIN public.odg_tms_detail d ON d.doc_no = t.doc_no
       LEFT JOIN public.odg_tms_driver drv ON drv.code = t.driver
       LEFT JOIN public.odg_tms_car car ON car.code = t.car
       WHERE COALESCE(t.job_status,0) BETWEEN 1 AND 2
         AND t.date_logistic::date BETWEEN $1::date AND $2::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         ${branchClause}
       GROUP BY t.doc_no, t.date_logistic, drv.name_1, t.driver, car.name_1, t.car, t.job_status
       ORDER BY days_open DESC, t.doc_no LIMIT 50`,
      [monthStart, day]
    ),
    // ສຳເລັດຢູ່ຈຸດສົ່ງ — completed WITH an end position recorded, i.e. there is
    // GPS proof the driver was at the drop-off. Bills closed without one are
    // the ones worth questioning, so both counts come back.
    queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE NULLIF(TRIM(d.lat_end), '') IS NOT NULL)::int AS with_gps,
         COUNT(*) FILTER (WHERE NULLIF(TRIM(d.lat_end), '') IS NULL)::int AS without_gps
       FROM public.odg_tms_detail d
       JOIN odg_tms t ON t.doc_no = d.doc_no
       WHERE COALESCE(d.status,0) = 1
         AND t.date_logistic::date BETWEEN $1::date AND $2::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         ${branchClause}`,
      [monthStart, day]
    ),
  ]);

  // ── ຕົ້ນທຶນ fleet ເດືອນນີ້: ນ້ຳມັນ + ໄລຍະທາງຈາກເລກໄມ ──────────────────
  // ເລກໄມເປັນ text ຈາກມືຄົນຂັບ — ກັ່ນສະເພາະຄູ່ທີ່ເປັນຕົວເລກ, end > start,
  // ແລະ ຕໍ່ຖ້ຽວບໍ່ເກີນ 2,000 ກມ (ກັນພິມຫຼົງຫຼັກດຽວແລ້ວດຶງຄ່າສະເລ່ຍເພ)
  const milesNum = (col) =>
    `NULLIF(regexp_replace(TRIM(${col}), '[^0-9.]', '', 'g'), '')::numeric`;
  const [fuelRow, kmRow] = await Promise.all([
    queryOne(
      `SELECT COALESCE(SUM(liters), 0)::numeric AS liters,
              COALESCE(SUM(amount), 0)::numeric AS amount,
              COUNT(*)::int AS refills
       FROM public.odg_tms_fuel_log
       WHERE fuel_date BETWEEN $1::date AND $2::date
         ${branchCode ? `AND COALESCE(NULLIF(TRIM(transport_code), ''), '') = '${branchCode.replace(/'/g, "''")}'` : ""}`,
      [monthStart, day]
    ),
    queryOne(
      `SELECT COALESCE(SUM(${milesNum("t.miles_end")} - ${milesNum("t.miles_start")}), 0)::numeric AS km,
              COUNT(*)::int AS trips
       FROM odg_tms t
       WHERE COALESCE(t.job_status,0) >= 3
         AND t.date_logistic::date BETWEEN $1::date AND $2::date
         AND ${getFixedYearSqlFilter("t.doc_date")}
         ${branchClause}
         AND ${milesNum("t.miles_end")} IS NOT NULL
         AND ${milesNum("t.miles_start")} IS NOT NULL
         AND (${milesNum("t.miles_end")} - ${milesNum("t.miles_start")}) BETWEEN 0 AND 2000`,
      [monthStart, day]
    ),
  ]);

  const num = (row, key) => Number(row?.[key] ?? 0);
  const shape = (row) => ({
    trips: num(row, "trips"),
    trips_closed: num(row, "trips_closed"),
    bills: num(row, "bills"),
    delivered: num(row, "delivered"),
    cancelled: num(row, "cancelled"),
    pending: num(row, "pending"),
    qty_delivered: num(row, "qty_delivered"),
    cod: num(row, "cod"),
  });

  return {
    date: day,
    month: day.slice(0, 7),
    branch: branchCode,
    today: shape(todayRow),
    month_total: shape(monthRow),
    series: series.map((r) => ({
      day: r.day,
      label: r.day_label,
      trips: Number(r.trips ?? 0),
      delivered: Number(r.delivered ?? 0),
    })),
    drivers: drivers.map((r) => ({
      code: r.code,
      name: r.name,
      trips: Number(r.trips ?? 0),
      bills: Number(r.bills ?? 0),
      delivered: Number(r.delivered ?? 0),
      cancelled: Number(r.cancelled ?? 0),
      cod: Number(r.cod ?? 0),
      success_rate:
        Number(r.bills ?? 0) > 0
          ? Math.round((Number(r.delivered ?? 0) / Number(r.bills)) * 100)
          : 0,
    })),
    workers: workers.map((r) => ({ code: r.code, name: r.name, trips: Number(r.trips ?? 0) })),
    dispatchers: dispatchers.map((r) => ({ code: r.code, name: r.name, trips: Number(r.trips ?? 0) })),
    pickup_variance: variance.map((r) => ({
      name: r.name,
      bills: Number(r.bills ?? 0),
      missing_qty: Number(r.missing_qty ?? 0),
    })),
    // ສົ່ງບໍ່ໝົດ = ຕ້ອງຄືນສາງ (ຈຳນວນທີ່ບໍ່ໄດ້ສົ່ງ ຄືຈຳນວນທີ່ຂຶ້ນລົດກັບຄືນ)
    returned_to_store: partial.map((r) => ({
      bill_no: r.bill_no, doc_no: r.doc_no, cust_name: r.cust_name, driver: r.driver,
      planned: Number(r.planned ?? 0), delivered: Number(r.delivered ?? 0),
      short_qty: Number(r.short_qty ?? 0), returned_qty: Number(r.returned_qty ?? 0),
    })),
    // ຄ້າງປິດຖ້ຽວ
    open_trips: openTrips.map((r) => ({
      doc_no: r.doc_no, day: r.day, driver: r.driver, car: r.car,
      job_status: Number(r.job_status ?? 0), bills: Number(r.bills ?? 0),
      open_bills: Number(r.open_bills ?? 0), days_open: Number(r.days_open ?? 0),
    })),
    // ສຳເລັດການຈັດສົ່ງຢູ່ບ່ອນຈັດສົ່ງ (ມີ GPS ຢືນຢັນ / ບໍ່ມີ)
    delivery_proof: {
      with_gps: Number(deliveredOnSite?.with_gps ?? 0),
      without_gps: Number(deliveredOnSite?.without_gps ?? 0),
    },
    // ຕົ້ນທຶນ fleet ເດືອນນີ້ — ແອັບຄິດອັດຕາເອງ (ກີບ/ກມ, ລິດ/100ກມ)
    fleet_cost: {
      month_km: Number(kmRow?.km ?? 0),
      km_trips: Number(kmRow?.trips ?? 0),
      fuel_liters: Number(fuelRow?.liters ?? 0),
      fuel_amount: Number(fuelRow?.amount ?? 0),
      refills: Number(fuelRow?.refills ?? 0),
    },
  };
}

async function mobileSupervisorKpi({ date = "" } = {}) {
  const day = coerceDateToFixedYear(date || getLaoToday());
  const row = await query(
    `SELECT
       COUNT(DISTINCT t.doc_no)::int AS total_trips,
       COUNT(DISTINCT t.doc_no) FILTER (WHERE COALESCE(t.job_status,0) >= 3)::int AS done_trips,
       COUNT(d.bill_no)::int AS total_bills,
       COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered_bills,
       COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled_bills,
       COUNT(*) FILTER (WHERE COALESCE(d.status,0) NOT IN (1,2))::int AS pending_bills,
       -- ເບີກເຄື່ອງແລ້ວ (ຍົກຂຶ້ນລົດ) ແລະ ກຳລັງແລ່ນສົ່ງຢູ່ — ສອງອັນນີ້ຄື
       -- "ຂອງທີ່ອອກຈາກສາງໄປແລ້ວ" ທີ່ຫົວໜ້າຖາມທຸກມື້.
       COUNT(*) FILTER (WHERE d.recipt_job IS NOT NULL)::int AS picked_bills,
       COUNT(*) FILTER (
         WHERE COALESCE(d.status,0) NOT IN (1,2) AND d.sent_start IS NOT NULL
       )::int AS delivering_bills,
       COALESCE(SUM(d.collected_amount), 0)::numeric AS cod_collected
     FROM odg_tms t
     LEFT JOIN public.odg_tms_detail d
       ON d.doc_no = t.doc_no AND ${getFixedYearSqlFilter("d.doc_date")}
     WHERE t.doc_date = $1
       AND COALESCE(t.job_status,0) != 4
       AND ${getFixedYearSqlFilter("t.doc_date")}`,
    [day]
  );
  const base = row[0] ?? {};
  const [quality, flow] = await Promise.all([
    mobileDeliveryQuality(day),
    mobileDailyBillFlow(day),
  ]);
  return { ...base, ...quality, ...flow };
}

/**
 * ເງື່ອນໄຂຂອງແຕ່ລະຍອດ — **ບ່ອນດຽວ** ທີ່ນິຍາມໄວ້.
 *
 * ທັງຕົວເລກໃນບັດ ແລະ ລາຍການບິນທີ່ເປີດຈາກການກົດບັດ ໃຊ້ອັນນີ້ຮ່ວມກັນ ຈຶ່ງເປັນ
 * ໄປບໍ່ໄດ້ທີ່ບັດຈະບອກ 12 ແຕ່ລາຍການສະແດງ 9 — ຄວາມບໍ່ກົງກັນແບບນັ້ນເຮັດໃຫ້
 * ຫົວໜ້າເຊົາເຊື່ອຕົວເລກທັງໜ້າ.
 */
const DAILY_BILL_BUCKETS = {
  carried: `opened_at IS NOT NULL
            AND opened_at::date < $1::date
            AND (sent_end IS NULL OR sent_end::date >= $1::date)
            AND status <> 2`,
  opened: `opened_at IS NOT NULL AND opened_at::date = $1::date`,
  sending: `(status = 1 AND sent_end IS NOT NULL AND sent_end::date = $1::date)
            OR (status NOT IN (1, 2) AND sent_start IS NOT NULL)`,
  outstanding: `status NOT IN (1, 2)
                AND opened_at IS NOT NULL
                AND opened_at::date <= $1::date`,
};

/**
 * ຍອດບິນປະຈຳວັນແບບດຸ່ນດ່ຽງ — ອ່ານຄືບັນຊີ:
 *
 *   ຍົກມາ + ເປີດໃໝ່ − (ສົ່ງແລ້ວ + ຍົກເລີກ) = ຄົງເຫຼືອ
 *
 * ນິຍາມ (ນັບສະເພາະບິນທີ່ຖືກຈັດເຂົ້າຖ້ຽວແລ້ວ = ມີແຖວໃນ odg_tms_detail):
 *   * `carried_over`   ເປີດບິນກ່ອນມື້ນີ້ ແລະ ຕົ້ນມື້ນີ້ຍັງບໍ່ທັນປິດ
 *   * `opened_today`   ເປີດບິນມື້ນີ້ ແລະ ມີການຈັດສົ່ງ
 *   * `sent_or_sending` ສົ່ງສຳເລັດມື້ນີ້ + ກຳລັງແລ່ນສົ່ງຢູ່
 *   * `outstanding`    ຄົງເຫຼືອທີ່ຍັງບໍ່ປິດຮອດຂະນະນີ້
 *
 * ⚠️ ເວລາເປີດບິນມາຈາກ billOpenedAtSql() (doc_date + doc_time = ໂມງລາວ) ບໍ່ແມ່ນ
 * create_date_time_now ທີ່ ERP ຂຽນເປັນ UTC — ຖ້າໃຊ້ອັນນັ້ນ ບິນທີ່ເປີດກ່ອນ
 * 07:00 ຈະຖືກນັບເປັນມື້ວານທັງໝົດ.
 */
async function mobileDailyBillFlow(day) {
  const opened = billOpenedAtSql("ic");
  const rows = await query(
    `WITH scoped AS (
       SELECT
         d.bill_no,
         d.doc_no,
         COALESCE(d.status, 0) AS status,
         d.sent_start,
         d.sent_end,
         ${opened} AS opened_at
       FROM public.odg_tms_detail d
       LEFT JOIN public.ic_trans ic ON ic.doc_no = d.bill_no
       WHERE ${getFixedYearSqlFilter("d.doc_date")}
     )
     SELECT
       COUNT(*) FILTER (WHERE ${DAILY_BILL_BUCKETS.carried})::int AS carried_over,
       COUNT(*) FILTER (WHERE ${DAILY_BILL_BUCKETS.opened})::int AS opened_today,
       COUNT(*) FILTER (WHERE ${DAILY_BILL_BUCKETS.sending})::int AS sent_or_sending,
       COUNT(*) FILTER (WHERE ${DAILY_BILL_BUCKETS.outstanding})::int AS outstanding
     FROM scoped`,
    [day]
  );
  const r = rows[0] ?? {};
  return {
    carried_over: Number(r.carried_over ?? 0),
    opened_today: Number(r.opened_today ?? 0),
    sent_or_sending: Number(r.sent_or_sending ?? 0),
    outstanding: Number(r.outstanding ?? 0),
  };
}

/**
 * ຄຸນນະພາບການສົ່ງຂອງມື້ນັ້ນ — ຄິດຈາກບິນທີ່ **ສົ່ງສຳເລັດແລ້ວ** ເທົ່ານັ້ນ.
 *
 * ສາມຕົວ:
 *   * `within24h`  — ສົ່ງພາຍໃນ 24 ຊົ່ວໂມງນັບແຕ່ **ເປີດບິນ**
 *   * `onSchedule` — ສົ່ງບໍ່ເກີນວັນທີ່ນັດຈັດສົ່ງ (date_logistic)
 *   * `queueJumped`— ບິນທີ່ **ເປີດຫຼັງ ແຕ່ໄດ້ສົ່ງກ່ອນ** ບິນທີ່ເປີດກ່ອນ
 *
 * ⚠️ ເວລາເປີດບິນຕ້ອງມາຈາກ billOpenedAtSql() (doc_date + doc_time = ໂມງລາວ).
 * `ic_trans.create_date_time_now` ຖືກ ERP ຂຽນເປັນ UTC — ໃຊ້ອັນນັ້ນຈະຄາດເຄື່ອນ
 * 7 ຊົ່ວໂມງ ແລ້ວຕົວເລກ "ພາຍໃນ 24 ຊມ" ຈະຜິດທັງໝົດ.
 */
async function mobileDeliveryQuality(day) {
  const opened = billOpenedAtSql("ic");
  const rows = await query(
    `WITH sent AS (
       SELECT d.bill_no,
              d.sent_end,
              t.date_logistic,
              ${opened} AS opened_at
       FROM odg_tms t
       INNER JOIN public.odg_tms_detail d
         ON d.doc_no = t.doc_no AND ${getFixedYearSqlFilter("d.doc_date")}
       LEFT JOIN public.ic_trans ic ON ic.doc_no = d.bill_no
       WHERE t.doc_date = $1
         AND COALESCE(t.job_status,0) != 4
         AND COALESCE(d.status,0) = 1
         AND d.sent_end IS NOT NULL
         AND ${getFixedYearSqlFilter("t.doc_date")}
     )
     SELECT
       COUNT(*)::int AS sent_bills,
       COUNT(*) FILTER (
         WHERE opened_at IS NOT NULL
           AND sent_end <= opened_at + INTERVAL '24 hours'
       )::int AS within_24h_bills,
       COUNT(*) FILTER (
         WHERE date_logistic IS NOT NULL
           AND sent_end::date <= date_logistic::date
       )::int AS on_schedule_bills,
       -- ບລັດຄິວ: ມີບິນອື່ນທີ່ເປີດກ່ອນ ແຕ່ຖືກສົ່ງຫຼັງ (ຫຼືຍັງບໍ່ໄດ້ສົ່ງ).
       COUNT(*) FILTER (WHERE jumped)::int AS queue_jumped_bills
     FROM (
       SELECT s.*,
              EXISTS (
                SELECT 1 FROM sent e
                WHERE e.opened_at IS NOT NULL
                  AND s.opened_at IS NOT NULL
                  AND e.opened_at < s.opened_at
                  AND e.sent_end > s.sent_end
              ) AS jumped
       FROM sent s
     ) q`,
    [day]
  );
  const r = rows[0] ?? {};
  const sent = Number(r.sent_bills ?? 0);
  const pct = (n) => (sent > 0 ? Math.round((Number(n ?? 0) / sent) * 1000) / 10 : 0);
  return {
    sent_bills: sent,
    within_24h_bills: Number(r.within_24h_bills ?? 0),
    on_schedule_bills: Number(r.on_schedule_bills ?? 0),
    queue_jumped_bills: Number(r.queue_jumped_bills ?? 0),
    within_24h_pct: pct(r.within_24h_bills),
    on_schedule_pct: pct(r.on_schedule_bills),
    queue_jumped_pct: pct(r.queue_jumped_bills),
  };
}

module.exports = {
  mobileLogin,
  mobileJobsList,
  mobileJobsListAll,
  mobileSupervisorKpi,
  mobileManagerDashboard,
  mobileJobAction,
  mobileBills,
  mobileFuelLogs,
  mobileSaveLocations,
  fcmTokenSave,
  fcmTokenDelete,
};

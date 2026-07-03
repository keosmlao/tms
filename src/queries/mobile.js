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
  coerceDateToFixedYear,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const { saveToken: saveFcmToken, deleteToken: deleteFcmToken } = require("./push");
const { saveFuelRefill, getFuelLogs, getFuelSummary } = require("./fuel");
const { notifyBillStatus } = require("./notifications");
const { assertJobGeofence } = require("./geofence");

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

async function mobileJobsList(driverId, date) {
  const fixedDate = date ? coerceDateToFixedYear(date) : null;
  let sql = `
    WITH bill_summary AS (
      SELECT
        d.doc_no, COUNT(*)::int AS total_bills,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NULL)::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NOT NULL)::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count,
        MIN(d.recipt_job) AS received_at,
        MIN(d.sent_start) FILTER (WHERE d.sent_start IS NOT NULL) AS first_bill_started_at
      FROM public.odg_tms_detail d
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
    LEFT JOIN bill_summary bs ON bs.doc_no = a.doc_no`;

  if (date) {
    sql += ` WHERE a.driver=$1 AND a.job_status != 4 AND a.doc_date=$2 AND ${getFixedYearSqlFilter("a.doc_date")} ORDER BY a.doc_no`;
    return await query(sql, [driverId, fixedDate]);
  }

  sql += ` WHERE a.driver=$1 AND a.job_status != 4 AND ${getFixedYearSqlFilter("a.doc_date")} ORDER BY a.doc_no`;
  return await query(sql, [driverId]);
}

function normalizeSupervisorStatus(value) {
  const status = asText(value).toLowerCase();
  if (["pending", "active", "done", "issue"].includes(status)) return status;
  return "";
}

async function mobileJobsListAll({ date = "", driverId = "", status = "" } = {}) {
  const fixedDate = date ? coerceDateToFixedYear(date) : null;
  const normalizedStatus = normalizeSupervisorStatus(status);
  const where = ["a.job_status != 4", getFixedYearSqlFilter("a.doc_date")];
  const params = [];

  if (fixedDate) {
    params.push(fixedDate);
    where.push(`a.doc_date=$${params.length}`);
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

async function mobileJobAction(body) {
  const client = await pool.connect();
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
                  (COALESCE(NULLIF(TRIM(d.pickup_transport_code), ''),
                            (SELECT s.transport_code FROM public.ic_trans_shipment s
                             WHERE s.doc_no = d.bill_no LIMIT 1),
                            '') <> COALESCE(t.origin_transport_code, '')) AS is_other_branch
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
        // Auto-receive if the driver hasn't tapped "ຮັບຖ້ຽວ" yet — saves a step
        // since picking up implies the trip is in hand.
        if (Number(currentJob.job_status ?? 0) === 0) {
          await client.query(
            `UPDATE odg_tms
             SET job_status = 1
             WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [currentDocNo]
          );
        } else if (Number(currentJob.job_status ?? 0) > 2) {
          throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດເບີກເຄື່ອງ");
        }

        await ensureBillDeliveryItems(billNo, client);

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
             AND COALESCE(d.pickup_transport_code,
                          (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                          '') <> COALESCE(j.origin_transport_code, '')
             AND ${getFixedYearSqlFilter("d.doc_date")}`,
          [billNo, currentDocNo]
        );

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "📦 ເບີກເຄື່ອງແລ້ວ");
        return { success: true, doc_no: currentDocNo };
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
        // Auto-receive the trip if the driver hasn't tapped "ຮັບຖ້ຽວ" — arriving
        // to collect goods implies the trip is in hand.
        if (Number(currentBill.job_status ?? 0) === 0) {
          await client.query(
            `UPDATE odg_tms
             SET job_status = 1
             WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [currentDocNo]
          );
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
        // guarded update as checkin_bill (only fills NULL/empty/zero).
        if (currentBill.cust_code && lat && lng) {
          const updated = await client.query(
            `UPDATE public.ar_customer_detail
             SET latitude = $2, longitude = $3
             WHERE ar_code = $1
               AND (
                 latitude IS NULL
                 OR longitude IS NULL
                 OR TRIM(latitude::text) = ''
                 OR TRIM(longitude::text) = ''
                 OR TRIM(latitude::text) ~ '^-?0+\\.?0*$'
                 OR TRIM(longitude::text) ~ '^-?0+\\.?0*$'
               )
             RETURNING ar_code`,
            [currentBill.cust_code, lat, lng]
          );
          if ((updated.rowCount ?? 0) === 0) {
            await client.query(
              `INSERT INTO public.ar_customer_detail (ar_code, latitude, longitude)
               VALUES ($1, $2, $3)
               ON CONFLICT (ar_code) DO UPDATE
                 SET latitude = EXCLUDED.latitude,
                     longitude = EXCLUDED.longitude
                 WHERE
                   public.ar_customer_detail.latitude IS NULL
                   OR public.ar_customer_detail.longitude IS NULL
                   OR TRIM(public.ar_customer_detail.latitude::text) = ''
                   OR TRIM(public.ar_customer_detail.longitude::text) = ''
                   OR TRIM(public.ar_customer_detail.latitude::text) ~ '^-?0+\\.?0*$'
                   OR TRIM(public.ar_customer_detail.longitude::text) ~ '^-?0+\\.?0*$'`,
              [currentBill.cust_code, lat, lng]
            ).catch((err) => {
              console.warn('[receive_customer_bill] ar_customer_detail insert skipped:', err?.message);
            });
          }
        }

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "📦 ຮັບສິນຄ້າຈາກລານລູກຄ້າແລ້ວ");
        return { success: true, doc_no: currentDocNo };
      }

      case "dispatch":
      case "start_dispatch": {
        if (!docNo) throw new Error("doc_no is required");
        // No pending_pickup_count check — a single trip may pick up from
        // multiple warehouses or from a customer's home/shop, so the driver
        // can leave (start_dispatch) before all bills have been picked up.
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
             AND COALESCE(d.pickup_transport_code,
                          (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                          '') = COALESCE(j.origin_transport_code, '')
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
             AND COALESCE(d.pickup_transport_code,
                          (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                          '') = COALESCE(j.origin_transport_code, '')
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
                  COALESCE(d.pickup_transport_code,
                           (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                           '') AS effective_pickup_code
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
               AND COALESCE(d.pickup_transport_code,
                            (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                            '') = COALESCE(j.origin_transport_code, '')
               AND ${getFixedYearSqlFilter("d.doc_date")}`,
            [currentDocNo]
          );
        }

        // Backfill the customer's location if it's missing. Only updates when
        // the existing latitude/longitude is NULL/empty/zero so we don't
        // overwrite a known-good location with a delivery checkin point.
        // Accepts any zero variant ("0", "0.0", "0.000000", "-0.0", whitespace).
        if (currentBill.cust_code && lat && lng) {
          const updated = await client.query(
            `UPDATE public.ar_customer_detail
             SET latitude = $2, longitude = $3
             WHERE ar_code = $1
               AND (
                 latitude IS NULL
                 OR longitude IS NULL
                 OR TRIM(latitude::text) = ''
                 OR TRIM(longitude::text) = ''
                 OR TRIM(latitude::text) ~ '^-?0+\\.?0*$'
                 OR TRIM(longitude::text) ~ '^-?0+\\.?0*$'
               )
             RETURNING ar_code`,
            [currentBill.cust_code, lat, lng]
          );
          // If no row matched (e.g. customer not in ar_customer_detail), insert.
          if ((updated.rowCount ?? 0) === 0) {
            await client.query(
              `INSERT INTO public.ar_customer_detail (ar_code, latitude, longitude)
               VALUES ($1, $2, $3)
               ON CONFLICT (ar_code) DO UPDATE
                 SET latitude = EXCLUDED.latitude,
                     longitude = EXCLUDED.longitude
                 WHERE
                   public.ar_customer_detail.latitude IS NULL
                   OR public.ar_customer_detail.longitude IS NULL
                   OR TRIM(public.ar_customer_detail.latitude::text) = ''
                   OR TRIM(public.ar_customer_detail.longitude::text) = ''
                   OR TRIM(public.ar_customer_detail.latitude::text) ~ '^-?0+\\.?0*$'
                   OR TRIM(public.ar_customer_detail.longitude::text) ~ '^-?0+\\.?0*$'`,
              [currentBill.cust_code, lat, lng]
            ).catch((err) => {
              // ar_customer_detail might not have ar_code as primary key; skip on conflict.
              console.warn('[checkin] ar_customer_detail insert skipped:', err?.message);
            });
          }
        }

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
                  d.pickup_transport_code,
                  COALESCE(t.origin_transport_code, '') AS origin_transport_code,
                  COALESCE(d.pickup_transport_code,
                           (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                           '') AS effective_pickup_code,
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
                 AND COALESCE(d.pickup_transport_code,
                              (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                              '') = COALESCE(j.origin_transport_code, '')
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

        await client.query(
          `UPDATE public.odg_tms_detail
           SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
               status = 1, sent_end = LOCALTIMESTAMP(0),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng),
               lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
               url_img = COALESCE($6, url_img),
               sight_img = COALESCE($7, sight_img),
               remark = COALESCE($8, remark)
           WHERE bill_no = $1 AND doc_no = $9 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, latEnd, lngEnd, deliveryImage, signatureImage, comment, currentDocNo]
        );

        await saveDeliveryImages(billNo, deliveryImages, client);

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
               AND COALESCE(d.pickup_transport_code,
                            (SELECT s.transport_code FROM public.ic_trans_shipment s WHERE s.doc_no = d.bill_no LIMIT 1),
                            '') = COALESCE(j.origin_transport_code, '')
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

        const summary = await getBillDeliveryItemSummary(billNo, client);
        const remainingItems = Number(summary?.remaining_item_count ?? 0);
        const remainingQty = Number(summary?.remaining_qty_total ?? 0);
        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        if (dispatchAutoStarted) void notifyJobDispatchStarted(currentDocNo);
        void notifyBillStatus(billNo, "✅ ຈັດສົ່ງສຳເລັດ");
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          finished: true,
          remaining_item_count: remainingItems,
          remaining_qty_total: remainingQty,
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
          // Reset job_status to 0 if no other bills in this job are still received.
          const stillPicked = await client.query(
            `SELECT 1 FROM public.odg_tms_detail
             WHERE doc_no = $1 AND recipt_job IS NOT NULL
               AND ${getFixedYearSqlFilter("doc_date")}
             LIMIT 1`,
            [currentDocNo]
          );
          if (stillPicked.rowCount === 0) {
            await client.query(
              `UPDATE odg_tms
               SET job_status = 0
               WHERE doc_no = $1 AND COALESCE(job_status, 0) = 1
                 AND ${getFixedYearSqlFilter("doc_date")}`,
              [currentDocNo]
            );
          }
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
               collected_amount = NULL,
               payment_method = NULL,
               collected_at = NULL
           WHERE bill_no = $1 AND doc_no = $2 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, currentDocNo]
        );

        await client.query(
          `UPDATE public.odg_tms_detail_item
           SET delivered_qty = 0
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

        if (comment !== null) {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET remark = $2
             WHERE bill_no = $1 AND doc_no = $3 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, comment, currentDocNo]
          );
        }

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "✏️ ແກ້ໄຂການຈັດສົ່ງ");
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
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

        await client.query("COMMIT");
        return { success: true };
      }

      case "save_travel_history": {
        if (!docNo) throw new Error("doc_no is required");
        if (!lat || !lng) throw new Error("lat and lng are required");

        const today = new Date().toISOString().split("T")[0];
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
        -- Pickup point: per-bill override > bill's transport_code (default).
        -- '__CUSTOMER__' means pickup at the customer's home/shop; otherwise
        -- it's a transport_type code joined to its name below.
        COALESCE(NULLIF(TRIM(a.pickup_transport_code), ''), NULLIF(TRIM(s.transport_code), ''), '') as pickup_transport_code,
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
        COALESCE(NULLIF(TRIM(pb.planned_lng), ''), '') as planned_lng
      FROM public.odg_tms_detail a
      LEFT JOIN ar_customer b ON b.code = a.cust_code
      LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
      -- Custom "ອື່ນໆ" bills have no ar_customer row; their name/phone live on
      -- the hand-typed bill itself.
      LEFT JOIN public.odg_tms_custom_bill cb ON cb.bill_no = a.bill_no
      LEFT JOIN ic_trans_shipment s ON s.doc_no = a.bill_no
      LEFT JOIN public.transport_type pt ON pt.code = COALESCE(NULLIF(a.pickup_transport_code, '__CUSTOMER__'), s.transport_code)
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

    return data.map((row) => {
      const summary = itemSummaryByBill.get(String(row.bill_no)) ?? {
        total_item_count: Number(row.count_item ?? 0),
        delivered_item_count: 0,
        remaining_item_count: Number(row.count_item ?? 0),
        delivered_qty_total: 0,
        remaining_qty_total: 0,
      };
      const status = Number(row.status ?? 0);

      const phase =
        status === 2 ? "cancel"
        : status === 1 ? "done"
        : row.sent_start !== "-" ? "inprogress"
        : row.recipt_job !== "-" ? "pickup"
        : "waiting";

      const status_text =
        phase === "cancel" ? "ຍົກເລີກຈັດສົ່ງ"
        : phase === "done" ? "ຈັດສົ່ງສຳເລັດ"
        : phase === "inprogress" ? "ກຳລັງຈັດສົ່ງ"
        : phase === "pickup" ? "ເບີກເຄື່ອງແລ້ວ"
        : "ລໍເບີກເຄື່ອງ";

      return {
        ...row,
        count_item: summary.total_item_count,
        delivered_item_count: summary.delivered_item_count,
        remaining_item_count: summary.remaining_item_count,
        delivered_qty_total: summary.delivered_qty_total,
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

    const today = new Date().toISOString().split("T")[0];
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
async function mobileSupervisorKpi({ date = "" } = {}) {
  const day = coerceDateToFixedYear(
    date || new Date().toISOString().split("T")[0]
  );
  const row = await query(
    `SELECT
       COUNT(DISTINCT t.doc_no)::int AS total_trips,
       COUNT(DISTINCT t.doc_no) FILTER (WHERE COALESCE(t.job_status,0) >= 3)::int AS done_trips,
       COUNT(d.bill_no)::int AS total_bills,
       COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 1)::int AS delivered_bills,
       COUNT(*) FILTER (WHERE COALESCE(d.status,0) = 2)::int AS cancelled_bills,
       COUNT(*) FILTER (WHERE COALESCE(d.status,0) NOT IN (1,2))::int AS pending_bills,
       COALESCE(SUM(d.collected_amount), 0)::numeric AS cod_collected
     FROM odg_tms t
     LEFT JOIN public.odg_tms_detail d
       ON d.doc_no = t.doc_no AND ${getFixedYearSqlFilter("d.doc_date")}
     WHERE t.doc_date = $1
       AND COALESCE(t.job_status,0) != 4
       AND ${getFixedYearSqlFilter("t.doc_date")}`,
    [day]
  );
  return row[0] ?? {};
}

module.exports = {
  mobileLogin,
  mobileJobsList,
  mobileJobsListAll,
  mobileSupervisorKpi,
  mobileJobAction,
  mobileBills,
  mobileFuelLogs,
  mobileSaveLocations,
  fcmTokenSave,
  fcmTokenDelete,
};

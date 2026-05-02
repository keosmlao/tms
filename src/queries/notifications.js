// Centralised notification dispatcher for delivery events.
// Failures are logged but never thrown — callers should fire-and-forget so a
// transient WA/LINE outage can't break the order workflow.
const { query, queryOne } = require("../lib/db");
const { sendDeliveryFlex } = require("../lib/line");
const { getSetting } = require("./settings");
const { getBranchScope, branchFilterJob } = require("./helpers");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");

// Optional fallback recipient when the bill's sale_code has no line_id mapped.
// Set to a LINE groupId / userId of the OA admin so updates aren't lost.
const LINE_FALLBACK_TO = process.env.LINE_FALLBACK_TO || "";

const STATUS_COLOR = {
  "📋 ຖ້ຽວຈັດສົ່ງໄດ້ຖືກສ້າງ": "blue",
  "📦 ເບີກເຄື່ອງແລ້ວ": "amber",
  "🚚 ເລີ່ມຈັດສົ່ງ": "sky",
  "📍 ຮອດຈຸດສົ່ງ": "sky",
  "✅ ຈັດສົ່ງສຳເລັດ": "green",
  "❌ ຍົກເລີກຈັດສົ່ງ": "red",
};

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

async function getCustomerLineTestTo() {
  const [enabled, to] = await Promise.all([
    getSetting("line.customer.test_enabled", ""),
    getSetting("line.customer.test_to", ""),
  ]);
  return enabled === "1" || enabled === "true"
    ? to || process.env.LINE_CUSTOMER_TEST_TO || ""
    : "";
}

function trackingLink(billNo) {
  if (!PUBLIC_BASE_URL) return `/track?bill=${encodeURIComponent(billNo)}`;
  const base = PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/track?bill=${encodeURIComponent(billNo)}`;
}

// Timeline of delivery checkpoints for a bill — used by the LINE Flex bubble
// to show progress at a glance. The "active" step is the one matching the
// label that triggered the notification (passed in by the caller).
async function getBillTimeline(billNo, activeLabel) {
  try {
    const row = await queryOne(
      `SELECT to_char(create_date_time_now,'DD-MM HH24:MI') as created_at,
              to_char(recipt_job,'DD-MM HH24:MI') as picked_at,
              to_char(sent_start,'DD-MM HH24:MI') as dispatch_at,
              to_char(sent_end,'DD-MM HH24:MI') as finished_at,
              COALESCE(status, 0) as status
       FROM public.odg_tms_detail
       WHERE bill_no = $1
       ORDER BY create_date_time_now DESC NULLS LAST
       LIMIT 1`,
      [billNo]
    );
    if (!row) return [];
    const cancelled = Number(row.status) === 2;
    const finalLabel = cancelled ? "❌ ຍົກເລີກ" : "✅ ສຳເລັດ";
    const steps = [
      { key: "created", label: "📋 ສ້າງຖ້ຽວ", time: row.created_at, done: true },
      { key: "picked", label: "📦 ເບີກເຄື່ອງ", time: row.picked_at, done: Boolean(row.picked_at) },
      { key: "dispatch", label: "🚚 ກຳລັງສົ່ງ", time: row.dispatch_at, done: Boolean(row.dispatch_at) },
      {
        key: "finished",
        label: finalLabel,
        time: row.finished_at,
        done: Boolean(row.finished_at),
      },
    ];

    // Mark the step matching the active label so it pops in the bubble.
    const labelMap = {
      "📋 ຖ້ຽວຈັດສົ່ງໄດ້ຖືກສ້າງ": "created",
      "📦 ເບີກເຄື່ອງແລ້ວ": "picked",
      "🚚 ເລີ່ມຈັດສົ່ງ": "dispatch",
      "📍 ຮອດຈຸດສົ່ງ": "dispatch",
      "✅ ຈັດສົ່ງສຳເລັດ": "finished",
      "❌ ຍົກເລີກຈັດສົ່ງ": "finished",
    };
    const activeKey = labelMap[String(activeLabel ?? "")];
    if (activeKey) {
      const target = steps.find((s) => s.key === activeKey);
      if (target) target.active = true;
    }

    return steps;
  } catch (err) {
    console.warn("[notify] timeline lookup failed:", err?.message ?? err);
    return [];
  }
}

async function getBillContext(billNo) {
  // Split the lookup so a malformed date value on one of the joined tables
  // (ic_trans / ar_customer have legacy empty-string dates that pg refuses to
  // parse when the row is fetched whole) can't poison the whole query. Each
  // sub-select casts only the text fields we need.
  const base = await queryOne(
    `SELECT d.bill_no::text, d.doc_no::text,
            COALESCE(d.cust_code::text, '') as cust_code,
            COALESCE(d.telephone::text, '') as bill_phone,
            COALESCE(j.car::text, '') as car_code,
            COALESCE(j.driver::text, '') as driver_code,
            COALESCE(car.name_1::text, j.car::text, '') as car_name,
            COALESCE(drv.name_1::text, j.driver::text, '') as driver_name
     FROM public.odg_tms_detail d
     LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
     LEFT JOIN public.odg_tms_car car ON car.code = j.car
     LEFT JOIN public.odg_tms_driver drv ON drv.code = j.driver
     WHERE d.bill_no = $1
     ORDER BY d.create_date_time_now DESC NULLS LAST
     LIMIT 1`,
    [billNo]
  );
  if (!base) return null;

  // Customer details — cast each column to text BEFORE COALESCE so legacy
  // date-typed columns with empty values don't fail the implicit '' coercion.
  let cust = { cust_name: "", cust_phone: "", cust_line_id: "" };
  if (base.cust_code) {
    try {
      const c = await queryOne(
        `SELECT COALESCE(name_1::text, '') as cust_name,
                COALESCE(telephone::text, '') as cust_phone,
                COALESCE(register_line_id::text, '') as cust_line_id
         FROM public.ar_customer WHERE code = $1 LIMIT 1`,
        [base.cust_code]
      );
      if (c) cust = c;
    } catch (err) {
      console.warn("[notify] ar_customer lookup failed:", err?.message ?? err);
    }
  }

  // Sales person — sale_code lives on ic_trans, line_id on erp_user.
  let sale = { sale_code: "", sale_name: "", sale_line_id: "" };
  try {
    const s = await queryOne(
      `SELECT COALESCE(b.sale_code::text, '') as sale_code,
              COALESCE(u.name_1::text, '') as sale_name,
              COALESCE(u.line_id::text, '') as sale_line_id
       FROM ic_trans b
       LEFT JOIN erp_user u ON u.code = b.sale_code
       WHERE b.doc_no = $1
       LIMIT 1`,
      [base.bill_no]
    );
    if (s) sale = s;
  } catch (err) {
    console.warn("[notify] ic_trans lookup failed:", err?.message ?? err);
  }

  return {
    ...base,
    cust_phone: base.bill_phone || cust.cust_phone || "",
    cust_name: cust.cust_name,
    cust_line_id: cust.cust_line_id,
    ...sale,
  };
}

// Push the same Flex bubble used for sales staff to the customer's LINE OA
// (uses ar_customer.register_line_id — the userId saved when the customer
// added the OA as a friend). The customer flex includes the public tracking
// link so they can open the live map directly from chat.
async function notifyCustomerLine(billNo, statusLabel) {
  try {
    const [ctx, customerTestTo] = await Promise.all([
      getBillContext(billNo),
      getCustomerLineTestTo(),
    ]);
    if (!ctx) return;
    const recipient = ctx.cust_line_id || (customerTestTo ? "customer-line-missing" : "");
    if (!recipient) return; // customer hasn't linked LINE — silently skip
    const timeline = await getBillTimeline(billNo, statusLabel);
    await sendDeliveryFlex({
      to: recipient,
      statusLabel,
      color: STATUS_COLOR[statusLabel] ?? "default",
      billNo,
      docNo: ctx.doc_no,
      customerName: ctx.cust_name,
      carName: ctx.car_name,
      driverName: ctx.driver_name,
      trackingUrl: trackingLink(billNo),
      testTo: customerTestTo,
      timeline,
    });
  } catch (err) {
    console.warn("[notify] customer LINE failed:", err?.message ?? err);
  }
}

async function notifySalesLine(billNo, statusLabel) {
  try {
    const ctx = await getBillContext(billNo);
    if (!ctx) return;

    // Prefer the bill's own sales person; fall back to a configured OA target
    // so updates aren't dropped when sale_code lacks a line_id mapping.
    const recipient = ctx.sale_line_id || LINE_FALLBACK_TO;
    if (!recipient) {
      console.warn("[notify] no LINE recipient for bill", billNo);
      return;
    }

    const timeline = await getBillTimeline(billNo, statusLabel);
    await sendDeliveryFlex({
      to: recipient,
      statusLabel,
      color: STATUS_COLOR[statusLabel] ?? "default",
      billNo,
      docNo: ctx.doc_no,
      customerName: ctx.cust_name,
      carName: ctx.car_name,
      driverName: ctx.driver_name,
      trackingUrl: trackingLink(billNo),
      timeline,
    });
  } catch (err) {
    console.warn("[notify] sales LINE failed:", err?.message ?? err);
  }
}

// Convenience: full job-created fan-out — one customer-LINE per customer
// plus one sales-LINE per bill (the sales LINE flex now carries the wa.me
// share URL, so we no longer push WhatsApp via Meta API).
async function notifyJobCreated(docNo) {
  try {
    const bills = await query(
      `SELECT bill_no FROM public.odg_tms_detail WHERE doc_no = $1`,
      [docNo]
    );
    const label = "📋 ຖ້ຽວຈັດສົ່ງໄດ້ຖືກສ້າງ";
    for (const b of bills) {
      void notifyCustomerLine(b.bill_no, label);
      void notifySalesLine(b.bill_no, label);
    }
  } catch (err) {
    console.warn("[notify] job-created fanout failed:", err?.message ?? err);
  }
}

// Fan-out a status update to both the sales OA and the customer LINE in one
// call so mobile.js doesn't have to remember both.
async function notifyBillStatus(billNo, statusLabel) {
  void notifySalesLine(billNo, statusLabel);
  void notifyCustomerLine(billNo, statusLabel);
}

// Composite key used to identify a single activity event across the union
// branches. Built identically here and on the client mark-read call so the
// reads table stays consistent.
const NOTIFICATION_KEY_SQL = `
  type || '|' || doc_no || '|' || COALESCE(bill_no, '') ||
  '|' || EXTRACT(EPOCH FROM event_at)::bigint::text
`;

async function getActivityNotifications(session, limit = 30) {
  const scope = getBranchScope(session);
  const max = Math.min(Math.max(Number(limit) || 30, 1), 80);
  const userCode = String(session?.usercode ?? "");
  return query(
    `WITH activity AS (
      SELECT
        'job_created' AS type,
        a.doc_no,
        NULL::text AS bill_no,
        'ສ້າງຖ້ຽວໃໝ່' AS title,
        CONCAT('ຖ້ຽວ ', a.doc_no, ' · ', COALESCE(car.name_1, a.car, '-')) AS body,
        a.create_date_time_now AS event_at,
        '/jobs' AS href,
        'blue' AS tone
      FROM public.odg_tms a
      LEFT JOIN public.odg_tms_car car ON car.code = a.car
      WHERE a.create_date_time_now IS NOT NULL
        AND ${getFixedYearSqlFilter("a.doc_date")}
        ${branchFilterJob(scope, "a")}

      UNION ALL

      SELECT
        'bill_pickup' AS type,
        d.doc_no,
        d.bill_no,
        'ເບີກເຄື່ອງແລ້ວ' AS title,
        CONCAT('ບິນ ', d.bill_no, ' · ', COALESCE(cu.name_1, d.cust_code, '-')) AS body,
        d.recipt_job AS event_at,
        CONCAT('/tracking?search=', d.bill_no) AS href,
        'amber' AS tone
      FROM public.odg_tms_detail d
      LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
      LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
      WHERE d.recipt_job IS NOT NULL
        AND ${getFixedYearSqlFilter("d.doc_date")}
        ${branchFilterJob(scope, "a")}

      UNION ALL

      SELECT
        'bill_dispatch' AS type,
        d.doc_no,
        d.bill_no,
        CASE WHEN d.sent_end IS NULL THEN 'ເລີ່ມຈັດສົ່ງ' ELSE 'ມີການເຄື່ອນໄຫວຈັດສົ່ງ' END AS title,
        CONCAT('ບິນ ', d.bill_no, ' · ', COALESCE(cu.name_1, d.cust_code, '-')) AS body,
        d.sent_start AS event_at,
        CONCAT('/tracking?search=', d.bill_no) AS href,
        'sky' AS tone
      FROM public.odg_tms_detail d
      LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
      LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
      WHERE d.sent_start IS NOT NULL
        AND ${getFixedYearSqlFilter("d.doc_date")}
        ${branchFilterJob(scope, "a")}

      UNION ALL

      SELECT
        CASE WHEN COALESCE(d.status, 0) = 2 THEN 'bill_cancelled' ELSE 'bill_completed' END AS type,
        d.doc_no,
        d.bill_no,
        CASE WHEN COALESCE(d.status, 0) = 2 THEN 'ຍົກເລີກຈັດສົ່ງ' ELSE 'ຈັດສົ່ງສຳເລັດ' END AS title,
        CONCAT('ບິນ ', d.bill_no, ' · ', COALESCE(cu.name_1, d.cust_code, '-')) AS body,
        d.sent_end AS event_at,
        CONCAT('/tracking?search=', d.bill_no) AS href,
        CASE WHEN COALESCE(d.status, 0) = 2 THEN 'rose' ELSE 'emerald' END AS tone
      FROM public.odg_tms_detail d
      LEFT JOIN public.odg_tms a ON a.doc_no = d.doc_no
      LEFT JOIN public.ar_customer cu ON cu.code = d.cust_code
      WHERE d.sent_end IS NOT NULL
        AND COALESCE(d.status, 0) IN (1, 2)
        AND ${getFixedYearSqlFilter("d.doc_date")}
        ${branchFilterJob(scope, "a")}

      UNION ALL

      SELECT
        'job_closed' AS type,
        a.doc_no,
        NULL::text AS bill_no,
        'ປິດຖ້ຽວແລ້ວ' AS title,
        CONCAT('ຖ້ຽວ ', a.doc_no, ' · ', COALESCE(car.name_1, a.car, '-')) AS body,
        COALESCE(a.admin_close_at, a.job_close) AS event_at,
        '/jobs/closed' AS href,
        'slate' AS tone
      FROM public.odg_tms a
      LEFT JOIN public.odg_tms_car car ON car.code = a.car
      WHERE COALESCE(a.admin_close_at, a.job_close) IS NOT NULL
        AND ${getFixedYearSqlFilter("a.doc_date")}
        ${branchFilterJob(scope, "a")}
    )
    SELECT
      type,
      doc_no,
      bill_no,
      title,
      body,
      href,
      tone,
      to_char(event_at, 'DD-MM-YYYY HH24:MI') AS event_time,
      EXTRACT(EPOCH FROM (now() - event_at))::int AS age_seconds,
      ${NOTIFICATION_KEY_SQL} AS notification_key,
      (r.user_code IS NOT NULL) AS read
    FROM activity
    LEFT JOIN public.odg_tms_notification_reads r
      ON r.user_code = $2
     AND r.notification_key = ${NOTIFICATION_KEY_SQL}
    WHERE event_at IS NOT NULL
    ORDER BY event_at DESC
    LIMIT $1`,
    [max, userCode]
  );
}

async function markActivityNotificationRead(session, notificationKey) {
  const userCode = String(session?.usercode ?? "");
  const key = String(notificationKey ?? "");
  if (!userCode || !key) return { success: false };
  await query(
    `INSERT INTO public.odg_tms_notification_reads (user_code, notification_key)
     VALUES ($1, $2)
     ON CONFLICT (user_code, notification_key) DO NOTHING`,
    [userCode, key]
  );
  return { success: true };
}

async function markAllActivityNotificationsRead(session, limit = 80) {
  const userCode = String(session?.usercode ?? "");
  if (!userCode) return { success: false };
  // Fetch the visible notifications and bulk-insert their keys for this
  // user — keeps "mark all" semantics consistent with what the dropdown
  // actually shows.
  const rows = await getActivityNotifications(session, limit);
  if (rows.length === 0) return { success: true, marked: 0 };
  const values = [];
  const placeholders = [];
  rows.forEach((row, i) => {
    placeholders.push(`($1, $${i + 2})`);
    values.push(String(row.notification_key));
  });
  await query(
    `INSERT INTO public.odg_tms_notification_reads (user_code, notification_key)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (user_code, notification_key) DO NOTHING`,
    [userCode, ...values]
  );
  return { success: true, marked: rows.length };
}

module.exports = {
  notifyJobCreated,
  notifyBillStatus,
  notifyCustomerLine,
  notifySalesLine,
  getActivityNotifications,
  markActivityNotificationRead,
  markAllActivityNotificationsRead,
  trackingLink,
};

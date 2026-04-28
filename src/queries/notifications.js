// Centralised notification dispatcher for delivery events.
// Failures are logged but never thrown — callers should fire-and-forget so a
// transient WA/LINE outage can't break the order workflow.
const { query, queryOne } = require("../lib/db");
const { sendWhatsApp } = require("../lib/whatsapp");
const { sendDeliveryFlex } = require("../lib/line");

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
            COALESCE(d.cust_code, '')::text as cust_code,
            COALESCE(d.telephone, '')::text as bill_phone,
            COALESCE(j.car, '')::text as car_code,
            COALESCE(j.driver, '')::text as driver_code,
            COALESCE(car.name_1, j.car, '')::text as car_name,
            COALESCE(drv.name_1, j.driver, '')::text as driver_name
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

  // Customer details (cast to text to dodge legacy date-parsing errors).
  let cust = { cust_name: "", cust_phone: "", cust_line_id: "" };
  if (base.cust_code) {
    try {
      const c = await queryOne(
        `SELECT COALESCE(name_1, '')::text as cust_name,
                COALESCE(telephone, '')::text as cust_phone,
                COALESCE(register_line_id, '')::text as cust_line_id
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
      `SELECT COALESCE(b.sale_code, '')::text as sale_code,
              COALESCE(u.name_1, '')::text as sale_name,
              COALESCE(u.line_id, '')::text as sale_line_id
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

async function notifyCustomerWhatsApp(billNo) {
  try {
    const ctx = await getBillContext(billNo);
    if (!ctx?.cust_phone) {
      console.warn("[notify] customer phone missing for bill", billNo);
      return;
    }
    const link = trackingLink(billNo);
    const lines = [
      "🚚 ODG Group ຈັດສົ່ງສິນຄ້າ",
      "",
      `ບິນ: ${billNo}`,
      ctx.cust_name ? `ລູກຄ້າ: ${ctx.cust_name}` : null,
      ctx.car_name ? `ລົດ: ${ctx.car_name}` : null,
      ctx.driver_name ? `ຄົນຂັບ: ${ctx.driver_name}` : null,
      "",
      "ຕິດຕາມການສົ່ງສິນຄ້າຂອງທ່ານທີ່:",
      link,
      "",
      "ຂອບໃຊ້ທີ່ໃຊ້ບໍລິການ 🙏",
    ].filter(Boolean);
    await sendWhatsApp(ctx.cust_phone, lines.join("\n"));
  } catch (err) {
    console.warn("[notify] customer WA failed:", err?.message ?? err);
  }
}

// Push the same Flex bubble used for sales staff to the customer's LINE OA
// (uses ar_customer.register_line_id — the userId saved when the customer
// added the OA as a friend). The customer flex includes the public tracking
// link so they can open the live map directly from chat.
async function notifyCustomerLine(billNo, statusLabel) {
  try {
    const ctx = await getBillContext(billNo);
    if (!ctx) return;
    const recipient = ctx.cust_line_id;
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

// Convenience: full job-created fan-out — one WA + one customer-LINE per
// customer plus one sales-LINE per bill. Driven by doc_no so callers don't
// need to enumerate bills first.
async function notifyJobCreated(docNo) {
  try {
    const bills = await query(
      `SELECT bill_no FROM public.odg_tms_detail WHERE doc_no = $1`,
      [docNo]
    );
    const label = "📋 ຖ້ຽວຈັດສົ່ງໄດ້ຖືກສ້າງ";
    for (const b of bills) {
      void notifyCustomerWhatsApp(b.bill_no);
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

module.exports = {
  notifyJobCreated,
  notifyBillStatus,
  notifyCustomerWhatsApp,
  notifyCustomerLine,
  notifySalesLine,
  trackingLink,
};

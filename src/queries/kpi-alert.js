const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter, getFixedTodayDate } = require("../lib/fixed-year");
const { addDays } = require("../lib/lao-date");
const { getSetting } = require("./settings");
const { sendLineText } = require("../lib/line");

function fmtMinutes(seconds) {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} ນາທີ`;
  return `${(m / 60).toFixed(1)} ຊມ`;
}

async function getYesterdayKpi() {
  const today = getFixedTodayDate();
  const row = await queryOne(
    `WITH delivered AS (
       SELECT
         d.sent_end::date AS delivered_date,
         EXTRACT(EPOCH FROM (d.sent_end - d.sent_start))::float8 AS delivery_seconds,
         CASE WHEN a.job_close IS NOT NULL
              THEN EXTRACT(EPOCH FROM (a.job_close - d.sent_end))::float8
         END AS close_seconds,
         CASE
           WHEN COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) IS NULL THEN NULL
           WHEN d.sent_end::date <= COALESCE(pb.scheduled_date::date, t.send_date::date, d.bill_date::date) THEN true
           ELSE false
         END AS is_on_time
       FROM public.odg_tms_detail d
       INNER JOIN public.odg_tms a ON a.doc_no = d.doc_no
       LEFT JOIN public.odg_tms_pending_bill pb ON pb.bill_no = d.bill_no
       LEFT JOIN ic_trans t ON t.doc_no = d.bill_no
       WHERE d.status = 1
         AND d.sent_end IS NOT NULL
         AND COALESCE(a.approve_status, 0) = 1
         AND d.sent_end::date = ($1::date - INTERVAL '1 day')
         AND ${getFixedYearSqlFilter("d.doc_date")}
     )
     SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE is_on_time = true)::int AS on_time,
       COUNT(*) FILTER (WHERE is_on_time = false)::int AS breach,
       AVG(delivery_seconds) AS avg_delivery,
       AVG(close_seconds) AS avg_close
     FROM delivered`,
    [today]
  );
  return {
    total: Number(row?.total ?? 0),
    on_time: Number(row?.on_time ?? 0),
    breach: Number(row?.breach ?? 0),
    avg_delivery_seconds: row?.avg_delivery == null ? null : Number(row.avg_delivery),
    avg_close_seconds: row?.avg_close == null ? null : Number(row.avg_close),
  };
}

// Compare yesterday's snapshot to targets; return list of breaches.
async function evaluateKpiAlerts() {
  const [enabled, lineTo, tgtRate, tgtDeliveryMin, tgtCloseMin] = await Promise.all([
    getSetting("kpi.alert_enabled", "0"),
    getSetting("kpi.alert_line_to", ""),
    getSetting("kpi.target_on_time_rate", ""),
    getSetting("kpi.target_avg_delivery_minutes", ""),
    getSetting("kpi.target_avg_close_minutes", ""),
  ]);
  const isEnabled = enabled === "1" || enabled === "true";
  const to = String(lineTo).trim();
  if (!isEnabled || !to) return { skipped: true, reason: !isEnabled ? "alert_disabled" : "no_recipient" };

  const kpi = await getYesterdayKpi();
  if (kpi.total === 0) return { skipped: true, reason: "no_deliveries" };

  const onTimeRate = kpi.total > 0 ? Math.round((kpi.on_time / kpi.total) * 100) : 0;
  const avgDeliveryMin = kpi.avg_delivery_seconds == null ? null : kpi.avg_delivery_seconds / 60;
  const avgCloseMin = kpi.avg_close_seconds == null ? null : kpi.avg_close_seconds / 60;
  const targets = {
    on_time_rate: tgtRate ? Number(tgtRate) : null,
    avg_delivery_minutes: tgtDeliveryMin ? Number(tgtDeliveryMin) : null,
    avg_close_minutes: tgtCloseMin ? Number(tgtCloseMin) : null,
  };

  const breaches = [];
  if (targets.on_time_rate != null && onTimeRate < targets.on_time_rate) {
    breaches.push(`• ສຳເລັດທັນເວລາ: ${onTimeRate}% (ເປົ້າ ${targets.on_time_rate}%)`);
  }
  if (
    targets.avg_delivery_minutes != null &&
    avgDeliveryMin != null &&
    avgDeliveryMin > targets.avg_delivery_minutes
  ) {
    breaches.push(`• ສະເລ່ຍເວລາສົ່ງ: ${fmtMinutes(kpi.avg_delivery_seconds)} (ເປົ້າ ≤ ${targets.avg_delivery_minutes} ນາທີ)`);
  }
  if (
    targets.avg_close_minutes != null &&
    avgCloseMin != null &&
    avgCloseMin > targets.avg_close_minutes
  ) {
    breaches.push(`• ສະເລ່ຍເວລາປິດຖ້ຽວ: ${fmtMinutes(kpi.avg_close_seconds)} (ເປົ້າ ≤ ${targets.avg_close_minutes} ນາທີ)`);
  }

  if (breaches.length === 0) return { skipped: true, reason: "all_targets_met", kpi };

  // addDays ຄິດດ້ວຍ UTC ລ້ວນໆ — new Date(`${today}T00:00:00`).toISOString()
  // ຢູ່ເຄື່ອງ +07 ຫຼຸດໄປ 1 ມື້ຢູ່ແລ້ວ ແລ້ວ -1 ອີກ ກາຍເປັນ 2 ມື້ກ່ອນ
  const dateStr = addDays(getFixedTodayDate(), -1);
  const message =
    `⚠️ KPI Alert · ${dateStr}\n` +
    `ສົ່ງສຳເລັດ ${kpi.total} ບິນ\n\n` +
    `ພາດເປົ້າ:\n${breaches.join("\n")}\n\n` +
    `ກວດເບິ່ງ Dashboard ສຳລັບລາຍລະອຽດ.`;

  try {
    await sendLineText(to, message);
    await query(
      `INSERT INTO public.odg_tms_kpi_alert_log (alert_date, recipient, message, kpi_json, sent_at)
       VALUES ($1::date, $2, $3, $4::jsonb, LOCALTIMESTAMP(0))`,
      [dateStr, to, message, JSON.stringify({ kpi, targets, breaches })]
    );
    return { sent: true, breaches, kpi };
  } catch (err) {
    console.error("[kpi-alert] send failed:", err?.message ?? err);
    return { sent: false, error: String(err?.message ?? err), breaches, kpi };
  }
}

async function ensureKpiAlertSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS public.odg_tms_kpi_alert_log (
       id bigserial PRIMARY KEY,
       alert_date date NOT NULL,
       recipient character varying NOT NULL,
       message text,
       kpi_json jsonb,
       sent_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
     )`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_kpi_alert_log_date ON public.odg_tms_kpi_alert_log (alert_date DESC)`
  );
}

module.exports = { evaluateKpiAlerts, ensureKpiAlertSchema, getYesterdayKpi };

// Delivery calendar (ປະຕິທິນຈັດສົ່ງ) — month grid that shows, for every day:
//   - planned  (ວາງແຜນ): bills scheduled to be delivered that day, taken from
//                odg_tms_pending_bill.scheduled_date together with their assigned
//                route (ສາຍ / delivery_route_code) and round (ຮອບ / delivery_round_code).
//   - delivered (ສຳເລັດ): bills actually completed that day, taken from
//                odg_tms_detail.sent_end where status = 1, with the route/round
//                coming from the trip (odg_tms) the bill rode on.
//
// Branch scope is intentionally NOT applied — the calendar always shows every
// branch combined so dispatchers get the whole-company picture.
const { query } = require("../lib/db");
const { listDeliveryRounds } = require("./delivery-round");
const { listDeliveryRoutes } = require("./delivery-route");
const { ensurePendingBillSchema } = require("./pending-bill");

const NO_ROUND = "__none__";
const NO_ROUTE = "__none__";

// "YYYY-MM" -> { start: "YYYY-MM-01", next: first day of the following month }.
function monthBounds(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ""));
  const now = new Date();
  const year = match ? Number.parseInt(match[1], 10) : now.getFullYear();
  const mon = match ? Number.parseInt(match[2], 10) : now.getMonth() + 1;
  const pad = (n) => String(n).padStart(2, "0");
  const start = `${year}-${pad(mon)}-01`;
  const next =
    mon === 12 ? `${year + 1}-01-01` : `${year}-${pad(mon + 1)}-01`;
  return { start, next, label: `${year}-${pad(mon)}` };
}

// Sum a list of grouped rows ({date, round_code, route_code, bills}) into a
// per-day structure with round/route breakdowns. Bills counted here can double
// up across rounds for the rare bill split over two trips the same day, so the
// authoritative day total comes from the separate *_total query.
function foldGrouped(rows) {
  const byDay = new Map();
  for (const r of rows) {
    const date = r.date;
    if (!byDay.has(date)) {
      byDay.set(date, { rounds: new Map(), routes: new Map() });
    }
    const bucket = byDay.get(date);
    const bills = Number(r.bills) || 0;
    const roundCode = r.round_code || NO_ROUND;
    const routeCode = r.route_code || NO_ROUTE;
    bucket.rounds.set(roundCode, (bucket.rounds.get(roundCode) || 0) + bills);
    bucket.routes.set(routeCode, (bucket.routes.get(routeCode) || 0) + bills);
  }
  return byDay;
}

function nameRounds(map, roundMap) {
  return Array.from(map.entries())
    .map(([code, bills]) => {
      const meta = code === NO_ROUND ? null : roundMap.get(code);
      return {
        code: code === NO_ROUND ? null : code,
        name: meta ? meta.name : "ບໍ່ກຳນົດຮອບ",
        time_label: meta ? meta.time_label || "" : "",
        sort_order: meta ? Number(meta.sort_order) || 0 : 9999,
        bills,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function nameRoutes(map, routeMap) {
  return Array.from(map.entries())
    .map(([code, bills]) => {
      const meta = code === NO_ROUTE ? null : routeMap.get(code);
      return {
        code: code === NO_ROUTE ? null : code,
        name: meta ? meta.name : "ບໍ່ກຳນົດສາຍ",
        sort_order: meta ? Number(meta.sort_order) || 0 : 9999,
        bills,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

async function getDeliveryCalendar(month) {
  const { start, next, label } = monthBounds(month);
  await ensurePendingBillSchema();
  const [rounds, routes] = await Promise.all([
    listDeliveryRounds(),
    listDeliveryRoutes(),
  ]);
  const roundMap = new Map(rounds.map((r) => [r.code, r]));
  const routeMap = new Map(routes.map((r) => [r.code, r]));

  const [plannedGrouped, plannedTotal, deliveredGrouped, deliveredTotal] =
    await Promise.all([
      // Planned per (day, round, route). Each pending bill carries exactly one
      // route + round, so these groups partition the day's bills cleanly.
      query(
        `SELECT to_char(pb.scheduled_date,'YYYY-MM-DD') AS date,
                pb.delivery_round_code AS round_code,
                pb.delivery_route_code AS route_code,
                COUNT(DISTINCT pb.bill_no)::int AS bills
         FROM public.odg_tms_pending_bill pb
         WHERE pb.scheduled_date >= $1::date AND pb.scheduled_date < $2::date
         GROUP BY pb.scheduled_date, pb.delivery_round_code, pb.delivery_route_code`,
        [start, next]
      ),
      query(
        `SELECT to_char(pb.scheduled_date,'YYYY-MM-DD') AS date,
                COUNT(DISTINCT pb.bill_no)::int AS bills
         FROM public.odg_tms_pending_bill pb
         WHERE pb.scheduled_date >= $1::date AND pb.scheduled_date < $2::date
         GROUP BY pb.scheduled_date`,
        [start, next]
      ),
      // Delivered per (day, round, route). Route/round live on the trip the
      // bill was delivered on (odg_tms), not the pending row.
      query(
        `SELECT to_char(d.sent_end::date,'YYYY-MM-DD') AS date,
                j.delivery_round_code AS round_code,
                j.delivery_route_code AS route_code,
                COUNT(DISTINCT d.bill_no)::int AS bills
         FROM public.odg_tms_detail d
         LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
         WHERE COALESCE(d.status,0) = 1
           AND d.sent_end IS NOT NULL
           AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
         GROUP BY d.sent_end::date, j.delivery_round_code, j.delivery_route_code`,
        [start, next]
      ),
      query(
        `SELECT to_char(d.sent_end::date,'YYYY-MM-DD') AS date,
                COUNT(DISTINCT d.bill_no)::int AS bills
         FROM public.odg_tms_detail d
         WHERE COALESCE(d.status,0) = 1
           AND d.sent_end IS NOT NULL
           AND d.sent_end >= $1::timestamp AND d.sent_end < $2::timestamp
         GROUP BY d.sent_end::date`,
        [start, next]
      ),
    ]);

  const plannedByDay = foldGrouped(plannedGrouped);
  const deliveredByDay = foldGrouped(deliveredGrouped);
  const plannedTotalByDay = new Map(
    plannedTotal.map((r) => [r.date, Number(r.bills) || 0])
  );
  const deliveredTotalByDay = new Map(
    deliveredTotal.map((r) => [r.date, Number(r.bills) || 0])
  );

  const dates = new Set([
    ...plannedTotalByDay.keys(),
    ...deliveredTotalByDay.keys(),
  ]);

  const days = Array.from(dates)
    .sort()
    .map((date) => {
      const p = plannedByDay.get(date) || { rounds: new Map(), routes: new Map() };
      const d = deliveredByDay.get(date) || { rounds: new Map(), routes: new Map() };
      return {
        date,
        planned_bills: plannedTotalByDay.get(date) || 0,
        delivered_bills: deliveredTotalByDay.get(date) || 0,
        planned_rounds: nameRounds(p.rounds, roundMap),
        delivered_rounds: nameRounds(d.rounds, roundMap),
        planned_routes: nameRoutes(p.routes, routeMap),
        delivered_routes: nameRoutes(d.routes, routeMap),
      };
    });

  const summary = days.reduce(
    (acc, day) => {
      acc.planned_bills += day.planned_bills;
      acc.delivered_bills += day.delivered_bills;
      if (day.planned_bills > 0 || day.delivered_bills > 0) acc.active_days += 1;
      return acc;
    },
    { planned_bills: 0, delivered_bills: 0, active_days: 0 }
  );

  return { month: label, days, summary };
}

const ACTION_STATUS_LABELS = {
  sales_not_notified: "ຂາຍຍັງບໍ່ແຈ້ງ",
  contact_failed: "ຕິດຕໍ່ບໍ່ໄດ້",
  customer_postponed: "ລູກຄ້າເລື່ອນ",
  customer_cancelled: "ລູກຄ້າຍົກເລີກ",
  contacted_ready: "ພ້ອມຮັບ",
  delivery_scheduled: "ຕາຕະລາງຈັດສົ່ງ",
};

// Per-day drill-down: the individual planned + delivered bills for one date,
// with route/round names attached so the UI can group them by ຮອບ / ສາຍ.
async function getDeliveryCalendarDay(date) {
  const clean = String(date ?? "").slice(0, 10);
  await ensurePendingBillSchema();
  const [rounds, routes] = await Promise.all([
    listDeliveryRounds(),
    listDeliveryRoutes(),
  ]);
  const roundMap = new Map(rounds.map((r) => [r.code, r]));
  const routeMap = new Map(routes.map((r) => [r.code, r]));
  const roundName = (c) => (c && roundMap.get(c)?.name) || (c ? c : "ບໍ່ກຳນົດຮອບ");
  const routeName = (c) => (c && routeMap.get(c)?.name) || (c ? c : "ບໍ່ກຳນົດສາຍ");

  const [plannedRows, deliveredRows] = await Promise.all([
    query(
      `SELECT pb.bill_no,
              pb.delivery_round_code AS round_code,
              pb.delivery_route_code AS route_code,
              COALESCE(pb.action_status, '') AS action_status,
              COALESCE(pb.remark, '') AS remark,
              COALESCE(NULLIF(TRIM(cust.name_1), ''), pb.bill_no) AS customer
       FROM public.odg_tms_pending_bill pb
       LEFT JOIN public.ic_trans_shipment s ON s.doc_no = pb.bill_no
       LEFT JOIN public.ar_customer cust ON cust.code = s.cust_code
       WHERE pb.scheduled_date = $1::date
       ORDER BY pb.delivery_round_code NULLS LAST, pb.delivery_route_code NULLS LAST, pb.bill_no`,
      [clean]
    ),
    query(
      `SELECT d.bill_no,
              d.doc_no,
              j.delivery_round_code AS round_code,
              j.delivery_route_code AS route_code,
              to_char(d.sent_end,'HH24:MI') AS sent_time,
              COALESCE(NULLIF(TRIM(cust.name_1), ''), d.cust_code, d.bill_no) AS customer,
              COALESCE(NULLIF(TRIM(carT.name_1::text), ''), d.car, '') AS car,
              COALESCE(NULLIF(TRIM(drvT.name_1::text), ''), j.driver, '') AS driver,
              COALESCE(NULLIF(TRIM(d.count_item::text), ''), '0')::int AS item_count
       FROM public.odg_tms_detail d
       LEFT JOIN public.odg_tms j ON j.doc_no = d.doc_no
       LEFT JOIN public.ar_customer cust ON cust.code = d.cust_code
       LEFT JOIN public.odg_tms_car carT ON carT.code = d.car
       LEFT JOIN public.odg_tms_driver drvT ON drvT.code = j.driver
       WHERE COALESCE(d.status,0) = 1
         AND d.sent_end IS NOT NULL
         AND d.sent_end::date = $1::date
       ORDER BY d.sent_end, d.bill_no`,
      [clean]
    ),
  ]);

  const planned = plannedRows.map((r) => ({
    bill_no: r.bill_no,
    round_code: r.round_code || null,
    round_name: roundName(r.round_code),
    route_code: r.route_code || null,
    route_name: routeName(r.route_code),
    action_status: r.action_status || "",
    action_label: ACTION_STATUS_LABELS[r.action_status] || "",
    remark: r.remark || "",
    customer: r.customer || r.bill_no,
  }));

  const delivered = deliveredRows.map((r) => ({
    bill_no: r.bill_no,
    doc_no: r.doc_no,
    round_code: r.round_code || null,
    round_name: roundName(r.round_code),
    route_code: r.route_code || null,
    route_name: routeName(r.route_code),
    sent_time: r.sent_time || "",
    customer: r.customer || r.bill_no,
    car: r.car || "",
    driver: r.driver || "",
    item_count: Number(r.item_count) || 0,
  }));

  return { date: clean, planned, delivered };
}

module.exports = { getDeliveryCalendar, getDeliveryCalendarDay };

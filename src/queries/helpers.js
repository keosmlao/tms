const { query, queryOne } = require("../lib/db");
const { ensureDeliveryWorkflowSchema } = require("./delivery");
const {
  coerceDateToFixedYear,
  getFixedTodayDate,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");

const ensureCache = globalThis;

// Swallow the benign "duplicate key value violates unique constraint
// pg_class_relname_nsp_index" that Postgres throws when two sessions race
// through `CREATE INDEX IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
// for the same name.
async function safeDdl(sql) {
  try {
    await query(sql);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (
      err?.code === "23505" ||
      msg.includes("pg_class_relname_nsp_index") ||
      msg.includes("pg_type_typname_nsp_index") ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw err;
  }
}

// Wraps an `ensure*` function so concurrent callers share a single in-flight
// promise — the DDL runs exactly once per process.
function once(fn) {
  let promise = null;
  return () => {
    if (!promise) {
      promise = fn().catch((err) => {
        promise = null;
        throw err;
      });
    }
    return promise;
  };
}

function formatInterval(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return `${value}s`;
  if (typeof value !== "object") return String(value);
  const interval = value;
  const parts = [
    Math.trunc(interval.days ?? 0) > 0 ? `${Math.trunc(interval.days)}d` : null,
    Math.trunc(interval.hours ?? 0) > 0 ? `${Math.trunc(interval.hours)}h` : null,
    Math.trunc(interval.minutes ?? 0) > 0 ? `${Math.trunc(interval.minutes)}m` : null,
    `${Math.trunc(interval.seconds ?? 0)}s`,
  ].filter(Boolean);
  return parts.join(" ") || "0s";
}

function getNextMonthStart(monthValue) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function toDisplayDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function toDisplayMonth(value) {
  const [year, month] = value.split("-");
  return `${month}-${year}`;
}

// "ສົ່ງຕໍ່ສາຂາ" feature
const ensureForwardBranchColumn = once(async () => {
  await safeDdl(`
    ALTER TABLE public.odg_tms_detail
    ADD COLUMN IF NOT EXISTS forward_transport_code character varying
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_detail_forward
    ON public.odg_tms_detail (forward_transport_code)
    WHERE forward_transport_code IS NOT NULL
  `);
  await safeDdl(`
    ALTER TABLE public.odg_tms
    ADD COLUMN IF NOT EXISTS origin_transport_code character varying
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_origin_transport
    ON public.odg_tms (origin_transport_code)
    WHERE origin_transport_code IS NOT NULL
  `);
});

const ensureJobListIndexes = once(async () => {
  await ensureForwardBranchColumn();
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_detail_doc_date_doc_no
    ON public.odg_tms_detail (doc_date, doc_no)
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_detail_doc_no
    ON public.odg_tms_detail (doc_no)
  `);
  await safeDdl(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_doc_date_status
    ON public.odg_tms (doc_date, approve_status, job_status)
  `);
});

async function ensureTmsWorkerTable() {
  if (ensureCache.__tmsEnsureCache?.workerTable) return;
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_worker (
      roworder BIGSERIAL PRIMARY KEY,
      doc_no character varying NOT NULL,
      doc_date date NOT NULL,
      worker_code character varying NOT NULL,
      worker_name character varying NOT NULL,
      user_create character varying,
      create_date_time_now timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      CONSTRAINT odg_tms_worker_doc_worker_unique UNIQUE (doc_no, worker_code)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_worker_doc_no
    ON public.odg_tms_worker (doc_no)
  `);
  ensureCache.__tmsEnsureCache = {
    ...ensureCache.__tmsEnsureCache,
    workerTable: true,
  };
}

async function ensurePendingJobListIndex() {
  if (ensureCache.__tmsEnsureCache?.pendingJobListIndex) return;
  await query(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_pending_jobs_user_doc
    ON public.odg_tms (user_created, doc_no DESC)
    WHERE approve_status = 0 OR approve_status IS NULL
  `);
  ensureCache.__tmsEnsureCache = {
    ...ensureCache.__tmsEnsureCache,
    pendingJobListIndex: true,
  };
}

const ensureTmsDetailItemTable = once(async () => {
  await ensureDeliveryWorkflowSchema();
  ensureCache.__tmsEnsureCache = {
    ...ensureCache.__tmsEnsureCache,
    detailItemTable: true,
  };
});

async function getRemainingBillProducts(billNo) {
  await ensureTmsDetailItemTable();
  const rows = await query(
    `WITH dispatch_state AS (
      SELECT
        EXISTS(SELECT 1 FROM public.odg_tms_detail_item WHERE bill_no = $1) AS has_detail_item,
        EXISTS(SELECT 1 FROM public.odg_tms_detail WHERE bill_no = $1) AS has_detail
    ),
    assigned AS (
      SELECT item_code, COALESCE(SUM(selected_qty), 0)::numeric AS selected_qty
      FROM public.odg_tms_detail_item
      WHERE bill_no = $1
      GROUP BY item_code
    )
    SELECT
      d.item_code,
      d.item_name,
      CASE
        WHEN state.has_detail_item THEN GREATEST(
          COALESCE(d.qty, 0)::numeric - COALESCE(assigned.selected_qty, 0)::numeric, 0
        )::numeric
        WHEN state.has_detail THEN 0::numeric
        ELSE COALESCE(d.qty, 0)::numeric
      END AS qty,
      d.unit_code
    FROM ic_trans_detail d
    CROSS JOIN dispatch_state state
    LEFT JOIN assigned ON assigned.item_code = d.item_code
    WHERE d.doc_no = $1
      AND d.item_code NOT LIKE '97%'
      AND CASE
        WHEN state.has_detail_item THEN GREATEST(
          COALESCE(d.qty, 0)::numeric - COALESCE(assigned.selected_qty, 0)::numeric, 0
        )::numeric
        WHEN state.has_detail THEN 0::numeric
        ELSE COALESCE(d.qty, 0)::numeric
      END > 0
    ORDER BY d.item_code`,
    [billNo]
  );

  return rows.map((row) => ({
    item_code: row.item_code,
    item_name: row.item_name,
    qty: Number(row.qty ?? 0),
    unit_code: row.unit_code,
  }));
}

async function getRemainingSummaryMap(billNos) {
  await ensureTmsDetailItemTable();
  if (billNos.length === 0) return new Map();

  const [detailRows, detailItemRows, totalRows, partialRows] = await Promise.all([
    query(
      `SELECT bill_no FROM public.odg_tms_detail WHERE bill_no = ANY($1::varchar[]) GROUP BY bill_no`,
      [billNos]
    ),
    query(
      `SELECT bill_no FROM public.odg_tms_detail_item WHERE bill_no = ANY($1::varchar[]) GROUP BY bill_no`,
      [billNos]
    ),
    query(
      `SELECT doc_no as bill_no, COUNT(*)::int AS remaining_count,
        COALESCE(SUM(COALESCE(qty, 0)::numeric), 0)::numeric AS remaining_qty_total
       FROM ic_trans_detail
       WHERE doc_no = ANY($1::varchar[]) AND item_code NOT LIKE '97%'
       GROUP BY doc_no`,
      [billNos]
    ),
    query(
      `WITH item_bills AS (
          SELECT DISTINCT bill_no FROM public.odg_tms_detail_item WHERE bill_no = ANY($1::varchar[])
        ),
        assigned AS (
          SELECT bill_no, item_code, COALESCE(SUM(selected_qty), 0)::numeric AS selected_qty
          FROM public.odg_tms_detail_item
          WHERE bill_no = ANY($1::varchar[])
          GROUP BY bill_no, item_code
        )
       SELECT d.doc_no AS bill_no,
         COUNT(*) FILTER (
           WHERE GREATEST(COALESCE(d.qty, 0)::numeric - COALESCE(a.selected_qty, 0)::numeric, 0) > 0
         )::int AS remaining_count,
         COALESCE(
           SUM(GREATEST(COALESCE(d.qty, 0)::numeric - COALESCE(a.selected_qty, 0)::numeric, 0)), 0
         )::numeric AS remaining_qty_total
       FROM ic_trans_detail d
       JOIN item_bills ib ON ib.bill_no = d.doc_no
       LEFT JOIN assigned a ON a.bill_no = d.doc_no AND a.item_code = d.item_code
       WHERE d.item_code NOT LIKE '97%'
       GROUP BY d.doc_no`,
      [billNos]
    ),
  ]);

  const detailBills = new Set(detailRows.map((row) => row.bill_no));
  const detailItemBills = new Set(detailItemRows.map((row) => row.bill_no));
  const totalByBill = new Map(
    totalRows.map((row) => [
      row.bill_no,
      {
        remaining_count: Number(row.remaining_count ?? 0),
        remaining_qty_total: Number(row.remaining_qty_total ?? 0),
      },
    ])
  );
  const partialByBill = new Map(
    partialRows.map((row) => [
      row.bill_no,
      {
        remaining_count: Number(row.remaining_count ?? 0),
        remaining_qty_total: Number(row.remaining_qty_total ?? 0),
      },
    ])
  );

  const result = new Map();
  for (const billNo of billNos) {
    const fallbackTotals = totalByBill.get(billNo) ?? {
      remaining_count: 0,
      remaining_qty_total: 0,
    };
    const summary = detailItemBills.has(billNo)
      ? partialByBill.get(billNo) ?? { remaining_count: 0, remaining_qty_total: 0 }
      : detailBills.has(billNo)
      ? { remaining_count: 0, remaining_qty_total: 0 }
      : fallbackTotals;
    result.set(billNo, summary);
  }
  return result;
}

function getBranchScope(session) {
  const branch = session?.logistic_code?.trim() ?? "";
  const scoped = !!branch && branch !== "02-0004";
  return { scoped, branch, branchOrNull: scoped ? branch : null };
}

function branchFilterShipment(scope, alias = "") {
  if (!scope.scoped) return "";
  const prefix = alias ? `${alias}.` : "";
  return `AND ${prefix}transport_code = '${scope.branch}'`;
}

function branchFilterJob(scope, jobAlias) {
  if (!scope.scoped) return "";
  return `AND (
    ${jobAlias}.origin_transport_code = '${scope.branch}'
    OR (
      ${jobAlias}.origin_transport_code IS NULL
      AND EXISTS (
        SELECT 1 FROM public.odg_tms_detail __dd
        JOIN public.ic_trans_shipment __ss ON __ss.doc_no = __dd.bill_no
        WHERE __dd.doc_no = ${jobAlias}.doc_no
          AND __ss.transport_code = '${scope.branch}'
      )
    )
  )`;
}

module.exports = {
  safeDdl,
  once,
  formatInterval,
  getNextMonthStart,
  toDisplayDate,
  toDisplayMonth,
  ensureForwardBranchColumn,
  ensureJobListIndexes,
  ensureTmsWorkerTable,
  ensurePendingJobListIndex,
  ensureTmsDetailItemTable,
  getRemainingBillProducts,
  getRemainingSummaryMap,
  getBranchScope,
  branchFilterShipment,
  branchFilterJob,
};

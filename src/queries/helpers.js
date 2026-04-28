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
  // Items become "available for re-dispatch" once the prior delivery attempt
  // is finished (status=1 done, status=2 cancelled). Active attempts
  // (status NULL/0/3) lock their selected_qty so the same items can't get
  // dispatched twice in parallel.
  // ic_trans_detail can have multiple rows per item_code, so we aggregate
  // first to avoid duplicate rows in the result.
  const rows = await query(
    `WITH bill_items AS (
      SELECT
        d.item_code,
        MAX(d.item_name) AS item_name,
        SUM(COALESCE(d.qty, 0))::numeric AS total_qty,
        MAX(d.unit_code) AS unit_code
      FROM ic_trans_detail d
      WHERE d.doc_no = $1 AND d.item_code NOT LIKE '97%'
      GROUP BY d.item_code
    ),
    active_locked AS (
      SELECT item.item_code,
             COALESCE(SUM(item.selected_qty), 0)::numeric AS locked_qty
      FROM public.odg_tms_detail_item item
      INNER JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE item.bill_no = $1
        AND COALESCE(det.status, 0) NOT IN (1, 2)
      GROUP BY item.item_code
    ),
    delivered AS (
      -- Drivers sometimes mark a job done (status=1) without filling
      -- per-item delivered_qty. Treat that data gap as "fully delivered up
      -- to the selected_qty" so the bill stops re-appearing in the pending
      -- list. Cancelled rows (status=2) keep the actual delivered_qty
      -- (typically 0).
      SELECT item.item_code,
             COALESCE(SUM(
               CASE
                 WHEN COALESCE(det.status, 0) = 1
                  AND COALESCE(item.delivered_qty, 0) = 0
                   THEN COALESCE(item.selected_qty, 0)
                 ELSE COALESCE(item.delivered_qty, 0)
               END
             ), 0)::numeric AS delivered_qty
      FROM public.odg_tms_detail_item item
      INNER JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE item.bill_no = $1
        AND COALESCE(det.status, 0) IN (1, 2)
      GROUP BY item.item_code
    )
    SELECT
      bi.item_code,
      bi.item_name,
      GREATEST(
        bi.total_qty
        - COALESCE(al.locked_qty, 0)
        - COALESCE(dl.delivered_qty, 0),
        0
      )::numeric AS qty,
      bi.unit_code
    FROM bill_items bi
    LEFT JOIN active_locked al ON al.item_code = bi.item_code
    LEFT JOIN delivered dl ON dl.item_code = bi.item_code
    WHERE GREATEST(
      bi.total_qty
      - COALESCE(al.locked_qty, 0)
      - COALESCE(dl.delivered_qty, 0),
      0
    ) > 0
    ORDER BY bi.item_code`,
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

  // Active attempts lock the items (selected_qty), finished attempts only
  // consume what was actually delivered (delivered_qty). The remainder is
  // available again for re-dispatch — covers cancelled bills and partials.
  // ic_trans_detail can have multiple rows per item_code, so we aggregate
  // first.
  const rows = await query(
    `WITH bill_items AS (
      SELECT
        d.doc_no AS bill_no,
        d.item_code,
        SUM(COALESCE(d.qty, 0))::numeric AS total_qty
      FROM ic_trans_detail d
      WHERE d.doc_no = ANY($1::varchar[]) AND d.item_code NOT LIKE '97%'
      GROUP BY d.doc_no, d.item_code
    ),
    active_locked AS (
      SELECT item.bill_no, item.item_code,
             COALESCE(SUM(item.selected_qty), 0)::numeric AS locked_qty
      FROM public.odg_tms_detail_item item
      INNER JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE item.bill_no = ANY($1::varchar[])
        AND COALESCE(det.status, 0) NOT IN (1, 2)
      GROUP BY item.bill_no, item.item_code
    ),
    delivered AS (
      -- See note above: when a row is marked done (status=1) but the
      -- driver never filled in delivered_qty, treat the selected_qty as
      -- delivered so the bill drops out of the pending list.
      SELECT item.bill_no, item.item_code,
             COALESCE(SUM(
               CASE
                 WHEN COALESCE(det.status, 0) = 1
                  AND COALESCE(item.delivered_qty, 0) = 0
                   THEN COALESCE(item.selected_qty, 0)
                 ELSE COALESCE(item.delivered_qty, 0)
               END
             ), 0)::numeric AS delivered_qty
      FROM public.odg_tms_detail_item item
      INNER JOIN public.odg_tms_detail det
        ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
      WHERE item.bill_no = ANY($1::varchar[])
        AND COALESCE(det.status, 0) IN (1, 2)
      GROUP BY item.bill_no, item.item_code
    )
    SELECT
      bi.bill_no,
      COUNT(*) FILTER (
        WHERE GREATEST(
          bi.total_qty
          - COALESCE(al.locked_qty, 0)
          - COALESCE(dl.delivered_qty, 0),
          0
        ) > 0
      )::int AS remaining_count,
      COALESCE(
        SUM(GREATEST(
          bi.total_qty
          - COALESCE(al.locked_qty, 0)
          - COALESCE(dl.delivered_qty, 0),
          0
        )), 0
      )::numeric AS remaining_qty_total
    FROM bill_items bi
    LEFT JOIN active_locked al
      ON al.bill_no = bi.bill_no AND al.item_code = bi.item_code
    LEFT JOIN delivered dl
      ON dl.bill_no = bi.bill_no AND dl.item_code = bi.item_code
    GROUP BY bi.bill_no`,
    [billNos]
  );

  const result = new Map();
  for (const billNo of billNos) {
    result.set(billNo, { remaining_count: 0, remaining_qty_total: 0 });
  }
  for (const row of rows) {
    result.set(row.bill_no, {
      remaining_count: Number(row.remaining_count ?? 0),
      remaining_qty_total: Number(row.remaining_qty_total ?? 0),
    });
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

const { pool } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");

const deliveryCache = globalThis;

async function safeDdl(db, sql) {
  try {
    await db.query(sql);
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

async function runQuery(client, text, params = []) {
  const result = await client.query(text, [...params]);
  return result.rows;
}

async function runQueryOne(client, text, params = []) {
  const rows = await runQuery(client, text, params);
  return rows[0] ?? null;
}

async function ensureDeliveryWorkflowSchemaInternal(db) {
  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_detail_item (
      roworder BIGSERIAL PRIMARY KEY,
      doc_no character varying NOT NULL,
      bill_no character varying NOT NULL,
      item_code character varying NOT NULL,
      item_name character varying,
      qty numeric DEFAULT 0,
      selected_qty numeric DEFAULT 0,
      delivered_qty numeric DEFAULT 0,
      unit_code character varying,
      create_date_time_now timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms_detail_item
    ADD COLUMN IF NOT EXISTS delivered_qty numeric DEFAULT 0
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_detail_item_bill_item
    ON public.odg_tms_detail_item (bill_no, item_code)
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_detail_item_doc_no
    ON public.odg_tms_detail_item (doc_no)
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms
    ADD COLUMN IF NOT EXISTS admin_close_at timestamp without time zone
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms
    ADD COLUMN IF NOT EXISTS admin_close_user character varying
  `);

  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_travel_history (
      roworder BIGSERIAL PRIMARY KEY,
      doc_no character varying NOT NULL,
      doc_date date NOT NULL,
      lat character varying NOT NULL,
      lng character varying NOT NULL,
      recorded_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_travel_history_doc_no
    ON public.odg_tms_travel_history (doc_no)
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_travel_history_doc_date
    ON public.odg_tms_travel_history (doc_date)
  `);

  await safeDdl(db, `
    ALTER TABLE public.odg_tms
    ADD COLUMN IF NOT EXISTS lat_start character varying
  `);
  await safeDdl(db, `
    ALTER TABLE public.odg_tms
    ADD COLUMN IF NOT EXISTS lng_start character varying
  `);

  await safeDdl(db, `
    CREATE TABLE IF NOT EXISTS public.odg_tms_delivery_images (
      roworder BIGSERIAL PRIMARY KEY,
      bill_no character varying NOT NULL,
      doc_date date NOT NULL,
      image_data text NOT NULL,
      created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await safeDdl(db, `
    CREATE INDEX IF NOT EXISTS idx_odg_tms_delivery_images_bill_no
    ON public.odg_tms_delivery_images (bill_no)
  `);
}

async function ensureDeliveryWorkflowSchema(client) {
  // Schema is process-global — once any caller has applied the DDL in this
  // process, every subsequent call (pool or transaction) is a no-op. Without
  // this short-circuit each mobile API request was re-running ~10 DDL
  // statements, which can stall under concurrent load while ALTER TABLE waits
  // for an ACCESS EXCLUSIVE lock.
  if (deliveryCache.__tmsDeliverySchemaReady) return;

  const isSharedPool = !client || client === pool;
  if (!isSharedPool) {
    await ensureDeliveryWorkflowSchemaInternal(client);
    deliveryCache.__tmsDeliverySchemaReady = true;
    return;
  }

  if (!deliveryCache.__tmsDeliverySchemaPromise) {
    deliveryCache.__tmsDeliverySchemaPromise = ensureDeliveryWorkflowSchemaInternal(pool)
      .then(() => {
        deliveryCache.__tmsDeliverySchemaReady = true;
      })
      .catch((err) => {
        deliveryCache.__tmsDeliverySchemaPromise = null;
        throw err;
      });
  }
  await deliveryCache.__tmsDeliverySchemaPromise;
}

async function ensureJobDeliveryItems(docNo, client) {
  const db = client ?? pool;
  await ensureDeliveryWorkflowSchema(db);

  await db.query(
    `INSERT INTO public.odg_tms_detail_item(
      doc_no,
      bill_no,
      item_code,
      item_name,
      qty,
      selected_qty,
      delivered_qty,
      unit_code
    )
    SELECT
      d.doc_no,
      d.bill_no,
      t.item_code,
      t.item_name,
      COALESCE(t.qty, 0)::numeric,
      COALESCE(t.qty, 0)::numeric,
      0::numeric,
      t.unit_code
    FROM public.odg_tms_detail d
    INNER JOIN ic_trans_detail t ON t.doc_no = d.bill_no
    WHERE d.doc_no = $1
      AND ${getFixedYearSqlFilter("d.doc_date")}
      AND t.item_code NOT LIKE '97%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.odg_tms_detail_item i
        WHERE i.doc_no = d.doc_no AND i.bill_no = d.bill_no
      )
    ORDER BY d.bill_no, t.item_code`,
    [docNo]
  );
}

async function ensureBillDeliveryItems(billNo, client) {
  const db = client ?? pool;
  await ensureDeliveryWorkflowSchema(db);

  const bill = await runQueryOne(
    db,
    `SELECT doc_no
     FROM public.odg_tms_detail
     WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}
     LIMIT 1`,
    [billNo]
  );

  if (!bill?.doc_no) return;
  await ensureJobDeliveryItems(bill.doc_no, db);
}

async function getBillDeliveryItemSummary(billNo, client) {
  const db = client ?? pool;
  await ensureBillDeliveryItems(billNo, db);

  return runQueryOne(
    db,
    `SELECT
      COUNT(*)::int AS total_item_count,
      COUNT(*) FILTER (
        WHERE COALESCE(delivered_qty, 0)::numeric > 0
      )::int AS delivered_item_count,
      COUNT(*) FILTER (
        WHERE GREATEST(COALESCE(selected_qty, 0)::numeric - COALESCE(delivered_qty, 0)::numeric, 0) > 0
      )::int AS remaining_item_count,
      COALESCE(SUM(COALESCE(selected_qty, 0)::numeric), 0)::numeric AS selected_qty_total,
      COALESCE(SUM(COALESCE(delivered_qty, 0)::numeric), 0)::numeric AS delivered_qty_total,
      COALESCE(
        SUM(GREATEST(COALESCE(selected_qty, 0)::numeric - COALESCE(delivered_qty, 0)::numeric, 0)),
        0
      )::numeric AS remaining_qty_total
    FROM public.odg_tms_detail_item
    WHERE bill_no = $1`,
    [billNo]
  );
}

async function getOpenBillCount(docNo, client) {
  const db = client ?? pool;
  const row = await runQueryOne(
    db,
    `SELECT COUNT(*)::int AS open_bill_count
     FROM public.odg_tms_detail
     WHERE doc_no = $1
       AND ${getFixedYearSqlFilter("doc_date")}
       AND COALESCE(status, 0) NOT IN (1, 2)`,
    [docNo]
  );
  return Number(row?.open_bill_count ?? 0);
}

async function getBillDeliveryItems(params, client) {
  const db = client ?? pool;

  if (params.docNo) await ensureJobDeliveryItems(params.docNo, db);
  if (params.billNo) await ensureBillDeliveryItems(params.billNo, db);

  const where =
    params.docNo && params.billNo
      ? "i.doc_no = $1 AND i.bill_no = $2"
      : params.docNo
      ? "i.doc_no = $1"
      : "i.bill_no = $1";
  const values =
    params.docNo && params.billNo
      ? [params.docNo, params.billNo]
      : [params.docNo ?? params.billNo];

  return runQuery(
    db,
    `SELECT
      i.doc_no,
      i.bill_no,
      i.item_code,
      i.item_name,
      GREATEST(COALESCE(i.selected_qty, 0)::numeric - COALESCE(i.delivered_qty, 0)::numeric, 0)::numeric AS qty,
      COALESCE(i.selected_qty, 0)::numeric AS selected_qty,
      COALESCE(i.delivered_qty, 0)::numeric AS delivered_qty,
      GREATEST(COALESCE(i.selected_qty, 0)::numeric - COALESCE(i.delivered_qty, 0)::numeric, 0)::numeric AS remaining_qty,
      i.unit_code,
      COALESCE(w.name_1, '') AS wh_code
    FROM public.odg_tms_detail_item i
    LEFT JOIN ic_trans_detail t
      ON t.doc_no = i.bill_no
     AND t.item_code = i.item_code
    LEFT JOIN public.ic_warehouse w ON w.code = t.wh_code
    WHERE ${where}
    ORDER BY i.bill_no, i.item_code`,
    values
  );
}

async function getBillPhaseSummary(docNo, client) {
  const db = client ?? pool;
  await ensureJobDeliveryItems(docNo, db);

  return runQuery(
    db,
    `SELECT
      bill_no,
      COUNT(*)::int AS total_item_count,
      COUNT(*) FILTER (
        WHERE COALESCE(delivered_qty, 0)::numeric > 0
      )::int AS delivered_item_count,
      COUNT(*) FILTER (
        WHERE GREATEST(COALESCE(selected_qty, 0)::numeric - COALESCE(delivered_qty, 0)::numeric, 0) > 0
      )::int AS remaining_item_count,
      COALESCE(SUM(COALESCE(delivered_qty, 0)::numeric), 0)::numeric AS delivered_qty_total,
      COALESCE(
        SUM(GREATEST(COALESCE(selected_qty, 0)::numeric - COALESCE(delivered_qty, 0)::numeric, 0)),
        0
      )::numeric AS remaining_qty_total
    FROM public.odg_tms_detail_item
    WHERE doc_no = $1
    GROUP BY bill_no`,
    [docNo]
  );
}

async function saveDeliveryImages(billNo, images, client) {
  if (!images || images.length === 0) return;

  const db = client ?? pool;
  await ensureDeliveryWorkflowSchema(db);

  const billRow = await runQueryOne(
    db,
    `SELECT doc_date::text
     FROM public.odg_tms_detail
     WHERE bill_no = $1
       AND ${getFixedYearSqlFilter("doc_date")}
     LIMIT 1`,
    [billNo]
  );

  const docDate = billRow?.doc_date ?? new Date().toISOString().split("T")[0];

  for (const imageData of images) {
    if (imageData && imageData.length > 0) {
      await db.query(
        `INSERT INTO public.odg_tms_delivery_images (bill_no, doc_date, image_data)
         VALUES ($1, $2, $3)`,
        [billNo, docDate, imageData]
      );
    }
  }
}

module.exports = {
  ensureDeliveryWorkflowSchema,
  ensureJobDeliveryItems,
  ensureBillDeliveryItems,
  getBillDeliveryItemSummary,
  getOpenBillCount,
  getBillDeliveryItems,
  getBillPhaseSummary,
  saveDeliveryImages,
};

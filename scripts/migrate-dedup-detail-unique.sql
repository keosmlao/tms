-- ============================================================================
-- M4 — Enforce one delivery-detail row per (doc_no, bill_no)
-- ============================================================================
-- public.odg_tms_detail has NO unique constraint on (doc_no, bill_no), so the
-- same bill can end up with more than one row on the same trip. The app papers
-- over this with `DISTINCT ON (...)` reads, but writes that target
-- `WHERE bill_no = $1` can then hit the wrong/duplicate row and desync
-- delivered_qty / status. This migration removes the duplicates and adds the
-- unique index so the invariant is enforced going forward.
--
-- DESTRUCTIVE: it DELETEs rows. Run the DRY-RUN block first, eyeball the rows
-- it would drop, take a backup, THEN run the DELETE + index. Not auto-applied.
--
-- "Keep" rule per (doc_no, bill_no) group — keep the most meaningful row:
--   1. delivered (status=1)  >  cancelled (status=2)  >  active (0/3)
--   2. then the row that actually has a sent_end timestamp
--   3. then the most recently created row
-- Everything else in the group is deleted. odg_tms_detail_item rows are keyed
-- by (doc_no, bill_no) — not by the detail row — so they need no cleanup once
-- the group collapses to a single detail row.
-- ============================================================================

-- ---- 0) How many duplicates exist right now? -------------------------------
SELECT COUNT(*) AS dup_groups, COALESCE(SUM(c - 1), 0) AS excess_rows
FROM (
  SELECT doc_no, bill_no, COUNT(*) AS c
  FROM public.odg_tms_detail
  GROUP BY doc_no, bill_no
  HAVING COUNT(*) > 1
) g;

-- ---- 1) DRY RUN: the exact rows that WOULD be deleted -----------------------
WITH ranked AS (
  SELECT
    ctid, doc_no, bill_no, status, sent_end, create_date_time_now,
    ROW_NUMBER() OVER (
      PARTITION BY doc_no, bill_no
      ORDER BY
        CASE WHEN COALESCE(status, 0) = 1 THEN 0
             WHEN COALESCE(status, 0) = 2 THEN 1
             ELSE 2 END,
        (sent_end IS NOT NULL) DESC,
        create_date_time_now DESC NULLS LAST
    ) AS rn
  FROM public.odg_tms_detail
)
SELECT doc_no, bill_no, status, sent_end, create_date_time_now
FROM ranked
WHERE rn > 1
ORDER BY doc_no, bill_no;

-- ---- 2) DELETE the duplicates (review the dry-run first!) -------------------
-- BEGIN;  -- optional: wrap in a transaction so you can ROLLBACK
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY doc_no, bill_no
      ORDER BY
        CASE WHEN COALESCE(status, 0) = 1 THEN 0
             WHEN COALESCE(status, 0) = 2 THEN 1
             ELSE 2 END,
        (sent_end IS NOT NULL) DESC,
        create_date_time_now DESC NULLS LAST
    ) AS rn
  FROM public.odg_tms_detail
)
DELETE FROM public.odg_tms_detail d
USING ranked r
WHERE d.ctid = r.ctid AND r.rn > 1;
-- COMMIT;

-- ---- 3) Create the unique index (CONCURRENTLY = no long table lock) ---------
-- Run this OUTSIDE a transaction. After it exists the app's ensureJobListIndexes
-- becomes a no-op (IF NOT EXISTS) and future duplicate inserts are rejected.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_odg_tms_detail_doc_bill
  ON public.odg_tms_detail (doc_no, bill_no);

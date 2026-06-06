-- ============================================================================
-- PERF — composite index odg_tms_detail (bill_no, doc_no)
-- ============================================================================
-- getRemainingSummaryMap (the ~480ms core of /bills-pending, the dashboard
-- pending cards, and the pending-daily report) joins odg_tms_detail_item to
-- odg_tms_detail on BOTH columns:
--     ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
-- in two CTEs (active_locked: status NOT IN (1,2); delivered: status IN (1,2)).
--
-- odg_tms_detail today has only SINGLE-column indexes (bill_no), (doc_no). With
-- no composite, the planner hash-joins by SEQ-SCANNING the whole 68k-row table:
--
--   Parallel Seq Scan on odg_tms_detail det
--     Filter: COALESCE(status,0) <> ALL ('{1,2}')
--     Rows Removed by Filter: 34136          <-- scans the entire table
--
-- For pending bills the item side is tiny (≈80 rows), so a nested-loop index
-- lookup on (bill_no, doc_no) is far cheaper than building a 68k-row hash. This
-- index gives the planner that option. Estimated saving ≈80–120ms per pending
-- load (UNVERIFIED on prod — see step 2; measure on dev first).
--
-- SAFE: purely additive + reversible (DROP INDEX). CONCURRENTLY = no table lock,
-- so it can run on a live system. Run it OUTSIDE a transaction.
-- ============================================================================

-- ---- 1) Create the index (no lock) -----------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_odg_tms_detail_bill_doc
  ON public.odg_tms_detail (bill_no, doc_no);

ANALYZE public.odg_tms_detail;

-- ---- 2) Verify it's used + measure -----------------------------------------
-- Re-run EXPLAIN (ANALYZE) on the active_locked join (paste a real list of
-- pending doc_nos for $1) and confirm the "Seq Scan on odg_tms_detail" became
-- an Index Scan / nested loop, and that /bills-pending load time dropped.
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT item.bill_no, item.item_code, COALESCE(SUM(item.selected_qty),0)
--   FROM public.odg_tms_detail_item item
--   INNER JOIN public.odg_tms_detail det
--     ON det.bill_no = item.bill_no AND det.doc_no = item.doc_no
--   WHERE item.bill_no = ANY('{...pending doc_nos...}'::varchar[])
--     AND COALESCE(det.status,0) NOT IN (1,2)
--   GROUP BY item.bill_no, item.item_code;

-- ---- Rollback (if it doesn't help) -----------------------------------------
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_odg_tms_detail_bill_doc;

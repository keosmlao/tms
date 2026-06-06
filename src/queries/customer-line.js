// Maps a customer (ar_customer.code) to their LINE userId so the system can
// push delivery notifications to customers who have added the company's LINE
// Official Account. Populated by the LINE webhook (the customer links by
// sending their phone number); auto-notify only sends to rows that exist here.
const { query, queryOne } = require("../lib/db");

let _ready = false;
async function ensureCustomerLineTable() {
  if (_ready) return;
  await query(`CREATE TABLE IF NOT EXISTS public.odg_tms_customer_line (
    line_id      character varying PRIMARY KEY,
    cust_code    character varying,
    display_name character varying,
    updated_at   timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
  )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_customer_line_cust
     ON public.odg_tms_customer_line (cust_code)`
  );
  _ready = true;
}

// The most recent LINE userId linked to a customer (null when not linked).
async function getCustomerLineId(custCode) {
  const code = String(custCode ?? "").trim();
  if (!code) return null;
  await ensureCustomerLineTable();
  const row = await queryOne(
    `SELECT line_id FROM public.odg_tms_customer_line
     WHERE cust_code = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    [code]
  );
  return row?.line_id ?? null;
}

// Link (or re-link) a LINE userId to a customer.
async function linkCustomerLine(lineId, custCode, displayName) {
  const id = String(lineId ?? "").trim();
  const code = String(custCode ?? "").trim();
  if (!id || !code) return false;
  await ensureCustomerLineTable();
  await query(
    `INSERT INTO public.odg_tms_customer_line (line_id, cust_code, display_name, updated_at)
     VALUES ($1, $2, $3, LOCALTIMESTAMP(0))
     ON CONFLICT (line_id) DO UPDATE
       SET cust_code = EXCLUDED.cust_code,
           display_name = EXCLUDED.display_name,
           updated_at = LOCALTIMESTAMP(0)`,
    [id, code, displayName ? String(displayName).slice(0, 120) : null]
  );
  return true;
}

// Find a customer by a phone number the user typed into LINE (digits-only,
// suffix match so country-code/format differences still match).
async function findCustomerByPhone(phone) {
  const clean = String(phone ?? "").replace(/[^0-9]/g, "");
  if (clean.length < 6) return null;
  const row = await queryOne(
    `SELECT code, COALESCE(NULLIF(TRIM(name_1), ''), code) AS name_1
     FROM ar_customer
     WHERE regexp_replace(COALESCE(telephone, ''), '[^0-9]', '', 'g') LIKE '%' || $1
     LIMIT 1`,
    [clean]
  );
  return row ?? null;
}

module.exports = {
  ensureCustomerLineTable,
  getCustomerLineId,
  linkCustomerLine,
  findCustomerByPhone,
};

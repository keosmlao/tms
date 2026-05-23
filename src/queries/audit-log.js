const { pool, query } = require("../lib/db");

const auditCache = globalThis;

async function ensureAuditLogSchema() {
  if (auditCache.__tmsAuditLogReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS public.odg_tms_audit_log (
       id bigserial PRIMARY KEY,
       action character varying NOT NULL,
       entity_type character varying,
       entity_id character varying,
       user_code character varying,
       ip_addr character varying,
       changes jsonb,
       created_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
     )`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_created ON public.odg_tms_audit_log (created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.odg_tms_audit_log (entity_type, entity_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_user ON public.odg_tms_audit_log (user_code, created_at DESC)`
  );
  auditCache.__tmsAuditLogReady = true;
}

// Best-effort audit write. Should never throw — the audit log being unavailable
// must not break the caller. Returns the inserted id (or null on failure).
/**
 * @param {{ action: string, entityType?: string|null, entityId?: string|null, userCode?: string|null, changes?: any, ipAddr?: string|null }} input
 */
async function recordAudit(input) {
  const { action, entityType = null, entityId = null, userCode = null, changes = null, ipAddr = null } = input || {};
  try {
    await ensureAuditLogSchema();
    const row = await pool.query(
      `INSERT INTO public.odg_tms_audit_log (action, entity_type, entity_id, user_code, ip_addr, changes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [
        String(action ?? "").slice(0, 64),
        entityType ? String(entityType).slice(0, 64) : null,
        entityId ? String(entityId).slice(0, 64) : null,
        userCode ? String(userCode).slice(0, 64) : null,
        ipAddr ? String(ipAddr).slice(0, 64) : null,
        changes == null ? null : JSON.stringify(changes),
      ]
    );
    return row.rows[0]?.id ?? null;
  } catch (err) {
    console.warn("[audit] write failed:", err?.message ?? err);
    return null;
  }
}

/**
 * @param {{ fromDate?: string, toDate?: string, entityType?: string, entityId?: string, userCode?: string, action?: string, limit?: number }} [opts]
 */
async function listAuditLog(opts) {
  const { fromDate, toDate, entityType, entityId, userCode, action, limit = 200 } = opts || {};
  await ensureAuditLogSchema();
  const where = [];
  const params = [];
  if (fromDate) {
    params.push(fromDate);
    where.push(`created_at::date >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`created_at::date <= $${params.length}::date`);
  }
  if (entityType) {
    params.push(entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(entityId);
    where.push(`entity_id = $${params.length}`);
  }
  if (userCode) {
    params.push(userCode);
    where.push(`user_code = $${params.length}`);
  }
  if (action) {
    params.push(action);
    where.push(`action = $${params.length}`);
  }
  const lim = Math.max(1, Math.min(1000, Number(limit) || 200));
  return query(
    `SELECT id, action, entity_type, entity_id, user_code, ip_addr, changes,
            to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at
     FROM public.odg_tms_audit_log
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT ${lim}`,
    params
  );
}

module.exports = { ensureAuditLogSchema, recordAudit, listAuditLog };

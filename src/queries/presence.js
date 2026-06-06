const { pool, query } = require("../lib/db");

const presenceCache = globalThis;
const ONLINE_SECONDS = 120;

async function ensurePresenceSchema() {
  if (presenceCache.__tmsPresenceReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_user_presence (
      user_code character varying NOT NULL,
      source character varying NOT NULL,
      username character varying,
      title character varying,
      logistic_code character varying,
      ip_addr character varying,
      user_agent text,
      status character varying DEFAULT 'online',
      first_seen_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      last_seen_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      last_offline_at timestamp without time zone,
      PRIMARY KEY (user_code, source)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_user_presence_last_seen
    ON public.odg_tms_user_presence (last_seen_at DESC)
  `);
  presenceCache.__tmsPresenceReady = true;
}

function sourceLabel(source) {
  return source === "mobile" ? "ແອັບ" : "Web";
}

function normalizeSource(source) {
  return source === "mobile" ? "mobile" : "web";
}

function requestMeta(request) {
  if (!request?.headers) return { ipAddr: null, userAgent: null };
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return {
    ipAddr: forwardedFor || realIp || null,
    userAgent: request.headers.get("user-agent") || null,
  };
}

async function touchUserPresence({ session, source = "web", ipAddr = null, userAgent = null, request = null }) {
  const userCode = String(session?.usercode ?? session?.code ?? "").trim();
  if (!userCode) return { success: false };
  const req = requestMeta(request);
  const src = normalizeSource(source);
  try {
    await ensurePresenceSchema();
    await pool.query(
      `INSERT INTO public.odg_tms_user_presence
         (user_code, source, username, title, logistic_code, ip_addr, user_agent, status, first_seen_at, last_seen_at, last_offline_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'online', LOCALTIMESTAMP(0), LOCALTIMESTAMP(0), NULL)
       ON CONFLICT (user_code, source) DO UPDATE
       SET username = COALESCE(EXCLUDED.username, public.odg_tms_user_presence.username),
           title = COALESCE(EXCLUDED.title, public.odg_tms_user_presence.title),
           logistic_code = COALESCE(EXCLUDED.logistic_code, public.odg_tms_user_presence.logistic_code),
           ip_addr = COALESCE(EXCLUDED.ip_addr, public.odg_tms_user_presence.ip_addr),
           user_agent = COALESCE(EXCLUDED.user_agent, public.odg_tms_user_presence.user_agent),
           status = 'online',
           last_seen_at = LOCALTIMESTAMP(0),
           last_offline_at = NULL`,
      [
        userCode,
        src,
        String(session?.username ?? session?.name_1 ?? "").trim() || null,
        String(session?.title ?? "").trim() || null,
        String(session?.logistic_code ?? "").trim() || null,
        ipAddr ?? req.ipAddr,
        userAgent ?? req.userAgent,
      ]
    );
  } catch (err) {
    console.warn("[presence] touch failed:", err?.message ?? err);
    return { success: false };
  }
  return { success: true };
}

async function markUserOffline({ session, source = "web", ipAddr = null, userAgent = null, request = null }) {
  const userCode = String(session?.usercode ?? session?.code ?? "").trim();
  if (!userCode) return { success: false };
  const req = requestMeta(request);
  const src = normalizeSource(source);
  try {
    await ensurePresenceSchema();
    await pool.query(
      `INSERT INTO public.odg_tms_user_presence
         (user_code, source, username, title, logistic_code, ip_addr, user_agent, status, first_seen_at, last_seen_at, last_offline_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'offline', LOCALTIMESTAMP(0), LOCALTIMESTAMP(0), LOCALTIMESTAMP(0))
       ON CONFLICT (user_code, source) DO UPDATE
       SET username = COALESCE(EXCLUDED.username, public.odg_tms_user_presence.username),
           title = COALESCE(EXCLUDED.title, public.odg_tms_user_presence.title),
           logistic_code = COALESCE(EXCLUDED.logistic_code, public.odg_tms_user_presence.logistic_code),
           ip_addr = COALESCE(EXCLUDED.ip_addr, public.odg_tms_user_presence.ip_addr),
           user_agent = COALESCE(EXCLUDED.user_agent, public.odg_tms_user_presence.user_agent),
           status = 'offline',
           last_seen_at = LOCALTIMESTAMP(0),
           last_offline_at = LOCALTIMESTAMP(0)`,
      [
        userCode,
        src,
        String(session?.username ?? session?.name_1 ?? "").trim() || null,
        String(session?.title ?? "").trim() || null,
        String(session?.logistic_code ?? "").trim() || null,
        ipAddr ?? req.ipAddr,
        userAgent ?? req.userAgent,
      ]
    );
  } catch (err) {
    console.warn("[presence] offline failed:", err?.message ?? err);
    return { success: false };
  }
  return { success: true };
}

async function listUserPresence({ search = "", source = "", status = "all", limit = 500 } = {}) {
  await ensurePresenceSchema();
  const params = [];
  const where = [];
  const q = String(search ?? "").trim();
  const src = normalizeSource(source);
  if (source === "web" || source === "mobile") {
    params.push(src);
    where.push(`p.source = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(
      p.user_code ILIKE $${params.length}
      OR COALESCE(p.username, '') ILIKE $${params.length}
      OR COALESCE(e.fullname_lo, '') ILIKE $${params.length}
      OR COALESCE(e.nickname, '') ILIKE $${params.length}
    )`);
  }
  const statusExpr = `CASE
    WHEN p.status = 'online' AND p.last_seen_at >= LOCALTIMESTAMP(0) - ($1::int * INTERVAL '1 second') THEN 'online'
    ELSE 'offline'
  END`;
  const baseParams = [ONLINE_SECONDS];
  const shiftedWhere = where.map((clause) => clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`));
  const allParams = [...baseParams, ...params];
  if (status === "online" || status === "offline") {
    shiftedWhere.push(`${statusExpr} = '${status}'`);
  }
  const lim = Math.max(1, Math.min(1000, Number(limit) || 500));
  return query(
    `SELECT p.user_code,
            COALESCE(
              NULLIF(TRIM(e.fullname_lo), ''),
              NULLIF(TRIM(e.nickname), ''),
              NULLIF(TRIM(p.username), ''),
              p.user_code
            ) AS user_name,
            COALESCE(NULLIF(TRIM(p.title), ''), '') AS title,
            p.source,
            '${sourceLabel("web")}' AS web_label,
            CASE p.source WHEN 'mobile' THEN '${sourceLabel("mobile")}' ELSE '${sourceLabel("web")}' END AS source_label,
            p.logistic_code,
            COALESCE(tt.name_1, '') AS logistic_name,
            p.ip_addr,
            p.user_agent,
            ${statusExpr} AS status,
            EXTRACT(EPOCH FROM (LOCALTIMESTAMP(0) - p.last_seen_at))::int AS age_seconds,
            to_char(p.last_seen_at, 'YYYY-MM-DD HH24:MI:SS') AS last_seen_at,
            to_char(p.last_offline_at, 'YYYY-MM-DD HH24:MI:SS') AS last_offline_at
     FROM public.odg_tms_user_presence p
     LEFT JOIN public.odg_employee e ON e.employee_code = p.user_code
     LEFT JOIN public.transport_type tt ON tt.code = p.logistic_code
     ${shiftedWhere.length ? `WHERE ${shiftedWhere.join(" AND ")}` : ""}
     ORDER BY (${statusExpr} = 'online') DESC, p.last_seen_at DESC
     LIMIT ${lim}`,
    allParams
  );
}

module.exports = {
  ONLINE_SECONDS,
  ensurePresenceSchema,
  touchUserPresence,
  markUserOffline,
  listUserPresence,
};

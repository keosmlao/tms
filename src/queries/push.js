const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const { query, queryOne } = require("../lib/db");

const SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "firebase-service-account.json"
);

let firebaseReady = false;
let firebaseInitError = null;

// Resolution order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON  — full JSON string (preferred for prod)
//   2. FIREBASE_SERVICE_ACCOUNT_BASE64 — base64-encoded JSON (Vercel/CI safer)
//   3. firebase-service-account.json on disk (legacy / local dev)
// Lets us deploy without ever writing the secret to the filesystem.
function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    return { source: "FIREBASE_SERVICE_ACCOUNT_JSON env", value: JSON.parse(inline) };
  }
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    return { source: "FIREBASE_SERVICE_ACCOUNT_BASE64 env", value: JSON.parse(decoded) };
  }
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    return {
      source: SERVICE_ACCOUNT_PATH,
      value: JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")),
    };
  }
  return null;
}

function initFirebaseIfNeeded() {
  if (firebaseReady || firebaseInitError) return firebaseReady;

  try {
    const loaded = loadServiceAccount();
    if (!loaded) {
      firebaseInitError =
        "Firebase service account not configured (set FIREBASE_SERVICE_ACCOUNT_JSON or place firebase-service-account.json)";
      console.warn(`[push] ${firebaseInitError} — push notifications disabled`);
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(loaded.value),
    });
    firebaseReady = true;
    console.log(`[push] firebase-admin initialized (source: ${loaded.source})`);
    return true;
  } catch (err) {
    firebaseInitError = err;
    console.error("[push] firebase init failed:", err);
    return false;
  }
}

// Schema — one row per (user_code, token). Tokens can move between users if a
// device is shared; (token) PK enforces that.
let schemaReady = false;
async function ensureFcmSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_fcm_tokens (
      token text PRIMARY KEY,
      user_code character varying NOT NULL,
      platform character varying,
      updated_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_fcm_tokens_user_code
    ON public.odg_tms_fcm_tokens (user_code)
  `);
  schemaReady = true;
}

async function saveToken(userCode, token, platform) {
  await ensureFcmSchema();
  if (!userCode || !token) return;
  await queryOne(
    `INSERT INTO public.odg_tms_fcm_tokens(token, user_code, platform, updated_at)
     VALUES ($1, $2, $3, LOCALTIMESTAMP(0))
     ON CONFLICT (token) DO UPDATE
     SET user_code = EXCLUDED.user_code,
         platform = EXCLUDED.platform,
         updated_at = LOCALTIMESTAMP(0)`,
    [token, userCode, platform || null]
  );
}

async function deleteToken(token) {
  await ensureFcmSchema();
  if (!token) return;
  await queryOne("DELETE FROM public.odg_tms_fcm_tokens WHERE token = $1", [
    token,
  ]);
}

async function getTokensFor(userCode) {
  await ensureFcmSchema();
  if (!userCode) return [];
  const rows = await query(
    "SELECT token FROM public.odg_tms_fcm_tokens WHERE user_code = $1",
    [userCode]
  );
  return rows.map((r) => r.token).filter(Boolean);
}

// ── Per-user push history ────────────────────────────────────────────────
// Every push is journaled here before FCM delivery, so the app's ແຈ້ງເຕືອນ
// screen can show history that survives reinstalls and device changes — and
// even records sends that FCM failed to deliver.
let pushLogReady = false;
async function ensurePushLogSchema() {
  if (pushLogReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS public.odg_tms_push_log (
      id bigserial PRIMARY KEY,
      user_code character varying NOT NULL,
      title text NOT NULL DEFAULT '',
      body text NOT NULL DEFAULT '',
      type character varying NOT NULL DEFAULT '',
      doc_no character varying NOT NULL DEFAULT '',
      sent_at timestamp without time zone DEFAULT LOCALTIMESTAMP(0),
      read_at timestamp without time zone
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_odg_tms_push_log_user
    ON public.odg_tms_push_log (user_code, id DESC)
  `);
  pushLogReady = true;
}

// Journal one push. Repeats of the same (user, type, doc, title) within an
// hour are skipped — cron nudges re-push every 5 minutes and replace each
// other in the tray via `tag`, so the history must collapse them the same way.
async function logPush(userCode, title, body, data = {}) {
  try {
    await ensurePushLogSchema();
    await query(
      `INSERT INTO public.odg_tms_push_log (user_code, title, body, type, doc_no)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM public.odg_tms_push_log
         WHERE user_code = $1 AND title = $2 AND type = $4 AND doc_no = $5
           AND sent_at >= LOCALTIMESTAMP - interval '60 minutes'
       )`,
      [
        userCode,
        String(title ?? ""),
        String(body ?? ""),
        String(data.type ?? ""),
        String(data.doc_no ?? ""),
      ]
    );
  } catch (err) {
    // History being unavailable must never block the actual push.
    console.warn("[push] log failed:", err?.message ?? err);
  }
}

async function pushHistory(userCode, limit = 50) {
  await ensurePushLogSchema();
  if (!userCode) return [];
  const max = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return query(
    `SELECT id::text AS id, title, body, type, doc_no,
       to_char(sent_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS sent_at,
       (read_at IS NOT NULL) AS read
     FROM public.odg_tms_push_log
     WHERE user_code = $1
     ORDER BY id DESC
     LIMIT $2`,
    [userCode, max]
  );
}

// Empty ids = mark everything read (the screen's "ອ່ານທັງໝົດ" button).
async function pushHistoryMarkRead(userCode, ids = []) {
  await ensurePushLogSchema();
  if (!userCode) return { success: false };
  if (Array.isArray(ids) && ids.length > 0) {
    await query(
      `UPDATE public.odg_tms_push_log SET read_at = LOCALTIMESTAMP(0)
       WHERE user_code = $1 AND read_at IS NULL AND id = ANY($2::bigint[])`,
      [userCode, ids.map((n) => Number(n))]
    );
  } else {
    await query(
      `UPDATE public.odg_tms_push_log SET read_at = LOCALTIMESTAMP(0)
       WHERE user_code = $1 AND read_at IS NULL`,
      [userCode]
    );
  }
  return { success: true };
}

// Core send — multi-device per user. Silently no-ops when Firebase is not
// configured so job actions never crash because of notifications.
async function pushToDriver(driverCode, title, body, data = {}) {
  if (!driverCode) return;
  // Journal before delivery — history exists even when FCM is down/unset.
  await logPush(driverCode, title, body, data);
  if (!initFirebaseIfNeeded()) return;

  try {
    const tokens = await getTokensFor(driverCode);
    if (tokens.length === 0) return;

    const tag = data.doc_no
      ? `job_${data.doc_no}_${data.type ?? "default"}`
      : undefined;

    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries({ ...data, driver_code: driverCode })
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: "high",
        notification: {
          channelId: "odgtms_jobs",
          color: "#0d9488",
          defaultSound: true,
          defaultVibrateTimings: true,
          tag,
          notificationCount: 1,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            "thread-id": data.doc_no ? `job_${data.doc_no}` : undefined,
          },
        },
      },
      tokens,
    };

    const res = await admin.messaging().sendEachForMulticast(message);

    // Clean up tokens that are no longer valid.
    const invalid = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-argument")
        ) {
          invalid.push(tokens[i]);
        }
      }
    });
    for (const tok of invalid) await deleteToken(tok);

    // Best-effort audit log so admins can verify a push was attempted.
    try {
      const { recordAudit } = require("./audit-log");
      await recordAudit({
        action: "push.sent",
        entityType: "driver",
        entityId: driverCode,
        userCode: "system",
        changes: {
          title,
          body,
          data,
          token_count: tokens.length,
          sent: res.successCount,
          failed: res.failureCount,
        },
      });
    } catch (_) {
      // audit log being unavailable must not break push
    }

    return { sent: res.successCount, failed: res.failureCount };
  } catch (err) {
    console.error("[push] send failed:", err);
  }
}

/**
 * ສະຖານະການຕັ້ງຄ່າ push — ໃຊ້ໂດຍປຸ່ມ "ທົດສອບແຈ້ງເຕືອນ" ໃນເວັບ.
 *
 * ບອກໄດ້ວ່າບັນຫາຢູ່ໃສ: Firebase ຍັງບໍ່ຕັ້ງຄ່າ, ຫຼື ຕັ້ງແລ້ວແຕ່ຜູ້ໃຊ້ຄົນນັ້ນ
 * ຍັງບໍ່ເຄີຍເປີດແອັບ (ບໍ່ມີ token). ສອງອັນນີ້ແກ້ຄົນລະວິທີ.
 */
async function pushDiagnostics(userCode) {
  const configured = initFirebaseIfNeeded();
  const code = String(userCode ?? "").trim();
  let appTokens = 0;
  let salesTokens = 0;
  try {
    appTokens = (await getTokensFor(code)).length;
  } catch {
    // ຕາຕະລາງຍັງບໍ່ມີ = ຍັງບໍ່ເຄີຍມີໃຜລົງທະບຽນ
  }
  try {
    const rows = await query(
      `SELECT COUNT(*)::int AS n FROM public.app_fcm_token WHERE employee_code = $1`,
      [code]
    );
    salesTokens = Number(rows?.[0]?.n ?? 0);
  } catch {
    // ຕາຕະລາງຂອງແອັບຝ່າຍຂາຍອາດບໍ່ມີໃນລະບົບນີ້
  }
  return {
    configured,
    error: configured
      ? ""
      : String(firebaseInitError?.message ?? firebaseInitError ?? ""),
    app_tokens: appTokens,
    sales_tokens: salesTokens,
  };
}

/**
 * ຍິງແຈ້ງເຕືອນທົດສອບຫາຜູ້ໃຊ້ຄົນໜຶ່ງ ແລ້ວຄືນຜົນລະອຽດ.
 *
 * ໃຊ້ເສັ້ນທາງດຽວກັບແຈ້ງເຕືອນຈິງ (pushToDriver) ຈຶ່ງທົດສອບໄດ້ຄົບທັງ
 * credential, token, ແລະ ການສົ່ງຂອງ FCM — ບໍ່ແມ່ນພຽງກວດການຕັ້ງຄ່າ.
 */
async function sendTestPush(userCode, { title, body } = {}) {
  const code = String(userCode ?? "").trim();
  if (!code) return { ok: false, error: "ບໍ່ຮູ້ວ່າຈະສົ່ງຫາໃຜ" };

  const diagnostics = await pushDiagnostics(code);
  if (!diagnostics.configured) {
    return {
      ok: false,
      ...diagnostics,
      error:
        diagnostics.error ||
        "Firebase ຍັງບໍ່ໄດ້ຕັ້ງຄ່າຢູ່ server (ຂາດ service account)",
    };
  }
  if (diagnostics.app_tokens === 0 && diagnostics.sales_tokens === 0) {
    return {
      ok: false,
      ...diagnostics,
      error:
        "ບັນຊີນີ້ຍັງບໍ່ມີອຸປະກອນລົງທະບຽນ — ກະລຸນາເປີດແອັບ ODG TMS ດ້ວຍບັນຊີນີ້ 1 ຄັ້ງກ່ອນ",
    };
  }

  const data = { type: "push_test" };
  const useTitle = title || "🔔 ທົດສອບແຈ້ງເຕືອນ";
  const useBody = body || "ຖ້າເຫັນຂໍ້ຄວາມນີ້ ແປວ່າແຈ້ງເຕືອນໃຊ້ງານໄດ້ປົກກະຕິ";
  const [driverResult, employeeResult] = await Promise.all([
    pushToDriver(code, useTitle, useBody, data).catch(() => undefined),
    diagnostics.sales_tokens > 0
      ? pushToEmployees([code], useTitle, useBody, data).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const sent =
    Number(driverResult?.sent ?? 0) + Number(employeeResult?.sent ?? 0);
  const failed =
    Number(driverResult?.failed ?? 0) + Number(employeeResult?.failed ?? 0);
  return {
    ok: sent > 0,
    ...diagnostics,
    sent,
    failed,
    error:
      sent > 0
        ? ""
        : "ສົ່ງອອກບໍ່ສຳເລັດ — token ອາດໝົດອາຍຸ, ລອງເປີດແອັບໃໝ່ແລ້ວທົດສອບອີກ",
  };
}

// Scan trips that have been received + had at least one bill picked up but
// the driver hasn't yet tapped "ເລີ່ມຈັດສົ່ງ". Push a nudge to the driver
// every cron tick. Returns count of trips pushed for caller logging.
//
// Idempotency: each trip's tag is reused (`job_<doc_no>_dispatch_reminder`)
// so the OS replaces the old notification instead of stacking. Cron should
// fire every 5 min; the function itself does no rate-limiting beyond the
// recipt_job-age guard.
async function remindUnstartedDispatches({ minMinutesSincePickup = 5 } = {}) {
  const { query } = require("../lib/db");
  const { getFixedYearSqlFilter } = require("../lib/fixed-year");
  const rows = await query(
    `SELECT t.doc_no, t.driver,
            MIN(d.recipt_job) AS earliest_pickup
     FROM odg_tms t
     INNER JOIN public.odg_tms_detail d
       ON d.doc_no = t.doc_no AND ${getFixedYearSqlFilter("d.doc_date")}
     WHERE COALESCE(t.approve_status, 0) = 1
       AND COALESCE(t.job_status, 0) = 1
       AND t.dispatch_started_at IS NULL
       AND ${getFixedYearSqlFilter("t.doc_date")}
     GROUP BY t.doc_no, t.driver
     HAVING MIN(d.recipt_job) IS NOT NULL
        AND MIN(d.recipt_job) <= LOCALTIMESTAMP(0) - ($1 || ' minutes')::interval`,
    [String(minMinutesSincePickup)]
  );

  let pushed = 0;
  for (const r of rows) {
    if (!r.driver) continue;
    await pushToDriver(
      r.driver,
      "ກະລຸນາກົດເລີ່ມຈັດສົ່ງ",
      `ທ່ານຍັງບໍ່ໄດ້ກົດເລີ່ມຈັດສົ່ງສຳລັບຖ້ຽວ ${r.doc_no} — ກະລຸນາກົດເລີ່ມຈັດສົ່ງກ່ອນຈຶ່ງດຳເນີນການຈັດສົ່ງ`,
      { doc_no: r.doc_no, type: "dispatch_reminder" }
    );
    pushed += 1;
  }
  return { scanned: rows.length, pushed };
}

// Send to sales-app employees (app_sale_order Flutter app). Tokens live in
// the shared `app_fcm_token` table owned by web_sale_order, keyed by
// employee_code. Reuses firebase-admin already initialised above — both apps
// share the same Firebase project, so the same service account can push to
// either token store.
async function pushToEmployees(employeeCodes, title, body, data = {}) {
  const codes = Array.from(
    new Set(
      (Array.isArray(employeeCodes) ? employeeCodes : [])
        .map((c) => (c == null ? "" : String(c).trim()))
        .filter(Boolean)
    )
  );
  if (codes.length === 0) return;
  if (!initFirebaseIfNeeded()) return;

  let tokenRows;
  try {
    tokenRows = await query(
      `SELECT id, token, employee_code
       FROM public.app_fcm_token
       WHERE employee_code = ANY($1::varchar[])`,
      [codes]
    );
  } catch (err) {
    console.warn("[push] pushToEmployees lookup failed:", err?.message ?? err);
    return;
  }
  if (tokenRows.length === 0) return;

  const tokens = tokenRows.map((r) => r.token);
  const tag = data.doc_no ? `sales_${data.doc_no}_${data.type ?? "default"}` : undefined;
  const message = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: "high",
      notification: {
        channelId: "default",
        defaultSound: true,
        defaultVibrateTimings: true,
        tag,
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
          "thread-id": data.doc_no ? `sales_${data.doc_no}` : undefined,
        },
      },
    },
    tokens,
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    const staleIds = [];
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        staleIds.push(tokenRows[i].id);
      }
    });
    if (staleIds.length > 0) {
      await query(
        `DELETE FROM public.app_fcm_token WHERE id = ANY($1::bigint[])`,
        [staleIds]
      );
    }
    try {
      const { recordAudit } = require("./audit-log");
      await recordAudit({
        action: "push.sent",
        entityType: "sales_employee",
        entityId: codes.join(","),
        userCode: "system",
        changes: {
          title,
          body,
          data,
          token_count: tokens.length,
          sent: res.successCount,
          failed: res.failureCount,
        },
      });
    } catch (_) {
      // audit log unavailable must not break push
    }
    return { sent: res.successCount, failed: res.failureCount };
  } catch (err) {
    console.error("[push] pushToEmployees send failed:", err);
  }
}

module.exports = {
  saveToken,
  deleteToken,
  pushToDriver,
  pushDiagnostics,
  sendTestPush,
  pushToEmployees,
  pushHistory,
  pushHistoryMarkRead,
  remindUnstartedDispatches,
};

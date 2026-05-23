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

// Core send — multi-device per user. Silently no-ops when Firebase is not
// configured so job actions never crash because of notifications.
async function pushToDriver(driverCode, title, body, data = {}) {
  if (!driverCode) return;
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

module.exports = {
  saveToken,
  deleteToken,
  pushToDriver,
  remindUnstartedDispatches,
};

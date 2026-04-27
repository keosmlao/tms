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

function initFirebaseIfNeeded() {
  if (firebaseReady || firebaseInitError) return firebaseReady;

  try {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      firebaseInitError = `firebase-service-account.json not found at ${SERVICE_ACCOUNT_PATH}`;
      console.warn(`[push] ${firebaseInitError} — push notifications disabled`);
      return false;
    }

    const serviceAccount = JSON.parse(
      fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseReady = true;
    console.log("[push] firebase-admin initialized");
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

    return { sent: res.successCount, failed: res.failureCount };
  } catch (err) {
    console.error("[push] send failed:", err);
  }
}

module.exports = {
  saveToken,
  deleteToken,
  pushToDriver,
};

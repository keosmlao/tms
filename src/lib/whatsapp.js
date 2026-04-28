// WhatsApp Cloud API helper. Token, phone-id, country code, and the test
// redirect can come from either env or the odg_tms_setting table — DB takes
// precedence so admins can flip test mode at runtime.
const { getSetting } = require("../queries/settings");

async function getWhatsAppConfig() {
  const [tokenDb, phoneIdDb, ccDb, testEnabled, testTo] = await Promise.all([
    getSetting("whatsapp.token", ""),
    getSetting("whatsapp.phone_id", ""),
    getSetting("whatsapp.default_cc", ""),
    getSetting("whatsapp.test_enabled", ""),
    getSetting("whatsapp.test_to", ""),
  ]);
  return {
    token: tokenDb || process.env.WHATSAPP_TOKEN || "",
    phoneId: phoneIdDb || process.env.WHATSAPP_PHONE_ID || "",
    cc: (ccDb || process.env.WHATSAPP_DEFAULT_CC || "856").replace(/\D/g, ""),
    testTo:
      testEnabled === "1" || testEnabled === "true"
        ? testTo || process.env.WHATSAPP_TEST_TO || ""
        : "",
  };
}

function normalizePhone(raw, defaultCc) {
  const DEFAULT_CC = (defaultCc || "856").replace(/\D/g, "");
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  // Already has country code (>= 10 digits and not leading 0)
  if (digits.length >= 11 || (digits.length >= 10 && digits[0] !== "0")) {
    return digits;
  }
  // Strip a single leading 0, prepend default CC
  const local = digits.startsWith("0") ? digits.slice(1) : digits;
  return DEFAULT_CC + local;
}

async function sendWhatsApp(toRaw, message) {
  const cfg = await getWhatsAppConfig();
  if (!cfg.token || !cfg.phoneId) {
    console.warn("[whatsapp] not configured; skip send to", toRaw);
    return { success: false, skipped: true };
  }
  const realTo = normalizePhone(toRaw, cfg.cc);
  if (!realTo) return { success: false, error: "invalid phone" };

  // Test redirect: send to the configured test phone instead, prefix the
  // message so the tester sees who it was meant for.
  let to = realTo;
  let bodyText = String(message ?? "").slice(0, 4096);
  if (cfg.testTo) {
    const testTo = normalizePhone(cfg.testTo, cfg.cc);
    if (testTo) {
      to = testTo;
      bodyText = `[TEST → ${realTo}]\n${bodyText}`;
    }
  }

  const url = `https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: bodyText, preview_url: true },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[whatsapp] send failed ${res.status} to ${to}: ${text.slice(0, 200)}`
      );
      return { success: false, status: res.status };
    }
    return { success: true };
  } catch (err) {
    console.warn("[whatsapp] send error:", err?.message ?? err);
    return { success: false, error: err?.message ?? String(err) };
  }
}

module.exports = { sendWhatsApp, normalizePhone };

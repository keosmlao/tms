// Best-effort customer SMS via a configurable HTTP gateway.
//
// There is no built-in SMS provider, so this stays a no-op (returns false)
// until SMS_GATEWAY_URL is set — dispatch never breaks when it's unconfigured.
//
// Configure in .env with {to} and {text} placeholders, e.g. a typical Lao
// HTTP SMS gateway:
//   SMS_GATEWAY_URL="https://gw.example.la/api/send?to={to}&text={text}&key=ABC123"
//   SMS_GATEWAY_METHOD=GET            # or POST
// {text} is URL-encoded automatically.
async function sendCustomerSms(phone, text) {
  const tmpl = process.env.SMS_GATEWAY_URL;
  if (!tmpl) return false; // not configured
  const to = String(phone ?? "").replace(/[^0-9+]/g, "");
  if (!to) return false;
  const url = tmpl
    .split("{to}")
    .join(encodeURIComponent(to))
    .split("{text}")
    .join(encodeURIComponent(text));
  try {
    const res = await fetch(url, {
      method: (process.env.SMS_GATEWAY_METHOD || "GET").toUpperCase(),
    });
    return res.ok;
  } catch (err) {
    console.warn("[sms] send failed:", err?.message ?? err);
    return false;
  }
}

module.exports = { sendCustomerSms };

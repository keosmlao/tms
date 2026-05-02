// LINE Messaging API helper. Token + test redirect can come from either env
// or the odg_tms_setting table — DB takes precedence so admins can flip
// test mode at runtime via the Settings page without a redeploy.
const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const { getSetting } = require("../queries/settings");

async function getLineConfig() {
  const [tokenDb, testEnabled, testTo] = await Promise.all([
    getSetting("line.access_token", ""),
    getSetting("line.test_enabled", ""),
    getSetting("line.test_to", ""),
  ]);
  return {
    token: tokenDb || process.env.LINE_ACCESS_TOKEN || "",
    testTo:
      testEnabled === "1" || testEnabled === "true"
        ? testTo || process.env.LINE_TEST_TO || ""
        : "",
  };
}

function applyLineTestOverride(testTo, to, messages) {
  if (!testTo) return { to, messages };
  // Tag the first message so test recipients can see who would have got it.
  const tagged = messages.map((m, idx) => {
    if (idx !== 0) return m;
    if (m.type === "text") {
      return { ...m, text: `[TEST → ${to}] ${m.text}` };
    }
    if (m.type === "flex") {
      return { ...m, altText: `[TEST → ${to}] ${m.altText ?? ""}` };
    }
    return m;
  });
  return { to: testTo, messages: tagged };
}

async function pushMessages(originalTo, originalMessages, options = {}) {
  const cfg = await getLineConfig();
  if (!cfg.token) {
    console.warn("[line] LINE token not configured; skip push to", originalTo);
    return { success: false, skipped: true };
  }
  if (!originalTo) return { success: false, error: "missing recipient" };
  const testTo = Object.prototype.hasOwnProperty.call(options, "testTo")
    ? options.testTo
    : cfg.testTo;
  const { to, messages } = applyLineTestOverride(
    testTo,
    originalTo,
    originalMessages
  );
  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ to, messages }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[line] push failed ${res.status}: ${text.slice(0, 200)}`);
      return { success: false, status: res.status };
    }
    return { success: true };
  } catch (err) {
    console.warn("[line] push error:", err?.message ?? err);
    return { success: false, error: err?.message ?? String(err) };
  }
}

async function sendLineText(to, text) {
  return pushMessages(to, [{ type: "text", text: String(text ?? "").slice(0, 5000) }]);
}

// Status-color palette mapped to LINE Flex hex.
const STATUS_COLORS = {
  default: "#0E7C6B",
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#EF4444",
  green: "#10B981",
  sky: "#0EA5E9",
};

/**
 * Rich Flex bubble for a delivery-status update. All fields are optional —
 * empty rows are dropped so the bubble stays compact.
 *
 * @param {Object} input
 * @param {string} input.to                LINE userId / groupId / roomId
 * @param {string} input.statusLabel       e.g. "📦 ເບີກເຄື່ອງແລ້ວ"
 * @param {string} [input.color]           palette key (see STATUS_COLORS)
 * @param {string} [input.billNo]
 * @param {string} [input.docNo]
 * @param {string} [input.customerName]
 * @param {string} [input.carName]
 * @param {string} [input.driverName]
 * @param {string} [input.trackingUrl]     adds an "ຕິດຕາມ" CTA button
 * @param {string} [input.testTo]          optional per-message test redirect
 * @param {Array<{label:string,time?:string,done:boolean,active?:boolean}>} [input.timeline]
 *        Optional ordered timeline of delivery checkpoints. Done steps render
 *        in green, the active step in the bubble's accent colour, future
 *        steps muted. Pass an empty array or omit to skip the timeline.
 */
async function sendDeliveryFlex(input) {
  const {
    to,
    statusLabel,
    color = "default",
    billNo,
    docNo,
    customerName,
    carName,
    driverName,
    trackingUrl,
    testTo,
    timeline,
  } = input ?? {};

  const accent = STATUS_COLORS[color] ?? STATUS_COLORS.default;
  const rows = [];
  const addRow = (label, value) => {
    if (!value) return;
    rows.push({
      type: "box",
      layout: "baseline",
      spacing: "sm",
      contents: [
        { type: "text", text: label, color: "#94A3B8", size: "xs", flex: 2 },
        { type: "text", text: String(value), wrap: true, size: "sm", color: "#1E293B", flex: 5 },
      ],
    });
  };
  addRow("ບິນ", billNo);
  addRow("ຖ້ຽວ", docNo);
  addRow("ລູກຄ້າ", customerName);
  addRow("ລົດ", carName);
  addRow("ຄົນຂັບ", driverName);

  const bodyContents = [
    {
      type: "text",
      text: statusLabel || "ອັບເດດສະຖານະ",
      weight: "bold",
      size: "lg",
      color: accent,
      wrap: true,
    },
    { type: "separator", margin: "md" },
    { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: rows },
  ];

  if (Array.isArray(timeline) && timeline.length > 0) {
    const timelineRows = timeline.map((step) => {
      const stepColor = step.done
        ? "#10B981"
        : step.active
        ? accent
        : "#CBD5E1";
      const dot = step.done ? "●" : step.active ? "◉" : "○";
      return {
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: dot,
            color: stepColor,
            size: "sm",
            flex: 0,
          },
          {
            type: "text",
            text: String(step.label ?? ""),
            wrap: true,
            size: "sm",
            color: step.done || step.active ? "#1E293B" : "#94A3B8",
            flex: 4,
            weight: step.active ? "bold" : "regular",
          },
          {
            type: "text",
            text: step.time ? String(step.time) : "—",
            size: "xs",
            color: "#94A3B8",
            align: "end",
            flex: 3,
          },
        ],
      };
    });

    bodyContents.push(
      { type: "separator", margin: "md" },
      {
        type: "text",
        text: "ສະຖານະການຈັດສົ່ງ",
        size: "xs",
        color: "#64748B",
        weight: "bold",
        margin: "md",
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        margin: "sm",
        contents: timelineRows,
      }
    );
  }

  const footer = trackingUrl
    ? {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: accent,
            height: "sm",
            action: { type: "uri", label: "ຕິດຕາມການສົ່ງ", uri: trackingUrl },
          },
        ],
      }
    : undefined;

  const bubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "ODG TMS · ຈັດສົ່ງສິນຄ້າ",
          color: "#FFFFFF",
          size: "sm",
          weight: "bold",
        },
      ],
      backgroundColor: accent,
      paddingAll: "md",
    },
    body: { type: "box", layout: "vertical", contents: bodyContents },
    ...(footer ? { footer } : {}),
  };

  return pushMessages(
    to,
    [{ type: "flex", altText: `${statusLabel} · ${billNo ?? ""}`.trim(), contents: bubble }],
    Object.prototype.hasOwnProperty.call(input ?? {}, "testTo") ? { testTo } : {}
  );
}

module.exports = { sendDeliveryFlex, sendLineText, pushMessages };

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN || "";
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || "";

async function sendLineNotify(message) {
  const url = "https://notify-api.line.me/api/notify";
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
    },
    body: new URLSearchParams({ message }),
  });
}

async function sendFlexMessage(userId, message1, message2, message3, message4) {
  const url = "https://api.line.me/v2/bot/message/push";
  const messageData = {
    to: userId,
    messages: [
      {
        type: "flex",
        altText: "ຈັດສົ່ງສິນຄ້າ",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "ODG PLUS ຈັດສົ່ງສິນຄ້າ", weight: "bold", size: "sm" },
              { type: "separator" },
              { type: "text", text: message1, wrap: true },
              { type: "separator" },
              { type: "text", text: message2, wrap: true },
              { type: "text", text: message3, wrap: true },
              { type: "separator" },
              { type: "text", text: message4, wrap: true },
              { type: "separator" },
              { type: "text", text: "ຂອບໃຈທີ່ໃຊ້ບໍລິການ", wrap: true },
            ],
          },
        },
      },
    ],
  };

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(messageData),
  });
}

module.exports = { sendLineNotify, sendFlexMessage };

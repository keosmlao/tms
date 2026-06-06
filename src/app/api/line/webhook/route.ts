import type { NextRequest } from "next/server";
import crypto from "crypto";
import { replyText, getChannelSecret } from "@/lib/line.js";
import { findCustomerByPhone, linkCustomerLine } from "@/queries/customer-line.js";

// LINE Messaging API webhook. Customers add the company's Official Account and
// send their phone number; we match it to a customer and store their LINE
// userId so dispatch notifications can reach them. Public endpoint — verified
// by the LINE channel signature (x-line-signature).
export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Verify the signature when a channel secret is configured.
  const secret = await getChannelSecret();
  if (secret) {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw)
      .digest("base64");
    const sig = request.headers.get("x-line-signature") ?? "";
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return new Response("bad signature", { status: 401 });
    }
  }

  let body: { events?: unknown[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok");
  }

  const events = Array.isArray(body.events) ? body.events : [];
  for (const ev of events as Array<Record<string, unknown>>) {
    try {
      const type = ev.type;
      const replyToken = ev.replyToken as string | undefined;
      const userId = (ev.source as { userId?: string } | undefined)?.userId;

      if (type === "follow") {
        await replyText(
          replyToken,
          "ສະບາຍດີ 👋 ກະລຸນາສົ່ງ ເບີໂທ ຂອງທ່ານ ເພື່ອຮັບແຈ້ງເຕືອນເມື່ອສິນຄ້າຈັດສົ່ງ 📦"
        );
        continue;
      }

      if (type === "message") {
        const msg = ev.message as { type?: string; text?: string } | undefined;
        if (msg?.type !== "text") continue;
        const cust = await findCustomerByPhone(msg.text ?? "");
        if (cust && userId) {
          await linkCustomerLine(userId, cust.code, cust.name_1);
          await replyText(
            replyToken,
            `ຜູກບັນຊີສຳເລັດ ✅\n${cust.name_1}\nທ່ານຈະໄດ້ຮັບແຈ້ງເຕືອນເມື່ອສິນຄ້າເລີ່ມຈັດສົ່ງ`
          );
        } else {
          await replyText(
            replyToken,
            "ບໍ່ພົບເບີໂທນີ້ໃນລະບົບ — ກະລຸນາກວດສອບ ຫຼື ຕິດຕໍ່ຮ້ານ"
          );
        }
      }
    } catch (err) {
      console.warn("[line-webhook] event error:", err);
    }
  }

  return new Response("ok");
}

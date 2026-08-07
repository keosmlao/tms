import type { NextRequest } from "next/server";
import { getPodBillProof } from "@/queries/pod.js";

// ຮູບຫຼັກຖານການສົ່ງໜຶ່ງໃບ ສຳລັບຈໍຕິດຝາ.
//
// ແຍກອອກຈາກ /api/tv ດ້ວຍເຫດຜົນດຽວ: ຈໍ poll payload ທຸກ 15 ວິນາທີ ແຕ່ຮູບໜຶ່ງໃບ
// ໜັກ 100–400 KB. ສົ່ງເປັນ response ຮູບແທ້ (ບໍ່ແມ່ນ JSON) ແລ້ວໃສ່ cache ຍາວ —
// ບິນທີ່ປິດແລ້ວຮູບບໍ່ປ່ຽນອີກ ຈຶ່ງ browser ດຶງເທື່ອດຽວຕໍ່ບິນ.
export const dynamic = "force-dynamic";

function tokenOk(request: NextRequest): boolean {
  const expected = (process.env.TV_DASHBOARD_TOKEN ?? "").trim();
  if (!expected) return false;
  const given = (
    request.nextUrl.searchParams.get("key") ??
    request.headers.get("x-tv-key") ??
    ""
  ).trim();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

/** "data:image/jpeg;base64,xxx" ຫຼື base64 ລ້ວນ → bytes + content type */
function decodeImage(raw: string): { bytes: Buffer; type: string } | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  // [\s\S] ແທນ flag /s — tsconfig ຂອງໂປຣເຈັກ target ຕ່ຳກວ່າ es2018
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/);
  const type = match ? match[1] : "image/jpeg";
  const base64 = match ? match[2] : value;
  try {
    const bytes = Buffer.from(base64, "base64");
    return bytes.length > 0 ? { bytes, type } : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!tokenOk(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  const billNo = (params.get("bill") ?? "").trim();
  const docNo = (params.get("doc") ?? "").trim();
  if (!billNo) {
    return Response.json({ error: "bill is required" }, { status: 400 });
  }

  try {
    const proof = await getPodBillProof(billNo, docNo);
    if (!proof) return Response.json({ error: "not found" }, { status: 404 });

    // ຮູບທຳອິດທີ່ຄົນຂັບຖ່າຍ ແລ້ວຄ່ອຍ fallback ໄປຮູບຫຼັກ — ຈໍສະແດງໃບດຽວ
    const raw =
      (Array.isArray(proof.delivery_images) ? proof.delivery_images[0] : "") ||
      proof.url_img ||
      "";
    const image = decodeImage(raw);
    if (!image) return Response.json({ error: "no image" }, { status: 404 });

    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.type,
        "Content-Length": String(image.bytes.length),
        // ຮູບຂອງບິນທີ່ປິດແລ້ວບໍ່ປ່ຽນ — ໃຫ້ຈໍ cache ໄວ້ຍາວ
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "error" },
      { status: 500 }
    );
  }
}

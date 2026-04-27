import { mobileLogin } from "@/queries/mobile.js";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await mobileLogin(body);
    return Response.json(data);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? "Internal server error";
    if (status === 500) console.error("Mobile login error:", error);
    return Response.json({ error: message }, { status });
  }
}

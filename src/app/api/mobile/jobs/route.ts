import type { NextRequest } from "next/server";
import { mobileJobsList, mobileJobAction } from "@/queries/mobile.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody, parseSearchParams } from "@/lib/validation";
import { JobActionSchema, JobsListQuerySchema } from "@/lib/mobile-schemas";

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const { date } = parseSearchParams(request.nextUrl.searchParams, JobsListQuerySchema);
    const data = await mobileJobsList(session.driver_id, date ?? "");
    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await parseJsonBody(request, JobActionSchema);
    const data = await mobileJobAction({
      ...body,
      driver_id: session.driver_id,
      user_code: session.usercode,
    });
    return Response.json(data);
  } catch (error: unknown) {
    // Workflow rejections from the query layer are 400s, not 500s. We can't
    // tell ahead of time, so map known phrases to 400 here.
    const err = error as { status?: number; message?: string };
    if (!err?.status && typeof err?.message === "string") {
      const m = err.message;
      if (
        m === "Invalid action" ||
        m.includes("required") ||
        m.includes("remaining only") ||
        m.includes("Still has pending") ||
        m.includes("must be") ||
        m.startsWith("ກະລຸນາ") ||
        m === "ບິນນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະຈັດສົ່ງສຳເລັດ" ||
        m === "ປິດຖ້ຽວແລ້ວ ບໍ່ສາມາດຍົກເລີກສຳເລັດໄດ້"
      ) {
        (err as { status?: number }).status = 400;
      }
    }
    return mobileErrorResponse(error);
  }
}

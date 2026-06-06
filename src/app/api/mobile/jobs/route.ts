import type { NextRequest } from "next/server";
import { mobileJobsList, mobileJobsListAll, mobileJobAction, mobileSupervisorKpi } from "@/queries/mobile.js";
import { getPhoneFleet } from "@/queries/tracking.js";
import { approveJob } from "@/queries/approve.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody, parseSearchParams } from "@/lib/validation";
import { JobActionSchema, JobsListQuerySchema } from "@/lib/mobile-schemas";

function canUseSupervisorScope(session: {
  roles?: string;
  title?: string;
  logistic_code?: string;
  is_driver?: boolean;
}) {
  // Anyone who is NOT a driver is treated as a supervisor/manager.
  if (session.is_driver === false) return true;
  const text = `${session.roles ?? ""} ${session.title ?? ""} ${
    session.logistic_code ?? ""
  }`.toLowerCase();
  return (
    text.includes("supervisor") ||
    text.includes("manager") ||
    text.includes("admin") ||
    text.includes("logistic") ||
    text.includes("transport_head")
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    const { date, scope, driver_id, status } = parseSearchParams(
      request.nextUrl.searchParams,
      JobsListQuerySchema
    );
    if (scope === "all") {
      if (!canUseSupervisorScope(session)) {
        const error = new Error("Forbidden");
        (error as Error & { status?: number }).status = 403;
        throw error;
      }
      const data = await mobileJobsListAll({
        date: date ?? "",
        driverId: driver_id ?? "",
        status: status ?? "",
      });
      return Response.json(data);
    }
    if (scope === "fleet") {
      // Live positions of every driver in the supervisor's branch.
      if (!canUseSupervisorScope(session)) {
        const error = new Error("Forbidden");
        (error as Error & { status?: number }).status = 403;
        throw error;
      }
      const data = await getPhoneFleet(session);
      return Response.json(data);
    }
    if (scope === "kpi") {
      if (!canUseSupervisorScope(session)) {
        const error = new Error("Forbidden");
        (error as Error & { status?: number }).status = 403;
        throw error;
      }
      const data = await mobileSupervisorKpi({ date: date ?? "" });
      return Response.json(data);
    }
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
    // Supervisor-only action — approving someone else's trip can't go through
    // the driver-ownership gate in mobileJobAction, so handle it here.
    if (body.action === "approve_job") {
      if (!canUseSupervisorScope(session)) {
        const error = new Error("Forbidden");
        (error as Error & { status?: number }).status = 403;
        throw error;
      }
      await approveJob(session, body.doc_no);
      return Response.json({ success: true });
    }
    const data = await mobileJobAction({
      ...body,
      driver_id: session.driver_id,
      user_code: session.usercode,
      transport_code: session.logistic_code,
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
        m === "ປິດຖ້ຽວແລ້ວ ບໍ່ສາມາດຍົກເລີກສຳເລັດໄດ້" ||
        m === "ປິດຖ້ຽວແລ້ວ ບໍ່ສາມາດແກ້ໄຂໄດ້"
      ) {
        (err as { status?: number }).status = 400;
      }
    }
    return mobileErrorResponse(error);
  }
}

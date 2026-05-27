import { z } from "zod";
import { query, queryOne } from "@/lib/db.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody, ValidationError } from "@/lib/validation";

const ApproveSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  note: z.string().trim().optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  return mobileErrorResponse(error);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    await requireMobileSession(request);
    const { code } = await params;

    const [inspection, details] = await Promise.all([
      queryOne(
        `SELECT
           i.inspect_code,
           i.car_code AS vehicle_code,
           COALESCE(c.name_1, '') AS vehicle_name,
           TO_CHAR(i.inspect_date, 'YYYY-MM-DD') AS inspect_date,
           TO_CHAR(i.inspect_time, 'HH24:MI') AS inspect_time,
           i.driver_code,
           COALESCE(dr.name_1, '') AS driver_name,
           i.employee_code,
           COALESCE(
             NULLIF(TRIM(e.fullname_lo), ''),
             NULLIF(TRIM(e.nickname), ''),
             i.employee_code
           ) AS employee_name,
           i.odometer,
           i.note,
           COALESCE(i.approval_status, 'pending') AS approval_status,
           i.approved_by,
           COALESCE(
             NULLIF(TRIM(ea.fullname_lo), ''),
             NULLIF(TRIM(ea.nickname), ''),
             i.approved_by
           ) AS approved_by_name,
           TO_CHAR(i.approved_at, 'YYYY-MM-DD HH24:MI') AS approved_at,
           i.approval_note
         FROM public.odg_tms_inspect i
         LEFT JOIN public.odg_tms_car c ON c.code = i.car_code
         LEFT JOIN public.odg_tms_driver dr ON dr.code = i.driver_code
         LEFT JOIN public.odg_employee e ON e.employee_code = i.employee_code
         LEFT JOIN public.odg_employee ea ON ea.employee_code = i.approved_by
         WHERE i.inspect_code = $1`,
        [code]
      ),
      query(
        `SELECT
           d.item_code,
           COALESCE(it.item_name, d.item_code) AS item_name,
           d.status_code,
           COALESCE(s.status_name, d.status_code::text) AS status_name
         FROM public.odg_tms_inspect_detail d
         LEFT JOIN public.odg_tms_inspect_item it ON it.item_code = d.item_code
         LEFT JOIN public.odg_tms_inspect_status s ON s.status_code = d.status_code
         WHERE d.inspect_code = $1
         ORDER BY it.sort_order ASC, d.item_code ASC`,
        [code]
      ),
    ]);

    if (!inspection) {
      return Response.json({ error: "ບໍ່ພົບລາຍການກວດ" }, { status: 404 });
    }

    return Response.json({ ...inspection, details });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await requireMobileSession(request);
    const { code } = await params;
    const input = await parseJsonBody(request, ApproveSchema);

    if (input.action === "rejected" && !input.note?.trim()) {
      return Response.json(
        { error: "ກະລຸນາລະບຸເຫດຜົນການປະຕິເສດ" },
        { status: 400 }
      );
    }

    const existing = await queryOne<{ inspect_code: string }>(
      `SELECT inspect_code FROM public.odg_tms_inspect WHERE inspect_code = $1`,
      [code]
    );
    if (!existing) {
      return Response.json({ error: "ບໍ່ພົບລາຍການກວດ" }, { status: 404 });
    }

    await query(
      `UPDATE public.odg_tms_inspect
         SET approval_status = $1,
             approved_by     = $2,
             approved_at     = NOW(),
             approval_note   = $3
       WHERE inspect_code = $4`,
      [input.action, session.usercode, input.note ?? null, code]
    );

    return Response.json({ success: true, approval_status: input.action });
  } catch (error) {
    return errorResponse(error);
  }
}

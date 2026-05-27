import { z } from "zod";
import { query, queryOne } from "@/lib/db.js";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { parseJsonBody, ValidationError } from "@/lib/validation";

const DetailSchema = z.object({
  item_code: z.string().trim().min(1),
  status_code: z.number().int().min(0),
});

const InspectionSchema = z.object({
  vehicle_code: z.string().trim().min(1, "vehicle_code is required"),
  inspect_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "inspect_date must be YYYY-MM-DD"),
  inspect_time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  driver_code: z.string().trim().optional(),
  odometer: z.number().min(0).optional(),
  note: z.string().trim().optional(),
  details: z.array(DetailSchema).min(1, "details is required"),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  return mobileErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const input = await parseJsonBody(request, InspectionSchema);

    const inspectDate = new Date(input.inspect_date);
    const year = inspectDate.getFullYear();
    const month = inspectDate.getMonth() + 1;

    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    const inspect_code = [
      "INS",
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
      pad(Math.floor(Math.random() * 1000), 3),
    ].join("");

    // Resolve driver_code: prefer explicit value from request, fall back to
    // the session user's own code — but only if it exists in odg_tms_driver
    // to avoid FK violations.
    const candidateDriver = input.driver_code?.trim() || session.usercode;
    const driverRow = await queryOne<{ code: string }>(
      `SELECT code FROM public.odg_tms_driver WHERE code = $1`,
      [candidateDriver]
    );
    const resolvedDriverCode = driverRow?.code ?? null;

    // Mobile submissions start as 'pending' — supervisor approves separately
    await query(
      `INSERT INTO public.odg_tms_inspect
         (inspect_code, car_code, year, month, inspect_date, inspect_time, driver_code, employee_code, odometer, note,
          approval_status)
       VALUES ($1, $2, $3, $4, $5::date, $6::time, $7, $8, $9, $10, 'pending')`,
      [
        inspect_code,
        input.vehicle_code,
        year,
        month,
        input.inspect_date,
        input.inspect_time ?? null,
        resolvedDriverCode,
        session.usercode,
        input.odometer ?? null,
        input.note ?? null,
      ]
    );

    if (input.details.length > 0) {
      const valuePlaceholders = input.details
        .map((_, i) => `($1, $2::date, $3::time, $${4 + i * 2}, $${5 + i * 2})`)
        .join(", ");
      const flatValues: unknown[] = [
        inspect_code,
        input.inspect_date,
        input.inspect_time ?? null,
        ...input.details.flatMap((d) => [d.item_code, d.status_code]),
      ];
      await query(
        `INSERT INTO public.odg_tms_inspect_detail
           (inspect_code, inspect_date, inspect_time, item_code, status_code)
         VALUES ${valuePlaceholders}`,
        flatValues
      );
    }

    const saved = await queryOne(
      `SELECT
         i.inspect_code,
         i.car_code AS vehicle_code,
         COALESCE(c.name_1, '') AS vehicle_name,
         TO_CHAR(i.inspect_date, 'YYYY-MM-DD') AS inspect_date,
         TO_CHAR(i.inspect_time, 'HH24:MI') AS inspect_time,
         i.driver_code,
         i.employee_code,
         COALESCE(
           NULLIF(TRIM(e.fullname_lo), ''),
           NULLIF(TRIM(e.nickname), ''),
           i.employee_code
         ) AS employee_name,
         i.odometer,
         i.note,
         TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') AS created_at,
         COALESCE(i.approval_status, 'pending') AS approval_status
       FROM public.odg_tms_inspect i
       LEFT JOIN public.odg_tms_car c ON c.code = i.car_code
       LEFT JOIN public.odg_employee e ON e.employee_code = i.employee_code
       WHERE i.inspect_code = $1`,
      [inspect_code]
    );

    return Response.json(saved, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom") ?? null;
    const dateTo = searchParams.get("dateTo") ?? null;
    const driverCode = searchParams.get("driver_code") ?? null;
    const pendingOnly = searchParams.get("pending_only") === "1";

    const conditions = [
      `($1::date IS NULL OR i.inspect_date >= $1::date)`,
      `($2::date IS NULL OR i.inspect_date <= $2::date)`,
      `($3::text IS NULL OR i.driver_code = $3 OR i.employee_code = $3)`,
    ];
    const params: unknown[] = [dateFrom, dateTo, driverCode];

    if (pendingOnly) {
      conditions.push(`COALESCE(i.approval_status, 'pending') = 'pending'`);
    }

    // Suppress unused variable warning — session auth is the purpose of this call
    void session;

    const data = await query(
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
         (SELECT COUNT(*) FROM public.odg_tms_inspect_detail d WHERE d.inspect_code = i.inspect_code) AS detail_count,
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
       WHERE ${conditions.join(" AND ")}
       ORDER BY i.inspect_date DESC, i.inspect_code DESC
       LIMIT 100`,
      params
    );

    return Response.json(data);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db.js";
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
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "inspect_time must be HH:MM or HH:MM:SS")
    .optional(),
  driver_code: z.string().trim().optional(),
  employee_code: z.string().trim().min(1, "employee_code is required"),
  odometer: z.number().min(0).optional(),
  note: z.string().trim().optional(),
  details: z.array(DetailSchema).min(1, "details is required"),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[inspections] request failed:", error);
  return Response.json({ error: msg }, { status: 500 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
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

    await query(
      `INSERT INTO public.odg_tms_inspect
         (inspect_code, car_code, year, month, inspect_date, inspect_time, driver_code, employee_code, odometer, note,
          approval_status, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::time, $7, $8, $9, $10, 'approved', $11, NOW())`,
      [
        inspect_code,
        input.vehicle_code,
        year,
        month,
        input.inspect_date,
        input.inspect_time ?? null,
        input.driver_code ?? null,
        input.employee_code,
        input.odometer ?? null,
        input.note ?? null,
        session.usercode,
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
         i.year,
         i.month,
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
         i.approval_status,
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
       LEFT JOIN public.odg_employee e ON e.employee_code = i.employee_code
       LEFT JOIN public.odg_employee ea ON ea.employee_code = i.approved_by
       WHERE i.inspect_code = $1`,
      [inspect_code]
    );

    revalidatePath("/inspection");
    return Response.json(saved, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom")?.trim() || null;
  const dateTo = searchParams.get("dateTo")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;

  try {
    const data = await query(
      `SELECT
         i.inspect_code,
         i.car_code AS vehicle_code,
         COALESCE(c.name_1, '') AS vehicle_name,
         i.year,
         i.month,
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
         CASE
           WHEN EXISTS(
             SELECT 1 FROM public.odg_tms_inspect_detail d
             WHERE d.inspect_code = i.inspect_code
               AND d.status_code = (SELECT status_code FROM public.odg_tms_inspect_status ORDER BY status_code ASC LIMIT 1 OFFSET 1)
           ) THEN 'critical'
           WHEN EXISTS(
             SELECT 1 FROM public.odg_tms_inspect_detail d
             WHERE d.inspect_code = i.inspect_code
               AND d.status_code != (SELECT MIN(status_code) FROM public.odg_tms_inspect_status)
           ) THEN 'warning'
           ELSE 'normal'
         END AS overall_status,
         TO_CHAR(i.inspect_date, 'YYYY-MM-DD') AS created_at,
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
       WHERE ($1::date IS NULL OR i.inspect_date >= $1::date)
         AND ($2::date IS NULL OR i.inspect_date <= $2::date)
         AND ($3::text IS NULL
              OR i.car_code ILIKE '%' || $3 || '%'
              OR COALESCE(c.name_1, '') ILIKE '%' || $3 || '%'
              OR i.employee_code ILIKE '%' || $3 || '%'
              OR COALESCE(e.fullname_lo, '') ILIKE '%' || $3 || '%')
       ORDER BY i.inspect_date DESC, i.inspect_code DESC
       LIMIT 200`,
      [dateFrom, dateTo, search]
    );
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

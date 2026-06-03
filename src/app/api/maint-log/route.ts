import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { parseJsonBody, ValidationError } from "@/lib/validation";
import {
  saveMaintLog,
  getMaintLogs,
  deleteMaintLog,
  getHandledInspectCodes,
  getLatestRuleOdometers,
  updatePaymentStatus,
} from "@/queries/maint-log.js";

const MaintLogSchema = z.object({
  car_code: z.string().trim().min(1, "car_code is required"),
  maint_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "maint_date must be YYYY-MM-DD")
    .optional(),
  odometer: z.number().min(0).optional(),
  inspect_code: z.string().trim().optional().nullable(),
  maint_note: z.string().trim().optional().nullable(),
  currency: z.enum(["LAK", "THB", "USD"]).default("LAK"),
  invoice_no: z.string().trim().optional().nullable(),
  repair_shop: z.string().trim().optional().nullable(),
  payment_status: z.enum(["pending", "paid"]).default("pending"),
  line_items: z.array(z.object({
    item_code: z.string().trim().optional().nullable(),
    item_name: z.string().trim().optional().nullable(),
    qty: z.number().min(0).default(1),
    unit_price: z.number().min(0).default(0),
  })).optional().default([]),
  receipt_files: z.array(z.object({
    name: z.string(),
    data: z.string(),
    type: z.string(),
  })).optional().default([]),
  payment_files: z.array(z.object({
    name: z.string(),
    data: z.string(),
    type: z.string(),
  })).optional().default([]),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[maint-log] request failed:", error);
  return Response.json({ error: msg }, { status: 500 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = await parseJsonBody(request, MaintLogSchema);
    const result = await saveMaintLog({ ...input, created_by: session.usercode });
    revalidatePath("/maint-log");
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get("mode") === "inspect_codes") {
    try {
      const codes = await getHandledInspectCodes();
      return Response.json(codes, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (searchParams.get("mode") === "schedule") {
    try {
      const rows = await getLatestRuleOdometers();
      return Response.json(rows, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const fromDate = searchParams.get("fromDate") ?? undefined;
  const toDate = searchParams.get("toDate") ?? undefined;
  const carCode = searchParams.get("carCode") ?? undefined;
  const search = searchParams.get("search")?.trim() ?? undefined;

  try {
    const data = await getMaintLogs({ fromDate, toDate, carCode, search });
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as {
      id: number;
      payment_status: string;
      receipt_files?: Array<{ name: string; data: string; type: string }>;
    };
    const id = Number(body.id);
    const status = body.payment_status;
    if (!id || !Number.isFinite(id)) return Response.json({ error: "id is required" }, { status: 400 });
    if (!["pending", "paid"].includes(status)) return Response.json({ error: "Invalid payment_status" }, { status: 400 });
    if (status === "paid" && (!body.receipt_files || body.receipt_files.length === 0)) {
      return Response.json({ error: "ກະລຸນາອັບໂຫຼດໃບບິນ/ໃບເສັດກ່ອນຊຳລະ" }, { status: 400 });
    }
    const result = await updatePaymentStatus(id, status, body.receipt_files ?? []);
    revalidatePath("/maint-log");
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id || !Number.isFinite(id)) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const result = await deleteMaintLog(id);
    revalidatePath("/maint-log");
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

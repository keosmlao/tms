import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getMaintPlans,
  getMaintPlanAlerts,
  saveMaintPlan,
  deleteMaintPlan,
} from "@/queries/maint-plan.js";

const MaintPlanSchema = z.object({
  plan_code:   z.string().trim().min(1, "plan_code is required"),
  car_code:    z.string().trim().min(1, "car_code is required"),
  rule_code:   z.string().trim().optional().nullable(),
  inspect_code:z.string().trim().optional().nullable(),
  next_due_km: z.number().min(0, "next_due_km >= 0"),
  maint_note:  z.string().trim().optional().nullable(),
});

function errorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[maint-plan]", error);
  return Response.json({ error: msg }, { status: 500 });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  try {
    if (searchParams.get("mode") === "alerts") {
      const alerts = await getMaintPlanAlerts();
      return Response.json(alerts, { headers: { "Cache-Control": "no-store" } });
    }
    const plans = await getMaintPlans();
    return Response.json(plans, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const input = MaintPlanSchema.parse(body);
    const result = await saveMaintPlan({ ...input, created_by: session.usercode });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const planCode = searchParams.get("plan_code");
  if (!planCode) return Response.json({ error: "plan_code is required" }, { status: 400 });

  try {
    const result = await deleteMaintPlan(planCode);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

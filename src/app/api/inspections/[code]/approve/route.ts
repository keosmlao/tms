import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db.js";
import { parseJsonBody, ValidationError } from "@/lib/validation";

const ApproveSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  note: z.string().trim().optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[inspections/approve] request failed:", error);
  return Response.json({ error: msg }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
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

    revalidatePath("/inspection");
    return Response.json({ success: true, approval_status: input.action });
  } catch (error) {
    return errorResponse(error);
  }
}

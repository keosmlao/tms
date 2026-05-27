import { z } from "zod";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseSearchParams, ValidationError } from "@/lib/validation";
import {
  searchDriverOptions,
  searchEmployeeOptions,
  searchVehicleOptions,
} from "@/queries/vehicle-query";

const OptionSearchSchema = z.object({
  type: z.enum(["vehicle", "employee", "driver"]),
  q: z.string().trim().max(80).optional().default(""),
  limit: z.coerce.number().int().min(1).max(500).optional().default(25),
});

function errorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
  }
  console.error("[inspection-options] request failed:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(request, {
    bucket: "inspection-options",
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const params = parseSearchParams(
      new URL(request.url).searchParams,
      OptionSearchSchema
    );
    const data =
      params.type === "vehicle"
        ? await searchVehicleOptions(params.q, params.limit)
        : params.type === "driver"
          ? await searchDriverOptions(params.q, params.limit)
          : await searchEmployeeOptions(params.q, params.limit);

    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

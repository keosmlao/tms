import { getSession } from "@/lib/auth";
import { getCarDefaults } from "@/queries/maint-log.js";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const carCode = searchParams.get("car_code")?.trim();
  if (!carCode) return Response.json({ error: "car_code is required" }, { status: 400 });

  try {
    const data = await getCarDefaults(carCode);
    return Response.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[maint-log/defaults]", error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

import { getInspectItems, getInspectStatuses } from "@/queries/vehicle-query";
import { mobileErrorResponse, requireMobileSession } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const [items, statuses] = await Promise.all([
      getInspectItems(),
      getInspectStatuses(),
    ]);
    return Response.json({ items, statuses });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

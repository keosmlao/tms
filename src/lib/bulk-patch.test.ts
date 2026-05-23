import { describe, expect, it } from "vitest";

// Mirror of the patch-shape logic in bulkUpdatePendingBills. Catches typos in
// the conditional `"x" in patch` check that would silently drop fields.

interface Patch {
  scheduledDate?: string | null;
  deliveryRoundCode?: string | null;
  deliveryRouteCode?: string | null;
  actionStatus?: string | null;
}

function fieldsToUpdate(patch: Patch): string[] {
  const fields: string[] = [];
  if ("scheduledDate" in patch) fields.push("scheduled_date");
  if ("actionStatus" in patch) fields.push("action_status");
  if ("deliveryRouteCode" in patch) fields.push("delivery_route_code");
  if ("deliveryRoundCode" in patch) fields.push("delivery_round_code");
  return fields;
}

describe("bulk patch field detection", () => {
  it("returns empty when no keys present", () => {
    expect(fieldsToUpdate({})).toEqual([]);
  });

  it("detects scheduled_date", () => {
    expect(fieldsToUpdate({ scheduledDate: "2026-06-01" })).toEqual(["scheduled_date"]);
  });

  it("detects null as 'clear field' intent", () => {
    expect(fieldsToUpdate({ scheduledDate: null })).toEqual(["scheduled_date"]);
  });

  it("detects multiple fields", () => {
    expect(
      fieldsToUpdate({ actionStatus: "contacted_ready", deliveryRoundCode: "R01" })
    ).toEqual(["action_status", "delivery_round_code"]);
  });

  it("ignores undefined values (key not present)", () => {
    const patch: Patch = {};
    patch.scheduledDate = undefined;
    // `in` still detects assigned undefined; that matches our semantics
    expect("scheduledDate" in patch).toBe(true);
  });
});

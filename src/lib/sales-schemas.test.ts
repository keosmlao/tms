import { describe, expect, it } from "vitest";
import { SalesDailyBillsQuery, SalesScheduleSave } from "./sales-schemas";

describe("SalesDailyBillsQuery", () => {
  it("accepts a valid date + search", () => {
    const r = SalesDailyBillsQuery.safeParse({ date: "2026-06-10", search: " abc " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.date).toBe("2026-06-10");
      expect(r.data.search).toBe("abc"); // trimmed
    }
  });

  it("treats null/missing date and empty search as undefined", () => {
    const r = SalesDailyBillsQuery.safeParse({ date: null, search: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.date).toBeUndefined();
      expect(r.data.search).toBeUndefined();
    }
    const empty = SalesDailyBillsQuery.safeParse({});
    expect(empty.success).toBe(true);
  });

  it("rejects a malformed or empty-string date", () => {
    expect(SalesDailyBillsQuery.safeParse({ date: "10/06/2026" }).success).toBe(false);
    expect(SalesDailyBillsQuery.safeParse({ date: "2026-6-1" }).success).toBe(false);
    // Empty string is NOT accepted — callers must omit the field or send null.
    expect(SalesDailyBillsQuery.safeParse({ date: "" }).success).toBe(false);
  });
});

describe("SalesScheduleSave", () => {
  it("accepts bill_no with date + branch", () => {
    const r = SalesScheduleSave.safeParse({
      bill_no: "S-001",
      scheduled_date: "2026-06-10",
      transport_code: "02-0001",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.bill_no).toBe("S-001");
      expect(r.data.scheduled_date).toBe("2026-06-10");
      expect(r.data.transport_code).toBe("02-0001");
    }
  });

  it("allows clearing date + branch (null -> undefined)", () => {
    const r = SalesScheduleSave.safeParse({
      bill_no: "S-001",
      scheduled_date: null,
      transport_code: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.scheduled_date).toBeUndefined();
      expect(r.data.transport_code).toBeUndefined();
    }
    // An empty branch string collapses to undefined; an empty date is rejected.
    const branchEmpty = SalesScheduleSave.safeParse({ bill_no: "S-001", transport_code: "" });
    expect(branchEmpty.success).toBe(true);
    if (branchEmpty.success) expect(branchEmpty.data.transport_code).toBeUndefined();
  });

  it("rejects an empty bill_no", () => {
    expect(
      SalesScheduleSave.safeParse({ bill_no: "   ", scheduled_date: "2026-06-10" }).success
    ).toBe(false);
    expect(SalesScheduleSave.safeParse({ scheduled_date: "2026-06-10" }).success).toBe(false);
  });

  it("rejects a malformed scheduled_date", () => {
    expect(
      SalesScheduleSave.safeParse({ bill_no: "S-001", scheduled_date: "2026/06/10" }).success
    ).toBe(false);
  });
});

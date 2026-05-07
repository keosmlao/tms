import { describe, expect, it } from "vitest";
import {
  JobActionSchema,
  LoginSchema,
  PublicTrackSchema,
  FuelListQuerySchema,
} from "./mobile-schemas";

describe("LoginSchema", () => {
  it("accepts valid creds", () => {
    expect(LoginSchema.parse({ username: "u1", password: "pw" })).toEqual({
      username: "u1",
      password: "pw",
    });
  });
  it("rejects empty username", () => {
    expect(() => LoginSchema.parse({ username: "", password: "x" })).toThrow();
  });
});

describe("JobActionSchema", () => {
  it("validates 'receive' branch", () => {
    expect(JobActionSchema.parse({ action: "receive", doc_no: "D1" })).toEqual({
      action: "receive",
      doc_no: "D1",
    });
  });

  it("rejects unknown action", () => {
    expect(() => JobActionSchema.parse({ action: "nope" })).toThrow();
  });

  it("complete_bill defaults items to empty array", () => {
    const out = JobActionSchema.parse({ action: "complete_bill", bill_no: "B1" });
    expect(out).toMatchObject({ action: "complete_bill", bill_no: "B1", items: [] });
  });

  it("attach_bill_image rejects unknown kind", () => {
    expect(() =>
      JobActionSchema.parse({
        action: "attach_bill_image",
        bill_no: "B1",
        kind: "weird",
      })
    ).toThrow();
  });

  it("fuel_refill coerces numeric strings", () => {
    const out = JobActionSchema.parse({
      action: "fuel_refill",
      user_code: "U1",
      liters: "10.5",
      amount: "200000",
    });
    expect(out).toMatchObject({ liters: 10.5, amount: 200000 });
  });
});

describe("PublicTrackSchema", () => {
  it("trims and requires non-empty bill_no", () => {
    expect(PublicTrackSchema.parse({ bill_no: " B1 " })).toEqual({ bill_no: "B1" });
    expect(() => PublicTrackSchema.parse({ bill_no: "" })).toThrow();
  });
});

describe("FuelListQuerySchema", () => {
  it("validates date format", () => {
    expect(() => FuelListQuerySchema.parse({ from: "yesterday" })).toThrow();
    expect(FuelListQuerySchema.parse({ from: "2026-05-01" })).toMatchObject({
      from: "2026-05-01",
    });
  });
  it("rejects non-numeric limit", () => {
    expect(() => FuelListQuerySchema.parse({ limit: "abc" })).toThrow();
  });
});

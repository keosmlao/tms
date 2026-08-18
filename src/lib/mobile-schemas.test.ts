import { describe, expect, it } from "vitest";
import {
  JobActionSchema,
  LoginSchema,
  LocationBatchSchema,
  PublicTrackSchema,
  FuelListQuerySchema,
  JobsListQuerySchema,
  NotificationsListQuerySchema,
  NotificationsMarkReadSchema,
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

  it("fuel_refill accepts a known fuel_type and rejects an unknown one", () => {
    expect(
      JobActionSchema.parse({
        action: "fuel_refill",
        user_code: "U1",
        liters: 10,
        amount: 200000,
        fuel_type: "ptt_voucher",
      })
    ).toMatchObject({ fuel_type: "ptt_voucher" });

    expect(() =>
      JobActionSchema.parse({
        action: "fuel_refill",
        user_code: "U1",
        liters: 10,
        amount: 200000,
        fuel_type: "credit_card",
      })
    ).toThrow();
  });

  it("fuel_refill stays valid when the app omits fuel_type", () => {
    const out = JobActionSchema.parse({
      action: "fuel_refill",
      user_code: "U1",
      liters: 10,
      amount: 200000,
    });
    expect(out).toMatchObject({ action: "fuel_refill" });
  });

  it("validates 'tracking_status' branch", () => {
    expect(
      JobActionSchema.parse({
        action: "tracking_status",
        doc_no: "D1",
        status: "gps_off",
      })
    ).toEqual({ action: "tracking_status", doc_no: "D1", status: "gps_off" });
  });

  it("tracking_status rejects an unknown status", () => {
    expect(() =>
      JobActionSchema.parse({
        action: "tracking_status",
        doc_no: "D1",
        status: "battery_low",
      })
    ).toThrow();
  });
});

describe("PublicTrackSchema", () => {
  it("trims and requires non-empty bill_no", () => {
    expect(PublicTrackSchema.parse({ bill_no: " B1 " })).toEqual({ bill_no: "B1" });
    expect(() => PublicTrackSchema.parse({ bill_no: "" })).toThrow();
  });
});

describe("LocationBatchSchema", () => {
  it("accepts a batch of points with optional recorded_at", () => {
    const out = LocationBatchSchema.parse({
      doc_no: "D1",
      points: [
        { lat: "17.975615", lng: "102.556761", recorded_at: "2026-06-01 15:46:08" },
        { lat: "-17.1", lng: "102.2" },
      ],
    });
    expect(out.doc_no).toBe("D1");
    expect(out.points).toHaveLength(2);
    // recorded_at is normalized to undefined when absent
    expect(out.points[1].recorded_at).toBeUndefined();
  });

  it("accepts imei, device info, and per-point telemetry", () => {
    const out = LocationBatchSchema.parse({
      doc_no: "D1",
      imei: "359292060123456",
      device: {
        model: "SM-A155",
        os_version: "Android 14",
        app_version: "1.2.3",
        carrier: "LTC",
        sim_phone: "2055512345",
      },
      points: [
        {
          lat: "17.9",
          lng: "102.5",
          speed: "12",
          heading: "180",
          accuracy: "5",
          battery: "87",
          signal: "-71",
        },
      ],
    });
    expect(out.imei).toBe("359292060123456");
    expect(out.device).toMatchObject({ model: "SM-A155", sim_phone: "2055512345" });
    expect(out.points[0]).toMatchObject({ speed: "12", battery: "87", accuracy: "5" });
  });

  it("treats imei, device, and telemetry as optional", () => {
    const out = LocationBatchSchema.parse({
      doc_no: "D1",
      points: [{ lat: "1", lng: "2" }],
    });
    expect(out.imei).toBeUndefined();
    expect(out.device).toBeUndefined();
    expect(out.points[0].battery).toBeUndefined();
  });

  it("requires numeric lat/lng on every point", () => {
    expect(() =>
      LocationBatchSchema.parse({ doc_no: "D1", points: [{ lat: "abc", lng: "1" }] })
    ).toThrow();
    expect(() =>
      LocationBatchSchema.parse({ doc_no: "D1", points: [{ lat: "1" }] })
    ).toThrow();
  });

  it("rejects an empty or missing points array", () => {
    expect(() => LocationBatchSchema.parse({ doc_no: "D1", points: [] })).toThrow();
    expect(() => LocationBatchSchema.parse({ doc_no: "D1" })).toThrow();
  });

  it("rejects a missing doc_no", () => {
    expect(() =>
      LocationBatchSchema.parse({ points: [{ lat: "1", lng: "2" }] })
    ).toThrow();
  });

  it("rejects a malformed recorded_at", () => {
    expect(() =>
      LocationBatchSchema.parse({
        doc_no: "D1",
        points: [{ lat: "1", lng: "2", recorded_at: "yesterday" }],
      })
    ).toThrow();
  });

  it("caps batch size at 1000 points", () => {
    const points = Array.from({ length: 1001 }, () => ({ lat: "1", lng: "2" }));
    expect(() => LocationBatchSchema.parse({ doc_no: "D1", points })).toThrow();
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

describe("JobsListQuerySchema", () => {
  it("accepts a report date range", () => {
    expect(
      JobsListQuerySchema.parse({
        scope: "report",
        from: "2026-07-01",
        to: "2026-07-27",
      })
    ).toMatchObject({
      scope: "report",
      from: "2026-07-01",
      to: "2026-07-27",
    });
  });

  it("rejects malformed report dates", () => {
    expect(() =>
      JobsListQuerySchema.parse({
        scope: "report",
        from: "01-07-2026",
        to: "2026-07-27",
      })
    ).toThrow();
  });

  it("coerces days from a query-string number", () => {
    expect(JobsListQuerySchema.parse({ days: "7" })).toMatchObject({
      days: 7,
    });
  });

  it("leaves days undefined when omitted", () => {
    expect(JobsListQuerySchema.parse({}).days).toBeUndefined();
  });

  it("rejects non-positive or fractional days", () => {
    expect(() => JobsListQuerySchema.parse({ days: "0" })).toThrow();
    expect(() => JobsListQuerySchema.parse({ days: "-3" })).toThrow();
    expect(() => JobsListQuerySchema.parse({ days: "2.5" })).toThrow();
    expect(() => JobsListQuerySchema.parse({ days: "400" })).toThrow();
  });
});

describe("NotificationsListQuerySchema", () => {
  it("coerces limit and allows omission", () => {
    expect(NotificationsListQuerySchema.parse({ limit: "20" })).toMatchObject({
      limit: 20,
    });
    expect(NotificationsListQuerySchema.parse({}).limit).toBeUndefined();
  });

  it("rejects out-of-range limits", () => {
    expect(() => NotificationsListQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() =>
      NotificationsListQuerySchema.parse({ limit: "500" })
    ).toThrow();
  });
});

describe("NotificationsMarkReadSchema", () => {
  it("accepts mark_read with ids", () => {
    expect(
      NotificationsMarkReadSchema.parse({ action: "mark_read", ids: [1, "2"] })
    ).toMatchObject({ action: "mark_read", ids: [1, 2] });
  });

  it("accepts mark_read without ids (mark all)", () => {
    expect(
      NotificationsMarkReadSchema.parse({ action: "mark_read" }).ids
    ).toBeUndefined();
  });

  it("rejects unknown actions and bad ids", () => {
    expect(() =>
      NotificationsMarkReadSchema.parse({ action: "delete" })
    ).toThrow();
    expect(() =>
      NotificationsMarkReadSchema.parse({ action: "mark_read", ids: [0] })
    ).toThrow();
  });
});

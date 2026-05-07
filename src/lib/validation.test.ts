import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseJsonBody,
  parseSearchParams,
  ValidationError,
  NonEmptyString,
  DataUri,
} from "./validation";

const schema = z.object({ name: NonEmptyString, age: z.coerce.number() });

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("parseJsonBody", () => {
  it("parses valid bodies", async () => {
    const out = await parseJsonBody(jsonRequest({ name: "alice", age: "21" }), schema);
    expect(out).toEqual({ name: "alice", age: 21 });
  });

  it("trims strings", async () => {
    const out = await parseJsonBody(jsonRequest({ name: "  bob  ", age: "1" }), schema);
    expect(out.name).toBe("bob");
  });

  it("throws ValidationError on invalid input", async () => {
    await expect(parseJsonBody(jsonRequest({ name: "" }), schema)).rejects.toThrow(
      ValidationError
    );
  });

  it("ValidationError has 400 status and zod issues", async () => {
    try {
      await parseJsonBody(jsonRequest({}), schema);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).status).toBe(400);
      expect((e as ValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it("treats malformed JSON as an empty object", async () => {
    const req = new Request("http://test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    await expect(parseJsonBody(req, schema)).rejects.toThrow(ValidationError);
  });
});

describe("parseSearchParams", () => {
  it("converts URLSearchParams via the schema", () => {
    const out = parseSearchParams(
      new URLSearchParams("name=carol&age=30"),
      schema
    );
    expect(out).toEqual({ name: "carol", age: 30 });
  });
});

describe("DataUri", () => {
  it("accepts a valid image data URI", () => {
    expect(DataUri.parse("data:image/png;base64,iVBOR")).toBe(
      "data:image/png;base64,iVBOR"
    );
  });
  it("rejects non-image URIs", () => {
    expect(() => DataUri.parse("data:application/json;base64,xxx")).toThrow();
  });
  it("rejects oversized payloads", () => {
    const huge = "data:image/png;base64," + "A".repeat(8 * 1024 * 1024 + 1);
    expect(() => DataUri.parse(huge)).toThrow();
  });
});

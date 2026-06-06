import { describe, expect, it } from "vitest";
import {
  normalizeMsgType,
  serializeMentions,
  mentionsInclude,
  isSalesUser,
  isChatterAdmin,
  shouldNotifyChatter,
  collectChatterRecipients,
  parseDataUrl,
} from "./chatter-helpers";

describe("normalizeMsgType", () => {
  it("keeps note and system, defaults everything else to comment", () => {
    expect(normalizeMsgType("note")).toBe("note");
    expect(normalizeMsgType("system")).toBe("system");
    expect(normalizeMsgType("comment")).toBe("comment");
    expect(normalizeMsgType("anything")).toBe("comment");
    expect(normalizeMsgType(undefined)).toBe("comment");
    expect(normalizeMsgType(null)).toBe("comment");
  });
});

describe("serializeMentions", () => {
  it("joins an array of codes into a trimmed CSV", () => {
    expect(serializeMentions(["A1", " B2 ", "C3"])).toBe("A1,B2,C3");
  });
  it("drops blanks and returns null when empty", () => {
    expect(serializeMentions(["", "  "])).toBeNull();
    expect(serializeMentions([])).toBeNull();
    expect(serializeMentions(undefined)).toBeNull();
  });
  it("accepts an existing CSV string", () => {
    expect(serializeMentions("A1, B2")).toBe("A1,B2");
  });
});

describe("mentionsInclude", () => {
  it("matches a whole code, not a substring", () => {
    expect(mentionsInclude("EMP1,EMP22,EMP3", "EMP22")).toBe(true);
    expect(mentionsInclude("EMP1,EMP22,EMP3", "EMP2")).toBe(false);
    expect(mentionsInclude("EMP1", "EMP1")).toBe(true);
  });
  it("is false for empty inputs", () => {
    expect(mentionsInclude(null, "EMP1")).toBe(false);
    expect(mentionsInclude("EMP1", "")).toBe(false);
  });
});

describe("isSalesUser / isChatterAdmin", () => {
  it("treats a 2xx department non-management user as sales", () => {
    expect(isSalesUser({ emp_department_code: "201", title: "Sales" })).toBe(true);
    expect(isChatterAdmin({ emp_department_code: "201", title: "Sales" })).toBe(false);
  });
  it("exempts top management / superuser even in a sales department", () => {
    expect(isSalesUser({ emp_department_code: "208", title: "Top Management" })).toBe(false);
    expect(isChatterAdmin({ emp_department_code: "208", title: "Superuser" })).toBe(true);
  });
  it("treats non-sales departments as admin", () => {
    expect(isSalesUser({ emp_department_code: "101", title: "Dispatch" })).toBe(false);
    expect(isChatterAdmin({ emp_department_code: "", title: "" })).toBe(true);
    expect(isChatterAdmin(null)).toBe(true);
  });
});

describe("shouldNotifyChatter", () => {
  const base = { userCode: "U1", isAdmin: false, authorCode: "U2", billSaleCode: "U9" };

  it("never notifies the author of their own message", () => {
    expect(shouldNotifyChatter({ ...base, userCode: "U2", isAdmin: true })).toBe(false);
  });
  it("notifies a mentioned user", () => {
    expect(shouldNotifyChatter({ ...base, mentionsCsv: "U1,U5" })).toBe(true);
  });
  it("notifies a follower", () => {
    expect(shouldNotifyChatter({ ...base, isFollower: true })).toBe(true);
  });
  it("notifies the bill's salesperson", () => {
    expect(shouldNotifyChatter({ ...base, userCode: "U9" })).toBe(true);
  });
  it("notifies an admin about anything", () => {
    expect(shouldNotifyChatter({ ...base, isAdmin: true })).toBe(true);
  });
  it("does not notify an unrelated, non-admin user", () => {
    expect(shouldNotifyChatter({ ...base, userCode: "U7" })).toBe(false);
  });
  it("requires a user code", () => {
    expect(shouldNotifyChatter({ ...base, userCode: "" })).toBe(false);
  });
});

describe("parseDataUrl", () => {
  it("splits a base64 data URL into mime + payload", () => {
    const r = parseDataUrl("data:image/png;base64,AAAB");
    expect(r).toEqual({ mime: "image/png", base64: "AAAB" });
  });
  it("returns null for non-data-URLs or empty payloads", () => {
    expect(parseDataUrl("https://x/y.png")).toBeNull();
    expect(parseDataUrl("data:image/png;base64,")).toBeNull();
    expect(parseDataUrl("")).toBeNull();
  });
});

describe("collectChatterRecipients", () => {
  it("unions mentions, followers and salesperson, excluding the author", () => {
    const r = collectChatterRecipients({
      mentions: ["M1", "M2"],
      followers: ["F1", "AUTHOR"],
      saleCode: "S1",
      authorCode: "AUTHOR",
    });
    expect(r.sort()).toEqual(["F1", "M1", "M2", "S1"]);
    expect(r).not.toContain("AUTHOR");
  });
  it("dedupes overlapping codes", () => {
    const r = collectChatterRecipients({ mentions: "X1", followers: ["X1"], saleCode: "X1", authorCode: "Z" });
    expect(r).toEqual(["X1"]);
  });
  it("handles empty input", () => {
    expect(collectChatterRecipients({})).toEqual([]);
  });
});

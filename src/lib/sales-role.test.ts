import { describe, expect, it } from "vitest";
import { getSalesRole, isSalesLogin } from "./sales-role";

describe("getSalesRole", () => {
  it("prefers app_role when present", () => {
    expect(getSalesRole({ app_role: "manager" })).toBe("manager");
    expect(getSalesRole({ app_role: "head" })).toBe("head");
    expect(getSalesRole({ app_role: "salesperson" })).toBe("salesperson");
    expect(getSalesRole({ app_role: "pc" })).toBe("salesperson");
  });

  it("falls back to position_code when app_role is blank", () => {
    expect(getSalesRole({ position_code: "11" })).toBe("manager");
    expect(getSalesRole({ position_code: "12" })).toBe("head");
    expect(getSalesRole({ position_code: "13" })).toBe("salesperson");
  });

  it("returns empty for unknown roles", () => {
    expect(getSalesRole({ position_code: "99" })).toBe("");
    expect(getSalesRole({})).toBe("");
    expect(getSalesRole(null)).toBe("");
  });
});

describe("isSalesLogin", () => {
  it("treats 2xx departments as sales", () => {
    expect(isSalesLogin({ emp_department_code: "201" })).toBe(true);
    expect(isSalesLogin({ emp_department_code: "208", title: "Sales" })).toBe(true);
  });

  it("excludes company-wide roles even in a 2xx department", () => {
    expect(isSalesLogin({ emp_department_code: "201", title: "Top Management" })).toBe(false);
    expect(isSalesLogin({ emp_department_code: "201", title: "superuser" })).toBe(false);
  });

  it("rejects non-2xx departments", () => {
    expect(isSalesLogin({ emp_department_code: "101" })).toBe(false);
    expect(isSalesLogin({ emp_department_code: "" })).toBe(false);
    expect(isSalesLogin(null)).toBe(false);
  });
});

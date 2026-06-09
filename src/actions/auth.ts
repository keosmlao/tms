"use server";

import {
  getSession,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { queryOne, query } from "@/lib/db.js";
import { headers } from "next/headers";

async function requestAuditMeta() {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = h.get("x-real-ip")?.trim();
  return {
    ipAddr: forwardedFor || realIp || null,
    userAgent: h.get("user-agent") || null,
  };
}

export async function login(username: string, password: string) {
  const { recordAudit } = await import("@/queries/audit-log.js");
  const auditMeta = await requestAuditMeta();
  const user = await queryOne(
    "SELECT code, name_1, department, logistic_code, title FROM erp_user WHERE code = $1 AND password = $2",
    [username, password]
  );
  if (!user) {
    await recordAudit({
      action: "auth.login_failed",
      entityType: "user",
      entityId: username,
      userCode: username,
      ipAddr: auditMeta.ipAddr,
      changes: { user_agent: auditMeta.userAgent },
    });
    throw new Error("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ!");
  }
  // odg_employee carries the role (app_role / position_code) + the canonical
  // department_code used to confine a salesperson to their department's bills.
  const emp = await queryOne(
    `SELECT e.department_code, e.app_role, e.position_code,
            CASE COALESCE(e.position_code, '')
              WHEN '11' THEN 'ຜູ້ຈັດການພະແນກ'
              WHEN '12' THEN 'ຫົວໜ້າໜ່ວຍງານ'
              WHEN '13' THEN 'ພະນັກງານ'
              ELSE ''
            END AS position_title,
            COALESCE(NULLIF(TRIM(d.department_name_lo), ''), '') AS department_name
     FROM public.odg_employee e
     LEFT JOIN public.odg_department d ON d.department_code = e.department_code
     WHERE e.employee_code = $1 LIMIT 1`,
    [user.code]
  );
  // A transport worker can be assigned MORE than one branch for the web dispatch
  // screens (odg_tms_worker_dispatch_branch). When set, this widens getBranchScope
  // to that set; otherwise the screens keep using the single logistic_code.
  const dispatchBranchRows = await query(
    "SELECT transport_code FROM public.odg_tms_worker_dispatch_branch WHERE worker_code = $1 ORDER BY transport_code",
    [user.code]
  ).catch(() => []);
  const branch_codes = dispatchBranchRows
    .map((r: { transport_code: string }) => String(r.transport_code ?? "").trim())
    .filter(Boolean)
    .join(",");
  await setSessionCookie({
    usercode: user.code,
    username: user.name_1,
    logistic_code: user.logistic_code ?? "",
    department: user.department ?? "",
    title: user.title ?? "",
    emp_department_code: emp?.department_code ?? "",
    emp_department_name: emp?.department_name ?? "",
    position_title: emp?.position_title ?? "",
    app_role: emp?.app_role ?? "",
    position_code: emp?.position_code ?? "",
    branch_codes,
  });
  const { touchUserPresence } = await import("@/queries/presence.js");
  await ((touchUserPresence as unknown) as (input: Record<string, unknown>) => Promise<unknown>)({
    session: {
      usercode: user.code,
      username: user.name_1,
      logistic_code: user.logistic_code ?? "",
      title: user.title ?? "",
    },
    source: "web",
    ipAddr: auditMeta.ipAddr,
    userAgent: auditMeta.userAgent,
  });
  await recordAudit({
    action: "auth.login",
    entityType: "user",
    entityId: user.code,
    userCode: user.code,
    ipAddr: auditMeta.ipAddr,
    changes: {
      username: user.name_1,
      title: user.title ?? "",
      department: user.department ?? "",
      logistic_code: user.logistic_code ?? "",
      app_role: emp?.app_role ?? "",
      position_code: emp?.position_code ?? "",
      user_agent: auditMeta.userAgent,
    },
  });
  return {
    success: true,
    user: { code: user.code, name: user.name_1, title: user.title ?? "" },
  };
}

export async function logout() {
  const session = await getSession();
  const { recordAudit } = await import("@/queries/audit-log.js");
  const auditMeta = await requestAuditMeta();
  await clearSessionCookie();
  if (session?.usercode) {
    const { markUserOffline } = await import("@/queries/presence.js");
    await ((markUserOffline as unknown) as (input: Record<string, unknown>) => Promise<unknown>)({
      session,
      source: "web",
      ipAddr: auditMeta.ipAddr,
      userAgent: auditMeta.userAgent,
    });
    await recordAudit({
      action: "auth.logout",
      entityType: "user",
      entityId: session.usercode,
      userCode: session.usercode,
      ipAddr: auditMeta.ipAddr,
      changes: {
        username: session.username,
        user_agent: auditMeta.userAgent,
      },
    });
  }
  return { success: true };
}

export async function me() {
  const session = await getSession();
  if (!session) return null;
  // Resolve the live multi-branch dispatch set so the client session (and the
  // trip-creation branch picker) reflect admin re-assignments without re-login.
  const { withLiveBranchCodes } = await import("./_helpers");
  return withLiveBranchCodes(session);
}

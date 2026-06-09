import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface Session {
  usercode: string;
  username: string;
  logistic_code: string;
  department: string;
  title: string;
  emp_department_code: string;
  emp_department_name: string;
  position_title: string;
  app_role: string;
  position_code: string;
  // Comma-separated set of transport branch codes this user may see on the web
  // dispatch screens. Empty = fall back to logistic_code (legacy single branch).
  branch_codes: string;
}

const COOKIE_NAME = "token";
const MAX_AGE_SECONDS = 8 * 60 * 60;

function getJwtSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value === "default-secret-change-me") {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(value);
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return {
    usercode: String(payload.usercode ?? ""),
    username: String(payload.username ?? ""),
    logistic_code: String(payload.logistic_code ?? ""),
    department: String(payload.department ?? ""),
    title: String(payload.title ?? ""),
    emp_department_code: String(payload.emp_department_code ?? ""),
    emp_department_name: String(payload.emp_department_name ?? ""),
    position_title: String(payload.position_title ?? ""),
    app_role: String(payload.app_role ?? ""),
    position_code: String(payload.position_code ?? ""),
    branch_codes: String(payload.branch_codes ?? ""),
  };
}

export async function setSessionCookie(session: Session): Promise<void> {
  const token = await createToken({ ...session });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === "true",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === "true",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

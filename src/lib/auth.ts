import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface Session {
  usercode: string;
  username: string;
  logistic_code: string;
  title: string;
}

const COOKIE_NAME = "token";
const MAX_AGE_SECONDS = 8 * 60 * 60;

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "default-secret-change-me"
);

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
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
    title: String(payload.title ?? ""),
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

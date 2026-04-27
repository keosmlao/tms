"use server";

import {
  getSession,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { queryOne } from "@/lib/db.js";

export async function login(username: string, password: string) {
  const user = await queryOne(
    "SELECT code, name_1, department, logistic_code, title FROM erp_user WHERE code = $1 AND password = $2",
    [username, password]
  );
  if (!user) {
    throw new Error("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ!");
  }
  await setSessionCookie({
    usercode: user.code,
    username: user.name_1,
    logistic_code: user.logistic_code ?? "",
    title: user.title ?? "",
  });
  return {
    success: true,
    user: { code: user.code, name: user.name_1, title: user.title ?? "" },
  };
}

export async function logout() {
  await clearSessionCookie();
  return { success: true };
}

export async function me() {
  return await getSession();
}

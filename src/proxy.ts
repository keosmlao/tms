import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value === "default-secret-change-me") {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(value);
}

async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getJwtSecret());
    return true;
  } catch {
    return false;
  }
}

// Routes reachable without a staff login. `/tv` is the wall-mounted delivery
// monitor: it has no keyboard to log in with and guards itself with the
// TV_DASHBOARD_TOKEN key its data endpoint requires, so the page shell is left
// open here and the data behind it is not.
const PUBLIC_PREFIXES = ["/track", "/tv"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const valid = await isValidToken(token);

  if (pathname === "/login") {
    if (valid) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Public static downloads from /public (the driver APK) must be reachable
  // without a session — otherwise the auth redirect serves the login HTML in
  // place of the file and in-app updates silently break.
  if (pathname.endsWith(".apk")) {
    return NextResponse.next();
  }

  // ໄຟລ໌ເວີຊັນຂອງ APK — ໜ້າ /login ດຶງມາສະແດງຂ້າງປຸ່ມດາວໂຫຼດ. ບໍ່ມີ session
  // ຢູ່ໜ້ານັ້ນ ຈຶ່ງຕ້ອງເປີດຄືກັນກັບຕົວ APK ເອງ.
  if (pathname === "/tms.apk.version") {
    return NextResponse.next();
  }

  // ໄຟລ໌ໂລໂກ້ ຖືກອ້າງອີງໂດຍໜ້າ /login ເອງ ຈຶ່ງຕ້ອງເອີ້ນໄດ້ໂດຍບໍ່ຕ້ອງມີ session —
  // ຖ້າບໍ່ດັ່ງນັ້ນ redirect ຈະສົ່ງ HTML ຂອງໜ້າ login ມາແທນ PNG ແລ້ວໂລໂກ້ຈະບໍ່ຂຶ້ນ.
  if (pathname.startsWith("/brand/") || pathname === "/odg.png") {
    return NextResponse.next();
  }

  if (!valid) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude /api/* (mobile API uses own auth), Next internals, static assets.
    // Server Actions run through page routes and are handled by this proxy.
    "/((?!api|_next/static|_next/image|favicon.ico|firebase-service-account.json).*)",
  ],
};

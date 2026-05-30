import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, readCookieValue, verifyAdminSessionToken } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const token = readCookieValue(req.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  return NextResponse.json({ authenticated: verifyAdminSessionToken(token) });
}


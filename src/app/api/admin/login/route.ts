import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, validateCommandSequence } from "@/lib/admin-auth";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const commands = Array.isArray(data?.commands) ? data.commands.map(String) : [];

    if (!validateCommandSequence(commands)) {
      return NextResponse.json({ error: "Invalid command sequence" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: createAdminSessionToken(),
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


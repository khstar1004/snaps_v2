import { NextRequest, NextResponse } from "next/server";
import { AUTH_CLIENT_SCOPE_COOKIE, AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE } from "@/lib/auth/constants";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const secure = request.nextUrl.protocol === "https:";

  for (const [name, httpOnly] of [
    [AUTH_SESSION_COOKIE, true],
    [AUTH_WORKSPACE_COOKIE, true],
    [AUTH_CLIENT_SCOPE_COOKIE, false],
  ] as const) {
    response.cookies.set({
      name,
      value: "",
      httpOnly,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

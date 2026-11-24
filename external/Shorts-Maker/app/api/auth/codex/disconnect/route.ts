import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CODEX_OAUTH_ACCESS_TOKEN_COOKIE = "codex_oauth_access_token";
const CODEX_OAUTH_REFRESH_TOKEN_COOKIE = "codex_oauth_refresh_token";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const secure = request.nextUrl.protocol === "https:";
  for (const name of [CODEX_OAUTH_ACCESS_TOKEN_COOKIE, CODEX_OAUTH_REFRESH_TOKEN_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}


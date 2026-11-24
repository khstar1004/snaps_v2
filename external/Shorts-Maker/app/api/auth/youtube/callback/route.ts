import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/api";
import { normalizeSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { getYoutubeAccount, upsertYoutubeAccount } from "@/lib/publish/publish-store";
import { exchangeYoutubeCode } from "@/lib/publish/youtube";

export const runtime = "nodejs";
const YOUTUBE_OAUTH_NONCE_COOKIE = "yt_oauth_nonce";

function parseState(stateRaw: string | null): { redirectPath: string; nonce: string; userId: string } {
  const fallback = { redirectPath: "/publish", nonce: "", userId: "" };
  if (!stateRaw) return fallback;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as { redirect?: string; nonce?: string; uid?: string };
    const redirectPath = normalizeSafeRedirectPath(decoded.redirect);
    const nonce = typeof decoded.nonce === "string" ? decoded.nonce.trim() : "";
    const userId = typeof decoded.uid === "string" ? decoded.uid.trim() : "";
    return { redirectPath, nonce, userId };
  } catch {
    return fallback;
  }
}

function withNonceCookieCleared(response: NextResponse): NextResponse {
  response.cookies.set({
    name: YOUTUBE_OAUTH_NONCE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const error = request.nextUrl.searchParams.get("error") || "";
  const state = parseState(request.nextUrl.searchParams.get("state"));
  const redirectPath = normalizeSafeRedirectPath(state.redirectPath);
  const nonceCookie = request.cookies.get(YOUTUBE_OAUTH_NONCE_COOKIE)?.value?.trim() || "";
  const user = requireSessionUser(request);
  if (!user || !state.userId || state.userId !== user.id) {
    const url = new URL("/login", request.nextUrl.origin);
    return withNonceCookieCleared(NextResponse.redirect(url));
  }

  if (!state.nonce || !nonceCookie || nonceCookie !== state.nonce) {
    const url = new URL(redirectPath, request.nextUrl.origin);
    url.searchParams.set("auth", "failed");
    url.searchParams.set("reason", "invalid_state");
    return withNonceCookieCleared(NextResponse.redirect(url));
  }

  if (error) {
    const url = new URL(redirectPath, request.nextUrl.origin);
    url.searchParams.set("auth", "failed");
    url.searchParams.set("reason", error);
    return withNonceCookieCleared(NextResponse.redirect(url));
  }

  if (!code) {
    const url = new URL(redirectPath, request.nextUrl.origin);
    url.searchParams.set("auth", "failed");
    url.searchParams.set("reason", "missing_code");
    return withNonceCookieCleared(NextResponse.redirect(url));
  }

  try {
    const token = await exchangeYoutubeCode(code);
    const existing = await getYoutubeAccount(user.id, token.channelId);
    const refreshToken = token.refreshToken || existing?.refreshToken || "";
    if (!refreshToken) {
      throw new Error("리프레시 토큰을 받지 못했습니다. 채널을 다시 연결하고 동의를 다시 승인해 주세요.");
    }
    await upsertYoutubeAccount(user.id, {
      platform: "youtube",
      channelId: token.channelId,
      channelTitle: token.channelTitle,
      accessToken: token.accessToken,
      refreshToken,
      expiryDate: token.expiryDate,
      scope: token.scope,
    });

    const url = new URL(redirectPath, request.nextUrl.origin);
    url.searchParams.set("auth", "success");
    url.searchParams.set("channel", token.channelTitle);
    return withNonceCookieCleared(NextResponse.redirect(url));
  } catch (e) {
    const url = new URL(redirectPath, request.nextUrl.origin);
    url.searchParams.set("auth", "failed");
    url.searchParams.set("reason", e instanceof Error ? e.message : String(e));
    return withNonceCookieCleared(NextResponse.redirect(url));
  }
}

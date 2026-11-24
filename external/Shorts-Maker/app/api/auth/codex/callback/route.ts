import { NextRequest, NextResponse } from "next/server";
import { exchangeCodexCode } from "@/lib/auth/codex";
import { normalizeSafeRedirectPath } from "@/lib/auth/safe-redirect";

export const runtime = "nodejs";

const CODEX_OAUTH_NONCE_COOKIE = "codex_oauth_nonce";
const CODEX_OAUTH_VERIFIER_COOKIE = "codex_oauth_verifier";
const CODEX_OAUTH_ACCESS_TOKEN_COOKIE = "codex_oauth_access_token";
const CODEX_OAUTH_REFRESH_TOKEN_COOKIE = "codex_oauth_refresh_token";

function parseState(stateRaw: string | null): { nextPath: string; nonce: string } {
  const fallback = { nextPath: "/publish", nonce: "" };
  if (!stateRaw) return fallback;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as {
      next?: string;
      nonce?: string;
    };
    const nextPath = normalizeSafeRedirectPath(decoded.next);
    const nonce = typeof decoded.nonce === "string" ? decoded.nonce.trim() : "";
    return { nextPath, nonce };
  } catch {
    return fallback;
  }
}

function clearOauthCookies(response: NextResponse): NextResponse {
  for (const name of [CODEX_OAUTH_NONCE_COOKIE, CODEX_OAUTH_VERIFIER_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const error = request.nextUrl.searchParams.get("error") || "";
  const state = parseState(request.nextUrl.searchParams.get("state"));
  const nonceCookie = request.cookies.get(CODEX_OAUTH_NONCE_COOKIE)?.value?.trim() || "";
  const verifierCookie = request.cookies.get(CODEX_OAUTH_VERIFIER_COOKIE)?.value?.trim() || "";
  const secure = request.nextUrl.protocol === "https:";

  if (!state.nonce || !nonceCookie || nonceCookie !== state.nonce) {
    const url = new URL("/shorts-json-studio", request.nextUrl.origin);
    url.searchParams.set("codex_oauth", "invalid_state");
    return clearOauthCookies(NextResponse.redirect(url));
  }
  if (error) {
    const url = new URL("/shorts-json-studio", request.nextUrl.origin);
    url.searchParams.set("codex_oauth", error);
    return clearOauthCookies(NextResponse.redirect(url));
  }
  if (!code || !verifierCookie) {
    const url = new URL("/shorts-json-studio", request.nextUrl.origin);
    url.searchParams.set("codex_oauth", "missing_code");
    return clearOauthCookies(NextResponse.redirect(url));
  }

  try {
    const token = await exchangeCodexCode({
      code,
      codeVerifier: verifierCookie,
    });
    const redirectUrl = new URL(state.nextPath, request.nextUrl.origin);
    redirectUrl.searchParams.set("codex_oauth", "connected");
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set({
      name: CODEX_OAUTH_ACCESS_TOKEN_COOKIE,
      value: token.access_token,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: Math.max(60, token.expires_in || 60 * 60),
    });
    if (token.refresh_token) {
      response.cookies.set({
        name: CODEX_OAUTH_REFRESH_TOKEN_COOKIE,
        value: token.refresh_token,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return clearOauthCookies(response);
  } catch (e) {
    const url = new URL("/shorts-json-studio", request.nextUrl.origin);
    url.searchParams.set("codex_oauth", "exchange_failed");
    url.searchParams.set("codex_oauth_detail", e instanceof Error ? e.message : String(e));
    return clearOauthCookies(NextResponse.redirect(url));
  }
}


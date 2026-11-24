import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildCodexPkce, getCodexAuthUrl, isCodexOauthConfigured } from "@/lib/auth/codex";
import { isCodexLocalBridgeEnabled, resolveCodexConnectionMode } from "@/lib/auth/codex-bridge";
import { getLocalCodexTokens } from "@/lib/auth/codex-local";
import { normalizeSafeRedirectPath } from "@/lib/auth/safe-redirect";

export const runtime = "nodejs";

const CODEX_OAUTH_NONCE_COOKIE = "codex_oauth_nonce";
const CODEX_OAUTH_VERIFIER_COOKIE = "codex_oauth_verifier";

export async function GET(request: NextRequest) {
  const nextPath = normalizeSafeRedirectPath(request.nextUrl.searchParams.get("next") || "/shorts-json-studio");

  const localBridgeMode = resolveCodexConnectionMode() === "local_codex_bridge";
  if (localBridgeMode && isCodexLocalBridgeEnabled()) {
    const local = await getLocalCodexTokens();
    if (local) {
      const redirectUrl = new URL(nextPath, request.nextUrl.origin);
      redirectUrl.searchParams.set("codex_oauth", "connected");
      const response = NextResponse.redirect(redirectUrl);
      const secure = request.nextUrl.protocol === "https:";
      response.cookies.set({
        name: "codex_oauth_access_token",
        value: local.accessToken,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60,
      });
      if (local.refreshToken) {
        response.cookies.set({
          name: "codex_oauth_refresh_token",
          value: local.refreshToken,
          httpOnly: true,
          sameSite: "lax",
          secure,
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }
    if (!isCodexOauthConfigured()) {
      const redirectUrl = new URL(nextPath, request.nextUrl.origin);
      redirectUrl.searchParams.set("codex_oauth", "local_token_missing");
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (!isCodexOauthConfigured()) {
    const redirectUrl = new URL(nextPath, request.nextUrl.origin);
    redirectUrl.searchParams.set("codex_oauth", "local_token_missing");
    return NextResponse.redirect(redirectUrl);
  }

  const nonce = randomBytes(24).toString("base64url");
  const { verifier, challenge } = buildCodexPkce();
  const state = Buffer.from(JSON.stringify({ next: nextPath, nonce }), "utf8").toString("base64url");
  const authUrl = getCodexAuthUrl({ state, codeChallenge: challenge });

  const response = NextResponse.redirect(authUrl);
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set({
    name: CODEX_OAUTH_NONCE_COOKIE,
    value: nonce,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set({
    name: CODEX_OAUTH_VERIFIER_COOKIE,
    value: verifier,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}

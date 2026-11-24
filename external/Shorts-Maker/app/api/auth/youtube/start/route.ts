import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canManageWorkspace, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { normalizeSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { getYoutubeAuthUrl } from "@/lib/publish/youtube";

export const runtime = "nodejs";
const YOUTUBE_OAUTH_NONCE_COOKIE = "yt_oauth_nonce";

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  if (!canManageWorkspace(scope)) {
    return toForbiddenApiResponse("YouTube 채널 연결은 전체 관리 권한이 필요합니다.");
  }
  const redirect = normalizeSafeRedirectPath(request.nextUrl.searchParams.get("redirect"));
  const nonce = randomBytes(24).toString("base64url");
  const state = Buffer.from(JSON.stringify({ redirect, nonce, uid: user.id }), "utf8").toString("base64url");
  const authUrl = getYoutubeAuthUrl(state);
  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: YOUTUBE_OAUTH_NONCE_COOKIE,
    value: nonce,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}

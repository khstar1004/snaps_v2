import { NextRequest, NextResponse } from "next/server";
import { isLocalAuthBypassEnabled } from "@/lib/auth/local-bypass";
import { isPersonalModeEnabled } from "@/lib/auth/personal-mode";
import { getValidatedSessionSnapshot, syncValidatedSessionCookies } from "@/lib/auth/session";
import { requireAuthenticatedSessionUser, requireSessionUser } from "@/lib/auth/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const usesHeaderSession = isPersonalModeEnabled() || isLocalAuthBypassEnabled();
  const snapshot = usesHeaderSession ? null : await getValidatedSessionSnapshot(request);
  const authUser = usesHeaderSession ? await requireAuthenticatedSessionUser(request) : snapshot?.authUser || null;
  const user = usesHeaderSession ? await requireSessionUser(request) : snapshot?.user || null;
  if (!authUser || !user) {
    const response = NextResponse.json(
      { ok: false, error: "로그인이 필요합니다.", errorCode: "AUTH_REQUIRED", retryable: false },
      { status: 401 }
    );
    if (!usesHeaderSession) {
      syncValidatedSessionCookies(response, request, null);
    }
    return response;
  }
  const response = NextResponse.json({
    ok: true,
    user,
    authUser,
    workspace: {
      id: user.workspaceUserId,
      loginId: user.workspaceLoginId,
      displayName: user.workspaceDisplayName,
      isActingAs: user.isActingAs,
    },
    canManageUsers: authUser.role === "admin",
  });
  if (!usesHeaderSession) {
    syncValidatedSessionCookies(response, request, snapshot);
  }
  return response;
}

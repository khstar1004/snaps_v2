import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { isAdminSessionUser, requireAuthenticatedSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { AUTH_CLIENT_SCOPE_COOKIE, AUTH_WORKSPACE_COOKIE } from "@/lib/auth/constants";
import { getAuthUserById } from "@/lib/auth/store";
import {
  createWorkspaceToken,
  getSessionMaxAgeSec,
} from "@/lib/auth/session";
import { toApiErrorResponse } from "@/lib/publish/api-error";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function setCookie(response: NextResponse, request: NextRequest, name: string, value: string, maxAge: number, httpOnly: boolean) {
  response.cookies.set({
    name,
    value,
    httpOnly,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge,
  });
}

export async function POST(request: NextRequest) {
  const authUser = requireAuthenticatedSessionUser(request);
  if (!authUser) return toUnauthorizedApiResponse();
  if (!isAdminSessionUser(authUser)) return toForbiddenApiResponse("관리자만 작업공간을 전환할 수 있습니다.");

  try {
    const body = await request.json().catch(() => ({}));
    const userId = asString((body as Record<string, unknown>).userId);
    const targetUser = userId ? await getAuthUserById(userId) : null;

    const response = NextResponse.json({
      ok: true,
      workspace: targetUser
        ? {
            id: targetUser.id,
            loginId: targetUser.loginId,
            displayName: targetUser.displayName,
          }
        : {
            id: authUser.id,
            loginId: authUser.loginId,
            displayName: authUser.displayName,
          },
    });
    const maxAge = getSessionMaxAgeSec();

    if (targetUser && targetUser.role !== "system" && targetUser.id !== authUser.id) {
      await recordAuditLogSafely({
        user: authUser,
        request,
        action: "admin.workspace_switched",
        resourceType: "workspace",
        resourceId: targetUser.id,
        resourceLabel: targetUser.displayName,
        detail: `${targetUser.displayName} 작업공간으로 전환했습니다.`,
        metadata: {
          targetLoginId: targetUser.loginId,
        },
      });
      setCookie(
        response,
        request,
        AUTH_WORKSPACE_COOKIE,
        createWorkspaceToken({
          actorUserId: authUser.id,
          workspaceUserId: targetUser.id,
          workspaceLoginId: targetUser.loginId,
          workspaceDisplayName: targetUser.displayName,
        }),
        maxAge,
        true
      );
      setCookie(response, request, AUTH_CLIENT_SCOPE_COOKIE, targetUser.id, maxAge, false);
      return response;
    }

    await recordAuditLogSafely({
      user: authUser,
      request,
      action: "admin.workspace_reset",
      resourceType: "workspace",
      resourceId: authUser.id,
      resourceLabel: authUser.displayName,
      detail: "관리자 기본 작업공간으로 복귀했습니다.",
    });
    setCookie(response, request, AUTH_WORKSPACE_COOKIE, "", 0, true);
    setCookie(response, request, AUTH_CLIENT_SCOPE_COOKIE, authUser.id, maxAge, false);
    return response;
  } catch (error) {
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "ADMIN_WORKSPACE_SWITCH_FAILED",
      retryable: false,
    });
  }
}

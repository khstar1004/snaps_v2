import { NextRequest } from "next/server";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { getLocalAuthBypassSessionUser, isLocalAuthBypassEnabled } from "@/lib/auth/local-bypass";
import {
  getValidatedAuthenticatedSessionUserFromRequestHeaders,
  getValidatedWorkspaceSessionUserFromRequestHeaders,
} from "@/lib/auth/request-headers";
import type { SessionUser, WorkspaceSessionUser } from "@/lib/auth/types";

export function requireSessionUser(request: NextRequest): WorkspaceSessionUser | null {
  if (isLocalAuthBypassEnabled()) {
    const user = getLocalAuthBypassSessionUser();
    return {
      ...user,
      authUserId: user.id,
      authLoginId: user.loginId,
      authDisplayName: user.displayName,
      workspaceUserId: user.id,
      workspaceLoginId: user.loginId,
      workspaceDisplayName: user.displayName,
      isActingAs: false,
    };
  }
  return getValidatedWorkspaceSessionUserFromRequestHeaders(request);
}

export function requireAuthenticatedSessionUser(request: NextRequest): SessionUser | null {
  if (isLocalAuthBypassEnabled()) {
    return getLocalAuthBypassSessionUser();
  }
  return getValidatedAuthenticatedSessionUserFromRequestHeaders(request);
}

export function isAdminSessionUser(user: SessionUser | WorkspaceSessionUser | null | undefined): boolean {
  return Boolean(user && user.role === "admin");
}

export function toUnauthorizedApiResponse() {
  return toApiErrorResponse("로그인이 필요합니다.", {
    status: 401,
    errorCode: "AUTH_REQUIRED",
    retryable: false,
  });
}

export function toForbiddenApiResponse(message = "권한이 없습니다.") {
  return toApiErrorResponse(message, {
    status: 403,
    errorCode: "AUTH_FORBIDDEN",
    retryable: false,
  });
}

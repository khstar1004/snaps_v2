import { NextRequest } from "next/server";
import { buildValidatedRequestHeaders } from "@/lib/auth/request-headers";
import type { ValidatedSessionSnapshot } from "@/lib/auth/session";
import type { SessionUser, WorkspaceSessionUser } from "@/lib/auth/types";

export function createSessionUser(overrides?: Partial<SessionUser>): SessionUser {
  return {
    id: overrides?.id || "auth-user",
    loginId: overrides?.loginId || "admin",
    email: overrides?.email || "admin@example.com",
    displayName: overrides?.displayName || "관리자",
    role: overrides?.role || "admin",
  };
}

export function createWorkspaceSessionUser(overrides?: Partial<WorkspaceSessionUser>): WorkspaceSessionUser {
  const authUser = createSessionUser(overrides);
  return {
    ...authUser,
    authUserId: overrides?.authUserId || authUser.id,
    authLoginId: overrides?.authLoginId || authUser.loginId,
    authDisplayName: overrides?.authDisplayName || authUser.displayName,
    workspaceUserId: overrides?.workspaceUserId || authUser.id,
    workspaceLoginId: overrides?.workspaceLoginId || authUser.loginId,
    workspaceDisplayName: overrides?.workspaceDisplayName || authUser.displayName,
    isActingAs: overrides?.isActingAs || false,
  };
}

export function createValidatedHeaders(snapshot?: Partial<ValidatedSessionSnapshot>): Headers {
  const authUser = snapshot?.authUser || createSessionUser();
  const workspaceUser = snapshot?.user || createWorkspaceSessionUser();
  return buildValidatedRequestHeaders(
    new Headers({ "content-type": "application/json" }),
    {
      authUser,
      user: workspaceUser,
      hasStaleWorkspaceToken: snapshot?.hasStaleWorkspaceToken || false,
    }
  );
}

export function createJsonNextRequest(url: string, body: unknown, headers?: Headers): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: headers || new Headers({ "content-type": "application/json" }),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { recordAnonymousAuditLogSafely, recordAuditLogSafely } from "@/lib/audit/server";
import { ensureBootstrapAdminUser, getBootstrapAdminLoginId, shouldAutoBootstrapAdminOnLogin } from "@/lib/auth/bootstrap";
import { AUTH_CLIENT_SCOPE_COOKIE, AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE } from "@/lib/auth/constants";
import { clearFailedLoginAttempts, ensureLoginAttemptAllowed, recordFailedLoginAttempt } from "@/lib/auth/login-rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { getAuthUserByLoginId, normalizeLoginId } from "@/lib/auth/store";
import {
  createSessionToken,
  getSessionMaxAgeSec,
} from "@/lib/auth/session";
import { toApiErrorResponse } from "@/lib/publish/api-error";

export const runtime = "nodejs";

type LoginRouteUser = NonNullable<Awaited<ReturnType<typeof getAuthUserByLoginId>>>;
type LoginRouteDependencies = {
  recordAnonymousAuditLogSafely: typeof recordAnonymousAuditLogSafely;
  recordAuditLogSafely: typeof recordAuditLogSafely;
  ensureBootstrapAdminUser: typeof ensureBootstrapAdminUser;
  getBootstrapAdminLoginId: typeof getBootstrapAdminLoginId;
  shouldAutoBootstrapAdminOnLogin: typeof shouldAutoBootstrapAdminOnLogin;
  clearFailedLoginAttempts: typeof clearFailedLoginAttempts;
  ensureLoginAttemptAllowed: typeof ensureLoginAttemptAllowed;
  recordFailedLoginAttempt: typeof recordFailedLoginAttempt;
  verifyPassword: typeof verifyPassword;
  getAuthUserByLoginId: (loginId: string) => Promise<LoginRouteUser | null>;
  normalizeLoginId: typeof normalizeLoginId;
  createSessionToken: typeof createSessionToken;
  getSessionMaxAgeSec: typeof getSessionMaxAgeSec;
};

export const defaultLoginRouteDependencies: LoginRouteDependencies = {
  recordAnonymousAuditLogSafely,
  recordAuditLogSafely,
  ensureBootstrapAdminUser,
  getBootstrapAdminLoginId,
  shouldAutoBootstrapAdminOnLogin,
  clearFailedLoginAttempts,
  ensureLoginAttemptAllowed,
  recordFailedLoginAttempt,
  verifyPassword,
  getAuthUserByLoginId,
  normalizeLoginId,
  createSessionToken,
  getSessionMaxAgeSec,
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function applyCookie(response: NextResponse, request: NextRequest, name: string, value: string, maxAge: number, httpOnly = true) {
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

function toAuditSessionUser(user: LoginRouteUser | null) {
  if (!user || user.role === "system") return null;
  return {
    id: user.id,
    loginId: user.loginId,
    email: user.email,
    displayName: user.displayName,
    role: user.role === "admin" ? "admin" : "member",
  } as const;
}

function toRateLimitedLoginResponse(retryAfterSec: number) {
  const response = toApiErrorResponse("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", {
    status: 429,
    errorCode: "AUTH_RATE_LIMITED",
    retryable: true,
  });
  response.headers.set("Retry-After", String(retryAfterSec));
  return response;
}

async function recordLoginAttemptAudit(
  deps: LoginRouteDependencies,
  request: NextRequest,
  user: LoginRouteUser | null,
  action: "auth.login_failed" | "auth.login_blocked",
  detail: string,
  metadata: Record<string, unknown>
) {
  const auditUser = toAuditSessionUser(user);
  if (auditUser) {
    await deps.recordAuditLogSafely({
      user: auditUser,
      request,
      action,
      resourceType: "session",
      resourceId: auditUser.id,
      resourceLabel: auditUser.loginId,
      detail,
      metadata,
    });
    return;
  }

  await deps.recordAnonymousAuditLogSafely({
    request,
    action,
    resourceType: "session",
    resourceLabel: String(metadata.loginIdAttempt || ""),
    detail,
    metadata,
  });
}

export async function handleLoginPost(
  request: NextRequest,
  deps: LoginRouteDependencies = defaultLoginRouteDependencies
) {
  try {
    const body = await request.json().catch(() => ({}));
    const loginId = asString((body as Record<string, unknown>).loginId);
    const password = asString((body as Record<string, unknown>).password);

    if (!loginId || !password) {
      return toApiErrorResponse("아이디와 비밀번호를 입력해 주세요.", {
        status: 400,
        errorCode: "AUTH_INVALID_INPUT",
        retryable: false,
      });
    }

    const rateLimit = await deps.ensureLoginAttemptAllowed(request, loginId);
    if (!rateLimit.allowed) {
      return toRateLimitedLoginResponse(rateLimit.retryAfterSec);
    }

    if (deps.shouldAutoBootstrapAdminOnLogin() && deps.normalizeLoginId(loginId) === deps.getBootstrapAdminLoginId()) {
      await deps.ensureBootstrapAdminUser();
    }

    const user = await deps.getAuthUserByLoginId(loginId);
    if (!user || !user.passwordHash || !(await deps.verifyPassword(password, user.passwordHash))) {
      const throttle = await deps.recordFailedLoginAttempt(request, loginId);
      const normalizedLoginId = deps.normalizeLoginId(loginId);
      await recordLoginAttemptAudit(deps, request, user, "auth.login_failed", "로그인에 실패했습니다.", {
        loginIdAttempt: normalizedLoginId,
        reason: "invalid_credentials",
        rateLimited: throttle.locked,
        accountFound: Boolean(user),
        accountRole: user?.role || "missing",
      });
      if (throttle.locked && throttle.retryAfterSec) {
        return toRateLimitedLoginResponse(throttle.retryAfterSec);
      }
      return toApiErrorResponse("아이디 또는 비밀번호가 올바르지 않습니다.", {
        status: 401,
        errorCode: "AUTH_INVALID_CREDENTIALS",
        retryable: false,
      });
    }

    if (!user.isActive || user.role === "system") {
      await deps.clearFailedLoginAttempts(request, loginId);
      await recordLoginAttemptAudit(
        deps,
        request,
        user,
        "auth.login_blocked",
        "비활성화된 계정 로그인 시도가 차단되었습니다.",
        {
          loginIdAttempt: deps.normalizeLoginId(loginId),
          reason: user.role === "system" ? "system_account" : "account_disabled",
          accountFound: true,
          accountRole: user.role,
        }
      );
      return toApiErrorResponse("비활성화된 계정입니다.", {
        status: 403,
        errorCode: "AUTH_ACCOUNT_DISABLED",
        retryable: false,
      });
    }

    const sessionUser = {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      displayName: user.displayName,
      role: user.role === "admin" ? "admin" : "member",
    } as const;
    const response = NextResponse.json({
      ok: true,
      user: sessionUser,
      workspace: {
        id: user.id,
        loginId: user.loginId,
        displayName: user.displayName,
      },
    });
    const maxAge = deps.getSessionMaxAgeSec();
    await deps.clearFailedLoginAttempts(request, loginId);
    await deps.recordAuditLogSafely({
      user: sessionUser,
      request,
      action: "auth.login_succeeded",
      resourceType: "session",
      resourceId: sessionUser.id,
      resourceLabel: sessionUser.loginId,
      detail: "로그인했습니다.",
      metadata: {
        loginIdAttempt: deps.normalizeLoginId(loginId),
      },
    });
    applyCookie(response, request, AUTH_SESSION_COOKIE, deps.createSessionToken(sessionUser), maxAge, true);
    applyCookie(response, request, AUTH_WORKSPACE_COOKIE, "", 0, true);
    applyCookie(response, request, AUTH_CLIENT_SCOPE_COOKIE, user.id, maxAge, false);
    return response;
  } catch (error) {
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "AUTH_LOGIN_FAILED",
      retryable: false,
    });
  }
}

export async function POST(request: NextRequest) {
  return handleLoginPost(request);
}

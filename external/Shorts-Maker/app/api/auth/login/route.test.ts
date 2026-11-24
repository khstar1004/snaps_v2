import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { AUTH_CLIENT_SCOPE_COOKIE, AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE } from "@/lib/auth/constants";
import { handleLoginPost } from "./route";

function createLoginRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function createLoginRouteDependencies(overrides?: Partial<NonNullable<Parameters<typeof handleLoginPost>[1]>>) {
  return {
    recordAnonymousAuditLogSafely: async () => undefined,
    recordAuditLogSafely: async () => undefined,
    ensureBootstrapAdminUser: async () => null,
    getBootstrapAdminLoginId: () => "admin",
    shouldAutoBootstrapAdminOnLogin: () => true,
    clearFailedLoginAttempts: async () => undefined,
    ensureLoginAttemptAllowed: async () => ({ allowed: true } as const),
    recordFailedLoginAttempt: async () => ({ locked: false, retryAfterSec: null }),
    verifyPassword: async () => false,
    getAuthUserByLoginId: async () => null,
    normalizeLoginId: (value: string) => value.trim().toLowerCase(),
    createSessionToken: () => "session-token",
    getSessionMaxAgeSec: () => 120,
    ...overrides,
  };
}

test("login route rejects empty credentials", async () => {
  const response = await handleLoginPost(
    createLoginRequest({
      loginId: "",
      password: "",
    }),
    createLoginRouteDependencies()
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "아이디와 비밀번호를 입력해 주세요.",
    errorCode: "AUTH_INVALID_INPUT",
    retryable: false,
  });
});

test("login route returns retry-after when rate limited", async () => {
  const response = await handleLoginPost(
    createLoginRequest({
      loginId: "admin",
      password: "secret",
    }),
    createLoginRouteDependencies({
      ensureLoginAttemptAllowed: async () => ({ allowed: false, retryAfterSec: 17 }),
    })
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    errorCode: "AUTH_RATE_LIMITED",
    retryable: true,
  });
});

test("login route records anonymous audit metadata for missing login ids", async () => {
  const anonymousAuditActions: Array<{ action: string; resourceLabel: string; metadata: Record<string, unknown> }> = [];
  const response = await handleLoginPost(
    createLoginRequest({
      loginId: "unknown-user",
      password: "wrong-password",
    }),
    createLoginRouteDependencies({
      recordAnonymousAuditLogSafely: async (entry) => {
        anonymousAuditActions.push({
          action: entry.action,
          resourceLabel: entry.resourceLabel || "",
          metadata: entry.metadata || {},
        });
      },
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(anonymousAuditActions, [
    {
      action: "auth.login_failed",
      resourceLabel: "unknown-user",
      metadata: {
        loginIdAttempt: "unknown-user",
        reason: "invalid_credentials",
        rateLimited: false,
        accountFound: false,
        accountRole: "missing",
      },
    },
  ]);
});

test("login route skips bootstrap admin sync unless auto bootstrap is enabled", async () => {
  let bootstrapCalls = 0;
  const response = await handleLoginPost(
    createLoginRequest({
      loginId: "admin",
      password: "wrong-password",
    }),
    createLoginRouteDependencies({
      shouldAutoBootstrapAdminOnLogin: () => false,
      ensureBootstrapAdminUser: async () => {
        bootstrapCalls += 1;
        return null;
      },
    })
  );

  assert.equal(response.status, 401);
  assert.equal(bootstrapCalls, 0);
});

test("login route issues session cookies after successful authentication", async () => {
  const auditCalls: string[] = [];
  let clearedLoginId = "";
  const response = await handleLoginPost(
    createLoginRequest({
      loginId: "editor",
      password: "pw",
    }),
    createLoginRouteDependencies({
      verifyPassword: async () => true,
      getAuthUserByLoginId: async () => ({
        id: "user-1",
        loginId: "editor",
        email: "editor@example.com",
        displayName: "에디터",
        role: "member",
        isActive: true,
        passwordHash: "hashed-password",
        createdAt: 1,
        updatedAt: 1,
      }),
      clearFailedLoginAttempts: async (_request, loginId) => {
        clearedLoginId = loginId;
      },
      recordAuditLogSafely: async (entry) => {
        auditCalls.push(entry.action);
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(clearedLoginId, "editor");
  assert.deepEqual(auditCalls, ["auth.login_succeeded"]);
  assert.equal(response.cookies.get(AUTH_SESSION_COOKIE)?.value, "session-token");
  assert.equal(response.cookies.get(AUTH_CLIENT_SCOPE_COOKIE)?.value, "user-1");
  assert.equal(response.cookies.get(AUTH_WORKSPACE_COOKIE)?.value, "");
  assert.deepEqual(await response.json(), {
    ok: true,
    user: {
      id: "user-1",
      loginId: "editor",
      email: "editor@example.com",
      displayName: "에디터",
      role: "member",
    },
    workspace: {
      id: "user-1",
      loginId: "editor",
      displayName: "에디터",
    },
  });
});

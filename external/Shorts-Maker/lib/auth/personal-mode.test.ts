import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_CLIENT_SCOPE_COOKIE, AUTH_SESSION_COOKIE, AUTH_WORKSPACE_COOKIE } from "./constants";
import {
  getPersonalModeRouteDisposition,
  isPersonalModeEnabled,
  resolvePersonalModeSessionSnapshot,
  selectPersonalOwnerCandidate,
  syncPersonalModeCookies,
} from "./personal-mode";
import type { AuthUser } from "./types";

function createUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    loginId: "owner",
    email: "owner@local.user",
    displayName: "내 작업공간",
    role: "member",
    isActive: true,
    passwordHash: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test("personal mode is the product default outside tests and can be explicitly disabled", () => {
  assert.equal(isPersonalModeEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isPersonalModeEnabled({ NODE_ENV: "production" }), true);
  assert.equal(isPersonalModeEnabled({ NODE_ENV: "test" }), false);
  assert.equal(isPersonalModeEnabled({ APP_MODE: "personal", NODE_ENV: "test" }), true);
  assert.equal(isPersonalModeEnabled({ APP_MODE: "multi-user", NODE_ENV: "production" }), false);
});

test("configured owner selects the matching active user without changing ownership", () => {
  const first = createUser({ id: "first", loginId: "first" });
  const owner = createUser({ id: "existing-owner", loginId: "gun" });
  assert.equal(selectPersonalOwnerCandidate([first, owner], "GUN"), owner);
});

test("ambiguous existing users require an explicit owner instead of merging data", () => {
  assert.throws(
    () => selectPersonalOwnerCandidate([createUser({ id: "first", loginId: "first" }), createUser({ id: "second", loginId: "second" })]),
    /PERSONAL_OWNER_LOGIN_ID/
  );
});

test("no existing user creates one personal owner and returns a non-acting workspace", async () => {
  let createCalls = 0;
  const snapshot = await resolvePersonalModeSessionSnapshot(
    { APP_MODE: "personal", NODE_ENV: "test" },
    {
      listUsers: async () => [],
      getUserByLoginId: async () => null,
      createUser: async (input) => {
        createCalls += 1;
        return createUser({ loginId: input.loginId, email: input.email, displayName: input.displayName });
      },
    }
  );

  assert.equal(createCalls, 1);
  assert.equal(snapshot.authUser.loginId, "owner");
  assert.equal(snapshot.user.workspaceUserId, snapshot.authUser.id);
  assert.equal(snapshot.user.isActingAs, false);
});

test("personal mode always uses member semantics even when the stored owner is an admin", async () => {
  const adminOwner = createUser({ role: "admin" });
  const snapshot = await resolvePersonalModeSessionSnapshot(
    { APP_MODE: "personal", NODE_ENV: "test" },
    {
      listUsers: async () => [adminOwner],
      getUserByLoginId: async () => null,
      createUser: async () => adminOwner,
    }
  );

  assert.equal(snapshot.authUser.role, "member");
  assert.equal(snapshot.user.role, "member");
});

test("personal mode fixes client scope to the owner and clears stale account cookies", async () => {
  const owner = createUser({ id: "personal-owner" });
  const snapshot = await resolvePersonalModeSessionSnapshot(
    { APP_MODE: "personal", NODE_ENV: "test" },
    {
      listUsers: async () => [owner],
      getUserByLoginId: async () => null,
      createUser: async () => owner,
    }
  );
  const request = new NextRequest("http://localhost/home", {
    headers: {
      cookie: `${AUTH_SESSION_COOKIE}=stale-session; ${AUTH_WORKSPACE_COOKIE}=stale-workspace`,
    },
  });
  const response = NextResponse.next();

  syncPersonalModeCookies(response, request, snapshot);

  assert.equal(response.cookies.get(AUTH_CLIENT_SCOPE_COOKIE)?.value, owner.id);
  assert.equal(response.cookies.get(AUTH_SESSION_COOKIE)?.value, "");
  assert.equal(response.cookies.get(AUTH_WORKSPACE_COOKIE)?.value, "");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /sm_client_scope=personal-owner/);
  assert.match(setCookie, /sm_session=;.*Max-Age=0/);
  assert.match(setCookie, /sm_workspace=;.*Max-Age=0/);
});

test("personal mode hides account administration but keeps provider connections available", () => {
  assert.equal(getPersonalModeRouteDisposition("/login"), "redirect_home");
  assert.equal(getPersonalModeRouteDisposition("/admin/users"), "redirect_home");
  assert.equal(getPersonalModeRouteDisposition("/api/admin/users"), "not_found");
  assert.equal(getPersonalModeRouteDisposition("/api/auth/register"), "not_found");
  assert.equal(getPersonalModeRouteDisposition("/api/auth/youtube/start"), "pass");
  assert.equal(getPersonalModeRouteDisposition("/api/auth/codex/status"), "pass");
});

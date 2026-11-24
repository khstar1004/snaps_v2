import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedRequestHeaders, getValidatedAuthenticatedSessionUserFromRequestHeaders, getValidatedWorkspaceSessionUserFromRequestHeaders } from "./request-headers";
import type { ValidatedSessionSnapshot } from "./session";

const snapshot: ValidatedSessionSnapshot = {
  authUser: {
    id: "admin-user",
    loginId: "admin",
    email: "admin@example.com",
    displayName: "관리자",
    role: "admin",
  },
  user: {
    id: "member-user",
    loginId: "admin",
    email: "admin@example.com",
    displayName: "관리자",
    role: "admin",
    authUserId: "admin-user",
    authLoginId: "admin",
    authDisplayName: "관리자",
    workspaceUserId: "member-user",
    workspaceLoginId: "member-login",
    workspaceDisplayName: "작업공간 사용자",
    isActingAs: true,
  },
  hasStaleWorkspaceToken: false,
};

test("validated session headers round-trip auth and workspace users", () => {
  const headers = buildValidatedRequestHeaders(new Headers(), snapshot);
  const request = { headers };

  assert.deepEqual(getValidatedAuthenticatedSessionUserFromRequestHeaders(request), snapshot.authUser);
  assert.deepEqual(getValidatedWorkspaceSessionUserFromRequestHeaders(request), snapshot.user);
});

test("missing validation marker prevents spoofed internal auth headers from being trusted", () => {
  const headers = new Headers();
  headers.set("x-sm-auth-user", "spoofed");
  headers.set("x-sm-workspace-user", "spoofed");

  const request = { headers };
  assert.equal(getValidatedAuthenticatedSessionUserFromRequestHeaders(request), null);
  assert.equal(getValidatedWorkspaceSessionUserFromRequestHeaders(request), null);
});

test("building validated headers clears stale internal auth headers when snapshot is null", () => {
  const initial = new Headers();
  initial.set("x-sm-auth-validated", "1");
  initial.set("x-sm-auth-user", "stale");
  initial.set("x-sm-workspace-user", "stale");

  const headers = buildValidatedRequestHeaders(initial, null);
  assert.equal(headers.get("x-sm-auth-validated"), null);
  assert.equal(headers.get("x-sm-auth-user"), null);
  assert.equal(headers.get("x-sm-workspace-user"), null);
});

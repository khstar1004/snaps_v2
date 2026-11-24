import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildValidatedRequestHeaders } from "@/lib/auth/request-headers";
import type { ValidatedSessionSnapshot } from "@/lib/auth/session";
import { GET } from "./route";

test("session route returns the proxy-injected personal owner without login cookies", async () => {
  const previousAppMode = process.env.APP_MODE;
  process.env.APP_MODE = "personal";
  try {
    const snapshot: ValidatedSessionSnapshot = {
      authUser: {
        id: "personal-owner",
        loginId: "owner",
        email: "owner@local.user",
        displayName: "내 작업공간",
        role: "member",
      },
      user: {
        id: "personal-owner",
        loginId: "owner",
        email: "owner@local.user",
        displayName: "내 작업공간",
        role: "member",
        authUserId: "personal-owner",
        authLoginId: "owner",
        authDisplayName: "내 작업공간",
        workspaceUserId: "personal-owner",
        workspaceLoginId: "owner",
        workspaceDisplayName: "내 작업공간",
        isActingAs: false,
      },
      hasStaleWorkspaceToken: false,
    };
    const headers = buildValidatedRequestHeaders(new Headers(), snapshot);
    const response = await GET(new NextRequest("http://localhost/api/auth/session", { headers }));
    const payload = (await response.json()) as {
      ok?: boolean;
      authUser?: { id?: string; role?: string };
      workspace?: { id?: string; isActingAs?: boolean };
      canManageUsers?: boolean;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.authUser?.id, "personal-owner");
    assert.equal(payload.authUser?.role, "member");
    assert.equal(payload.workspace?.id, "personal-owner");
    assert.equal(payload.workspace?.isActingAs, false);
    assert.equal(payload.canManageUsers, false);
  } finally {
    if (typeof previousAppMode === "string") process.env.APP_MODE = previousAppMode;
    else delete process.env.APP_MODE;
  }
});

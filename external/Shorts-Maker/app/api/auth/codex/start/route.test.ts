import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

const ENV_KEYS = [
  "CODEX_LOCAL_BRIDGE_USE_CLI",
  "CODEX_LOCAL_BRIDGE_PREFER_LOCAL",
  "CODEX_OAUTH_CLIENT_ID",
  "CODEX_OAUTH_AUTH_URL",
  "CODEX_OAUTH_REDIRECT_URI",
  "CODEX_OAUTH_SCOPE",
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function getRedirectUrl(response: Response): URL {
  const location = response.headers.get("location");
  assert.ok(location);
  return new URL(location);
}

function decodeState(state: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as Record<string, unknown>;
}

test("codex start preserves safe next paths when local token is missing", async () => {
  await withEnv({ CODEX_LOCAL_BRIDGE_USE_CLI: "false" }, async () => {
    const request = new NextRequest("http://localhost/api/auth/codex/start?next=%2Fsettings%3Ftab%3Dconnections");
    const response = await GET(request);
    const location = getRedirectUrl(response);

    assert.equal(location.origin, "http://localhost");
    assert.equal(location.pathname, "/settings");
    assert.equal(location.searchParams.get("tab"), "connections");
    assert.equal(location.searchParams.get("codex_oauth"), "local_token_missing");
  });
});

test("codex start falls back before redirecting local missing-token responses", async () => {
  await withEnv({ CODEX_LOCAL_BRIDGE_USE_CLI: "false" }, async () => {
    const request = new NextRequest("http://localhost/api/auth/codex/start?next=%2F%252F%252Fevil.example%2Fcallback");
    const response = await GET(request);
    const location = getRedirectUrl(response);

    assert.equal(location.origin, "http://localhost");
    assert.equal(location.pathname, "/publish");
    assert.equal(location.searchParams.get("codex_oauth"), "local_token_missing");
  });
});

test("codex start stores a normalized next path in OAuth state", async () => {
  await withEnv(
    {
      CODEX_LOCAL_BRIDGE_USE_CLI: "false",
      CODEX_OAUTH_CLIENT_ID: "codex-client",
      CODEX_OAUTH_AUTH_URL: "https://auth.example.test/oauth/authorize",
      CODEX_OAUTH_REDIRECT_URI: "http://localhost/api/auth/codex/callback",
      CODEX_OAUTH_SCOPE: "openid",
    },
    async () => {
      const request = new NextRequest("http://localhost/api/auth/codex/start?next=%2F%255C%255Cevil.example%2Fcallback");
      const response = await GET(request);
      const location = getRedirectUrl(response);
      const state = decodeState(location.searchParams.get("state") || "");

      assert.equal(location.origin, "https://auth.example.test");
      assert.equal(state.next, "/publish");
      assert.equal(typeof state.nonce, "string");
    }
  );
});

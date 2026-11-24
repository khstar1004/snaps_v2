import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

const ENV_KEYS = [
  "CODEX_OAUTH_CLIENT_ID",
  "CODEX_OAUTH_CLIENT_SECRET",
  "CODEX_OAUTH_TOKEN_URL",
  "CODEX_OAUTH_REDIRECT_URI",
] as const;

function encodeState(state: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function getRedirectUrl(response: Response): URL {
  const location = response.headers.get("location");
  assert.ok(location);
  return new URL(location);
}

async function withCodexExchangeMock(run: () => Promise<void>): Promise<void> {
  const previousEnv = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
  }
  process.env.CODEX_OAUTH_CLIENT_ID = "codex-client";
  process.env.CODEX_OAUTH_TOKEN_URL = "https://auth.example.test/oauth/token";
  process.env.CODEX_OAUTH_REDIRECT_URI = "http://localhost/api/auth/codex/callback";
  delete process.env.CODEX_OAUTH_CLIENT_SECRET;

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );

  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of previousEnv) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("codex callback preserves a safe next path from state", async () => {
  await withCodexExchangeMock(async () => {
    const state = encodeState({ next: "/settings?tab=connections", nonce: "nonce-1" });
    const request = new NextRequest(`http://localhost/api/auth/codex/callback?code=code-1&state=${state}`, {
      headers: {
        cookie: "codex_oauth_nonce=nonce-1; codex_oauth_verifier=verifier-1",
      },
    });

    const response = await GET(request);
    const location = getRedirectUrl(response);

    assert.equal(location.origin, "http://localhost");
    assert.equal(location.pathname, "/settings");
    assert.equal(location.searchParams.get("tab"), "connections");
    assert.equal(location.searchParams.get("codex_oauth"), "connected");
  });
});

test("codex callback falls back before building the success redirect URL", async () => {
  await withCodexExchangeMock(async () => {
    const state = encodeState({ next: "/%2F%2Fevil.example/callback", nonce: "nonce-2" });
    const request = new NextRequest(`http://localhost/api/auth/codex/callback?code=code-2&state=${state}`, {
      headers: {
        cookie: "codex_oauth_nonce=nonce-2; codex_oauth_verifier=verifier-2",
      },
    });

    const response = await GET(request);
    const location = getRedirectUrl(response);

    assert.equal(location.origin, "http://localhost");
    assert.equal(location.pathname, "/publish");
    assert.equal(location.searchParams.get("codex_oauth"), "connected");
  });
});

import { createHash, randomBytes } from "node:crypto";
import { isDeepseekConfigured } from "@/lib/studio/ai-provider";

type CodexTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type CodexOauthConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope: string;
};

function encodeBase64Url(input: Buffer): string {
  return input.toString("base64url");
}

function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
}

function readTrimmedEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function getCodexOauthConfig(): CodexOauthConfig {
  const clientId = readTrimmedEnv("CODEX_OAUTH_CLIENT_ID");
  const clientSecret = readTrimmedEnv("CODEX_OAUTH_CLIENT_SECRET");
  const authUrl = (readTrimmedEnv("CODEX_OAUTH_AUTH_URL") || "https://auth.openai.com/oauth/authorize").trim();
  const tokenUrl = (readTrimmedEnv("CODEX_OAUTH_TOKEN_URL") || "https://auth.openai.com/oauth/token").trim();
  const baseUrl = getAppBaseUrl();
  const redirectFromBase = baseUrl ? `${baseUrl}/api/auth/codex/callback` : "";
  const redirectUri = (readTrimmedEnv("CODEX_OAUTH_REDIRECT_URI") || redirectFromBase || "http://localhost:3000/api/auth/codex/callback").trim();
  const scope = (readTrimmedEnv("CODEX_OAUTH_SCOPE") || "openid profile email").trim();

  if (!authUrl || !tokenUrl) {
    throw new Error("CODEX_OAUTH_AUTH_URL and CODEX_OAUTH_TOKEN_URL are required");
  }
  if (!clientId) {
    throw new Error("CODEX_OAUTH_CLIENT_ID is not configured");
  }
  return {
    clientId,
    clientSecret,
    authUrl,
    tokenUrl,
    redirectUri,
    scope,
  };
}

export function isCodexOauthConfigured(): boolean {
  if (isDeepseekConfigured()) return true;
  return Boolean(readTrimmedEnv("CODEX_OAUTH_CLIENT_ID"));
}

export function buildCodexPkce(): { verifier: string; challenge: string } {
  const verifier = encodeBase64Url(randomBytes(32));
  const challenge = encodeBase64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function getCodexAuthUrl(input: { state: string; codeChallenge: string }): string {
  const cfg = getCodexOauthConfig();
  const url = new URL(cfg.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodexCode(input: { code: string; codeVerifier: string }): Promise<CodexTokenResponse> {
  const cfg = getCodexOauthConfig();
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("client_id", cfg.clientId);
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  body.set("redirect_uri", cfg.redirectUri);
  body.set("code_verifier", input.codeVerifier);

  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Codex OAuth token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const token = (await response.json()) as Partial<CodexTokenResponse>;
  const accessToken = typeof token.access_token === "string" ? token.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("Codex OAuth token exchange returned empty access_token");
  }
  return {
    access_token: accessToken,
    refresh_token: typeof token.refresh_token === "string" ? token.refresh_token.trim() : undefined,
    id_token: typeof token.id_token === "string" ? token.id_token.trim() : undefined,
    expires_in: typeof token.expires_in === "number" ? token.expires_in : undefined,
    scope: typeof token.scope === "string" ? token.scope : undefined,
    token_type: typeof token.token_type === "string" ? token.token_type : undefined,
  };
}

const DEFAULT_LOCAL_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

type JwtPayload = {
  aud?: unknown;
  exp?: unknown;
};

function decodeBase64UrlJson<T>(encoded: string): T | null {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.trim().split(".");
  if (parts.length < 2 || !parts[1]) return null;
  return decodeBase64UrlJson<JwtPayload>(parts[1]);
}

export function resolveCodexLocalClientId(idToken?: string): string {
  const envClientId = readTrimmedEnv("CODEX_LOCAL_OAUTH_CLIENT_ID");
  if (envClientId) return envClientId;
  const payload = decodeJwtPayload(idToken || "");
  const aud = payload?.aud;
  if (typeof aud === "string" && aud.trim()) return aud.trim();
  if (Array.isArray(aud)) {
    const first = aud.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first.trim();
  }
  return DEFAULT_LOCAL_CODEX_CLIENT_ID;
}

function getLocalCodexTokenUrl(): string {
  return readTrimmedEnv("CODEX_LOCAL_OAUTH_TOKEN_URL") || readTrimmedEnv("CODEX_OAUTH_TOKEN_URL") || "https://auth.openai.com/oauth/token";
}

export async function refreshLocalCodexTokens(input: {
  refreshToken: string;
  idToken?: string;
  clientId?: string;
}): Promise<CodexTokenResponse> {
  const refreshToken = input.refreshToken.trim();
  if (!refreshToken) {
    throw new Error("Codex local token refresh requires refresh_token");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", (input.clientId || resolveCodexLocalClientId(input.idToken)).trim());

  const response = await fetch(getLocalCodexTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Codex local token refresh failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const token = (await response.json()) as Partial<CodexTokenResponse>;
  const accessToken = typeof token.access_token === "string" ? token.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("Codex local token refresh returned empty access_token");
  }

  return {
    access_token: accessToken,
    refresh_token: typeof token.refresh_token === "string" ? token.refresh_token.trim() : undefined,
    id_token: typeof token.id_token === "string" ? token.id_token.trim() : undefined,
    expires_in: typeof token.expires_in === "number" ? token.expires_in : undefined,
    scope: typeof token.scope === "string" ? token.scope : undefined,
    token_type: typeof token.token_type === "string" ? token.token_type : undefined,
  };
}

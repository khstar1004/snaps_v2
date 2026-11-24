import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isCodexLocalBridgeEnabled, resolveCodexConnectionMode } from "@/lib/auth/codex-bridge";
import { decodeJwtPayload, refreshLocalCodexTokens } from "@/lib/auth/codex";
import type { CodexLocalAuthState } from "@/lib/studio/codex-contract";

type CodexLocalAuthFile = {
  auth_mode?: unknown;
  OPENAI_API_KEY?: unknown;
  last_refresh?: unknown;
  tokens?: {
    access_token?: unknown;
    refresh_token?: unknown;
    id_token?: unknown;
    account_id?: unknown;
  };
};

type ResolvedLocalCodexAuthState = CodexLocalAuthState & {
  accessToken?: string;
  refreshToken?: string;
};

const LOCAL_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const LOCAL_TOKEN_REFRESH_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const LOCAL_AUTH_CACHE_TTL_MS = 15 * 1000;

let cachedLocalAuthState: { expiresAt: number; value: ResolvedLocalCodexAuthState } | null = null;
let pendingLocalAuthState: Promise<ResolvedLocalCodexAuthState> | null = null;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function maskSecret(secret: string): string {
  const value = secret.trim();
  if (!value) return "<empty>";
  if (value.length <= 8) return `${value[0] || "*"}***${value[value.length - 1] || "*"}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/Bearer\s+([A-Za-z0-9._-]{12,})/gi, (_, token: string) => `Bearer ${maskSecret(token)}`)
    .replace(
      /\b(access_token|refresh_token|id_token)=([A-Za-z0-9._-]{12,})/gi,
      (_, key: string, token: string) => `${key}=${maskSecret(token)}`
    )
    .replace(/([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{16,})/g, (_match, a: string, b: string, c: string) => {
      return `${maskSecret(a)}.${maskSecret(b)}.${maskSecret(c)}`;
    });
}

function logCodexLocalWarning(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.warn("[codex-local]", sanitizeLogText(message), details);
    return;
  }
  console.warn("[codex-local]", sanitizeLogText(message));
}

function getDateMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

function createEmptyLocalAuthState(error?: string): ResolvedLocalCodexAuthState {
  return {
    ready: false,
    authMode: "missing",
    source: "missing",
    transport: "unavailable",
    upstreamTransport: "unavailable",
    usesSse: false,
    refreshable: false,
    refreshed: false,
    error: error || undefined,
  };
}

function isLocalCodexBridgeActive(): boolean {
  return isCodexLocalBridgeEnabled() && resolveCodexConnectionMode() === "local_codex_bridge";
}

export function resolveCodexHomeDir(): string {
  const explicitCodexHome = readString(process.env.CODEX_HOME);
  if (explicitCodexHome) return resolve(explicitCodexHome);
  const xdgConfigHome = readString(process.env.XDG_CONFIG_HOME);
  if (xdgConfigHome) return join(resolve(xdgConfigHome), "codex");
  return join(homedir(), ".codex");
}

export function getCodexHomeDirCandidates(): string[] {
  const candidates = [resolveCodexHomeDir()];
  const defaultHomeDir = join(homedir(), ".codex");
  if (!candidates.includes(defaultHomeDir)) {
    candidates.push(defaultHomeDir);
  }
  return candidates;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveCodexHomeDirForMarkers(markerFiles: string[]): Promise<string> {
  const candidates = getCodexHomeDirCandidates();
  for (const candidate of candidates) {
    for (const markerFile of markerFiles) {
      if (await pathExists(join(candidate, markerFile))) {
        return candidate;
      }
    }
  }
  return candidates[0] || resolveCodexHomeDir();
}

export async function getCodexAuthFilePath(): Promise<string> {
  return join(await resolveCodexHomeDirForMarkers(["auth.json"]), "auth.json");
}

async function readLocalCodexAuthFile(): Promise<{ path: string; parsed: CodexLocalAuthFile | null }> {
  const authFilePath = await getCodexAuthFilePath();
  try {
    const raw = await readFile(authFilePath, "utf8");
    return {
      path: authFilePath,
      parsed: JSON.parse(raw) as CodexLocalAuthFile,
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code !== "ENOENT") {
      logCodexLocalWarning("Failed to read local Codex auth.json", {
        path: authFilePath,
        error: sanitizeLogText(error instanceof Error ? error.message : String(error)),
      });
    }
    return { path: authFilePath, parsed: null };
  }
}

function shouldRefreshChatgptToken(input: {
  accessToken: string;
  refreshToken: string;
  lastRefresh: unknown;
}): boolean {
  if (!input.refreshToken) return false;
  if (!input.accessToken) return true;
  const now = Date.now();
  const expiresAt = getTokenExpiryMs(input.accessToken);
  if (typeof expiresAt === "number" && expiresAt <= now + LOCAL_TOKEN_REFRESH_SKEW_MS) {
    return true;
  }
  const lastRefreshMs = getDateMs(input.lastRefresh);
  if (typeof lastRefreshMs === "number" && now - lastRefreshMs >= LOCAL_TOKEN_REFRESH_MAX_AGE_MS) {
    return true;
  }
  if (!expiresAt && lastRefreshMs === null) {
    return true;
  }
  return false;
}

async function persistRefreshedLocalAuthFile(
  authFilePath: string,
  current: CodexLocalAuthFile,
  refreshed: { accessToken: string; refreshToken?: string; idToken?: string }
): Promise<void> {
  const next: CodexLocalAuthFile = {
    ...current,
    auth_mode: readString(current.auth_mode) || "chatgpt",
    last_refresh: new Date().toISOString(),
    tokens: {
      ...(current.tokens || {}),
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken || readString(current.tokens?.refresh_token) || undefined,
      id_token: refreshed.idToken || readString(current.tokens?.id_token) || undefined,
      account_id: readString(current.tokens?.account_id) || undefined,
    },
  };

  await mkdir(dirname(authFilePath), { recursive: true });
  await writeFile(authFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function resolveLocalCodexAuthStateUncached(): Promise<ResolvedLocalCodexAuthState> {
  const { path: authFilePath, parsed } = await readLocalCodexAuthFile();
  if (!parsed) return createEmptyLocalAuthState();
  const localBridgeActive = isLocalCodexBridgeActive();

  const authMode = readString(parsed.auth_mode).toLowerCase();
  const apiKey = readString(parsed.OPENAI_API_KEY);
  const accessTokenFromFile = readString(parsed.tokens?.access_token);
  const refreshTokenFromFile = readString(parsed.tokens?.refresh_token);
  const idToken = readString(parsed.tokens?.id_token);

  if (apiKey && !accessTokenFromFile) {
    return {
      ready: true,
      authMode: "api_key",
      source: "api_key_auth_json",
      transport: localBridgeActive ? "local_cli_bridge" : "openai_api",
      upstreamTransport: "openai_api",
      usesSse: false,
      refreshable: false,
      refreshed: false,
      lastRefresh: readString(parsed.last_refresh) || undefined,
      accessToken: apiKey,
    };
  }

  if (!accessTokenFromFile && !refreshTokenFromFile) {
    if (apiKey) {
      return {
        ready: true,
        authMode: "api_key",
        source: "api_key_auth_json",
        transport: localBridgeActive ? "local_cli_bridge" : "openai_api",
        upstreamTransport: "openai_api",
        usesSse: false,
        refreshable: false,
        refreshed: false,
        lastRefresh: readString(parsed.last_refresh) || undefined,
        accessToken: apiKey,
      };
    }
    return createEmptyLocalAuthState();
  }

  let accessToken = accessTokenFromFile;
  let refreshToken = refreshTokenFromFile || undefined;
  let refreshed = false;
  let error: string | undefined;
  let resolvedLastRefresh = readString(parsed.last_refresh) || undefined;

  if (shouldRefreshChatgptToken({ accessToken, refreshToken: refreshToken || "", lastRefresh: parsed.last_refresh })) {
    try {
      const refreshedTokens = await refreshLocalCodexTokens({
        refreshToken: refreshToken || "",
        idToken: idToken || undefined,
      });
      accessToken = refreshedTokens.access_token.trim();
      refreshToken = refreshedTokens.refresh_token?.trim() || refreshToken;
      refreshed = true;
      resolvedLastRefresh = new Date().toISOString();
      await persistRefreshedLocalAuthFile(authFilePath, parsed, {
        accessToken,
        refreshToken,
        idToken: refreshedTokens.id_token?.trim() || idToken || undefined,
      });
    } catch (refreshError) {
      error = sanitizeLogText(refreshError instanceof Error ? refreshError.message : String(refreshError));
      logCodexLocalWarning("Failed to refresh local Codex token bundle", {
        authMode: authMode || "chatgpt",
        path: authFilePath,
        refreshToken: maskSecret(refreshToken || ""),
        accessToken: maskSecret(accessToken),
        error,
      });
    }
  }

  const expiresAt = getTokenExpiryMs(accessToken);
  const tokenExpired = typeof expiresAt === "number" && expiresAt <= Date.now();
  if (!accessToken || tokenExpired) {
    if (apiKey) {
      return {
        ready: true,
        authMode: "api_key",
        source: "api_key_auth_json",
        transport: localBridgeActive ? "local_cli_bridge" : "openai_api",
        upstreamTransport: "openai_api",
        usesSse: false,
        refreshable: false,
        refreshed: false,
        lastRefresh: resolvedLastRefresh,
        error,
        accessToken: apiKey,
      };
    }
    return createEmptyLocalAuthState(error || (tokenExpired ? "Local Codex access token is expired" : undefined));
  }

  if (!localBridgeActive) {
    return {
      ready: false,
      authMode: authMode === "api_key" ? "api_key" : "chatgpt",
      source: "chatgpt_auth_json",
      transport: "unavailable",
      upstreamTransport: "chatgpt_backend_sse",
      usesSse: true,
      refreshable: Boolean(refreshToken),
      refreshed,
      lastRefresh: resolvedLastRefresh,
      error: error || "Local ChatGPT auth is available only when local_codex_bridge mode is active.",
    };
  }

  return {
    ready: true,
    authMode: authMode === "api_key" ? "api_key" : "chatgpt",
    source: "chatgpt_auth_json",
    transport: "local_cli_bridge",
    upstreamTransport: "chatgpt_backend_sse",
    usesSse: true,
    refreshable: Boolean(refreshToken),
    refreshed,
    lastRefresh: resolvedLastRefresh,
    error,
    accessToken,
    refreshToken,
  };
}

async function resolveLocalCodexAuthStateCached(): Promise<ResolvedLocalCodexAuthState> {
  const now = Date.now();
  if (cachedLocalAuthState && cachedLocalAuthState.expiresAt > now) {
    return cachedLocalAuthState.value;
  }
  if (!pendingLocalAuthState) {
    pendingLocalAuthState = resolveLocalCodexAuthStateUncached().finally(() => {
      pendingLocalAuthState = null;
    });
  }
  const value = await pendingLocalAuthState;
  cachedLocalAuthState = {
    expiresAt: now + LOCAL_AUTH_CACHE_TTL_MS,
    value,
  };
  return value;
}

export async function getLocalCodexAuthState(): Promise<CodexLocalAuthState> {
  const resolved = await resolveLocalCodexAuthStateCached();
  return {
    ready: resolved.ready,
    authMode: resolved.authMode,
    source: resolved.source,
    transport: resolved.transport,
    upstreamTransport: resolved.upstreamTransport,
    usesSse: resolved.usesSse,
    refreshable: resolved.refreshable,
    refreshed: resolved.refreshed,
    lastRefresh: resolved.lastRefresh,
    error: resolved.error,
  };
}

export async function getLocalCodexTokens(): Promise<{
  accessToken: string;
  refreshToken?: string;
  authMode?: CodexLocalAuthState["authMode"];
  source?: CodexLocalAuthState["source"];
  transport?: CodexLocalAuthState["transport"];
  upstreamTransport?: CodexLocalAuthState["upstreamTransport"];
  usesSse?: boolean;
  refreshed?: boolean;
} | null> {
  const resolved = await resolveLocalCodexAuthStateCached();
  if (!resolved.ready || !resolved.accessToken) {
    return null;
  }
  return {
    accessToken: resolved.accessToken,
    refreshToken: resolved.refreshToken,
    authMode: resolved.authMode,
    source: resolved.source,
    transport: resolved.transport,
    upstreamTransport: resolved.upstreamTransport,
    usesSse: resolved.usesSse,
    refreshed: resolved.refreshed,
  };
}

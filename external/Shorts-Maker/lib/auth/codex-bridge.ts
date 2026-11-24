import { isCodexOauthConfigured } from "@/lib/auth/codex";
import { isDeepseekConfigured } from "@/lib/studio/ai-provider";

type CodexConnectionMode = "oauth" | "local_codex_bridge";

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

function isVercelProductionRuntime(): boolean {
  const nodeEnv = (process.env.NODE_ENV || "").trim().toLowerCase();
  const vercel = (process.env.VERCEL || "").trim();
  return nodeEnv === "production" && Boolean(vercel);
}

export function isCodexLocalBridgeEnabled(): boolean {
  return readBooleanEnv("CODEX_LOCAL_BRIDGE_USE_CLI", true);
}

export function isCodexLocalBridgePreferred(): boolean {
  const defaultPrefer = !isVercelProductionRuntime();
  return readBooleanEnv("CODEX_LOCAL_BRIDGE_PREFER_LOCAL", defaultPrefer);
}

export function resolveCodexConnectionMode(): CodexConnectionMode {
  if (isDeepseekConfigured()) return "oauth";
  if (!isCodexOauthConfigured()) return "local_codex_bridge";
  if (isCodexLocalBridgeEnabled() && isCodexLocalBridgePreferred()) {
    return "local_codex_bridge";
  }
  return "oauth";
}

export function shouldUseLocalCodexCliBridge(codexAccessToken?: string): boolean {
  if (!isCodexLocalBridgeEnabled()) return false;
  if (!(codexAccessToken || "").trim()) return false;
  return resolveCodexConnectionMode() === "local_codex_bridge";
}

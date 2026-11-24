export type CodexConnectionMode = "oauth" | "local_codex_bridge";

export type CodexLocalAuthMode = "chatgpt" | "api_key" | "missing";

export type CodexLocalAuthSource = "chatgpt_auth_json" | "api_key_auth_json" | "missing";

export type CodexLocalAuthTransport = "local_cli_bridge" | "openai_api" | "unavailable";

export type CodexLocalAuthUpstreamTransport = "chatgpt_backend_sse" | "openai_api" | "unavailable";

export type CodexLocalAuthState = {
  ready: boolean;
  authMode: CodexLocalAuthMode;
  source: CodexLocalAuthSource;
  transport: CodexLocalAuthTransport;
  upstreamTransport: CodexLocalAuthUpstreamTransport;
  usesSse: boolean;
  refreshable: boolean;
  refreshed: boolean;
  lastRefresh?: string;
  error?: string;
};

export type CodexModelOption = {
  id: string;
  label: string;
  description?: string;
};

export type StudioCodexModelsResponse = {
  ok: true;
  mode: CodexConnectionMode;
  localReady: boolean;
  transport: CodexLocalAuthTransport;
  upstreamTransport: CodexLocalAuthUpstreamTransport;
  usesSse: boolean;
  authSource: CodexLocalAuthSource;
  defaultModel: string;
  models: CodexModelOption[];
  auth: CodexLocalAuthState;
};

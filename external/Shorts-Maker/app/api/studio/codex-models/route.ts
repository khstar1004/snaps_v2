import { NextResponse } from "next/server";
import { getLocalCodexAuthState } from "@/lib/auth/codex-local";
import { getLocalCodexModelCatalog } from "@/lib/auth/codex-models";
import { isCodexLocalBridgeEnabled, resolveCodexConnectionMode } from "@/lib/auth/codex-bridge";
import type { StudioCodexModelsResponse } from "@/lib/studio/codex-contract";

export const runtime = "nodejs";

export async function GET() {
  const mode = resolveCodexConnectionMode();
  const auth = await getLocalCodexAuthState();
  const localBridgeActive = mode === "local_codex_bridge" && isCodexLocalBridgeEnabled();
  const catalog = localBridgeActive ? await getLocalCodexModelCatalog() : { defaultModel: "", models: [] };
  const response: StudioCodexModelsResponse = {
    ok: true,
    mode,
    localReady: auth.ready,
    transport: auth.transport,
    upstreamTransport: auth.upstreamTransport,
    usesSse: auth.usesSse,
    authSource: auth.source,
    defaultModel: catalog.defaultModel,
    models: catalog.models,
    auth,
  };
  return NextResponse.json(response);
}

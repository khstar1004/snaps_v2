import { NextRequest, NextResponse } from "next/server";
import { isCodexLocalBridgeEnabled, resolveCodexConnectionMode } from "@/lib/auth/codex-bridge";
import { getLocalCodexTokens } from "@/lib/auth/codex-local";

export const runtime = "nodejs";

const CODEX_OAUTH_ACCESS_TOKEN_COOKIE = "codex_oauth_access_token";

export async function GET(request: NextRequest) {
  const localReady = isCodexLocalBridgeEnabled() ? Boolean(await getLocalCodexTokens()) : false;
  const connected = Boolean(request.cookies.get(CODEX_OAUTH_ACCESS_TOKEN_COOKIE)?.value?.trim()) || localReady;
  const mode = resolveCodexConnectionMode();
  return NextResponse.json({ ok: true, connected, mode, localReady });
}

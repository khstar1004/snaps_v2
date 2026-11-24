import type { NextRequest } from "next/server";
import { getLocalCodexTokens } from "@/lib/auth/codex-local";
import { getDeepseekApiKey, isDeepseekConfigured } from "@/lib/studio/ai-provider";

const CODEX_OAUTH_ACCESS_TOKEN_COOKIE = "codex_oauth_access_token";

export async function resolveCodexAccessTokenFromRequest(request: NextRequest): Promise<string> {
  if (isDeepseekConfigured()) return getDeepseekApiKey();
  const cookieToken = request.cookies.get(CODEX_OAUTH_ACCESS_TOKEN_COOKIE)?.value?.trim() || "";
  if (cookieToken) return cookieToken;

  const localTokens = await getLocalCodexTokens();
  return localTokens?.accessToken?.trim() || "";
}

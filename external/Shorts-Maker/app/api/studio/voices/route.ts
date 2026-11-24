import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  fetchStudioTtsRuntimeSnapshot,
  getStudioTtsSettings,
  listStudioVoiceAssets,
  listStudioVoiceOptions,
  resolveStudioVoiceSelection,
  type StudioTtsRuntimeSnapshot,
  type StudioTtsSettingsRecord,
  type StudioVoiceAssetRecord,
} from "@/lib/studio/tts-config";
import { DEFAULT_VOICE_PREVIEW_TEXT, getVoicePreviewRedisOrNull, toVoicePreviewCacheKey, VOICE_PREVIEW_CACHE_TTL_SEC } from "@/lib/studio/voice-preview-cache";
import { buildStudioSpeechCacheContext, synthesizeStudioSpeechFromSelection } from "@/lib/studio/tts-service";

export const runtime = "nodejs";

let prewarmPromise: Promise<void> | null = null;

async function prewarmVoicePreviews(
  voiceIds: string[],
  input: {
    settings: StudioTtsSettingsRecord;
    runtime: StudioTtsRuntimeSnapshot;
    voiceAssets: StudioVoiceAssetRecord[];
  }
): Promise<void> {
  const redis = getVoicePreviewRedisOrNull();
  if (!redis) return;
  for (const voiceId of voiceIds) {
    const safeVoiceId = String(voiceId || "").trim();
    if (!safeVoiceId) continue;
    const selection = await resolveStudioVoiceSelection(safeVoiceId, input);
    const cacheContext = buildStudioSpeechCacheContext(selection);
    const cacheKey = toVoicePreviewCacheKey(
      cacheContext.voiceId || safeVoiceId,
      DEFAULT_VOICE_PREVIEW_TEXT,
      JSON.stringify({
        provider: cacheContext.provider,
        modelId: cacheContext.modelId,
        variant: cacheContext.variant,
      })
    );
    const cached = await redis.get<{ audioBase64?: string } | string>(cacheKey);
    const cachedAudio =
      typeof cached === "string"
        ? cached.trim()
        : typeof cached?.audioBase64 === "string"
          ? cached.audioBase64.trim()
          : "";
    if (cachedAudio) continue;
    try {
      const result = await synthesizeStudioSpeechFromSelection(selection, DEFAULT_VOICE_PREVIEW_TEXT);
      if (!result.audioBase64) continue;
      await redis.set(cacheKey, { audioBase64: result.audioBase64, mimeType: result.mimeType }, { ex: VOICE_PREVIEW_CACHE_TTL_SEC });
    } catch {
      continue;
    }
  }
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const settings = await getStudioTtsSettings();
    const runtime = await fetchStudioTtsRuntimeSnapshot(settings);
    const voiceAssets = await listStudioVoiceAssets();
    const voices = await listStudioVoiceOptions(settings, runtime);
    const prewarmCandidates = voices.slice(0, 4).map((voice) => voice.id);
    if (!prewarmPromise && prewarmCandidates.length > 0) {
      prewarmPromise = prewarmVoicePreviews(prewarmCandidates, { settings, runtime, voiceAssets }).finally(() => {
        prewarmPromise = null;
      });
    }
    return NextResponse.json({
      ok: true,
      defaultProvider: settings.defaultProvider,
      voices,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

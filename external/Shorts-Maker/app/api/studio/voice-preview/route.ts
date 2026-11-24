import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { isRequestBodyParseError, readJsonObjectBody } from "@/lib/network/request-body";
import { resolveStudioVoiceSelection } from "@/lib/studio/tts-config";
import { buildStudioSpeechCacheContext, synthesizeStudioSpeechFromSelection } from "@/lib/studio/tts-service";
import { resolveSynthesizedSpeechPreviewWindow } from "@/lib/studio/render-dialogue";
import {
  DEFAULT_VOICE_PREVIEW_TEXT,
  getVoicePreviewRedisOrNull,
  toVoicePreviewCacheKey,
  VOICE_PREVIEW_CACHE_TTL_SEC,
} from "@/lib/studio/voice-preview-cache";

export const runtime = "nodejs";
const VOICE_PREVIEW_TEXT_MAX_LENGTH = 280;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type CachedVoicePreview = {
  audioBase64: string;
  mimeType: string;
  trimStartMs?: number;
  trimEndMs?: number;
  durationMs?: number;
};

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  try {
    const row = await readJsonObjectBody(request);
    const voiceId = asString(row.voiceId);
    const typecastEmotionType = asString(row.typecastEmotionType);
    const typecastSpeed = asFiniteNumber(row.typecastSpeed);
    const previewText = asString(row.text) || DEFAULT_VOICE_PREVIEW_TEXT;
    if (Array.from(previewText).length > VOICE_PREVIEW_TEXT_MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `text는 ${VOICE_PREVIEW_TEXT_MAX_LENGTH}자 이하로 입력해 주세요.` },
        { status: 400 }
      );
    }

    const redis = getVoicePreviewRedisOrNull();
    const selection = await resolveStudioVoiceSelection(voiceId || undefined, {
      typecastEmotionType: typecastEmotionType || undefined,
      typecastSpeed,
    });
    const cacheContext = buildStudioSpeechCacheContext(selection);
    const cacheKey = toVoicePreviewCacheKey(
      cacheContext.voiceId || "default",
      previewText,
      JSON.stringify({
        provider: cacheContext.provider,
        modelId: cacheContext.modelId,
        variant: cacheContext.variant,
        previewTrimVersion: "speech-window-v1",
      })
    );
    if (redis) {
      const cached = await redis.get<CachedVoicePreview | string>(cacheKey);
      const cachedAudio =
        typeof cached === "string"
          ? cached.trim()
          : typeof cached?.audioBase64 === "string"
            ? cached.audioBase64.trim()
            : "";
      const cachedMimeType =
        typeof cached === "object" && cached && typeof cached.mimeType === "string" && cached.mimeType.trim()
          ? cached.mimeType.trim()
          : "audio/wav";
      if (cachedAudio) {
        return NextResponse.json({
          ok: true,
          audioBase64: cachedAudio,
          mimeType: cachedMimeType,
          trimStartMs: typeof cached === "object" && cached ? cached.trimStartMs : undefined,
          trimEndMs: typeof cached === "object" && cached ? cached.trimEndMs : undefined,
          durationMs: typeof cached === "object" && cached ? cached.durationMs : undefined,
          cached: true,
        });
      }
    }

    const speech = await synthesizeStudioSpeechFromSelection(selection, previewText);
    const audioBase64 = String(speech.audioBase64 || "").trim();
    if (!audioBase64) {
      throw new Error("음성 미리듣기 생성에 실패했습니다.");
    }
    const previewWindow = resolveSynthesizedSpeechPreviewWindow(previewText, speech);
    if (redis) {
      await redis.set(
        cacheKey,
        { audioBase64, mimeType: speech.mimeType, ...previewWindow },
        { ex: VOICE_PREVIEW_CACHE_TTL_SEC }
      );
    }
    return NextResponse.json({
      ok: true,
      audioBase64,
      mimeType: speech.mimeType,
      ...previewWindow,
      cached: false,
    });
  } catch (error) {
    if (isRequestBodyParseError(error)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

import { createHash } from "node:crypto";
import { getSupabaseKeyValueStoreOrNull, type SupabaseKeyValueStore } from "@/lib/supabase/app-cache";

export const VOICE_PREVIEW_CACHE_PREFIX = "studio:voice-preview:";
export const VOICE_PREVIEW_CACHE_TTL_SEC = 60 * 60 * 24 * 365;
export const DEFAULT_VOICE_PREVIEW_TEXT = "안녕하세요. 반갑습니다.";

const VOICE_PREVIEW_CACHE_SCOPE = "studio_voice_preview";

export function getVoicePreviewRedisOrNull(): SupabaseKeyValueStore | null {
  return getSupabaseKeyValueStoreOrNull(VOICE_PREVIEW_CACHE_SCOPE);
}

export function toVoicePreviewCacheKey(voiceId: string, text: string, variant = ""): string {
  const hash = createHash("sha1")
    .update(
      JSON.stringify({
        text,
        variant,
      })
    )
    .digest("hex");
  return `${VOICE_PREVIEW_CACHE_PREFIX}${voiceId}:${hash}`;
}


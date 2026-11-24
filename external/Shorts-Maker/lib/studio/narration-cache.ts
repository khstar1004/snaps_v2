import { randomUUID } from "node:crypto";
import { getSupabaseKeyValueStoreOrNull } from "@/lib/supabase/app-cache";
import type { StudioRenderNarrationInput, StudioRenderNarrationSegment } from "@/types/studio-renderer";

const NARRATION_CACHE_PREFIX = "studio:narration:";
const NARRATION_CACHE_TTL_SEC = 60 * 60 * 2;
const NARRATION_CACHE_SCOPE = "studio_narration";

type StoredNarrationSegmentsRecord = {
  userId: string;
  narration: {
    mode: "segments";
    segments: StudioRenderNarrationSegment[];
    crossfadeMsByBoundary?: number[];
  };
};

type MemoryNarrationEntry = {
  expiresAt: number;
  record: StoredNarrationSegmentsRecord;
};

const memoryNarrationCache = new Map<string, MemoryNarrationEntry>();

function getNarrationRedisOrNull(userId: string) {
  return getSupabaseKeyValueStoreOrNull(NARRATION_CACHE_SCOPE, userId);
}

function toNarrationCacheKey(ref: string): string {
  return `${NARRATION_CACHE_PREFIX}${ref}`;
}

function pruneExpiredMemoryEntries(now = Date.now()): void {
  for (const [ref, entry] of memoryNarrationCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryNarrationCache.delete(ref);
    }
  }
}

export async function storeStudioNarrationSegments(input: {
  userId: string;
  segments: StudioRenderNarrationSegment[];
  crossfadeMsByBoundary?: number[];
}): Promise<string> {
  const ref = randomUUID();
  const record: StoredNarrationSegmentsRecord = {
    userId: input.userId,
    narration: {
      mode: "segments",
      segments: input.segments.map((segment) => ({
        segmentId: segment.segmentId,
        groupId: segment.groupId,
        audioBase64: segment.audioBase64,
        durationMs: segment.durationMs,
        mimeType: segment.mimeType,
        format: segment.format,
        trimStartMs: segment.trimStartMs,
        trimEndMs: segment.trimEndMs,
        pauseAfterMs: segment.pauseAfterMs,
      })),
      crossfadeMsByBoundary: Array.isArray(input.crossfadeMsByBoundary) ? input.crossfadeMsByBoundary : [],
    },
  };
  const redis = getNarrationRedisOrNull(input.userId);
  if (redis) {
    await redis.set(toNarrationCacheKey(ref), record, { ex: NARRATION_CACHE_TTL_SEC });
    return ref;
  }

  pruneExpiredMemoryEntries();
  memoryNarrationCache.set(ref, {
    expiresAt: Date.now() + NARRATION_CACHE_TTL_SEC * 1000,
    record,
  });
  return ref;
}

export async function loadStudioNarrationInput(
  ref: string,
  userId: string
): Promise<Extract<StudioRenderNarrationInput, { mode: "segments" }> | null> {
  const safeRef = ref.trim();
  if (!safeRef) return null;

  const redis = getNarrationRedisOrNull(userId);
  const redisRecord = redis ? await redis.get<StoredNarrationSegmentsRecord | null>(toNarrationCacheKey(safeRef)) : null;
  if (redisRecord) {
    if (redisRecord.userId !== userId || redisRecord.narration.mode !== "segments") return null;
    return redisRecord.narration;
  }

  pruneExpiredMemoryEntries();
  const memoryRecord = memoryNarrationCache.get(safeRef);
  if (!memoryRecord) return null;
  if (memoryRecord.expiresAt <= Date.now()) {
    memoryNarrationCache.delete(safeRef);
    return null;
  }
  if (memoryRecord.record.userId !== userId || memoryRecord.record.narration.mode !== "segments") return null;
  return memoryRecord.record.narration;
}

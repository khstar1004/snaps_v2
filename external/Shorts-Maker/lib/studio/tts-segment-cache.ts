import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const TTS_SEGMENT_CACHE_PREFIX = "studio:tts-segment:";
const TTS_SEGMENT_CACHE_TTL_SEC = 60 * 60 * 24 * 7;

type CachedAlignmentWord = {
  word: string;
  startSec: number;
  endSec: number;
  charStart?: number;
  charEnd?: number;
};

export type CachedTtsSegment = {
  audioBase64: string;
  durationSec: number;
  words: CachedAlignmentWord[];
  characterStartTimesSec: number[];
  characterEndTimesSec: number[];
};

type MemoryEntry = {
  expiresAt: number;
  value: CachedTtsSegment;
};

const memoryCache = new Map<string, MemoryEntry>();
let redisInstance: Redis | null = null;

function getRedisOrNull(): Redis | null {
  if (redisInstance) return redisInstance;
  const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) return null;
  redisInstance = new Redis({ url, token });
  return redisInstance;
}

function pruneMemory(now = Date.now()): void {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

function toCacheKey(rawKey: string): string {
  return `${TTS_SEGMENT_CACHE_PREFIX}${rawKey}`;
}

export function buildTtsSegmentCacheKey(input: {
  text: string;
  provider: string;
  voiceId: string;
  modelId: string;
  variant: string;
}): string {
  return createHash("sha1")
    .update(JSON.stringify({
      text: input.text.trim(),
      provider: input.provider.trim().toLowerCase(),
      voiceId: input.voiceId.trim().toLowerCase(),
      modelId: input.modelId.trim(),
      variant: input.variant.trim(),
    }))
    .digest("hex");
}

export async function loadCachedTtsSegment(rawKey: string): Promise<CachedTtsSegment | null> {
  const safeKey = rawKey.trim();
  if (!safeKey) return null;

  const redis = getRedisOrNull();
  const redisValue = redis ? await redis.get<CachedTtsSegment | null>(toCacheKey(safeKey)) : null;
  if (redisValue) return redisValue;

  pruneMemory();
  const memoryValue = memoryCache.get(safeKey);
  if (!memoryValue) return null;
  if (memoryValue.expiresAt <= Date.now()) {
    memoryCache.delete(safeKey);
    return null;
  }
  return memoryValue.value;
}

export async function storeCachedTtsSegment(rawKey: string, value: CachedTtsSegment): Promise<void> {
  const safeKey = rawKey.trim();
  if (!safeKey) return;

  const redis = getRedisOrNull();
  if (redis) {
    await redis.set(toCacheKey(safeKey), value, { ex: TTS_SEGMENT_CACHE_TTL_SEC });
    return;
  }

  pruneMemory();
  memoryCache.set(safeKey, {
    expiresAt: Date.now() + TTS_SEGMENT_CACHE_TTL_SEC * 1000,
    value,
  });
}

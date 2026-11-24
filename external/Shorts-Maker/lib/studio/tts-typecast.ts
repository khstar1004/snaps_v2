import { estimateWavDurationSecFromBase64 } from "@/lib/studio/wav-audio";

const TYPECAST_API_BASE_URL = "https://api.typecast.ai";
const TYPECAST_TTS_PATH = "/v1/text-to-speech";
const TYPECAST_TTS_TIMESTAMPS_PATH = "/v1/text-to-speech/with-timestamps";
const TYPECAST_VOICES_PATH = "/v2/voices";
const DEFAULT_TYPECAST_MODEL_ID = "ssfm-v30";
export const DEFAULT_TYPECAST_EMOTION_TYPE = "smart";
const VOICE_CACHE_TTL_MS = 30_000;
const TYPECAST_PRESET_EMOTIONS = new Set(["normal", "happy", "sad", "angry", "whisper", "toneup", "tonedown"]);
const DEFAULT_TYPECAST_REQUEST_CONCURRENCY = 1;
const DEFAULT_TYPECAST_RATE_LIMIT_RETRIES = 4;
const DEFAULT_TYPECAST_RATE_LIMIT_BASE_DELAY_MS = 1200;
const DEFAULT_TYPECAST_RATE_LIMIT_MAX_DELAY_MS = 10_000;

export type TypecastClientConfig = {
  apiKey?: string;
};

export type TypecastVoiceCatalogEntry = {
  voiceId: string;
  voiceName: string;
  gender?: string;
  age?: string;
  useCases: string[];
  models: Array<{
    version: string;
    emotions: string[];
  }>;
};

export type TypecastSpeechRequest = {
  text: string;
  voiceId: string;
  model?: string;
  language?: string;
  emotionType?: string;
  speed?: number;
  previousText?: string;
  nextText?: string;
};

export type TypecastSpeechResult = {
  audioBase64: string;
  durationSec: number;
  mimeType: "audio/wav";
  format: "wav";
  words: TypecastAlignmentWord[];
  characterStartTimesSec: number[];
  characterEndTimesSec: number[];
};

type RawTypecastVoice = {
  voice_id?: string;
  voice_name?: string;
  gender?: string;
  age?: string;
  use_cases?: unknown;
  models?: unknown;
};

type TypecastAlignmentWord = {
  word: string;
  startSec: number;
  endSec: number;
  charStart?: number;
  charEnd?: number;
};

type RawTypecastTimestampItem = {
  text?: unknown;
  start?: unknown;
  end?: unknown;
};

const voiceCache = new Map<string, { expiresAt: number; voices: TypecastVoiceCatalogEntry[] }>();
let activeTypecastRequests = 0;
const typecastRequestWaiters: Array<() => void> = [];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter(Boolean)
    )
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toPositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function resolveTypecastRequestConcurrency(): number {
  return toPositiveInt(process.env.TYPECAST_REQUEST_CONCURRENCY, DEFAULT_TYPECAST_REQUEST_CONCURRENCY, 1, 6);
}

async function acquireTypecastRequestSlot(): Promise<void> {
  const limit = resolveTypecastRequestConcurrency();
  if (activeTypecastRequests < limit) {
    activeTypecastRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    typecastRequestWaiters.push(() => {
      activeTypecastRequests += 1;
      resolve();
    });
  });
}

function releaseTypecastRequestSlot(): void {
  activeTypecastRequests = Math.max(0, activeTypecastRequests - 1);
  const next = typecastRequestWaiters.shift();
  if (next) next();
}

async function withTypecastRequestSlot<T>(action: () => Promise<T>): Promise<T> {
  await acquireTypecastRequestSlot();
  try {
    return await action();
  } finally {
    releaseTypecastRequestSlot();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(value: string | null): number | null {
  const safe = asString(value || "");
  if (!safe) return null;
  const seconds = Number(safe);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(0, Math.round(seconds * 1000));
  }
  const timestamp = Date.parse(safe);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - Date.now());
}

function resolveTypecastRetryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== null) {
    return clamp(retryAfterMs, 0, DEFAULT_TYPECAST_RATE_LIMIT_MAX_DELAY_MS);
  }
  const baseMs = toPositiveInt(
    process.env.TYPECAST_RATE_LIMIT_BASE_DELAY_MS,
    DEFAULT_TYPECAST_RATE_LIMIT_BASE_DELAY_MS,
    0,
    DEFAULT_TYPECAST_RATE_LIMIT_MAX_DELAY_MS
  );
  const multiplier = Math.max(0, attempt);
  return Math.min(DEFAULT_TYPECAST_RATE_LIMIT_MAX_DELAY_MS, baseMs * Math.max(1, 2 ** multiplier));
}

function resolveTypecastRateLimitRetries(): number {
  return toPositiveInt(process.env.TYPECAST_RATE_LIMIT_RETRIES, DEFAULT_TYPECAST_RATE_LIMIT_RETRIES, 0, 10);
}

async function fetchTypecastWithRateLimitRetry(input: {
  apiKey: string;
  body: string;
  path?: string;
  searchParams?: Record<string, string>;
}): Promise<Response> {
  const maxRetries = resolveTypecastRateLimitRetries();
  return withTypecastRequestSlot(async () => {
    let lastBody = "";
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const url = new URL(`${TYPECAST_API_BASE_URL}${input.path || TYPECAST_TTS_PATH}`);
      for (const [key, value] of Object.entries(input.searchParams || {})) {
        if (value) url.searchParams.set(key, value);
      }
      const response = await fetch(url, {
        method: "POST",
        headers: toHeaders(input.apiKey, true),
        cache: "no-store",
        body: input.body,
      });
      if (response.status !== 429) {
        return response;
      }
      lastBody = await response.text();
      if (attempt >= maxRetries) {
        throw new Error(`Typecast TTS failed (429): ${lastBody || '{"error_code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}'}`);
      }
      const waitMs = resolveTypecastRetryDelayMs(attempt, response.headers.get("retry-after"));
      console.warn(`[studio] Typecast rate limited; retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await delay(waitMs);
    }
    throw new Error(`Typecast TTS failed (429): ${lastBody || '{"error_code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}'}`);
  });
}

function toHeaders(apiKey?: string, withJson = true): Headers {
  const headers = new Headers();
  if (withJson) {
    headers.set("Content-Type", "application/json");
  }
  if (apiKey?.trim()) {
    headers.set("X-API-KEY", apiKey.trim());
  }
  return headers;
}

function normalizeLanguageAlias(value: string): string {
  const safe = value.trim().toLowerCase();
  if (!safe || safe === "auto") return "auto";
  if (safe === "korean" || safe === "ko" || safe === "ko-kr" || safe === "kor") return "kor";
  if (safe === "english" || safe === "en" || safe === "en-us" || safe === "eng") return "eng";
  if (safe === "japanese" || safe === "ja" || safe === "ja-jp" || safe === "jpn") return "jpn";
  if (safe === "chinese" || safe === "mandarin" || safe === "zh" || safe === "cmn" || safe === "zho") return "zho";
  if (safe === "cantonese" || safe === "yue") return "yue";
  if (safe === "spanish" || safe === "es" || safe === "spa") return "spa";
  if (safe === "french" || safe === "fr" || safe === "fra") return "fra";
  if (safe === "german" || safe === "de" || safe === "deu") return "deu";
  if (safe === "italian" || safe === "it" || safe === "ita") return "ita";
  if (safe === "portuguese" || safe === "pt" || safe === "por") return "por";
  if (safe === "russian" || safe === "ru" || safe === "rus") return "rus";
  return safe;
}

function inferLanguageFromText(text: string): string {
  const safe = String(text || "");
  if (/[가-힣]/.test(safe)) return "kor";
  if (/[ぁ-ゟ゠-ヿ]/u.test(safe)) return "jpn";
  if (/[一-鿿]/u.test(safe)) return "zho";
  if (/[A-Za-z]/.test(safe)) return "eng";
  return "kor";
}

export function normalizeTypecastLanguage(language: string | undefined, text: string): string {
  const normalized = normalizeLanguageAlias(String(language || ""));
  if (normalized !== "auto") return normalized;
  return inferLanguageFromText(text);
}

export function normalizeTypecastSpeed(speed: number | undefined): number {
  return clamp(Number(speed), 0.5, 2.0);
}

export function normalizeTypecastEmotionType(emotionType: string | undefined): string {
  const safe = asString(emotionType).toLowerCase();
  return safe || DEFAULT_TYPECAST_EMOTION_TYPE;
}

export function getTypecastDefaultEmotionTypeFromEnv(
  env: Record<string, string | undefined> = process.env
): string {
  return normalizeTypecastEmotionType(env.TYPECAST_DEFAULT_EMOTION_TYPE || env.TYPECAST_EMOTION_TYPE);
}

function normalizeTypecastModel(model: string | undefined): string {
  return asString(model).toLowerCase() || DEFAULT_TYPECAST_MODEL_ID;
}

function isTypecastV30Model(model: string): boolean {
  return model.startsWith("ssfm-v30");
}

function buildTypecastPrompt(input: Pick<TypecastSpeechRequest, "model" | "emotionType" | "previousText" | "nextText">) {
  const model = normalizeTypecastModel(input.model);
  const emotion = normalizeTypecastEmotionType(input.emotionType);
  const previousText = asString(input.previousText) || undefined;
  const nextText = asString(input.nextText) || undefined;

  if (emotion === "smart") {
    return {
      emotion_type: "smart",
      previous_text: previousText,
      next_text: nextText,
    };
  }

  if (TYPECAST_PRESET_EMOTIONS.has(emotion)) {
    if (isTypecastV30Model(model)) {
      return {
        emotion_type: "preset",
        emotion_preset: emotion,
        emotion_intensity: 1,
      };
    }
    return {
      emotion_preset: emotion,
      emotion_intensity: 1,
    };
  }

  console.info(`[studio] unsupported Typecast emotion "${emotion}" for model ${model}; falling back to smart`);
  return {
    emotion_type: "smart",
    previous_text: previousText,
    next_text: nextText,
  };
}

function asFiniteTimingSec(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeTimestampItems(value: unknown): Array<{ text: string; startSec: number; endSec: number }> {
  if (!Array.isArray(value)) return [];
  const items: Array<{ text: string; startSec: number; endSec: number }> = [];
  for (const item of value) {
    const row = item && typeof item === "object" ? (item as RawTypecastTimestampItem) : {};
    const text = typeof row.text === "string" ? row.text : "";
    const startSec = asFiniteTimingSec(row.start);
    const endSec = asFiniteTimingSec(row.end);
    if (!text || startSec === null || endSec === null || endSec < startSec) continue;
    items.push({ text, startSec, endSec });
  }
  return items;
}

function findTimestampTextIndex(source: string, needle: string, cursor: number): number {
  if (!needle) return -1;
  const exactIndex = source.indexOf(needle, cursor);
  if (exactIndex >= 0) return exactIndex;
  const compactNeedle = needle.replace(/\s+/g, "");
  if (!compactNeedle) return -1;
  for (let i = Math.max(0, cursor); i < source.length; i += 1) {
    let sourceIndex = i;
    let needleIndex = 0;
    while (sourceIndex < source.length && needleIndex < compactNeedle.length) {
      if (/\s/.test(source[sourceIndex])) {
        sourceIndex += 1;
        continue;
      }
      if (source[sourceIndex] !== compactNeedle[needleIndex]) break;
      sourceIndex += 1;
      needleIndex += 1;
    }
    if (needleIndex === compactNeedle.length) return i;
  }
  return -1;
}

function buildCharacterTimes(
  sourceText: string,
  characters: Array<{ text: string; startSec: number; endSec: number }>
): { starts: number[]; ends: number[] } {
  const starts = Array.from({ length: sourceText.length }, () => Number.NaN);
  const ends = Array.from({ length: sourceText.length }, () => Number.NaN);
  let cursor = 0;
  for (const character of characters) {
    const index = findTimestampTextIndex(sourceText, character.text, cursor);
    if (index < 0) continue;
    const width = Math.max(1, character.text.length);
    for (let offset = 0; offset < width && index + offset < sourceText.length; offset += 1) {
      starts[index + offset] = character.startSec;
      ends[index + offset] = character.endSec;
    }
    cursor = Math.max(cursor, index + width);
  }
  return { starts, ends };
}

function buildAlignmentWords(
  sourceText: string,
  words: Array<{ text: string; startSec: number; endSec: number }>
): TypecastAlignmentWord[] {
  const aligned: TypecastAlignmentWord[] = [];
  let cursor = 0;
  for (const word of words) {
    const index = findTimestampTextIndex(sourceText, word.text, cursor);
    const charStart = index >= 0 ? index : undefined;
    const charEnd = index >= 0 ? index + word.text.length : undefined;
    aligned.push({
      word: word.text,
      startSec: word.startSec,
      endSec: word.endSec,
      charStart,
      charEnd,
    });
    if (index >= 0) {
      cursor = Math.max(cursor, index + word.text.length);
    }
  }
  return aligned;
}

function parseTypecastTimestampResponse(payload: unknown, sourceText: string): TypecastSpeechResult {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const audioBase64 = asString(row.audio);
  if (!audioBase64) {
    throw new Error("Typecast timestamp response has no audio payload");
  }
  const words = normalizeTimestampItems(row.words);
  const characters = normalizeTimestampItems(row.characters);
  const characterTimes = buildCharacterTimes(sourceText, characters);
  const durationFromPayload = asFiniteTimingSec(row.audio_duration);
  return {
    audioBase64,
    durationSec: durationFromPayload && durationFromPayload > 0 ? durationFromPayload : estimateWavDurationSecFromBase64(audioBase64),
    mimeType: "audio/wav",
    format: "wav",
    words: buildAlignmentWords(sourceText, words),
    characterStartTimesSec: characterTimes.starts,
    characterEndTimesSec: characterTimes.ends,
  };
}

function normalizeTypecastVoice(raw: RawTypecastVoice): TypecastVoiceCatalogEntry | null {
  const voiceId = asString(raw.voice_id);
  if (!voiceId) return null;
  const voiceName = asString(raw.voice_name) || voiceId;
  const modelsRaw = Array.isArray(raw.models) ? raw.models : [];
  const models = modelsRaw
    .map((entry) => {
      const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const version = asString(row.version);
      if (!version) return null;
      return {
        version,
        emotions: asStringArray(row.emotions),
      };
    })
    .filter((entry): entry is TypecastVoiceCatalogEntry["models"][number] => Boolean(entry));
  return {
    voiceId,
    voiceName,
    gender: asString(raw.gender) || undefined,
    age: asString(raw.age) || undefined,
    useCases: asStringArray(raw.use_cases),
    models,
  };
}

export async function fetchTypecastVoices(
  config: TypecastClientConfig,
  input?: {
    model?: string;
    includeAllModels?: boolean;
  }
): Promise<TypecastVoiceCatalogEntry[]> {
  const apiKey = asString(config.apiKey);
  if (!apiKey) return [];
  const model = input?.includeAllModels ? "" : asString(input?.model) || DEFAULT_TYPECAST_MODEL_ID;
  const cacheKey = `${apiKey}::${model || "all-models"}`;
  const now = Date.now();
  const cached = voiceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.voices;
  }

  const url = new URL(`${TYPECAST_API_BASE_URL}${TYPECAST_VOICES_PATH}`);
  if (model) {
    url.searchParams.set("model", model);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: toHeaders(apiKey, false),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Typecast voices failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json().catch(() => [])) as RawTypecastVoice[];
  const voices = (Array.isArray(payload) ? payload : [])
    .map((voice) => normalizeTypecastVoice(voice))
    .filter((voice): voice is TypecastVoiceCatalogEntry => Boolean(voice));
  voiceCache.set(cacheKey, {
    expiresAt: now + VOICE_CACHE_TTL_MS,
    voices,
  });
  return voices;
}

export async function synthesizeTypecastSpeech(
  config: TypecastClientConfig,
  input: TypecastSpeechRequest
): Promise<TypecastSpeechResult> {
  const apiKey = asString(config.apiKey);
  if (!apiKey) {
    throw new Error("TYPECAST_API_KEY가 필요합니다.");
  }
  const text = asString(input.text);
  if (!text) {
    throw new Error("Typecast TTS text is required");
  }
  const voiceId = asString(input.voiceId);
  if (!voiceId) {
    throw new Error("Typecast voice ID가 필요합니다.");
  }
  const model = asString(input.model) || DEFAULT_TYPECAST_MODEL_ID;

  const requestBody = JSON.stringify({
      voice_id: voiceId,
      text,
      model,
      language: normalizeTypecastLanguage(input.language, text),
      prompt: buildTypecastPrompt({
        model,
        emotionType: input.emotionType,
        previousText: input.previousText,
        nextText: input.nextText,
      }),
      output: {
        audio_format: "wav",
        audio_tempo: normalizeTypecastSpeed(input.speed),
      },
    });
  const response = await fetchTypecastWithRateLimitRetry({
    apiKey,
    body: requestBody,
    path: TYPECAST_TTS_TIMESTAMPS_PATH,
  });
  if (!response.ok) {
    throw new Error(`Typecast TTS failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json().catch(() => null);
  return parseTypecastTimestampResponse(payload, text);
}

export async function synthesizeTypecastSpeechSegments(
  config: TypecastClientConfig,
  input: Omit<TypecastSpeechRequest, "text"> & {
    segments: string[];
  }
): Promise<TypecastSpeechResult[]> {
  const concurrencyRaw = Number(process.env.TYPECAST_SEGMENT_CONCURRENCY || "3");
  const concurrency = Number.isFinite(concurrencyRaw) ? Math.max(1, Math.min(6, Math.floor(concurrencyRaw))) : 3;
  const results = new Array<TypecastSpeechResult>(input.segments.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, input.segments.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= input.segments.length) break;
        results[index] = await synthesizeTypecastSpeech(config, {
          ...input,
          text: input.segments[index],
        });
      }
    })
  );

  return results;
}

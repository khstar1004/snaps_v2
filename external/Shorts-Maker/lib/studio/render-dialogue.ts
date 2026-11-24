import { getGroupNarrationText, getSlideNarrationText } from "@/lib/studio/narration-text";
import { buildFrameDurationsFromAlignment } from "@/lib/studio/timeline";
import { analyzePcmWavAudibleRangeFromBase64 } from "@/lib/studio/wav-audio";
import type { DialogueMode, NarrationSegment, PreparedSlide, SpeakerVoiceMap } from "@/types/studio-json";
import type { StudioAlignmentWord, StudioSynthesizedSpeech } from "@/lib/studio/tts-service";

export type SlideSegmentGroup = {
  groupId: number;
  frames: PreparedSlide[];
  text: string;
  speechSegments: SpeechSegmentInput[];
};

type SpeechSegmentInput = {
  type: "narration" | "quote";
  text: string;
  speakerId?: string;
  voiceId?: string;
  speed?: number;
  pauseAfterMs: number;
};

export type DialogueRenderOptions = {
  mode: DialogueMode;
  narrationVoice: string;
  quoteVoice: string;
  typecastEmotionType?: string;
  typecastSpeed?: number;
  speakerVoices?: SpeakerVoiceMap;
};

type SynthesizedSpeech = StudioSynthesizedSpeech;

type AlignmentWord = StudioAlignmentWord;

export type DialogueSpeechSynthesizer = (
  text: string,
  voiceId?: string,
  typecastEmotionType?: string,
  typecastSpeed?: number
) => Promise<SynthesizedSpeech>;

type SegmentSpeechWindow = {
  trimStartSec: number;
  trimEndSec: number;
  trimmedDurationSec: number;
  words: AlignmentWord[];
  characterStartTimesSec: number[];
  characterEndTimesSec: number[];
};

type SynthesizedSpeechPart = {
  text: string;
  speech: SynthesizedSpeech;
  speechWindow: SegmentSpeechWindow;
  pauseAfterMs: number;
};

type SynthesizedSpeechGroupResult = {
  sourceText: string;
  parts: SynthesizedSpeechPart[];
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstNonEmpty(values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = normalizeWhitespace(value || "");
    if (normalized) return normalized;
  }
  return "";
}

function normalizeSpeakerId(value: string): string {
  return normalizeWhitespace(value).slice(0, 40);
}

function normalizeSegmentSpeed(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clamp(value, 0.5, 2);
}

function normalizePauseAfterMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.floor(clamp(value, 0, 3000));
}

function resolveSpeakerVoices(value: unknown): SpeakerVoiceMap | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const speakerVoices: SpeakerVoiceMap = {};
  for (const [rawSpeakerId, rawVoiceId] of Object.entries(row)) {
    const speakerId = normalizeSpeakerId(rawSpeakerId);
    const voiceId = normalizeWhitespace(typeof rawVoiceId === "string" ? rawVoiceId : "");
    if (!speakerId || !voiceId) continue;
    speakerVoices[speakerId] = voiceId;
    if (Object.keys(speakerVoices).length >= 16) break;
  }
  return Object.keys(speakerVoices).length > 0 ? speakerVoices : undefined;
}

function resolveSpeakerVoicePool(quoteVoice: string): string[] {
  const raw = [
    process.env.STUDIO_DIALOGUE_SPEAKER_VOICE_IDS,
    process.env.STUDIO_DIALOGUE_SPEAKER_VOICES,
    process.env.STUDIO_DIALOGUE_QUOTE_VOICE_IDS,
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(",");
  const pool = raw
    .split(",")
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
  if (pool.length <= 0 && quoteVoice) return [quoteVoice];
  if (quoteVoice && !pool.includes(quoteVoice)) {
    pool.unshift(quoteVoice);
  }
  return Array.from(new Set(pool)).slice(0, 8);
}

function assignMissingQuoteSpeakerIds(segments: SpeechSegmentInput[], inferredSpeakerCount: number): SpeechSegmentInput[] {
  let missingTurn = 0;
  return segments.map((segment) => {
    if (segment.type !== "quote") return segment;
    const normalizedSpeakerId = normalizeSpeakerId(segment.speakerId || "");
    if (normalizedSpeakerId) {
      return {
        ...segment,
        speakerId: normalizedSpeakerId,
      };
    }
    missingTurn += 1;
    return {
      ...segment,
      speakerId: `unknown_${((missingTurn - 1) % Math.max(1, inferredSpeakerCount)) + 1}`,
    };
  });
}

function splitQuoteSpeakerPrefix(text: string): { text: string; speakerId?: string } {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return { text: "" };
  const matched = normalized.match(/^([\p{L}\p{N}_-]{1,20}(?:\s+[\p{L}\p{N}_-]{1,20}){0,2})\s*[:：]\s*(.+)$/u);
  if (!matched) return { text: normalized };
  const speakerId = normalizeSpeakerId(matched[1] || "");
  const quoteText = normalizeWhitespace(matched[2] || "");
  if (!speakerId || !quoteText) return { text: normalized };
  return {
    text: quoteText,
    speakerId,
  };
}

function isQuoteBoundaryChar(char: string): boolean {
  return char === "\"" || char === "“" || char === "”";
}

function stripQuoteBoundaryChars(value: string): string {
  let result = "";
  for (const char of Array.from(value)) {
    if (isQuoteBoundaryChar(char)) continue;
    result += char;
  }
  return result;
}

function countQuoteBoundaryChars(value: string): number {
  let count = 0;
  for (const char of Array.from(value)) {
    if (isQuoteBoundaryChar(char)) count += 1;
  }
  return count;
}

function hasQuoteSignal(value: string): boolean {
  return countQuoteBoundaryChars(value) >= 2;
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function findLastNonWhitespaceIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (!isWhitespace(text[i])) return i;
  }
  return -1;
}

function findLastFinite(values: number[], startIndex: number): number | null {
  for (let i = Math.min(values.length - 1, startIndex); i >= 0; i -= 1) {
    const value = Number(values[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function shiftFiniteTimes(values: number[], offsetSec: number, maxSec: number): number[] {
  return values.map((value) => {
    if (!Number.isFinite(value)) return Number.NaN;
    return clamp(value - offsetSec, 0, maxSec);
  });
}

function trimAlignmentWords(words: AlignmentWord[], trimStartSec: number, trimEndSec: number): AlignmentWord[] {
  const maxSec = Math.max(0.001, trimEndSec - trimStartSec);
  return words
    .filter((word) => Number.isFinite(word.endSec) && Number.isFinite(word.startSec))
    .filter((word) => word.endSec > trimStartSec && word.startSec < trimEndSec)
    .map((word) => {
      const startSec = clamp(word.startSec - trimStartSec, 0, maxSec);
      const endSec = clamp(word.endSec - trimStartSec, startSec, maxSec);
      return {
        ...word,
        startSec,
        endSec,
      };
    });
}

function resolveSegmentSpeechWindow(params: {
  text: string;
  audioBase64?: string;
  durationSec: number;
  words: AlignmentWord[];
  characterStartTimesSec: number[];
  characterEndTimesSec: number[];
}): SegmentSpeechWindow {
  const safeDurationSec = Math.max(0.001, Number.isFinite(params.durationSec) ? params.durationSec : 0.001);
  const lastTextIndex = findLastNonWhitespaceIndex(params.text);

  const charTrimEnd =
    lastTextIndex >= 0 ? findLastFinite(params.characterEndTimesSec || [], lastTextIndex) : null;
  const wordTrimEnd = [...params.words].reverse().find((word) => Number.isFinite(word.endSec))?.endSec;
  const trimStartSec = 0;
  const timestampTailCandidateSec = Math.max(
    Number.isFinite(charTrimEnd) ? Number(charTrimEnd) : 0,
    Number.isFinite(wordTrimEnd) ? Number(wordTrimEnd) : 0
  );
  let tailCandidateSec = timestampTailCandidateSec;
  const wavAudibleRange = params.audioBase64
    ? analyzePcmWavAudibleRangeFromBase64(params.audioBase64)
    : null;
  if (
    wavAudibleRange?.lastAudibleEndSec !== null &&
    wavAudibleRange?.lastAudibleEndSec !== undefined &&
    wavAudibleRange.durationSec > 0
  ) {
    const normalizedWavEndSec = clamp(
      wavAudibleRange.lastAudibleEndSec * (safeDurationSec / wavAudibleRange.durationSec),
      0,
      safeDurationSec
    );
    const timestampTailSec =
      timestampTailCandidateSec > 0
        ? Math.max(0, safeDurationSec - timestampTailCandidateSec)
        : safeDurationSec;
    const wavTailSec = Math.max(0, safeDurationSec - normalizedWavEndSec);
    const timestampMissedTail = timestampTailCandidateSec <= 0 || timestampTailSec <= 0.04;
    if (timestampMissedTail && wavTailSec >= 0.12) {
      tailCandidateSec = normalizedWavEndSec;
    }
  }
  const maxTailTrimSec = 0.25;
  const tailPaddingSec = 0.08;
  let trimEndSec = safeDurationSec;
  if (tailCandidateSec > 0) {
    const paddedTailSec = clamp(tailCandidateSec + tailPaddingSec, 0.12, safeDurationSec);
    const minimumAllowedEndSec = Math.max(0.12, safeDurationSec - maxTailTrimSec);
    trimEndSec = Math.max(minimumAllowedEndSec, paddedTailSec);
  }

  const trimmedDurationSec = Math.max(0.001, trimEndSec - trimStartSec);
  return {
    trimStartSec,
    trimEndSec,
    trimmedDurationSec,
    words: trimAlignmentWords(params.words, trimStartSec, trimEndSec),
    characterStartTimesSec: shiftFiniteTimes(params.characterStartTimesSec || [], trimStartSec, trimmedDurationSec),
    characterEndTimesSec: shiftFiniteTimes(params.characterEndTimesSec || [], trimStartSec, trimmedDurationSec),
  };
}

export function resolveDialogueRenderOptions(input: {
  mode?: DialogueMode;
  ttsVoiceId?: string;
  typecastEmotionType?: string;
  typecastSpeed?: number;
  narrationVoice?: string;
  quoteVoice?: string;
  speakerVoices?: SpeakerVoiceMap;
  slides?: PreparedSlide[];
}): DialogueRenderOptions {
  const slides = Array.isArray(input.slides) ? input.slides : [];
  const hasExplicitDialogueSegment = slides.some((slide) =>
    Array.isArray(slide.dialogueSegments)
      ? slide.dialogueSegments.some((segment) => segment && typeof segment === "object" && segment.type === "quote")
      : false
  );
  const hasQuotedTextSignal = slides.some((slide) =>
    [String(slide.narrationText || ""), String(slide.text || "")]
      .map((text) => normalizeWhitespace(text))
      .some((text) => hasQuoteSignal(text))
  );
  const hasAutoDialogueSignal = hasExplicitDialogueSegment || hasQuotedTextSignal;
  const explicitMode: DialogueMode | undefined = input.mode === "dialogue" || input.mode === "normal" ? input.mode : undefined;
  const resolvedMode: DialogueMode = explicitMode || (hasAutoDialogueSignal ? "dialogue" : "normal");
  if (!explicitMode && hasAutoDialogueSignal) {
    console.info("[studio] dialogue mode auto-enabled by quote signal");
  }
  const baseVoice = firstNonEmpty([input.ttsVoiceId, process.env.TYPECAST_DEFAULT_VOICE_ID, process.env.TYPECAST_VOICE_ID]);
  const narrationVoice = firstNonEmpty([input.narrationVoice, baseVoice]);
  const quoteVoice = firstNonEmpty([input.quoteVoice, narrationVoice, baseVoice]);
  const speakerVoices = resolveSpeakerVoices(input.speakerVoices);
  return {
    mode: resolvedMode,
    narrationVoice,
    quoteVoice: quoteVoice || narrationVoice,
    typecastEmotionType: normalizeWhitespace(input.typecastEmotionType || "") || undefined,
    typecastSpeed: Number.isFinite(input.typecastSpeed) ? clamp(Number(input.typecastSpeed), 0.5, 2) : undefined,
    speakerVoices,
  };
}

function parsePreparedDialogueSegments(slide: PreparedSlide): SpeechSegmentInput[] {
  if (!Array.isArray(slide.dialogueSegments)) return [];
  const segments: SpeechSegmentInput[] = [];
  for (const item of slide.dialogueSegments) {
    if (!item || typeof item !== "object") continue;
    const type = item.type === "quote" ? "quote" : "narration";
    const text = normalizeWhitespace(String(item.text || ""));
    if (!text) continue;
    segments.push({
      type,
      text,
      speakerId: normalizeSpeakerId(String(item.speakerId || "")) || undefined,
      voiceId: normalizeWhitespace(String(item.voice || "")) || undefined,
      speed: normalizeSegmentSpeed(item.speed),
      pauseAfterMs: normalizePauseAfterMs(item.pauseAfterMs),
    });
  }
  return segments;
}

function mergeSpeechSegments(segments: SpeechSegmentInput[]): SpeechSegmentInput[] {
  const merged: SpeechSegmentInput[] = [];
  for (const segment of segments) {
    const text = normalizeWhitespace(segment.text);
    if (!text) continue;
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.type === segment.type &&
      normalizeSpeakerId(previous.speakerId || "") === normalizeSpeakerId(segment.speakerId || "") &&
      normalizeWhitespace(previous.voiceId || "") === normalizeWhitespace(segment.voiceId || "") &&
      previous.speed === segment.speed &&
      previous.pauseAfterMs === segment.pauseAfterMs &&
      previous.pauseAfterMs === 0
    ) {
      previous.text = normalizeWhitespace(`${previous.text} ${text}`);
      continue;
    }
    merged.push({
      type: segment.type,
      text,
      speakerId: normalizeSpeakerId(segment.speakerId || "") || undefined,
      voiceId: normalizeWhitespace(segment.voiceId || "") || undefined,
      speed: normalizeSegmentSpeed(segment.speed),
      pauseAfterMs: normalizePauseAfterMs(segment.pauseAfterMs),
    });
  }
  return merged;
}

export function splitSpeechSegmentsByQuote(text: string): { segments: Array<{ type: "narration" | "quote"; text: string; speakerId?: string }>; hasQuote: boolean } {
  const source = normalizeWhitespace(text);
  if (!source) {
    return { segments: [], hasQuote: false };
  }
  const parsed: SpeechSegmentInput[] = [];
  let buffer = "";
  let inQuote = false;
  let foundQuoteBoundary = false;
  const flushBuffer = () => {
    const normalized = normalizeWhitespace(buffer);
    buffer = "";
    if (!normalized) return;
    if (inQuote) {
      const quotePart = splitQuoteSpeakerPrefix(normalized);
      parsed.push({
        type: "quote",
        text: quotePart.text,
        speakerId: quotePart.speakerId,
        pauseAfterMs: 0,
      });
      return;
    }
    parsed.push({
      type: "narration",
      text: normalized,
      pauseAfterMs: 0,
    });
  };

  for (const char of Array.from(source)) {
    if (isQuoteBoundaryChar(char)) {
      foundQuoteBoundary = true;
      flushBuffer();
      inQuote = !inQuote;
      continue;
    }
    buffer += char;
  }
  flushBuffer();

  const merged = mergeSpeechSegments(parsed);
  return {
    segments: merged.map((segment) => ({
      type: segment.type,
      text: segment.text,
      speakerId: segment.speakerId,
    })),
    hasQuote: foundQuoteBoundary && merged.some((segment) => segment.type === "quote"),
  };
}

function resolveGroupSpeechSegments(
  rawText: string,
  frames: PreparedSlide[],
  options: DialogueRenderOptions
): SpeechSegmentInput[] {
  const fallbackText = normalizeWhitespace(rawText) || " ";
  const groupVoiceId = frames.map((frame) => normalizeWhitespace(frame.ttsVoiceId || "")).find(Boolean) || "";
  const explicit = frames.map((slide) => parsePreparedDialogueSegments(slide)).find((segments) => segments.length > 0) || [];
  if (options.mode !== "dialogue" && explicit.length <= 0) {
    return [
      {
        type: "narration",
        text: fallbackText,
        voiceId: groupVoiceId || options.narrationVoice,
        pauseAfterMs: 0,
      },
    ];
  }
  let baseSegments: SpeechSegmentInput[] = explicit;
  if (baseSegments.length <= 0) {
    const parsed = splitSpeechSegmentsByQuote(fallbackText);
    baseSegments = parsed.segments.map((segment) => ({
      ...segment,
      pauseAfterMs: 0,
    }));
  }
  if (baseSegments.length <= 0) {
    return [
      {
        type: "narration",
        text: fallbackText,
        voiceId: groupVoiceId || options.narrationVoice,
        pauseAfterMs: 0,
      },
    ];
  }
  const speakerVoicePool = resolveSpeakerVoicePool(options.quoteVoice);
  const inferredSpeakerCount = Math.max(
    2,
    Math.min(
      6,
      speakerVoicePool.length > 0 ? speakerVoicePool.length : Object.keys(options.speakerVoices || {}).length || 2
    )
  );
  const segmentsWithSpeakerIds =
    options.mode === "dialogue" ? assignMissingQuoteSpeakerIds(baseSegments, inferredSpeakerCount) : baseSegments;
  const resolveSegmentVoiceId = (segment: SpeechSegmentInput): string => {
    const explicitVoice = normalizeWhitespace(segment.voiceId || "");
    if (explicitVoice) return explicitVoice;
    if (options.mode !== "dialogue") return groupVoiceId || options.narrationVoice;
    const speakerVoice =
      normalizeSpeakerId(segment.speakerId || "") && options.speakerVoices
        ? normalizeWhitespace(options.speakerVoices[normalizeSpeakerId(segment.speakerId || "")] || "")
        : "";
    if (speakerVoice) return speakerVoice;
    if (segment.type === "quote") {
      const speakerId = normalizeSpeakerId(segment.speakerId || "");
      const suffix = Number(speakerId.replace(/^(?:speaker|unknown)_/, ""));
      const poolIndex =
        Number.isFinite(suffix) && suffix > 0 ? (Math.floor(suffix) - 1) % Math.max(1, speakerVoicePool.length) : 0;
      const pooledVoice = normalizeWhitespace(speakerVoicePool[poolIndex] || "");
      if (pooledVoice) return pooledVoice;
    }
    if (groupVoiceId) return groupVoiceId;
    return segment.type === "quote" ? options.quoteVoice : options.narrationVoice;
  };
  return mergeSpeechSegments(
    segmentsWithSpeakerIds.map((segment) => ({
      type: segment.type,
      text: segment.text,
      speakerId: normalizeSpeakerId(segment.speakerId || "") || undefined,
      voiceId: resolveSegmentVoiceId(segment),
      speed: normalizeSegmentSpeed(segment.speed),
      pauseAfterMs: normalizePauseAfterMs(segment.pauseAfterMs),
    }))
  );
}

export function buildSlideSegmentGroups(frames: PreparedSlide[], options: DialogueRenderOptions): SlideSegmentGroup[] {
  if (frames.length === 0) return [];

  const hasGroupMetadata = frames.every((frame) => Number.isFinite(frame.groupId) && Number.isFinite(frame.stepIndex));
  if (!hasGroupMetadata) {
    return frames.map((frame, index) => {
      const rawText = getSlideNarrationText(frame);
      const speechSegments = resolveGroupSpeechSegments(rawText, [frame], options);
      const text = normalizeWhitespace(speechSegments.map((segment) => segment.text).join(" ")) || normalizeWhitespace(rawText) || " ";
      return {
        groupId: index,
        frames: [frame],
        text,
        speechSegments,
      };
    });
  }

  const grouped = new Map<number, PreparedSlide[]>();
  for (const frame of frames) {
    const key = Number(frame.groupId);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(frame);
    } else {
      grouped.set(key, [frame]);
    }
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([groupId, groupFrames]) => {
      const orderedFrames = groupFrames
        .slice()
        .sort((left, right) => Number(left.stepIndex || 0) - Number(right.stepIndex || 0));
      const rawText = getGroupNarrationText(orderedFrames);
      const speechSegments = resolveGroupSpeechSegments(rawText, orderedFrames, options);
      const text = normalizeWhitespace(speechSegments.map((segment) => segment.text).join(" ")) || normalizeWhitespace(rawText) || " ";
      return {
        groupId,
        frames: orderedFrames,
        text,
        speechSegments,
      };
    });
}

function resolveSegmentConcurrency(total: number): number {
  const concurrencyRaw = Number(process.env.STUDIO_TTS_SEGMENT_CONCURRENCY || process.env.TYPECAST_SEGMENT_CONCURRENCY || "3");
  const concurrency = Number.isFinite(concurrencyRaw) ? Math.floor(concurrencyRaw) : 3;
  return Math.max(1, Math.min(6, Math.min(total, concurrency)));
}

function toAlignmentSafeText(value: string): string {
  return normalizeWhitespace(stripQuoteBoundaryChars(value));
}

function toLineWeight(text: string): number {
  const normalized = String(text || "").replace(/[^\p{L}\p{N}]/gu, "").trim();
  return Math.max(1, normalized.length);
}

export function splitDurationByWeights(totalSec: number, weights: number[], minLineSec: number): number[] {
  const count = weights.length;
  if (count <= 0) return [];
  if (count === 1) return [Math.max(0.001, totalSec)];
  const safeWeights = weights.map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
  const sumWeights = safeWeights.reduce((acc, cur) => acc + cur, 0) || count;
  const minSec = Math.max(0.001, Math.min(minLineSec, totalSec / count));
  const base = safeWeights.map((value) => Math.max(minSec, (Math.max(0.001, totalSec) * value) / sumWeights));
  const baseSum = base.reduce((acc, cur) => acc + cur, 0);
  base[base.length - 1] = Math.max(0.001, base[base.length - 1] + (Math.max(0.001, totalSec) - baseSum));
  return base;
}

function toAlignmentFrames(frames: PreparedSlide[], mode: DialogueMode): PreparedSlide[] {
  if (mode !== "dialogue") return frames;
  return frames.map((frame) => {
    const alignedText = toAlignmentSafeText(String(frame.text || ""));
    const fallbackText = normalizeWhitespace(String(frame.text || "")) || " ";
    const nextText = alignedText || fallbackText;
    if (nextText === String(frame.text || "").trim()) return frame;
    return {
      ...frame,
      text: nextText,
    };
  });
}

async function toTtsCacheKey(
  text: string,
  voiceId?: string,
  typecastEmotionType?: string,
  typecastSpeed?: number
): Promise<{ key: string; context: { provider: string; voiceId: string; modelId: string; variant: string } }> {
  const { resolveStudioVoiceSelection } = await import("@/lib/studio/tts-config");
  const { buildStudioSpeechCacheContext } = await import("@/lib/studio/tts-service");
  const { buildTtsSegmentCacheKey } = await import("@/lib/studio/tts-segment-cache");
  const selection = await resolveStudioVoiceSelection(voiceId, {
    typecastEmotionType,
    typecastSpeed,
  });
  const context = buildStudioSpeechCacheContext(selection);
  return {
    key: buildTtsSegmentCacheKey({
      text,
      provider: context.provider,
      voiceId: context.voiceId,
      modelId: context.modelId,
      variant: context.variant,
    }),
    context,
  };
}

async function synthesizeTextWithCache(
  text: string,
  voiceId?: string,
  typecastEmotionType?: string,
  typecastSpeed?: number
): Promise<SynthesizedSpeech> {
  const { loadCachedTtsSegment, storeCachedTtsSegment } = await import("@/lib/studio/tts-segment-cache");
  const { resolveStudioVoiceSelection } = await import("@/lib/studio/tts-config");
  const { synthesizeStudioSpeech } = await import("@/lib/studio/tts-service");
  const safeText = normalizeWhitespace(text) || " ";
  const preferredCache = await toTtsCacheKey(safeText, voiceId, typecastEmotionType, typecastSpeed);
  const cachedPreferred = await loadCachedTtsSegment(preferredCache.key);
  if (cachedPreferred) {
    const supportsAlignment =
      cachedPreferred.words.length > 0 ||
      cachedPreferred.characterStartTimesSec.some((value) => Number.isFinite(value)) ||
      cachedPreferred.characterEndTimesSec.some((value) => Number.isFinite(value));
    return {
      ...cachedPreferred,
      mimeType: "audio/wav",
      format: "wav",
      provider: "typecast",
      supportsAlignment,
      resolvedVoice: await resolveStudioVoiceSelection(voiceId, {
        typecastEmotionType,
        typecastSpeed,
      }),
    };
  }

  const synthesized = await synthesizeStudioSpeech(safeText, voiceId, {
    typecastEmotionType,
    typecastSpeed,
  });
  await storeCachedTtsSegment(preferredCache.key, {
    audioBase64: synthesized.audioBase64,
    durationSec: synthesized.durationSec,
    words: synthesized.words,
    characterStartTimesSec: synthesized.characterStartTimesSec,
    characterEndTimesSec: synthesized.characterEndTimesSec,
  });
  return synthesized;
}

function offsetAlignmentWords(words: AlignmentWord[], audioOffsetSec: number, charOffset: number): AlignmentWord[] {
  return words.map((word) => ({
    ...word,
    startSec: Number.isFinite(word.startSec) ? word.startSec + audioOffsetSec : word.startSec,
    endSec: Number.isFinite(word.endSec) ? word.endSec + audioOffsetSec : word.endSec,
    charStart: Number.isFinite(word.charStart) ? Number(word.charStart) + charOffset : word.charStart,
    charEnd: Number.isFinite(word.charEnd) ? Number(word.charEnd) + charOffset : word.charEnd,
  }));
}

function offsetCharacterTimes(times: number[], text: string, audioOffsetSec: number): number[] {
  return Array.from({ length: text.length }, (_, index) => {
    const value = Number(times[index]);
    return Number.isFinite(value) ? value + audioOffsetSec : Number.NaN;
  });
}

function resolveSpeechWindowForSynthesized(text: string, speech: SynthesizedSpeech): SegmentSpeechWindow {
  if (speech.supportsAlignment) {
    return resolveSegmentSpeechWindow({
      text,
      audioBase64: speech.audioBase64,
      durationSec: speech.durationSec,
      words: speech.words,
      characterStartTimesSec: speech.characterStartTimesSec,
      characterEndTimesSec: speech.characterEndTimesSec,
    });
  }
  return {
    trimStartSec: 0,
    trimEndSec: Math.max(0.001, speech.durationSec),
    trimmedDurationSec: Math.max(0.001, speech.durationSec),
    words: [],
    characterStartTimesSec: [],
    characterEndTimesSec: [],
  };
}

export function resolveSynthesizedSpeechPreviewWindow(
  text: string,
  speech: StudioSynthesizedSpeech
): { trimStartMs: number; trimEndMs: number; durationMs: number } {
  const window = resolveSpeechWindowForSynthesized(text, speech);
  return {
    trimStartMs: Math.max(0, Math.round(window.trimStartSec * 1000)),
    trimEndMs: Math.max(1, Math.round(window.trimEndSec * 1000)),
    durationMs: Math.max(1, Math.round(window.trimmedDurationSec * 1000)),
  };
}

function buildVirtualSpeechWindow(parts: SynthesizedSpeechPart[]): SegmentSpeechWindow {
  const words: AlignmentWord[] = [];
  const characterStartTimesSec: number[] = [];
  const characterEndTimesSec: number[] = [];
  let audioOffsetSec = 0;
  let charOffset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const speechWindow = part.speechWindow;
    words.push(...offsetAlignmentWords(speechWindow.words || [], audioOffsetSec, charOffset));
    characterStartTimesSec.push(...offsetCharacterTimes(speechWindow.characterStartTimesSec || [], part.text, audioOffsetSec));
    characterEndTimesSec.push(...offsetCharacterTimes(speechWindow.characterEndTimesSec || [], part.text, audioOffsetSec));
    audioOffsetSec += Math.max(0.001, speechWindow.trimmedDurationSec) + part.pauseAfterMs / 1000;
    charOffset += part.text.length;
    if (index < parts.length - 1) {
      characterStartTimesSec.push(Number.NaN);
      characterEndTimesSec.push(Number.NaN);
      charOffset += 1;
    }
  }

  const supportsAlignment =
    words.length > 0 ||
    characterStartTimesSec.some((value) => Number.isFinite(value)) ||
    characterEndTimesSec.some((value) => Number.isFinite(value));
  return {
    trimStartSec: 0,
    trimEndSec: Math.max(0.001, audioOffsetSec),
    trimmedDurationSec: Math.max(0.001, audioOffsetSec),
    words,
    characterStartTimesSec: supportsAlignment ? characterStartTimesSec : [],
    characterEndTimesSec: supportsAlignment ? characterEndTimesSec : [],
  };
}

async function synthesizeSpeechSegments(
  segments: SpeechSegmentInput[],
  typecastEmotionType?: string,
  typecastSpeed?: number,
  synthesizeText: DialogueSpeechSynthesizer = synthesizeTextWithCache
): Promise<SynthesizedSpeechGroupResult> {
  const normalized = mergeSpeechSegments(
    segments
      .map((segment): SpeechSegmentInput => ({
        type: segment.type === "quote" ? "quote" : "narration",
        text: normalizeWhitespace(segment.text),
        speakerId: normalizeSpeakerId(segment.speakerId || "") || undefined,
        voiceId: normalizeWhitespace(segment.voiceId || "") || undefined,
        speed: normalizeSegmentSpeed(segment.speed),
        pauseAfterMs: normalizePauseAfterMs(segment.pauseAfterMs),
      }))
      .filter((segment) => segment.text)
  );
  if (normalized.length <= 0) {
    const single = await synthesizeText(" ", undefined, typecastEmotionType, typecastSpeed);
    return {
      sourceText: " ",
      parts: [
        {
          text: " ",
          speech: single,
          speechWindow: resolveSpeechWindowForSynthesized(" ", single),
          pauseAfterMs: 0,
        },
      ],
    };
  }
  const sourceText = normalized.map((segment) => segment.text).join(" ").trim() || " ";
  if (normalized.length > 1) {
    const synthesizedSegments = await Promise.all(
      normalized.map(async (segment): Promise<SynthesizedSpeechPart> => {
        const speech = await synthesizeText(
          segment.text,
          segment.voiceId,
          typecastEmotionType,
          segment.speed ?? normalizeSegmentSpeed(typecastSpeed)
        );
        return {
          text: segment.text,
          speech,
          speechWindow: resolveSpeechWindowForSynthesized(segment.text, speech),
          pauseAfterMs: segment.pauseAfterMs,
        };
      })
    );
    return {
      sourceText,
      parts: synthesizedSegments,
    };
  }
  const primary = normalized[0];
  const single = await synthesizeText(
    sourceText,
    primary.voiceId,
    typecastEmotionType,
    primary.speed ?? normalizeSegmentSpeed(typecastSpeed)
  );
  return {
    sourceText,
    parts: [
      {
        text: sourceText,
        speech: single,
        speechWindow: resolveSpeechWindowForSynthesized(sourceText, single),
        pauseAfterMs: primary.pauseAfterMs,
      },
    ],
  };
}

export async function synthesizeSlideNarrationSegments(
  groups: SlideSegmentGroup[],
  options: Pick<DialogueRenderOptions, "mode" | "typecastEmotionType" | "typecastSpeed"> & {
    synthesizeText?: DialogueSpeechSynthesizer;
  }
) {
  if (groups.length === 0) {
    return {
      narrationSegments: [] as NarrationSegment[],
      frameDurationsSec: [] as number[],
      crossfadeMsByBoundary: [] as number[],
      durationMs: 0,
      ttsChars: 0,
    };
  }

  const results = new Array<SynthesizedSpeechGroupResult>(groups.length);
  let cursor = 0;
  const workerCount = resolveSegmentConcurrency(groups.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= groups.length) break;
        const group = groups[index];
        results[index] = await synthesizeSpeechSegments(
          group.speechSegments,
          options.typecastEmotionType,
          options.typecastSpeed,
          options.synthesizeText
        );
      }
    })
  );

  const narrationSegments: NarrationSegment[] = [];
  const frameDurationsSec: number[] = [];
  let cursorSec = 0;
  let ttsChars = 0;

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const result = results[i];
    const sourceText = normalizeWhitespace(result.sourceText) || group.text;
    const virtualSpeechWindow = buildVirtualSpeechWindow(result.parts);
    const supportsAlignment = result.parts.every((part) => part.speech.supportsAlignment);
    const alignmentFrames = toAlignmentFrames(group.frames, options.mode);
    const groupFrameDurationsSec = supportsAlignment
      ? buildFrameDurationsFromAlignment({
          slides: alignmentFrames,
          totalDurationSec: virtualSpeechWindow.trimmedDurationSec,
          sourceText,
          words: virtualSpeechWindow.words,
          characterStartTimesSec: virtualSpeechWindow.characterStartTimesSec,
          characterEndTimesSec: virtualSpeechWindow.characterEndTimesSec,
        }).map((value) => (Number.isFinite(value) && value > 0 ? value : 0.001))
      : splitDurationByWeights(
          Math.max(0.001, virtualSpeechWindow.trimmedDurationSec),
          group.frames.map((frame) => toLineWeight(getSlideNarrationText(frame))),
          0.18
        );

    frameDurationsSec.push(...groupFrameDurationsSec);
    const groupDurationSec = groupFrameDurationsSec.reduce((acc, cur) => acc + cur, 0);
    const durationMs = Math.max(1, Math.round(groupDurationSec * 1000));
    cursorSec += groupDurationSec;
    ttsChars += result.parts.reduce((total, part) => total + part.text.trim().length, 0);
    const isSinglePart = result.parts.length <= 1;
    for (let partIndex = 0; partIndex < result.parts.length; partIndex += 1) {
      const part = result.parts[partIndex];
      const speechWindow = part.speechWindow;
      const partDurationMs = Math.max(
        1,
        Math.round(speechWindow.trimmedDurationSec * 1000) + part.pauseAfterMs
      );
      narrationSegments.push({
        segmentId: isSinglePart ? `segment-${group.groupId + 1}` : `segment-${group.groupId + 1}-${partIndex + 1}`,
        groupId: group.groupId,
        audioBase64: part.speech.audioBase64,
        durationMs: isSinglePart ? durationMs : partDurationMs,
        mimeType: part.speech.mimeType,
        format: part.speech.format,
        trimStartMs: Math.max(0, Math.round(speechWindow.trimStartSec * 1000)),
        trimEndMs: Math.max(1, Math.round(speechWindow.trimEndSec * 1000)),
        pauseAfterMs: part.pauseAfterMs,
      });
    }
  }

  return {
    narrationSegments,
    frameDurationsSec,
    crossfadeMsByBoundary: Array.from({ length: Math.max(0, narrationSegments.length - 1) }, () => 0),
    durationMs: Math.max(1, Math.round(cursorSec * 1000)),
    ttsChars,
  };
}

"use client";

import type { PreparedSlide } from "@/types/studio-json";

export type DialogueVoiceSelection = {
  narrationVoiceId: string;
  quoteVoiceId: string;
  maleVoiceId: string;
  femaleVoiceId: string;
};

function normalizeVoiceId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSpeakerId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isDialogueMode(source: Record<string, unknown>): boolean {
  return normalizeSpeakerId(source.mode) === "dialogue";
}

function updatePreparedDialogueSegmentVoices(
  segments: PreparedSlide["dialogueSegments"],
  resolveVoiceId: (segment: NonNullable<PreparedSlide["dialogueSegments"]>[number]) => string
): PreparedSlide["dialogueSegments"] {
  if (!Array.isArray(segments)) return segments;
  let changed = false;
  const nextSegments = segments.map((segment) => {
    if (!segment || typeof segment !== "object") return segment;
    const nextVoiceId = normalizeVoiceId(resolveVoiceId(segment));
    const currentVoiceId = normalizeVoiceId(segment.voice);
    if ((nextVoiceId && currentVoiceId === nextVoiceId) || (!nextVoiceId && !currentVoiceId)) return segment;
    changed = true;
    if (nextVoiceId) {
      return {
        ...segment,
        voice: nextVoiceId,
      };
    }
    const { voice: _voice, ...rest } = segment;
    return rest;
  });
  return changed ? nextSegments : segments;
}

function updateRawDialogueSegmentVoices(
  segments: unknown,
  resolveVoiceId: (segment: Record<string, unknown>) => string
): unknown {
  if (!Array.isArray(segments)) return segments;
  let changed = false;
  const nextSegments = segments.map((segment) => {
    if (!segment || typeof segment !== "object") return segment;
    const row = segment as Record<string, unknown>;
    const nextVoiceId = normalizeVoiceId(resolveVoiceId(row));
    const currentVoiceId = normalizeVoiceId(row.voice);
    if ((nextVoiceId && currentVoiceId === nextVoiceId) || (!nextVoiceId && !currentVoiceId)) return segment;
    changed = true;
    if (nextVoiceId) {
      return {
        ...row,
        voice: nextVoiceId,
      };
    }
    const { voice: _voice, ...rest } = row;
    return rest;
  });
  return changed ? nextSegments : segments;
}

export function setPreparedDialogueSegmentVoices(
  segments: PreparedSlide["dialogueSegments"],
  nextVoiceId?: string
): PreparedSlide["dialogueSegments"] {
  return updatePreparedDialogueSegmentVoices(segments, () => nextVoiceId || "");
}

export function setRawDialogueSegmentVoices(segments: unknown, nextVoiceId: string): unknown {
  return updateRawDialogueSegmentVoices(segments, () => nextVoiceId || "");
}

export function applyVoiceSelectionToSlides(slides: PreparedSlide[], nextVoiceId: string): PreparedSlide[] {
  return slides.map((slide) => {
    const currentSlideVoiceId = normalizeVoiceId(slide.ttsVoiceId);
    const nextDialogueSegments = setPreparedDialogueSegmentVoices(slide.dialogueSegments, nextVoiceId);
    if (currentSlideVoiceId === nextVoiceId && nextDialogueSegments === slide.dialogueSegments) return slide;
    return {
      ...slide,
      ttsVoiceId: nextVoiceId || undefined,
      dialogueSegments: nextDialogueSegments,
    };
  });
}

export function applyVoiceSelectionToScriptJson(source: Record<string, unknown>, nextVoiceId: string): Record<string, unknown> {
  const nextSource = { ...source };
  nextSource.ttsVoiceId = nextVoiceId || undefined;

  const mode = normalizeSpeakerId(nextSource.mode);
  if (mode === "dialogue") {
    if (nextVoiceId) nextSource.narrationVoice = nextVoiceId;
    else delete nextSource.narrationVoice;

    if (nextVoiceId) nextSource.quoteVoice = nextVoiceId;
    else delete nextSource.quoteVoice;

    if (nextSource.speakerVoices && typeof nextSource.speakerVoices === "object" && !Array.isArray(nextSource.speakerVoices)) {
      const raw = nextSource.speakerVoices as Record<string, unknown>;
      const nextSpeakerVoices: Record<string, string> = {};
      for (const [speakerId] of Object.entries(raw)) {
        if (nextVoiceId) nextSpeakerVoices[speakerId] = nextVoiceId;
      }
      if (Object.keys(nextSpeakerVoices).length > 0) {
        nextSource.speakerVoices = nextSpeakerVoices;
      } else {
        delete nextSource.speakerVoices;
      }
    }
  }

  if (Array.isArray(nextSource.slides)) {
    nextSource.slides = nextSource.slides.map((item) => {
      if (!item || typeof item !== "object") return item;
      const slide = { ...(item as Record<string, unknown>) };
      if (nextVoiceId) slide.ttsVoiceId = nextVoiceId;
      else delete slide.ttsVoiceId;
      if (Array.isArray(slide.dialogueSegments)) {
        slide.dialogueSegments = setRawDialogueSegmentVoices(slide.dialogueSegments, nextVoiceId);
      }
      return slide;
    });
  }

  return nextSource;
}

export function applyNarrationVoiceSelectionToSlides(slides: PreparedSlide[], nextVoiceId: string): PreparedSlide[] {
  return slides.map((slide) => {
    const currentSlideVoiceId = normalizeVoiceId(slide.ttsVoiceId);
    const nextDialogueSegments = updatePreparedDialogueSegmentVoices(slide.dialogueSegments, (segment) =>
      segment.type === "quote" ? normalizeVoiceId(segment.voice) : nextVoiceId
    );
    if (currentSlideVoiceId === nextVoiceId && nextDialogueSegments === slide.dialogueSegments) return slide;
    return {
      ...slide,
      ttsVoiceId: nextVoiceId || undefined,
      dialogueSegments: nextDialogueSegments,
    };
  });
}

export function applyNarrationVoiceSelectionToScriptJson(source: Record<string, unknown>, nextVoiceId: string): Record<string, unknown> {
  const nextSource = { ...source };
  nextSource.ttsVoiceId = nextVoiceId || undefined;

  if (isDialogueMode(nextSource)) {
    if (nextVoiceId) nextSource.narrationVoice = nextVoiceId;
    else delete nextSource.narrationVoice;
  }

  if (Array.isArray(nextSource.slides)) {
    nextSource.slides = nextSource.slides.map((item) => {
      if (!item || typeof item !== "object") return item;
      const slide = { ...(item as Record<string, unknown>) };
      if (nextVoiceId) slide.ttsVoiceId = nextVoiceId;
      else delete slide.ttsVoiceId;
      if (Array.isArray(slide.dialogueSegments)) {
        slide.dialogueSegments = updateRawDialogueSegmentVoices(slide.dialogueSegments, (segment) =>
          normalizeSpeakerId(segment.type) === "quote" ? normalizeVoiceId(segment.voice) : nextVoiceId
        );
      }
      return slide;
    });
  }

  return nextSource;
}

export function applyQuoteVoiceSelectionToScriptJson(source: Record<string, unknown>, nextVoiceId: string): Record<string, unknown> {
  if (!isDialogueMode(source)) return source;
  const nextSource = { ...source };
  if (nextVoiceId) nextSource.quoteVoice = nextVoiceId;
  else delete nextSource.quoteVoice;
  return nextSource;
}

function collectExplicitVoiceIdsFromPreparedSlides(slides: PreparedSlide[]): string[] {
  const collected: string[] = [];
  for (const slide of slides) {
    const slideVoiceId = normalizeVoiceId(slide.ttsVoiceId);
    if (slideVoiceId) collected.push(slideVoiceId);
    if (!Array.isArray(slide.dialogueSegments)) continue;
    for (const segment of slide.dialogueSegments) {
      const segmentVoiceId = normalizeVoiceId(segment?.voice);
      if (segmentVoiceId) collected.push(segmentVoiceId);
    }
  }
  return collected;
}

function collectExplicitVoiceIdsFromScriptJson(source: Record<string, unknown>): string[] {
  const collected: string[] = [];
  const topLevelVoiceIds = [source.ttsVoiceId, source.narrationVoice, source.quoteVoice];
  for (const value of topLevelVoiceIds) {
    const voiceId = normalizeVoiceId(value);
    if (voiceId) collected.push(voiceId);
  }
  if (source.speakerVoices && typeof source.speakerVoices === "object" && !Array.isArray(source.speakerVoices)) {
    for (const value of Object.values(source.speakerVoices as Record<string, unknown>)) {
      const voiceId = normalizeVoiceId(value);
      if (voiceId) collected.push(voiceId);
    }
  }
  if (!Array.isArray(source.slides)) return collected;
  for (const item of source.slides) {
    if (!item || typeof item !== "object") continue;
    const slide = item as Record<string, unknown>;
    const slideVoiceId = normalizeVoiceId(slide.ttsVoiceId);
    if (slideVoiceId) collected.push(slideVoiceId);
    if (!Array.isArray(slide.dialogueSegments)) continue;
    for (const segment of slide.dialogueSegments) {
      if (!segment || typeof segment !== "object") continue;
      const voiceId = normalizeVoiceId((segment as Record<string, unknown>).voice);
      if (voiceId) collected.push(voiceId);
    }
  }
  return collected;
}

export function normalizeDefaultVoiceSelectionForRender(input: {
  selectedVoiceId: string;
  source: Record<string, unknown>;
  slides: PreparedSlide[];
}): {
  source: Record<string, unknown>;
  slides: PreparedSlide[];
  clearedExplicitVoiceId?: string;
} {
  const selectedVoiceId = String(input.selectedVoiceId || "").trim();
  if (selectedVoiceId) {
    return {
      source: input.source,
      slides: input.slides,
    };
  }

  const explicitVoiceIds = Array.from(
    new Set([
      ...collectExplicitVoiceIdsFromScriptJson(input.source),
      ...collectExplicitVoiceIdsFromPreparedSlides(input.slides),
    ].filter(Boolean))
  );

  if (explicitVoiceIds.length !== 1) {
    return {
      source: input.source,
      slides: input.slides,
    };
  }

  return {
    source: applyVoiceSelectionToScriptJson(input.source, ""),
    slides: applyVoiceSelectionToSlides(input.slides, ""),
    clearedExplicitVoiceId: explicitVoiceIds[0],
  };
}

function collectSpeakerIdsFromPreparedSlides(slides: PreparedSlide[]): string[] {
  const ids = new Set<string>();
  for (const slide of slides) {
    if (!Array.isArray(slide.dialogueSegments)) continue;
    for (const segment of slide.dialogueSegments) {
      const speakerId = normalizeSpeakerId(segment?.speakerId);
      if (speakerId) ids.add(speakerId);
    }
  }
  return Array.from(ids);
}

function collectSpeakerIdsFromScriptJson(source: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  if (source.speakerVoices && typeof source.speakerVoices === "object" && !Array.isArray(source.speakerVoices)) {
    for (const speakerId of Object.keys(source.speakerVoices as Record<string, unknown>)) {
      const normalized = normalizeSpeakerId(speakerId);
      if (normalized) ids.add(normalized);
    }
  }
  if (!Array.isArray(source.slides)) return Array.from(ids);
  for (const item of source.slides) {
    if (!item || typeof item !== "object") continue;
    const slide = item as Record<string, unknown>;
    if (!Array.isArray(slide.dialogueSegments)) continue;
    for (const segment of slide.dialogueSegments) {
      if (!segment || typeof segment !== "object") continue;
      const speakerId = normalizeSpeakerId((segment as Record<string, unknown>).speakerId);
      if (speakerId) ids.add(speakerId);
    }
  }
  return Array.from(ids);
}

function inferSpeakerVoiceClass(speakerId: string): "male" | "female" | "unknown" {
  const normalized = normalizeSpeakerId(speakerId);
  if (!normalized) return "unknown";
  if (/(^|[_-])(male|man|boy|guy|dad|father|husband|son|bro|남|남자|남성)([_-]|$)/u.test(normalized)) {
    return "male";
  }
  if (/(^|[_-])(female|woman|girl|mom|mother|wife|daughter|sis|여|여자|여성)([_-]|$)/u.test(normalized)) {
    return "female";
  }
  return "unknown";
}

function resolveQuoteVoiceId(selection: DialogueVoiceSelection): string {
  return (
    normalizeVoiceId(selection.quoteVoiceId) ||
    normalizeVoiceId(selection.maleVoiceId) ||
    normalizeVoiceId(selection.femaleVoiceId) ||
    normalizeVoiceId(selection.narrationVoiceId)
  );
}

function toManualSpeakerVoiceMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [rawSpeakerId, rawVoiceId] of Object.entries(value as Record<string, unknown>)) {
    const speakerId = normalizeSpeakerId(rawSpeakerId);
    const voiceId = normalizeVoiceId(rawVoiceId);
    if (!speakerId || !voiceId) continue;
    next[speakerId] = voiceId;
  }
  return next;
}

function resolveSpeakerVoiceId(
  speakerId: string,
  manualSpeakerVoices: Record<string, string>,
  selection: DialogueVoiceSelection
): string {
  const normalizedSpeakerId = normalizeSpeakerId(speakerId);
  if (!normalizedSpeakerId) return resolveQuoteVoiceId(selection);
  const manualVoiceId = normalizeVoiceId(manualSpeakerVoices[normalizedSpeakerId]);
  if (manualVoiceId) return manualVoiceId;
  const voiceClass = inferSpeakerVoiceClass(normalizedSpeakerId);
  if (voiceClass === "male") {
    return normalizeVoiceId(selection.maleVoiceId) || resolveQuoteVoiceId(selection);
  }
  if (voiceClass === "female") {
    return normalizeVoiceId(selection.femaleVoiceId) || resolveQuoteVoiceId(selection);
  }
  return resolveQuoteVoiceId(selection);
}

function applyDialogueVoiceSelectionToSlides(
  slides: PreparedSlide[],
  manualSpeakerVoices: Record<string, string>,
  selection: DialogueVoiceSelection
): PreparedSlide[] {
  const narrationVoiceId = normalizeVoiceId(selection.narrationVoiceId);
  return slides.map((slide) => {
    const currentSlideVoiceId = normalizeVoiceId(slide.ttsVoiceId);
    const nextDialogueSegments = updatePreparedDialogueSegmentVoices(slide.dialogueSegments, (segment) =>
      segment.type === "quote"
        ? resolveSpeakerVoiceId(normalizeSpeakerId(segment.speakerId), manualSpeakerVoices, selection)
        : narrationVoiceId
    );
    if (currentSlideVoiceId === narrationVoiceId && nextDialogueSegments === slide.dialogueSegments) return slide;
    return {
      ...slide,
      ttsVoiceId: narrationVoiceId || undefined,
      dialogueSegments: nextDialogueSegments,
    };
  });
}

export function resolveDialogueVoiceSelectionForRender(input: {
  selectedVoiceId: string;
  selectedQuoteVoiceId: string;
  selectedMaleVoiceId: string;
  selectedFemaleVoiceId: string;
  source: Record<string, unknown>;
  slides: PreparedSlide[];
}): {
  source: Record<string, unknown>;
  slides: PreparedSlide[];
  clearedExplicitVoiceId?: string;
} {
  const normalized = normalizeDefaultVoiceSelectionForRender({
    selectedVoiceId: input.selectedVoiceId,
    source: input.source,
    slides: input.slides,
  });

  const discoveredSpeakerIds = Array.from(
    new Set([
      ...collectSpeakerIdsFromScriptJson(normalized.source),
      ...collectSpeakerIdsFromPreparedSlides(normalized.slides),
    ])
  );
  const hasDialogueRouting = isDialogueMode(normalized.source) || discoveredSpeakerIds.length > 0;
  if (!hasDialogueRouting) {
    return normalized;
  }

  const selection: DialogueVoiceSelection = {
    narrationVoiceId:
      normalizeVoiceId(input.selectedVoiceId) ||
      normalizeVoiceId(normalized.source.narrationVoice) ||
      normalizeVoiceId(normalized.source.ttsVoiceId),
    quoteVoiceId: normalizeVoiceId(input.selectedQuoteVoiceId) || normalizeVoiceId(normalized.source.quoteVoice),
    maleVoiceId: normalizeVoiceId(input.selectedMaleVoiceId),
    femaleVoiceId: normalizeVoiceId(input.selectedFemaleVoiceId),
  };
  const manualSpeakerVoices = toManualSpeakerVoiceMap(normalized.source.speakerVoices);
  const resolvedSpeakerVoices: Record<string, string> = {};
  for (const speakerId of discoveredSpeakerIds) {
    const voiceId = resolveSpeakerVoiceId(speakerId, manualSpeakerVoices, selection);
    if (voiceId) resolvedSpeakerVoices[speakerId] = voiceId;
  }

  const nextSource = { ...normalized.source };
  const narrationVoiceId = normalizeVoiceId(selection.narrationVoiceId);
  const quoteVoiceId = resolveQuoteVoiceId(selection);

  if (narrationVoiceId) {
    nextSource.ttsVoiceId = narrationVoiceId;
    nextSource.narrationVoice = narrationVoiceId;
  } else {
    delete nextSource.ttsVoiceId;
    delete nextSource.narrationVoice;
  }
  if (quoteVoiceId) {
    nextSource.quoteVoice = quoteVoiceId;
  } else {
    delete nextSource.quoteVoice;
  }
  if (Object.keys(resolvedSpeakerVoices).length > 0) {
    nextSource.speakerVoices = resolvedSpeakerVoices;
  } else {
    delete nextSource.speakerVoices;
  }

  const nextSlides = applyDialogueVoiceSelectionToSlides(normalized.slides, resolvedSpeakerVoices, selection);
  return {
    source: nextSource,
    slides: nextSlides,
    clearedExplicitVoiceId: normalized.clearedExplicitVoiceId,
  };
}

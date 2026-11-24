"use client";

import type { PreparedSlide } from "@/types/studio-json";

type RenderReuseRouting = {
  mode?: string;
  narrationVoice?: string;
  quoteVoice?: string;
  speakerVoices?: unknown;
};

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeImageRequest(value: PreparedSlide["imageRequest"]) {
  if (!value) return null;
  return {
    query: String(value.query || "").trim(),
    queryCandidates: normalizeStringList(value.queryCandidates),
    people: normalizeStringList(value.people),
    scene: String(value.scene || "").trim(),
    orientation: String(value.orientation || "").trim(),
    mustAvoid: normalizeStringList(value.mustAvoid),
    plannerSource: String(value.plannerSource || "").trim(),
  };
}

function normalizeImageBeats(slide: PreparedSlide) {
  if (!Array.isArray(slide.imageBeats)) return [];
  return slide.imageBeats.map((beat) => ({
    beatId: String(beat.beatId || "").trim(),
    startLineIndex: Number.isFinite(beat.startLineIndex) ? Number(beat.startLineIndex) : 0,
    clearVisual: beat.clearVisual === true,
    imageUrl: String(beat.imageUrl || "").trim(),
    resolvedImageUrl: String(beat.resolvedImageUrl || "").trim(),
    resolvedBy: String(beat.resolvedBy || "").trim(),
    mediaUrl: String(beat.mediaUrl || "").trim(),
    mediaKind: String(beat.mediaKind || "").trim(),
    imageSelection: beat.imageSelection
      ? {
          selectedCandidateId: String(beat.imageSelection.selectedCandidateId || "").trim(),
          selectionReason: String(beat.imageSelection.selectionReason || "").trim(),
        }
      : null,
    imageRequest: normalizeImageRequest(beat.imageRequest),
    reason: String(beat.reason || "").trim(),
  }));
}

function normalizeSpeakerVoices(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([speakerId, voiceId]) => ({
      speakerId: String(speakerId || "").trim(),
      voice: String(voiceId || "").trim(),
    }))
    .filter((entry) => entry.speakerId && entry.voice)
    .sort((left, right) => left.speakerId.localeCompare(right.speakerId));
}

export function buildStudioRenderReuseKey(
  slides: PreparedSlide[],
  selectedVoiceId: string,
  selectedTypecastEmotionType: string,
  selectedTypecastSpeed: string,
  routing?: RenderReuseRouting
): string {
  return JSON.stringify({
    voiceId: selectedVoiceId.trim() || "",
    typecastEmotionType: selectedTypecastEmotionType.trim() || "",
    typecastSpeed: selectedTypecastSpeed.trim() || "",
    mode: String(routing?.mode || "").trim().toLowerCase() === "dialogue" ? "dialogue" : "normal",
    narrationVoice: String(routing?.narrationVoice || "").trim(),
    quoteVoice: String(routing?.quoteVoice || "").trim(),
    speakerVoices: normalizeSpeakerVoices(routing?.speakerVoices),
    slides: slides.map((slide, index) => ({
      title: String(slide.title || "").trim(),
      text: String(slide.text || "").trim(),
      narrationText: String(slide.narrationText || "").trim(),
      ttsVoiceId: String(slide.ttsVoiceId || "").trim(),
      dialogueSegments: Array.isArray(slide.dialogueSegments)
        ? slide.dialogueSegments
            .map((segment) => ({
              type: String(segment.type || "").trim().toLowerCase() === "quote" ? "quote" : "narration",
              text: String(segment.text || "").trim(),
              speakerId: String(segment.speakerId || "").trim(),
              voice: String(segment.voice || "").trim(),
              speed: Number.isFinite(segment.speed) ? Number(segment.speed) : null,
              pauseAfterMs: Number.isFinite(segment.pauseAfterMs) ? Number(segment.pauseAfterMs) : null,
            }))
            .filter((segment) => segment.text)
        : [],
      lines: normalizeStringList(slide.lines),
      captionCues: Array.isArray(slide.captionCues)
        ? slide.captionCues.map((cue) => ({
            text: String(cue.text || "").trim(),
            overrides: cue.overrides || {},
          }))
        : [],
      layout: String(slide.layout || "").trim(),
      imageUrl: String(slide.imageUrl || "").trim(),
      mediaUrl: String(slide.mediaUrl || "").trim(),
      mediaKind: String(slide.mediaKind || "").trim(),
      imageRequest: normalizeImageRequest(slide.imageRequest),
      imageBeats: normalizeImageBeats(slide),
      imageVariantId: String(slide.imageVariantId || "").trim(),
      imageVariantStartLineIndex: Number.isFinite(slide.imageVariantStartLineIndex)
        ? Number(slide.imageVariantStartLineIndex)
        : null,
      groupId: Number.isFinite(slide.groupId) ? Number(slide.groupId) : index,
      stepIndex: Number.isFinite(slide.stepIndex) ? Number(slide.stepIndex) : 0,
      sfxPlan: Array.isArray(slide.sfxPlan)
        ? slide.sfxPlan.map((item) => ({
            lineIndex: Number.isFinite(item.lineIndex) ? Number(item.lineIndex) : 0,
            enabled: item.enabled !== false,
            tag: String(item.tag || "").trim(),
            gainDb: Number.isFinite(item.gainDb) ? Number(item.gainDb) : null,
            offsetMs: Number.isFinite(item.offsetMs) ? Number(item.offsetMs) : null,
            source: item.source || null,
          }))
        : [],
      sfxCue: slide.sfxCue
        ? {
            enabled: slide.sfxCue.enabled !== false,
            tag: String(slide.sfxCue.tag || "").trim(),
            gainDb: Number.isFinite(slide.sfxCue.gainDb) ? Number(slide.sfxCue.gainDb) : null,
            offsetMs: Number.isFinite(slide.sfxCue.offsetMs) ? Number(slide.sfxCue.offsetMs) : null,
            source: slide.sfxCue.source || null,
          }
        : null,
    })),
  });
}

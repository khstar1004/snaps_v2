"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { requestStudioManualImageGenerate, uploadStudioMediaAsset } from "@/lib/api/studio-client";
import type { PublishCategory } from "@/lib/publish/types";
import { applyStudioImageCandidateToSlides, selectVisibleStudioImageCandidates } from "@/lib/studio/image-candidate-approval";
import { inferMediaKindFromUrl, normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { applyStudioCaptionAutoMetadata, parseStudioCaptionCueLine } from "@/types/studio-caption";
import { getStudioTemplateFeatureToggles } from "@/types/studio-feature-document";
import type {
  ImageSource,
  ImageSelectionCandidate,
  ImageSelection,
  PreparedSlide,
  SfxTag,
  SlideMediaKind,
  SlideSfxCue,
  SlideSfxPlanItem,
  StoryCharacterProfile,
} from "@/types/studio-json";
import { getPreparedSlideSourceIndex } from "./studio-prepared-slide-indexing";
import { hasRenderableMedia } from "./studio-render-preflight";
import { shouldPreserveSlideMediaAfterTextChange } from "./studio-media-preservation";
import { normalizeStudioTemplateId, type StudioTemplatePayload } from "./types";

export { shouldPreserveSlideMediaAfterTextChange } from "./studio-media-preservation";

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
};

type ManualImageGenerateRequest = Parameters<typeof requestStudioManualImageGenerate>[0];

type GroupFrame = {
  slide: PreparedSlide;
  index: number;
  stepIndex: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeLine(value: unknown): string {
  return String(value || "").trim();
}

function setDialogueSegmentVoices(segments: PreparedSlide["dialogueSegments"], nextVoiceId?: string): PreparedSlide["dialogueSegments"] {
  if (!Array.isArray(segments)) return segments;
  let changed = false;
  const nextSegments = segments.map((segment) => {
    if (!segment || typeof segment !== "object") return segment;
    const currentVoiceId = normalizeLine(segment.voice);
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

function preserveTextareaLine(value: unknown): string {
  return String(value ?? "").replace(/\r/g, "");
}

function readCharacterProfilesFromJsonText(jsonText: string): StoryCharacterProfile[] | undefined {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.characterProfiles)) return undefined;
    return parsed.characterProfiles as StoryCharacterProfile[];
  } catch {
    return undefined;
  }
}

function normalizeCharacterProfilesIdentity(characterProfiles: StoryCharacterProfile[] | undefined): string {
  if (!Array.isArray(characterProfiles)) return "[]";
  return JSON.stringify(
    characterProfiles.map((profile) => ({
      characterId: normalizeLine(profile?.characterId),
      displayName: normalizeLine(profile?.displayName),
      identityPrompt: normalizeLine(profile?.identityPrompt),
      anchorImageUrl: normalizeLine(profile?.anchorImageUrl),
      anchorAssetId: normalizeLine(profile?.anchorAssetId),
    }))
  );
}

export function applyGeneratedCharacterProfilesToJsonText(params: {
  requestJsonText: string;
  currentJsonText: string;
  characterProfiles?: StoryCharacterProfile[];
}): string {
  if (!Array.isArray(params.characterProfiles) || params.characterProfiles.length <= 0) return params.currentJsonText;
  try {
    const requestParsed = JSON.parse(params.requestJsonText) as Record<string, unknown>;
    const currentParsed = JSON.parse(params.currentJsonText) as Record<string, unknown>;
    if (!requestParsed || typeof requestParsed !== "object" || Array.isArray(requestParsed)) return params.currentJsonText;
    if (!currentParsed || typeof currentParsed !== "object" || Array.isArray(currentParsed)) return params.currentJsonText;
    const requestProfiles = Array.isArray(requestParsed.characterProfiles)
      ? (requestParsed.characterProfiles as StoryCharacterProfile[])
      : undefined;
    const currentProfiles = Array.isArray(currentParsed.characterProfiles)
      ? (currentParsed.characterProfiles as StoryCharacterProfile[])
      : undefined;
    if (normalizeCharacterProfilesIdentity(requestProfiles) !== normalizeCharacterProfilesIdentity(currentProfiles)) {
      return params.currentJsonText;
    }
    return JSON.stringify({ ...currentParsed, characterProfiles: params.characterProfiles }, null, 2);
  } catch {
    return params.currentJsonText;
  }
}

export function buildStudioManualImageGenerateRequest(input: {
  publishCategory: PublishCategory;
  imageSource: "auto-ai-generate";
  slides: PreparedSlide[];
  mode: "selected" | "missing" | "all";
  codexModel?: string;
  imageStylePrompt?: string;
  fixedCharacterProfileId?: string;
  jsonText: string;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  slideIndexes?: number[];
}): ManualImageGenerateRequest {
  const fixedCharacterProfileId = String(input.fixedCharacterProfileId || "").trim();
  const imageState = fixedCharacterProfileId
    ? { fixedCharacterProfileId }
    : {
        imageStylePrompt: input.imageStylePrompt,
        characterProfiles: readCharacterProfilesFromJsonText(input.jsonText),
      };
  return {
    publishCategory: input.publishCategory,
    imageSource: "auto-ai-generate",
    slides: input.slides,
    slideIndexes: input.slideIndexes,
    mode: input.mode,
    codexModel: input.codexModel,
    ...imageState,
    projectProfileSnapshot: input.projectProfileSnapshot,
  };
}

type SlideAssetApplyInput = {
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  assetId?: string;
  title?: string;
  selectionReason?: string;
};

function hasSlideMedia(slide: PreparedSlide | undefined): boolean {
  return Boolean(slide && hasRenderableMedia(slide));
}

export function shouldAcceptGeneratedImageApply(params: {
  currentSlide: PreparedSlide | undefined;
  generatedSlide: PreparedSlide | undefined;
}): boolean {
  if (!params.currentSlide || !params.generatedSlide) return false;
  if (normalizeLine(params.currentSlide.imageSelection?.selectedCandidateId)) return false;
  if (hasSlideMedia(params.currentSlide)) return false;
  return Boolean(
    normalizeLine(params.generatedSlide.imageUrl) &&
      normalizeLine(params.generatedSlide.imageSelection?.selectedCandidateId)
  );
}

function mergeImageSelectionCandidateReviewState(
  currentSelection: ImageSelection | undefined,
  generatedSelection: ImageSelection | undefined,
  acceptGeneratedSelection = false
): ImageSelection | undefined {
  if (!generatedSelection) return currentSelection;
  const approvedCandidateId = acceptGeneratedSelection
    ? normalizeLine(generatedSelection.selectedCandidateId)
    : normalizeLine(currentSelection?.selectedCandidateId);
  const candidateOptions = selectVisibleStudioImageCandidates(
    [...(generatedSelection.candidateOptions || []), ...(currentSelection?.candidateOptions || [])],
    approvedCandidateId || undefined
  );
  if (acceptGeneratedSelection) {
    return {
      ...generatedSelection,
      candidateOptions: candidateOptions.length > 0 ? candidateOptions : undefined,
      selectedCandidateId: approvedCandidateId || undefined,
    };
  }
  return {
    ...generatedSelection,
    selectedQuery: approvedCandidateId ? currentSelection?.selectedQuery || generatedSelection.selectedQuery : generatedSelection.selectedQuery,
    provider: approvedCandidateId ? currentSelection?.provider : undefined,
    providerCandidates: approvedCandidateId ? currentSelection?.providerCandidates || generatedSelection.providerCandidates : generatedSelection.providerCandidates,
    candidateOptions: candidateOptions.length > 0 ? candidateOptions : undefined,
    selectedCandidateId: approvedCandidateId || undefined,
    selectionReason: approvedCandidateId ? currentSelection?.selectionReason : undefined,
    scoreBreakdown: approvedCandidateId ? currentSelection?.scoreBreakdown || generatedSelection.scoreBreakdown : generatedSelection.scoreBreakdown,
  };
}

function toSlideStructuralIdentity(slide: PreparedSlide | undefined): string {
  if (!slide) return "";
  return JSON.stringify({
    title: normalizeLine(slide.title),
    groupId: isFiniteNumber(slide.groupId) ? Number(slide.groupId) : null,
    stepIndex: isFiniteNumber(slide.stepIndex) ? Number(slide.stepIndex) : null,
    imageVariantId: normalizeLine(slide.imageVariantId),
    imageVariantStartLineIndex: isFiniteNumber(slide.imageVariantStartLineIndex) ? Number(slide.imageVariantStartLineIndex) : null,
  });
}

function toSlideRequestResponseIdentity(slide: PreparedSlide | undefined): string {
  if (!slide) return "";
  return JSON.stringify({
    structural: toSlideStructuralIdentity(slide),
    title: normalizeLine(slide.title),
    text: normalizeLine(slide.text),
    lines: Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeLine(line)) : [],
    narrationText: normalizeLine(slide.narrationText),
  });
}

function toPromptAffectingSlideInputIdentity(slide: PreparedSlide | undefined): string {
  if (!slide) return "";
  return JSON.stringify({
    structural: toSlideStructuralIdentity(slide),
    title: normalizeLine(slide.title),
    text: normalizeLine(slide.text),
    lines: Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeLine(line)) : [],
    narrationText: normalizeLine(slide.narrationText),
    characterIds: Array.isArray(slide.characterIds) ? slide.characterIds.map((id) => normalizeLine(id)).filter(Boolean) : [],
    quoteDialogueContext: Array.isArray(slide.dialogueSegments)
      ? slide.dialogueSegments
          .filter((segment) => segment?.type === "quote")
          .map((segment) => ({
            speakerId: normalizeLine(segment.speakerId),
            text: normalizeLine(segment.text),
          }))
      : [],
    imageRequest: slide.imageRequest
      ? {
          query: normalizeLine(slide.imageRequest.query),
          queryCandidates: Array.isArray(slide.imageRequest.queryCandidates)
            ? slide.imageRequest.queryCandidates.map((query) => normalizeLine(query)).filter(Boolean)
            : [],
          people: Array.isArray(slide.imageRequest.people) ? slide.imageRequest.people.map((person) => normalizeLine(person)).filter(Boolean) : [],
          scene: normalizeLine(slide.imageRequest.scene),
          orientation: slide.imageRequest.orientation || "",
          mustAvoid: Array.isArray(slide.imageRequest.mustAvoid) ? slide.imageRequest.mustAvoid.map((item) => normalizeLine(item)).filter(Boolean) : [],
          plannerSource: slide.imageRequest.plannerSource || "",
        }
      : null,
    manualImagePrompt: slide.manualImagePrompt
      ? {
          finalPrompt: normalizeLine(slide.manualImagePrompt.finalPrompt),
          basePrompt: normalizeLine(slide.manualImagePrompt.basePrompt),
          scenePrompt: normalizeLine(slide.manualImagePrompt.scenePrompt),
          characterIds: Array.isArray(slide.manualImagePrompt.characterIds)
            ? slide.manualImagePrompt.characterIds.map((id) => normalizeLine(id)).filter(Boolean)
            : [],
          characterSummary: normalizeLine(slide.manualImagePrompt.characterSummary),
          anchorImageUrl: normalizeLine(slide.manualImagePrompt.anchorImageUrl),
          anchorAssetId: normalizeLine(slide.manualImagePrompt.anchorAssetId),
        }
      : null,
  });
}

function canMergeManualImageGenerateResponseSlide(params: {
  requestSlide: PreparedSlide | undefined;
  currentSlide: PreparedSlide | undefined;
  generatedSlide: PreparedSlide | undefined;
}): boolean {
  if (!params.requestSlide || !params.currentSlide || !params.generatedSlide) return false;
  if (toSlideRequestResponseIdentity(params.requestSlide) !== toSlideRequestResponseIdentity(params.generatedSlide)) return false;
  return toPromptAffectingSlideInputIdentity(params.requestSlide) === toPromptAffectingSlideInputIdentity(params.currentSlide);
}

export function mergeManualImageGenerateCandidateSlides(params: {
  requestSlides: PreparedSlide[];
  currentSlides: PreparedSlide[];
  generatedSlides: PreparedSlide[];
}): PreparedSlide[] {
  if (params.currentSlides.length !== params.requestSlides.length) return params.currentSlides;
  return params.currentSlides.map((currentSlide, index) => {
    const requestSlide = params.requestSlides[index];
    const generatedSlide = params.generatedSlides[index];
    if (
      !canMergeManualImageGenerateResponseSlide({
        requestSlide,
        currentSlide,
        generatedSlide,
      })
    ) {
      return currentSlide;
    }
    const acceptGeneratedApply = shouldAcceptGeneratedImageApply({ currentSlide, generatedSlide });
    const mergedSlide = {
      ...currentSlide,
      manualImagePrompt: generatedSlide.manualImagePrompt,
      imageSelection: mergeImageSelectionCandidateReviewState(
        currentSlide.imageSelection,
        generatedSlide.imageSelection,
        acceptGeneratedApply
      ),
    };
    if (!acceptGeneratedApply || !generatedSlide) return mergedSlide;
    return {
      ...mergedSlide,
      imageUrl: generatedSlide.imageUrl,
      mediaUrl: generatedSlide.mediaUrl,
      mediaKind: generatedSlide.mediaKind,
      resolvedImageUrl: generatedSlide.resolvedImageUrl,
      resolvedBy: generatedSlide.resolvedBy,
    };
  });
}

export function applySlideAssetToSlides(params: {
  slides: PreparedSlide[];
  index: number;
  getLinkedSlideIndexes: (slides: PreparedSlide[], index: number) => Set<number>;
  asset: SlideAssetApplyInput;
}): PreparedSlide[] {
  if (!params.slides[params.index]) return params.slides;
  const normalizedMedia = normalizeStudioMediaUrls({
    imageUrl: params.asset.imageUrl,
    mediaUrl: params.asset.mediaUrl,
    mediaKind: params.asset.mediaKind,
  });
  const nextImageUrl = String(normalizedMedia.imageUrl || "").trim();
  if (!nextImageUrl) return params.slides;
  const linkedIndexes = params.getLinkedSlideIndexes(params.slides, params.index);
  const candidateId = params.asset.assetId || `library:${Date.now()}`;
  const selectionReason =
    params.asset.selectionReason ||
    (params.asset.title ? `manual library asset: ${params.asset.title}` : "manual library asset");

  return params.slides.map((slide, i) =>
    linkedIndexes.has(i)
      ? {
          ...slide,
          imageUrl: nextImageUrl,
          mediaUrl: normalizedMedia.mediaUrl,
          mediaKind: normalizedMedia.mediaKind,
          resolvedImageUrl: nextImageUrl,
          resolvedBy: "direct" as const,
          imageSelection: {
            intent: "library",
            queryCandidates: slide.imageSelection?.queryCandidates || [slide.imageRequest?.query || ""].filter(Boolean),
            selectedQuery: slide.imageSelection?.selectedQuery || slide.imageRequest?.query || undefined,
            provider: "library",
            providerCandidates: ["library"],
            candidateOptions: slide.imageSelection?.candidateOptions,
            selectedCandidateId: candidateId,
            selectionReason,
            scoreBreakdown: slide.imageSelection?.scoreBreakdown,
          },
        }
      : slide
  );
}

export function applySlideSfxCueChangeToSlides(
  slides: PreparedSlide[],
  index: number,
  cue: SlideSfxCue | null
): PreparedSlide[] {
  const target = slides[index];
  if (!target) return slides;
  const stepIndex = isFiniteNumber(target.stepIndex) ? Math.max(0, Math.floor(Number(target.stepIndex))) : 0;
  const matchedPlanCue = (target.sfxPlan || []).find((item) => Number(item.lineIndex) === stepIndex);
  const existingTag = normalizeLine(target.sfxCue?.tag) || normalizeLine(matchedPlanCue?.tag);
  const nextCue: SlideSfxCue | undefined = cue
    ? {
        enabled: cue.enabled !== false,
        tag: cue.tag,
        gainDb: cue.gainDb,
        offsetMs: cue.offsetMs,
        source: cue.source || "manual",
      }
    : existingTag
      ? {
          enabled: false,
          tag: existingTag,
          gainDb: target.sfxCue?.gainDb ?? matchedPlanCue?.gainDb,
          offsetMs: target.sfxCue?.offsetMs ?? matchedPlanCue?.offsetMs,
          source: "manual",
        }
      : undefined;

  return slides.map((slide, slideIndex) => (slideIndex === index ? { ...slide, sfxCue: nextCue } : slide));
}

function normalizeTextareaLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => normalizeLine(preserveTextareaLine(line)))
    .filter(Boolean);
}

function joinLines(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function rebuildDialogueSegmentsForEditedLines(
  dialogueSegments: PreparedSlide["dialogueSegments"],
  lines: string[]
): PreparedSlide["dialogueSegments"] {
  const nextLines = lines.map((line) => normalizeLine(preserveTextareaLine(line))).filter(Boolean);
  const existing = Array.isArray(dialogueSegments)
    ? dialogueSegments.filter((segment) => Boolean(segment && normalizeLine(segment.text)))
    : [];
  if (existing.length <= 0 || nextLines.length <= 0) return undefined;
  if (existing.length === nextLines.length) {
    return existing.map((segment, index) => ({ ...segment, text: nextLines[index] }));
  }
  const metadataKeys = new Set(
    existing.map((segment) => toDialogueRoutingKey(segment))
  );
  if (metadataKeys.size === 1) {
    return [{ ...existing[0], text: joinLines(nextLines) }];
  }
  return nextLines.map((text) => ({ type: "narration" as const, text }));
}

function toDialogueRoutingKey(segment: NonNullable<PreparedSlide["dialogueSegments"]>[number]): string {
  const speed = Number.isFinite(segment.speed) ? Number(segment.speed) : "default";
  const pauseAfterMs = Number.isFinite(segment.pauseAfterMs) ? Number(segment.pauseAfterMs) : 0;
  return `${segment.type}|${normalizeLine(segment.speakerId || "")}|${normalizeLine(segment.voice || "")}|${speed}|${pauseAfterMs}`;
}

function getStandaloneLines(slide: PreparedSlide): string[] {
  const lines =
    Array.isArray(slide.lines) && slide.lines.length > 0
      ? slide.lines.map((line) => normalizeLine(line)).filter(Boolean)
      : [];
  if (lines.length > 0) return lines;
  const cueLines =
    Array.isArray(slide.captionCues) && slide.captionCues.length > 0
      ? slide.captionCues.map((cue) => normalizeLine(cue.text)).filter(Boolean)
      : [];
  if (cueLines.length > 0) return cueLines;
  const text = normalizeLine(slide.text);
  return text ? [text] : [];
}

function buildCaptionCuesFromLines(lines: string[], autoGenerateMetadata: boolean) {
  const parsed = lines.map((line) => parseStudioCaptionCueLine(line));
  return autoGenerateMetadata ? applyStudioCaptionAutoMetadata(parsed) : parsed;
}

function getFrameText(slide: PreparedSlide, stepIndex: number): string {
  const text = normalizeLine(slide.text);
  if (text) return text;
  if (Array.isArray(slide.captionCues) && slide.captionCues.length > 0) {
    const cueAtStep = normalizeLine(slide.captionCues[Math.max(0, Math.min(slide.captionCues.length - 1, stepIndex))]?.text);
    if (cueAtStep) return cueAtStep;
    const lastCue = normalizeLine(slide.captionCues[slide.captionCues.length - 1]?.text);
    if (lastCue) return lastCue;
  }
  if (Array.isArray(slide.lines) && slide.lines.length > 0) {
    const lineAtStep = normalizeLine(slide.lines[Math.max(0, Math.min(slide.lines.length - 1, stepIndex))]);
    if (lineAtStep) return lineAtStep;
    const lastLine = normalizeLine(slide.lines[slide.lines.length - 1]);
    if (lastLine) return lastLine;
  }
  return "";
}

function splitTextValue(text: string): [string, string] | null {
  const normalized = normalizeLine(text);
  if (!normalized) return null;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const pivot = Math.ceil(words.length / 2);
    const left = words.slice(0, pivot).join(" ").trim();
    const right = words.slice(pivot).join(" ").trim();
    if (left && right) return [left, right];
  }

  if (normalized.length < 2) return null;
  const pivot = Math.ceil(normalized.length / 2);
  const left = normalized.slice(0, pivot).trim();
  const right = normalized.slice(pivot).trim();
  return left && right ? [left, right] : null;
}

function splitStandaloneSlide(slide: PreparedSlide): { leftLines: string[]; rightLines: string[] } | null {
  const lines = getStandaloneLines(slide);
  if (lines.length >= 2) {
    const pivot = Math.ceil(lines.length / 2);
    const leftLines = lines.slice(0, pivot);
    const rightLines = lines.slice(pivot);
    return leftLines.length > 0 && rightLines.length > 0 ? { leftLines, rightLines } : null;
  }

  const split = splitTextValue(lines[0] || normalizeLine(slide.text));
  if (!split) return null;
  return {
    leftLines: [split[0]],
    rightLines: [split[1]],
  };
}

export function splitStandaloneDialogueSegments(
  slide: PreparedSlide,
  leftLines: string[],
  rightLines: string[]
): { left: PreparedSlide["dialogueSegments"]; right: PreparedSlide["dialogueSegments"] } {
  const originalLines = getStandaloneLines(slide);
  const alignedSegments = rebuildDialogueSegmentsForEditedLines(slide.dialogueSegments, originalLines) || [];
  const canSliceByLine = originalLines.length > 1 && alignedSegments.length === originalLines.length;
  if (canSliceByLine) {
    const pivot = leftLines.length;
    return {
      left: alignedSegments.slice(0, pivot),
      right: alignedSegments.slice(pivot),
    };
  }
  if (alignedSegments.length === 1) {
    return {
      left: [{ ...alignedSegments[0], text: joinLines(leftLines) }],
      right: [{ ...alignedSegments[0], text: joinLines(rightLines) }],
    };
  }
  return { left: undefined, right: undefined };
}

export function mergeStandaloneDialogueSegments(
  leftSlide: PreparedSlide,
  rightSlide: PreparedSlide
): PreparedSlide["dialogueSegments"] {
  const resolveSegments = (slide: PreparedSlide): NonNullable<PreparedSlide["dialogueSegments"]> => {
    const existing = (slide.dialogueSegments || [])
      .filter((segment) => Boolean(segment && normalizeLine(segment.text)))
      .map((segment) => ({ ...segment, text: normalizeLine(segment.text) }));
    if (existing.length > 0) return existing;
    const text = joinLines(getStandaloneLines(slide));
    return text ? [{ type: "narration", text }] : [];
  };
  return [
    ...resolveSegments(leftSlide),
    ...resolveSegments(rightSlide),
  ];
}

export function resolvePreferredPreservedMediaSource(...slides: Array<PreparedSlide | null | undefined>): PreparedSlide | null {
  return slides.find((slide): slide is PreparedSlide => shouldPreserveSlideMediaAfterTextChange(slide)) || null;
}

export function resolvePreferredManualSfxCue(
  ...slides: Array<PreparedSlide | null | undefined>
): SlideSfxCue | undefined {
  for (const slide of slides) {
    const tag = normalizeLine(slide?.sfxCue?.tag);
    if (slide?.sfxCue?.source === "manual" && tag) return slide.sfxCue;
  }
  return undefined;
}

function buildStandaloneSlide(
  template: PreparedSlide,
  lines: string[],
  autoGenerateMetadata: boolean,
  overrides?: Partial<PreparedSlide>,
  mediaSource: PreparedSlide | null = template
): PreparedSlide {
  const normalizedLines = lines.map((line) => normalizeLine(preserveTextareaLine(line))).filter(Boolean);
  const fallbackText = normalizeLine(template.text) || "새 슬라이드";
  const nextLines = normalizedLines.length > 0 ? normalizedLines : [fallbackText];
  const captionCueLines = nextLines;
  const hasDialogueOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, "dialogueSegments"));
  const dialogueSegments = hasDialogueOverride
    ? overrides?.dialogueSegments
    : rebuildDialogueSegmentsForEditedLines(template.dialogueSegments, nextLines);
  const hasSfxCueOverride = Boolean(overrides && Object.prototype.hasOwnProperty.call(overrides, "sfxCue"));
  const preserveMedia = shouldPreserveSlideMediaAfterTextChange(mediaSource);
  return {
    ...template,
    ...overrides,
    text: joinLines(nextLines) || fallbackText,
    lines: nextLines,
    captionCues: buildCaptionCuesFromLines(captionCueLines, autoGenerateMetadata),
    narrationText: undefined,
    groupId: undefined,
    stepIndex: undefined,
    manualImagePrompt: undefined,
    dialogueSegments,
    imageUrl: preserveMedia ? mediaSource?.imageUrl : undefined,
    mediaUrl: preserveMedia ? mediaSource?.mediaUrl : undefined,
    mediaKind: preserveMedia ? mediaSource?.mediaKind : undefined,
    imageRequest: undefined,
    imageBeats: undefined,
    imageVariantId: undefined,
    imageVariantStartLineIndex: undefined,
    resolvedImageUrl: preserveMedia ? mediaSource?.resolvedImageUrl || mediaSource?.imageUrl : undefined,
    resolvedBy: preserveMedia ? mediaSource?.resolvedBy : undefined,
    imageSelection: preserveMedia ? mediaSource?.imageSelection : undefined,
    sfxPlan: undefined,
    sfxCue: hasSfxCueOverride ? overrides?.sfxCue : template.sfxCue?.source === "manual" ? template.sfxCue : undefined,
  };
}

export function buildAddedStandaloneSlide(
  template: PreparedSlide,
  placeholderText: string,
  autoGenerateCaptionMetadata: boolean
): PreparedSlide {
  return buildStandaloneSlide(
    template,
    [placeholderText],
    autoGenerateCaptionMetadata,
    {
      title: "새 슬라이드",
      dialogueSegments: [{ type: "narration", text: placeholderText }],
      sfxCue: undefined,
    },
    null
  );
}

function belongsToGroup(slide: PreparedSlide, groupId: number): boolean {
  return isFiniteNumber(slide.groupId) && Number(slide.groupId) === groupId;
}

function getGroupFrames(slides: PreparedSlide[], groupId: number): GroupFrame[] {
  return slides
    .map((slide, index) => ({
      slide,
      index,
      stepIndex: isFiniteNumber(slide.stepIndex) ? Number(slide.stepIndex) : 0,
    }))
    .filter(({ slide }) => belongsToGroup(slide, groupId))
    .sort((left, right) => left.stepIndex - right.stepIndex || left.index - right.index);
}

function getGroupLineTexts(groupFrames: GroupFrame[]): string[] {
  return groupFrames.map(({ slide }, stepIndex) => getFrameText(slide, stepIndex));
}

function replaceGroupedSlides(prev: PreparedSlide[], groupId: number, replacementFrames: PreparedSlide[]): PreparedSlide[] {
  let injected = false;
  const next: PreparedSlide[] = [];

  for (const slide of prev) {
    if (!belongsToGroup(slide, groupId)) {
      next.push(slide);
      continue;
    }

    if (!injected) {
      next.push(...replacementFrames);
      injected = true;
    }
  }

  return injected ? next : prev;
}

export function applySlideNarrationTextChangeToSlides(params: {
  slides: PreparedSlide[];
  index: number;
  value: string;
  autoGenerateCaptionMetadata: boolean;
}): PreparedSlide[] {
  const target = params.slides[params.index];
  if (!target) return params.slides;

  const nextLines = normalizeTextareaLines(params.value);
  if (nextLines.length <= 0) return params.slides;

  const targetGroupId = isFiniteNumber(target.groupId) ? Number(target.groupId) : null;
  if (targetGroupId === null) {
    return params.slides.map((slide, slideIndex) =>
      slideIndex === params.index ? buildStandaloneSlide(target, nextLines, params.autoGenerateCaptionMetadata) : slide,
    );
  }

  const groupFrames = getGroupFrames(params.slides, targetGroupId);
  if (groupFrames.length <= 0) return params.slides;

  const replacementFrames = buildGroupedSlides({
    groupId: targetGroupId,
    groupFrames,
    nextTexts: nextLines,
    resolveTemplate: (step) => groupFrames[step]?.slide || groupFrames[groupFrames.length - 1]?.slide || target,
    autoGenerateMetadata: params.autoGenerateCaptionMetadata,
  });
  return replaceGroupedSlides(params.slides, targetGroupId, replacementFrames);
}

export function normalizeSlideCharacterIds(value: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const characterId = normalizeLine(item);
    if (!characterId || seen.has(characterId)) continue;
    seen.add(characterId);
    normalized.push(characterId);
  }
  return normalized;
}

export function applySlideCharacterIdsToSlides(params: {
  slides: PreparedSlide[];
  index: number;
  characterIds: string[];
  getLinkedSlideIndexes: (slides: PreparedSlide[], index: number) => Set<number>;
}): PreparedSlide[] {
  if (!params.slides[params.index]) return params.slides;
  const linkedIndexes = params.getLinkedSlideIndexes(params.slides, params.index);
  const nextCharacterIds = normalizeSlideCharacterIds(params.characterIds);
  return params.slides.map((slide, slideIndex) => {
    if (!linkedIndexes.has(slideIndex)) return slide;
    if (nextCharacterIds.length <= 0) {
      const { characterIds: _characterIds, manualImagePrompt: _manualImagePrompt, ...rest } = slide;
      return rest;
    }
    return {
      ...slide,
      characterIds: nextCharacterIds,
      manualImagePrompt: undefined,
    };
  });
}

function getLinkedSourceSlideIndexes(params: {
  slides: PreparedSlide[];
  index: number;
  getLinkedSlideIndexes: (slides: PreparedSlide[], index: number) => Set<number>;
}): Set<number> {
  if (!params.slides[params.index]) return new Set<number>();
  const linkedPreparedIndexes = params.getLinkedSlideIndexes(params.slides, params.index);
  const sourceIndexes = new Set<number>();
  for (const preparedIndex of linkedPreparedIndexes) {
    const slide = params.slides[preparedIndex];
    if (!slide) continue;
    const sourceIndex = getPreparedSlideSourceIndex(params.slides, preparedIndex);
    if (sourceIndex !== null) sourceIndexes.add(sourceIndex);
  }
  return sourceIndexes;
}

export function applySlideCharacterIdsToJsonText(params: {
  jsonText: string;
  slides: PreparedSlide[];
  index: number;
  characterIds: string[];
  getLinkedSlideIndexes: (slides: PreparedSlide[], index: number) => Set<number>;
}): string {
  const nextCharacterIds = normalizeSlideCharacterIds(params.characterIds);
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.jsonText);
  } catch {
    return params.jsonText;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return params.jsonText;
  const source = parsed as Record<string, unknown>;
  if (!Array.isArray(source.slides)) return params.jsonText;

  const sourceOrdinals = getLinkedSourceSlideIndexes({
    slides: params.slides,
    index: params.index,
    getLinkedSlideIndexes: params.getLinkedSlideIndexes,
  });
  const sourceObjectIndexes = source.slides
    .map((rawSlide, sourceIndex) => {
      if (!rawSlide || typeof rawSlide !== "object" || Array.isArray(rawSlide)) return -1;
      const row = rawSlide as Record<string, unknown>;
      const hasText = normalizeLine(row.text).length > 0;
      const hasLines = Array.isArray(row.lines) && row.lines.some((line) => normalizeLine(line).length > 0);
      return hasText || hasLines ? sourceIndex : -1;
    })
    .filter((sourceIndex) => sourceIndex >= 0);
  const sourceIndexes = new Set<number>();
  for (const sourceOrdinal of sourceOrdinals) {
    const sourceIndex = sourceObjectIndexes[sourceOrdinal];
    if (sourceIndex !== undefined) sourceIndexes.add(sourceIndex);
  }
  if (sourceIndexes.size <= 0) return params.jsonText;

  const nextSlides = source.slides.map((rawSlide, sourceIndex) => {
    if (!sourceIndexes.has(sourceIndex)) return rawSlide;
    if (!rawSlide || typeof rawSlide !== "object" || Array.isArray(rawSlide)) return rawSlide;
    if (nextCharacterIds.length <= 0) {
      const {
        characterIds: _characterIds,
        manualImagePrompt: _manualImagePrompt,
        ...rest
      } = rawSlide as Record<string, unknown>;
      return rest;
    }
    const { manualImagePrompt: _manualImagePrompt, ...rest } = rawSlide as Record<string, unknown>;
    return {
      ...rest,
      characterIds: nextCharacterIds,
    };
  });

  return JSON.stringify({ ...source, slides: nextSlides }, null, 2);
}

function buildGroupedSlides(params: {
  groupId: number;
  groupFrames: GroupFrame[];
  nextTexts: string[];
  resolveTemplate: (step: number) => PreparedSlide;
  resolveMediaSource?: (step: number) => PreparedSlide | null | undefined;
  autoGenerateMetadata: boolean;
  resetCueSteps?: Set<number>;
  dialogueSegmentsOverride?: PreparedSlide["dialogueSegments"];
}): PreparedSlide[] {
  const cumulative: string[] = [];
  const dialogueTemplate =
    params.groupFrames.find((frame) => Array.isArray(frame.slide.dialogueSegments) && frame.slide.dialogueSegments.length > 0)?.slide ||
    params.groupFrames[0]?.slide;
  const dialogueSegments = Object.prototype.hasOwnProperty.call(params, "dialogueSegmentsOverride")
    ? params.dialogueSegmentsOverride
    : rebuildDialogueSegmentsForEditedLines(dialogueTemplate?.dialogueSegments, params.nextTexts);

  return params.nextTexts.map((rawText, step) => {
    const fallbackTemplate =
      params.groupFrames[Math.max(0, Math.min(params.groupFrames.length - 1, step))]?.slide ||
      params.groupFrames[params.groupFrames.length - 1]?.slide;
    const template = params.resolveTemplate(step) || fallbackTemplate;
    const text = normalizeLine(preserveTextareaLine(rawText)) || normalizeLine(template?.text) || "새 슬라이드";
    const mediaSource = params.resolveMediaSource?.(step) || template;
    const preserveMedia = shouldPreserveSlideMediaAfterTextChange(mediaSource);
    cumulative.push(text);
    const captionCueLines = cumulative.map((line) => normalizeLine(line)).filter(Boolean);
    return {
      ...template,
      text,
      lines: [...cumulative],
      captionCues: buildCaptionCuesFromLines(
        captionCueLines.length > 0 ? captionCueLines : [normalizeLine(template?.text) || "새 슬라이드"],
        params.autoGenerateMetadata
      ),
      narrationText: undefined,
      groupId: params.groupId,
      stepIndex: step,
      manualImagePrompt: undefined,
      dialogueSegments,
      imageUrl: preserveMedia ? mediaSource?.imageUrl : undefined,
      mediaUrl: preserveMedia ? mediaSource?.mediaUrl : undefined,
      mediaKind: preserveMedia ? mediaSource?.mediaKind : undefined,
      imageRequest: undefined,
      imageBeats: undefined,
      imageVariantId: undefined,
      imageVariantStartLineIndex: undefined,
      resolvedImageUrl: preserveMedia ? mediaSource?.resolvedImageUrl || mediaSource?.imageUrl : undefined,
      resolvedBy: preserveMedia ? mediaSource?.resolvedBy : undefined,
      imageSelection: preserveMedia ? mediaSource?.imageSelection : undefined,
      sfxPlan: undefined,
      sfxCue:
        params.resetCueSteps?.has(step) || template?.sfxCue?.source !== "manual"
          ? undefined
          : template.sfxCue,
    };
  });
}

type CollapsedPreparedSlide = {
  slide: PreparedSlide;
};

function buildCollapsedGroupedImageBeats(
  frames: GroupFrame[],
  first: PreparedSlide
): PreparedSlide["imageBeats"] {
  const mediaSignature = (slide: PreparedSlide): string =>
    JSON.stringify({
      imageUrl: normalizeLine(slide.imageUrl),
      resolvedImageUrl: normalizeLine(slide.resolvedImageUrl),
      mediaUrl: normalizeLine(slide.mediaUrl),
      mediaKind: slide.mediaKind || "",
      resolvedBy: slide.resolvedBy || "",
      selectedCandidateId: normalizeLine(slide.imageSelection?.selectedCandidateId),
      imageRequest: slide.imageRequest || null,
      imageVariantId: normalizeLine(slide.imageVariantId),
    });
  const hasVisual = (slide: PreparedSlide): boolean =>
    Boolean(slide.imageUrl || slide.resolvedImageUrl || slide.mediaUrl || slide.imageRequest);
  const beats: NonNullable<PreparedSlide["imageBeats"]> = [];
  let previousSignature = mediaSignature(first);

  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex]?.slide;
    if (!frame) continue;
    const nextSignature = mediaSignature(frame);
    if (nextSignature === previousSignature) continue;
    previousSignature = nextSignature;
    const startLineIndex = isFiniteNumber(frame.stepIndex)
      ? Math.max(0, Math.floor(Number(frame.stepIndex)))
      : frameIndex;
    beats.push({
      beatId: normalizeLine(frame.imageVariantId) || `${Number(first.groupId) || 0}:${startLineIndex}`,
      startLineIndex,
      clearVisual: hasVisual(frame) ? undefined : true,
      imageUrl: frame.imageUrl,
      resolvedImageUrl: frame.resolvedImageUrl || frame.imageUrl,
      resolvedBy: frame.resolvedBy,
      imageSelection: frame.imageSelection,
      mediaUrl: frame.mediaUrl,
      mediaKind: frame.mediaKind,
      imageRequest: frame.imageRequest,
      reason: "preserved grouped visual transition",
    });
    if (beats.length >= 2) break;
  }

  return beats.length > 0 ? beats : undefined;
}

function buildCollapsedGroupedSfxPlan(frames: GroupFrame[], first: PreparedSlide): SlideSfxPlanItem[] | undefined {
  const byLineIndex = new Map<number, SlideSfxPlanItem>();
  for (const item of first.sfxPlan || []) {
    if (!Number.isFinite(item?.lineIndex)) continue;
    byLineIndex.set(Math.max(0, Math.floor(Number(item.lineIndex))), { ...item });
  }

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const cue = frame.slide.sfxCue;
    const tag = normalizeLine(cue?.tag);
    if (!cue || cue.source !== "manual" || !tag) continue;
    const lineIndex = isFiniteNumber(frame.slide.stepIndex) ? Math.max(0, Math.floor(Number(frame.slide.stepIndex))) : frameIndex;
    if (lineIndex === 0) {
      byLineIndex.delete(0);
      continue;
    }
    byLineIndex.set(lineIndex, {
      lineIndex,
      enabled: cue.enabled !== false,
      tag,
      gainDb: cue.gainDb,
      offsetMs: cue.offsetMs,
      source: "manual",
    });
  }

  const result = Array.from(byLineIndex.values()).sort((left, right) => left.lineIndex - right.lineIndex);
  return result.length > 0 ? result : undefined;
}

function collapsePreparedSlidesForScriptJson(slides: PreparedSlide[]): CollapsedPreparedSlide[] {
  const collapsed: CollapsedPreparedSlide[] = [];
  const consumedGroups = new Set<number>();
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    const groupId = isFiniteNumber(slide.groupId) ? Number(slide.groupId) : null;
    if (groupId === null) {
      collapsed.push({ slide: { ...slide } });
      continue;
    }
    if (consumedGroups.has(groupId)) continue;
    consumedGroups.add(groupId);
    const frames = getGroupFrames(slides, groupId);
    const atomicLines = getGroupLineTexts(frames).map((line) => normalizeLine(line)).filter(Boolean);
    const first = frames[0]?.slide || slide;
    const last = frames[frames.length - 1]?.slide || first;
    const imageBeats = buildCollapsedGroupedImageBeats(frames, first);
    collapsed.push({
      slide: {
        ...first,
        text: joinLines(atomicLines) || normalizeLine(first.text) || "새 슬라이드",
        lines: atomicLines.length > 0 ? atomicLines : getStandaloneLines(first),
        captionCues: last.captionCues,
        narrationText: undefined,
        dialogueSegments: first.dialogueSegments,
        characterIds: first.characterIds,
        imageBeats,
        sfxPlan: buildCollapsedGroupedSfxPlan(frames, first),
        groupId: undefined,
        stepIndex: undefined,
      },
    });
  }
  return collapsed;
}

export function applyPreparedSlidesToJsonText(params: {
  jsonText: string;
  slides: PreparedSlide[];
}): string {
  let source: Record<string, unknown>;
  try {
    const parsed = JSON.parse(params.jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return params.jsonText;
    source = parsed as Record<string, unknown>;
  } catch {
    return params.jsonText;
  }
  const collapsed = collapsePreparedSlidesForScriptJson(params.slides);
  const nextSlides = collapsed.map(({ slide }) => {
    return {
      title: slide.title,
      text: slide.text,
      lines: slide.lines,
      captionCues: slide.captionCues,
      layout: slide.layout,
      narrationText: slide.narrationText,
      ttsVoiceId: slide.ttsVoiceId,
      dialogueSegments: slide.dialogueSegments,
      characterIds: slide.characterIds,
      imageUrl: slide.imageUrl,
      resolvedImageUrl: slide.resolvedImageUrl,
      resolvedBy: slide.resolvedBy,
      imageSelection: slide.imageSelection,
      mediaUrl: slide.mediaUrl,
      mediaKind: slide.mediaKind,
      imageRequest: slide.imageRequest,
      manualImagePrompt: slide.manualImagePrompt,
      imageBeats: slide.imageBeats,
      imageVariantId: slide.imageVariantId,
      imageVariantStartLineIndex: slide.imageVariantStartLineIndex,
      sfxPlan: slide.sfxPlan,
      sfxCue: slide.sfxCue,
    };
  });
  return JSON.stringify({ ...source, slides: nextSlides }, null, 2);
}

export function useStudioSlideEditActions(input: {
  slides: PreparedSlide[];
  publishCategory: PublishCategory;
  imageSource: ImageSource;
  codexModel?: string;
  imageStylePrompt?: string;
  fixedCharacterProfileId?: string;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  templateId?: string | null;
  templateData?: StudioTemplatePayload;
  jsonText: string;
  setJsonTextAction: Dispatch<SetStateAction<string>>;
  setPreviewTimingAction: Dispatch<SetStateAction<PreviewTimingState | null>>;
  setRenderStatusAction: Dispatch<SetStateAction<string>>;
  setSlidesAction: Dispatch<SetStateAction<PreparedSlide[]>>;
  getLinkedSlideIndexesAction: (slides: PreparedSlide[], index: number) => Set<number>;
  readImageFileAsDataUrlAction: (file: File) => Promise<string>;
}) {
  const markPreviewAsDirty = useCallback(() => {
    input.setPreviewTimingAction(null);
    input.setRenderStatusAction("미리보기가 변경되었습니다. 이전 렌더 결과는 비교용으로 유지되며 영상 재생성이 필요합니다.");
  }, [input]);

  const commitSlideStructureMutation = useCallback(
    (mutate: (slides: PreparedSlide[]) => PreparedSlide[]): boolean => {
      const nextSlides = mutate(input.slides);
      if (nextSlides === input.slides) return false;
      input.setJsonTextAction((current) => applyPreparedSlidesToJsonText({ jsonText: current, slides: nextSlides }));
      input.setSlidesAction(nextSlides);
      return true;
    },
    [input]
  );

  const templateFeatureToggles = getStudioTemplateFeatureToggles(
    normalizeStudioTemplateId(input.templateId),
    input.templateData,
  );
  const autoGenerateCaptionMetadata = templateFeatureToggles.cueMetadata && templateFeatureToggles.autoCaptionFx;

  const handleTitleChange = useCallback(
    (value: string) => {
      input.setSlidesAction((prev) => prev.map((slide) => ({ ...slide, title: value })));
      input.setJsonTextAction(() => {
        try {
          const parsed = JSON.parse(input.jsonText) as Record<string, unknown>;
          return JSON.stringify({ ...parsed, title: value }, null, 2);
        } catch {
          return input.jsonText;
        }
      });
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideTitleChange = useCallback(
    (index: number, value: string) => {
      input.setSlidesAction((prev) => {
        if (!prev[index]) return prev;
        const linkedIndexes = input.getLinkedSlideIndexesAction(prev, index);
        const nextTitle = value;
        return prev.map((slide, slideIndex) => (linkedIndexes.has(slideIndex) ? { ...slide, title: nextTitle } : slide));
      });
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideImageUrlChange = useCallback(
    (index: number, value: string) => {
      input.setSlidesAction((prev) => {
        if (!prev[index]) return prev;
        const linkedIndexes = input.getLinkedSlideIndexesAction(prev, index);
        const normalizedMedia = normalizeStudioMediaUrls({
          imageUrl: value,
          mediaUrl: value,
          mediaKind: inferMediaKindFromUrl(value),
        });
        return prev.map((slide, i) =>
          linkedIndexes.has(i)
            ? {
                ...slide,
                imageUrl: normalizedMedia.imageUrl,
                mediaUrl: normalizedMedia.mediaUrl,
                mediaKind: normalizedMedia.mediaKind,
                resolvedImageUrl: normalizedMedia.imageUrl,
                resolvedBy: normalizedMedia.imageUrl ? "direct" : undefined,
                imageSelection: undefined,
              }
            : slide
        );
      });
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideImageFileChange = useCallback(
    async (index: number, file: File | null) => {
      if (!file) return;
      const isStaticImageFile =
        file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg" || file.type === "image/webp";
      const isGifFile = file.type === "image/gif";
      const isVideoFile = file.type === "video/mp4" || file.type === "video/webm" || file.type === "video/quicktime";
      if (!isStaticImageFile && !isGifFile && !isVideoFile) {
        alert("PNG, JPG, WEBP, GIF, MP4, WEBM, MOV 파일만 업로드할 수 있습니다.");
        return;
      }
      try {
        const uploadResult = await uploadStudioMediaAsset({
          file,
          title: file.name.replace(/\.[^.]+$/, "").trim() || `슬라이드 ${index + 1} 업로드`,
          summary: "",
          queryHints: [],
          metadataOrigin: "manual",
        }).catch(async () => {
          const dataUrl = await input.readImageFileAsDataUrlAction(file);
          input.setSlidesAction((prev) => {
            if (!prev[index]) return prev;
            const linkedIndexes = input.getLinkedSlideIndexesAction(prev, index);
            return prev.map((slide, i) =>
              linkedIndexes.has(i)
                ? {
                    ...slide,
                    imageUrl: isVideoFile ? undefined : dataUrl,
                    mediaUrl: isVideoFile || isGifFile ? dataUrl : undefined,
                    mediaKind: isVideoFile ? "video" : isGifFile ? "animated_image" : undefined,
                    resolvedImageUrl: isVideoFile ? undefined : dataUrl,
                    resolvedBy: isVideoFile ? undefined : "direct",
                    imageSelection: undefined,
                  }
                : slide
            );
          });
          markPreviewAsDirty();
          throw new Error("업로드 저장에 실패해 임시 이미지로만 적용했습니다. 서버/새로고침 후 유지하려면 다시 업로드해 주세요.");
        });
        if (!uploadResult) return;
        input.setSlidesAction((prev) => {
          return applySlideAssetToSlides({
            slides: prev,
            index,
            getLinkedSlideIndexes: input.getLinkedSlideIndexesAction,
            asset: {
              imageUrl: uploadResult.item.imageUrl,
              mediaUrl: uploadResult.item.mediaUrl,
              mediaKind: uploadResult.item.mediaKind,
              assetId: uploadResult.item.id,
              title: uploadResult.item.title || file.name,
              selectionReason: uploadResult.item.title
                ? `manual uploaded asset: ${uploadResult.item.title}`
                : `manual uploaded asset: ${file.name}`,
            },
          });
        });
        markPreviewAsDirty();
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideLibraryAssetApply = useCallback(
    (
      index: number,
      asset: {
        imageUrl: string;
        mediaUrl?: string;
        mediaKind?: SlideMediaKind;
        assetId?: string;
        title?: string;
      }
    ) => {
      input.setSlidesAction((prev) => {
        return applySlideAssetToSlides({
          slides: prev,
          index,
          getLinkedSlideIndexes: input.getLinkedSlideIndexesAction,
          asset,
        });
      });
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideSfxCueChange = useCallback(
    (index: number, cue: { enabled: boolean; tag: SfxTag; gainDb?: number; offsetMs?: number; source?: "auto" | "manual" } | null) => {
      input.setSlidesAction((prev) => applySlideSfxCueChangeToSlides(prev, index, cue));
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideCharacterIdsChange = useCallback(
    (index: number, characterIds: string[]) => {
      input.setJsonTextAction((current) =>
        applySlideCharacterIdsToJsonText({
          jsonText: current,
          slides: input.slides,
          index,
          characterIds,
          getLinkedSlideIndexes: input.getLinkedSlideIndexesAction,
        })
      );
      input.setSlidesAction((prev) =>
        applySlideCharacterIdsToSlides({
          slides: prev,
          index,
          characterIds,
          getLinkedSlideIndexes: input.getLinkedSlideIndexesAction,
        })
      );
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideNarrationTextChange = useCallback(
    (index: number, value: string) => {
      commitSlideStructureMutation((prev) =>
        applySlideNarrationTextChangeToSlides({
          slides: prev,
          index,
          value,
          autoGenerateCaptionMetadata,
        })
      );
      markPreviewAsDirty();
    },
    [commitSlideStructureMutation, markPreviewAsDirty]
  );

  const handleManualImageGenerate = useCallback(
    async (index: number) => {
      if (input.imageSource !== "auto-ai-generate") {
        return "실제 이미지 생성은 AI 이미지(자동 생성) 모드에서만 사용할 수 있습니다.";
      }
      const requestSlides = input.slides;
      const requestJsonText = input.jsonText;
      const response = await requestStudioManualImageGenerate(buildStudioManualImageGenerateRequest({
        publishCategory: input.publishCategory,
        imageSource: input.imageSource,
        slides: requestSlides,
        slideIndexes: [index],
        mode: "selected",
        codexModel: input.codexModel,
        imageStylePrompt: input.imageStylePrompt,
        fixedCharacterProfileId: input.fixedCharacterProfileId,
        jsonText: requestJsonText,
        projectProfileSnapshot: input.projectProfileSnapshot,
      }));
      const successCount = response.results.filter((item) => item.status === "ok").length;
      const failureCount = response.results.filter((item) => item.status === "error").length;
      if (successCount > 0) {
        input.setSlidesAction((currentSlides) =>
          mergeManualImageGenerateCandidateSlides({
            requestSlides,
            currentSlides,
            generatedSlides: response.slides,
          })
        );
        input.setJsonTextAction((currentJsonText) =>
          applyGeneratedCharacterProfilesToJsonText({
            requestJsonText,
            currentJsonText,
            characterProfiles: response.characterProfiles,
          })
        );
        markPreviewAsDirty();
      }
      if (successCount > 0 && failureCount > 0) {
        return `Codex 이미지 ${successCount}개 생성 완료·이미지 없는 장면에는 바로 적용했습니다. ${failureCount}개는 경고를 확인해 주세요.`;
      }
      if (successCount > 0) {
        return `Codex 이미지 ${successCount}개 생성 완료·이미지 없는 장면에는 바로 적용했습니다.`;
      }
      return response.warnings[0] || "Codex 생성 결과가 없습니다.";
    },
    [input, markPreviewAsDirty]
  );

  const handleManualImageGenerateMissing = useCallback(
    async () => {
      if (input.imageSource !== "auto-ai-generate") {
        return "실제 이미지 생성은 AI 이미지(자동 생성) 모드에서만 사용할 수 있습니다.";
      }
      const requestSlides = input.slides;
      const requestJsonText = input.jsonText;
      const response = await requestStudioManualImageGenerate(buildStudioManualImageGenerateRequest({
        publishCategory: input.publishCategory,
        imageSource: input.imageSource,
        slides: requestSlides,
        mode: "missing",
        codexModel: input.codexModel,
        imageStylePrompt: input.imageStylePrompt,
        fixedCharacterProfileId: input.fixedCharacterProfileId,
        jsonText: requestJsonText,
        projectProfileSnapshot: input.projectProfileSnapshot,
      }));
      const successCount = response.results.filter((item) => item.status === "ok").length;
      const failureCount = response.results.filter((item) => item.status === "error").length;
      if (successCount > 0) {
        input.setSlidesAction((currentSlides) =>
          mergeManualImageGenerateCandidateSlides({
            requestSlides,
            currentSlides,
            generatedSlides: response.slides,
          })
        );
        input.setJsonTextAction((currentJsonText) =>
          applyGeneratedCharacterProfilesToJsonText({
            requestJsonText,
            currentJsonText,
            characterProfiles: response.characterProfiles,
          })
        );
        markPreviewAsDirty();
      }
      if (successCount > 0 && failureCount > 0) {
        return `이미지 없는 장면 ${successCount}개 생성 완료·바로 적용했습니다. ${failureCount}개는 경고를 확인해 주세요.`;
      }
      if (successCount > 0) {
        return `이미지 없는 장면 ${successCount}개 생성 완료·바로 적용했습니다.`;
      }
      return response.warnings[0] || "Codex 생성 대상 슬라이드가 없습니다.";
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideImageCandidateApply = useCallback(
    (index: number, candidate: ImageSelectionCandidate) => {
      input.setSlidesAction((prev) => {
        return applyStudioImageCandidateToSlides({
          slides: prev,
          index,
          getLinkedSlideIndexes: input.getLinkedSlideIndexesAction,
          candidate,
        });
      });
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideVoiceChange = useCallback(
    (index: number, value: string) => {
      input.setSlidesAction((prev) => {
        if (!prev[index]) return prev;
        const linkedIndexes = input.getLinkedSlideIndexesAction(prev, index);
        const nextVoiceId = normalizeLine(value) || undefined;
        return prev.map((slide, slideIndex) =>
          linkedIndexes.has(slideIndex)
            ? {
                ...slide,
                ttsVoiceId: nextVoiceId,
                dialogueSegments: setDialogueSegmentVoices(slide.dialogueSegments, nextVoiceId),
              }
            : slide
        );
      });
      markPreviewAsDirty();
    },
    [input, markPreviewAsDirty]
  );

  const handleSlideSplitAction = useCallback(
    (index: number) => {
      commitSlideStructureMutation((prev) => {
        const target = prev[index];
        if (!target) return prev;

        const targetGroupId = isFiniteNumber(target.groupId) ? Number(target.groupId) : null;
        if (targetGroupId === null) {
          const split = splitStandaloneSlide(target);
          if (!split) return prev;
          const splitSegments = splitStandaloneDialogueSegments(target, split.leftLines, split.rightLines);
          const currentSlide = buildStandaloneSlide(target, split.leftLines, autoGenerateCaptionMetadata, {
            dialogueSegments: splitSegments.left,
          });
          const insertedSlide = buildStandaloneSlide(target, split.rightLines, autoGenerateCaptionMetadata, {
            dialogueSegments: splitSegments.right,
            sfxCue: undefined,
          });
          return [...prev.slice(0, index), currentSlide, insertedSlide, ...prev.slice(index + 1)];
        }

        const groupFrames = getGroupFrames(prev, targetGroupId);
        const targetPosition = groupFrames.findIndex((frame) => frame.index === index);
        if (groupFrames.length <= 0 || targetPosition < 0) return prev;

        const groupLineTexts = getGroupLineTexts(groupFrames);
        const split = splitTextValue(groupLineTexts[targetPosition] || "");
        if (!split) return prev;
        const alignedSegments = rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, groupLineTexts) || [];

        const nextTexts = [
          ...groupLineTexts.slice(0, targetPosition),
          split[0],
          split[1],
          ...groupLineTexts.slice(targetPosition + 1),
        ];
        const replacementFrames = buildGroupedSlides({
          groupId: targetGroupId,
          groupFrames,
          nextTexts,
          resolveTemplate: (step) => {
            if (step < targetPosition) return groupFrames[step]?.slide || target;
            if (step === targetPosition || step === targetPosition + 1) return target;
            return groupFrames[step - 1]?.slide || target;
          },
          autoGenerateMetadata: autoGenerateCaptionMetadata,
          resetCueSteps: new Set<number>([targetPosition + 1]),
          dialogueSegmentsOverride:
            alignedSegments.length === groupLineTexts.length && alignedSegments[targetPosition]
              ? [
                  ...alignedSegments.slice(0, targetPosition),
                  { ...alignedSegments[targetPosition], text: split[0] },
                  { ...alignedSegments[targetPosition], text: split[1] },
                  ...alignedSegments.slice(targetPosition + 1),
                ]
              : rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, nextTexts),
        });
        return replaceGroupedSlides(prev, targetGroupId, replacementFrames);
      });
      markPreviewAsDirty();
    },
    [autoGenerateCaptionMetadata, commitSlideStructureMutation, markPreviewAsDirty]
  );

  const handleSlideMergeWithNextAction = useCallback(
    (index: number) => {
      commitSlideStructureMutation((prev) => {
        const target = prev[index];
        const nextSlide = prev[index + 1];
        if (!target || !nextSlide) return prev;

        const targetGroupId = isFiniteNumber(target.groupId) ? Number(target.groupId) : null;
        const nextGroupId = isFiniteNumber(nextSlide.groupId) ? Number(nextSlide.groupId) : null;
        if (targetGroupId === null && nextGroupId === null) {
          const mergedLines = [...getStandaloneLines(target), ...getStandaloneLines(nextSlide)];
          const mergedManualCue = resolvePreferredManualSfxCue(target, nextSlide);
          const mergedSlide = buildStandaloneSlide(
            target,
            mergedLines,
            autoGenerateCaptionMetadata,
            {
              dialogueSegments: mergeStandaloneDialogueSegments(target, nextSlide),
              sfxCue: mergedManualCue,
            },
            resolvePreferredPreservedMediaSource(target, nextSlide)
          );
          return [...prev.slice(0, index), mergedSlide, ...prev.slice(index + 2)];
        }

        if (targetGroupId === null || nextGroupId === null || targetGroupId !== nextGroupId) {
          return prev;
        }

        const groupFrames = getGroupFrames(prev, targetGroupId);
        const targetPosition = groupFrames.findIndex((frame) => frame.index === index);
        if (groupFrames.length <= 1 || targetPosition < 0 || targetPosition >= groupFrames.length - 1) return prev;
        if (groupFrames[targetPosition + 1]?.index !== index + 1) return prev;

        const groupLineTexts = getGroupLineTexts(groupFrames);
        const mergedText = joinLines([groupLineTexts[targetPosition] || "", groupLineTexts[targetPosition + 1] || ""]);
        if (!mergedText) return prev;
        const nextTexts = [
          ...groupLineTexts.slice(0, targetPosition),
          mergedText,
          ...groupLineTexts.slice(targetPosition + 2),
        ];
        const alignedSegments = rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, groupLineTexts) || [];
        const leftSegment = alignedSegments[targetPosition];
        const rightSegment = alignedSegments[targetPosition + 1];
        const mergedDialogueSegments =
          alignedSegments.length === groupLineTexts.length && leftSegment && rightSegment
            ? toDialogueRoutingKey(leftSegment) === toDialogueRoutingKey(rightSegment)
              ? [
                  ...alignedSegments.slice(0, targetPosition),
                  { ...leftSegment, text: mergedText },
                  ...alignedSegments.slice(targetPosition + 2),
                ]
              : alignedSegments
            : rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, nextTexts);
        const resolveMergedTemplate = (step: number) => {
          if (step < targetPosition) return groupFrames[step]?.slide || target;
          if (step === targetPosition) {
            const mergedManualCue = resolvePreferredManualSfxCue(target, nextSlide);
            return mergedManualCue ? { ...target, sfxCue: mergedManualCue } : target;
          }
          return groupFrames[step + 1]?.slide || target;
        };
        const mergedMediaSource = resolvePreferredPreservedMediaSource(target, nextSlide);
        const replacementFrames = buildGroupedSlides({
          groupId: targetGroupId,
          groupFrames,
          nextTexts,
          resolveTemplate: resolveMergedTemplate,
          resolveMediaSource: (step) => (step === targetPosition ? mergedMediaSource : resolveMergedTemplate(step)),
          autoGenerateMetadata: autoGenerateCaptionMetadata,
          dialogueSegmentsOverride: mergedDialogueSegments,
        });
        return replaceGroupedSlides(prev, targetGroupId, replacementFrames);
      });
      markPreviewAsDirty();
    },
    [autoGenerateCaptionMetadata, commitSlideStructureMutation, markPreviewAsDirty]
  );

  const handleSlideDuplicateAction = useCallback(
    (index: number) => {
      commitSlideStructureMutation((prev) => {
        const target = prev[index];
        if (!target) return prev;

        const targetGroupId = isFiniteNumber(target.groupId) ? Number(target.groupId) : null;
        if (targetGroupId === null) {
          const duplicateLines = getStandaloneLines(target);
          const normalizedDuplicateLines = duplicateLines.length > 0 ? duplicateLines : [normalizeLine(target.text) || "새 슬라이드"];
          const duplicateSlide = buildStandaloneSlide(target, normalizedDuplicateLines, autoGenerateCaptionMetadata, {
            dialogueSegments: rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, normalizedDuplicateLines),
            sfxCue: undefined,
          });
          return [...prev.slice(0, index + 1), duplicateSlide, ...prev.slice(index + 1)];
        }

        const groupFrames = getGroupFrames(prev, targetGroupId);
        const targetPosition = groupFrames.findIndex((frame) => frame.index === index);
        if (groupFrames.length <= 0 || targetPosition < 0) return prev;

        const groupLineTexts = getGroupLineTexts(groupFrames);
        const duplicatedText = groupLineTexts[targetPosition] || normalizeLine(target.text) || "새 슬라이드";
        const alignedSegments = rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, groupLineTexts) || [];
        const nextTexts = [
          ...groupLineTexts.slice(0, targetPosition + 1),
          duplicatedText,
          ...groupLineTexts.slice(targetPosition + 1),
        ];
        const replacementFrames = buildGroupedSlides({
          groupId: targetGroupId,
          groupFrames,
          nextTexts,
          resolveTemplate: (step) => {
            if (step <= targetPosition) return groupFrames[step]?.slide || target;
            if (step === targetPosition + 1) return target;
            return groupFrames[step - 1]?.slide || target;
          },
          autoGenerateMetadata: autoGenerateCaptionMetadata,
          resetCueSteps: new Set<number>([targetPosition + 1]),
          dialogueSegmentsOverride:
            alignedSegments.length === groupLineTexts.length && alignedSegments[targetPosition]
              ? [
                  ...alignedSegments.slice(0, targetPosition + 1),
                  { ...alignedSegments[targetPosition], text: duplicatedText },
                  ...alignedSegments.slice(targetPosition + 1),
                ]
              : rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, nextTexts),
        });
        return replaceGroupedSlides(prev, targetGroupId, replacementFrames);
      });
      markPreviewAsDirty();
    },
    [autoGenerateCaptionMetadata, commitSlideStructureMutation, markPreviewAsDirty]
  );

  const handleSlideDelete = useCallback(
    (index: number) => {
      commitSlideStructureMutation((prev) => {
        const target = prev[index];
        if (!target) return prev;

        const targetGroupId = isFiniteNumber(target.groupId) ? Number(target.groupId) : null;
        if (targetGroupId === null) {
          if (prev.length <= 1) return prev;
          return prev.filter((_, slideIndex) => slideIndex !== index);
        }

        const groupFrames = getGroupFrames(prev, targetGroupId);
        const targetPosition = groupFrames.findIndex((frame) => frame.index === index);
        if (groupFrames.length <= 0 || targetPosition < 0) return prev;

        if (groupFrames.length <= 1) {
          if (prev.length <= 1) return prev;
          return prev.filter((slide) => !belongsToGroup(slide, targetGroupId));
        }

        const groupLineTexts = getGroupLineTexts(groupFrames);
        const nextTexts = groupLineTexts.filter((_, step) => step !== targetPosition);
        const alignedSegments = rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, groupLineTexts) || [];
        const replacementFrames = buildGroupedSlides({
          groupId: targetGroupId,
          groupFrames,
          nextTexts,
          resolveTemplate: (step) => {
            if (step < targetPosition) return groupFrames[step]?.slide || target;
            return groupFrames[step + 1]?.slide || target;
          },
          autoGenerateMetadata: autoGenerateCaptionMetadata,
          dialogueSegmentsOverride:
            alignedSegments.length === groupLineTexts.length
              ? alignedSegments.filter((_, step) => step !== targetPosition)
              : rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, nextTexts),
        });
        return replaceGroupedSlides(prev, targetGroupId, replacementFrames);
      });
      markPreviewAsDirty();
    },
    [autoGenerateCaptionMetadata, commitSlideStructureMutation, markPreviewAsDirty]
  );

  const handleSlideAdd = useCallback(
    (index: number) => {
      commitSlideStructureMutation((prev) => {
        const target = prev[index];
        if (!target) return prev;

        const placeholderText = "새 슬라이드";
        const targetGroupId = isFiniteNumber(target.groupId) ? Number(target.groupId) : null;
        if (targetGroupId === null) {
          const insertedSlide = buildAddedStandaloneSlide(target, placeholderText, autoGenerateCaptionMetadata);
          return [...prev.slice(0, index + 1), insertedSlide, ...prev.slice(index + 1)];
        }

        const groupFrames = getGroupFrames(prev, targetGroupId);
        const targetPosition = groupFrames.findIndex((frame) => frame.index === index);
        if (groupFrames.length <= 0 || targetPosition < 0) return prev;

        const groupLineTexts = getGroupLineTexts(groupFrames);
        const insertAt = targetPosition + 1;
        const alignedSegments = rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, groupLineTexts) || [];
        const nextTexts = [
          ...groupLineTexts.slice(0, insertAt),
          placeholderText,
          ...groupLineTexts.slice(insertAt),
        ];
        const replacementFrames = buildGroupedSlides({
          groupId: targetGroupId,
          groupFrames,
          nextTexts,
          resolveTemplate: (step) => {
            if (step < insertAt) return groupFrames[step]?.slide || target;
            if (step === insertAt) return target;
            return groupFrames[step - 1]?.slide || target;
          },
          autoGenerateMetadata: autoGenerateCaptionMetadata,
          resetCueSteps: new Set<number>([insertAt]),
          dialogueSegmentsOverride:
            alignedSegments.length === groupLineTexts.length
              ? [
                  ...alignedSegments.slice(0, insertAt),
                  { type: "narration", text: placeholderText },
                  ...alignedSegments.slice(insertAt),
                ]
              : rebuildDialogueSegmentsForEditedLines(target.dialogueSegments, nextTexts),
        });
        return replaceGroupedSlides(prev, targetGroupId, replacementFrames);
      });
      markPreviewAsDirty();
    },
    [autoGenerateCaptionMetadata, commitSlideStructureMutation, markPreviewAsDirty]
  );

  return {
    handleTitleChange,
    handleSlideTitleChange,
    handleSlideImageUrlChange,
    handleSlideImageFileChange,
    handleSlideLibraryAssetApply,
    handleManualImageGenerate,
    handleManualImageGenerateMissing,
    handleSlideImageCandidateApply,
    handleSlideSfxCueChange,
    handleSlideCharacterIdsChange,
    handleSlideNarrationTextChange,
    handleSlideVoiceChange,
    handleSlideSplitAction,
    handleSlideMergeWithNextAction,
    handleSlideDuplicateAction,
    handleSlideDelete,
    handleSlideAdd,
  };
}

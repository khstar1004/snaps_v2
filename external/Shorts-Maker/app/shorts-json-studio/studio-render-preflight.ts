"use client";

import { canonicalizeStudioSfxTag, type StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import { captionLineFits, createCaptionLayoutPolicy } from "@/lib/studio/caption-layout";
import { getRenderSafetyIssuesForSlide } from "@/lib/studio/render-safety";
import type { StudioRenderTemplateImageLayout } from "@/types/studio-renderer";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";
import { hashStudioFingerprintKey } from "./studio-render-fingerprint";
import { resolveDialogueVoiceSelectionForRender } from "./studio-voice-config-helpers";

export type StudioRenderPreflightSeverity = "blocker" | "warning";

export type StudioRenderPreflightTargetStep = "script" | "audio" | "image" | "caption_audio" | "review_render";

export type StudioRenderPreflightIssue = {
  code: string;
  severity: StudioRenderPreflightSeverity;
  message: string;
  slideIndex?: number;
  segmentIndex?: number;
  targetStep: StudioRenderPreflightTargetStep;
};

export type StudioPreviewTimingLike = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
};

export type StudioRenderPreflightInput = {
  slides: PreparedSlide[];
  source: Record<string, unknown>;
  selectedVoiceId: string;
  selectedQuoteVoiceId: string;
  selectedMaleVoiceId: string;
  selectedFemaleVoiceId: string;
  previewTiming: StudioPreviewTimingLike | null;
  renderNeedsRefresh: boolean;
  hasDraftVideo: boolean;
  templateRequirementAlert: string | null;
  bgmEnabled: boolean;
  bgmPath: string;
  sfxEnabled: boolean;
  sfxCategories: StudioSfxCategoryOption[];
  templateId?: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageLayout?: StudioRenderTemplateImageLayout;
  imageApproved?: boolean;
};

export type StudioRenderPreflightSummary = {
  canRenderFinal: boolean;
  counts: Record<StudioRenderPreflightSeverity, number>;
  issues: StudioRenderPreflightIssue[];
};

const BLOCKING_RENDER_SAFETY_CODES = new Set(["blob-url", "local-path", "unknown-path", "giphy-page-url", "share-link"]);

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasText(value: unknown): boolean {
  return trim(value).length > 0;
}

export function hasRenderableMedia(slide: PreparedSlide): boolean {
  if (hasText(slide.imageUrl) || hasText(slide.resolvedImageUrl) || hasText(slide.mediaUrl)) return true;
  if (!Array.isArray(slide.imageBeats)) return false;
  return slide.imageBeats.some(
    (beat) => hasText(beat?.imageUrl) || hasText(beat?.resolvedImageUrl) || hasText(beat?.mediaUrl)
  );
}

function normalizeLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => trim(line));
}

function normalizeDialogueSegments(slide: PreparedSlide) {
  return Array.isArray(slide.dialogueSegments) ? slide.dialogueSegments : [];
}

function buildSlideTimingSignature(slide: PreparedSlide) {
  return {
    title: trim(slide.title),
    text: trim(slide.text),
    narrationText: trim(slide.narrationText),
    lines: normalizeLines(slide.lines),
    layout: trim(slide.layout),
    imageUrl: safeUrlForKey(slide.imageUrl),
    resolvedImageUrl: safeUrlForKey(slide.resolvedImageUrl),
    mediaUrl: safeUrlForKey(slide.mediaUrl),
    mediaKind: trim(slide.mediaKind),
    groupId: normalizeNumber(slide.groupId),
    stepIndex: normalizeNumber(slide.stepIndex),
    dialogueSegments: normalizeDialogueSegments(slide).map((segment) => ({
      type: trim(segment.type).toLowerCase() === "quote" ? "quote" : "narration",
      text: trim(segment.text),
      speakerId: trim(segment.speakerId).toLowerCase(),
      voice: trim(segment.voice),
      speed: normalizeNumber(segment.speed),
      pauseAfterMs: normalizeNumber(segment.pauseAfterMs),
    })),
    captionCues: Array.isArray(slide.captionCues)
      ? slide.captionCues.map((cue) => ({
          text: trim(cue?.text),
          startMs: normalizeNumber((cue as { startMs?: unknown })?.startMs),
          endMs: normalizeNumber((cue as { endMs?: unknown })?.endMs),
        }))
      : [],
  };
}

function safeUrlForKey(value: unknown): string {
  const url = trim(value);
  if (!url) return "";
  if (/^data:/i.test(url)) return `data:${url.length}`;
  if (/base64,/i.test(url)) return `base64:${url.length}`;
  return url;
}

function normalizeImageBeatsForKey(slide: PreparedSlide) {
  if (!Array.isArray(slide.imageBeats)) return [];
  return slide.imageBeats.map((beat) => ({
    beatId: trim(beat?.beatId),
    startLineIndex: normalizeNumber(beat?.startLineIndex) ?? 0,
    clearVisual: beat?.clearVisual === true,
    imageUrl: safeUrlForKey(beat?.imageUrl),
    resolvedImageUrl: safeUrlForKey(beat?.resolvedImageUrl),
    mediaUrl: safeUrlForKey(beat?.mediaUrl),
    mediaKind: trim(beat?.mediaKind),
    resolvedBy: trim(beat?.resolvedBy),
  }));
}

function normalizeSfxCueForKey(slide: PreparedSlide) {
  return {
    sfxCue: slide.sfxCue
      ? {
          enabled: slide.sfxCue.enabled !== false,
          tag: canonicalizeStudioSfxTag(trim(slide.sfxCue.tag)),
          gainDb: normalizeNumber(slide.sfxCue.gainDb),
          offsetMs: normalizeNumber(slide.sfxCue.offsetMs),
          source: trim(slide.sfxCue.source),
        }
      : null,
    sfxPlan: Array.isArray(slide.sfxPlan)
      ? slide.sfxPlan.map((item) => ({
          lineIndex: normalizeNumber(item?.lineIndex) ?? 0,
          enabled: item?.enabled !== false,
          tag: canonicalizeStudioSfxTag(trim(item?.tag)),
          gainDb: normalizeNumber(item?.gainDb),
          offsetMs: normalizeNumber(item?.offsetMs),
          source: trim(item?.source),
        }))
      : [],
  };
}

function buildCatalog(categories: StudioSfxCategoryOption[]) {
  const categoriesById = new Map<string, StudioSfxCategoryOption>();
  const filesById = new Map<string, { categoryId: string; path: string }>();
  for (const category of Array.isArray(categories) ? categories : []) {
    const categoryId = canonicalizeStudioSfxTag(trim(category?.id));
    if (!categoryId) continue;
    categoriesById.set(categoryId, category);
    for (const file of Array.isArray(category?.files) ? category.files : []) {
      const fileId = canonicalizeStudioSfxTag(trim(file?.id));
      if (!fileId) continue;
      filesById.set(fileId, { categoryId, path: trim(file?.path) });
    }
  }
  return { categoriesById, filesById };
}

function collectEnabledSfxCues(slide: PreparedSlide): Array<{ tag: string; segmentIndex?: number }> {
  const cues: Array<{ tag: string; segmentIndex?: number }> = [];
  if (slide.sfxCue) {
    if (slide.sfxCue.enabled !== false) cues.push({ tag: trim(slide.sfxCue.tag) });
    return cues;
  }
  if (!Array.isArray(slide.sfxPlan)) return cues;
  slide.sfxPlan.forEach((item, index) => {
    if (item?.enabled === false) return;
    cues.push({ tag: trim(item?.tag), segmentIndex: index });
  });
  return cues;
}

function hasAnySfxCue(slides: PreparedSlide[]): boolean {
  return slides.some((slide) => collectEnabledSfxCues(slide).some((cue) => cue.tag.length > 0));
}

function hasAnyCharacter(input: StudioRenderPreflightInput): boolean {
  if (input.slides.some((slide) => Array.isArray(slide.characterIds) && slide.characterIds.some((id) => hasText(id)))) return true;
  const profiles = input.source.characterProfiles;
  return Array.isArray(profiles) && profiles.some((profile) => profile && typeof profile === "object");
}

function addIssue(issues: StudioRenderPreflightIssue[], issue: StudioRenderPreflightIssue): void {
  const key = [
    issue.code,
    issue.severity,
    issue.targetStep,
    issue.slideIndex ?? "",
    issue.segmentIndex ?? "",
    issue.message,
  ].join("|");
  if (issues.some((existing) => [existing.code, existing.severity, existing.targetStep, existing.slideIndex ?? "", existing.segmentIndex ?? "", existing.message].join("|") === key)) {
    return;
  }
  issues.push(issue);
}

function getEffectiveSlideVoice(input: {
  slide: PreparedSlide;
  source: Record<string, unknown>;
  selectedVoiceId: string;
}): string {
  return trim(input.slide.ttsVoiceId) || trim(input.selectedVoiceId) || trim(input.source.ttsVoiceId) || trim(input.source.narrationVoice);
}

function validateSlides(input: StudioRenderPreflightInput, routedSlides: PreparedSlide[], issues: StudioRenderPreflightIssue[]): void {
  if (input.slides.length <= 0) {
    addIssue(issues, {
      code: "slides-empty",
      severity: "blocker",
      message: "렌더할 슬라이드가 없습니다. 먼저 미리보기를 생성하세요.",
      targetStep: "script",
    });
    return;
  }

  const captionLayoutPolicy = createCaptionLayoutPolicy({
    templateId: input.templateId,
    templateData: input.templateData,
    templateImageEnabled: input.templateImageEnabled,
    templateImageLayout: input.templateImageLayout,
  });

  routedSlides.forEach((slide, slideIndex) => {
    if (!hasText(slide.text)) {
      addIssue(issues, {
        code: "slide-text-empty",
        severity: "blocker",
        message: "슬라이드 본문이 비어 있습니다.",
        slideIndex,
        targetStep: "script",
      });
    }

    const lines = normalizeLines(slide.lines);
    if (lines.length <= 0) {
      addIssue(issues, {
        code: "slide-lines-empty",
        severity: "blocker",
        message: "슬라이드 라인이 없습니다.",
        slideIndex,
        targetStep: "script",
      });
    }
    lines.forEach((line, segmentIndex) => {
      if (!line) {
        addIssue(issues, {
          code: "slide-line-empty",
          severity: "blocker",
          message: "빈 라인이 포함되어 있습니다.",
          slideIndex,
          segmentIndex,
          targetStep: "script",
        });
      } else if (!captionLineFits(line, captionLayoutPolicy)) {
        addIssue(issues, {
          code: "caption-line-overflow",
          severity: "blocker",
          message: "화면 폭 초과 · 장면 구조 다시 만들기",
          slideIndex,
          segmentIndex,
          targetStep: "script",
        });
      }
    });

    const segments = normalizeDialogueSegments(slide);
    if (segments.length > 0) {
      segments.forEach((segment, segmentIndex) => {
        if (!hasText(segment?.text)) {
          addIssue(issues, {
            code: "dialogue-segment-empty",
            severity: "blocker",
            message: "빈 대사 segment가 포함되어 있습니다.",
            slideIndex,
            segmentIndex,
            targetStep: "audio",
          });
        }
        if (!hasText(segment?.voice)) {
          addIssue(issues, {
            code: "voice-missing",
            severity: "blocker",
            message: "최종 렌더에 사용할 화자 음성이 없습니다.",
            slideIndex,
            segmentIndex,
            targetStep: "audio",
          });
        }
      });
    } else if (!getEffectiveSlideVoice({ slide, source: input.source, selectedVoiceId: input.selectedVoiceId })) {
      addIssue(issues, {
        code: "voice-missing",
        severity: "blocker",
        message: "최종 렌더에 사용할 내레이션 음성이 없습니다.",
        slideIndex,
        targetStep: "audio",
      });
    }

    if (slide.layout === "photo+body" && !hasRenderableMedia(slide)) {
      addIssue(issues, {
        code: "media-missing",
        severity: "blocker",
        message: "photo+body 슬라이드에 사용할 이미지 또는 미디어가 없습니다.",
        slideIndex,
        targetStep: "image",
      });
    }

    for (const safetyIssue of getRenderSafetyIssuesForSlide(slide)) {
      const isBlocker = BLOCKING_RENDER_SAFETY_CODES.has(safetyIssue.code);
      addIssue(issues, {
        code: `render-safety-${safetyIssue.code}`,
        severity: isBlocker ? "blocker" : "warning",
        message: safetyIssue.title,
        slideIndex,
        targetStep: "image",
      });
    }
  });
}

function validatePreviewTiming(
  input: StudioRenderPreflightInput,
  routedSlides: PreparedSlide[],
  issues: StudioRenderPreflightIssue[]
): void {
  if (!input.hasDraftVideo) {
    addIssue(issues, {
      code: "draft-video-missing",
      severity: "blocker",
      message: "렌더 확인본이 없습니다. 최종 렌더 전 확인본을 먼저 생성하세요.",
      targetStep: "review_render",
    });
  }

  if (!input.previewTiming) {
    addIssue(issues, {
      code: "preview-timing-missing",
      severity: "blocker",
      message: "미리보기 타이밍 정보가 없습니다.",
      targetStep: "caption_audio",
    });
    return;
  }

  if (
    input.previewTiming.slides.length !== routedSlides.length ||
    input.previewTiming.frameDurationsSec.length !== routedSlides.length
  ) {
    addIssue(issues, {
      code: "preview-timing-length-mismatch",
      severity: "blocker",
      message: "미리보기 타이밍과 현재 슬라이드 개수가 맞지 않습니다.",
      targetStep: "caption_audio",
    });
  }

  input.previewTiming.frameDurationsSec.forEach((duration, slideIndex) => {
    if (!Number.isFinite(Number(duration)) || Number(duration) <= 0) {
      addIssue(issues, {
        code: "preview-timing-nonpositive",
        severity: "blocker",
        message: "미리보기 프레임 길이가 0 이하입니다.",
        slideIndex,
        targetStep: "caption_audio",
      });
    }
  });

  if (
    input.previewTiming.slides.length === routedSlides.length &&
    JSON.stringify(input.previewTiming.slides.map(buildSlideTimingSignature)) !==
      JSON.stringify(routedSlides.map(buildSlideTimingSignature))
  ) {
    addIssue(issues, {
      code: "preview-timing-slide-mismatch",
      severity: "blocker",
      message: "미리보기 타이밍이 현재 슬라이드 내용과 일치하지 않습니다.",
      targetStep: "caption_audio",
    });
  }
}

function validateRenderState(input: StudioRenderPreflightInput, issues: StudioRenderPreflightIssue[]): void {
  if (input.renderNeedsRefresh) {
    addIssue(issues, {
      code: "render-stale",
      severity: "blocker",
      message: "마지막 확인본 이후 편집이 있어 다시 렌더해야 합니다.",
      targetStep: "review_render",
    });
  }
  const templateAlert = trim(input.templateRequirementAlert);
  if (templateAlert) {
    addIssue(issues, {
      code: "template-requirement",
      severity: "blocker",
      message: templateAlert,
      targetStep: "review_render",
    });
  }
  if (!input.bgmEnabled) {
    addIssue(issues, {
      code: "bgm-disabled",
      severity: "warning",
      message: "BGM이 꺼져 있습니다.",
      targetStep: "review_render",
    });
  } else if (!hasText(input.bgmPath)) {
    addIssue(issues, {
      code: "bgm-path-missing",
      severity: "blocker",
      message: "BGM이 켜져 있지만 선택한 파일을 찾을 수 없습니다. BGM을 다시 선택하세요.",
      targetStep: "caption_audio",
    });
  }
  if (!hasAnyCharacter(input)) {
    addIssue(issues, {
      code: "characters-empty",
      severity: "warning",
      message: "지정된 캐릭터가 없습니다.",
      targetStep: "image",
    });
  }
  if (input.imageApproved === false) {
    addIssue(issues, {
      code: "image-approval-required",
      severity: "blocker",
      message: "2단계 이미지 확인을 완료한 뒤 최종 렌더를 실행하세요.",
      targetStep: "image",
    });
  }
}

function validateSfx(input: StudioRenderPreflightInput, issues: StudioRenderPreflightIssue[]): void {
  if (!input.sfxEnabled) {
    addIssue(issues, {
      code: "sfx-disabled",
      severity: "warning",
      message: "효과음이 꺼져 있습니다.",
      targetStep: "caption_audio",
    });
    return;
  }

  if (!hasAnySfxCue(input.slides)) {
    addIssue(issues, {
      code: "sfx-cues-empty",
      severity: "warning",
      message: "배치된 효과음 cue가 없습니다.",
      targetStep: "caption_audio",
    });
    return;
  }

  const catalog = buildCatalog(input.sfxCategories);
  input.slides.forEach((slide, slideIndex) => {
    collectEnabledSfxCues(slide).forEach((cue) => {
      const tag = canonicalizeStudioSfxTag(cue.tag);
      if (!tag) {
        addIssue(issues, {
          code: "sfx-cue-tag-missing",
          severity: "blocker",
          message: "활성화된 효과음 cue에 tag가 없습니다.",
          slideIndex,
          segmentIndex: cue.segmentIndex,
          targetStep: "caption_audio",
        });
        return;
      }

      const exactFile = catalog.filesById.get(tag);
      if (exactFile) {
        if (!exactFile.path) {
          addIssue(issues, {
            code: "sfx-cue-file-missing",
            severity: "blocker",
            message: "효과음 cue가 참조한 파일 경로가 없습니다.",
            slideIndex,
            segmentIndex: cue.segmentIndex,
            targetStep: "caption_audio",
          });
        }
        return;
      }

      const category = catalog.categoriesById.get(tag);
      const files = Array.isArray(category?.files) ? category.files.filter((file) => trim(file?.path)) : [];
      if (!category || files.length <= 0) {
        addIssue(issues, {
          code: "sfx-cue-category-missing",
          severity: "blocker",
          message: "효과음 cue에 대응되는 카테고리 또는 파일이 없습니다.",
          slideIndex,
          segmentIndex: cue.segmentIndex,
          targetStep: "caption_audio",
        });
      }
    });
  });
}

export function buildStudioRenderPreflightSummary(input: StudioRenderPreflightInput): StudioRenderPreflightSummary {
  const routed = resolveDialogueVoiceSelectionForRender({
    selectedVoiceId: input.selectedVoiceId,
    selectedQuoteVoiceId: input.selectedQuoteVoiceId,
    selectedMaleVoiceId: input.selectedMaleVoiceId,
    selectedFemaleVoiceId: input.selectedFemaleVoiceId,
    source: input.source,
    slides: input.slides,
  });
  const issues: StudioRenderPreflightIssue[] = [];

  validateSlides(input, routed.slides, issues);
  validatePreviewTiming(input, routed.slides, issues);
  validateRenderState(input, issues);
  validateSfx(input, issues);

  const counts = {
    blocker: issues.filter((issue) => issue.severity === "blocker").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
  };

  return {
    canRenderFinal: counts.blocker === 0,
    counts,
    issues,
  };
}

export function buildStudioRenderPreflightKey(input: StudioRenderPreflightInput): string {
  const routed = resolveDialogueVoiceSelectionForRender({
    selectedVoiceId: input.selectedVoiceId,
    selectedQuoteVoiceId: input.selectedQuoteVoiceId,
    selectedMaleVoiceId: input.selectedMaleVoiceId,
    selectedFemaleVoiceId: input.selectedFemaleVoiceId,
    source: input.source,
    slides: input.slides,
  });

  const captionLayoutPolicy = createCaptionLayoutPolicy({
    templateId: input.templateId,
    templateData: input.templateData,
    templateImageEnabled: input.templateImageEnabled,
    templateImageLayout: input.templateImageLayout,
  });

  return JSON.stringify({
    voices: {
      selectedVoiceId: trim(input.selectedVoiceId),
      selectedQuoteVoiceId: trim(input.selectedQuoteVoiceId),
      selectedMaleVoiceId: trim(input.selectedMaleVoiceId),
      selectedFemaleVoiceId: trim(input.selectedFemaleVoiceId),
      source: {
        mode: trim(routed.source.mode).toLowerCase() === "dialogue" ? "dialogue" : "normal",
        ttsVoiceId: trim(routed.source.ttsVoiceId),
        narrationVoice: trim(routed.source.narrationVoice),
        quoteVoice: trim(routed.source.quoteVoice),
        speakerVoices:
          routed.source.speakerVoices && typeof routed.source.speakerVoices === "object" && !Array.isArray(routed.source.speakerVoices)
            ? Object.entries(routed.source.speakerVoices as Record<string, unknown>)
                .map(([speakerId, voiceId]) => ({ speakerId: trim(speakerId).toLowerCase(), voiceId: trim(voiceId) }))
                .filter((entry) => entry.speakerId || entry.voiceId)
                .sort((left, right) => left.speakerId.localeCompare(right.speakerId))
            : [],
      },
    },
    slides: routed.slides.map((slide) => ({
      ...buildSlideTimingSignature(slide),
      characterIds: Array.isArray(slide.characterIds) ? slide.characterIds.map((id) => trim(id)).filter(Boolean).sort() : [],
      imageBeats: normalizeImageBeatsForKey(slide),
      ...normalizeSfxCueForKey(slide),
    })),
    previewTiming: input.previewTiming
      ? {
          slides: input.previewTiming.slides.map(buildSlideTimingSignature),
          frameDurationsSec: input.previewTiming.frameDurationsSec.map((duration) => normalizeNumber(duration)),
        }
      : null,
    renderNeedsRefresh: input.renderNeedsRefresh === true,
    hasDraftVideo: input.hasDraftVideo === true,
    templateRequirementAlert: trim(input.templateRequirementAlert),
    captionLayoutPolicy,
    bgmEnabled: input.bgmEnabled === true,
    bgmPath: safeUrlForKey(input.bgmPath),
    sfxEnabled: input.sfxEnabled === true,
    imageApproved: typeof input.imageApproved === "boolean" ? input.imageApproved : undefined,
    sfxCategories: (Array.isArray(input.sfxCategories) ? input.sfxCategories : []).map((category) => ({
      id: canonicalizeStudioSfxTag(trim(category?.id)),
      files: Array.isArray(category?.files)
        ? category.files.map((file) => ({
            id: canonicalizeStudioSfxTag(trim(file?.id)),
            tag: canonicalizeStudioSfxTag(trim(file?.tag)),
            path: safeUrlForKey(file?.path),
          }))
        : [],
    })),
  });
}

export function buildStudioRenderPreflightFingerprint(input: StudioRenderPreflightInput): string {
  return `studio-render-preflight-fp-v1:${hashStudioFingerprintKey(buildStudioRenderPreflightKey(input))}`;
}

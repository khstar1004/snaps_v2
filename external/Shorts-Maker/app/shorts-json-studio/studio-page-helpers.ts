import { DEFAULT_PUBLISH_CATEGORY_OPTIONS } from "@/lib/publish/categories";
import { type ApiErrorResponse } from "@/lib/api/studio-client";
import { listDefaultTemplateBrandings, type TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeStudioCaptionCueOverrides, parseStudioCaptionCueLine } from "@/types/studio-caption";
import type { PreparedSlide, SlideSfxCue, SlideSfxPlanItem } from "@/types/studio-json";
import { buildPreparedSlideSourceIndexMap } from "./studio-prepared-slide-indexing";
import { hasInlineStudioMediaUrl, shouldPreserveSlideMediaAfterTextChange } from "./studio-media-preservation";
import type {
  LayoutRect,
  StudioImageSearchSource,
  StudioPreselectedMediaApplyMode,
  StudioPreselectedMediaItem,
  StudioTemplateId,
  StudioTemplatePayload,
  TemplateBranding,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "./types";
export type RenderUsageState = {
  ttsChars: number;
  renderSeconds: number;
};

export type CodexUsageState = {
  inputTokens: number;
  outputTokens: number;
};

export type ScriptDialogueMode = "normal" | "dialogue";
export type SpeakerVoiceEditorRow = {
  speakerId: string;
  voiceId: string;
  sampleTexts: string[];
  quoteCount: number;
  isUnknown: boolean;
};

export type DialogueSpeakerAssignmentRow = {
  slideIndex: number;
  segmentIndex: number;
  speakerId: string;
  text: string;
  slideTitle: string;
};

export type StoryCharacterProfileEditorRow = {
  characterId: string;
  displayName: string;
  identityPrompt: string;
  anchorImageUrl: string;
  anchorAssetId: string;
  sampleTexts: string[];
  isInferred: boolean;
};

export function extractImageStylePrompt(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  return String((parsed as Record<string, unknown>).imageStylePrompt || "").trim();
}

export function extractFixedCharacterProfileId(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  return String((parsed as Record<string, unknown>).fixedCharacterProfileId || "").trim();
}

export type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
};

const LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT: TemplateImageLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.08, y: 0.08, w: 0.84, h: 0.14 },
  bodySlot: { x: 0.08, y: 0.72, w: 0.84, h: 0.2 },
  imageSlot: { x: 0.08, y: 0.24, w: 0.84, h: 0.44 },
  infoSlot: { x: 0.08, y: 0.66, w: 0.84, h: 0.05 },
  headerTitleColor: "#ffffff",
  headerAccentColor: "rgba(255,255,255,0.9)",
  titleColor: "#ffffff",
  bodyColor: "#ffffff",
  infoColor: "rgba(255,255,255,0.92)",
  titleAlign: "center",
  bodyAlign: "center",
  headerSize: 17,
  titleSize: 46,
  bodySize: 26,
  infoSize: 15,
};

export const DEFAULT_TEMPLATE_IMAGE_LAYOUT: TemplateImageLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
  bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
  imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
  infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
  headerTitleColor: "#ffffff",
  headerAccentColor: "rgba(255,255,255,0.9)",
  titleColor: "#ffffff",
  bodyColor: "#ffffff",
  infoColor: "rgba(255,255,255,0.92)",
  titleAlign: "center",
  bodyAlign: "center",
  headerSize: 17,
  titleSize: 46,
  bodySize: 26,
  infoSize: 15,
};

export const DEFAULT_TEMPLATE_LAYOUT_APPLY: TemplateLayoutApply = {
  title: true,
  body: true,
  image: true,
  info: true,
};

export function fitDurationsByTail(durations: number[], total: number): number[] {
  if (!durations.length) return [];
  const safe = durations.map((d) => (Number.isFinite(d) && d > 0 ? d : 0.001));
  const sum = safe.reduce((acc, cur) => acc + cur, 0);
  const diff = total - sum;
  safe[safe.length - 1] = Math.max(0.001, safe[safe.length - 1] + diff);
  return safe;
}

export function nowMs(): number {
  if (typeof performance !== "undefined" && Number.isFinite(performance.now())) {
    return performance.now();
  }
  return Date.now();
}

export function toTimingDetail(label: string, ms: number, extra?: string): string {
  const base = `${label}_ms=${Math.max(0, Math.round(ms))}`;
  return extra ? `${base}, ${extra}` : base;
}

export function toSafeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return cleaned || "숏츠";
}

export function normalizeScriptDialogueMode(value: unknown): ScriptDialogueMode {
  return typeof value === "string" && value.trim().toLowerCase() === "dialogue" ? "dialogue" : "normal";
}

export function clearManualImagePromptsFromScriptJson(
  source: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(source.slides)) return source;
  let changed = false;
  const slides = source.slides.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(row, "manualImagePrompt")) return item;
    const { manualImagePrompt: _manualImagePrompt, ...slide } = row;
    changed = true;
    return slide;
  });
  return changed ? { ...source, slides } : source;
}

function toScriptJsonImagePromptInputSnapshot(source: unknown): unknown {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const row = source as Record<string, unknown>;
  const slides = Array.isArray(row.slides)
    ? row.slides.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const slide = item as Record<string, unknown>;
        return {
          text: slide.text,
          narrationText: slide.narrationText,
          lines: slide.lines,
          dialogueSegments: slide.dialogueSegments,
          characterIds: slide.characterIds,
        };
      })
    : row.slides;
  return {
    fixedCharacterProfileId: row.fixedCharacterProfileId,
    imageStylePrompt: row.imageStylePrompt,
    characterProfiles: row.characterProfiles,
    slides,
  };
}

export function hasScriptJsonImagePromptInputsChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(toScriptJsonImagePromptInputSnapshot(previous)) !==
    JSON.stringify(toScriptJsonImagePromptInputSnapshot(next));
}

function toScriptJsonPreparedContentSnapshot(source: unknown): unknown {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const row = source as Record<string, unknown>;
  return {
    title: row.title,
    slides: Array.isArray(row.slides)
      ? row.slides.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return item;
          const slide = item as Record<string, unknown>;
          return {
            title: slide.title,
            text: slide.text,
            narrationText: slide.narrationText,
            lines: slide.lines,
            captionCues: slide.captionCues,
            layout: slide.layout,
            ttsVoiceId: slide.ttsVoiceId,
            imageRequest: slide.imageRequest,
            imageBeats: slide.imageBeats,
            dialogueSegments: Array.isArray(slide.dialogueSegments)
              ? slide.dialogueSegments.map((segment) => {
                  if (!segment || typeof segment !== "object" || Array.isArray(segment)) return segment;
                  const dialogue = segment as Record<string, unknown>;
                  return { type: dialogue.type, text: dialogue.text };
                })
              : slide.dialogueSegments,
          };
        })
      : row.slides,
  };
}

export function hasScriptJsonPreparedContentChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(toScriptJsonPreparedContentSnapshot(previous)) !==
    JSON.stringify(toScriptJsonPreparedContentSnapshot(next));
}

function isUnknownSpeakerId(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return /^unknown_\d+$/u.test(normalized) || /^speaker_\d+$/u.test(normalized) || normalized === "unknown";
}

function normalizeSpeakerAssignmentId(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, "_").slice(0, 40);
}

function normalizeOptionalDialogueSpeed(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0.5, Math.min(2, parsed));
}

function normalizeOptionalDialoguePauseAfterMs(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(3000, Math.floor(parsed)));
}

export function extractDialogueSpeakerAssignmentRows(parsed: unknown): DialogueSpeakerAssignmentRow[] {
  if (!parsed || typeof parsed !== "object") return [];
  const row = parsed as Record<string, unknown>;
  const slides = Array.isArray(row.slides) ? row.slides : [];
  const assignments: DialogueSpeakerAssignmentRow[] = [];
  for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
    const slide = slides[slideIndex];
    if (!slide || typeof slide !== "object") continue;
    const slideRow = slide as Record<string, unknown>;
    const segments = Array.isArray(slideRow.dialogueSegments) ? slideRow.dialogueSegments : [];
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      if (!segment || typeof segment !== "object") continue;
      const segmentRow = segment as Record<string, unknown>;
      const text = String(segmentRow.text || "").trim();
      if (!text) continue;
      const type = String(segmentRow.type || "").trim().toLowerCase();
      if (type !== "quote") continue;
      assignments.push({
        slideIndex,
        segmentIndex,
        speakerId: normalizeSpeakerAssignmentId(segmentRow.speakerId),
        text,
        slideTitle: String(slideRow.title || row.title || "").trim(),
      });
    }
  }
  return assignments;
}

export function assignDialogueSegmentSpeakerInScriptJson(
  source: Record<string, unknown>,
  input: {
    slideIndex: number;
    segmentIndex: number;
    speakerId: string;
  }
): Record<string, unknown> {
  if (!Array.isArray(source.slides)) return source;
  const slideIndex = Math.floor(input.slideIndex);
  const segmentIndex = Math.floor(input.segmentIndex);
  const slide = source.slides[slideIndex];
  if (!slide || typeof slide !== "object") return source;
  const slideRow = slide as Record<string, unknown>;
  if (!Array.isArray(slideRow.dialogueSegments)) return source;
  const segment = slideRow.dialogueSegments[segmentIndex];
  if (!segment || typeof segment !== "object") return source;
  const segmentRow = segment as Record<string, unknown>;
  const nextSpeakerId = normalizeSpeakerAssignmentId(input.speakerId);
  const previousSpeakerId = normalizeSpeakerAssignmentId(segmentRow.speakerId);
  if (nextSpeakerId === previousSpeakerId && source.mode === "dialogue") return source;

  const nextSegments = slideRow.dialogueSegments.map((item, index) => {
    if (index !== segmentIndex || !item || typeof item !== "object") return item;
    const nextSegment = { ...(item as Record<string, unknown>) };
    if (nextSpeakerId) {
      nextSegment.speakerId = nextSpeakerId;
    } else {
      delete nextSegment.speakerId;
    }
    return nextSegment;
  });

  const quoteSpeakerIds = new Set<string>();
  for (const item of nextSegments) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (String(row.type || "").trim().toLowerCase() !== "quote") continue;
    const speakerId = normalizeSpeakerAssignmentId(row.speakerId);
    if (speakerId) quoteSpeakerIds.add(speakerId);
  }

  const nextCharacterIds = Array.isArray(slideRow.characterIds)
    ? slideRow.characterIds
        .map(normalizeSpeakerAssignmentId)
        .filter((characterId) => characterId && (characterId !== previousSpeakerId || quoteSpeakerIds.has(characterId)))
    : [];
  if (nextSpeakerId && !nextCharacterIds.includes(nextSpeakerId)) {
    nextCharacterIds.push(nextSpeakerId);
  }

  const nextSlide: Record<string, unknown> = {
    ...slideRow,
    dialogueSegments: nextSegments,
  };
  if (nextCharacterIds.length > 0) {
    nextSlide.characterIds = nextCharacterIds;
  } else if (Object.prototype.hasOwnProperty.call(nextSlide, "characterIds")) {
    delete nextSlide.characterIds;
  }

  return clearManualImagePromptsFromScriptJson({
    ...source,
    mode: "dialogue",
    slides: source.slides.map((item, index) => (index === slideIndex ? nextSlide : item)),
  });
}

export function extractSpeakerVoiceRows(parsed: unknown): SpeakerVoiceEditorRow[] {
  if (!parsed || typeof parsed !== "object") return [];
  const row = parsed as Record<string, unknown>;
  const speakerVoiceMap =
    row.speakerVoices && typeof row.speakerVoices === "object" && !Array.isArray(row.speakerVoices)
      ? (row.speakerVoices as Record<string, unknown>)
      : {};
  const rowsBySpeaker = new Map<
    string,
    {
      voiceId: string;
      sampleTexts: string[];
      quoteCount: number;
      isUnknown: boolean;
    }
  >();
  for (const [speakerId, voiceId] of Object.entries(speakerVoiceMap)) {
    const normalizedSpeakerId = String(speakerId || "").trim();
    const normalizedVoiceId = String(voiceId || "").trim();
    if (!normalizedSpeakerId) continue;
    rowsBySpeaker.set(normalizedSpeakerId, {
      voiceId: normalizedVoiceId,
      sampleTexts: [],
      quoteCount: 0,
      isUnknown: isUnknownSpeakerId(normalizedSpeakerId),
    });
  }
  const slides = Array.isArray(row.slides) ? row.slides : [];
  for (const slide of slides) {
    if (!slide || typeof slide !== "object") continue;
    const slideRow = slide as Record<string, unknown>;
    const segments = Array.isArray(slideRow.dialogueSegments) ? slideRow.dialogueSegments : [];
    for (const segment of segments) {
      if (!segment || typeof segment !== "object") continue;
      const segmentRow = segment as Record<string, unknown>;
      const speakerId = String(segmentRow.speakerId || "").trim();
      if (!speakerId) continue;
      const quoteText = String(segmentRow.text || "").trim();
      const type = String(segmentRow.type || "").trim().toLowerCase();
      const existing =
        rowsBySpeaker.get(speakerId) ||
        {
          voiceId: "",
          sampleTexts: [],
          quoteCount: 0,
          isUnknown: isUnknownSpeakerId(speakerId),
        };
      if (type === "quote") {
        existing.quoteCount += 1;
        if (quoteText && !existing.sampleTexts.includes(quoteText) && existing.sampleTexts.length < 3) {
          existing.sampleTexts.push(quoteText);
        }
      }
      rowsBySpeaker.set(speakerId, existing);
    }
  }
  return Array.from(rowsBySpeaker.entries())
    .map(([speakerId, value]) => ({
      speakerId,
      voiceId: value.voiceId,
      sampleTexts: value.sampleTexts,
      quoteCount: value.quoteCount,
      isUnknown: value.isUnknown,
    }))
    .sort((left, right) => {
      if (left.isUnknown !== right.isUnknown) return left.isUnknown ? -1 : 1;
      return left.speakerId.localeCompare(right.speakerId);
    });
}

export function extractStoryCharacterProfileRows(
  parsed: unknown,
  speakerRows: SpeakerVoiceEditorRow[] = []
): StoryCharacterProfileEditorRow[] {
  const rowsByCharacterId = new Map<string, StoryCharacterProfileEditorRow>();

  if (parsed && typeof parsed === "object") {
    const row = parsed as Record<string, unknown>;
    const profiles = Array.isArray(row.characterProfiles) ? row.characterProfiles : [];
    for (const item of profiles) {
      if (!item || typeof item !== "object") continue;
      const profile = item as Record<string, unknown>;
      const characterId = String(profile.characterId || "").trim();
      if (!characterId) continue;
      rowsByCharacterId.set(characterId, {
        characterId,
        displayName: String(profile.displayName || "").trim(),
        identityPrompt: String(profile.identityPrompt || "").trim(),
        anchorImageUrl: String(profile.anchorImageUrl || "").trim(),
        anchorAssetId: String(profile.anchorAssetId || "").trim(),
        sampleTexts: [],
        isInferred: false,
      });
    }
  }

  for (const speakerRow of speakerRows) {
    const characterId = String(speakerRow.speakerId || "").trim();
    if (!characterId) continue;
    const existing = rowsByCharacterId.get(characterId);
    rowsByCharacterId.set(characterId, {
      characterId,
      displayName: existing?.displayName || "",
      identityPrompt: existing?.identityPrompt || "",
      anchorImageUrl: existing?.anchorImageUrl || "",
      anchorAssetId: existing?.anchorAssetId || "",
      sampleTexts: speakerRow.sampleTexts || [],
      isInferred: !existing,
    });
  }

  return Array.from(rowsByCharacterId.values()).sort((left, right) => left.characterId.localeCompare(right.characterId));
}

export function revokeIfBlobUrl(url: string | null): void {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function toSafeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeGeneratedStudioJsonDraft(input: unknown, fallbackTitle: string): { json: Record<string, unknown>; repaired: boolean } {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const title = toSafeText(row.title) || toSafeText(fallbackTitle) || "자동 생성 쇼츠";
  const sourceSlides = Array.isArray(row.slides)
    ? row.slides
    : Array.isArray(row.scenes)
      ? row.scenes
      : Array.isArray(row.items)
        ? row.items
        : [];
  let repaired = false;
  const slides = sourceSlides
    .map((item): Record<string, unknown> | null => {
      if (!item) return null;
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;
        repaired = true;
        return { text, lines: [text] };
      }
      if (typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const rawLines = Array.isArray(source.lines) ? source.lines.map((line) => toSafeText(line)).filter(Boolean) : [];
      const text = toSafeText(source.text) || toSafeText(source.narrationText) || rawLines.join("\n") || toSafeText(source.body);
      if (!text && rawLines.length <= 0) return null;
      const lines = rawLines.length > 0 ? rawLines : text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const next: Record<string, unknown> = {
        text: text || lines.join("\n"),
        lines: lines.length > 0 ? lines : [text || "내용 없음"],
      };
      if ("title" in source || "layout" in source) repaired = true;
      if (toSafeText(source.narrationText)) next.narrationText = toSafeText(source.narrationText);
      if (toSafeText(source.ttsVoiceId)) next.ttsVoiceId = toSafeText(source.ttsVoiceId);
      if (Array.isArray(source.dialogueSegments)) next.dialogueSegments = source.dialogueSegments;
      const directImageUrl = toSafeText(source.imageUrl) || toSafeText(source.resolvedImageUrl);
      if (directImageUrl) next.imageUrl = directImageUrl;
      if (toSafeText(source.mediaUrl)) next.mediaUrl = toSafeText(source.mediaUrl);
      if (toSafeText(source.mediaKind)) next.mediaKind = toSafeText(source.mediaKind);
      if (source.imageRequest && typeof source.imageRequest === "object") next.imageRequest = source.imageRequest;
      if (Array.isArray(source.imageBeats)) next.imageBeats = source.imageBeats;
      if (Array.isArray(source.sfxPlan)) next.sfxPlan = source.sfxPlan;
      if (source.sfxCue && typeof source.sfxCue === "object") next.sfxCue = source.sfxCue;
      return next;
    })
    .filter((item): item is Record<string, unknown> => Boolean(item));
  if (slides.length <= 0) {
    repaired = true;
    const fallbackText = toSafeText(row.script) || toSafeText(row.body) || toSafeText(row.text) || "요약 내용을 입력해 주세요.";
    slides.push({
      text: fallbackText,
      lines: fallbackText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    });
  }
  const normalized: Record<string, unknown> = {
    title,
    slides,
  };
  if (row.mode === "dialogue" || row.mode === "normal") normalized.mode = row.mode;
  if (toSafeText(row.narrationVoice)) normalized.narrationVoice = toSafeText(row.narrationVoice);
  if (toSafeText(row.quoteVoice)) normalized.quoteVoice = toSafeText(row.quoteVoice);
  if (row.speakerVoices && typeof row.speakerVoices === "object") normalized.speakerVoices = row.speakerVoices;
  return { json: normalized, repaired };
}

export function sanitizeRect(input: unknown, fallback: LayoutRect): LayoutRect {
  if (!input || typeof input !== "object") return fallback;
  const row = input as Record<string, unknown>;
  const x = clamp01(Number(row.x));
  const y = clamp01(Number(row.y));
  const w = Math.max(0.05, Math.min(1, Number(row.w)));
  const h = Math.max(0.04, Math.min(1, Number(row.h)));
  return {
    x,
    y,
    w: Math.min(1 - x, w),
    h: Math.min(1 - y, h),
  };
}

export function isSameRectInput(input: unknown, target: LayoutRect): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return Number(row.x) === target.x && Number(row.y) === target.y && Number(row.w) === target.w && Number(row.h) === target.h;
}

export function isLegacyGenericTemplateImageLayout(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return (
    isSameRectInput(row.titleSlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.titleSlot) &&
    isSameRectInput(row.bodySlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.bodySlot) &&
    isSameRectInput(row.imageSlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.imageSlot) &&
    isSameRectInput(row.infoSlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.infoSlot)
  );
}

export function isLegacyDefaultNewsTemplateImageLayout(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return (
    isSameRectInput(row.headerTitleSlot, { x: 0.09, y: 0.018, w: 0.42, h: 0.04 }) &&
    isSameRectInput(row.headerAccentSlot, { x: 0.62, y: 0.018, w: 0.28, h: 0.04 }) &&
    isSameRectInput(row.titleSlot, { x: 0.09, y: 0.1, w: 0.82, h: 0.07 }) &&
    isSameRectInput(row.bodySlot, { x: 0.09, y: 0.25, w: 0.82, h: 0.18 }) &&
    isSameRectInput(row.imageSlot, { x: 0.09, y: 0.47, w: 0.82, h: 0.38 }) &&
    isSameRectInput(row.infoSlot, { x: 0.09, y: 0.175, w: 0.82, h: 0.035 })
  );
}

export function serializeTemplateLayoutForEditor(layout: TemplateImageLayout): string {
  const { imageSlot: _imageSlot, ...editableLayout } = layout;
  return JSON.stringify(editableLayout, null, 2);
}

export function normalizeTemplateImageLayout(input: unknown): TemplateImageLayout {
  const baseRow = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const row = isLegacyGenericTemplateImageLayout(input) || isLegacyDefaultNewsTemplateImageLayout(input)
    ? {
        ...baseRow,
        headerTitleSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleSlot,
        headerAccentSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentSlot,
        titleSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot,
        bodySlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot,
        imageSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.imageSlot,
        infoSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot,
      }
    : baseRow;
  const titleAlign = row.titleAlign === "left" || row.titleAlign === "right" ? row.titleAlign : "center";
  const bodyAlign = row.bodyAlign === "left" || row.bodyAlign === "right" ? row.bodyAlign : "center";
  const legacyInfoSize = Math.max(8, Math.min(24, Number(row.infoSize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSize));
  return {
    headerTitleSlot: sanitizeRect(row.headerTitleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleSlot),
    headerAccentSlot: sanitizeRect(row.headerAccentSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentSlot),
    titleSlot: sanitizeRect(row.titleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot),
    bodySlot: sanitizeRect(row.bodySlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot),
    imageSlot: sanitizeRect(row.imageSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.imageSlot),
    infoSlot: sanitizeRect(row.infoSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot),
    headerTitleColor:
      typeof row.headerTitleColor === "string" && row.headerTitleColor.trim()
        ? row.headerTitleColor.trim()
        : DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleColor,
    headerAccentColor:
      typeof row.headerAccentColor === "string" && row.headerAccentColor.trim()
        ? row.headerAccentColor.trim()
        : DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentColor,
    titleColor: typeof row.titleColor === "string" && row.titleColor.trim() ? row.titleColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleColor,
    bodyColor: typeof row.bodyColor === "string" && row.bodyColor.trim() ? row.bodyColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodyColor,
    infoColor: typeof row.infoColor === "string" && row.infoColor.trim() ? row.infoColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoColor,
    titleAlign,
    bodyAlign,
    headerSize: Math.max(10, Math.min(32, Number(row.headerSize) || legacyInfoSize + 2)),
    titleSize: Math.max(10, Math.min(52, Number(row.titleSize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSize)),
    bodySize: Math.max(9, Math.min(36, Number(row.bodySize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySize)),
    infoSize: legacyInfoSize,
    headerTitleWeight: normalizeOptionalFontWeight(row.headerTitleWeight),
    headerAccentWeight: normalizeOptionalFontWeight(row.headerAccentWeight),
    titleWeight: normalizeOptionalFontWeight(row.titleWeight),
    bodyWeight: normalizeOptionalFontWeight(row.bodyWeight),
    infoWeight: normalizeOptionalFontWeight(row.infoWeight),
  };
}

export function layoutRectStyle(rect: LayoutRect) {
  return {
    position: "absolute" as const,
    left: `${(rect.x * 100).toFixed(4)}%`,
    top: `${(rect.y * 100).toFixed(4)}%`,
    width: `${(rect.w * 100).toFixed(4)}%`,
    height: `${(rect.h * 100).toFixed(4)}%`,
  };
}

export function normalizeTemplateLayoutApply(input: unknown): TemplateLayoutApply {
  if (!input || typeof input !== "object") return DEFAULT_TEMPLATE_LAYOUT_APPLY;
  const row = input as Record<string, unknown>;
  return {
    title: typeof row.title === "boolean" ? row.title : true,
    body: typeof row.body === "boolean" ? row.body : true,
    image: typeof row.image === "boolean" ? row.image : true,
    info: typeof row.info === "boolean" ? row.info : true,
  };
}

export function normalizeOptionalFontWeight(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(100, Math.min(900, Math.round(parsed / 100) * 100));
}

export function measureTextWidth(text: string, fontPx: number, fontWeight: number): number {
  if (typeof document === "undefined") return text.length * fontPx;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * fontPx;
  ctx.font = `${fontWeight} ${fontPx}px "Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif`;
  return ctx.measureText(text).width;
}

export function fitTitleFontSizePx(text: string, maxWidth: number, basePx: number, minPx: number, fontWeight: number): number {
  if (!text.trim()) return basePx;
  const safeWidth = Math.max(1, maxWidth - 16);
  let size = basePx;
  while (size > minPx && measureTextWidth(text, size, fontWeight) > safeWidth) {
    size -= 1;
  }
  return size;
}

export function applyPublishTitleToSlides(slides: PreparedSlide[], publishTitle: string): PreparedSlide[] {
  const nextTitle = String(publishTitle || "").trim();
  if (!nextTitle) return slides;
  let changed = false;
  const nextSlides = slides.map((slide) => {
    if (String(slide.title || "").trim() === nextTitle) {
      return slide;
    }
    changed = true;
    return {
      ...slide,
      title: nextTitle,
    };
  });
  return changed ? nextSlides : slides;
}

export function toEventDetailFromApiError(data: ApiErrorResponse, fallback: string): string {
  const code = typeof data.errorCode === "string" ? data.errorCode.trim() : "";
  const message = (data.error || "").trim() || fallback;
  return code ? `${code}: ${message}` : message;
}

export function getLinkedSlideIndexes(slides: PreparedSlide[], index: number): Set<number> {
  const target = slides[index];
  if (!target) return new Set<number>();
  const linked = new Set<number>([index]);
  const targetGroupId = typeof target.groupId === "number" && Number.isFinite(target.groupId) ? target.groupId : null;
  const targetImageVariantId = String(target.imageVariantId || "").trim();
  if (targetGroupId !== null && targetImageVariantId) {
    for (let i = 0; i < slides.length; i += 1) {
      const row = slides[i];
      if (
        typeof row.groupId === "number" &&
        Number.isFinite(row.groupId) &&
        row.groupId === targetGroupId &&
        String(row.imageVariantId || "").trim() === targetImageVariantId
      ) {
        linked.add(i);
      }
    }
    return linked;
  }
  if (targetGroupId !== null) {
    for (let i = 0; i < slides.length; i += 1) {
      const row = slides[i];
      if (typeof row.groupId === "number" && Number.isFinite(row.groupId) && row.groupId === targetGroupId) {
        linked.add(i);
      }
    }
    return linked;
  }

  const targetTitle = String(target.title || "").trim();
  const targetLayout = String(target.layout || "").trim();
  const targetQuery = String(target.imageRequest?.query || "").trim();
  if (!targetTitle && !targetQuery) return linked;

  for (let i = 0; i < slides.length; i += 1) {
    if (i === index) continue;
    const row = slides[i];
    const sameTitle = String(row.title || "").trim() === targetTitle;
    const sameLayout = String(row.layout || "").trim() === targetLayout;
    const sameQuery = String(row.imageRequest?.query || "").trim() === targetQuery;
    if (sameLayout && (sameTitle || (targetQuery && sameQuery))) {
      linked.add(i);
    }
  }
  return linked;
}

export function hydrateRenderedSlidesWithPrepared(renderedSlides: PreparedSlide[], sourceSlides: PreparedSlide[]): PreparedSlide[] {
  if (renderedSlides.length <= 0 || sourceSlides.length <= 0) return renderedSlides;
  const byGroup = new Map<number, PreparedSlide>();
  const byGroupStep = new Map<string, PreparedSlide>();
  for (let i = 0; i < sourceSlides.length; i += 1) {
    const slide = sourceSlides[i];
    const groupId = Number.isFinite(slide.groupId) ? Number(slide.groupId) : i;
    if (!byGroup.has(groupId)) {
      byGroup.set(groupId, slide);
    }
    if (Number.isFinite(slide.groupId) && Number.isFinite(slide.stepIndex)) {
      byGroupStep.set(`${Number(slide.groupId)}:${Number(slide.stepIndex)}`, slide);
    }
  }
  return renderedSlides.map((slide, index) => {
    const source =
      (Number.isFinite(slide.groupId) && Number.isFinite(slide.stepIndex)
        ? byGroupStep.get(`${Number(slide.groupId)}:${Number(slide.stepIndex)}`)
        : undefined) ||
      (Number.isFinite(slide.groupId) ? byGroup.get(Number(slide.groupId)) : undefined) ||
      sourceSlides[index];
    if (!source) return slide;
    const hydrated = {
      ...source,
      ...slide,
    };
    if (slide.imageUrl && (slide.mediaUrl || slide.mediaKind || !source.mediaUrl)) {
      return hydrated;
    }
    if (!source.imageUrl) return hydrated;
    return {
      ...hydrated,
      narrationText: slide.narrationText || source.narrationText,
      ttsVoiceId: slide.ttsVoiceId || source.ttsVoiceId,
      captionCues: slide.captionCues || source.captionCues,
      manualImagePrompt: slide.manualImagePrompt || source.manualImagePrompt,
      imageUrl: slide.imageUrl || source.imageUrl,
      mediaUrl: slide.mediaUrl || source.mediaUrl,
      mediaKind: slide.mediaKind || source.mediaKind,
      imageVariantId: slide.imageVariantId || source.imageVariantId,
      imageVariantStartLineIndex:
        Number.isFinite(slide.imageVariantStartLineIndex) ? slide.imageVariantStartLineIndex : source.imageVariantStartLineIndex,
    };
  });
}

export { hasInlineStudioMediaUrl } from "./studio-media-preservation";

export function hasManualPreparedMedia(slide: PreparedSlide | undefined): boolean {
  return shouldPreserveSlideMediaAfterTextChange(slide);
}

export function mergePreparedSlidesPreservingManualMedia(preparedSlides: PreparedSlide[], currentSlides: PreparedSlide[]): PreparedSlide[] {
  if (preparedSlides.length <= 0 || currentSlides.length <= 0) return preparedSlides;
  const currentSourceIndexes = buildPreparedSlideSourceIndexMap(currentSlides);
  const preparedSourceIndexes = buildPreparedSlideSourceIndexMap(preparedSlides);
  const bySourceStep = new Map<string, PreparedSlide>();
  for (let index = 0; index < currentSlides.length; index += 1) {
    const slide = currentSlides[index];
    if (!hasManualPreparedMedia(slide)) continue;
    const sourceIndex = currentSourceIndexes[index] ?? index;
    const stepIndex = Number.isFinite(slide.stepIndex) ? Math.max(0, Math.floor(Number(slide.stepIndex))) : 0;
    bySourceStep.set(`${sourceIndex}:${stepIndex}`, slide);
  }
  return preparedSlides.map((slide, index) => {
    const sourceIndex = preparedSourceIndexes[index] ?? index;
    const stepIndex = Number.isFinite(slide.stepIndex) ? Math.max(0, Math.floor(Number(slide.stepIndex))) : 0;
    const source = bySourceStep.get(`${sourceIndex}:${stepIndex}`);
    if (!source || !hasManualPreparedMedia(source)) return slide;
    const preserveAsDirect =
      source.resolvedBy === "direct" ||
      hasInlineStudioMediaUrl(source.imageUrl || null) ||
      hasInlineStudioMediaUrl(source.mediaUrl || null);
    return {
      ...slide,
      manualImagePrompt: slide.manualImagePrompt || source.manualImagePrompt,
      imageUrl: source.imageUrl || slide.imageUrl,
      mediaUrl: source.mediaUrl || slide.mediaUrl,
      mediaKind: source.mediaKind || slide.mediaKind,
      resolvedImageUrl: source.resolvedImageUrl || source.imageUrl || slide.resolvedImageUrl,
      resolvedBy: preserveAsDirect ? "direct" : slide.resolvedBy,
      imageSelection: source.imageSelection,
      imageBeats: undefined,
    };
  });
}

function hasPreparedSfx(slide: PreparedSlide | undefined): slide is PreparedSlide {
  if (!slide) return false;
  const hasPlan = Array.isArray(slide.sfxPlan) && slide.sfxPlan.length > 0;
  const hasCue = Boolean(slide.sfxCue && String(slide.sfxCue.tag || "").trim());
  return hasPlan || hasCue;
}

function resolveManualSfxCue(slide: PreparedSlide | undefined): SlideSfxCue | undefined {
  const explicitTag = String(slide?.sfxCue?.tag || "").trim();
  if (slide?.sfxCue?.source === "manual" && explicitTag) return slide.sfxCue;
  const stepIndex = Number.isFinite(slide?.stepIndex) ? Math.max(0, Math.floor(Number(slide?.stepIndex))) : 0;
  const planned = (slide?.sfxPlan || []).find(
    (item) => item.source === "manual" && Number(item.lineIndex) === stepIndex && String(item.tag || "").trim()
  );
  if (!planned) return undefined;
  return {
    enabled: planned.enabled !== false,
    tag: planned.tag,
    gainDb: planned.gainDb,
    offsetMs: planned.offsetMs,
    source: "manual",
  };
}

export function mergePreparedSlidesPreservingSfx(preparedSlides: PreparedSlide[], currentSlides: PreparedSlide[]): PreparedSlide[] {
  if (preparedSlides.length <= 0 || currentSlides.length <= 0) return preparedSlides;
  const currentSourceIndexes = buildPreparedSlideSourceIndexMap(currentSlides);
  const preparedSourceIndexes = buildPreparedSlideSourceIndexMap(preparedSlides);
  const bySourceStep = new Map<string, PreparedSlide>();
  for (let index = 0; index < currentSlides.length; index += 1) {
    const slide = currentSlides[index];
    if (!hasPreparedSfx(slide)) continue;
    const sourceIndex = currentSourceIndexes[index] ?? index;
    const stepIndex = Number.isFinite(slide.stepIndex) ? Math.max(0, Math.floor(Number(slide.stepIndex))) : 0;
    bySourceStep.set(`${sourceIndex}:${stepIndex}`, slide);
  }

  return preparedSlides.map((slide, index) => {
    const sourceIndex = preparedSourceIndexes[index] ?? index;
    const stepIndex = Number.isFinite(slide.stepIndex) ? Math.max(0, Math.floor(Number(slide.stepIndex))) : 0;
    const source = bySourceStep.get(`${sourceIndex}:${stepIndex}`);
    if (!hasPreparedSfx(source)) return slide;

    const manualCue = resolveManualSfxCue(source);
    if (manualCue) {
      return {
        ...slide,
        sfxCue: manualCue,
        manualImagePrompt: slide.manualImagePrompt || source.manualImagePrompt,
      };
    }

    const hasOwnPlan = Array.isArray(slide.sfxPlan) && slide.sfxPlan.length > 0;
    const hasOwnCue = Boolean(slide.sfxCue && String(slide.sfxCue.tag || "").trim());
    if (hasOwnPlan || hasOwnCue) return slide;
    return slide;
  });
}

export function pickPreparePayloadBase(parsed: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeGeneratedStudioJsonDraft(parsed, String(parsed.title || "").trim()).json;
  const next: Record<string, unknown> = {};
  const title = String(normalized.title || "").trim();
  if (title) next.title = title;
  const mode = normalizeScriptDialogueMode(normalized.mode);
  if (mode) next.mode = mode;

  const optionalStringKeys = [
    "ttsSourceText",
    "ttsVoiceId",
    "narrationVoice",
    "quoteVoice",
    "imagePlannerHint",
    "imageStylePrompt",
    "fixedCharacterProfileId",
  ] as const;
  for (const key of optionalStringKeys) {
    const value = String(parsed[key] || "").trim();
    if (value) next[key] = value;
  }

  if (parsed.speakerVoices && typeof parsed.speakerVoices === "object" && !Array.isArray(parsed.speakerVoices)) {
    next.speakerVoices = parsed.speakerVoices;
  }
  if (Array.isArray(parsed.characterProfiles)) {
    next.characterProfiles = parsed.characterProfiles;
  }
  if (parsed.imageSearchTuning && typeof parsed.imageSearchTuning === "object" && !Array.isArray(parsed.imageSearchTuning)) {
    next.imageSearchTuning = parsed.imageSearchTuning;
  }
  if (Array.isArray(parsed.sfxCategories)) {
    next.sfxCategories = parsed.sfxCategories;
  }
  if (typeof parsed.sfxAutoLevel === "string" && parsed.sfxAutoLevel.trim()) {
    next.sfxAutoLevel = parsed.sfxAutoLevel.trim();
  }
  return next;
}

export function applyStudioImageSearchSourceToPreparePayload(
  parsed: Record<string, unknown>,
  imageSearchSource: StudioImageSearchSource
): Record<string, unknown> {
  const normalizeMinReviewCandidatesPerProvider = (value: unknown): number => {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) return 3;
    return Math.max(3, Math.min(50, Math.floor(parsedValue)));
  };
  const currentTuning =
    parsed.imageSearchTuning && typeof parsed.imageSearchTuning === "object" && !Array.isArray(parsed.imageSearchTuning)
      ? (parsed.imageSearchTuning as Record<string, unknown>)
      : {};
  return {
    ...parsed,
    imageSearchTuning: {
      ...currentTuning,
      maxCandidatesPerProvider: normalizeMinReviewCandidatesPerProvider(currentTuning.maxCandidatesPerProvider),
      providers: ["giphy", "naver"],
      giphyLibraryOnly: imageSearchSource === "library",
    },
  };
}

export function toPrepareCompatibleSlidePayload(slide: PreparedSlide): Record<string, unknown> {
  return {
    text: slide.text,
    narrationText: slide.narrationText,
    ttsVoiceId: slide.ttsVoiceId,
    dialogueSegments: slide.dialogueSegments,
    lines: slide.lines,
    captionCues: slide.captionCues,
    imageUrl: slide.imageUrl || slide.resolvedImageUrl,
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
    groupId: slide.groupId,
    stepIndex: slide.stepIndex,
    sfxPlan: slide.sfxPlan,
    sfxCue: slide.sfxCue,
  };
}

function toRenderCompatibleImageBeats(value: PreparedSlide["imageBeats"]): PreparedSlide["imageBeats"] {
  if (!Array.isArray(value) || value.length <= 0) return undefined;
  const beats: NonNullable<PreparedSlide["imageBeats"]> = [];
  for (const beat of value) {
    if (!beat || typeof beat !== "object") continue;
    const beatId = String(beat.beatId || "").trim();
    if (!beatId) continue;
    beats.push({
      beatId,
      startLineIndex: Number.isFinite(beat.startLineIndex) ? Number(beat.startLineIndex) : 0,
      clearVisual: beat.clearVisual === true ? true : undefined,
      imageUrl: hasInlineStudioMediaUrl(beat.imageUrl) ? undefined : beat.imageUrl,
      resolvedImageUrl: hasInlineStudioMediaUrl(beat.resolvedImageUrl) ? undefined : beat.resolvedImageUrl,
      resolvedBy: beat.resolvedBy,
      imageSelection: beat.imageSelection,
      mediaUrl: hasInlineStudioMediaUrl(beat.mediaUrl) ? undefined : beat.mediaUrl,
      mediaKind: beat.mediaKind,
      imageRequest: beat.imageRequest,
      reason: beat.reason,
    });
  }
  return beats.length > 0 ? beats : undefined;
}

export function toRenderCompatibleSlidePayload(slide: PreparedSlide): Record<string, unknown> {
  return {
    title: slide.title,
    text: slide.text,
    narrationText: slide.narrationText,
    ttsVoiceId: slide.ttsVoiceId,
    dialogueSegments: slide.dialogueSegments,
    characterIds: slide.characterIds,
    lines: slide.lines,
    captionCues: slide.captionCues,
    layout: slide.layout,
    imageUrl: hasInlineStudioMediaUrl(slide.imageUrl) ? undefined : slide.imageUrl,
    resolvedImageUrl: hasInlineStudioMediaUrl(slide.resolvedImageUrl) ? undefined : slide.resolvedImageUrl,
    resolvedBy: slide.resolvedBy,
    imageSelection: slide.imageSelection,
    mediaUrl: hasInlineStudioMediaUrl(slide.mediaUrl) ? undefined : slide.mediaUrl,
    mediaKind: slide.mediaKind,
    imageRequest: slide.imageRequest,
    imageBeats: toRenderCompatibleImageBeats(slide.imageBeats),
    imageVariantId: slide.imageVariantId,
    imageVariantStartLineIndex: slide.imageVariantStartLineIndex,
    groupId: slide.groupId,
    stepIndex: slide.stepIndex,
    sfxPlan: slide.sfxPlan,
    sfxCue: slide.sfxCue,
  };
}

function resolveRenderVisualSlideMergeKey(slide: PreparedSlide, index: number): string {
  const groupKey = Number.isFinite(slide.groupId) ? `group:${Number(slide.groupId)}` : `slide:${index}`;
  const variantId = String(slide.imageVariantId || "").trim();
  if (variantId) return `${groupKey}|variant:${variantId}`;
  const mediaKind = String(slide.mediaKind || "").trim() || "none";
  const imageUrl = String(slide.imageUrl || "").trim();
  const mediaUrl = String(slide.mediaUrl || "").trim();
  return `${groupKey}|media:${mediaKind}:${mediaUrl || imageUrl || "empty"}`;
}

export function toServerRenderVisualSlides(slides: PreparedSlide[]): PreparedSlide[] {
  let previousMergeKey = "";
  return slides.map((slide, index) => {
    const mergeKey = resolveRenderVisualSlideMergeKey(slide, index);
    const repeatedInlineMedia = mergeKey === previousMergeKey;
    previousMergeKey = mergeKey;
    return {
      title: slide.title,
      text: slide.text,
    narrationText: slide.narrationText,
    dialogueSegments: slide.dialogueSegments,
    characterIds: slide.characterIds,
    lines: Array.isArray(slide.lines) ? slide.lines : [],
      captionCues: Array.isArray(slide.captionCues) ? slide.captionCues : undefined,
      ttsVoiceId: slide.ttsVoiceId,
      layout: slide.layout,
      imageUrl: repeatedInlineMedia && hasInlineStudioMediaUrl(slide.imageUrl) ? undefined : slide.imageUrl,
      mediaUrl: repeatedInlineMedia && hasInlineStudioMediaUrl(slide.mediaUrl) ? undefined : slide.mediaUrl,
      mediaKind: slide.mediaKind,
      imageVariantId: slide.imageVariantId,
      imageVariantStartLineIndex: slide.imageVariantStartLineIndex,
      groupId: slide.groupId,
      stepIndex: slide.stepIndex,
    };
  });
}

export function toSfxPlanCompatibleSlidePayload(slide: PreparedSlide): Record<string, unknown> {
  return {
    text: slide.text,
    narrationText: slide.narrationText,
    ttsVoiceId: slide.ttsVoiceId,
    dialogueSegments: slide.dialogueSegments,
    lines: slide.lines,
    groupId: slide.groupId,
    stepIndex: slide.stepIndex,
    sfxPlan: slide.sfxPlan,
    sfxCue: slide.sfxCue,
  };
}

export function normalizeScriptJsonSlideLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => String(line || "").trim()).filter(Boolean);
}

export function normalizeScriptJsonDialogueSegments(value: unknown): PreparedSlide["dialogueSegments"] {
  if (!Array.isArray(value)) return undefined;
  const segments = value
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const row = segment as Record<string, unknown>;
      const text = String(row.text || "").trim();
      if (!text) return null;
      const speed = normalizeOptionalDialogueSpeed(row.speed);
      const pauseAfterMs = normalizeOptionalDialoguePauseAfterMs(row.pauseAfterMs);
      return {
        type: String(row.type || "").trim().toLowerCase() === "quote" ? "quote" : "narration",
        text,
        speakerId: typeof row.speakerId === "string" ? row.speakerId.trim() || undefined : undefined,
        voice: typeof row.voice === "string" ? row.voice.trim() || undefined : undefined,
        ...(speed !== undefined ? { speed } : {}),
        ...(pauseAfterMs !== undefined ? { pauseAfterMs } : {}),
      } as NonNullable<PreparedSlide["dialogueSegments"]>[number];
    })
    .filter((segment): segment is NonNullable<PreparedSlide["dialogueSegments"]>[number] => Boolean(segment));
  return segments.length > 0 ? segments : undefined;
}

function normalizeScriptJsonSfxPlan(value: unknown): PreparedSlide["sfxPlan"] {
  if (!Array.isArray(value)) return undefined;
  const plan: NonNullable<PreparedSlide["sfxPlan"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const rawLineIndex = Number(row.lineIndex);
    const tag = String(row.tag || "").trim().slice(0, 40);
    if (!Number.isFinite(rawLineIndex) || !tag) continue;
    const gainDb = Number(row.gainDb);
    const offsetMs = Number(row.offsetMs);
    const source = row.source === "manual" || row.source === "auto" ? row.source : undefined;
    plan.push({
      lineIndex: Math.max(0, Math.floor(rawLineIndex)),
      ...(typeof row.enabled === "boolean" ? { enabled: row.enabled } : {}),
      tag,
      ...(Number.isFinite(gainDb) ? { gainDb: Math.max(-24, Math.min(12, gainDb)) } : {}),
      ...(Number.isFinite(offsetMs) ? { offsetMs: Math.max(-1200, Math.min(1200, Math.floor(offsetMs))) } : {}),
      ...(source ? { source } : {}),
    });
    if (plan.length >= 8) break;
  }
  return plan.length > 0 ? plan : undefined;
}

function normalizeScriptJsonSfxCue(value: unknown): PreparedSlide["sfxCue"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const tag = String(row.tag || "").trim().slice(0, 40);
  if (!tag) return undefined;
  const gainDb = Number(row.gainDb);
  const offsetMs = Number(row.offsetMs);
  const source = row.source === "manual" || row.source === "auto" ? row.source : undefined;
  return {
    enabled: row.enabled !== false,
    tag,
    ...(Number.isFinite(gainDb) ? { gainDb: Math.max(-24, Math.min(12, gainDb)) } : {}),
    ...(Number.isFinite(offsetMs) ? { offsetMs: Math.max(-1200, Math.min(1200, Math.floor(offsetMs))) } : {}),
    ...(source ? { source } : {}),
  };
}

export function normalizeScriptJsonSlidesPayload(input: unknown): Array<Partial<PreparedSlide>> {
  if (!Array.isArray(input)) return [];
  return input
    .map((slide): Partial<PreparedSlide> | null => {
      if (!slide || typeof slide !== "object") return null;
      const row = slide as Record<string, unknown>;
      const text = String(row.text || "").trim();
      const lines = normalizeScriptJsonSlideLines(row.lines);
      const captionCues = Array.isArray(row.captionCues) && row.captionCues.length > 0
        ? row.captionCues
            .map((cue) => {
              if (!cue || typeof cue !== "object") return null;
              const cueRow = cue as Record<string, unknown>;
              const cueText = String(cueRow.text || "").trim();
              if (!cueText) return null;
              return {
                text: cueText,
                overrides: normalizeStudioCaptionCueOverrides(cueRow.overrides),
              };
            })
            .filter((cue): cue is NonNullable<PreparedSlide["captionCues"]>[number] => Boolean(cue))
        : lines.length > 0
          ? lines.map((line) => parseStudioCaptionCueLine(line))
          : undefined;
      const title = String(row.title || "").trim();
      return {
        title,
        text: text || lines.join(" ").trim(),
        lines: lines.length > 0 ? lines : [text].filter(Boolean),
        captionCues,
        layout: row.layout === "body-only" ? "body-only" : "photo+body",
        narrationText: typeof row.narrationText === "string" ? row.narrationText.trim() || undefined : undefined,
        ttsVoiceId: typeof row.ttsVoiceId === "string" ? row.ttsVoiceId.trim() || undefined : undefined,
        dialogueSegments: normalizeScriptJsonDialogueSegments(row.dialogueSegments),
        characterIds: Array.isArray(row.characterIds)
          ? row.characterIds.map((item) => String(item || "").trim()).filter(Boolean)
          : undefined,
        imageUrl: typeof row.imageUrl === "string" ? row.imageUrl.trim() || undefined : undefined,
        resolvedImageUrl: typeof row.resolvedImageUrl === "string" ? row.resolvedImageUrl.trim() || undefined : undefined,
        resolvedBy:
          row.resolvedBy === "direct" || row.resolvedBy === "crawl" || row.resolvedBy === "fallback"
            ? row.resolvedBy
            : undefined,
        imageSelection:
          row.imageSelection && typeof row.imageSelection === "object" && !Array.isArray(row.imageSelection)
            ? (row.imageSelection as PreparedSlide["imageSelection"])
            : undefined,
        mediaUrl: typeof row.mediaUrl === "string" ? row.mediaUrl.trim() || undefined : undefined,
        mediaKind:
          row.mediaKind === "image" || row.mediaKind === "video" || row.mediaKind === "animated_image"
            ? row.mediaKind
            : undefined,
        imageRequest: row.imageRequest && typeof row.imageRequest === "object" ? (row.imageRequest as PreparedSlide["imageRequest"]) : undefined,
        manualImagePrompt:
          row.manualImagePrompt && typeof row.manualImagePrompt === "object"
            ? (row.manualImagePrompt as PreparedSlide["manualImagePrompt"])
            : undefined,
        imageBeats: Array.isArray(row.imageBeats) ? (row.imageBeats as PreparedSlide["imageBeats"]) : undefined,
        imageVariantId: typeof row.imageVariantId === "string" ? row.imageVariantId.trim() || undefined : undefined,
        imageVariantStartLineIndex: Number.isFinite(row.imageVariantStartLineIndex) ? Number(row.imageVariantStartLineIndex) : undefined,
        groupId: Number.isFinite(row.groupId) ? Number(row.groupId) : undefined,
        stepIndex: Number.isFinite(row.stepIndex) ? Number(row.stepIndex) : undefined,
        sfxPlan: normalizeScriptJsonSfxPlan(row.sfxPlan),
        sfxCue: normalizeScriptJsonSfxCue(row.sfxCue),
      } satisfies Partial<PreparedSlide>;
    })
    .filter((slide): slide is Partial<PreparedSlide> => Boolean(slide?.text && Array.isArray(slide.lines) && slide.lines.length > 0));
}

export function syncPreparedSlideCharactersFromScriptJson(
  currentSlides: PreparedSlide[],
  nextJson: Record<string, unknown>
): PreparedSlide[] {
  const sourceSlides = normalizeScriptJsonSlidesPayload(nextJson.slides);
  const sourceIndexMap = buildPreparedSlideSourceIndexMap(currentSlides);
  return currentSlides.map((slide, index) => {
    const sourceIndex = sourceIndexMap[index] ?? index;
    const sourceSlide = sourceSlides[sourceIndex];
    const {
      manualImagePrompt: _manualImagePrompt,
      characterIds: _characterIds,
      dialogueSegments: _dialogueSegments,
      ...rest
    } = slide;
    const nextCharacterIds = Array.isArray(sourceSlide?.characterIds)
      ? Array.from(new Set(sourceSlide.characterIds.map((value) => String(value || "").trim()).filter(Boolean)))
      : [];
    const nextDialogueSegments = Array.isArray(sourceSlide?.dialogueSegments)
      ? sourceSlide.dialogueSegments
      : undefined;
    return {
      ...rest,
      ...(nextDialogueSegments ? { dialogueSegments: nextDialogueSegments } : {}),
      ...(nextCharacterIds.length > 0 ? { characterIds: nextCharacterIds } : {}),
    };
  });
}

export function syncPreparedSlideDialogueSegmentsFromScriptJson(
  currentSlides: PreparedSlide[],
  nextJson: Record<string, unknown>
): PreparedSlide[] {
  const sourceSlides = normalizeScriptJsonSlidesPayload(nextJson.slides);
  const sourceIndexMap = buildPreparedSlideSourceIndexMap(currentSlides);
  return currentSlides.map((slide, index) => {
    const sourceIndex = sourceIndexMap[index] ?? index;
    const nextDialogueSegments = sourceSlides[sourceIndex]?.dialogueSegments;
    const { dialogueSegments: _dialogueSegments, ...rest } = slide;
    return Array.isArray(nextDialogueSegments) && nextDialogueSegments.length > 0
      ? { ...rest, dialogueSegments: nextDialogueSegments }
      : rest;
  });
}

function buildTextOnlyManualVisualState(currentFrames: PreparedSlide[]): {
  base?: PreparedSlide;
  imageBeats?: PreparedSlide["imageBeats"];
} {
  const frames = currentFrames
    .slice()
    .sort(
      (left, right) =>
        (Number.isFinite(left.stepIndex) ? Number(left.stepIndex) : 0) -
        (Number.isFinite(right.stepIndex) ? Number(right.stepIndex) : 0)
    );
  if (frames.length <= 0) return {};
  const manualFrame = (frame: PreparedSlide): PreparedSlide | undefined =>
    shouldPreserveSlideMediaAfterTextChange(frame) ? frame : undefined;
  const signature = (frame: PreparedSlide | undefined): string =>
    frame
      ? JSON.stringify({
          imageUrl: frame.imageUrl || "",
          resolvedImageUrl: frame.resolvedImageUrl || "",
          mediaUrl: frame.mediaUrl || "",
          mediaKind: frame.mediaKind || "",
          selectedCandidateId: frame.imageSelection?.selectedCandidateId || "",
        })
      : "empty";
  const base = manualFrame(frames[0]);
  let previousSignature = signature(base);
  const imageBeats: NonNullable<PreparedSlide["imageBeats"]> = [];
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const manual = manualFrame(frame);
    const nextSignature = signature(manual);
    if (nextSignature === previousSignature) continue;
    previousSignature = nextSignature;
    const startLineIndex = Number.isFinite(frame.stepIndex)
      ? Math.max(0, Math.floor(Number(frame.stepIndex)))
      : frameIndex;
    imageBeats.push(
      manual
        ? {
            beatId: String(manual.imageVariantId || "").trim() || `manual:${startLineIndex}`,
            startLineIndex,
            imageUrl: manual.imageUrl,
            resolvedImageUrl: manual.resolvedImageUrl || manual.imageUrl,
            resolvedBy: manual.resolvedBy,
            imageSelection: manual.imageSelection,
            mediaUrl: manual.mediaUrl,
            mediaKind: manual.mediaKind,
            reason: "preserved manual visual after text change",
          }
        : {
            beatId: `clear:${startLineIndex}`,
            startLineIndex,
            clearVisual: true,
            reason: "clear previous manual visual after text change",
          }
    );
    if (imageBeats.length >= 2) break;
  }
  return { base, imageBeats: imageBeats.length > 0 ? imageBeats : undefined };
}

export function mergeSlidesPreservingMedia(currentSlides: PreparedSlide[], nextJson: Record<string, unknown>): PreparedSlide[] {
  const nextTitle = String(nextJson.title || "").trim();
  const nextSlides = normalizeScriptJsonSlidesPayload(nextJson.slides);
  const sourceIndexMap = buildPreparedSlideSourceIndexMap(currentSlides);
  const currentBySourceIndex = new Map<number, PreparedSlide[]>();
  currentSlides.forEach((slide, slideIndex) => {
    const sourceIndex = sourceIndexMap[slideIndex] ?? slideIndex;
    const bucket = currentBySourceIndex.get(sourceIndex) || [];
    bucket.push(slide);
    currentBySourceIndex.set(sourceIndex, bucket);
  });
  return nextSlides.map((nextSlide, index) => {
    const currentFrames = currentBySourceIndex.get(index) || (currentSlides[index] ? [currentSlides[index]] : []);
    const current = currentFrames[0];
    const manualVisualState = buildTextOnlyManualVisualState(currentFrames);
    const mediaSource = manualVisualState.base;
    const isGrouped = currentFrames.length > 1 || currentFrames.some((slide) => Number.isFinite(slide.groupId));
    const manualPlanByLine = new Map<number, SlideSfxPlanItem>();
    for (const frame of currentFrames) {
      for (const item of frame.sfxPlan || []) {
        if (item.source !== "manual" || !String(item.tag || "").trim()) continue;
        const lineIndex = Math.max(0, Math.floor(Number(item.lineIndex) || 0));
        manualPlanByLine.set(lineIndex, { ...item, lineIndex, source: "manual" });
      }
      const cue = resolveManualSfxCue(frame);
      if (!cue) continue;
      const lineIndex = Number.isFinite(frame.stepIndex) ? Math.max(0, Math.floor(Number(frame.stepIndex))) : 0;
      manualPlanByLine.set(lineIndex, {
        lineIndex,
        enabled: cue.enabled !== false,
        tag: cue.tag,
        gainDb: cue.gainDb,
        offsetMs: cue.offsetMs,
        source: "manual",
      });
    }
    const manualCue = isGrouped ? undefined : resolveManualSfxCue(current);
    const manualPlan = isGrouped
      ? Array.from(manualPlanByLine.values()).sort((left, right) => left.lineIndex - right.lineIndex)
      : (current?.sfxPlan || []).filter((item) => item.source === "manual");
    return {
      ...(current || {}),
      ...nextSlide,
      title: nextTitle || nextSlide.title || current?.title || "자동 생성 쇼츠",
      groupId: undefined,
      stepIndex: undefined,
      imageUrl: mediaSource?.imageUrl,
      resolvedImageUrl: mediaSource?.resolvedImageUrl || mediaSource?.imageUrl,
      resolvedBy: mediaSource?.resolvedBy,
      imageSelection: mediaSource?.imageSelection,
      mediaUrl: mediaSource?.mediaUrl,
      mediaKind: mediaSource?.mediaKind,
      imageRequest: nextSlide.imageRequest,
      manualImagePrompt: nextSlide.manualImagePrompt,
      imageBeats: manualVisualState.imageBeats || nextSlide.imageBeats,
      imageVariantId: nextSlide.imageVariantId,
      imageVariantStartLineIndex: nextSlide.imageVariantStartLineIndex,
      sfxPlan: manualPlan.length > 0 ? manualPlan : undefined,
      sfxCue: manualCue,
    } as PreparedSlide;
  });
}

type PreselectedMediaAssignment = {
  itemId: string;
  slideIndex: number;
};

export function buildSpreadAssignmentIndexes(slideIndexes: number[], itemCount: number): number[] {
  if (slideIndexes.length <= 0 || itemCount <= 0) return [];
  const assignmentCount = Math.min(slideIndexes.length, itemCount);
  const indexes: number[] = [];
  let lastPosition = -1;
  for (let index = 0; index < assignmentCount; index += 1) {
    const remaining = assignmentCount - index;
    const minPosition = lastPosition + 1;
    const maxPosition = slideIndexes.length - remaining;
    const idealPosition =
      assignmentCount === 1 ? 0 : Math.round((index * Math.max(0, slideIndexes.length - 1)) / Math.max(1, assignmentCount - 1));
    const position = Math.max(minPosition, Math.min(maxPosition, idealPosition));
    indexes.push(slideIndexes[position]);
    lastPosition = position;
  }
  return indexes;
}

export function getParsedSlideCount(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0;
  const row = parsed as Record<string, unknown>;
  return Array.isArray(row.slides) ? row.slides.length : 0;
}

export function buildPreselectedMediaAssignments(
  slideCount: number,
  items: StudioPreselectedMediaItem[],
  applyMode: StudioPreselectedMediaApplyMode
): PreselectedMediaAssignment[] {
  if (slideCount <= 0 || items.length <= 0) return [];
  const fixedAssignments: PreselectedMediaAssignment[] = [];
  const fixedTargets = new Set<number>();
  const autoItems: StudioPreselectedMediaItem[] = [];
  for (const item of items) {
    const targetSlideIndex = Number.isFinite(item.targetSlideIndex) ? Number(item.targetSlideIndex) : null;
    if (targetSlideIndex !== null && targetSlideIndex >= 0 && targetSlideIndex < slideCount && !fixedTargets.has(targetSlideIndex)) {
      fixedAssignments.push({ itemId: item.id, slideIndex: targetSlideIndex });
      fixedTargets.add(targetSlideIndex);
      continue;
    }
    autoItems.push(item);
  }
  const availableSlideIndexes = Array.from({ length: slideCount }, (_, index) => index).filter((index) => !fixedTargets.has(index));
  if (autoItems.length <= 0) {
    return fixedAssignments.sort((left, right) => left.slideIndex - right.slideIndex);
  }
  if (applyMode === "cycle-all") {
    const cycledAssignments = availableSlideIndexes.map((slideIndex, index) => ({
      itemId: autoItems[index % autoItems.length].id,
      slideIndex,
    }));
    return [...fixedAssignments, ...cycledAssignments].sort((left, right) => left.slideIndex - right.slideIndex);
  }
  const spreadSlideIndexes = buildSpreadAssignmentIndexes(availableSlideIndexes, autoItems.length);
  return [
    ...fixedAssignments,
    ...spreadSlideIndexes.map((slideIndex, index) => ({
      itemId: autoItems[index].id,
      slideIndex,
    })),
  ].sort((left, right) => left.slideIndex - right.slideIndex);
}

export function getPreselectedMediaValidationMessage(input: {
  slideCount: number;
  items: StudioPreselectedMediaItem[];
  applyMode: StudioPreselectedMediaApplyMode;
}): string {
  if (input.items.length <= 0) return "";
  if (input.slideCount <= 0) {
    return "미리 선택 미디어를 배치하려면 먼저 유효한 JSON slides가 필요합니다.";
  }

  const usedTargets = new Map<number, string>();
  let fixedCount = 0;
  for (const item of input.items) {
    if (!Number.isFinite(item.targetSlideIndex)) continue;
    const targetSlideIndex = Number(item.targetSlideIndex);
    if (targetSlideIndex < 0 || targetSlideIndex >= input.slideCount) {
      return `${item.title} 미디어의 고정 슬라이드가 현재 JSON 범위를 벗어났습니다.`;
    }
    if (usedTargets.has(targetSlideIndex)) {
      return `${targetSlideIndex + 1}번 슬라이드에 미디어가 두 개 이상 고정되어 있습니다.`;
    }
    usedTargets.set(targetSlideIndex, item.id);
    fixedCount += 1;
  }

  const autoCount = input.items.length - fixedCount;
  const availableSlideCount = input.slideCount - fixedCount;
  if (autoCount > availableSlideCount) {
    return `자동 배치 미디어 ${autoCount}개를 모두 쓰려면 비어 있는 slides가 ${autoCount}개 필요합니다. 현재 ${availableSlideCount}개만 남아 있습니다.`;
  }
  return "";
}

export function applyPreselectedMediaToParsed(
  parsed: Record<string, unknown>,
  items: StudioPreselectedMediaItem[],
  assignments: PreselectedMediaAssignment[]
): Record<string, unknown> {
  if (items.length <= 0 || assignments.length <= 0 || !Array.isArray(parsed.slides)) {
    return parsed;
  }
  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  const assignmentsBySlide = new Map<number, StudioPreselectedMediaItem>();
  for (const assignment of assignments) {
    const item = itemsById.get(assignment.itemId);
    if (!item) continue;
    assignmentsBySlide.set(assignment.slideIndex, item);
  }
  if (assignmentsBySlide.size <= 0) {
    return parsed;
  }
  return {
    ...parsed,
    slides: parsed.slides.map((slide, index) => {
      if (!slide || typeof slide !== "object") return slide;
      const item = assignmentsBySlide.get(index);
      if (!item) return slide;
      return {
        ...(slide as Record<string, unknown>),
        imageUrl: item.imageUrl,
        mediaUrl: item.mediaUrl || undefined,
        mediaKind: item.mediaKind || undefined,
        imageBeats: undefined,
      };
    }),
  };
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.trim()) {
        reject(new Error("파일을 읽지 못했습니다."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

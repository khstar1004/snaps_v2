"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioVoicePicker } from "@/components/studio-voice-picker";
import { buildImageSelectionCandidateReactKey } from "@/lib/studio/image-selection-candidates";
import { selectVisibleStudioImageCandidates } from "@/lib/studio/image-candidate-approval";
import { captionLineFits, createCaptionLayoutPolicy } from "@/lib/studio/caption-layout";
import { getRenderSafetyIssuesForSlide } from "@/lib/studio/render-safety";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import type { CharacterProfile } from "@/types/character-profile";
import type { ImageSelectionCandidate, ImageSource, PreparedSlide, SfxTag } from "@/types/studio-json";
import type { StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import type { StudioVoiceOption } from "../use-studio-bootstrap-data";
import {
  resolveStudioSfxPreviewSelections,
  type StudioSfxPreviewSelection,
} from "../studio-sfx-preview-helpers";
import {
  applyStudioCaptionAutoMetadata,
  normalizeStudioCaptionCueOverrides,
  STUDIO_CAPTION_AUTO_CUE_TAG_OPTIONS,
  parseStudioCaptionCueLine,
  STUDIO_CAPTION_ANIMATION_PRESET_OPTIONS,
  STUDIO_CAPTION_EXIT_PRESET_OPTIONS,
  STUDIO_CAPTION_STYLE_PRESET_OPTIONS,
  type StudioCaptionCueOverrides,
} from "@/types/studio-caption";
import type { StudioTemplateId, StudioTemplatePayload, TemplateImageLayout } from "../types";
import {
  buildStudioPreviewSlideGroups,
  clampStudioPreviewSelectedSlideIndex,
  getStudioPreviewGroupNavigationState,
  resolveStudioPreviewEditorState,
  shouldShowStudioPreviewEditorTabs,
  type StudioPreviewEditorTab,
} from "../studio-preview-panel-helpers";
import { StudioManualImagePromptPanel } from "./studio-manual-image-prompt-panel";
import { StudioSlideAssetPicker } from "./studio-slide-asset-picker";

const CAPTION_CUE_PRESET_STORAGE_KEY = "studio-caption-cue-presets-v1";

type StudioPreviewPanelProps = {
  title: string;
  slides: PreparedSlide[];
  warnings: string[];
  hasPreparedSlides: boolean;
  imageSource: ImageSource;
  publishCategory: PublishCategory;
  categoryMetadata?: PublishMetadata | null;
  fixedCharacterProfile?: CharacterProfile;
  imageStylePrompt?: string;
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageLayout: TemplateImageLayout;
  busy: boolean;
  isJsonValid: boolean;
  showPrepareAction?: boolean;
  prepareButtonLabel: string;
  prepareDisabledReason?: string;
  imageOnlyEditMode?: boolean;
  panelHeading?: string;
  initialEditorTab?: StudioPreviewEditorTab;
  visibleEditorTabs?: readonly StudioPreviewEditorTab[];
  selectedSlideGroupIndex?: number;
  onSelectedSlideGroupIndexChangeAction?: (index: number) => void;
  advanceButtonLabel?: string;
  readOnly?: boolean;
  permissionMessage?: string;
  onAdvanceToRenderAction?: () => void;
  onPrepareAction: () => void;
  onTitleChangeAction: (value: string) => void;
  onSlideTitleChangeAction?: (index: number, value: string) => void;
  onSlideImageUrlChange: (index: number, value: string) => void;
  onSlideImageFileChange: (index: number, file: File | null) => Promise<void>;
  onSlideLibraryAssetApplyAction: (
    index: number,
    asset: {
      imageUrl: string;
      mediaUrl?: string;
      mediaKind?: PreparedSlide["mediaKind"];
      assetId?: string;
      title?: string;
    }
  ) => void;
  onSlideImageCandidateApplyAction: (index: number, candidate: ImageSelectionCandidate) => void;
  onSlideNarrationTextChange: (index: number, value: string) => void;
  onSlideVoiceChangeAction: (index: number, value: string) => void;
  onSlideSplitAction?: (index: number) => void;
  onSlideMergeWithNextAction?: (index: number) => void;
  onSlideDuplicateAction?: (index: number) => void;
  onSlideDeleteAction: (index: number) => void;
  onSlideAddAction: (index: number) => void;
  onSlideVoicePreviewAction: (index: number) => void;
  onSlideSfxCueChange: (index: number, cue: { enabled: boolean; tag: SfxTag; gainDb?: number; offsetMs?: number; source?: "auto" | "manual" } | null) => void;
  onSlideSfxReplanAction?: (index: number) => Promise<void>;
  sfxCategories: StudioSfxCategoryOption[];
  sfxEnabled?: boolean;
  selectedVoiceId: string;
  voiceOptions: StudioVoiceOption[];
  renderSlidePreview: (slide: PreparedSlide, index: number) => ReactNode;
};

type SlideVisualization = {
  groupIndex: number;
  frameIndex: number;
  frameCount: number;
  variantIndex: number;
  variantCount: number;
  variantStartLineNumber: number | null;
};

type EditableCaptionCue = {
  text: string;
  overrides: StudioCaptionCueOverrides;
};

type StoredCaptionCuePreset = {
  id: string;
  name: string;
  createdAt: string;
  overrides: StudioCaptionCueOverrides;
};

type StudioSfxPreviewPlayback = {
  slideIndex: number;
  selection: StudioSfxPreviewSelection;
  status: "loading" | "playing";
};

function getVisualizationGroupKey(slide: PreparedSlide, index: number): string {
  return typeof slide.groupId === "number" && Number.isFinite(slide.groupId) ? `group:${slide.groupId}` : `slide:${index}`;
}

function buildPreviewVisualization(slides: PreparedSlide[]): {
  totalOriginalSlides: number;
  totalFrames: number;
  totalImageVariants: number;
  perSlide: SlideVisualization[];
} {
  const groupOrder: string[] = [];
  const groupMap = new Map<
    string,
    {
      groupIndex: number;
      frameCount: number;
      variantIds: string[];
    }
  >();

  slides.forEach((slide, index) => {
    const groupKey = getVisualizationGroupKey(slide, index);
    let entry = groupMap.get(groupKey);
    if (!entry) {
      entry = {
        groupIndex: groupOrder.length + 1,
        frameCount: 0,
        variantIds: [],
      };
      groupMap.set(groupKey, entry);
      groupOrder.push(groupKey);
    }
    entry.frameCount += 1;
    const variantId = String(slide.imageVariantId || "").trim() || `${groupKey}:0`;
    if (!entry.variantIds.includes(variantId)) {
      entry.variantIds.push(variantId);
    }
  });

  const perSlide = slides.map((slide, index) => {
    const groupKey = getVisualizationGroupKey(slide, index);
    const entry = groupMap.get(groupKey);
    const variantId = String(slide.imageVariantId || "").trim() || `${groupKey}:0`;
    const variantIndex = entry ? Math.max(0, entry.variantIds.indexOf(variantId)) + 1 : 1;
    return {
      groupIndex: entry?.groupIndex || index + 1,
      frameIndex: Number.isFinite(slide.stepIndex) ? Number(slide.stepIndex) + 1 : 1,
      frameCount: entry?.frameCount || 1,
      variantIndex,
      variantCount: entry?.variantIds.length || 1,
      variantStartLineNumber:
        typeof slide.imageVariantStartLineIndex === "number" && Number.isFinite(slide.imageVariantStartLineIndex)
          ? Number(slide.imageVariantStartLineIndex) + 1
          : null,
    } satisfies SlideVisualization;
  });

  return {
    totalOriginalSlides: groupOrder.length,
    totalFrames: slides.length,
    totalImageVariants: Array.from(groupMap.values()).reduce((sum, entry) => sum + entry.variantIds.length, 0),
    perSlide,
  };
}

function getEditableCaptionCues(slide: PreparedSlide): EditableCaptionCue[] {
  if (Array.isArray(slide.captionCues) && slide.captionCues.length > 0) {
    return slide.captionCues.map((cue) => ({
      text: String(cue.text || ""),
      overrides: normalizeStudioCaptionCueOverrides(cue.overrides),
    }));
  }
  const sourceLines =
    Array.isArray(slide.lines) && slide.lines.length > 0
      ? slide.lines.map((line) => String(line || ""))
      : String(slide.text || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
  const parsed = sourceLines.map((line) => parseStudioCaptionCueLine(line));
  return parsed.length > 0 ? parsed : [{ text: "", overrides: {} }];
}

function serializeCaptionCue(cue: EditableCaptionCue): string {
  const text = String(cue.text || "").trim();
  const tokens: string[] = [];
  if (cue.overrides.style) tokens.push(`style=${cue.overrides.style}`);
  if (cue.overrides.animation) tokens.push(`anim=${cue.overrides.animation}`);
  if (cue.overrides.exitAnimation) tokens.push(`exit=${cue.overrides.exitAnimation}`);
  if (cue.overrides.autoTag) tokens.push(`tag=${cue.overrides.autoTag}`);
  if (typeof cue.overrides.emphasis === "number") tokens.push(`em=${cue.overrides.emphasis}`);
  if (Array.isArray(cue.overrides.highlightWords) && cue.overrides.highlightWords.length > 0) {
    tokens.push(`hl=${cue.overrides.highlightWords.join("|")}`);
  }
  if (typeof cue.overrides.scale === "number") tokens.push(`scale=${cue.overrides.scale}`);
  if (typeof cue.overrides.durationSec === "number") tokens.push(`dur=${cue.overrides.durationSec}`);
  if (cue.overrides.color) tokens.push(`color=${cue.overrides.color}`);
  if (cue.overrides.strokeColor) tokens.push(`stroke=${cue.overrides.strokeColor}`);
  if (typeof cue.overrides.strokeWidth === "number") tokens.push(`strokeWidth=${cue.overrides.strokeWidth}`);
  if (typeof cue.overrides.glow === "number") tokens.push(`glow=${cue.overrides.glow}`);
  if (cue.overrides.align) tokens.push(`align=${cue.overrides.align}`);
  if (typeof cue.overrides.y === "number") tokens.push(`y=${cue.overrides.y}`);
  if (cue.overrides.background) tokens.push(`bg=${cue.overrides.background}`);
  if (!tokens.length) return text;
  return `${text} || ${tokens.join(" ")}`.trim();
}

function serializeCaptionCues(cues: EditableCaptionCue[]): string {
  return cues
    .map((cue) => serializeCaptionCue(cue))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function buildCueTabLabel(cue: EditableCaptionCue, cueIndex: number): string {
  const compact = String(cue.text || "").replace(/\s+/g, " ").trim();
  if (!compact) return `줄 ${cueIndex + 1}`;
  const preview = compact.length > 10 ? `${compact.slice(0, 10)}...` : compact;
  return `줄 ${cueIndex + 1} · ${preview}`;
}

function resolveVoiceLabel(voiceId: string, voiceOptions: StudioVoiceOption[]): string {
  const safeVoiceId = String(voiceId || "").trim();
  if (!safeVoiceId) return "기본 음성";
  const matched = voiceOptions.find((voice) => voice.id === safeVoiceId);
  return matched?.label || safeVoiceId;
}

function renderSelectionCandidatePreview(candidate: ImageSelectionCandidate): ReactNode {
  if (candidate.mediaKind === "video" && candidate.mediaUrl) {
    return (
      <video className="studio-slide-candidate-thumb" src={candidate.mediaUrl} muted loop autoPlay playsInline preload="metadata" />
    );
  }
  return (
    <img
      className="studio-slide-candidate-thumb"
      src={candidate.imageUrl}
      alt={candidate.title || candidate.query || candidate.candidateId}
      loading="lazy"
    />
  );
}

function getCandidateProviderLabel(candidate: ImageSelectionCandidate): string {
  if (candidate.provider === "library") return "라이브러리";
  if (candidate.provider === "giphy") return "GIPHY";
  return candidate.provider;
}

function CaptionCuePresetControls({
  cue,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: {
  cue: EditableCaptionCue;
  presets: StoredCaptionCuePreset[];
  onSavePreset: (name: string, overrides: StudioCaptionCueOverrides) => void;
  onApplyPreset: (overrides: StudioCaptionCueOverrides) => void;
  onDeletePreset: (presetId: string) => void;
}) {
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) || null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "0.65rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)" }}>줄 스타일 프리셋</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input-field"
          style={{ flex: 1, minWidth: 150 }}
          placeholder="예: 핑크 후킹"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const trimmed = presetName.trim();
            if (!trimmed) return;
            onSavePreset(trimmed, cue.overrides);
            setPresetName("");
          }}
        >
          현재 줄 저장
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ flex: 1, minWidth: 180 }}
          value={selectedPresetId}
          onChange={(event) => setSelectedPresetId(event.target.value)}
        >
          <option value="">저장된 줄 프리셋 선택</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selectedPreset}
          onClick={() => {
            if (!selectedPreset) return;
            onApplyPreset(selectedPreset.overrides);
          }}
        >
          적용
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selectedPreset}
          onClick={() => {
            if (!selectedPreset) return;
            onDeletePreset(selectedPreset.id);
            setSelectedPresetId("");
          }}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

export function StudioPreviewPanel({
  title,
  slides,
  warnings,
  hasPreparedSlides,
  imageSource,
  publishCategory,
  categoryMetadata,
  fixedCharacterProfile,
  imageStylePrompt,
  templateId,
  templateData,
  templateImageEnabled,
  templateImageLayout,
  busy,
  isJsonValid,
  showPrepareAction = true,
  prepareButtonLabel,
  prepareDisabledReason,
  imageOnlyEditMode = false,
  panelHeading = "2. 미리보기",
  initialEditorTab = "image",
  visibleEditorTabs,
  selectedSlideGroupIndex: controlledSelectedSlideGroupIndex,
  onSelectedSlideGroupIndexChangeAction,
  advanceButtonLabel = "렌더 단계로 이동",
  readOnly = false,
  permissionMessage,
  onAdvanceToRenderAction,
  onPrepareAction,
  onTitleChangeAction,
  onSlideTitleChangeAction,
  onSlideImageUrlChange,
  onSlideImageFileChange,
  onSlideLibraryAssetApplyAction,
  onSlideImageCandidateApplyAction,
  onSlideNarrationTextChange,
  onSlideVoiceChangeAction,
  onSlideSplitAction,
  onSlideMergeWithNextAction,
  onSlideDuplicateAction,
  onSlideDeleteAction,
  onSlideAddAction,
  onSlideVoicePreviewAction,
  onSlideSfxCueChange,
  onSlideSfxReplanAction,
  sfxCategories,
  sfxEnabled = true,
  selectedVoiceId,
  voiceOptions,
  renderSlidePreview,
}: StudioPreviewPanelProps) {
  const [savedCuePresets, setSavedCuePresets] = useState<StoredCaptionCuePreset[]>([]);
  const [activeCueBySlide, setActiveCueBySlide] = useState<Record<number, number>>({});
  const [activeEditorTabBySlide, setActiveEditorTabBySlide] = useState<Record<number, StudioPreviewEditorTab>>({});
  const [uncontrolledSelectedSlideGroupIndex, setUncontrolledSelectedSlideGroupIndex] = useState(0);
  const [sfxPreviewPlayback, setSfxPreviewPlayback] = useState<StudioSfxPreviewPlayback | null>(null);
  const [sfxPreviewError, setSfxPreviewError] = useState<{ slideIndex: number; message: string } | null>(null);
  const [sfxReplanningBySlide, setSfxReplanningBySlide] = useState<Record<number, boolean>>({});
  const sfxPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const visualization = useMemo(() => buildPreviewVisualization(slides), [slides]);
  const slideGroups = useMemo(() => buildStudioPreviewSlideGroups(slides), [slides]);
  const selectedSlideGroupIndex = Number.isInteger(controlledSelectedSlideGroupIndex)
    ? Math.max(0, Number(controlledSelectedSlideGroupIndex))
    : uncontrolledSelectedSlideGroupIndex;
  const setSelectedSlideGroupIndex = useCallback(
    (resolve: number | ((current: number) => number)) => {
      const next = typeof resolve === "function" ? resolve(selectedSlideGroupIndex) : resolve;
      const normalized = Math.max(0, Math.floor(Number(next) || 0));
      if (!Number.isInteger(controlledSelectedSlideGroupIndex)) {
        setUncontrolledSelectedSlideGroupIndex(normalized);
      }
      if (normalized !== selectedSlideGroupIndex) {
        onSelectedSlideGroupIndexChangeAction?.(normalized);
      }
    },
    [controlledSelectedSlideGroupIndex, onSelectedSlideGroupIndexChangeAction, selectedSlideGroupIndex]
  );
  const visibleWarnings = useMemo(
    () =>
      Array.from(
        new Set(
          warnings
            .map((warning) => String(warning || "").trim())
            .filter(Boolean)
        )
      ),
    [warnings],
  );
  const renderSafetyIssuesBySlide = useMemo(
    () => slides.map((slide) => getRenderSafetyIssuesForSlide(slide)),
    [slides],
  );
  const renderSafetyIssueCount = useMemo(
    () => renderSafetyIssuesBySlide.reduce((total, issues) => total + issues.length, 0),
    [renderSafetyIssuesBySlide],
  );
  const captionOverflowBySlide = useMemo(() => {
    const policy = createCaptionLayoutPolicy({
      templateId,
      templateData,
      templateImageEnabled,
      templateImageLayout,
    });
    return slides.map((slide) =>
      (Array.isArray(slide.lines) ? slide.lines : []).filter(
        (line) => String(line || "").trim() && !captionLineFits(String(line), policy),
      ),
    );
  }, [slides, templateData, templateId, templateImageEnabled, templateImageLayout]);
  const sfxPreviewSelections = useMemo(
    () => resolveStudioSfxPreviewSelections(slides, sfxCategories, sfxEnabled),
    [sfxCategories, sfxEnabled, slides],
  );

  const stopSfxPreview = useCallback(() => {
    const currentAudio = sfxPreviewAudioRef.current;
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.removeAttribute("src");
      currentAudio.load();
    }
    sfxPreviewAudioRef.current = null;
    setSfxPreviewPlayback(null);
  }, []);

  const playSfxPreview = useCallback(
    async (slideIndex: number) => {
      const selection = sfxPreviewSelections[slideIndex] || null;
      stopSfxPreview();
      setSfxPreviewError(null);
      if (!selection) {
        setSfxPreviewError({ slideIndex, message: "선택한 효과음 파일을 찾지 못했습니다." });
        return;
      }

      const audio = new Audio(selection.path);
      audio.preload = "auto";
      audio.volume = selection.previewVolume;
      sfxPreviewAudioRef.current = audio;
      setSfxPreviewPlayback({ slideIndex, selection, status: "loading" });
      audio.onended = () => {
        if (sfxPreviewAudioRef.current !== audio) return;
        sfxPreviewAudioRef.current = null;
        setSfxPreviewPlayback(null);
      };
      audio.onerror = () => {
        if (sfxPreviewAudioRef.current !== audio) return;
        sfxPreviewAudioRef.current = null;
        setSfxPreviewPlayback(null);
        setSfxPreviewError({ slideIndex, message: "효과음 파일을 재생하지 못했습니다." });
      };
      try {
        await audio.play();
        if (sfxPreviewAudioRef.current === audio) {
          setSfxPreviewPlayback({ slideIndex, selection, status: "playing" });
        }
      } catch (error) {
        if (sfxPreviewAudioRef.current === audio) {
          sfxPreviewAudioRef.current = null;
          setSfxPreviewPlayback(null);
          setSfxPreviewError({
            slideIndex,
            message: error instanceof Error ? error.message : "효과음 파일을 재생하지 못했습니다.",
          });
        }
      }
    },
    [sfxPreviewSelections, stopSfxPreview],
  );

  const replanSlideSfx = useCallback(
    async (slideIndex: number) => {
      if (readOnly || busy || !onSlideSfxReplanAction || sfxReplanningBySlide[slideIndex]) return;
      stopSfxPreview();
      setSfxReplanningBySlide((current) => ({ ...current, [slideIndex]: true }));
      try {
        await onSlideSfxReplanAction(slideIndex);
      } finally {
        setSfxReplanningBySlide((current) => {
          const next = { ...current };
          delete next[slideIndex];
          return next;
        });
      }
    },
    [busy, onSlideSfxReplanAction, readOnly, sfxReplanningBySlide, stopSfxPreview],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAPTION_CUE_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredCaptionCuePreset[];
      if (Array.isArray(parsed)) {
        setSavedCuePresets(
          parsed
            .filter((item) => item && typeof item === "object" && typeof item.id === "string")
            .map((item) => ({
              ...item,
              overrides: normalizeStudioCaptionCueOverrides(item.overrides),
            })),
        );
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const next = clampStudioPreviewSelectedSlideIndex(selectedSlideGroupIndex, slideGroups.length);
    if (next !== selectedSlideGroupIndex) setSelectedSlideGroupIndex(next);
  }, [selectedSlideGroupIndex, setSelectedSlideGroupIndex, slideGroups.length]);

  useEffect(() => {
    stopSfxPreview();
  }, [sfxPreviewSelections, stopSfxPreview]);

  useEffect(() => {
    return () => {
      const currentAudio = sfxPreviewAudioRef.current;
      if (!currentAudio) return;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.removeAttribute("src");
    };
  }, []);

  const persistCuePresets = (next: StoredCaptionCuePreset[]) => {
    const normalized = next.map((preset) => ({
      ...preset,
      overrides: normalizeStudioCaptionCueOverrides(preset.overrides),
    }));
    setSavedCuePresets(normalized);
    try {
      window.localStorage.setItem(CAPTION_CUE_PRESET_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      return;
    }
  };
  const isFunCaptionTemplate = templateId === "fun-caption";
  const navigationState = getStudioPreviewGroupNavigationState(selectedSlideGroupIndex, slideGroups.length);
  const activeSlideGroupIndex = navigationState.activeGroupIndex;
  const activeSlideGroup = slideGroups[activeSlideGroupIndex] || null;
  const activeGroupSlides = useMemo(
    () =>
      (activeSlideGroup?.indexes || [])
        .map((index) => ({ index, slide: slides[index] }))
        .filter((item): item is { index: number; slide: PreparedSlide } => Boolean(item.slide)),
    [activeSlideGroup, slides],
  );
  const canMovePrevGroup = navigationState.canMovePrevGroup;
  const canMoveNextGroup = navigationState.canMoveNextGroup;
  const canAdvanceToRender = navigationState.shouldAdvanceToRender && typeof onAdvanceToRenderAction === "function";

  return (
    <section className="studio-preview-panel-shell">
      <div className="studio-preview-panel-head">
        <h2 className="studio-preview-panel-title">{panelHeading}</h2>
        {showPrepareAction ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={onPrepareAction}
            disabled={readOnly || busy || !isJsonValid || Boolean(prepareDisabledReason)}
            title={prepareDisabledReason || undefined}
          >
            {busy ? "작업 중..." : prepareButtonLabel}
          </button>
        ) : null}
      </div>
      {readOnly && permissionMessage ? (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "#1d4ed8",
            padding: "10px 12px",
            border: "1px solid #bfdbfe",
            borderRadius: "var(--radius-md)",
            background: "#eff6ff",
            lineHeight: 1.45,
          }}
        >
          {permissionMessage}
        </div>
      ) : null}
      {!hasPreparedSlides ? (
        <div style={{ textAlign: "center", padding: "var(--space-8)", color: "var(--text-secondary)" }}>
          JSON을 입력하고 미리보기를 생성하면 여기에서 확인할 수 있습니다.
        </div>
      ) : null}
      {hasPreparedSlides && visibleWarnings.length > 0 ? (
        <div className="page-inline-banner is-warning">
          <strong>이미지 준비 알림</strong>
          {visibleWarnings.map((warning, warningIndex) => (
            <div key={`${warningIndex}:${warning}`}>{warning}</div>
          ))}
        </div>
      ) : null}
      {hasPreparedSlides ? (
        <div className="studio-preview-slide-selector-shell">
          <div className="studio-preview-group-nav">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSelectedSlideGroupIndex((current) => clampStudioPreviewSelectedSlideIndex(current - 1, slideGroups.length))}
              disabled={!canMovePrevGroup}
            >
              이전 묶음
            </button>
            <div className="studio-preview-group-nav-copy">
              <div className="studio-preview-slide-selector-title">묶음 {slideGroups.length > 0 ? activeSlideGroupIndex + 1 : 0}</div>
              <div className="studio-preview-slide-selector-meta">
                {slideGroups.length > 0 ? `${activeGroupSlides.length}장` : "묶음 없음"}
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (canAdvanceToRender) {
                  onAdvanceToRenderAction();
                  return;
                }
                setSelectedSlideGroupIndex((current) => clampStudioPreviewSelectedSlideIndex(current + 1, slideGroups.length));
              }}
              disabled={!canMoveNextGroup && !canAdvanceToRender}
            >
              {canAdvanceToRender ? advanceButtonLabel : "다음 묶음"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-preview-column-grid">
        {hasPreparedSlides && activeGroupSlides.length <= 0 ? <div className="studio-preview-column-empty">현재 묶음에 표시할 슬라이드가 없습니다.</div> : null}
        {activeGroupSlides.map(({ slide, index }) => {
          const slideSafetyIssues = renderSafetyIssuesBySlide[index] || [];
          const captionOverflowLines = captionOverflowBySlide[index] || [];
          const effectiveVoiceId = String(slide.ttsVoiceId || "").trim() || String(selectedVoiceId || "").trim();
          const defaultVoiceLabel = selectedVoiceId ? `기본 음성 사용 (${resolveVoiceLabel(selectedVoiceId, voiceOptions)})` : "기본 음성 사용";
          const effectiveVoiceLabel = resolveVoiceLabel(effectiveVoiceId, voiceOptions);
          const savedEditorTab = activeEditorTabBySlide[index];
          const editorState = resolveStudioPreviewEditorState({
            savedTab: savedEditorTab,
            initialTab: initialEditorTab,
            visibleTabs: visibleEditorTabs,
            imageOnlyEditMode,
          });
          const activeEditorTab = editorState.activeTab;
          const availableEditorTabs = editorState.availableTabs;
          const showImageEditor = editorState.showImageEditor;
          const sfxPreviewSelection = sfxPreviewSelections[index] || null;
          const isSfxPreviewActive = sfxPreviewPlayback?.slideIndex === index;
          const isSfxReplanning = Boolean(sfxReplanningBySlide[index]);
          return (
            <article key={`${slide.title}-${index}`} className="studio-preview-column-card">
              <div className="studio-preview-column-head">
                <div className="studio-preview-column-title-row">
                  <div className="studio-preview-column-title">슬라이드 {index + 1}</div>
                </div>
              </div>
              <div className="studio-preview-column-layout">
                <div className="studio-preview-column-preview-rail">
                  <div className="studio-preview-slide-stage">
                    {renderSlidePreview(slide, index)}
                  </div>
                  {captionOverflowLines.length > 0 ? (
                    <div className="studio-preview-column-safety">
                      <div className="studio-preview-column-safety-item is-error">
                        화면 폭 초과 · 장면 구조 다시 만들기
                      </div>
                    </div>
                  ) : null}
                  {slideSafetyIssues.length > 0 ? (
                    <div className="studio-preview-column-safety">
                      {slideSafetyIssues.map((issue, issueIndex) => (
                        <div
                          key={`${issue.code}-${issue.field}-${issueIndex}`}
                          className={`studio-preview-column-safety-item is-${issue.severity}`}
                        >
                          {issue.title}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="studio-preview-column-tools">
              {isFunCaptionTemplate && !imageOnlyEditMode ? (
                <details className="studio-fun-caption-editor" open>
                  <summary className="studio-fun-caption-editor-summary">펀캡션 입력</summary>
                  <fieldset disabled={readOnly} className="studio-fun-caption-editor-fieldset">
                    {(() => {
                      const editableCues = getEditableCaptionCues(slide);
                      const activeCueIndex = Math.max(0, Math.min(editableCues.length - 1, activeCueBySlide[index] ?? 0));
                      const activeCue = editableCues[activeCueIndex] || editableCues[0];
                      const updateCueAt = (cueIndex: number, updater: (cue: EditableCaptionCue) => EditableCaptionCue) => {
                        const nextCues = editableCues.map((cue, currentIndex) =>
                          currentIndex === cueIndex ? updater(cue) : cue,
                        );
                        onSlideNarrationTextChange(index, serializeCaptionCues(nextCues));
                      };
                      const appendCue = () => {
                        onSlideNarrationTextChange(
                          index,
                          serializeCaptionCues([...editableCues, { text: "새 자막", overrides: {} }]),
                        );
                        setActiveCueBySlide((prev) => ({ ...prev, [index]: editableCues.length }));
                      };
                      const applyAutoMetadata = () => {
                        onSlideNarrationTextChange(index, serializeCaptionCues(applyStudioCaptionAutoMetadata(editableCues)));
                      };
                      const clearAutoMetadata = () => {
                        onSlideNarrationTextChange(
                          index,
                          serializeCaptionCues(
                            editableCues.map((cue) => ({
                              ...cue,
                              overrides: {
                                ...cue.overrides,
                                autoTag: undefined,
                                emphasis: undefined,
                                highlightWords: undefined,
                              },
                            })),
                          ),
                        );
                      };
                      const removeCue = (cueIndex: number) => {
                        const nextCues = editableCues.filter((_, currentIndex) => currentIndex !== cueIndex);
                        onSlideNarrationTextChange(index, serializeCaptionCues(nextCues.length > 0 ? nextCues : [{ text: "", overrides: {} }]));
                        const nextLength = Math.max(1, nextCues.length);
                        setActiveCueBySlide((prev) => ({
                          ...prev,
                          [index]: Math.max(0, Math.min(cueIndex, nextLength - 1)),
                        }));
                      };

                      return (
                        <>
                          <div className="studio-fun-caption-main-grid">
                            <label className="studio-fun-caption-field">
                              <span className="studio-fun-caption-label">상단 작은 캡션</span>
                              <input
                                className="input-field"
                                value={slide.title || ""}
                                onChange={(event) => onSlideTitleChangeAction?.(index, event.target.value)}
                                placeholder="예: 스피드가 방송 중 실망한 순간들이라는데"
                              />
                            </label>
                            <label className="studio-fun-caption-field">
                              <span className="studio-fun-caption-label">중앙 큰 캡션</span>
                              <textarea
                                className="input-field"
                                value={serializeCaptionCues(editableCues)}
                                onChange={(event) => onSlideNarrationTextChange(index, event.target.value)}
                                rows={3}
                                placeholder="예: 순간들이라는데"
                              />
                            </label>
                          </div>

                          <details className="studio-fun-caption-advanced" open={editableCues.length <= 1}>
                            <summary className="studio-fun-caption-advanced-summary">줄별 고급 설정 ({editableCues.length}줄)</summary>
                            <div className="studio-fun-caption-toolbar">
                              <button type="button" className="btn-secondary" onClick={applyAutoMetadata}>
                                자동 메타데이터 생성
                              </button>
                              <button type="button" className="btn-secondary" onClick={clearAutoMetadata}>
                                자동 메타데이터 초기화
                              </button>
                              <button type="button" className="btn-secondary" onClick={appendCue}>
                                자막 줄 추가
                              </button>
                            </div>
                            <div className="studio-fun-caption-help">
                              각 줄마다 스타일, 애니메이션, 위치, 색상을 개별 조정합니다. `자동 메타데이터 생성`을 누르면 현재 스크립트 줄을 분석해 `tag / em / hl`을 채웁니다.
                            </div>

                            <div className="studio-fun-caption-cue-tab-row">
                              {editableCues.map((cue, cueIndex) => (
                                <button
                                  key={`${index}-cue-tab-${cueIndex}`}
                                  type="button"
                                  className={`btn-secondary studio-fun-caption-cue-tab${cueIndex === activeCueIndex ? " is-active" : ""}`}
                                  onClick={() => setActiveCueBySlide((prev) => ({ ...prev, [index]: cueIndex }))}
                                >
                                  {buildCueTabLabel(cue, cueIndex)}
                                </button>
                              ))}
                            </div>

                            <div className="studio-fun-caption-cue-panel">
                              <div className="studio-fun-caption-cue-head">
                                <span className="studio-fun-caption-cue-title">자막 {activeCueIndex + 1}</span>
                                <button type="button" className="btn-secondary" onClick={() => removeCue(activeCueIndex)}>
                                  삭제
                                </button>
                              </div>
                              <input
                                className="input-field"
                                value={activeCue.text}
                                onChange={(event) => updateCueAt(activeCueIndex, (current) => ({ ...current, text: event.target.value }))}
                                placeholder={`자막 ${activeCueIndex + 1}`}
                              />

                              <CaptionCuePresetControls
                                cue={activeCue}
                                presets={savedCuePresets}
                                onSavePreset={(name, overrides) => {
                                  const nextPreset: StoredCaptionCuePreset = {
                                    id: `caption-cue-${Date.now()}`,
                                    name,
                                    createdAt: new Date().toISOString(),
                                    overrides,
                                  };
                                  persistCuePresets([nextPreset, ...savedCuePresets]);
                                }}
                                onApplyPreset={(overrides) =>
                                  updateCueAt(activeCueIndex, (current) => ({
                                    ...current,
                                    overrides: {
                                      ...current.overrides,
                                      ...overrides,
                                    },
                                  }))
                                }
                                onDeletePreset={(presetId) =>
                                  persistCuePresets(savedCuePresets.filter((preset) => preset.id !== presetId))
                                }
                              />

                              <div className="studio-fun-caption-cue-grid">
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">스타일</span>
                                  <select
                                    className="input-field"
                                    value={activeCue.overrides.style || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: { ...current.overrides, style: (event.target.value || undefined) as EditableCaptionCue["overrides"]["style"] },
                                      }))
                                    }
                                  >
                                    <option value="">기본값 사용</option>
                                    {STUDIO_CAPTION_STYLE_PRESET_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">애니메이션</span>
                                  <select
                                    className="input-field"
                                    value={activeCue.overrides.animation || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          animation: (event.target.value || undefined) as EditableCaptionCue["overrides"]["animation"],
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">기본값 사용</option>
                                    {STUDIO_CAPTION_ANIMATION_PRESET_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">퇴장 애니메이션</span>
                                  <select
                                    className="input-field"
                                    value={activeCue.overrides.exitAnimation || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          exitAnimation: (event.target.value || undefined) as EditableCaptionCue["overrides"]["exitAnimation"],
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">기본값 사용</option>
                                    {STUDIO_CAPTION_EXIT_PRESET_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">자동 태그</span>
                                  <select
                                    className="input-field"
                                    value={activeCue.overrides.autoTag || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          autoTag: (event.target.value || undefined) as EditableCaptionCue["overrides"]["autoTag"],
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">자동 분석 사용</option>
                                    {STUDIO_CAPTION_AUTO_CUE_TAG_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">강조 강도</span>
                                  <input
                                    className="input-field"
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={activeCue.overrides.emphasis ?? ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          emphasis: event.target.value === "" ? undefined : Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">강조 단어</span>
                                  <input
                                    className="input-field"
                                    value={Array.isArray(activeCue.overrides.highlightWords) ? activeCue.overrides.highlightWords.join("|") : ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          highlightWords: event.target.value
                                            .split("|")
                                            .map((word) => word.trim())
                                            .filter(Boolean),
                                        },
                                      }))
                                    }
                                    placeholder="충격|레전드"
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">정렬</span>
                                  <select
                                    className="input-field"
                                    value={activeCue.overrides.align || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          align: (event.target.value || undefined) as EditableCaptionCue["overrides"]["align"],
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">기본값 사용</option>
                                    <option value="center">가운데</option>
                                    <option value="left">왼쪽</option>
                                  </select>
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">크기 배율</span>
                                  <input
                                    className="input-field"
                                    type="number"
                                    min={0.6}
                                    max={1.8}
                                    step={0.05}
                                    value={activeCue.overrides.scale ?? ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          scale: event.target.value === "" ? undefined : Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">표시 시간(초)</span>
                                  <input
                                    className="input-field"
                                    type="number"
                                    min={0.2}
                                    max={6}
                                    step={0.05}
                                    value={activeCue.overrides.durationSec ?? ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          durationSec: event.target.value === "" ? undefined : Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">Y 위치</span>
                                  <input
                                    className="input-field"
                                    type="number"
                                    min={18}
                                    max={82}
                                    step={1}
                                    value={activeCue.overrides.y ?? ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          y: event.target.value === "" ? undefined : Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">글자색</span>
                                  <input
                                    className="input-field"
                                    value={activeCue.overrides.color || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: { ...current.overrides, color: event.target.value || undefined },
                                      }))
                                    }
                                    placeholder="#ffffff"
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">외곽선색</span>
                                  <input
                                    className="input-field"
                                    value={activeCue.overrides.strokeColor || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: { ...current.overrides, strokeColor: event.target.value || undefined },
                                      }))
                                    }
                                    placeholder="#111111"
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">배경색</span>
                                  <input
                                    className="input-field"
                                    value={activeCue.overrides.background || ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: { ...current.overrides, background: event.target.value || undefined },
                                      }))
                                    }
                                    placeholder="rgba(0,0,0,0.3)"
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">외곽선 두께</span>
                                  <input
                                    className="input-field"
                                    type="number"
                                    min={0}
                                    max={8}
                                    step={0.5}
                                    value={activeCue.overrides.strokeWidth ?? ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          strokeWidth: event.target.value === "" ? undefined : Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="studio-fun-caption-field tight">
                                  <span className="studio-fun-caption-field-caption">글로우</span>
                                  <input
                                    className="input-field"
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={activeCue.overrides.glow ?? ""}
                                    onChange={(event) =>
                                      updateCueAt(activeCueIndex, (current) => ({
                                        ...current,
                                        overrides: {
                                          ...current.overrides,
                                          glow: event.target.value === "" ? undefined : Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          </details>

                          <div className="studio-fun-caption-footnote">
                            더빙은 이 중앙 캡션 텍스트를 기준으로 이어집니다. 줄바꿈을 넣으면 중앙 자막도 같은 줄 구조를 따릅니다. 한 줄마다
                            ` || style=flame-gold anim=bounce scale=1.15 color=#ffd54a stroke=#111111 y=46 `
                            같은 토큰을 붙이면 줄별 자막 스타일을 따로 줄 수 있습니다.
                          </div>
                        </>
                      );
                    })()}
                  </fieldset>
                </details>
              ) : null}
              {shouldShowStudioPreviewEditorTabs({
                imageOnlyEditMode,
                isFunCaptionTemplate,
                hasExplicitVisibleTabs: Boolean(visibleEditorTabs),
              }) ? (
                <div className="studio-preview-column-tab-row" role="tablist" aria-label={`슬라이드 ${index + 1} 편집`}>
                  {availableEditorTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`studio-preview-column-tab${activeEditorTab === tab ? " is-active" : ""}`}
                      onClick={() => setActiveEditorTabBySlide((prev) => ({ ...prev, [index]: tab }))}
                      role="tab"
                      aria-selected={activeEditorTab === tab}
                    >
                      {tab === "image" ? "이미지" : tab === "script" ? "대본·자막" : "효과음"}
                    </button>
                  ))}
                </div>
              ) : null}
              {isFunCaptionTemplate && slideSafetyIssues.length > 0 ? (
                <div className="studio-render-safety-slide-alert">
                  <div className="studio-render-safety-slide-alert-title">렌더 주의</div>
                  <div className="studio-render-safety-slide-alert-list">
                    {slideSafetyIssues.map((issue, issueIndex) => (
                      <div
                        key={`${issue.code}-${issue.field}-${issueIndex}`}
                        className={`studio-render-safety-slide-issue is-${issue.severity}`}
                      >
                        <strong>{issue.title}</strong>
                        <span>{issue.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {showImageEditor && slide.imageSelection && (isFunCaptionTemplate || activeEditorTab === "image") ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "8px 10px",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(255,255,255,0.04)",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700 }}>이미지 후보</span>
                    {slide.imageSelection.selectedQuery ? <span style={{ color: "var(--text-secondary)" }}>{slide.imageSelection.selectedQuery}</span> : null}
                    {slide.imageSelection.provider === "library" ? <span style={{ color: "var(--text-secondary)" }}>라이브러리</span> : null}
                    {slide.imageSelection.provider === "giphy" ? <span style={{ color: "var(--text-secondary)" }}>GIPHY</span> : null}
                    {(() => {
                      const candidateOptions = selectVisibleStudioImageCandidates(
                        slide.imageSelection.candidateOptions,
                        slide.imageSelection.selectedCandidateId
                      );
                      return candidateOptions.length > 0 ? (
                        <span style={{ color: "var(--text-secondary)" }}>{candidateOptions.length}개</span>
                      ) : null;
                    })()}
                  </div>
                  {(() => {
                    const candidateOptions = selectVisibleStudioImageCandidates(
                      slide.imageSelection.candidateOptions,
                      slide.imageSelection.selectedCandidateId
                    );
                    if (candidateOptions.length <= 0) return null;
                    const isAutoGeneratedImageSource = imageSource === "auto-ai-generate";
                    return (
                      <div className="studio-slide-candidate-panel">
                        <div className="studio-slide-candidate-header">
                          <span>{isAutoGeneratedImageSource ? "이미지 교체" : "후보 승인"}</span>
                          <span>{candidateOptions.length}개</span>
                        </div>
                        <div className="studio-slide-candidate-grid">
                          {candidateOptions.map((candidate, candidateIndex) => {
                            const isSelected = candidate.candidateId === slide.imageSelection?.selectedCandidateId;
                            const isPending = !isSelected;
                            return (
                              <div
                                key={buildImageSelectionCandidateReactKey(candidate, candidateIndex)}
                                className={`studio-slide-candidate-card${isSelected ? " is-selected" : ""}${isPending ? " is-pending" : ""}`}
                              >
                                <div className="studio-slide-candidate-media">
                                  {renderSelectionCandidatePreview(candidate)}
                                  <span className="studio-slide-candidate-badge studio-slide-candidate-badge-overlay">
                                    {isSelected ? "현재 사용 중" : isAutoGeneratedImageSource ? "교체 후보" : "승인 대기"}
                                  </span>
                                </div>
                                <div className="studio-slide-candidate-meta">
                                  <div className="studio-slide-candidate-topline">
                                    <strong>{candidate.title || `후보 ${candidateIndex + 1}`}</strong>
                                    <span className="studio-slide-candidate-badge">{getCandidateProviderLabel(candidate)}</span>
                                  </div>
                                  <div className="studio-slide-candidate-subline">
                                    {isSelected
                                      ? "렌더에 반영 중인 현재 이미지입니다."
                                      : isAutoGeneratedImageSource
                                        ? "생성 결과입니다. 선택하면 현재 이미지를 교체합니다."
                                        : "생성/검색 결과입니다. 승인해야 현재 이미지로 바뀝니다."}
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-secondary studio-slide-candidate-approve-btn"
                                    onClick={() => onSlideImageCandidateApplyAction(index, candidate)}
                                    disabled={readOnly || isSelected}
                                  >
                                    {isSelected
                                      ? isAutoGeneratedImageSource
                                        ? "사용 중"
                                        : "승인됨"
                                      : isAutoGeneratedImageSource
                                        ? "이 이미지로 교체"
                                        : "이 후보 승인"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : null}
              {!isFunCaptionTemplate && !imageOnlyEditMode && activeEditorTab === "script" ? (
              <details className="studio-preview-compact-detail" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-2)" }} open>
                <summary style={{ cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>
                  {isFunCaptionTemplate ? "더빙/캡션 원문 수정" : "대본 수정"}
                </summary>
                <fieldset
                  disabled={readOnly}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-2)",
                    padding: 0,
                    marginInline: 0,
                    border: "none",
                    minInlineSize: 0,
                  }}
                >
                  <textarea
                    className="input-field"
                    value={Array.isArray(slide.lines) && slide.lines.length > 0 ? slide.lines.join("\n") : slide.text}
                    onChange={(event) => onSlideNarrationTextChange(index, event.target.value)}
                    rows={2}
                  />
                  <div className="studio-slide-voice-grid">
                    <div className="studio-slide-voice-field">
                      <span className="studio-slide-voice-label">슬라이드 음성</span>
                      <StudioVoicePicker
                        id={`studio-slide-voice-${index}`}
                        value={slide.ttsVoiceId || ""}
                        options={voiceOptions}
                        emptyLabel={defaultVoiceLabel}
                        customValueLabel={slide.ttsVoiceId ? `custom: ${slide.ttsVoiceId}` : undefined}
                        disabled={readOnly}
                        onChangeAction={(nextVoiceId) => onSlideVoiceChangeAction(index, nextVoiceId)}
                      />
                    </div>
                    <div className="studio-slide-voice-help">현재 적용 음성: {effectiveVoiceLabel}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onSlideVoicePreviewAction(index)}
                        disabled={busy}
                      >
                        이 슬라이드 음성 미리듣기
                      </button>
                      <span className="studio-slide-voice-help">현재 대본과 적용 음성으로 재생합니다.</span>
                    </div>
                  </div>
                </fieldset>
              </details>
              ) : null}
              {showImageEditor && (isFunCaptionTemplate || activeEditorTab === "image") ? (
              <details
                className={isFunCaptionTemplate ? undefined : "studio-preview-compact-detail"}
                style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-2)" }}
                open
              >
                <summary style={{ cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>
                  {isFunCaptionTemplate ? "배경 영상/이미지 직접 교체" : "이미지 직접 교체"}
                </summary>
                {imageSource === "manual-ai-prompt" &&
                (!Number.isFinite(slide.stepIndex) || Number(slide.stepIndex) <= 0) ? (
                  <div className="studio-preview-manual-image-prompt-shell">
                    <StudioManualImagePromptPanel
                      slide={slide}
                      slideIndex={Math.max(0, (visualization.perSlide[index]?.groupIndex || index + 1) - 1)}
                      totalSlides={Math.max(1, visualization.totalOriginalSlides || slides.length)}
                      publishCategory={publishCategory}
                      categoryMetadata={categoryMetadata}
                      fixedCharacterProfile={fixedCharacterProfile}
                      imageStylePrompt={imageStylePrompt}
                    />
                  </div>
                ) : null}
                <fieldset
                  disabled={readOnly}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-2)",
                    padding: 0,
                    marginInline: 0,
                    border: "none",
                    minInlineSize: 0,
                  }}
                >
                  <legend className="studio-slide-direct-replacement-title">
                    {isFunCaptionTemplate ? "배경 미디어 직접 교체" : "직접 교체"}
                  </legend>
                  <input
                    className="input-field"
                    value={slide.imageUrl || ""}
                    onChange={(event) => onSlideImageUrlChange(index, event.target.value)}
                    placeholder={
                      isFunCaptionTemplate
                        ? "배경 영상 URL(mp4/webm), 움짤 URL(gif), 또는 이미지 URL을 입력하세요."
                        : "이미지/움짤 URL을 입력하거나 아래에서 파일을 업로드하세요."
                    }
                  />
                  {isFunCaptionTemplate ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                      `mp4/webm`은 배경 영상, `gif`는 움짤 링크로 해석합니다. Giphy 직접 링크도 저장 자산으로 유지됩니다.
                    </div>
                  ) : imageSource === "manual-ai-prompt" ? (
                    <p className="studio-tts-field-help">
                      외부에서 만든 이미지를 URL로 입력하거나 파일 업로드·내 자산 선택으로 직접 적용합니다.
                    </p>
                  ) : imageSource === "auto-ai-generate" ? (
                    <p className="studio-tts-field-help">
                      자동 생성 모드는 준비 시 이미지 없는 장면에 생성 이미지를 바로 적용합니다. 아래 후보를 선택하면 현재 이미지를 교체할 수 있습니다.
                    </p>
                  ) : null}
                  <input
                    className="input-field"
                    type="file"
                    accept={
                      isFunCaptionTemplate
                        ? "image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                        : "image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    }
                    onChange={(event) => {
                      void onSlideImageFileChange(index, event.target.files?.[0] || null);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button className="btn-secondary" type="button" onClick={() => onSlideImageUrlChange(index, "")}>
                    {isFunCaptionTemplate ? "배경 제거" : "이미지 제거"}
                  </button>
                  <StudioSlideAssetPicker
                    slide={slide}
                    slideIndex={index}
                    onApplyAssetAction={onSlideLibraryAssetApplyAction}
                  />
                </fieldset>
              </details>
              ) : null}
              {!imageOnlyEditMode && (isFunCaptionTemplate || activeEditorTab === "sfx") ? (
              <details
                className={isFunCaptionTemplate ? undefined : "studio-preview-compact-detail"}
                style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-2)" }}
                open
              >
                <summary style={{ cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>효과음 수정</summary>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginTop: "var(--space-2)",
                    padding: "8px 10px",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(255,255,255,0.035)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sfxPreviewSelection?.label || "미리들을 효과음을 선택해 주세요"}
                    </strong>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      {sfxPreviewSelection
                        ? sfxPreviewSelection.includedInRender
                          ? "렌더러가 선택할 파일을 개별 게인으로 단독 재생합니다."
                          : !sfxEnabled
                            ? "전체 효과음이 꺼져 있어 최종 렌더에는 포함되지 않습니다."
                            : "현재 그룹 배치 규칙상 최종 렌더에서는 제외됩니다."
                        : "효과음을 켜고 종류를 선택하면 바로 들어볼 수 있습니다."}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {isSfxPreviewActive ? (
                      <button type="button" className="btn-secondary" onClick={stopSfxPreview}>
                        {sfxPreviewPlayback?.status === "loading" ? "재생 준비 중단" : "미리듣기 중단"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void playSfxPreview(index)}
                        disabled={!sfxPreviewSelection}
                      >
                        효과음 미리듣기
                      </button>
                    )}
                    {onSlideSfxReplanAction ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void replanSlideSfx(index)}
                        disabled={readOnly || busy || isSfxReplanning}
                      >
                        {isSfxReplanning ? "효과음 추천 중..." : "이 효과음 다시 추천"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {sfxPreviewError?.slideIndex === index ? (
                  <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--danger, #ef4444)" }}>
                    {sfxPreviewError.message}
                  </div>
                ) : null}
                <div style={{ marginTop: 6, fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  시작 오프셋과 나레이션·BGM을 포함한 전체 밸런스는 확인본에서 최종 확인합니다.
                </div>
                <fieldset
                  disabled={readOnly}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-2)",
                    padding: 0,
                    marginInline: 0,
                    border: "none",
                    minInlineSize: 0,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(slide.sfxCue?.enabled !== false && slide.sfxCue?.tag)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        if (!checked) {
                          onSlideSfxCueChange(index, null);
                          return;
                        }
                        const defaultTag = sfxCategories[0]?.files[0]?.id || sfxCategories[0]?.id || "default";
                        onSlideSfxCueChange(index, {
                          enabled: true,
                          tag: slide.sfxCue?.tag || defaultTag,
                          gainDb: slide.sfxCue?.gainDb,
                          offsetMs: slide.sfxCue?.offsetMs,
                          source: "manual",
                        });
                      }}
                    />
                    이 슬라이드 효과음 사용
                  </label>
                  <select
                    className="input-field"
                    value={slide.sfxCue?.tag || ""}
                    onChange={(event) => {
                      const nextTag = (event.target.value || "").trim();
                      if (!nextTag) {
                        onSlideSfxCueChange(index, null);
                        return;
                      }
                      onSlideSfxCueChange(index, {
                        enabled: true,
                        tag: nextTag as SfxTag,
                        gainDb: slide.sfxCue?.gainDb,
                        offsetMs: slide.sfxCue?.offsetMs,
                        source: "manual",
                      });
                    }}
                  >
                    <option value="">(없음)</option>
                    {sfxCategories.map((category) => (
                      <optgroup key={category.id} label={category.label}>
                        <option value={category.id}>{category.label} · 폴더 랜덤</option>
                        {category.files.map((file) => (
                          <option key={file.id} value={file.id}>
                            {file.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>게인(dB)</label>
                  <input
                    className="input-field"
                    type="number"
                    step="0.5"
                    min="-24"
                    max="12"
                    value={typeof slide.sfxCue?.gainDb === "number" ? slide.sfxCue.gainDb : 0}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!slide.sfxCue?.tag) return;
                      onSlideSfxCueChange(index, {
                        enabled: true,
                        tag: slide.sfxCue.tag,
                        gainDb: Number.isFinite(next) ? Math.max(-24, Math.min(12, next)) : undefined,
                        offsetMs: slide.sfxCue.offsetMs,
                        source: "manual",
                      });
                    }}
                    disabled={!slide.sfxCue?.tag}
                  />
                  <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>시작 오프셋(ms)</label>
                  <input
                    className="input-field"
                    type="number"
                    step="10"
                    min="-1200"
                    max="1200"
                    value={typeof slide.sfxCue?.offsetMs === "number" ? slide.sfxCue.offsetMs : 0}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!slide.sfxCue?.tag) return;
                      onSlideSfxCueChange(index, {
                        enabled: true,
                        tag: slide.sfxCue.tag,
                        gainDb: slide.sfxCue.gainDb,
                        offsetMs: Number.isFinite(next) ? Math.max(-1200, Math.min(1200, Math.round(next))) : undefined,
                        source: "manual",
                      });
                    }}
                    disabled={!slide.sfxCue?.tag}
                  />
                </fieldset>
              </details>
              ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

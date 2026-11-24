"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeCategory } from "@/lib/publish/categories";
import type { PreparedSlide } from "@/types/studio-json";
import {
  cloneStudioWorkDraft,
  type StudioHistoryEntry,
  type StudioHistoryState,
  type StudioWorkDraft,
} from "./types";
import {
  readStoredStudioHistory,
  removeStoredStudioHistory,
  writeStoredStudioHistory,
} from "./storage";

export type StudioHistorySnapshot<TDraft extends StudioWorkDraft = StudioWorkDraft> = {
  id: string;
  label: string;
  createdAt: string;
  draft: TDraft;
};

export type StudioHistoryKind = NonNullable<StudioHistoryEntry["kind"]>;
export type StudioHistoryReason = NonNullable<StudioHistoryEntry["reason"]>;

export type StudioHistoryCaptureInput =
  | string
  | {
      label: string;
      kind?: StudioHistoryKind;
      reason?: StudioHistoryReason;
      draftOverride?: StudioWorkDraft;
    };

function createHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toDefaultHistoryLabel(createdAt: string): string {
  return `버전 ${createdAt.slice(0, 19).replace("T", " ")}`;
}

function normalizeHistoryKind(value: unknown, fallback: StudioHistoryKind = "auto"): StudioHistoryKind {
  return value === "manual" || value === "restore-backup" ? value : fallback;
}

function normalizeHistoryReason(value: unknown): StudioHistoryReason {
  switch (value) {
    case "manual_save":
    case "prepare":
    case "script_to_json":
    case "script_only":
    case "category_change":
    case "preset_save":
    case "title_edit":
    case "slide_image_edit":
    case "slide_image_upload":
    case "slide_library_apply":
    case "slide_candidate_apply":
    case "prepared_media_edit":
    case "slide_narration_edit":
    case "slide_delete":
    case "slide_add":
    case "slide_sfx_edit":
    case "restore_backup":
      return value;
    default:
      return "unknown";
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6);
}

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toCompactMediaSignature(value: unknown): string {
  const text = toSafeString(value).trim();
  if (!text) return "";
  if (text.startsWith("data:")) {
    return `data-url:${text.slice(0, 48)}:${text.length}`;
  }
  return text;
}

function getDraftSlides(draft: StudioWorkDraft | null | undefined): PreparedSlide[] {
  return Array.isArray(draft?.slides) ? draft.slides : [];
}

function getDraftTitle(draft: StudioWorkDraft | null | undefined): string {
  if (!draft) return "";
  const jsonText = toSafeString(draft.jsonText).trim();
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      if (typeof parsed.title === "string" && parsed.title.trim()) {
        return parsed.title.trim();
      }
    } catch {
      // ignore broken json
    }
  }
  const slides = getDraftSlides(draft);
  return toSafeString(slides[0]?.title).trim();
}

function getSlideImageSignature(slide: PreparedSlide | undefined): string {
  if (!slide) return "";
  return JSON.stringify({
    imageUrl: toCompactMediaSignature(slide.imageUrl),
    mediaUrl: toCompactMediaSignature(slide.mediaUrl),
    mediaKind: slide.mediaKind || "",
    imageRequest: slide.imageRequest || null,
    imageBeats: Array.isArray(slide.imageBeats)
      ? slide.imageBeats.map((beat) => ({
          ...beat,
          imageUrl: toCompactMediaSignature(beat?.imageUrl),
          resolvedImageUrl: toCompactMediaSignature(beat?.resolvedImageUrl),
          mediaUrl: toCompactMediaSignature(beat?.mediaUrl),
        }))
      : [],
    imageVariantId: slide.imageVariantId || "",
    resolvedImageUrl: toCompactMediaSignature(slide.resolvedImageUrl),
    resolvedBy: slide.resolvedBy || "",
    imageSelection:
      slide.imageSelection && typeof slide.imageSelection === "object"
        ? {
            intent: slide.imageSelection.intent || "",
            provider: slide.imageSelection.provider || "",
            selectedQuery: slide.imageSelection.selectedQuery || "",
            selectedCandidateId: slide.imageSelection.selectedCandidateId || "",
            selectionReason: slide.imageSelection.selectionReason || "",
          }
        : null,
  });
}

function getSlideNarrationSignature(slide: PreparedSlide | undefined): string {
  if (!slide) return "";
  return JSON.stringify({
    title: slide.title || "",
    text: slide.text || "",
    narrationText: slide.narrationText || "",
    lines: Array.isArray(slide.lines) ? slide.lines : [],
    layout: slide.layout || "",
  });
}

function getSlideSfxSignature(slide: PreparedSlide | undefined): string {
  if (!slide) return "";
  return JSON.stringify({
    sfxCue: slide.sfxCue || null,
    sfxPlan: slide.sfxPlan || [],
  });
}

function getSlideChangeSignature(
  slide: PreparedSlide | undefined,
  signatures?: { image?: string; narration?: string; sfx?: string }
): string {
  if (!slide) return "";
  return JSON.stringify({
    image: signatures?.image ?? getSlideImageSignature(slide),
    narration: signatures?.narration ?? getSlideNarrationSignature(slide),
    sfx: signatures?.sfx ?? getSlideSfxSignature(slide),
    ttsVoiceId: slide.ttsVoiceId || "",
    captionCues: Array.isArray(slide.captionCues) ? slide.captionCues : [],
    dialogueSegments: Array.isArray(slide.dialogueSegments) ? slide.dialogueSegments : [],
    groupId: typeof slide.groupId === "number" && Number.isFinite(slide.groupId) ? slide.groupId : null,
    stepIndex: typeof slide.stepIndex === "number" && Number.isFinite(slide.stepIndex) ? slide.stepIndex : null,
  });
}

function inferHistoryReason(label: string): StudioHistoryReason {
  if (label.startsWith("prepare")) return "prepare";
  if (label.startsWith("스크립트→JSON")) return "script_to_json";
  if (label.startsWith("대본만 수정")) return "script_only";
  if (label.startsWith("카테고리 변경")) return "category_change";
  if (label.startsWith("preset 저장")) return "preset_save";
  if (label.startsWith("제목 수정")) return "title_edit";
  if (label.includes("이미지 업로드")) return "slide_image_upload";
  if (label.includes("이미지 수정")) return "slide_image_edit";
  if (label.includes("라이브러리 자산 적용")) return "slide_library_apply";
  if (label.includes("후보 선택")) return "slide_candidate_apply";
  if (label.includes("미리 선택 미디어")) return "prepared_media_edit";
  if (label.includes("대본 수정")) return "slide_narration_edit";
  if (label.includes("삭제")) return "slide_delete";
  if (label.includes("뒤에 추가")) return "slide_add";
  if (label.includes("SFX 수정")) return "slide_sfx_edit";
  if (label.startsWith("수동 저장")) return "manual_save";
  return "unknown";
}

function buildHistoryMetadata(input: {
  label: string;
  kind: StudioHistoryKind;
  reason: StudioHistoryReason;
  draft: StudioWorkDraft;
  previousDraft: StudioWorkDraft | null;
}): Pick<StudioHistoryEntry, "kind" | "reason" | "summary" | "changeTags" | "slideCount"> {
  const nextDraft = input.draft;
  const previousDraft = input.previousDraft;
  const nextSlides = getDraftSlides(nextDraft);
  const previousSlides = getDraftSlides(previousDraft);
  const nextTitle = getDraftTitle(nextDraft);
  const previousTitle = getDraftTitle(previousDraft);
  const nextCategory = normalizeCategory(nextDraft.publishCategory || "") || "";
  const previousCategory = normalizeCategory(previousDraft?.publishCategory || "") || "";

  if (!previousDraft) {
    return {
      kind: input.kind,
      reason: input.reason,
      summary: nextSlides.length > 0 ? `첫 스냅샷 · 슬라이드 ${nextSlides.length}개` : "첫 스냅샷",
      changeTags: nextSlides.length > 0 ? [`슬라이드 ${nextSlides.length}`] : [],
      slideCount: nextSlides.length,
    };
  }

  const changedFields: string[] = [];
  const summaryParts: string[] = [];
  const maxSlides = Math.max(previousSlides.length, nextSlides.length);
  let changedSlideCount = 0;
  let changedImageCount = 0;
  let changedNarrationCount = 0;
  let changedSfxCount = 0;

  for (let index = 0; index < maxSlides; index += 1) {
    const previousSlide = previousSlides[index];
    const nextSlide = nextSlides[index];
    if (!previousSlide || !nextSlide) {
      changedSlideCount += 1;
      continue;
    }
    const previousImageSignature = getSlideImageSignature(previousSlide);
    const nextImageSignature = getSlideImageSignature(nextSlide);
    const previousNarrationSignature = getSlideNarrationSignature(previousSlide);
    const nextNarrationSignature = getSlideNarrationSignature(nextSlide);
    const previousSfxSignature = getSlideSfxSignature(previousSlide);
    const nextSfxSignature = getSlideSfxSignature(nextSlide);
    if (
      getSlideChangeSignature(previousSlide, {
        image: previousImageSignature,
        narration: previousNarrationSignature,
        sfx: previousSfxSignature,
      }) !==
      getSlideChangeSignature(nextSlide, {
        image: nextImageSignature,
        narration: nextNarrationSignature,
        sfx: nextSfxSignature,
      })
    ) {
      changedSlideCount += 1;
    }
    if (previousImageSignature !== nextImageSignature) changedImageCount += 1;
    if (previousNarrationSignature !== nextNarrationSignature) changedNarrationCount += 1;
    if (previousSfxSignature !== nextSfxSignature) changedSfxCount += 1;
  }

  const slideDelta = nextSlides.length - previousSlides.length;
  if (slideDelta !== 0) {
    const deltaLabel = slideDelta > 0 ? `슬라이드 +${slideDelta}` : `슬라이드 ${slideDelta}`;
    changedFields.push(deltaLabel);
    summaryParts.push(slideDelta > 0 ? `${slideDelta}개 추가` : `${Math.abs(slideDelta)}개 삭제`);
  } else if (changedSlideCount > 0) {
    changedFields.push(`슬라이드 ${changedSlideCount}`);
    summaryParts.push(`${changedSlideCount}개 편집`);
  }

  if (nextTitle !== previousTitle) {
    changedFields.push("제목");
    summaryParts.push("제목 변경");
  }
  if (nextCategory && nextCategory !== previousCategory) {
    changedFields.push("카테고리");
    summaryParts.push("카테고리 변경");
  }
  if (changedImageCount > 0) {
    changedFields.push(`이미지 ${changedImageCount}`);
    summaryParts.push(`이미지 ${changedImageCount}개`);
  }
  if (changedNarrationCount > 0) {
    changedFields.push(`대본 ${changedNarrationCount}`);
    summaryParts.push(`대본 ${changedNarrationCount}개`);
  }
  if (changedSfxCount > 0) {
    changedFields.push(`SFX ${changedSfxCount}`);
    summaryParts.push(`SFX ${changedSfxCount}개`);
  }
  const voiceChanged = (nextDraft.selectedVoiceId || "") !== (previousDraft.selectedVoiceId || "");
  const quoteVoiceChanged = (nextDraft.selectedQuoteVoiceId || "") !== (previousDraft.selectedQuoteVoiceId || "");
  const maleVoiceChanged = (nextDraft.selectedMaleVoiceId || "") !== (previousDraft.selectedMaleVoiceId || "");
  const femaleVoiceChanged = (nextDraft.selectedFemaleVoiceId || "") !== (previousDraft.selectedFemaleVoiceId || "");
  const emotionChanged = (nextDraft.selectedTypecastEmotionType || "") !== (previousDraft.selectedTypecastEmotionType || "");
  const typecastSpeedChanged = (nextDraft.selectedTypecastSpeed || "") !== (previousDraft.selectedTypecastSpeed || "");
  if (voiceChanged || quoteVoiceChanged || maleVoiceChanged || femaleVoiceChanged || emotionChanged || typecastSpeedChanged) {
    changedFields.push("보이스");
    summaryParts.push(
      [
        voiceChanged ? "나레이션" : "",
        quoteVoiceChanged ? "대사 기본" : "",
        maleVoiceChanged ? "남자" : "",
        femaleVoiceChanged ? "여자" : "",
        emotionChanged ? "감정" : "",
        typecastSpeedChanged ? "배속" : "",
      ]
        .filter(Boolean)
        .join("/")
        .concat(" 변경")
    );
  }
  if (
    Boolean(nextDraft.bgmEnabled) !== Boolean(previousDraft.bgmEnabled) ||
    (nextDraft.selectedBgmTrack || "") !== (previousDraft.selectedBgmTrack || "") ||
    Number(nextDraft.bgmVolume ?? -1) !== Number(previousDraft.bgmVolume ?? -1) ||
    (nextDraft.mixPresetId || "") !== (previousDraft.mixPresetId || "") ||
    Boolean(nextDraft.sfxEnabled) !== Boolean(previousDraft.sfxEnabled) ||
    Number(nextDraft.sfxMasterGainDb || 0) !== Number(previousDraft.sfxMasterGainDb || 0) ||
    (nextDraft.sfxAutoLevel || "") !== (previousDraft.sfxAutoLevel || "")
  ) {
    changedFields.push("오디오");
    summaryParts.push("오디오 변경");
  }
  if (
    JSON.stringify(nextDraft.preselectedMediaItems || []) !== JSON.stringify(previousDraft.preselectedMediaItems || [])
  ) {
    changedFields.push("미리 미디어");
    summaryParts.push("미리 선택 미디어 변경");
  }
  if ((nextDraft.preselectedMediaApplyMode || "spread") !== (previousDraft.preselectedMediaApplyMode || "spread")) {
    changedFields.push("미디어 방식");
    summaryParts.push("미리 선택 방식 변경");
  }
  if (
    (nextDraft.templateId || "") !== (previousDraft.templateId || "") ||
    Boolean(nextDraft.templateImageEnabled) !== Boolean(previousDraft.templateImageEnabled) ||
    (nextDraft.templateImageUrl || "") !== (previousDraft.templateImageUrl || "") ||
    JSON.stringify(nextDraft.templateImageLayout || null) !== JSON.stringify(previousDraft.templateImageLayout || null) ||
    JSON.stringify(nextDraft.templateLayoutApply || null) !== JSON.stringify(previousDraft.templateLayoutApply || null)
  ) {
    changedFields.push("템플릿");
    summaryParts.push("템플릿 변경");
  }
  if (
    (nextDraft.jsonText || "") !== (previousDraft.jsonText || "") &&
    !changedFields.includes("제목") &&
    !changedFields.some((field) => field.startsWith("대본"))
  ) {
    changedFields.push("JSON");
    summaryParts.push("JSON 수정");
  }

  const dedupedFields = Array.from(new Set(changedFields)).slice(0, 5);
  const dedupedSummaryParts = Array.from(new Set(summaryParts));
  const summary =
    dedupedSummaryParts.length > 0
      ? dedupedSummaryParts.slice(0, 3).join(" · ")
      : input.kind === "restore-backup"
        ? "복원 직전 안전 백업"
        : "의미 있는 변경 없음";

  return {
    kind: input.kind,
    reason: input.reason,
    summary: nextSlides.length > 0 ? `${summary} · 슬라이드 ${nextSlides.length}개` : summary,
    changeTags: dedupedFields,
    slideCount: nextSlides.length,
  };
}

function areDraftsEqual(left: StudioWorkDraft, right: StudioWorkDraft): boolean {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function prependHistoryEntry(entries: StudioHistoryEntry[], entry: StudioHistoryEntry, limit: number, preserveId?: string): StudioHistoryEntry[] {
  const nextEntries = [entry, ...entries];
  if (nextEntries.length <= limit) return nextEntries;
  const limitedEntries = nextEntries.slice(0, limit);
  if (!preserveId || limitedEntries.some((row) => row.id === preserveId)) {
    return limitedEntries;
  }
  const preserved = nextEntries.find((row) => row.id === preserveId);
  if (!preserved) return limitedEntries;
  return [...limitedEntries.slice(0, Math.max(0, limit - 1)), preserved];
}

function normalizeHistoryEntry(value: unknown): StudioHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;
  const createdAt = typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : new Date(0).toISOString();
  const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : toDefaultHistoryLabel(createdAt);
  const draft = row.draft && typeof row.draft === "object" ? cloneStudioWorkDraft(row.draft as StudioWorkDraft) : {};
  const kind = normalizeHistoryKind(row.kind, label.startsWith("수동 저장") ? "manual" : label.startsWith("복원 전 현재 상태") ? "restore-backup" : "auto");
  const reason = normalizeHistoryReason(row.reason ?? inferHistoryReason(label));
  const summary = typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : undefined;
  const changeTags = toStringList(row.changeTags);
  const slideCount = Number.isFinite(Number(row.slideCount)) ? Math.max(0, Math.floor(Number(row.slideCount))) : getDraftSlides(draft).length;
  return {
    id,
    label,
    createdAt,
    kind,
    reason,
    summary,
    changeTags,
    slideCount,
    draft,
  };
}

function readStoredHistoryState(limit: number, publishCategory: string): StudioHistoryState {
  if (typeof window === "undefined") {
    return {
      activeHistoryId: null,
      historyEntries: [],
    };
  }

  try {
    const parsed = readStoredStudioHistory(publishCategory) as Record<string, unknown>;
    const historyEntries = (Array.isArray(parsed.historyEntries) ? parsed.historyEntries : [])
      .map((entry) => normalizeHistoryEntry(entry))
      .filter((entry): entry is StudioHistoryEntry => Boolean(entry))
      .slice(0, limit);
    const activeHistoryId =
      typeof parsed.activeHistoryId === "string" && historyEntries.some((entry) => entry.id === parsed.activeHistoryId)
        ? parsed.activeHistoryId
        : null;

    return {
      activeHistoryId,
      historyEntries,
    };
  } catch {
    return {
      activeHistoryId: null,
      historyEntries: [],
    };
  }
}

export function useStudioHistory(input: {
  draft: StudioWorkDraft;
  publishCategory: string;
  restoreDraftAction: (draft: StudioWorkDraft) => void;
  limit?: number;
}) {
  const limit = Math.max(1, Math.floor(input.limit ?? 30));
  const [historyEntries, setHistoryEntries] = useState<StudioHistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const persistHistoryState = useCallback((nextEntries: StudioHistoryEntry[], nextActiveHistoryId: string | null) => {
    try {
      if (nextEntries.length <= 0) {
        removeStoredStudioHistory(input.publishCategory);
        return;
      }

      const payload: StudioHistoryState = {
        activeHistoryId: nextActiveHistoryId && nextEntries.some((entry) => entry.id === nextActiveHistoryId) ? nextActiveHistoryId : null,
        historyEntries: nextEntries.map((entry) => ({
          ...entry,
          draft: cloneStudioWorkDraft(entry.draft),
          changeTags: Array.isArray(entry.changeTags) ? [...entry.changeTags] : [],
        })),
      };
      writeStoredStudioHistory(input.publishCategory, payload);
    } catch {
      // ignore localStorage failures
    }
  }, [input.publishCategory]);

  useEffect(() => {
    const restored = readStoredHistoryState(limit, input.publishCategory);
    setHistoryEntries(restored.historyEntries);
    setActiveHistoryId(restored.activeHistoryId);
  }, [input.publishCategory, limit]);

  const captureHistory = useCallback(
    (captureInput: StudioHistoryCaptureInput) => {
      const normalizedInput =
        typeof captureInput === "string"
          ? {
              label: captureInput,
              kind: captureInput.startsWith("수동 저장") ? ("manual" as StudioHistoryKind) : ("auto" as StudioHistoryKind),
              reason: inferHistoryReason(captureInput),
            }
          : {
              label: captureInput.label,
              kind: normalizeHistoryKind(captureInput.kind, captureInput.label.startsWith("수동 저장") ? "manual" : "auto"),
              reason: normalizeHistoryReason(captureInput.reason ?? inferHistoryReason(captureInput.label)),
            };
      const createdAt = new Date().toISOString();
      const nextEntryId = createHistoryId();
      const draft = cloneStudioWorkDraft(
        typeof captureInput === "string" ? input.draft : captureInput.draftOverride ?? input.draft
      );
      const entry: StudioHistoryEntry = {
        id: nextEntryId,
        label: normalizedInput.label.trim() || toDefaultHistoryLabel(createdAt),
        createdAt,
        draft,
      };

      setHistoryEntries((prev) => {
        const nextEntry = {
          ...entry,
          ...buildHistoryMetadata({
            label: entry.label,
            kind: normalizedInput.kind,
            reason: normalizedInput.reason,
            draft: entry.draft,
            previousDraft: prev[0]?.draft || null,
          }),
        };
        const nextEntries = prependHistoryEntry(prev, nextEntry, limit);
        persistHistoryState(nextEntries, entry.id);
        return nextEntries;
      });
      setActiveHistoryId(nextEntryId);
      return nextEntryId;
    },
    [input.draft, limit, persistHistoryState]
  );

  const restoreHistory = useCallback(
    (id: string) => {
      const target = historyEntries.find((entry) => entry.id === id);
      if (!target) return;

      const currentDraft = cloneStudioWorkDraft(input.draft);
      const targetDraft = cloneStudioWorkDraft(target.draft);
      let nextEntries = historyEntries;
      if (!areDraftsEqual(currentDraft, targetDraft)) {
        const createdAt = new Date().toISOString();
        const backupEntry: StudioHistoryEntry = {
          id: createHistoryId(),
          label: "복원 전 현재 상태",
          createdAt,
          draft: currentDraft,
          ...buildHistoryMetadata({
            label: "복원 전 현재 상태",
            kind: "restore-backup",
            reason: "restore_backup",
            draft: currentDraft,
            previousDraft: historyEntries[0]?.draft || null,
          }),
        };
        nextEntries = prependHistoryEntry(historyEntries, backupEntry, limit, id);
        setHistoryEntries(nextEntries);
      }

      input.restoreDraftAction(targetDraft);
      setActiveHistoryId(id);
      persistHistoryState(nextEntries, id);
    },
    [historyEntries, input, limit, persistHistoryState]
  );

  const deleteHistory = useCallback(
    (id: string) => {
      setHistoryEntries((prev) => {
        const nextEntries = prev.filter((entry) => entry.id !== id);
        const nextActiveHistoryId = activeHistoryId === id ? null : activeHistoryId;
        persistHistoryState(nextEntries, nextActiveHistoryId);
        setActiveHistoryId(nextActiveHistoryId);
        return nextEntries;
      });
    },
    [activeHistoryId, persistHistoryState]
  );

  const clearHistory = useCallback(() => {
    setHistoryEntries([]);
    setActiveHistoryId(null);
    try {
      removeStoredStudioHistory(input.publishCategory);
    } catch {
      // ignore localStorage failures
    }
  }, [input.publishCategory]);

  return {
    historyEntries,
    activeHistoryId,
    captureHistory,
    restoreHistory,
    deleteHistory,
    clearHistory,
  };
}

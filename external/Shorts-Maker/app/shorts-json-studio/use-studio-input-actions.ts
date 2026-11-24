"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { requestStudioDialogueSpeakerPlan, type ApiErrorResponse } from "@/lib/api/studio-client";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type { PublishCategory } from "@/lib/publish/types";
import type { ImageSource } from "@/types/studio-json";
import { clearManualImagePromptsFromScriptJson } from "./studio-page-helpers";
import type { StudioImageSearchSource } from "./types";

type ScriptDialogueMode = "normal" | "dialogue";
type SpeakerVoiceEditorRow = { speakerId: string; voiceId: string };
type StoryCharacterProfileEditorRow = {
  characterId: string;
  displayName: string;
  identityPrompt: string;
  anchorImageUrl: string;
  anchorAssetId: string;
};
type SpeakerVoiceChangeOptions = {
  renamedSpeakerIds?: Record<string, string>;
};

function hasMeaningfulProfileValue(value: unknown): boolean {
  return typeof value === "string" ? Boolean(value.trim()) : value !== undefined && value !== null;
}

function mergeCharacterProfileRows(
  fallback: Record<string, unknown>,
  preferred: Record<string, unknown>,
  characterId: string
): Record<string, unknown> {
  const merged = { ...fallback };
  for (const [key, value] of Object.entries(preferred)) {
    if (key === "characterId" || !hasMeaningfulProfileValue(value)) continue;
    merged[key] = value;
  }
  merged.characterId = characterId;
  return merged;
}

type CodexUsageState = {
  inputTokens: number;
  outputTokens: number;
};

type UseStudioInputActionsInput = {
  canEditSelectedCategory: boolean;
  codexModel: string;
  ensureEditPermission: (showAlert?: boolean) => boolean;
  ensurePublishPermission: (showAlert?: boolean) => boolean;
  jsonInputStartedRef: MutableRefObject<boolean>;
  nowMsAction: () => number;
  onImagePromptInputsChangeAction: (nextJson: Record<string, unknown>) => void;
  parsed: unknown;
  publishCategory: PublishCategory;
  selectedQuoteVoiceId: string;
  selectedVoiceId: string;
  setCodexUsage: Dispatch<SetStateAction<CodexUsageState | null>>;
  setDebugImageSearch: Dispatch<SetStateAction<boolean>>;
  setImageSource: Dispatch<SetStateAction<ImageSource>>;
  setImageSearchSource: Dispatch<SetStateAction<StudioImageSearchSource>>;
  setJsonText: Dispatch<SetStateAction<string>>;
  setQuickScheduledAt: Dispatch<SetStateAction<string>>;
  setScriptMode: Dispatch<SetStateAction<ScriptDialogueMode>>;
  setScriptText: Dispatch<SetStateAction<string>>;
  setScriptToJsonBusy: Dispatch<SetStateAction<boolean>>;
  setScriptToJsonStatus: Dispatch<SetStateAction<string>>;
  setShowJsonEditor: Dispatch<SetStateAction<boolean>>;
  setTopicText: Dispatch<SetStateAction<string>>;
  toEventDetailFromApiErrorAction: (data: ApiErrorResponse, fallback: string) => string;
  toTimingDetailAction: (label: string, ms: number, extra?: string) => string;
  topicInputStartedRef: MutableRefObject<boolean>;
};

function normalizeScriptWhitespace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeSpeakerVoiceEditorRows(rows: Array<{ speakerId: string; voiceId: string }>): SpeakerVoiceEditorRow[] {
  const deduped = new Map<string, string>();
  for (const row of rows) {
    const speakerId = String(row.speakerId || "").trim().replace(/\s+/g, "_").slice(0, 40);
    const voiceId = String(row.voiceId || "").trim();
    if (!speakerId) continue;
    if (!deduped.has(speakerId)) {
      deduped.set(speakerId, voiceId);
      continue;
    }
    if (voiceId) {
      deduped.set(speakerId, voiceId);
    }
  }
  return Array.from(deduped.entries()).map(([speakerId, voiceId]) => ({ speakerId, voiceId }));
}

function toSpeakerVoiceMap(rows: Array<{ speakerId: string; voiceId: string }>): Record<string, string> {
  return Object.fromEntries(normalizeSpeakerVoiceEditorRows(rows).map((row) => [row.speakerId, row.voiceId]));
}

function normalizeSpeakerRenameMap(value?: Record<string, string>): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, string> = {};
  for (const [rawPreviousSpeakerId, rawNextSpeakerId] of Object.entries(value)) {
    const previousSpeakerId = String(rawPreviousSpeakerId || "").trim().replace(/\s+/g, "_").slice(0, 40);
    const nextSpeakerId = String(rawNextSpeakerId || "").trim().replace(/\s+/g, "_").slice(0, 40);
    if (!previousSpeakerId || !nextSpeakerId || previousSpeakerId === nextSpeakerId) continue;
    next[previousSpeakerId] = nextSpeakerId;
  }
  return next;
}

function normalizeStoryCharacterProfileEditorRows(
  rows: StoryCharacterProfileEditorRow[]
): StoryCharacterProfileEditorRow[] {
  const deduped = new Map<string, StoryCharacterProfileEditorRow>();
  for (const row of rows) {
    const characterId = String(row.characterId || "").trim().replace(/\s+/g, "_").slice(0, 40);
    if (!characterId) continue;
    deduped.set(characterId, {
      characterId,
      displayName: normalizeScriptWhitespace(row.displayName).slice(0, 80),
      identityPrompt: normalizeScriptWhitespace(row.identityPrompt),
      anchorImageUrl: normalizeScriptWhitespace(row.anchorImageUrl).slice(0, 400),
      anchorAssetId: normalizeScriptWhitespace(row.anchorAssetId).slice(0, 120),
    });
  }
  return Array.from(deduped.values());
}

export function applySpeakerRenameMapToScriptJson(
  source: Record<string, unknown>,
  renamedSpeakerIds?: Record<string, string>
): Record<string, unknown> {
  const renameMap = normalizeSpeakerRenameMap(renamedSpeakerIds);
  if (Object.keys(renameMap).length <= 0) {
    return source;
  }

  let changed = false;
  const nextSlides = Array.isArray(source.slides)
    ? source.slides.map((item) => {
        if (!item || typeof item !== "object") return item;
        const slide = item as Record<string, unknown>;
        let slideChanged = false;
        const nextDialogueSegments = Array.isArray(slide.dialogueSegments)
          ? slide.dialogueSegments.map((segment) => {
              if (!segment || typeof segment !== "object") return segment;
              const row = segment as Record<string, unknown>;
              const speakerId = String(row.speakerId || "").trim().replace(/\s+/g, "_").slice(0, 40);
              const nextSpeakerId = renameMap[speakerId];
              if (!speakerId || !nextSpeakerId || nextSpeakerId === speakerId) return segment;
              slideChanged = true;
              changed = true;
              return {
                ...row,
                speakerId: nextSpeakerId,
              };
            })
          : slide.dialogueSegments;
        const nextCharacterIds = Array.isArray(slide.characterIds)
          ? Array.from(new Set(slide.characterIds.map((characterId) => {
              const normalizedCharacterId = String(characterId || "").trim().replace(/\s+/g, "_").slice(0, 40);
              const nextCharacterId = renameMap[normalizedCharacterId];
              if (!normalizedCharacterId || !nextCharacterId || nextCharacterId === normalizedCharacterId) return characterId;
              slideChanged = true;
              changed = true;
              return nextCharacterId;
            }).map((characterId) => String(characterId || "").trim()).filter(Boolean)))
          : slide.characterIds;
        if (!slideChanged) return item;
        const { manualImagePrompt: _manualImagePrompt, ...nextSlide } = slide;
        return {
          ...nextSlide,
          dialogueSegments: nextDialogueSegments,
          characterIds: nextCharacterIds,
        };
      })
    : source.slides;

  const nextCharacterProfiles = (() => {
    if (!Array.isArray(source.characterProfiles)) return source.characterProfiles;
    const canonicalRows: Array<{ characterId: string; row: Record<string, unknown> }> = [];
    const renamedRows: Array<{ characterId: string; row: Record<string, unknown> }> = [];
    const passthroughRows: unknown[] = [];
    for (const item of source.characterProfiles) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        passthroughRows.push(item);
        continue;
      }
      const row = item as Record<string, unknown>;
      const characterId = String(row.characterId || "").trim().replace(/\s+/g, "_").slice(0, 40);
      const nextCharacterId = renameMap[characterId] || characterId;
      if (!characterId || !nextCharacterId) {
        passthroughRows.push(item);
        continue;
      }
      if (nextCharacterId !== characterId) changed = true;
      const mapped = { ...row, characterId: nextCharacterId };
      (nextCharacterId === characterId ? canonicalRows : renamedRows).push({ characterId: nextCharacterId, row: mapped });
    }
    const mergedById = new Map<string, Record<string, unknown>>();
    for (const item of canonicalRows) {
      const existing = mergedById.get(item.characterId);
      mergedById.set(
        item.characterId,
        existing ? mergeCharacterProfileRows(existing, item.row, item.characterId) : item.row
      );
    }
    for (const item of renamedRows) {
      const existing = mergedById.get(item.characterId);
      mergedById.set(
        item.characterId,
        existing ? mergeCharacterProfileRows(item.row, existing, item.characterId) : item.row
      );
    }
    return [...mergedById.values(), ...passthroughRows];
  })();

  if (!changed) return source;
  return clearManualImagePromptsFromScriptJson({
    ...source,
    slides: nextSlides,
    characterProfiles: nextCharacterProfiles,
  });
}

function updateStoryCharacterProfilesInScriptJson(
  source: Record<string, unknown>,
  rows: StoryCharacterProfileEditorRow[]
): Record<string, unknown> {
  const normalizedRows = normalizeStoryCharacterProfileEditorRows(rows);
  const characterProfiles = normalizedRows
    .filter((row) => row.displayName || row.identityPrompt || row.anchorImageUrl || row.anchorAssetId)
    .map((row) => ({
      characterId: row.characterId,
      displayName: row.displayName || undefined,
      identityPrompt: row.identityPrompt || undefined,
      anchorImageUrl: row.anchorImageUrl || undefined,
      anchorAssetId: row.anchorAssetId || undefined,
    }));

  const next: Record<string, unknown> = { ...source };
  if (characterProfiles.length <= 0) {
    delete next.characterProfiles;
  } else {
    next.characterProfiles = characterProfiles;
  }

  if (Array.isArray(source.slides)) {
    next.slides = source.slides.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const { manualImagePrompt: _manualImagePrompt, ...slide } = item as Record<string, unknown>;
      return slide;
    });
  }

  return next;
}

function updateImageStylePromptInScriptJson(source: Record<string, unknown>, value: string): Record<string, unknown> {
  const imageStylePrompt = normalizeScriptWhitespace(value).slice(0, 1400);
  if (!imageStylePrompt) {
    if (!Object.prototype.hasOwnProperty.call(source, "imageStylePrompt")) return source;
    const next = { ...source };
    delete next.imageStylePrompt;
    return clearManualImagePromptsFromScriptJson(next);
  }
  if (String(source.imageStylePrompt || "").trim() === imageStylePrompt) return source;
  return clearManualImagePromptsFromScriptJson({
    ...source,
    imageStylePrompt,
  });
}

function updateFixedCharacterProfileIdInScriptJson(
  source: Record<string, unknown>,
  value: string
): Record<string, unknown> {
  const fixedCharacterProfileId = normalizeScriptWhitespace(value)
    .replace(/\s+/g, "_")
    .slice(0, 40);
  if (!fixedCharacterProfileId) {
    if (!Object.prototype.hasOwnProperty.call(source, "fixedCharacterProfileId")) return source;
    const next = { ...source };
    delete next.fixedCharacterProfileId;
    return clearManualImagePromptsFromScriptJson(next);
  }
  if (String(source.fixedCharacterProfileId || "").trim() === fixedCharacterProfileId) return source;
  return clearManualImagePromptsFromScriptJson({
    ...source,
    fixedCharacterProfileId,
  });
}

export function useStudioInputActions(input: UseStudioInputActionsInput) {
  const handleTopicTextChange = useCallback((value: string) => {
    if (!input.canEditSelectedCategory) return;
    input.setTopicText(value);
    if (input.topicInputStartedRef.current) return;
    if (!value.trim()) return;
    input.topicInputStartedRef.current = true;
    trackWorkflowEvent({
      name: "topic_input_started",
      page: "studio",
      stage: "input",
      status: "success",
    });
  }, [input.canEditSelectedCategory, input.setTopicText, input.topicInputStartedRef]);

  const handleScriptTextChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setScriptText(value);
    },
    [input.ensureEditPermission, input.setScriptText]
  );

  const handleImageSearchSourceChange = useCallback(
    (value: StudioImageSearchSource) => {
      if (!input.ensureEditPermission(false)) return;
      input.setImageSearchSource(value);
    },
    [input.ensureEditPermission, input.setImageSearchSource]
  );

  const handleImageSourceChange = useCallback(
    (value: ImageSource) => {
      if (!input.ensureEditPermission(false)) return;
      input.setImageSource(value);
    },
    [input.ensureEditPermission, input.setImageSource]
  );

  const handleDebugImageSearchChange = useCallback(
    (value: boolean) => {
      if (!input.ensureEditPermission(false)) return;
      input.setDebugImageSearch(value);
    },
    [input.ensureEditPermission, input.setDebugImageSearch]
  );

  const handleQuickScheduledAtChange = useCallback(
    (value: string) => {
      if (!input.ensurePublishPermission(false)) return;
      input.setQuickScheduledAt(value);
    },
    [input.ensurePublishPermission, input.setQuickScheduledAt]
  );

  const handleJsonTextChange = useCallback((value: string) => {
    if (!input.ensureEditPermission(false)) return;
    input.setJsonText(value);
    if (input.jsonInputStartedRef.current) return;
    if (!value.trim()) return;
    input.jsonInputStartedRef.current = true;
    trackWorkflowEvent({
      name: "json_input_started",
      page: "studio",
      stage: "input",
      status: "success",
    });
  }, [input.ensureEditPermission, input.jsonInputStartedRef, input.setJsonText]);

  const handleScriptModeChange = useCallback(
    (mode: ScriptDialogueMode) => {
      if (!input.ensureEditPermission()) return;
      input.setScriptMode(mode);
      if (!input.parsed || typeof input.parsed !== "object") return;
      const source = { ...(input.parsed as Record<string, unknown>) };
      source.mode = mode;
      const selectedVoice = input.selectedVoiceId.trim();
      const selectedQuoteVoice = input.selectedQuoteVoiceId.trim() || selectedVoice;
      if (mode === "dialogue") {
        const narrationVoice = typeof source.narrationVoice === "string" ? source.narrationVoice.trim() : "";
        const quoteVoice = typeof source.quoteVoice === "string" ? source.quoteVoice.trim() : "";
        if (!narrationVoice && selectedVoice) {
          source.narrationVoice = selectedVoice;
        }
        if (!quoteVoice && selectedQuoteVoice) {
          source.quoteVoice = selectedQuoteVoice;
        }
      } else {
        if (Object.prototype.hasOwnProperty.call(source, "quoteVoice")) {
          delete source.quoteVoice;
        }
        if (Object.prototype.hasOwnProperty.call(source, "speakerVoices")) {
          delete source.speakerVoices;
        }
      }
      handleJsonTextChange(JSON.stringify(source, null, 2));
      input.setShowJsonEditor(true);
    },
    [
      handleJsonTextChange,
      input.ensureEditPermission,
      input.parsed,
      input.selectedQuoteVoiceId,
      input.selectedVoiceId,
      input.setScriptMode,
      input.setShowJsonEditor,
    ]
  );

  const handleSpeakerVoicesChange = useCallback(
    (rows: SpeakerVoiceEditorRow[], options?: SpeakerVoiceChangeOptions) => {
      if (!input.ensureEditPermission()) return;
      input.setScriptMode("dialogue");
      if (!input.parsed || typeof input.parsed !== "object") return;
      const renamedSource = applySpeakerRenameMapToScriptJson(
        input.parsed as Record<string, unknown>,
        options?.renamedSpeakerIds
      );
      const source = { ...renamedSource };
      source.mode = "dialogue";
      const narrationVoiceId = input.selectedVoiceId.trim() || String(source.narrationVoice || "").trim();
      const quoteVoiceId =
        input.selectedQuoteVoiceId.trim() ||
        String(source.quoteVoice || "").trim() ||
        narrationVoiceId;
      const speakerVoices = toSpeakerVoiceMap(rows);
      if (Object.keys(speakerVoices).length > 0) {
        source.speakerVoices = speakerVoices;
      } else if (Object.prototype.hasOwnProperty.call(source, "speakerVoices")) {
        delete source.speakerVoices;
      }
      if (!String(source.narrationVoice || "").trim() && narrationVoiceId) {
        source.narrationVoice = narrationVoiceId;
      }
      if (!String(source.quoteVoice || "").trim() && quoteVoiceId) {
        source.quoteVoice = quoteVoiceId;
      }
      handleJsonTextChange(JSON.stringify(source, null, 2));
      input.setShowJsonEditor(true);
    },
    [
      handleJsonTextChange,
      input.ensureEditPermission,
      input.parsed,
      input.selectedQuoteVoiceId,
      input.selectedVoiceId,
      input.setScriptMode,
      input.setShowJsonEditor,
    ]
  );

  const handleStoryCharacterProfilesChange = useCallback(
    (rows: StoryCharacterProfileEditorRow[]) => {
      if (!input.ensureEditPermission()) return;
      if (!input.parsed || typeof input.parsed !== "object") return;
      const source = updateStoryCharacterProfilesInScriptJson(input.parsed as Record<string, unknown>, rows);
      handleJsonTextChange(JSON.stringify(source, null, 2));
      input.setShowJsonEditor(true);
    },
    [handleJsonTextChange, input.ensureEditPermission, input.parsed, input.setShowJsonEditor]
  );

  const handleImageStylePromptChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission()) return;
      if (!input.parsed || typeof input.parsed !== "object") return;
      const source = updateImageStylePromptInScriptJson(input.parsed as Record<string, unknown>, value);
      handleJsonTextChange(JSON.stringify(source, null, 2));
      input.onImagePromptInputsChangeAction(source);
      input.setShowJsonEditor(true);
    },
    [
      handleJsonTextChange,
      input.ensureEditPermission,
      input.onImagePromptInputsChangeAction,
      input.parsed,
      input.setShowJsonEditor,
    ]
  );

  const handleFixedCharacterProfileIdChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission()) return;
      if (!input.parsed || typeof input.parsed !== "object") return;
      const source = updateFixedCharacterProfileIdInScriptJson(
        input.parsed as Record<string, unknown>,
        value
      );
      handleJsonTextChange(JSON.stringify(source, null, 2));
      input.onImagePromptInputsChangeAction(source);
      input.setShowJsonEditor(true);
    },
    [
      handleJsonTextChange,
      input.ensureEditPermission,
      input.onImagePromptInputsChangeAction,
      input.parsed,
      input.setShowJsonEditor,
    ]
  );

  const handleAssignDialogueSpeakers = useCallback(async () => {
    if (!input.ensureEditPermission()) return;
    if (!input.parsed || typeof input.parsed !== "object") return;

    input.setScriptToJsonBusy(true);
    input.setScriptToJsonStatus("Codex CLI로 화자 지정을 요청하는 중입니다.");
    trackWorkflowEvent({
      name: "script_to_json_clicked",
      page: "studio",
      stage: "input",
      status: "success",
      detail: "mode=speaker_assign",
    });

    const startedAt = input.nowMsAction();
    try {
      const { responseOk, data } = await requestStudioDialogueSpeakerPlan({
        json: input.parsed as Record<string, unknown>,
        publishCategory: input.publishCategory,
        codexModel: input.codexModel || undefined,
      });

      if (!responseOk || !("ok" in data) || !data.ok) {
        const reason = "error" in data ? data.error : "화자 지정에 실패했습니다.";
        const detail = "error" in data ? input.toEventDetailFromApiErrorAction(data, reason) : reason;
        trackWorkflowEvent({
          name: "script_to_json_failed",
          page: "studio",
          stage: "input",
          status: "failure",
          detail: `mode=speaker_assign, ${detail}, ${input.toTimingDetailAction("dialogue_speaker_assign", input.nowMsAction() - startedAt)}`,
          errorCode: "errorCode" in data ? data.errorCode : undefined,
          retryable: "retryable" in data ? data.retryable : undefined,
        });
        throw new Error(reason);
      }

      const nextJson = clearManualImagePromptsFromScriptJson(data.json);
      input.setScriptMode("dialogue");
      handleJsonTextChange(JSON.stringify(nextJson, null, 2));
      input.onImagePromptInputsChangeAction(nextJson);
      input.setShowJsonEditor(true);
      input.setScriptToJsonStatus(
        `화자 지정 완료 · model=${data.usage?.model || "unknown"} · ${Math.max(0, Math.round(input.nowMsAction() - startedAt))}ms`
      );
      trackWorkflowEvent({
        name: "script_to_json_succeeded",
        page: "studio",
        stage: "input",
        status: "success",
        detail: input.toTimingDetailAction(
          "dialogue_speaker_assign",
          input.nowMsAction() - startedAt,
          `mode=speaker_assign, model=${data.usage?.model || "unknown"}`
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.setScriptToJsonStatus(`화자 지정 실패: ${message}`);
      alert(message);
    } finally {
      input.setScriptToJsonBusy(false);
    }
  }, [
    handleJsonTextChange,
    input.codexModel,
    input.ensureEditPermission,
    input.nowMsAction,
    input.onImagePromptInputsChangeAction,
    input.parsed,
    input.publishCategory,
    input.setCodexUsage,
    input.setScriptMode,
    input.setScriptToJsonBusy,
    input.setScriptToJsonStatus,
    input.setShowJsonEditor,
    input.toEventDetailFromApiErrorAction,
    input.toTimingDetailAction,
  ]);

  return {
    handleTopicTextChange,
    handleScriptTextChange,
    handleImageSourceChange,
    handleImageSearchSourceChange,
    handleDebugImageSearchChange,
    handleQuickScheduledAtChange,
    handleJsonTextChange,
    handleScriptModeChange,
    handleSpeakerVoicesChange,
    handleStoryCharacterProfilesChange,
    handleFixedCharacterProfileIdChange,
    handleImageStylePromptChange,
    handleAssignDialogueSpeakers,
  };
}

export const __internal = {
  applySpeakerRenameMapToScriptJson,
  toSpeakerVoiceMap,
  updateStoryCharacterProfilesInScriptJson,
  updateFixedCharacterProfileIdInScriptJson,
  updateImageStylePromptInScriptJson,
};

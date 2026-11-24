"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { StudioVoicePicker } from "@/components/studio-voice-picker";
import { StudioCharacterProfileEditor } from "./studio-character-profile-editor";
import { StudioSceneStructureEditor } from "./studio-scene-structure-editor";
import {
  assignDialogueSegmentSpeakerInScriptJson,
  extractDialogueSpeakerAssignmentRows,
  type DialogueSpeakerAssignmentRow,
} from "@/app/shorts-json-studio/studio-page-helpers";
import {
  resolveStudioScriptJsonPanelScopeVisibility,
  resolveStudioScriptJsonPanelSectionScope,
  type StudioScriptJsonPanelSectionScope,
} from "../studio-script-json-panel-scopes";
import { STUDIO_IMAGE_STYLE_PRESETS } from "../image-style-presets";
import type { StudioVoiceOption } from "../use-studio-bootstrap-data";
import type { ImageSource } from "@/types/studio-json";

type SpeakerVoiceRow = {
  speakerId: string;
  voiceId: string;
  sampleTexts?: string[];
  quoteCount?: number;
  isUnknown?: boolean;
};

type StoryCharacterProfileRow = {
  characterId: string;
  displayName: string;
  identityPrompt: string;
  anchorImageUrl: string;
  anchorAssetId: string;
  sampleTexts: string[];
  isInferred: boolean;
};

type StudioScriptJsonPanelProps = {
  sectionScope?: StudioScriptJsonPanelSectionScope;
  imageSource: ImageSource;
  topicText: string;
  scriptText: string;
  topicToScriptBusy: boolean;
  topicToScriptStatus: string;
  scriptToJsonBusy: boolean;
  scriptToJsonStatus: string;
  scriptMode: "normal" | "dialogue";
  voiceOptions: StudioVoiceOption[];
  selectedVoiceId: string;
  selectedTypecastSpeed: string;
  selectedQuoteVoiceId: string;
  selectedMaleVoiceId: string;
  selectedFemaleVoiceId: string;
  speakerVoices: SpeakerVoiceRow[];
  storyCharacterProfiles: StoryCharacterProfileRow[];
  hasFixedCharacterProfile?: boolean;
  imageStylePrompt: string;
  speakerAssignBusy: boolean;
  voicePreviewLoading: boolean;
  voicePreviewPlaying: boolean;
  showJsonEditor: boolean;
  jsonText: string;
  isJsonValid: boolean;
  disabled?: boolean;
  onTopicTextChangeAction: (value: string) => void;
  onScriptTextChangeAction: (value: string) => void;
  onGenerateScriptFromTopicAction: () => void | Promise<void>;
  onConvertScriptToJsonAction: () => void | Promise<void>;
  onConvertScriptTextOnlyAction: () => void | Promise<void>;
  onScriptModeChangeAction: (value: "normal" | "dialogue") => void;
  onVoiceChangeAction: (value: string) => void;
  onPreviewVoiceAction: (voiceId?: string, previewText?: string, speedOverride?: number) => void;
  onStopVoicePreviewAction: () => void;
  onAssignDialogueSpeakersAction: () => void | Promise<void>;
  onDialogueSpeakerAssignmentAction: (nextJson: Record<string, unknown>) => void;
  onSpeakerVoicesChangeAction: (
    value: SpeakerVoiceRow[],
    options?: { renamedSpeakerIds?: Record<string, string> }
  ) => void;
  onStoryCharacterProfilesChangeAction: (value: StoryCharacterProfileRow[]) => void;
  onImageStylePromptChangeAction: (value: string) => void;
  onToggleJsonEditorAction: () => void;
  onJsonTextChangeAction: (value: string) => void;
  onJsonTextCommitAction: (value: string, previousValue: string) => void;
};

function toDialogueAssignmentKey(assignment: Pick<DialogueSpeakerAssignmentRow, "slideIndex" | "segmentIndex">): string {
  return `${assignment.slideIndex}:${assignment.segmentIndex}`;
}

export function StudioScriptJsonPanel({
  sectionScope,
  imageSource,
  topicText,
  scriptText,
  topicToScriptBusy,
  topicToScriptStatus,
  scriptToJsonBusy,
  scriptToJsonStatus,
  scriptMode,
  voiceOptions,
  selectedVoiceId,
  selectedTypecastSpeed,
  selectedQuoteVoiceId,
  selectedMaleVoiceId,
  selectedFemaleVoiceId,
  speakerVoices,
  storyCharacterProfiles,
  hasFixedCharacterProfile = false,
  imageStylePrompt,
  speakerAssignBusy,
  voicePreviewLoading,
  voicePreviewPlaying,
  showJsonEditor,
  jsonText,
  isJsonValid,
  disabled = false,
  onTopicTextChangeAction,
  onScriptTextChangeAction,
  onGenerateScriptFromTopicAction,
  onConvertScriptToJsonAction,
  onConvertScriptTextOnlyAction,
  onScriptModeChangeAction,
  onVoiceChangeAction,
  onPreviewVoiceAction,
  onStopVoicePreviewAction,
  onAssignDialogueSpeakersAction,
  onDialogueSpeakerAssignmentAction,
  onSpeakerVoicesChangeAction,
  onStoryCharacterProfilesChangeAction,
  onImageStylePromptChangeAction,
  onToggleJsonEditorAction,
  onJsonTextChangeAction,
  onJsonTextCommitAction,
}: StudioScriptJsonPanelProps) {
  const topicTextareaId = "studio-topic-input";
  const scriptTextareaId = "studio-script-input";
  const jsonTextareaId = "studio-json-editor";
  const imageStyleTextareaId = "studio-image-style-prompt";
  const narrationVoiceSelectId = "studio-json-narration-voice";
  const speakerRows = speakerVoices.length > 0 ? speakerVoices : [];
  const resolvedSectionScope = resolveStudioScriptJsonPanelSectionScope(sectionScope);
  const scopeVisibility = resolveStudioScriptJsonPanelScopeVisibility(
    sectionScope,
    imageSource,
    hasFixedCharacterProfile
  );
  const [draggingSpeakerId, setDraggingSpeakerId] = useState("");
  const [draggingDialogueKey, setDraggingDialogueKey] = useState("");
  const [dragOverDialogueKey, setDragOverDialogueKey] = useState("");
  const [dragOverSpeakerId, setDragOverSpeakerId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const jsonEditStartValueRef = useRef<string | null>(null);
  const showSpeakerVoiceMapping = scriptMode === "dialogue" || speakerRows.length > 0;
  const hasTopic = Boolean(topicText.trim());
  const hasScript = Boolean(scriptText.trim());
  const scriptSourceBusy = topicToScriptBusy || scriptToJsonBusy;
  const parsedJsonForAssignments = useMemo<Record<string, unknown> | null>(() => {
    if (!isJsonValid) return null;
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [isJsonValid, jsonText]);
  const dialogueAssignments = useMemo(
    () => extractDialogueSpeakerAssignmentRows(parsedJsonForAssignments),
    [parsedJsonForAssignments]
  );
  const dialogueAssignmentByKey = useMemo(
    () => new Map(dialogueAssignments.map((assignment) => [toDialogueAssignmentKey(assignment), assignment] as const)),
    [dialogueAssignments]
  );
  const selectedImageStylePresetId = useMemo(() => {
    const normalizedPrompt = imageStylePrompt.trim();
    return STUDIO_IMAGE_STYLE_PRESETS.find((preset) => preset.prompt === normalizedPrompt)?.id || "";
  }, [imageStylePrompt]);
  const selectedVoiceLabel = useMemo(() => {
    if (!selectedVoiceId.trim()) return "기본 음성";
    return voiceOptions.find((voice) => voice.id === selectedVoiceId)?.label || selectedVoiceId;
  }, [selectedVoiceId, voiceOptions]);
  const selectedSpeakerAvailable = Boolean(selectedSpeakerId && speakerRows.some((row) => row.speakerId === selectedSpeakerId));
  const headingCopy =
    resolvedSectionScope === "script"
      ? { title: "대본·장면 구조" }
      : resolvedSectionScope === "voice"
        ? { title: "라인별 음성" }
        : resolvedSectionScope === "image"
          ? { title: "이미지 스타일" }
          : { title: "대본 만들기" };
  const statusLabel =
    resolvedSectionScope === "script"
      ? isJsonValid
        ? "장면 구조 준비됨"
        : hasScript
          ? "장면 구조 만들기 전"
          : hasTopic
            ? "대본 초안 생성 전"
            : "대본 입력 필요"
      : resolvedSectionScope === "voice"
        ? scriptMode === "dialogue" || speakerRows.length > 0
          ? "대화 음성 조정"
          : "대화형 설정 필요"
        : resolvedSectionScope === "image"
          ? imageStylePrompt.trim()
            ? "스타일 선택됨"
            : "대본 기준 자동"
          : isJsonValid
            ? "장면 구조 준비됨"
            : hasScript
              ? "장면 구조 만들기 전"
              : hasTopic
                ? "대본 초안 생성 전"
                : "대본 입력 필요";
  const statusIsReady =
    resolvedSectionScope === "image"
      ? true
      : resolvedSectionScope === "voice"
        ? Boolean(scriptMode === "dialogue" || speakerRows.length > 0)
        : isJsonValid;
  const getNextSpeakerSlotId = (role: "male" | "female" | "unknown", excludingSpeakerId?: string) => {
    let maxIndex = 0;
    for (const row of speakerRows) {
      const speakerId = String(row.speakerId || "").trim().toLowerCase();
      if (!speakerId || speakerId === String(excludingSpeakerId || "").trim().toLowerCase()) continue;
      const matched = speakerId.match(new RegExp(`^${role}_(\\d+)$`, "u"));
      const index = Number(matched?.[1] || "");
      if (Number.isFinite(index) && index > maxIndex) {
        maxIndex = index;
      }
    }
    return `${role}_${maxIndex + 1}`;
  };
  const addSpeakerRow = () => {
    const nextSpeakerId = getNextSpeakerSlotId("unknown");
    onSpeakerVoicesChangeAction([
      ...speakerRows,
      {
        speakerId: nextSpeakerId,
        voiceId: "",
        sampleTexts: [],
        quoteCount: 0,
        isUnknown: true,
      },
    ]);
    setSelectedSpeakerId(nextSpeakerId);
  };
  const assignDialogueSpeaker = (assignment: DialogueSpeakerAssignmentRow, speakerId: string) => {
    if (disabled || !isJsonValid || !parsedJsonForAssignments) return;
    const next = assignDialogueSegmentSpeakerInScriptJson(parsedJsonForAssignments, {
      slideIndex: assignment.slideIndex,
      segmentIndex: assignment.segmentIndex,
      speakerId,
    });
    if (next === parsedJsonForAssignments) return;
    onDialogueSpeakerAssignmentAction(next);
  };
  const resolveDraggedSpeakerId = (event: DragEvent<HTMLElement>): string => {
    return (
      event.dataTransfer.getData("application/x-studio-speaker-id") ||
      draggingSpeakerId
    ).trim();
  };
  const resolveDraggedDialogueAssignment = (event: DragEvent<HTMLElement>): DialogueSpeakerAssignmentRow | null => {
    const key = (
      event.dataTransfer.getData("application/x-studio-dialogue-assignment") ||
      draggingDialogueKey
    ).trim();
    return dialogueAssignmentByKey.get(key) || null;
  };
  const renderDialogueAssignmentBoard = () => {
    if (dialogueAssignments.length <= 0) return null;
    return (
      <div className="studio-script-json-match-board">
        <div className="studio-script-json-match-column studio-script-json-match-speakers">
          <div className="studio-script-json-match-column-head">
            <strong>화자</strong>
            <span>{speakerRows.length}명</span>
          </div>
          <div className="studio-script-json-speaker-token-list">
            {speakerRows.map((row) => {
              const isSelected = selectedSpeakerId === row.speakerId;
              const isDragOver = dragOverSpeakerId === row.speakerId;
              return (
                <button
                  key={`speaker-token:${row.speakerId}`}
                  type="button"
                  className={`studio-script-json-speaker-token${isSelected ? " is-selected" : ""}${isDragOver ? " is-drag-over" : ""}`}
                  disabled={disabled || !isJsonValid}
                  draggable={!disabled && isJsonValid}
                  onClick={() => setSelectedSpeakerId(row.speakerId)}
                  onDragStart={(event) => {
                    setDraggingSpeakerId(row.speakerId);
                    event.dataTransfer.effectAllowed = "copyMove";
                    event.dataTransfer.setData("application/x-studio-speaker-id", row.speakerId);
                    event.dataTransfer.setData("text/plain", row.speakerId);
                  }}
                  onDragEnd={() => {
                    setDraggingSpeakerId("");
                    setDragOverDialogueKey("");
                    setDragOverSpeakerId("");
                  }}
                  onDragOver={(event) => {
                    const assignment = resolveDraggedDialogueAssignment(event);
                    if (!assignment) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dragOverSpeakerId !== row.speakerId) setDragOverSpeakerId(row.speakerId);
                  }}
                  onDragLeave={() => {
                    if (dragOverSpeakerId === row.speakerId) setDragOverSpeakerId("");
                  }}
                  onDrop={(event) => {
                    const assignment = resolveDraggedDialogueAssignment(event);
                    if (!assignment) return;
                    event.preventDefault();
                    assignDialogueSpeaker(assignment, row.speakerId);
                    setDraggingDialogueKey("");
                    setDragOverSpeakerId("");
                  }}
                >
                  <span className="studio-script-json-speaker-token-id">{row.speakerId}</span>
                  <span className="studio-script-json-speaker-token-meta">{row.quoteCount || 0}개</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="studio-script-json-match-column studio-script-json-match-dialogues">
          <div className="studio-script-json-match-column-head">
            <strong>대사</strong>
            <span>{dialogueAssignments.length}줄</span>
          </div>
          <div className="studio-script-json-dialogue-card-list">
            {dialogueAssignments.map((assignment) => {
              const key = toDialogueAssignmentKey(assignment);
              const isDragOver = dragOverDialogueKey === key;
              return (
                <article
                  key={`dialogue-assignment:${key}`}
                  className={`studio-script-json-dialogue-card${isDragOver ? " is-drag-over" : ""}${draggingDialogueKey === key ? " is-dragging" : ""}`}
                  draggable={!disabled && isJsonValid}
                  onDragStart={(event) => {
                    setDraggingDialogueKey(key);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-studio-dialogue-assignment", key);
                    event.dataTransfer.setData("text/plain", key);
                  }}
                  onDragEnd={() => {
                    setDraggingDialogueKey("");
                    setDragOverSpeakerId("");
                  }}
                  onDragOver={(event) => {
                    const speakerId = resolveDraggedSpeakerId(event);
                    if (!speakerId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    if (dragOverDialogueKey !== key) setDragOverDialogueKey(key);
                  }}
                  onDragLeave={() => {
                    if (dragOverDialogueKey === key) setDragOverDialogueKey("");
                  }}
                  onDrop={(event) => {
                    const speakerId = resolveDraggedSpeakerId(event);
                    if (!speakerId) return;
                    event.preventDefault();
                    assignDialogueSpeaker(assignment, speakerId);
                    setDraggingSpeakerId("");
                    setDragOverDialogueKey("");
                  }}
                >
                  <div className="studio-script-json-dialogue-card-head">
                    <span>{assignment.slideIndex + 1}번</span>
                    <strong>{assignment.speakerId || "미지정"}</strong>
                  </div>
                  <p>{`"${assignment.text}"`}</p>
                  <div className="studio-script-json-dialogue-card-actions">
                    <select
                      className="input-field studio-script-json-dialogue-speaker-select"
                      aria-label={`${assignment.slideIndex + 1}번 대사 화자`}
                      value={assignment.speakerId}
                      disabled={disabled || !isJsonValid}
                      onChange={(event) => assignDialogueSpeaker(assignment, event.target.value)}
                    >
                      <option value="">미지정</option>
                      {assignment.speakerId && !speakerRows.some((row) => row.speakerId === assignment.speakerId) ? (
                        <option value={assignment.speakerId}>{assignment.speakerId}</option>
                      ) : null}
                      {speakerRows.map((row) => (
                        <option key={`${key}:speaker-option:${row.speakerId}`} value={row.speakerId}>
                          {row.speakerId}
                        </option>
                      ))}
                    </select>
                    {selectedSpeakerAvailable ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={disabled || !isJsonValid}
                        onClick={() => assignDialogueSpeaker(assignment, selectedSpeakerId)}
                      >
                        선택 화자로 지정
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
  const renderSpeakerVoiceMapping = () => (
    <div className="studio-script-json-speaker-box">
      <div className="studio-script-json-speaker-head">
        <strong className="studio-script-json-speaker-title">화자별 음성 확정</strong>
        <button type="button" className="btn-secondary" onClick={addSpeakerRow} disabled={disabled || !isJsonValid}>
          화자 추가
        </button>
      </div>
      <div className="studio-script-json-note">
        대본/JSON에서 감지된 화자 기준으로 여기서 최종 음성을 고릅니다. `unknown_*`는 아래 대사 예시를 보고 바로 남자/여자 화자로 바꾸거나 기존 화자 슬롯에 합칠 수 있습니다.
      </div>
      <div className="studio-script-json-note">
        음성을 비워두면 설정 패널의 화자별 기본값을 쓰고, 이 목록에서 고른 음성이 있으면 그 값이 우선 적용됩니다.
      </div>
      {renderDialogueAssignmentBoard()}
      {speakerRows.length > 0 ? (
        <div className="studio-script-json-speaker-list">
          {speakerRows.map((row, index) => (
            <div key={`speaker-row:${index}`} className="studio-script-json-speaker-row">
              <div className="studio-script-json-speaker-main">
                <input
                  className="input-field studio-script-json-speaker-id"
                  aria-label={`${row.speakerId || `화자 ${index + 1}`} 화자 ID`}
                  value={row.speakerId}
                  disabled={disabled || !isJsonValid}
                  onChange={(event) => {
                    const nextSpeakerId = event.target.value;
                    const next = speakerRows.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, speakerId: nextSpeakerId } : item
                    );
                    onSpeakerVoicesChangeAction(next, {
                      renamedSpeakerIds:
                        row.speakerId.trim() && row.speakerId.trim() !== nextSpeakerId.trim()
                          ? { [row.speakerId]: nextSpeakerId }
                          : undefined,
                    });
                  }}
                  placeholder="male_1 / female_1 / unknown_1"
                />
                <StudioVoicePicker
                  value={row.voiceId}
                  options={voiceOptions}
                  emptyLabel="음성 선택"
                  customValueLabel={row.voiceId ? `custom: ${row.voiceId}` : undefined}
                  className="studio-script-json-speaker-voice"
                  disabled={disabled || !isJsonValid}
                  onChangeAction={(nextVoiceId) => {
                    const next = speakerRows.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, voiceId: nextVoiceId } : item
                    );
                    onSpeakerVoicesChangeAction(next);
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={disabled || !isJsonValid || voicePreviewLoading}
                  onClick={() => onPreviewVoiceAction(row.voiceId || selectedVoiceId)}
                >
                  {voicePreviewLoading ? "재생 준비 중..." : "미리듣기"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onStopVoicePreviewAction}
                  disabled={disabled || (!voicePreviewLoading && !voicePreviewPlaying)}
                >
                  중단
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={disabled || !isJsonValid}
                  onClick={() => {
                    const next = speakerRows.filter((_, itemIndex) => itemIndex !== index);
                    onSpeakerVoicesChangeAction(next);
                  }}
                >
                  제거
                </button>
              </div>
              {row.sampleTexts && row.sampleTexts.length > 0 ? (
                <div className="studio-script-json-speaker-samples">
                  <span className="studio-script-json-speaker-samples-label">
                    {row.quoteCount && row.quoteCount > row.sampleTexts.length
                      ? `대사 예시 ${row.sampleTexts.length}개 / 총 ${row.quoteCount}개`
                      : "대사 예시"}
                  </span>
                  <div className="studio-script-json-speaker-samples-list">
                    {row.sampleTexts.map((sampleText, sampleIndex) => (
                      <span key={`${row.speakerId}:sample:${sampleIndex}`} className="studio-script-json-speaker-sample-chip">
                        {`"${sampleText}"`}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {row.isUnknown ? (
                <div className="studio-script-json-speaker-assign">
                  <span className="studio-script-json-speaker-samples-label">
                    unknown 화자입니다. 위 대사를 보고 직접 남자/여자 슬롯으로 바꾸거나 기존 슬롯 ID로 합칠 수 있습니다.
                  </span>
                  <div className="studio-script-json-speaker-assign-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={disabled || !isJsonValid}
                      onClick={() => {
                        const nextSpeakerId = getNextSpeakerSlotId("male", row.speakerId);
                        const next = speakerRows.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, speakerId: nextSpeakerId, isUnknown: false } : item
                        );
                        onSpeakerVoicesChangeAction(next, {
                          renamedSpeakerIds: { [row.speakerId]: nextSpeakerId },
                        });
                      }}
                    >
                      남자 화자로 지정
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={disabled || !isJsonValid}
                      onClick={() => {
                        const nextSpeakerId = getNextSpeakerSlotId("female", row.speakerId);
                        const next = speakerRows.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, speakerId: nextSpeakerId, isUnknown: false } : item
                        );
                        onSpeakerVoicesChangeAction(next, {
                          renamedSpeakerIds: { [row.speakerId]: nextSpeakerId },
                        });
                      }}
                    >
                      여자 화자로 지정
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="studio-script-json-note">
          dialogueSegments에 `speakerId`가 있으면 자동으로 목록에 잡히고, 필요하면 직접 화자를 추가할 수 있습니다. 화자가 아직 없으면 위 `화자 지정`을 먼저 실행하세요.
        </div>
      )}
    </div>
  );

  return (
    <section className="studio-script-json-shell">
      <div className="studio-script-json-primary">
        <div className="studio-script-json-head">
          <div className="studio-script-json-head-copy">
            <div className="studio-script-json-title-row">
              <strong className="studio-script-json-title">{headingCopy.title}</strong>
              <span className={`studio-script-json-status${statusIsReady ? " is-valid" : ""}`}>{statusLabel}</span>
            </div>
          </div>
        </div>

        {scopeVisibility.showScriptSections ? (
        <details className="studio-script-json-step-box" open={hasTopic || !hasScript}>
          <summary className="studio-script-json-step-summary">
            <span>
              <strong className="studio-script-json-speaker-title">주제로 시작</strong>
            </span>
          </summary>
          <label htmlFor={topicTextareaId} className="studio-script-json-label-secondary">영상 주제와 꼭 지킬 조건</label>
          <textarea
            id={topicTextareaId}
            className="input-field studio-script-json-textarea"
            value={topicText}
            rows={4}
            onChange={(event) => onTopicTextChangeAction(event.target.value)}
            placeholder="예: 직장인이 점심시간에 할 수 있는 5분 목 스트레칭. 과장 표현 없이 45초 분량으로."
            disabled={disabled || scriptSourceBusy}
          />
          <div className="studio-script-json-speaker-head">
            <button
              type="button"
              className={hasScript ? "btn-secondary" : "btn-primary"}
              onClick={() => void onGenerateScriptFromTopicAction()}
              disabled={disabled || scriptSourceBusy || !hasTopic}
            >
              {topicToScriptBusy ? "대본 생성 중..." : hasScript ? "대본 다시 생성" : "대본 초안 생성"}
            </button>
          </div>
          {topicToScriptStatus ? <div className="studio-script-json-note" role="status" aria-live="polite">{topicToScriptStatus}</div> : null}
        </details>
        ) : null}

        {scopeVisibility.showScriptSections ? (
        <div className="studio-script-json-step-box">
          <div className="studio-script-json-step-head">
            <strong className="studio-script-json-speaker-title">대본</strong>
          </div>
          <label htmlFor={scriptTextareaId} className="studio-script-json-label-secondary">전체 대본</label>
          <textarea
            id={scriptTextareaId}
            className="input-field studio-script-json-textarea studio-script-json-textarea-primary"
            value={scriptText}
            rows={12}
            onChange={(event) => onScriptTextChangeAction(event.target.value)}
            placeholder="완성 대본을 붙여 넣거나 위에서 생성한 초안을 수정하세요."
            disabled={disabled || scriptSourceBusy}
          />
          <div className="studio-script-json-speaker-head">
            <button
              type="button"
              className={hasScript && !isJsonValid ? "btn-primary" : "btn-secondary"}
              onClick={() => void onConvertScriptToJsonAction()}
              disabled={disabled || scriptSourceBusy || !hasScript}
            >
              {scriptToJsonBusy ? "장면 구조 만드는 중..." : isJsonValid ? "장면 구조 다시 만들기" : "장면 구조 만들기"}
            </button>
            {isJsonValid ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void onConvertScriptTextOnlyAction()}
                disabled={disabled || scriptSourceBusy || !hasScript}
              >
                기존 이미지 유지하고 대본만 반영
              </button>
            ) : null}
          </div>
          {scriptToJsonStatus ? <div className="studio-script-json-note" role="status" aria-live="polite">{scriptToJsonStatus}</div> : null}

          {isJsonValid ? (
            <StudioSceneStructureEditor
              jsonText={jsonText}
              disabled={disabled || scriptSourceBusy}
              onJsonTextChangeAction={onJsonTextChangeAction}
              onJsonTextCommitAction={onJsonTextCommitAction}
            />
          ) : null}

          <div className="studio-script-json-editor">
            <div className="studio-script-json-speaker-head">
              <strong className="studio-script-json-speaker-title">고급: JSON 편집</strong>
              <span className={`studio-script-json-status${isJsonValid ? " is-valid" : ""}`}>{isJsonValid ? "JSON 유효" : "형식 확인 필요"}</span>
              <button type="button" className="btn-secondary" onClick={onToggleJsonEditorAction} disabled={disabled}>
                {showJsonEditor ? "JSON 접기" : "JSON 열기"}
              </button>
            </div>
            {showJsonEditor ? (
              <>
                <textarea
                  id={jsonTextareaId}
                  className="input-field studio-script-json-textarea studio-script-json-textarea-primary"
                  value={jsonText}
                  onFocus={(event) => {
                    jsonEditStartValueRef.current = event.currentTarget.value;
                  }}
                  onChange={(event) => onJsonTextChangeAction(event.target.value)}
                  onBlur={(event) => {
                    const previousValue = jsonEditStartValueRef.current;
                    jsonEditStartValueRef.current = null;
                    if (previousValue === null || previousValue === event.currentTarget.value) return;
                    onJsonTextCommitAction(event.currentTarget.value, previousValue);
                  }}
                  placeholder="고급 편집이 필요하면 장면 JSON을 붙여 넣거나 수정하세요."
                  disabled={disabled || scriptSourceBusy}
                />
                <div className={`studio-script-json-editor-status${isJsonValid ? " is-valid" : ""}`}>
                  {isJsonValid ? "장면 구조 JSON이 유효합니다." : "장면 구조를 만들거나 JSON 형식을 확인해 주세요."}
                </div>
              </>
            ) : null}
          </div>
        </div>
        ) : null}

        {scopeVisibility.showNarrationVoiceSection ? (
        <div className="studio-script-json-step-box">
          <div className="studio-script-json-step-head">
            <strong className="studio-script-json-speaker-title">나레이션 기본 음성</strong>
          </div>
          <div className="studio-script-json-narration-row">
            <label htmlFor={narrationVoiceSelectId} className="studio-script-json-label-secondary">현재 음성</label>
            <StudioVoicePicker
              id={narrationVoiceSelectId}
              className="studio-script-json-narration-select"
              value={selectedVoiceId}
              options={voiceOptions}
              emptyLabel="기본 음성"
              customValueLabel={selectedVoiceId ? `custom: ${selectedVoiceId}` : undefined}
              disabled={disabled}
              onChangeAction={onVoiceChangeAction}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onPreviewVoiceAction(selectedVoiceId)}
              disabled={disabled || voicePreviewLoading}
            >
              {voicePreviewLoading ? "재생 준비 중..." : "미리듣기"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onStopVoicePreviewAction}
              disabled={disabled || (!voicePreviewLoading && !voicePreviewPlaying)}
            >
              중단
            </button>
          </div>
          <div className="studio-script-json-note">적용 음성: {selectedVoiceLabel}</div>
        </div>
        ) : null}

        {resolvedSectionScope === "voice" ? (
          <div className="studio-script-json-step-box">
            <div className="studio-script-json-step-head">
              <strong className="studio-script-json-speaker-title">화자 지정</strong>
            </div>
            <div className="studio-script-json-speaker-head">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void onAssignDialogueSpeakersAction()}
                disabled={disabled || !isJsonValid || speakerAssignBusy || scriptMode !== "dialogue"}
              >
                {speakerAssignBusy ? "화자 지정 중..." : showSpeakerVoiceMapping ? "화자 다시 지정" : "화자 지정"}
              </button>
              {scriptMode !== "dialogue" ? (
                <span className="studio-script-json-note">대화형 모드에서 사용할 수 있습니다.</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {scopeVisibility.showImageStyleSection ? (
        <details className="studio-script-json-step-box" open={isJsonValid}>
          <summary className="studio-script-json-step-summary">
            <span>
              <strong className="studio-script-json-speaker-title">작업 이미지 스타일</strong>
            </span>
          </summary>
          <div className="studio-image-style-preset-grid">
            <button
              type="button"
              className={`studio-image-style-preset-card${imageStylePrompt.trim() ? "" : " is-active"}`}
              disabled={disabled || !isJsonValid}
              onClick={() => onImageStylePromptChangeAction("")}
            >
              <span className="studio-image-style-preset-copy">
                <span className="studio-image-style-preset-label">대본 기준 자동</span>
                <span className="studio-image-style-preset-description">
                  스타일을 지정하지 않고 장면 내용에 맞게 결정합니다.
                </span>
              </span>
            </button>
            {STUDIO_IMAGE_STYLE_PRESETS.map((preset) => {
              const isActive = selectedImageStylePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`studio-image-style-preset-card${isActive ? " is-active" : ""}`}
                  disabled={disabled || !isJsonValid}
                  onClick={() => onImageStylePromptChangeAction(preset.prompt)}
                >
                  <img src={preset.imageUrl} alt="" className="studio-image-style-preset-image" />
                  <span className="studio-image-style-preset-copy">
                    <span className="studio-image-style-preset-label">{preset.label}</span>
                    <span className="studio-image-style-preset-description">{preset.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <label htmlFor={imageStyleTextareaId} className="studio-script-json-label-secondary">직접 입력 이미지 스타일</label>
          <textarea
            id={imageStyleTextareaId}
            className="input-field studio-script-json-textarea"
            value={imageStylePrompt}
            disabled={disabled || !isJsonValid}
            rows={3}
            onChange={(event) => onImageStylePromptChangeAction(event.target.value)}
            placeholder="예: warm editorial illustration, soft daylight, beige and mint palette, crisp linework"
          />
        </details>
        ) : null}

        {scopeVisibility.showCharacterSection ? (
        <details className="studio-script-json-step-box" open={isJsonValid && storyCharacterProfiles.length > 0}>
          <summary className="studio-script-json-step-summary">
            <span>
              <strong className="studio-script-json-speaker-title">캐릭터 기준 설정</strong>
            </span>
          </summary>
          <StudioCharacterProfileEditor
            rows={storyCharacterProfiles}
            disabled={disabled}
            isJsonValid={isJsonValid}
            onChangeAction={onStoryCharacterProfilesChangeAction}
          />
        </details>
        ) : null}

        {scopeVisibility.showVoiceDialogueSections && showSpeakerVoiceMapping ? (
          <details className="studio-script-json-step-box" open>
            <summary className="studio-script-json-step-summary">
              <span>
                <strong className="studio-script-json-speaker-title">화자별 음성 확정</strong>
              </span>
            </summary>
            {renderSpeakerVoiceMapping()}
          </details>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ApiErrorResponse } from "@/lib/api/studio-client";
import { requestStudioScriptToJson, requestStudioTopicToScript } from "@/lib/api/studio-client";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioTemplateId, StudioTemplatePayload, TemplateImageLayout } from "./types";

type CodexUsageState = {
  inputTokens: number;
  outputTokens: number;
};

type ScriptDialogueMode = "normal" | "dialogue";

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
};

type RenderUsageState = {
  ttsChars: number;
  renderSeconds: number;
};

type NormalizeGeneratedStudioJsonDraftResult = {
  json: Record<string, unknown>;
  repaired: boolean;
};

type UseStudioScriptGenerationActionsInput = {
  codexModel: string;
  ensureEditPermission: (showAlert?: boolean) => boolean;
  handleJsonTextChange: (value: string) => void;
  mergeSlidesPreservingMediaAction: (currentSlides: PreparedSlide[], nextJson: Record<string, unknown>) => PreparedSlide[];
  normalizeGeneratedStudioJsonDraftAction: (
    input: unknown,
    fallbackTitle: string
  ) => NormalizeGeneratedStudioJsonDraftResult;
  normalizeScriptDialogueModeAction: (value: unknown) => ScriptDialogueMode;
  nowMsAction: () => number;
  publishCategory: PublishCategory;
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  resetPreviewRefs: () => void;
  scheduleHistoryCapture: (label: string) => void;
  scriptMode: ScriptDialogueMode;
  scriptText: string;
  slides: PreparedSlide[];
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageLayout: TemplateImageLayout;
  toEventDetailFromApiErrorAction: (data: ApiErrorResponse, fallback: string) => string;
  toTimingDetailAction: (label: string, ms: number, extra?: string) => string;
  topicText: string;
  setCodexUsage: Dispatch<SetStateAction<CodexUsageState | null>>;
  setPreviewTiming: Dispatch<SetStateAction<PreviewTimingState | null>>;
  setRenderStatus: Dispatch<SetStateAction<string>>;
  setRenderUsage: Dispatch<SetStateAction<RenderUsageState | null>>;
  setScriptMode: Dispatch<SetStateAction<ScriptDialogueMode>>;
  setScriptText: Dispatch<SetStateAction<string>>;
  setScriptToJsonBusy: Dispatch<SetStateAction<boolean>>;
  setScriptToJsonStatus: Dispatch<SetStateAction<string>>;
  setShowJsonEditor: Dispatch<SetStateAction<boolean>>;
  setSlides: Dispatch<SetStateAction<PreparedSlide[]>>;
  setTopicToScriptBusy: Dispatch<SetStateAction<boolean>>;
  setTopicToScriptStatus: Dispatch<SetStateAction<string>>;
};

function toCodexUsageState(usage?: { inputTokens?: number; outputTokens?: number } | null): CodexUsageState {
  return {
    inputTokens: Math.max(0, Number(usage?.inputTokens) || 0),
    outputTokens: Math.max(0, Number(usage?.outputTokens) || 0),
  };
}

export function useStudioScriptGenerationActions(input: UseStudioScriptGenerationActionsInput) {
  const clearPreviewAfterScriptChange = useCallback(
    (nextSlides: PreparedSlide[], options?: { clearRenderUsage?: boolean; renderStatus?: string }) => {
      input.setShowJsonEditor(false);
      input.setSlides(nextSlides);
      input.setPreviewTiming(null);
      input.resetPreviewRefs();
      if (options?.clearRenderUsage) {
        input.setRenderUsage(null);
      }
      input.setRenderStatus(options?.renderStatus ?? "");
    },
    [
      input.resetPreviewRefs,
      input.setPreviewTiming,
      input.setRenderStatus,
      input.setRenderUsage,
      input.setShowJsonEditor,
      input.setSlides,
    ]
  );

  const handleGenerateScriptFromTopic = useCallback(async () => {
    if (!input.ensureEditPermission()) return;

    const sourceTopic = input.topicText.trim();
    if (!sourceTopic) {
      alert("토픽을 먼저 입력해 주세요.");
      return;
    }

    input.setTopicToScriptBusy(true);
    input.setTopicToScriptStatus("Codex로 대본 초안을 생성하는 중입니다.");
    trackWorkflowEvent({
      name: "topic_to_script_clicked",
      page: "studio",
      stage: "input",
      status: "success",
    });

    const startedAt = input.nowMsAction();
    try {
      const { responseOk, data } = await requestStudioTopicToScript({
        topic: sourceTopic,
        publishCategory: input.publishCategory,
        projectProfileSnapshot: input.projectProfileSnapshot,
        codexModel: input.codexModel,
        mode: input.scriptMode,
        templateId: input.templateId,
      });

      if (!responseOk || !("ok" in data) || !data.ok) {
        const reason = "error" in data ? data.error : "토픽 대본 생성에 실패했습니다.";
        const detail = "error" in data ? input.toEventDetailFromApiErrorAction(data, reason) : reason;
        trackWorkflowEvent({
          name: "topic_to_script_failed",
          page: "studio",
          stage: "input",
          status: "failure",
          detail: `${detail}, ${input.toTimingDetailAction("topic_to_script", input.nowMsAction() - startedAt)}`,
          errorCode: "errorCode" in data ? data.errorCode : undefined,
          retryable: "retryable" in data ? data.retryable : undefined,
        });
        throw new Error(reason);
      }

      input.setScriptText(data.script);
      input.setCodexUsage(toCodexUsageState(data.usage));
      input.setTopicToScriptStatus(
        `대본 생성 완료 · model=${data.usage?.model || "unknown"} · ${Math.max(0, Math.round(input.nowMsAction() - startedAt))}ms`
      );
      trackWorkflowEvent({
        name: "topic_to_script_succeeded",
        page: "studio",
        stage: "input",
        status: "success",
        detail: input.toTimingDetailAction("topic_to_script", input.nowMsAction() - startedAt, `model=${data.usage?.model || "unknown"}`),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.setTopicToScriptStatus(`대본 생성 실패: ${message}`);
      alert(message);
    } finally {
      input.setTopicToScriptBusy(false);
    }
  }, [
    input.codexModel,
    input.ensureEditPermission,
    input.nowMsAction,
    input.projectProfileSnapshot,
    input.publishCategory,
    input.scriptMode,
    input.setCodexUsage,
    input.setScriptText,
    input.setTopicToScriptBusy,
    input.setTopicToScriptStatus,
    input.templateId,
    input.toEventDetailFromApiErrorAction,
    input.toTimingDetailAction,
    input.topicText,
  ]);

  const handleConvertScriptToJson = useCallback(async () => {
    if (!input.ensureEditPermission()) return;

    const sourceScript = input.scriptText.trim();
    if (!sourceScript) {
      alert("대본을 먼저 입력해 주세요.");
      return;
    }

    input.setScriptToJsonBusy(true);
    input.setScriptToJsonStatus("Codex로 JSON 변환 요청 중");
    trackWorkflowEvent({
      name: "script_to_json_clicked",
      page: "studio",
      stage: "input",
      status: "success",
    });

    const startedAt = input.nowMsAction();
    try {
      const { responseOk, data } = await requestStudioScriptToJson({
        script: sourceScript,
        publishCategory: input.publishCategory,
        projectProfileSnapshot: input.projectProfileSnapshot,
        codexModel: input.codexModel,
        mode: input.scriptMode,
        templateId: input.templateId,
        templateData: input.templateData,
        templateImageEnabled: input.templateImageEnabled,
        templateImageLayout: input.templateImageLayout,
      });

      if (!responseOk || !("ok" in data) || !data.ok) {
        const reason = "error" in data ? data.error : "대본 JSON 변환에 실패했습니다.";
        const detail = "error" in data ? input.toEventDetailFromApiErrorAction(data, reason) : reason;
        trackWorkflowEvent({
          name: "script_to_json_failed",
          page: "studio",
          stage: "input",
          status: "failure",
          detail: `${detail}, ${input.toTimingDetailAction("script_to_json", input.nowMsAction() - startedAt)}`,
          errorCode: "errorCode" in data ? data.errorCode : undefined,
          retryable: "retryable" in data ? data.retryable : undefined,
        });
        throw new Error(reason);
      }

      const normalized = input.normalizeGeneratedStudioJsonDraftAction(data.json, sourceScript.slice(0, 80));
      input.scheduleHistoryCapture(`스크립트→JSON · ${sourceScript.slice(0, 24)}`);
      input.handleJsonTextChange(JSON.stringify(normalized.json, null, 2));
      if (normalized.json && typeof normalized.json === "object") {
        input.setScriptMode(input.normalizeScriptDialogueModeAction((normalized.json as Record<string, unknown>).mode));
      }
      clearPreviewAfterScriptChange([]);
      input.setCodexUsage(toCodexUsageState(data.usage));
      input.setScriptToJsonStatus(
        `변환 완료${normalized.repaired ? " (자동 보정 적용)" : ""} · model=${data.usage?.model || "unknown"} · ${Math.max(0, Math.round(input.nowMsAction() - startedAt))}ms`
      );
      trackWorkflowEvent({
        name: "script_to_json_succeeded",
        page: "studio",
        stage: "input",
        status: "success",
        detail: input.toTimingDetailAction("script_to_json", input.nowMsAction() - startedAt, `model=${data.usage?.model || "unknown"}`),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.setScriptToJsonStatus(`변환 실패: ${message}`);
      alert(message);
    } finally {
      input.setScriptToJsonBusy(false);
    }
  }, [
    clearPreviewAfterScriptChange,
    input.codexModel,
    input.ensureEditPermission,
    input.handleJsonTextChange,
    input.normalizeGeneratedStudioJsonDraftAction,
    input.normalizeScriptDialogueModeAction,
    input.nowMsAction,
    input.projectProfileSnapshot,
    input.publishCategory,
    input.scheduleHistoryCapture,
    input.scriptMode,
    input.scriptText,
    input.setCodexUsage,
    input.setScriptMode,
    input.setScriptToJsonBusy,
    input.setScriptToJsonStatus,
    input.templateId,
    input.templateData,
    input.templateImageEnabled,
    input.templateImageLayout,
    input.toEventDetailFromApiErrorAction,
    input.toTimingDetailAction,
  ]);

  const handleConvertScriptTextOnly = useCallback(async () => {
    if (!input.ensureEditPermission()) return;

    const sourceScript = input.scriptText.trim();
    if (!sourceScript) {
      alert("대본을 먼저 입력해 주세요.");
      return;
    }
    if (input.slides.length <= 0) {
      alert("유지할 슬라이드가 없습니다. 먼저 미리보기를 만들어 주세요.");
      return;
    }

    input.setScriptToJsonBusy(true);
    input.setScriptToJsonStatus("기존 사진을 유지한 채 대본만 반영하는 중");
    trackWorkflowEvent({
      name: "script_to_json_clicked",
      page: "studio",
      stage: "input",
      status: "success",
      detail: "mode=text_only",
    });

    const startedAt = input.nowMsAction();
    try {
      const { responseOk, data } = await requestStudioScriptToJson({
        script: sourceScript,
        publishCategory: input.publishCategory,
        projectProfileSnapshot: input.projectProfileSnapshot,
        codexModel: input.codexModel,
        mode: input.scriptMode,
        templateId: input.templateId,
        templateData: input.templateData,
        templateImageEnabled: input.templateImageEnabled,
        templateImageLayout: input.templateImageLayout,
      });

      if (!responseOk || !("ok" in data) || !data.ok) {
        const reason = "error" in data ? data.error : "대본 수정 적용에 실패했습니다.";
        const detail = "error" in data ? input.toEventDetailFromApiErrorAction(data, reason) : reason;
        trackWorkflowEvent({
          name: "script_to_json_failed",
          page: "studio",
          stage: "input",
          status: "failure",
          detail: `mode=text_only, ${detail}, ${input.toTimingDetailAction("script_text_only", input.nowMsAction() - startedAt)}`,
          errorCode: "errorCode" in data ? data.errorCode : undefined,
          retryable: "retryable" in data ? data.retryable : undefined,
        });
        throw new Error(reason);
      }

      const nextJson = data.json;
      const mergedSlides = input.mergeSlidesPreservingMediaAction(input.slides, nextJson);
      if (mergedSlides.length <= 0) {
        throw new Error("변환된 대본에서 유효한 슬라이드를 찾지 못했습니다.");
      }
      const nextJsonWithPreservedEdits = {
        ...nextJson,
        slides: mergedSlides,
      };

      input.scheduleHistoryCapture(`대본만 수정 · ${sourceScript.slice(0, 24)}`);
      input.handleJsonTextChange(JSON.stringify(nextJsonWithPreservedEdits, null, 2));
      if (nextJson && typeof nextJson === "object") {
        input.setScriptMode(input.normalizeScriptDialogueModeAction((nextJson as Record<string, unknown>).mode));
      }
      clearPreviewAfterScriptChange(mergedSlides, {
        clearRenderUsage: true,
        renderStatus: "대본만 업데이트했습니다. 수동 사진은 유지되며, 미리보기를 다시 만들면 새 대본으로 반영됩니다.",
      });
      input.setCodexUsage(toCodexUsageState(data.usage));
      input.setScriptToJsonStatus(
        `대본만 반영 완료 · model=${data.usage?.model || "unknown"} · ${Math.max(0, Math.round(input.nowMsAction() - startedAt))}ms`
      );
      trackWorkflowEvent({
        name: "script_to_json_succeeded",
        page: "studio",
        stage: "input",
        status: "success",
        detail: input.toTimingDetailAction(
          "script_text_only",
          input.nowMsAction() - startedAt,
          `mode=text_only, model=${data.usage?.model || "unknown"}`
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.setScriptToJsonStatus(`대본만 반영 실패: ${message}`);
      alert(message);
    } finally {
      input.setScriptToJsonBusy(false);
    }
  }, [
    clearPreviewAfterScriptChange,
    input.codexModel,
    input.ensureEditPermission,
    input.handleJsonTextChange,
    input.mergeSlidesPreservingMediaAction,
    input.normalizeScriptDialogueModeAction,
    input.nowMsAction,
    input.projectProfileSnapshot,
    input.publishCategory,
    input.scheduleHistoryCapture,
    input.scriptMode,
    input.scriptText,
    input.setCodexUsage,
    input.setScriptMode,
    input.setScriptToJsonBusy,
    input.setScriptToJsonStatus,
    input.slides,
    input.templateId,
    input.templateData,
    input.templateImageEnabled,
    input.templateImageLayout,
    input.toEventDetailFromApiErrorAction,
    input.toTimingDetailAction,
  ]);

  return {
    handleGenerateScriptFromTopic,
    handleConvertScriptToJson,
    handleConvertScriptTextOnly,
  };
}

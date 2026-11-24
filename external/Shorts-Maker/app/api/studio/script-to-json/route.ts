import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { resolveCodexAccessTokenFromRequest } from "@/lib/auth/codex-server";
import { readJsonObjectBody } from "@/lib/network/request-body";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { getPublishCategoryMetadata } from "@/lib/publish/publish-store";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import { parseStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { getDefaultStudioPromptTemplates } from "@/lib/studio/prompt-templates";
import { createCaptionLayoutPolicy } from "@/lib/studio/caption-layout";
import { CodexPipelineError, convertScriptToStudioJson, isCodexPipelineError } from "@/lib/studio/codex-script";
import { parsePrepareRequest } from "@/lib/studio/validation";
import type { DialogueMode, PublishCategory } from "@/types/studio-json";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";

export const runtime = "nodejs";

type ScriptToJsonResponse = {
  ok: true;
  json: Record<string, unknown>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
};

type ScriptToJsonRouteDependencies = {
  canEditCategory: typeof canEditCategory;
  convertScriptToStudioJson: typeof convertScriptToStudioJson;
  getCategoryAccessScope: typeof getCategoryAccessScope;
  getPublishCategoryMetadata: typeof getPublishCategoryMetadata;
  parsePrepareRequest: typeof parsePrepareRequest;
  readJsonObjectBody: typeof readJsonObjectBody;
  requireAuthenticatedSessionUser: typeof requireAuthenticatedSessionUser;
  requireSessionUser: typeof requireSessionUser;
  resolveCodexAccessTokenFromRequest: typeof resolveCodexAccessTokenFromRequest;
  toForbiddenApiResponse: typeof toForbiddenApiResponse;
  toUnauthorizedApiResponse: typeof toUnauthorizedApiResponse;
};

export const defaultScriptToJsonRouteDependencies: ScriptToJsonRouteDependencies = {
  canEditCategory,
  convertScriptToStudioJson,
  getCategoryAccessScope,
  getPublishCategoryMetadata,
  parsePrepareRequest,
  readJsonObjectBody,
  requireAuthenticatedSessionUser,
  requireSessionUser,
  resolveCodexAccessTokenFromRequest,
  toForbiddenApiResponse,
  toUnauthorizedApiResponse,
};

export async function handleScriptToJsonPost(
  request: NextRequest,
  deps: ScriptToJsonRouteDependencies = defaultScriptToJsonRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return deps.toUnauthorizedApiResponse();
  const authUser = deps.requireAuthenticatedSessionUser(request) || user;
  try {
    const row = await deps.readJsonObjectBody(request);
    const script = typeof row.script === "string" ? row.script.trim() : "";
    const publishCategory = typeof row.publishCategory === "string" && row.publishCategory.trim() ? (row.publishCategory.trim() as PublishCategory) : undefined;
    const scope = await deps.getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!deps.canEditCategory(scope, publishCategory)) {
      return deps.toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }
    const rawProjectProfileSnapshot = row.projectProfileSnapshot;
    const projectProfileSnapshot = parseStudioProjectProfileSnapshot(rawProjectProfileSnapshot, { expectedCategory: publishCategory });
    if (
      typeof rawProjectProfileSnapshot !== "undefined" &&
      rawProjectProfileSnapshot !== null &&
      (!publishCategory || !projectProfileSnapshot)
    ) {
      return toApiErrorResponse("프로젝트 프로필 스냅샷이 현재 콘텐츠 프로필과 맞지 않습니다.", {
        status: 400,
        errorCode: "PROJECT_PROFILE_SNAPSHOT_INVALID",
        retryable: false,
      });
    }
    const templateId: StudioTemplateId = normalizeStudioTemplateId(row.templateId);
    const captionLayoutPolicy = createCaptionLayoutPolicy({
      templateId,
      templateData: row.templateData,
      templateImageEnabled: row.templateImageEnabled,
      templateImageLayout: row.templateImageLayout,
    });
    const mode: DialogueMode = String(row.mode || "").trim().toLowerCase() === "dialogue" ? "dialogue" : "normal";
    const codexModel = typeof row.codexModel === "string" ? row.codexModel.trim() : "";
    if (!script) {
      throw new CodexPipelineError("script를 입력해 주세요.", {
        code: "SCRIPT_TO_JSON_INPUT_INVALID",
        retryable: false,
        status: 400,
      });
    }
    const scriptLength = Array.from(script).length;
    if (scriptLength > 4000) {
      throw new CodexPipelineError("script가 너무 깁니다. 4000자 이하로 줄여 주세요.", {
        code: "SCRIPT_TO_JSON_INPUT_INVALID",
        retryable: false,
        status: 400,
      });
    }

    const codexAccessToken = await deps.resolveCodexAccessTokenFromRequest(request);
    const categoryMetadata =
      projectProfileSnapshot?.contentProfile.metadataSnapshot ||
      (publishCategory ? await deps.getPublishCategoryMetadata(user.id, publishCategory, templateId) : null);
    const templateDefaults = getDefaultStudioPromptTemplates(templateId);
    const converted = await deps.convertScriptToStudioJson(
      script,
      publishCategory,
      codexAccessToken || undefined,
      codexModel || undefined,
      {
        scriptToJsonPrompt: categoryMetadata?.scriptToJsonPrompt || templateDefaults.scriptToJsonPrompt,
      },
      mode,
      captionLayoutPolicy,
    );
    const resolvedMode = converted.payload.mode === "dialogue" ? "dialogue" : "normal";
    const json = {
      title: converted.title || "자동 생성 쇼츠",
      mode: resolvedMode,
      ttsSourceText: converted.payload.ttsSourceText || script,
      slides: converted.payload.slides.map((slide) => ({
        text: slide.text,
        lines: slide.lines,
        dialogueSegments:
          Array.isArray(slide.dialogueSegments) && slide.dialogueSegments.length > 0
            ? slide.dialogueSegments.map((segment) => ({
              type: segment.type === "quote" ? "quote" : "narration",
              text: String(segment.text || "").trim(),
              speakerId: String(segment.speakerId || "").trim() || undefined,
              voice: String(segment.voice || "").trim() || undefined,
              ...(Number.isFinite(segment.speed)
                ? { speed: Math.max(0.5, Math.min(2, Number(segment.speed))) }
                : {}),
              ...(Number.isFinite(segment.pauseAfterMs)
                ? { pauseAfterMs: Math.max(0, Math.min(3000, Math.floor(Number(segment.pauseAfterMs)))) }
                : {}),
            }))
            : undefined,
      })),
    };

    try {
      deps.parsePrepareRequest(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CodexPipelineError(`script-to-json 결과 스키마 검증 실패: ${message}`, {
        code: "SCRIPT_TO_JSON_VALIDATION_FAILED",
        retryable: true,
        status: 502,
      });
    }

    const response: ScriptToJsonResponse = {
      ok: true,
      json,
      usage: converted.usage,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (isCodexPipelineError(error)) {
      return toApiErrorResponse(error.message, {
        status: error.status,
        errorCode: error.code,
        retryable: error.retryable,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_SCRIPT_INPUT", "SCRIPT_TO_JSON_FAILED", ["script", "입력", "최소", "최대"]);
  }
}

export async function POST(request: NextRequest) {
  return handleScriptToJsonPost(request);
}

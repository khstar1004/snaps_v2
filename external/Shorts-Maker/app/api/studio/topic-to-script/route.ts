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
import { CodexPipelineError, generateScriptFromTopic, isCodexPipelineError } from "@/lib/studio/codex-script";
import type { DialogueMode, PublishCategory } from "@/types/studio-json";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";

export const runtime = "nodejs";

type TopicToScriptResponse = {
  ok: true;
  script: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
};

type TopicToScriptRouteDependencies = {
  canEditCategory: typeof canEditCategory;
  generateScriptFromTopic: typeof generateScriptFromTopic;
  getCategoryAccessScope: typeof getCategoryAccessScope;
  getPublishCategoryMetadata: typeof getPublishCategoryMetadata;
  readJsonObjectBody: typeof readJsonObjectBody;
  requireAuthenticatedSessionUser: typeof requireAuthenticatedSessionUser;
  requireSessionUser: typeof requireSessionUser;
  resolveCodexAccessTokenFromRequest: typeof resolveCodexAccessTokenFromRequest;
  toForbiddenApiResponse: typeof toForbiddenApiResponse;
  toUnauthorizedApiResponse: typeof toUnauthorizedApiResponse;
};

export const defaultTopicToScriptRouteDependencies: TopicToScriptRouteDependencies = {
  canEditCategory,
  generateScriptFromTopic,
  getCategoryAccessScope,
  getPublishCategoryMetadata,
  readJsonObjectBody,
  requireAuthenticatedSessionUser,
  requireSessionUser,
  resolveCodexAccessTokenFromRequest,
  toForbiddenApiResponse,
  toUnauthorizedApiResponse,
};

export async function handleTopicToScriptPost(
  request: NextRequest,
  deps: TopicToScriptRouteDependencies = defaultTopicToScriptRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return deps.toUnauthorizedApiResponse();
  const authUser = deps.requireAuthenticatedSessionUser(request) || user;
  try {
    const row = await deps.readJsonObjectBody(request);
    const topic = typeof row.topic === "string" ? row.topic.trim() : "";
    const publishCategory = typeof row.publishCategory === "string" && row.publishCategory.trim()
      ? (row.publishCategory.trim() as PublishCategory)
      : undefined;
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
    const mode: DialogueMode = String(row.mode || "").trim().toLowerCase() === "dialogue" ? "dialogue" : "normal";
    const codexModel = typeof row.codexModel === "string" ? row.codexModel.trim() : "";
    if (!topic) {
      throw new CodexPipelineError("topic을 입력해 주세요.", {
        code: "TOPIC_TO_SCRIPT_INPUT_INVALID",
        retryable: false,
        status: 400,
      });
    }
    const topicLength = Array.from(topic).length;
    if (topicLength < 2) {
      throw new CodexPipelineError("topic은 2자 이상 입력해 주세요.", {
        code: "TOPIC_TO_SCRIPT_INPUT_INVALID",
        retryable: false,
        status: 400,
      });
    }
    if (topicLength > 160) {
      throw new CodexPipelineError("topic은 160자 이하로 줄여 주세요.", {
        code: "TOPIC_TO_SCRIPT_INPUT_INVALID",
        retryable: false,
        status: 400,
      });
    }

    const codexAccessToken = await deps.resolveCodexAccessTokenFromRequest(request);
    const categoryMetadata =
      projectProfileSnapshot?.contentProfile.metadataSnapshot ||
      (publishCategory ? await deps.getPublishCategoryMetadata(user.id, publishCategory, templateId) : null);
    const templateDefaults = getDefaultStudioPromptTemplates(templateId);
    const generated = await deps.generateScriptFromTopic(
      topic,
      codexAccessToken || undefined,
      codexModel || undefined,
      publishCategory,
      {
        topicToScriptPrompt: categoryMetadata?.topicToScriptPrompt || templateDefaults.topicToScriptPrompt,
      },
      mode
    );
    const response: TopicToScriptResponse = {
      ok: true,
      script: generated.script,
      usage: generated.usage,
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
    return toStudioFailureResponse(message, "INVALID_TOPIC_INPUT", "TOPIC_TO_SCRIPT_FAILED", ["topic", "입력", "최소", "최대"]);
  }
}

export async function POST(request: NextRequest) {
  return handleTopicToScriptPost(request);
}

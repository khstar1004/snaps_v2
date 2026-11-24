import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { resolveCodexAccessTokenFromRequest } from "@/lib/auth/codex-server";
import { readJsonObjectBody } from "@/lib/network/request-body";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import {
  assignDialogueSpeakersByCodex,
  isDialogueSpeakerPlannerError,
} from "@/lib/studio/dialogue-speaker-planner";
import { parsePrepareRequest } from "@/lib/studio/validation";
import type { PublishCategory } from "@/types/studio-json";

export const runtime = "nodejs";

type DialogueSpeakerPlanResponse = {
  ok: true;
  json: Record<string, unknown>;
  usage?: {
    model?: string;
  };
};

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;

  try {
    const row = await readJsonObjectBody(request);
    const sourceJson = row.json && typeof row.json === "object" && !Array.isArray(row.json) ? (row.json as Record<string, unknown>) : null;
    const publishCategory =
      typeof row.publishCategory === "string" && row.publishCategory.trim() ? (row.publishCategory.trim() as PublishCategory) : undefined;
    const codexModel = typeof row.codexModel === "string" ? row.codexModel.trim() : "";

    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!canEditCategory(scope, publishCategory)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }
    if (!sourceJson) {
      return toApiErrorResponse("화자 지정을 위한 JSON 입력이 비어 있습니다.", {
        status: 400,
        errorCode: "DIALOGUE_SPEAKER_PLAN_INPUT_INVALID",
        retryable: false,
      });
    }

    const codexAccessToken = await resolveCodexAccessTokenFromRequest(request);
    const planned = await assignDialogueSpeakersByCodex({
      sourceJson,
      codexModel: codexModel || undefined,
      codexAccessToken: codexAccessToken || undefined,
    });

    try {
      parsePrepareRequest(planned.json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toApiErrorResponse(`화자 지정 결과 스키마 검증 실패: ${message}`, {
        status: 502,
        errorCode: "DIALOGUE_SPEAKER_PLAN_VALIDATION_FAILED",
        retryable: true,
      });
    }

    const response: DialogueSpeakerPlanResponse = {
      ok: true,
      json: planned.json,
      usage: planned.usage,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (isDialogueSpeakerPlannerError(error)) {
      return toApiErrorResponse(error.message, {
        status: error.status,
        errorCode: error.code,
        retryable: error.retryable,
      });
    }
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 500,
      errorCode: "DIALOGUE_SPEAKER_PLAN_FAILED",
      retryable: true,
    });
  }
}


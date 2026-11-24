import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { readJsonBody } from "@/lib/network/request-body";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { isStudioInvalidInput, toStudioFailureResponse } from "@/lib/studio/error-response";
import { explodeSlidesForPop } from "@/lib/studio/frames";
import { storeStudioNarrationSegments } from "@/lib/studio/narration-cache";
import { buildRenderPlanV2 } from "@/lib/studio/render-plan";
import { buildSlideSegmentGroups, resolveDialogueRenderOptions, synthesizeSlideNarrationSegments } from "@/lib/studio/render-dialogue";
import { resolveSingleAudioTimeline } from "@/lib/studio/timeline/alignment-provider";
import { parseRenderRequest } from "@/lib/studio/validation";
import type { RenderResponse } from "@/types/studio-json";

export const runtime = "nodejs";

function toDetailedRenderFailureResponse(message: string) {
  const invalid = isStudioInvalidInput(message, ["singleAudio", "segments", "required", "missing", "expired"]);
  return toApiErrorResponse(message, {
    status: invalid ? 400 : 500,
    errorCode: invalid ? "INVALID_RENDER_INPUT" : "STUDIO_RENDER_PIPELINE_FAILED",
    retryable: !invalid,
  });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;

  let payload;
  try {
    const body = await readJsonBody(request);
    payload = parseRenderRequest(body);
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!canEditCategory(scope, payload.publishCategory)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_RENDER_INPUT", "RENDER_FAILED", ["singleAudio", "segments"]);
  }

  try {
    const frames = explodeSlidesForPop(payload.slides);
    const dialogueOptions = resolveDialogueRenderOptions({
      mode: payload.mode,
      ttsVoiceId: payload.ttsVoiceId,
      typecastEmotionType: payload.typecastEmotionType,
      typecastSpeed: payload.typecastSpeed,
      narrationVoice: payload.narrationVoice,
      quoteVoice: payload.quoteVoice,
      speakerVoices: payload.speakerVoices,
      slides: frames,
    });
    const primaryNarrationVoiceId =
      dialogueOptions.mode === "dialogue" ? dialogueOptions.narrationVoice || payload.ttsVoiceId : payload.ttsVoiceId;

    if (payload.videoMode === "segments") {
      const groups = buildSlideSegmentGroups(frames, dialogueOptions);
      const ttsStartedAt = Date.now();
      const segmentResult = await synthesizeSlideNarrationSegments(groups, dialogueOptions);
      const ttsMs = Math.max(0, Date.now() - ttsStartedAt);
      if (segmentResult.frameDurationsSec.length !== frames.length) {
        throw new Error("segments 타이밍 계산 결과가 프레임 수와 다릅니다.");
      }
      const narrationRef = await storeStudioNarrationSegments({
        userId: user.id,
        segments: segmentResult.narrationSegments,
        crossfadeMsByBoundary: segmentResult.crossfadeMsByBoundary,
      });
      const renderPlan = buildRenderPlanV2(frames, segmentResult.frameDurationsSec);
      const response: RenderResponse = {
        ok: true,
        videoMode: "segments",
        narrationRef,
        narrationSegments: segmentResult.narrationSegments,
        crossfadeMsByBoundary: segmentResult.crossfadeMsByBoundary,
        narrationSegmentCount: segmentResult.narrationSegments.length,
        narrationSegmentFormat: segmentResult.narrationSegments[0]?.format,
        narrationSegmentMimeType: segmentResult.narrationSegments[0]?.mimeType,
        durationMs: segmentResult.durationMs,
        timeline: {
          frameDurationsSec: segmentResult.frameDurationsSec,
          speechDurationSec: segmentResult.durationMs / 1000,
        },
        renderPlan,
        slides: frames,
        usage: {
          ttsChars: segmentResult.ttsChars,
          renderSeconds: segmentResult.durationMs / 1000,
          ttsMs,
          alignmentProvider: "heuristic",
          alignmentResolvedProvider: "heuristic",
          alignmentFallback: false,
          alignmentCanary: false,
        },
      };
      return NextResponse.json(response);
    }

    const ttsStartedAt = Date.now();
    const timeline = await resolveSingleAudioTimeline({
      frames,
      ttsVoiceId: primaryNarrationVoiceId,
      typecastEmotionType: payload.typecastEmotionType,
      typecastSpeed: payload.typecastSpeed,
      publishCategory: payload.publishCategory,
    });
    const ttsMs = Math.max(0, Date.now() - ttsStartedAt);
    const frameDurationsSec = timeline.frameDurationsSec.map((value) =>
      Number.isFinite(value) && value > 0 ? value : 0.001
    );
    const durationMs = Math.round(frameDurationsSec.reduce((acc, cur) => acc + cur, 0) * 1000);
    const renderPlan = buildRenderPlanV2(frames, frameDurationsSec);

    if (timeline.fallbackUsed) {
      console.info(
        `[studio] alignment_provider_fallback requested=${timeline.requestedProvider} resolved=${timeline.resolvedProvider}`
      );
    }

    const response: RenderResponse = {
      ok: true,
      videoMode: "singleAudio",
      fullAudio: timeline.fullAudio,
      fullAudioMimeType: timeline.fullAudioMimeType,
      fullAudioFormat: timeline.fullAudioFormat,
      durationMs,
      timeline: {
        frameDurationsSec,
        speechDurationSec: timeline.speechDurationSec,
      },
      renderPlan,
      slides: frames,
      usage: {
        ttsChars: timeline.ttsChars,
        renderSeconds: Math.max(0, durationMs / 1000),
        ttsMs,
        alignmentProvider: timeline.requestedProvider,
        alignmentResolvedProvider: timeline.resolvedProvider,
        alignmentFallback: timeline.fallbackUsed,
        alignmentCanary: timeline.canaryApplied,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[studio/render] render pipeline failed", error);
    return toDetailedRenderFailureResponse(message);
  }
}

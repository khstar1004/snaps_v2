import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { rebaseLocalStorageUrlsToRequestOrigin } from "@/lib/local/asset-url-origin";
import { readJsonBody, isRequestBodyParseError } from "@/lib/network/request-body";
import { normalizeCategory } from "@/lib/publish/categories";
import { createVideoAsset, setVideoAssetStudioSnapshot } from "@/lib/publish/publish-store";
import { buildShortsStorageObjectKey } from "@/lib/storage/object-key";
import { uploadSupabaseStorageStream } from "@/lib/supabase/storage";
import { loadStudioNarrationInput } from "@/lib/studio/narration-cache";
import { completeStudioAssetSnapshot } from "@/lib/studio/asset-snapshot";
import { parseStudioNativeRenderRequest } from "@/lib/studio/validation";
import { renderVideoWithServerNative } from "@/lib/studio/render-native-server";
import { isStudioInvalidInput } from "@/lib/studio/error-response";
import type { StudioNativeRenderResponse } from "@/types/studio-renderer";

export const runtime = "nodejs";

type StudioNativeRenderRouteDependencies = {
  requireSessionUser: typeof requireSessionUser;
  requireAuthenticatedSessionUser: typeof requireAuthenticatedSessionUser;
  toForbiddenApiResponse: typeof toForbiddenApiResponse;
  toUnauthorizedApiResponse: typeof toUnauthorizedApiResponse;
  readJsonBody: typeof readJsonBody;
  isRequestBodyParseError: typeof isRequestBodyParseError;
  normalizeCategory: typeof normalizeCategory;
  getCategoryAccessScope: typeof getCategoryAccessScope;
  canEditCategory: typeof canEditCategory;
  loadStudioNarrationInput: typeof loadStudioNarrationInput;
  parseStudioNativeRenderRequest: typeof parseStudioNativeRenderRequest;
  renderVideoWithServerNative: typeof renderVideoWithServerNative;
  isStudioInvalidInput: typeof isStudioInvalidInput;
  uploadRenderedVideoAsset: typeof uploadRenderedVideoAsset;
  completeStudioAssetSnapshot: typeof completeStudioAssetSnapshot;
  setVideoAssetStudioSnapshot: typeof setVideoAssetStudioSnapshot;
  removeWorkDir: (workDir: string) => Promise<void>;
  isServerRendererEnabled: typeof isServerRendererEnabled;
  resolveBaseUrl: typeof resolveBaseUrl;
};

async function uploadRenderedVideoAsset(params: {
  userId: string;
  videoPath: string;
  videoSizeBytes: number;
  title: string;
  publishCategory?: string;
}): Promise<{ id: string; url: string }> {
  const id = randomUUID();
  const path = buildShortsStorageObjectKey({
    title: params.title,
    id,
    ext: "mp4",
  });
  const stored = await uploadSupabaseStorageStream({
    path,
    stream: createReadStream(params.videoPath),
    contentType: "video/mp4",
  });

  const record = await createVideoAsset({
    userId: params.userId,
    id,
    title: params.title,
    url: stored.publicUrl,
    publishCategory: params.publishCategory,
    sizeBytes: params.videoSizeBytes,
    mimeType: "video/mp4",
    storageBucket: stored.bucket,
    storagePath: stored.path,
  });
  return {
    id: record.id,
    url: record.url,
  };
}

function isServerRendererEnabled(): boolean {
  const raw = (process.env.STUDIO_SERVER_RENDERER_ENABLED || "").trim().toLowerCase();
  if (!raw) return true;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveBaseUrl(request: NextRequest): string {
  const explicit = (process.env.APP_BASE_URL || "").trim();
  if (explicit) return explicit;
  return request.nextUrl.origin;
}

export const defaultStudioNativeRenderRouteDependencies: StudioNativeRenderRouteDependencies = {
  requireSessionUser,
  requireAuthenticatedSessionUser,
  toForbiddenApiResponse,
  toUnauthorizedApiResponse,
  readJsonBody,
  isRequestBodyParseError,
  normalizeCategory,
  getCategoryAccessScope,
  canEditCategory,
  loadStudioNarrationInput,
  parseStudioNativeRenderRequest,
  renderVideoWithServerNative,
  isStudioInvalidInput,
  uploadRenderedVideoAsset,
  completeStudioAssetSnapshot,
  setVideoAssetStudioSnapshot,
  removeWorkDir: (workDir) => rm(workDir, { recursive: true, force: true }),
  isServerRendererEnabled,
  resolveBaseUrl,
};

export async function handleStudioNativeRenderPost(
  request: NextRequest,
  deps: StudioNativeRenderRouteDependencies = defaultStudioNativeRenderRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return deps.toUnauthorizedApiResponse();
  const authUser = deps.requireAuthenticatedSessionUser(request) || user;
  if (!deps.isServerRendererEnabled()) {
    const disabled: StudioNativeRenderResponse = {
      ok: false,
      renderer: "server_native",
      error: "서버 네이티브 렌더러가 비활성화되어 있습니다.",
      errorCode: "SERVER_RENDERER_DISABLED",
      retryable: false,
    };
    return NextResponse.json(disabled, { status: 503 });
  }

  try {
    const body = await deps.readJsonBody(request);
    const payload = deps.parseStudioNativeRenderRequest(body);
    const scope = await deps.getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    const requestedPublishCategory = deps.normalizeCategory(String(payload.asset?.publishCategory || ""));
    if (!deps.canEditCategory(scope, requestedPublishCategory || undefined)) {
      return deps.toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }
    const resolvedNarration =
      payload.narration?.mode === "segmentsRef"
        ? await deps.loadStudioNarrationInput(payload.narration.narrationRef, user.id)
        : payload.narration;
    if (!resolvedNarration) {
      throw new Error("narration reference is missing or expired");
    }
    const resolvedPayload = {
      ...payload,
      narration: resolvedNarration,
      fullAudio: resolvedNarration.mode === "singleAudio" ? resolvedNarration.fullAudio : "",
    };
    const baseUrl = deps.resolveBaseUrl(request);
    const result = await deps.renderVideoWithServerNative(resolvedPayload, { baseUrl });
    if (!result.ok) {
      const status = result.retryable ? 502 : 500;
      return NextResponse.json(result, { status });
    }
    const assetTitle =
      String(resolvedPayload.asset?.title || resolvedPayload.visuals?.slides[0]?.title || "숏츠").trim() || "숏츠";
    const publishCategory = deps.normalizeCategory(String(resolvedPayload.asset?.publishCategory || ""));
    try {
      const uploadedAsset = await deps.uploadRenderedVideoAsset({
        userId: user.id,
        videoPath: result.videoPath,
        videoSizeBytes: result.videoSizeBytes,
        title: assetTitle,
        publishCategory: publishCategory || undefined,
      });
      const completedSnapshot = deps.completeStudioAssetSnapshot({
        snapshot: resolvedPayload.asset?.studioSnapshot,
        visuals: resolvedPayload.visuals,
        frameDurationsSec: resolvedPayload.frameDurationsSec,
        assetUrl: uploadedAsset.url,
        publishCategory: publishCategory || undefined,
      });
      let studioSnapshotSaved = false;
      if (completedSnapshot) {
        try {
          await deps.setVideoAssetStudioSnapshot({
            userId: user.id,
            assetId: uploadedAsset.id,
            snapshot: completedSnapshot,
          });
          studioSnapshotSaved = true;
        } catch {
          studioSnapshotSaved = false;
        }
      }
      return NextResponse.json(
        rebaseLocalStorageUrlsToRequestOrigin(
          {
            ok: true,
            renderer: "server_native",
            uploadedAssetId: uploadedAsset.id,
            uploadedAssetUrl: uploadedAsset.url,
            studioSnapshotSaved,
            audioDiagnostics: result.audioDiagnostics,
            memoryBudget: result.memoryBudget,
            usage: result.usage,
          },
          request
        )
      );
    } finally {
      await deps.removeWorkDir(result.workDir).catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidInput =
      deps.isRequestBodyParseError(error) ||
      deps.isStudioInvalidInput(message, ["narration reference", "expired", "required", "missing"]);
    const failed: StudioNativeRenderResponse = {
      ok: false,
      renderer: "server_native",
      error: message,
      errorCode: invalidInput ? "SERVER_NATIVE_RENDER_REQUEST_INVALID" : "SERVER_NATIVE_RENDER_FAILED",
      retryable: !invalidInput,
    };
    return NextResponse.json(failed, { status: invalidInput ? 400 : 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleStudioNativeRenderPost(request);
}

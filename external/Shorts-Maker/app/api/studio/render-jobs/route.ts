import { after, NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { rebaseLocalStorageUrlsToRequestOrigin } from "@/lib/local/asset-url-origin";
import { isRequestBodyParseError, readJsonBody } from "@/lib/network/request-body";
import { normalizeCategory } from "@/lib/publish/categories";
import { isStudioInvalidInput } from "@/lib/studio/error-response";
import { createOrReuseStudioRenderJob, getStudioRenderJob, runStudioRenderJob } from "@/lib/studio/render-jobs";
import { parseStudioNativeRenderRequest } from "@/lib/studio/validation";
import type { StudioNativeRenderResponse, StudioRenderJobResponse } from "@/types/studio-renderer";

export const runtime = "nodejs";

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

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const jobId = String(request.nextUrl.searchParams.get("id") || "").trim();
  if (!jobId) {
    return NextResponse.json(
      {
        ok: false,
        error: "job id is required",
        errorCode: "STUDIO_RENDER_JOB_ID_REQUIRED",
        retryable: false,
      },
      { status: 400 }
    );
  }
  const job = await getStudioRenderJob(user.id, jobId);
  if (!job) {
    return NextResponse.json(
      {
        ok: false,
        error: "render job not found",
        errorCode: "STUDIO_RENDER_JOB_NOT_FOUND",
        retryable: false,
      },
      { status: 404 }
    );
  }
  const response: StudioRenderJobResponse = {
    ok: true,
    job,
  };
  return NextResponse.json(rebaseLocalStorageUrlsToRequestOrigin(response, request));
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  if (!isServerRendererEnabled()) {
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
    const body = await readJsonBody(request);
    const payload = parseStudioNativeRenderRequest(body);
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    const requestedPublishCategory = normalizeCategory(String(payload.asset?.publishCategory || ""));
    if (!canEditCategory(scope, requestedPublishCategory || undefined)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }

    const jobResult = await createOrReuseStudioRenderJob(user.id, payload);
    const baseUrl = resolveBaseUrl(request);
    if (jobResult.shouldStart) {
      after(async () => {
        await runStudioRenderJob({
          userId: user.id,
          jobId: jobResult.job.id,
          payload,
          baseUrl,
        });
      });
    }

    const response: StudioRenderJobResponse = {
      ok: true,
      job: jobResult.job,
    };
    return NextResponse.json(rebaseLocalStorageUrlsToRequestOrigin(response, request), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidInput =
      isRequestBodyParseError(error) ||
      isStudioInvalidInput(message, ["narration reference", "expired", "required", "missing"]);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        errorCode: invalidInput ? "SERVER_NATIVE_RENDER_REQUEST_INVALID" : "STUDIO_RENDER_JOB_CREATE_FAILED",
        retryable: !invalidInput,
      },
      { status: invalidInput ? 400 : 500 }
    );
  }
}

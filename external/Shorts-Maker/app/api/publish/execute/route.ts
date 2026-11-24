import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { enqueuePublishJob } from "@/lib/publish/scheduler";
import {
  acquirePublishJobExecutionLock,
  getPublishJob,
  releasePublishJobExecutionLock,
  getYoutubeAccount,
  refreshYoutubeAccountToken,
  updatePublishJobStatus,
} from "@/lib/publish/publish-store";
import { uploadYoutubeShorts, YoutubeUploadError } from "@/lib/publish/youtube";

export const runtime = "nodejs";
const MAX_PUBLISH_EXECUTE_ATTEMPTS = 3;

type PublishExecuteRouteDependencies = {
  now: () => number;
  generateLockToken: () => string;
  enqueuePublishJob: typeof enqueuePublishJob;
  acquirePublishJobExecutionLock: typeof acquirePublishJobExecutionLock;
  getPublishJob: typeof getPublishJob;
  releasePublishJobExecutionLock: typeof releasePublishJobExecutionLock;
  getYoutubeAccount: typeof getYoutubeAccount;
  refreshYoutubeAccountToken: typeof refreshYoutubeAccountToken;
  updatePublishJobStatus: typeof updatePublishJobStatus;
  uploadYoutubeShorts: typeof uploadYoutubeShorts;
};

export const defaultPublishExecuteRouteDependencies: PublishExecuteRouteDependencies = {
  now: () => Date.now(),
  generateLockToken: randomUUID,
  enqueuePublishJob,
  acquirePublishJobExecutionLock,
  getPublishJob,
  releasePublishJobExecutionLock,
  getYoutubeAccount,
  refreshYoutubeAccountToken,
  updatePublishJobStatus,
  uploadYoutubeShorts,
};

class ExecuteRequestError extends Error {
  status: number;
  errorCode: string;
  retryable: boolean;

  constructor(message: string, options: { status: number; errorCode: string; retryable: boolean }) {
    super(message);
    this.name = "ExecuteRequestError";
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.retryable = options.retryable;
  }
}

function assertExecutionSecret(request: NextRequest): void {
  const secret = process.env.PUBLISH_EXECUTE_SECRET?.trim() || "";
  if (!secret) {
    throw new ExecuteRequestError("PUBLISH_EXECUTE_SECRET 환경변수가 설정되지 않았습니다.", {
      status: 500,
      errorCode: "PUBLISH_EXECUTE_SECRET_MISSING",
      retryable: false,
    });
  }
  const token = request.headers.get("x-publish-secret") || "";
  if (token !== secret) {
    throw new ExecuteRequestError("실행 요청 인증에 실패했습니다.", {
      status: 401,
      errorCode: "PUBLISH_EXECUTE_UNAUTHORIZED",
      retryable: false,
    });
  }
}

function classifyExecuteFailure(error: unknown): { errorCode: string; retryable: boolean } {
  if (error instanceof ExecuteRequestError) {
    return {
      errorCode: error.errorCode,
      retryable: error.retryable,
    };
  }
  if (error instanceof YoutubeUploadError) {
    return {
      errorCode: error.errorCode,
      retryable: error.retryable,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.trim().toLowerCase();
  if (
    normalized.includes("연결되어 있지 않습니다") ||
    normalized.includes("youtube 계정") ||
    normalized.includes("google_client_id") ||
    normalized.includes("google_client_secret")
  ) {
    return {
      errorCode: "PUBLISH_EXECUTE_CONFIGURATION_INVALID",
      retryable: false,
    };
  }
  return {
    errorCode: "PUBLISH_EXECUTE_FAILED",
    retryable: true,
  };
}

export async function handlePublishExecutePost(
  request: NextRequest,
  deps: PublishExecuteRouteDependencies = defaultPublishExecuteRouteDependencies
) {
  let userId = "";
  let jobId = "";
  let attemptedCount = 0;
  let executionLockToken = "";
  try {
    assertExecutionSecret(request);
    const body = (await request.json()) as { userId?: string; jobId?: string };
    userId = String(body.userId || "").trim();
    jobId = String(body.jobId || "").trim();
    if (!userId || !jobId) {
      return toApiErrorResponse("userId와 jobId가 필요합니다.", {
        status: 400,
        errorCode: "JOB_ID_OR_USER_REQUIRED",
        retryable: false,
      });
    }

    const record = await deps.getPublishJob(userId, jobId);
    if (!record) {
      return toApiErrorResponse("발행 작업을 찾을 수 없습니다.", {
        status: 404,
        errorCode: "JOB_NOT_FOUND",
        retryable: false,
      });
    }
    if (record.status === "canceled") {
      return NextResponse.json({ ok: true, status: "canceled" });
    }
    if (record.status === "published") {
      return NextResponse.json({ ok: true, status: "already_published" });
    }
    executionLockToken = deps.generateLockToken();
    const locked = await deps.acquirePublishJobExecutionLock(userId, jobId, executionLockToken);
    if (!locked) {
      return NextResponse.json({ ok: true, status: "already_processing" });
    }
    const now = deps.now();
    if (record.scheduledAt && record.scheduledAt > now) {
      const delayMs = Math.max(0, record.scheduledAt - now);
      if (delayMs > 0) {
        await deps.enqueuePublishJob(jobId, userId, delayMs);
      }
      await deps.releasePublishJobExecutionLock(userId, jobId, executionLockToken);
      executionLockToken = "";
      return NextResponse.json({ ok: true, status: "scheduled_waiting" });
    }

    attemptedCount = record.attempts + 1;
    await deps.updatePublishJobStatus({
      userId,
      id: jobId,
      status: "processing",
      attempts: attemptedCount,
      lastError: null,
    });

    const account = await deps.getYoutubeAccount(userId, record.channelId);
    if (!account) {
      throw new Error(`YouTube 계정(${record.channelId})이 연결되어 있지 않습니다.`);
    }

    const uploaded = await deps.uploadYoutubeShorts({
      account,
      videoUrl: record.videoUrl,
      title: record.title,
      description: record.description,
      tags: record.tags,
      privacyStatus: record.visibility,
    });

    await deps.refreshYoutubeAccountToken({
      userId,
      channelId: account.channelId,
      accessToken: uploaded.refreshed.accessToken,
      expiryDate: uploaded.refreshed.expiryDate,
    });

    await deps.updatePublishJobStatus({
      userId,
      id: jobId,
      status: "published",
      attempts: attemptedCount,
      lastError: null,
      platformPostId: uploaded.videoId,
      publishedUrl: uploaded.url,
    });

    await deps.releasePublishJobExecutionLock(userId, jobId, executionLockToken);
    executionLockToken = "";

    return NextResponse.json({ ok: true, status: "published", url: uploaded.url });
  } catch (e) {
    const failure = classifyExecuteFailure(e);
    if (jobId && userId) {
      const existing = await deps.getPublishJob(userId, jobId);
      const attempts = attemptedCount || existing?.attempts || 1;
      await deps.updatePublishJobStatus({
        userId,
        id: jobId,
        status: "failed",
        attempts,
        lastError: e instanceof Error ? e.message : String(e),
      });
      if (existing && failure.retryable && attempts < MAX_PUBLISH_EXECUTE_ATTEMPTS) {
        try {
          await deps.enqueuePublishJob(jobId, userId, 30_000 * attempts);
        } catch (retryError) {
          await deps.updatePublishJobStatus({
            userId,
            id: jobId,
            status: "failed",
            attempts,
            lastError:
              `${e instanceof Error ? e.message : String(e)} | 재시도 큐 등록 실패: ` +
              `${retryError instanceof Error ? retryError.message : String(retryError)}`,
          });
        }
      }
    }

    if (e instanceof ExecuteRequestError) {
      return toApiErrorResponse(e.message, {
        status: e.status,
        errorCode: e.errorCode,
        retryable: e.retryable,
      });
    }
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: failure.retryable ? 500 : 400,
      errorCode: failure.errorCode,
      retryable: failure.retryable,
    });
  } finally {
    if (jobId && userId && executionLockToken) {
      await deps.releasePublishJobExecutionLock(userId, jobId, executionLockToken).catch(() => undefined);
    }
  }
}

export async function POST(request: NextRequest) {
  return handlePublishExecutePost(request);
}

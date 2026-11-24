import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canPublishCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { enqueuePublishJob } from "@/lib/publish/scheduler";
import { getPublishJob, getPublishJobExecutionLock, runPublishJobNow, updatePublishJobStatus } from "@/lib/publish/publish-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  try {
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    const body = (await request.json()) as { jobId?: string };
    const jobId = String(body.jobId || "").trim();
    if (!jobId) {
      return toApiErrorResponse("jobId가 필요합니다.", { status: 400, errorCode: "JOB_ID_REQUIRED", retryable: false });
    }
    const existingJob = await getPublishJob(user.id, jobId);
    if (existingJob && !canPublishCategory(scope, existingJob.publishCategory)) {
      return toForbiddenApiResponse("발행 권한이 있는 고객(category) 작업만 즉시 실행할 수 있습니다.");
    }

    const result = await runPublishJobNow(user.id, jobId);
    if (result === "not_found") {
      return toApiErrorResponse("발행 작업을 찾을 수 없습니다.", { status: 404, errorCode: "JOB_NOT_FOUND", retryable: false });
    }
    if (result === "already_published") {
      return toApiErrorResponse("이미 발행된 작업은 다시 대기열에 넣을 수 없습니다.", {
        status: 400,
        errorCode: "JOB_ALREADY_PUBLISHED",
        retryable: false,
      });
    }
    if (result === "already_canceled") {
      return toApiErrorResponse("취소된 작업은 다시 대기열에 넣을 수 없습니다.", {
        status: 400,
        errorCode: "JOB_ALREADY_CANCELED",
        retryable: false,
      });
    }
    if (result === "processing") {
      const hasExecutionLock = await getPublishJobExecutionLock(user.id, jobId);
      return toApiErrorResponse("처리 중인 작업이 이미 실행 중입니다.", {
        status: 409,
        errorCode: hasExecutionLock ? "JOB_EXECUTION_LOCKED" : "JOB_ALREADY_PROCESSING",
        retryable: true,
      });
    }
    if (result === "not_pending") {
      return toApiErrorResponse("대기 상태 작업만 즉시 실행할 수 있습니다.", {
        status: 409,
        errorCode: "JOB_NOT_PENDING",
        retryable: false,
      });
    }
    try {
      await enqueuePublishJob(jobId, user.id, 0);
    } catch (error) {
      const existing = await getPublishJob(user.id, jobId);
      await updatePublishJobStatus({
        userId: user.id,
        id: jobId,
        status: "failed",
        attempts: existing?.attempts ?? 0,
        lastError: `즉시 실행 큐 등록 실패: ${error instanceof Error ? error.message : String(error)}`,
      });
      return toApiErrorResponse("발행 작업을 즉시 실행 큐에 등록하지 못했습니다.", {
        status: 502,
        errorCode: "RUN_NOW_ENQUEUE_FAILED",
        retryable: true,
      });
    }
    await recordAuditLogSafely({
      user,
      request,
      action: "publish.run_now",
      resourceType: "publish_job",
      resourceId: jobId,
      resourceLabel: jobId,
      detail: "발행 작업을 즉시 실행 큐에 넣었습니다.",
    });
    return NextResponse.json({ ok: true, status: "queued" });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "RUN_NOW_REQUEST_INVALID",
      retryable: false,
    });
  }
}

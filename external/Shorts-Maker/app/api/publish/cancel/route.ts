import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canPublishCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { cancelPublishJob, getPublishJob } from "@/lib/publish/publish-store";

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
    const job = await getPublishJob(user.id, jobId);
    if (job && !canPublishCategory(scope, job.publishCategory)) {
      return toForbiddenApiResponse("발행 권한이 있는 고객(category) 작업만 취소할 수 있습니다.");
    }

    const result = await cancelPublishJob(user.id, jobId);
    if (result === "not_found") {
      return toApiErrorResponse("발행 작업을 찾을 수 없습니다.", { status: 404, errorCode: "JOB_NOT_FOUND", retryable: false });
    }
    if (result === "already_published") {
      return toApiErrorResponse("이미 발행된 작업은 취소할 수 없습니다.", {
        status: 400,
        errorCode: "JOB_ALREADY_PUBLISHED",
        retryable: false,
      });
    }
    if (result === "processing") {
      return toApiErrorResponse("처리 중인 작업은 취소할 수 없습니다.", {
        status: 409,
        errorCode: "JOB_ALREADY_PROCESSING",
        retryable: true,
      });
    }
    if (result === "already_canceled") {
      await recordAuditLogSafely({
        user,
        request,
        action: "publish.canceled",
        resourceType: "publish_job",
        resourceId: jobId,
        resourceLabel: jobId,
        detail: "이미 취소된 발행 작업을 다시 확인했습니다.",
        metadata: {
          status: "already_canceled",
        },
      });
      return NextResponse.json({ ok: true, status: "already_canceled" });
    }
    await recordAuditLogSafely({
      user,
      request,
      action: "publish.canceled",
      resourceType: "publish_job",
      resourceId: jobId,
      resourceLabel: jobId,
      detail: "발행 작업을 취소했습니다.",
      metadata: {
        status: "canceled",
      },
    });
    return NextResponse.json({ ok: true, status: "canceled" });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "CANCEL_REQUEST_INVALID",
      retryable: false,
    });
  }
}

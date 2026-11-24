import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canPublishCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { deleteFailedPublishJob, getPublishJob } from "@/lib/publish/publish-store";

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
      return toForbiddenApiResponse("발행 권한이 있는 고객(category) 작업만 휴지통으로 이동할 수 있습니다.");
    }

    const result = await deleteFailedPublishJob(user.id, jobId, {
      deletedBy: authUser.loginId || authUser.id,
      reason: "manual_trash",
    });
    if (result === "not_found") {
      return toApiErrorResponse("발행 작업을 찾을 수 없습니다.", { status: 404, errorCode: "JOB_NOT_FOUND", retryable: false });
    }
    if (result === "not_deletable") {
      return toApiErrorResponse("최종 실패 또는 취소 상태 작업만 삭제할 수 있습니다.", {
        status: 409,
        errorCode: "JOB_NOT_DELETABLE",
        retryable: false,
      });
    }
    await recordAuditLogSafely({
      user,
      request,
      action: "publish.deleted",
      resourceType: "publish_job",
      resourceId: jobId,
      resourceLabel: jobId,
      detail: "실패 또는 취소된 발행 작업을 휴지통으로 이동했습니다.",
    });
    return NextResponse.json({ ok: true, status: "deleted" });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "DELETE_REQUEST_INVALID",
      retryable: false,
    });
  }
}

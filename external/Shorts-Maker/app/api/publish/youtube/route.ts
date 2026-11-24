import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canPublishCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { readJsonBody } from "@/lib/network/request-body";
import { normalizeCategory } from "@/lib/publish/categories";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { SubmitPublishCommandError, submitPublishCommand } from "@/lib/publish/submit-command";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  try {
    const body = await readJsonBody(request);
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    const publishCategory = normalizeCategory(String((body as Record<string, unknown>).publishCategory || ""));
    if (!canPublishCategory(scope, publishCategory)) {
      return toForbiddenApiResponse("발행 권한이 있는 고객(category)으로만 발행할 수 있습니다.");
    }
    const job = await submitPublishCommand({
      userId: user.id,
      body,
      mode: "publish",
    });
    await recordAuditLogSafely({
      user,
      request,
      action: "publish.created",
      resourceType: "publish_job",
      resourceId: job.id,
      resourceLabel: job.title,
      detail: `${job.title || "제목 없음"} 발행 작업을 생성했습니다.`,
      metadata: {
        publishCategory: job.publishCategory || "",
        channelId: job.channelId,
      },
    });
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    if (e instanceof SubmitPublishCommandError) {
      return toApiErrorResponse(e.message, {
        status: e.status,
        errorCode: e.errorCode,
        retryable: e.retryable,
      });
    }
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "PUBLISH_REQUEST_INVALID",
      retryable: false,
    });
  }
}

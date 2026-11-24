import { NextRequest, NextResponse } from "next/server";
import { canManageWorkspace, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { repairPublishCategoriesFromChannels } from "@/lib/publish/publish-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  if (!canManageWorkspace(scope) && authUser.role !== "admin") {
    return toForbiddenApiResponse("카테고리 복구는 전체 권한 사용자만 가능합니다.");
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const force = Boolean(body.force);
    const repaired = await repairPublishCategoriesFromChannels(user.id, { force });
    return NextResponse.json({
      ok: true,
      repaired,
    });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 500,
      errorCode: "CATEGORY_REPAIR_FAILED",
      retryable: true,
    });
  }
}

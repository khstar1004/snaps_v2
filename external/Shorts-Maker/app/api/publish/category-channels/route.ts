import { NextRequest, NextResponse } from "next/server";
import { canManageWorkspace, filterCategoryMapByAccess, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import type { PublishCategory } from "@/lib/publish/types";
import {
  listGlobalPublishCategoryChannels,
  listPublishCategoryChannels,
  resolvePublishCustomerOwnerUserId,
  setPublishCategoryChannel,
} from "@/lib/publish/publish-store";
import { normalizeCategory } from "@/lib/publish/categories";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  return NextResponse.json({
    ok: true,
    categoryChannels: filterCategoryMapByAccess(
      authUser.role === "admin" ? await listGlobalPublishCategoryChannels() : await listPublishCategoryChannels(user.id),
      scope
    ),
  });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  try {
    if (!canManageWorkspace(scope) && authUser.role !== "admin") {
      return toForbiddenApiResponse("고객 채널 설정은 전체 권한 사용자만 가능합니다.");
    }
    const body = (await request.json()) as { categoryChannels?: Record<string, unknown> };
    const row = body?.categoryChannels && typeof body.categoryChannels === "object" ? body.categoryChannels : {};

    for (const [key, value] of Object.entries(row)) {
      const category = normalizeCategory(key) as PublishCategory;
      if (!category) continue;
      const raw = value;
      const channelId = asString(raw);
      const targetUserId =
        authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(category, user.id)) || user.id : user.id;
      await setPublishCategoryChannel(targetUserId, category, channelId || null);
    }

    return NextResponse.json({
      ok: true,
      categoryChannels: filterCategoryMapByAccess(
        authUser.role === "admin" ? await listGlobalPublishCategoryChannels() : await listPublishCategoryChannels(user.id),
        scope
      ),
    });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "CATEGORY_CHANNELS_REQUEST_INVALID",
      retryable: false,
    });
  }
}

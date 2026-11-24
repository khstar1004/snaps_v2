import { NextRequest, NextResponse } from "next/server";
import { filterCategoriesByAccess, filterCategoryMapByAccess, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import type { PublishAnalyticsInsightsResponse } from "@/lib/publish/client-types";
import {
  getPublishAnalyticsInsightsCache,
  getYoutubeAccount,
  listPublishCategoryChannels,
  listPublishJobs,
  refreshYoutubeAccountToken,
  setPublishAnalyticsInsightsCache,
} from "@/lib/publish/publish-store";
import {
  buildYoutubeAnalyticsInsights,
  type PublishAnalyticsInsightsPayload,
  YoutubeAnalyticsRequestError,
} from "@/lib/publish/youtube-analytics";

export const runtime = "nodejs";

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_CACHE_TTL_SEC = 15 * 60;

function parseWindowDays(value: string | null): number {
  const raw = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(raw)) return DEFAULT_WINDOW_DAYS;
  return Math.max(7, Math.min(90, raw));
}

function toCacheKey(input: { channelId: string; windowDays: number; categoryScopeKey?: string }): string {
  return `channel=${input.channelId}:window=${input.windowDays}:scope=${input.categoryScopeKey || "all"}`;
}

export async function GET(request: NextRequest) {
  try {
    const user = requireSessionUser(request);
    if (!user) return toUnauthorizedApiResponse();
    const authUser = requireAuthenticatedSessionUser(request) || user;
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });

    const channelId = String(request.nextUrl.searchParams.get("channelId") || "").trim();
    const windowDays = parseWindowDays(request.nextUrl.searchParams.get("windowDays"));
    const account = await getYoutubeAccount(user.id, channelId || undefined);
    if (!account) {
      return toApiErrorResponse("분석 대상 YouTube 채널이 연결되어 있지 않습니다.", {
        status: 404,
        errorCode: "YOUTUBE_ACCOUNT_NOT_FOUND",
        retryable: false,
      });
    }
    const filteredCategoryChannels = filterCategoryMapByAccess(await listPublishCategoryChannels(user.id), scope);
    const filteredJobs = filterCategoriesByAccess(await listPublishJobs(user.id, 1000), scope, (job) => job.publishCategory);
    if (scope.hasRestrictions) {
      const accessibleChannelIds = new Set<string>();
      for (const value of Object.values(filteredCategoryChannels)) {
        const mappedChannelId = typeof value === "string" ? value.trim() : "";
        if (mappedChannelId) accessibleChannelIds.add(mappedChannelId);
      }
      for (const job of filteredJobs) {
        const mappedChannelId = typeof job.channelId === "string" ? job.channelId.trim() : "";
        if (mappedChannelId) accessibleChannelIds.add(mappedChannelId);
      }
      if (!accessibleChannelIds.has(account.channelId)) {
        return toForbiddenApiResponse("허용된 고객(category)에 연결된 채널만 분석할 수 있습니다.");
      }
    }

    const cacheKey = toCacheKey({
      channelId: account.channelId,
      windowDays,
      categoryScopeKey: scope.hasRestrictions ? (scope.allowedCategories || []).join(",") : "all",
    });
    const cached = await getPublishAnalyticsInsightsCache<PublishAnalyticsInsightsPayload>(user.id, cacheKey);
    if (cached) {
      const response: PublishAnalyticsInsightsResponse = {
        ok: true,
        ...cached.value,
        cache: {
          hit: true,
          expiresAt: cached.expiresAt,
        },
      };
      return NextResponse.json(response);
    }

    const result = await buildYoutubeAnalyticsInsights({
      account,
      jobs: filteredJobs,
      windowDays,
    });

    if (result.refreshed) {
      await refreshYoutubeAccountToken({
        userId: user.id,
        channelId: account.channelId,
        accessToken: result.refreshed.accessToken,
        expiryDate: result.refreshed.expiryDate,
      });
    }

    const cacheRecord = await setPublishAnalyticsInsightsCache({
      userId: user.id,
      key: cacheKey,
      value: result.insights,
      ttlSec: DEFAULT_CACHE_TTL_SEC,
    });

    const response: PublishAnalyticsInsightsResponse = {
      ok: true,
      ...result.insights,
      cache: {
        hit: false,
        expiresAt: cacheRecord.expiresAt,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof YoutubeAnalyticsRequestError) {
      return toApiErrorResponse(error.message, {
        status: error.status,
        errorCode: error.errorCode,
        retryable: error.retryable,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return toApiErrorResponse(message, {
      status: 500,
      errorCode: "PUBLISH_ANALYTICS_INSIGHTS_FAILED",
      retryable: true,
    });
  }
}

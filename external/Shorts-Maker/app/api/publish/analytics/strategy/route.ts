import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { resolveCodexAccessTokenFromRequest } from "@/lib/auth/codex-server";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import {
  generateAnalyticsStrategyByCodex,
  type AnalyticsSnapshotForStrategy,
} from "@/lib/publish/analytics-codex-strategy";
import type { PublishAnalyticsStrategyResponse } from "@/lib/publish/client-types";

export const runtime = "nodejs";

function toSnapshot(body: unknown): AnalyticsSnapshotForStrategy {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    channelTitle: typeof row.channelTitle === "string" ? row.channelTitle : undefined,
    summary: row.summary as AnalyticsSnapshotForStrategy["summary"],
    categoryInsights: Array.isArray(row.categoryInsights) ? (row.categoryInsights as AnalyticsSnapshotForStrategy["categoryInsights"]) : undefined,
    timingInsights: Array.isArray(row.timingInsights) ? (row.timingInsights as AnalyticsSnapshotForStrategy["timingInsights"]) : undefined,
    videoLeaders: Array.isArray(row.videoLeaders) ? (row.videoLeaders as AnalyticsSnapshotForStrategy["videoLeaders"]) : undefined,
    videoRisks: Array.isArray(row.videoRisks) ? (row.videoRisks as AnalyticsSnapshotForStrategy["videoRisks"]) : undefined,
    recommendations: Array.isArray(row.recommendations) ? (row.recommendations as AnalyticsSnapshotForStrategy["recommendations"]) : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = requireSessionUser(request);
    if (!user) return toUnauthorizedApiResponse();

    const codexAccessToken = await resolveCodexAccessTokenFromRequest(request);
    if (!codexAccessToken) {
      return toApiErrorResponse("Codex 연결이 필요합니다. 로컬 bridge 또는 OAuth 연결 후 다시 시도해 주세요.", {
        status: 401,
        errorCode: "CODEX_AUTH_REQUIRED",
        retryable: false,
      });
    }

    const body = await request.json();
    const snapshot = toSnapshot(body);
    if (!snapshot.summary) {
      return toApiErrorResponse("전략 생성용 분석 데이터(summary)가 없습니다.", {
        status: 400,
        errorCode: "ANALYTICS_SNAPSHOT_REQUIRED",
        retryable: false,
      });
    }

    const result = await generateAnalyticsStrategyByCodex({
      codexAccessToken,
      snapshot,
    });
    const response: PublishAnalyticsStrategyResponse = {
      ok: true,
      strategy: result.strategy,
      model: result.model,
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toApiErrorResponse(message, {
      status: 500,
      errorCode: "PUBLISH_ANALYTICS_STRATEGY_FAILED",
      retryable: true,
    });
  }
}

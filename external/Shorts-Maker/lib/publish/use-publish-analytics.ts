"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPublishAnalyticsInsights, fetchPublishAnalyticsStrategy } from "@/lib/api/publish-client";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type {
  PublishAccountSummary,
  PublishAnalyticsInsightsResponse,
  PublishAnalyticsStrategyPayload,
} from "@/lib/publish/client-types";

export function usePublishAnalytics(input: {
  accounts: PublishAccountSummary[];
  effectiveChannelId: string;
}) {
  const [insightsChannelId, setInsightsChannelId] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsData, setAnalyticsData] = useState<PublishAnalyticsInsightsResponse | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState("");
  const [strategyData, setStrategyData] = useState<PublishAnalyticsStrategyPayload | null>(null);
  const [strategyModel, setStrategyModel] = useState("");

  const analyticsChannelId = (insightsChannelId || input.effectiveChannelId || input.accounts[0]?.channelId || "").trim();
  const analyticsChannelTitle = useMemo(() => {
    if (!analyticsChannelId) return "";
    return input.accounts.find((item) => item.channelId === analyticsChannelId)?.channelTitle || analyticsChannelId;
  }, [input.accounts, analyticsChannelId]);

  const analyticsSummary = analyticsData?.summary;
  const analyticsCategoryInsights = analyticsData?.categoryInsights || [];
  const analyticsTimingInsights = analyticsData?.timingInsights || [];
  const analyticsVideoLeaders = analyticsData?.videoLeaders || [];
  const analyticsVideoRisks = analyticsData?.videoRisks || [];
  const analyticsRecommendations = analyticsData?.recommendations || [];

  const refreshAnalytics = useCallback(async (channelIdInput: string) => {
    const targetChannelId = channelIdInput.trim();
    if (!targetChannelId) {
      setAnalyticsData(null);
      setAnalyticsError("");
      return;
    }
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const data = await fetchPublishAnalyticsInsights({
        channelId: targetChannelId,
        windowDays: 28,
      });
      if (!data.ok || !data.summary) {
        throw new Error(data.error || "분석 데이터가 비어 있습니다.");
      }
      setAnalyticsData(data);
      setStrategyData(null);
      setStrategyModel("");
      setStrategyError("");
      trackWorkflowEvent({
        name: "stage_timing",
        page: "publish",
        stage: "analytics",
        status: "success",
        detail: `analytics_loaded, channel=${targetChannelId}, cache_hit=${data.cache?.hit ? 1 : 0}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAnalyticsData(null);
      setAnalyticsError(message);
      setStrategyData(null);
      setStrategyModel("");
      setStrategyError("");
      trackWorkflowEvent({
        name: "stage_timing",
        page: "publish",
        stage: "analytics",
        status: "failure",
        detail: `analytics_failed, channel=${targetChannelId}, reason=${message}`,
      });
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const generateCodexStrategy = useCallback(async () => {
    if (!analyticsSummary) {
      setStrategyError("먼저 분석 데이터를 불러와 주세요.");
      setStrategyData(null);
      setStrategyModel("");
      return;
    }
    setStrategyLoading(true);
    setStrategyError("");
    try {
      const data = await fetchPublishAnalyticsStrategy({
        channelTitle: analyticsChannelTitle,
        summary: analyticsSummary,
        categoryInsights: analyticsCategoryInsights,
        timingInsights: analyticsTimingInsights,
        videoLeaders: analyticsVideoLeaders,
        videoRisks: analyticsVideoRisks,
        recommendations: analyticsRecommendations,
      });
      if (!data.ok || !data.strategy) {
        throw new Error(data.error || "Codex 전략 응답이 비어 있습니다.");
      }
      setStrategyData(data.strategy);
      setStrategyModel(data.model || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStrategyData(null);
      setStrategyModel("");
      setStrategyError(message);
    } finally {
      setStrategyLoading(false);
    }
  }, [
    analyticsCategoryInsights,
    analyticsChannelTitle,
    analyticsRecommendations,
    analyticsSummary,
    analyticsTimingInsights,
    analyticsVideoLeaders,
    analyticsVideoRisks,
  ]);

  useEffect(() => {
    if (input.accounts.length <= 0) {
      if (insightsChannelId) setInsightsChannelId("");
      return;
    }
    if (insightsChannelId && input.accounts.some((item) => item.channelId === insightsChannelId)) {
      return;
    }
    const fallback = (input.effectiveChannelId || input.accounts[0]?.channelId || "").trim();
    if (fallback && fallback !== insightsChannelId) {
      setInsightsChannelId(fallback);
    }
  }, [input.accounts, input.effectiveChannelId, insightsChannelId]);

  useEffect(() => {
    void refreshAnalytics(analyticsChannelId);
  }, [analyticsChannelId, refreshAnalytics]);

  useEffect(() => {
    setStrategyData(null);
    setStrategyError("");
    setStrategyModel("");
  }, [analyticsChannelId]);

  return {
    insightsChannelId,
    setInsightsChannelId,
    analyticsChannelId,
    analyticsChannelTitle,
    analyticsLoading,
    analyticsError,
    analyticsSummary,
    analyticsCategoryInsights,
    analyticsTimingInsights,
    analyticsVideoLeaders,
    analyticsVideoRisks,
    analyticsRecommendations,
    refreshAnalytics,
    strategyLoading,
    strategyError,
    strategyData,
    strategyModel,
    generateCodexStrategy,
  };
}

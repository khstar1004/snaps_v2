import { google } from "googleapis";
import type {
  PublishAnalyticsCategoryInsight,
  PublishAnalyticsSummary,
  PublishAnalyticsTimingInsight,
  PublishAnalyticsVideoInsight,
} from "@/lib/publish/client-types";
import type { OAuthAccount, PublishJobRecord } from "@/lib/publish/types";
import { createYoutubeOauthClient } from "@/lib/publish/youtube";

const METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
].join(",");
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type AggregateMetrics = {
  views: number;
  watchMinutes: number;
  avgViewDurationSec: number;
  avgViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
};

type VideoMetricRow = {
  videoId: string;
  views: number;
  watchMinutes: number;
  avgViewDurationSec: number;
  avgViewPercentage: number;
  subscribersNet: number;
};

type VideoMeta = {
  title: string;
  publishedAt?: string;
};

type PublishJobVideoMapItem = {
  category?: string;
  publishedAtTs?: number;
};

export type PublishAnalyticsInsightsPayload = {
  channelId: string;
  channelTitle: string;
  summary: PublishAnalyticsSummary;
  categoryInsights: PublishAnalyticsCategoryInsight[];
  timingInsights: PublishAnalyticsTimingInsight[];
  videoLeaders: PublishAnalyticsVideoInsight[];
  videoRisks: PublishAnalyticsVideoInsight[];
  recommendations: string[];
  dataFreshnessTs: number;
};

export type BuildYoutubeAnalyticsInsightsResult = {
  insights: PublishAnalyticsInsightsPayload;
  refreshed?: {
    accessToken: string;
    expiryDate: number;
  };
};

export class YoutubeAnalyticsRequestError extends Error {
  status: number;
  errorCode: string;
  retryable: boolean;

  constructor(message: string, options: { status: number; errorCode: string; retryable: boolean }) {
    super(message);
    this.name = "YoutubeAnalyticsRequestError";
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.retryable = options.retryable;
  }
}

function toIsoDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const [yRaw, mRaw, dRaw] = iso.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return toIsoDate(next.getTime());
}

function toFiniteNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toMetricDelta(current: number, previous: number) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safePrevious = Number.isFinite(previous) ? previous : 0;
  const delta = safeCurrent - safePrevious;
  const deltaPct = safePrevious > 0 ? (delta / safePrevious) * 100 : null;
  return {
    current: safeCurrent,
    previous: safePrevious,
    delta,
    deltaPct,
  };
}

function toUpstreamMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function toVideoScoreContext(videos: PublishAnalyticsVideoInsight[]): PublishAnalyticsVideoInsight[] {
  if (videos.length <= 0) return videos;
  const maxViews = Math.max(1, ...videos.map((item) => item.views));
  const maxSubsNet = Math.max(0, ...videos.map((item) => item.subscribersNet));
  return videos.map((item) => {
    const viewsNorm = item.views / maxViews;
    const retentionNorm = clampPercent(item.avgViewPercentage) / 100;
    const subsNorm = maxSubsNet > 0 ? Math.max(0, item.subscribersNet) / maxSubsNet : 0;
    const score = Math.round((viewsNorm * 0.45 + retentionNorm * 0.35 + subsNorm * 0.2) * 1000) / 10;
    return {
      ...item,
      score,
    };
  });
}

function kstWeekdayHourFromTs(ts: number): { weekday: number; hour: number } {
  const d = new Date(ts + KST_OFFSET_MS);
  return {
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
  };
}

function toWeekdayLabel(weekday: number): string {
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  return labels[weekday] || "?";
}

function toPublishedJobVideoMap(input: { jobs: PublishJobRecord[]; channelId: string }): Map<string, PublishJobVideoMapItem> {
  const map = new Map<string, PublishJobVideoMapItem>();
  for (const job of input.jobs) {
    if (job.status !== "published") continue;
    if ((job.channelId || "").trim() !== input.channelId) continue;
    const videoId = (job.platformPostId || "").trim();
    if (!videoId) continue;
    const current = map.get(videoId);
    const publishedAtTs = Number.isFinite(job.updatedAt) ? Number(job.updatedAt) : undefined;
    if (!current || (publishedAtTs || 0) > (current.publishedAtTs || 0)) {
      map.set(videoId, {
        category: (job.publishCategory || "").trim() || undefined,
        publishedAtTs,
      });
    }
  }
  return map;
}

function toEmptyAggregate(): AggregateMetrics {
  return {
    views: 0,
    watchMinutes: 0,
    avgViewDurationSec: 0,
    avgViewPercentage: 0,
    subscribersGained: 0,
    subscribersLost: 0,
    subscribersNet: 0,
  };
}

function parseAggregateRow(row: unknown[]): AggregateMetrics {
  const views = toFiniteNumber(row[0]);
  const watchMinutes = toFiniteNumber(row[1]);
  const avgViewDurationSec = Math.max(0, toFiniteNumber(row[2]));
  const avgViewPercentage = clampPercent(toFiniteNumber(row[3]));
  const subscribersGained = toFiniteNumber(row[4]);
  const subscribersLost = toFiniteNumber(row[5]);
  return {
    views,
    watchMinutes,
    avgViewDurationSec,
    avgViewPercentage,
    subscribersGained,
    subscribersLost,
    subscribersNet: subscribersGained - subscribersLost,
  };
}

async function queryAggregateMetrics(input: {
  analytics: ReturnType<typeof google.youtubeAnalytics>;
  startDate: string;
  endDate: string;
}): Promise<AggregateMetrics> {
  const response = await input.analytics.reports.query({
    ids: "channel==MINE",
    startDate: input.startDate,
    endDate: input.endDate,
    metrics: METRICS,
  });
  const rows = Array.isArray(response.data.rows) ? response.data.rows : [];
  if (rows.length <= 0 || !Array.isArray(rows[0])) {
    return toEmptyAggregate();
  }
  return parseAggregateRow(rows[0]);
}

async function queryVideoMetrics(input: {
  analytics: ReturnType<typeof google.youtubeAnalytics>;
  startDate: string;
  endDate: string;
}): Promise<VideoMetricRow[]> {
  const response = await input.analytics.reports.query({
    ids: "channel==MINE",
    startDate: input.startDate,
    endDate: input.endDate,
    metrics: METRICS,
    dimensions: "video",
    sort: "-views",
    maxResults: 200,
  });
  const rows = Array.isArray(response.data.rows) ? response.data.rows : [];
  return rows
    .map((row) => {
      if (!Array.isArray(row) || row.length < 7) return null;
      const videoId = String(row[0] || "").trim();
      if (!videoId) return null;
      const views = Math.max(0, toFiniteNumber(row[1]));
      const watchMinutes = Math.max(0, toFiniteNumber(row[2]));
      const avgViewDurationSec = Math.max(0, toFiniteNumber(row[3]));
      const avgViewPercentage = clampPercent(toFiniteNumber(row[4]));
      const subscribersNet = toFiniteNumber(row[5]) - toFiniteNumber(row[6]);
      return {
        videoId,
        views,
        watchMinutes,
        avgViewDurationSec,
        avgViewPercentage,
        subscribersNet,
      };
    })
    .filter((row): row is VideoMetricRow => Boolean(row));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function queryVideoMetaMap(input: {
  youtube: ReturnType<typeof google.youtube>;
  videoIds: string[];
}): Promise<Map<string, VideoMeta>> {
  const map = new Map<string, VideoMeta>();
  const chunks = chunkArray(input.videoIds, 50);
  for (const ids of chunks) {
    if (ids.length <= 0) continue;
    const response = await input.youtube.videos.list({
      part: ["snippet"],
      id: ids,
      maxResults: ids.length,
    });
    const items = Array.isArray(response.data.items) ? response.data.items : [];
    for (const item of items) {
      const videoId = String(item.id || "").trim();
      if (!videoId) continue;
      map.set(videoId, {
        title: String(item.snippet?.title || "").trim() || `영상 ${videoId}`,
        publishedAt: item.snippet?.publishedAt || undefined,
      });
    }
  }
  return map;
}

function buildCategoryInsights(videos: PublishAnalyticsVideoInsight[]): PublishAnalyticsCategoryInsight[] {
  const grouped = new Map<
    string,
    {
      videos: number;
      views: number;
      watchMinutes: number;
      weightedDuration: number;
      weightedPercentage: number;
      subscribersNet: number;
      weightedScore: number;
    }
  >();
  for (const video of videos) {
    const category = (video.category || "").trim() || "미분류";
    const bucket = grouped.get(category) || {
      videos: 0,
      views: 0,
      watchMinutes: 0,
      weightedDuration: 0,
      weightedPercentage: 0,
      subscribersNet: 0,
      weightedScore: 0,
    };
    const weight = Math.max(1, video.views);
    bucket.videos += 1;
    bucket.views += video.views;
    bucket.watchMinutes += video.watchMinutes;
    bucket.weightedDuration += video.avgViewDurationSec * weight;
    bucket.weightedPercentage += video.avgViewPercentage * weight;
    bucket.subscribersNet += video.subscribersNet;
    bucket.weightedScore += video.score * weight;
    grouped.set(category, bucket);
  }
  const insights = Array.from(grouped.entries()).map(([category, bucket]) => {
    const weight = Math.max(1, bucket.views);
    return {
      category,
      videos: bucket.videos,
      views: bucket.views,
      avgViewDurationSec: bucket.weightedDuration / weight,
      avgViewPercentage: bucket.weightedPercentage / weight,
      subscribersNet: bucket.subscribersNet,
      score: bucket.weightedScore / weight,
    };
  });
  return insights.sort((a, b) => b.score - a.score || b.views - a.views).slice(0, 8);
}

function buildTimingInsights(videos: PublishAnalyticsVideoInsight[]): PublishAnalyticsTimingInsight[] {
  const grouped = new Map<
    string,
    {
      weekday: number;
      hour: number;
      videos: number;
      views: number;
      weightedPercentage: number;
    }
  >();
  for (const video of videos) {
    const ts = video.publishedAt ? Date.parse(video.publishedAt) : Number.NaN;
    if (!Number.isFinite(ts)) continue;
    const { weekday, hour } = kstWeekdayHourFromTs(ts);
    const key = `${weekday}-${hour}`;
    const bucket = grouped.get(key) || {
      weekday,
      hour,
      videos: 0,
      views: 0,
      weightedPercentage: 0,
    };
    const weight = Math.max(1, video.views);
    bucket.videos += 1;
    bucket.views += video.views;
    bucket.weightedPercentage += video.avgViewPercentage * weight;
    grouped.set(key, bucket);
  }

  const raw = Array.from(grouped.values())
    .map((bucket) => ({
      weekday: bucket.weekday,
      hour: bucket.hour,
      slotLabel: `${toWeekdayLabel(bucket.weekday)} ${`${bucket.hour}`.padStart(2, "0")}:00`,
      videos: bucket.videos,
      avgViews: bucket.videos > 0 ? bucket.views / bucket.videos : 0,
      avgViewPercentage: bucket.views > 0 ? bucket.weightedPercentage / bucket.views : 0,
      score: 0,
    }))
    .filter((item) => item.videos >= 1);

  if (raw.length <= 0) return [];
  const maxAvgViews = Math.max(1, ...raw.map((item) => item.avgViews));
  return raw
    .map((item) => {
      const viewsNorm = item.avgViews / maxAvgViews;
      const retentionNorm = clampPercent(item.avgViewPercentage) / 100;
      const score = Math.round((viewsNorm * 0.7 + retentionNorm * 0.3) * 1000) / 10;
      return {
        ...item,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.avgViews - a.avgViews)
    .slice(0, 6);
}

function pickLeaders(videos: PublishAnalyticsVideoInsight[]): PublishAnalyticsVideoInsight[] {
  return [...videos].sort((a, b) => b.score - a.score || b.views - a.views).slice(0, 3);
}

function pickRisks(videos: PublishAnalyticsVideoInsight[]): PublishAnalyticsVideoInsight[] {
  if (videos.length <= 0) return [];
  const retentionSorted = [...videos].map((item) => item.avgViewPercentage).sort((a, b) => a - b);
  const medianRetention = retentionSorted[Math.floor(retentionSorted.length / 2)] || 0;
  return [...videos]
    .filter((item) => item.avgViewPercentage <= medianRetention || item.score <= 30)
    .sort((a, b) => a.score - b.score || a.avgViewPercentage - b.avgViewPercentage)
    .slice(0, 3);
}

function buildRecommendations(input: {
  categoryInsights: PublishAnalyticsCategoryInsight[];
  timingInsights: PublishAnalyticsTimingInsight[];
  summary: PublishAnalyticsSummary;
  riskVideos: PublishAnalyticsVideoInsight[];
}): string[] {
  const out: string[] = [];
  const bestCategory = input.categoryInsights.find((item) => item.category !== "미분류") || input.categoryInsights[0];
  if (bestCategory) {
    out.push(`카테고리 우선순위: '${bestCategory.category}' 비중을 늘리세요. (평균 점수 ${bestCategory.score.toFixed(1)})`);
  }
  const topSlots = input.timingInsights.slice(0, 2);
  if (topSlots.length > 0) {
    out.push(`권장 업로드 슬롯: ${topSlots.map((slot) => slot.slotLabel).join(", ")} (KST 기준)`);
  }
  if (input.summary.avgViewPercentage.deltaPct !== null && input.summary.avgViewPercentage.deltaPct < -5) {
    out.push("평균 시청률이 하락 중입니다. 오프닝 3초 훅을 더 강하게 구성하세요.");
  } else if (input.summary.subscribersNet.current <= 0) {
    out.push("구독 전환이 약합니다. 영상 후반 CTA 문구/위치를 테스트하세요.");
  }
  const topRisk = input.riskVideos[0];
  if (topRisk) {
    out.push(`개선 우선 영상: '${topRisk.title}' (시청률 ${topRisk.avgViewPercentage.toFixed(1)}%)`);
  }
  if (out.length <= 0) {
    out.push("현재 성과가 안정적입니다. 동일 카테고리/업로드 슬롯을 유지하며 A/B 테스트를 진행하세요.");
  }
  return out.slice(0, 4);
}

export async function buildYoutubeAnalyticsInsights(input: {
  account: OAuthAccount;
  jobs: PublishJobRecord[];
  windowDays: number;
  nowTs?: number;
}): Promise<BuildYoutubeAnalyticsInsightsResult> {
  const safeWindowDays = Math.max(7, Math.min(90, Math.floor(input.windowDays)));

  const nowTs = Number.isFinite(input.nowTs) ? Number(input.nowTs) : Date.now();
  const endDate = toIsoDate(nowTs - 24 * 60 * 60 * 1000);
  const startDate = shiftIsoDate(endDate, -(safeWindowDays - 1));
  const previousEndDate = shiftIsoDate(startDate, -1);
  const previousStartDate = shiftIsoDate(previousEndDate, -(safeWindowDays - 1));

  const oauth2Client = createYoutubeOauthClient();
  oauth2Client.setCredentials({
    access_token: input.account.accessToken,
    refresh_token: input.account.refreshToken,
    expiry_date: input.account.expiryDate,
  });
  const analytics = google.youtubeAnalytics({ version: "v2", auth: oauth2Client });
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const [currentAggregate, previousAggregate, videoRows] = await Promise.all([
      queryAggregateMetrics({ analytics, startDate, endDate }),
      queryAggregateMetrics({ analytics, startDate: previousStartDate, endDate: previousEndDate }),
      queryVideoMetrics({ analytics, startDate, endDate }),
    ]);

    const videoIds = videoRows.map((item) => item.videoId);
    const [videoMetaMap, publishedJobMap] = await Promise.all([
      queryVideoMetaMap({ youtube, videoIds }),
      Promise.resolve(toPublishedJobVideoMap({ jobs: input.jobs, channelId: input.account.channelId })),
    ]);

    const scoredVideos = toVideoScoreContext(
      videoRows.map((row) => {
        const meta = videoMetaMap.get(row.videoId);
        const fromJob = publishedJobMap.get(row.videoId);
        const publishedAt =
          meta?.publishedAt ||
          (Number.isFinite(fromJob?.publishedAtTs) ? new Date(Number(fromJob?.publishedAtTs)).toISOString() : undefined);
        return {
          videoId: row.videoId,
          title: meta?.title || `영상 ${row.videoId}`,
          url: `https://www.youtube.com/watch?v=${row.videoId}`,
          category: fromJob?.category,
          publishedAt,
          views: row.views,
          watchMinutes: row.watchMinutes,
          avgViewDurationSec: row.avgViewDurationSec,
          avgViewPercentage: row.avgViewPercentage,
          subscribersNet: row.subscribersNet,
          score: 0,
        };
      })
    );

    const summary: PublishAnalyticsSummary = {
      windowDays: safeWindowDays,
      compareWindowDays: safeWindowDays,
      startDate,
      endDate,
      previousStartDate,
      previousEndDate,
      views: toMetricDelta(currentAggregate.views, previousAggregate.views),
      watchMinutes: toMetricDelta(currentAggregate.watchMinutes, previousAggregate.watchMinutes),
      avgViewDurationSec: toMetricDelta(currentAggregate.avgViewDurationSec, previousAggregate.avgViewDurationSec),
      avgViewPercentage: toMetricDelta(currentAggregate.avgViewPercentage, previousAggregate.avgViewPercentage),
      subscribersNet: toMetricDelta(currentAggregate.subscribersNet, previousAggregate.subscribersNet),
    };

    const categoryInsights = buildCategoryInsights(scoredVideos);
    const timingInsights = buildTimingInsights(scoredVideos);
    const videoLeaders = pickLeaders(scoredVideos);
    const videoRisks = pickRisks(scoredVideos);
    const recommendations = buildRecommendations({
      categoryInsights,
      timingInsights,
      summary,
      riskVideos: videoRisks,
    });
    const dataFreshnessTs = Date.now();

    const credentials = oauth2Client.credentials;
    const refreshedAccessToken = String(credentials.access_token || "").trim();
    const refreshedExpiryDate = Number(credentials.expiry_date || 0);
    const refreshed =
      refreshedAccessToken &&
      Number.isFinite(refreshedExpiryDate) &&
      (refreshedAccessToken !== input.account.accessToken || refreshedExpiryDate !== input.account.expiryDate)
        ? {
            accessToken: refreshedAccessToken,
            expiryDate: refreshedExpiryDate,
          }
        : undefined;

    return {
      insights: {
        channelId: input.account.channelId,
        channelTitle: input.account.channelTitle,
        summary,
        categoryInsights,
        timingInsights,
        videoLeaders,
        videoRisks,
        recommendations,
        dataFreshnessTs,
      },
      refreshed,
    };
  } catch (error) {
    const message = toUpstreamMessage(error);
    if (message.toLowerCase().includes("insufficientpermissions") || message.toLowerCase().includes("insufficient permission")) {
      throw new YoutubeAnalyticsRequestError(
        "분석 권한이 부족합니다. YouTube 채널을 다시 연결한 뒤 재시도해 주세요.",
        {
          status: 403,
          errorCode: "YT_ANALYTICS_PERMISSION_DENIED",
          retryable: false,
        }
      );
    }
    throw new YoutubeAnalyticsRequestError(`YouTube Analytics 조회에 실패했습니다: ${message}`, {
      status: 502,
      errorCode: "YT_ANALYTICS_UPSTREAM_FAILED",
      retryable: true,
    });
  }
}

import type { PublishCategory, VideoAssetRecord } from "@/lib/publish/types";

export type WorkspacePermissionLevel = "view" | "edit" | "publish" | "manage";
export type WorkspaceAccessMode = "all" | "selected" | "none";

export type WorkspacePermissionsSummary = {
  accessMode: WorkspaceAccessMode;
  allAccessLevel: WorkspacePermissionLevel;
  hasRestrictions: boolean;
  categoryLevels: Partial<Record<string, WorkspacePermissionLevel>>;
  canManageWorkspace: boolean;
};

export type PublishAccountSummary = {
  channelId: string;
  channelTitle: string;
  updatedAt?: number;
};

export type PublishJobSummary = {
  id: string;
  channelId: string;
  videoUrl: string;
  publishCategory?: PublishCategory;
  title: string;
  status: string;
  visibility: string;
  scheduledAt: number | null;
  attempts: number;
  lastError: string | null;
  publishedUrl: string | null;
  createdAt: number;
};

export type PublishJobsResponse = {
  ok: boolean;
  accounts?: PublishAccountSummary[];
  jobs?: PublishJobSummary[];
  categoryChannels?: Partial<Record<PublishCategory, string>>;
  error?: string;
};

export type AssetsLatestResponse = {
  ok: boolean;
  latest: VideoAssetRecord | null;
  items: VideoAssetRecord[];
};

export type DeletedPublishCategorySummary = {
  key: string;
  label: string;
  deletedAt: number;
  relatedJobCount: number;
  relatedAssetCount: number;
};

export type DeletedPublishJobSummary = PublishJobSummary & {
  deletedAt: number;
};

export type DeletedVideoAssetSummary = VideoAssetRecord & {
  deletedAt: number;
};

export type PublishTrashResponse = {
  ok: boolean;
  categories?: DeletedPublishCategorySummary[];
  jobs?: DeletedPublishJobSummary[];
  assets?: DeletedVideoAssetSummary[];
  error?: string;
};

export type AnalyticsMetricDelta = {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export type PublishAnalyticsSummary = {
  windowDays: number;
  compareWindowDays: number;
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  views: AnalyticsMetricDelta;
  watchMinutes: AnalyticsMetricDelta;
  avgViewDurationSec: AnalyticsMetricDelta;
  avgViewPercentage: AnalyticsMetricDelta;
  subscribersNet: AnalyticsMetricDelta;
};

export type PublishAnalyticsCategoryInsight = {
  category: string;
  videos: number;
  views: number;
  avgViewDurationSec: number;
  avgViewPercentage: number;
  subscribersNet: number;
  score: number;
};

export type PublishAnalyticsTimingInsight = {
  weekday: number;
  hour: number;
  slotLabel: string;
  videos: number;
  avgViews: number;
  avgViewPercentage: number;
  score: number;
};

export type PublishAnalyticsVideoInsight = {
  videoId: string;
  title: string;
  url: string;
  category?: string;
  publishedAt?: string;
  views: number;
  watchMinutes: number;
  avgViewDurationSec: number;
  avgViewPercentage: number;
  subscribersNet: number;
  score: number;
};

export type PublishAnalyticsInsightsResponse = {
  ok: boolean;
  channelId?: string;
  channelTitle?: string;
  summary?: PublishAnalyticsSummary;
  categoryInsights?: PublishAnalyticsCategoryInsight[];
  timingInsights?: PublishAnalyticsTimingInsight[];
  videoLeaders?: PublishAnalyticsVideoInsight[];
  videoRisks?: PublishAnalyticsVideoInsight[];
  recommendations?: string[];
  dataFreshnessTs?: number;
  cache?: {
    hit: boolean;
    expiresAt: number;
  };
  error?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type PublishAnalyticsStrategyAction = {
  title: string;
  reason: string;
  execution: string;
  priority: "high" | "medium" | "low";
};

export type PublishAnalyticsStrategyPayload = {
  overview: string;
  actions: PublishAnalyticsStrategyAction[];
  nextUploadSlots: string[];
  contentIdeas: string[];
  watchouts: string[];
};

export type PublishAnalyticsStrategyResponse = {
  ok: boolean;
  strategy?: PublishAnalyticsStrategyPayload;
  model?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
};

import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type {
  AssetsLatestResponse,
  PublishAnalyticsInsightsResponse,
  PublishAnalyticsStrategyResponse,
  PublishJobsResponse,
  WorkspacePermissionsSummary,
} from "@/lib/publish/client-types";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";
import { requestApi } from "@/lib/ui/api-client";

export type CategoryOption = {
  key: PublishCategory;
  label: string;
};

export type CategoriesResponse = {
  ok: boolean;
  categories?: CategoryOption[];
  workspacePermissions?: WorkspacePermissionsSummary;
  storageReady?: boolean;
  error?: string;
};

export type CategoryMetadataResponse = {
  ok: boolean;
  categoryMetadata?: Record<PublishCategory, PublishMetadata>;
};

export type SingleCategoryMetadataResponse = {
  ok: boolean;
  metadata?: PublishMetadata;
};

export type SubmitPublishRequestInput = {
  mode: "publish" | "schedule";
  publishCategory: PublishCategory;
  channelId?: string;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  visibility: "private" | "public" | "unlisted";
  scheduledAt?: string;
};

export async function fetchPublishJobs(): Promise<PublishJobsResponse> {
  return requestApi<PublishJobsResponse>("/api/publish/jobs", { cache: "no-store" }, "발행 작업 목록을 불러오지 못했습니다.");
}

export async function fetchLatestAssets(): Promise<AssetsLatestResponse> {
  return requestApi<AssetsLatestResponse>("/api/assets/latest", { cache: "no-store" }, "최근 업로드 자산을 불러오지 못했습니다.");
}

export async function fetchCategoryMetadataMap(): Promise<CategoryMetadataResponse> {
  return requestApi<CategoryMetadataResponse>("/api/publish/category-metadata", { cache: "no-store" }, "카테고리 메타데이터를 불러오지 못했습니다.");
}

export async function fetchCategoryMetadata(
  category: PublishCategory,
  templateId: StudioTemplateId = "default"
): Promise<SingleCategoryMetadataResponse> {
  const params = new URLSearchParams({
    category,
    templateId: normalizeStudioTemplateId(templateId),
  });
  return requestApi<SingleCategoryMetadataResponse>(
    `/api/publish/category-metadata?${params.toString()}`,
    { cache: "no-store" },
    "카테고리 프리셋을 불러오지 못했습니다."
  );
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  return requestApi<CategoriesResponse>("/api/publish/categories", { cache: "no-store" }, "카테고리 목록을 불러오지 못했습니다.");
}

export async function fetchPublishAnalyticsInsights(input: {
  channelId?: string;
  windowDays?: number;
}): Promise<PublishAnalyticsInsightsResponse> {
  const params = new URLSearchParams();
  if (input.channelId) params.set("channelId", input.channelId);
  if (Number.isFinite(input.windowDays)) params.set("windowDays", String(Math.floor(Number(input.windowDays))));
  const query = params.toString();
  const path = query ? `/api/publish/analytics/insights?${query}` : "/api/publish/analytics/insights";
  return requestApi<PublishAnalyticsInsightsResponse>(path, { cache: "no-store" }, "YouTube 분석 정보를 불러오지 못했습니다.");
}

export async function fetchPublishAnalyticsStrategy(input: {
  channelTitle?: string;
  summary: unknown;
  categoryInsights?: unknown[];
  timingInsights?: unknown[];
  videoLeaders?: unknown[];
  videoRisks?: unknown[];
  recommendations?: string[];
}): Promise<PublishAnalyticsStrategyResponse> {
  return requestApi<PublishAnalyticsStrategyResponse>(
    "/api/publish/analytics/strategy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "Codex 전략 생성을 불러오지 못했습니다."
  );
}

export async function submitPublishRequest(input: SubmitPublishRequestInput): Promise<{ ok: boolean }> {
  const endpoint = input.mode === "publish" ? "/api/publish/youtube" : "/api/publish/schedule";
  return requestApi<{ ok: boolean }>(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publishCategory: input.publishCategory,
        channelId: input.channelId,
        videoUrl: input.videoUrl,
        title: input.title,
        description: input.description,
        tags: input.tags,
        visibility: input.visibility,
        scheduledAt: input.mode === "schedule" ? input.scheduledAt : undefined,
      }),
    },
    "발행 요청에 실패했습니다."
  );
}

export async function submitCategoryPublishRequest(input: {
  mode: "publish" | "schedule";
  publishCategory: PublishCategory;
  videoUrl: string;
  title: string;
  scheduledAt?: string;
}): Promise<{ ok: boolean }> {
  const metadataData = await fetchCategoryMetadata(input.publishCategory);
  if (!metadataData.metadata) {
    throw new Error("카테고리 메타데이터 응답이 올바르지 않습니다.");
  }
  return submitPublishRequest({
    mode: input.mode,
    publishCategory: input.publishCategory,
    videoUrl: input.videoUrl,
    title: input.title,
    description: metadataData.metadata.description,
    tags: metadataData.metadata.tags,
    visibility: "public",
    scheduledAt: input.scheduledAt,
  });
}

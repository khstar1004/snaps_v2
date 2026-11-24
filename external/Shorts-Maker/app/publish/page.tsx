"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PublishAnalyticsPanel } from "@/components/publish-analytics-panel";
import { PublishComposerPanel } from "@/components/publish-composer-panel";
import { fetchPublishComposerSnapshot } from "@/lib/api/publish-workspace-client";
import {
  submitPublishRequest,
  type CategoryOption,
} from "@/lib/api/publish-client";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishJobsResponse, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import { getPublishMetadata, listDefaultPublishMetadata } from "@/lib/publish/category-metadata";
import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory, toCategoryLabel } from "@/lib/publish/categories";
import { getPublishFormPreflightIssues } from "@/lib/publish/preflight";
import { executePublishSubmission } from "@/lib/publish/submit-flow";
import { usePublishAnalytics } from "@/lib/publish/use-publish-analytics";
import { AppLayout } from "@/components/AppLayout";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { usePreflightTracking } from "@/lib/telemetry/use-preflight-tracking";
import { loadChannelColors } from "@/lib/ui/channel-colors";
import { localDateTimeToIso } from "@/lib/ui/datetime";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import {
  canManageWorkspaceSummary,
  canPublishWorkspaceCategory,
  getWorkspaceCategoryPermissionLevel,
  toWorkspacePermissionLevelLabel,
} from "@/lib/ui/workspace-permissions";
import type { PublishCategory } from "@/lib/publish/types";

const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";

function parseTagsInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildDefaultCategoryMetadata(): Record<PublishCategory, PublishMetadata> {
  return listDefaultPublishMetadata();
}

export default function PublishPage() {
  const PREFERRED_CHANNEL_KEY = "publish-preferred-channel-id-v1";
  const [accounts, setAccounts] = useState<NonNullable<PublishJobsResponse["accounts"]>>([]);
  const [jobs, setJobs] = useState<NonNullable<PublishJobsResponse["jobs"]>>([]);
  const [categoryChannels, setCategoryChannels] = useState<Partial<Record<PublishCategory, string>>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const visibility: "private" | "public" | "unlisted" = "public";
  const [scheduledAt, setScheduledAt] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelColors, setChannelColors] = useState<Record<string, string>>({});
  const [channelSearch, setChannelSearch] = useState("");
  const autoFilledTitleRef = useRef("");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>(DEFAULT_PUBLISH_CATEGORY_OPTIONS);
  const [selectedCategory, setSelectedCategory] = useState<PublishCategory>(DEFAULT_CATEGORY);
  const [categoryMetadataMap, setCategoryMetadataMap] = useState<Record<PublishCategory, PublishMetadata>>(
    buildDefaultCategoryMetadata
  );
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspacePermissionsSummary | null>(null);
  const [presetApplied, setPresetApplied] = useState<{ description: boolean; tags: boolean }>({
    description: false,
    tags: false,
  });

  const authUrl = useMemo(() => "/api/auth/youtube/start?redirect=/publish", []);

  const selectedMetadata = categoryMetadataMap[selectedCategory] || getPublishMetadata(selectedCategory);
  const mappedChannelId = categoryChannels[selectedCategory] || "";
  const selectedCategoryPermissionLevel = getWorkspaceCategoryPermissionLevel(workspacePermissions, selectedCategory);
  const canPublishSelectedCategory = canPublishWorkspaceCategory(workspacePermissions, selectedCategory);
  const canManageCurrentWorkspace = canManageWorkspaceSummary(workspacePermissions);
  const publishPermissionMessage = canPublishSelectedCategory
    ? ""
    : selectedCategoryPermissionLevel === "none"
      ? `선택한 콘텐츠 프로필(${toCategoryLabel(selectedCategory)})에 대한 발행 권한이 없습니다.`
      : `선택한 콘텐츠 프로필(${toCategoryLabel(selectedCategory)})은 ${toWorkspacePermissionLevelLabel(selectedCategoryPermissionLevel)} 권한이라 발행할 수 없습니다.`;
  const mappedChannelTitle = useMemo(() => {
    if (!mappedChannelId) return "";
    return accounts.find((item) => item.channelId === mappedChannelId)?.channelTitle || "";
  }, [accounts, mappedChannelId]);
  const effectiveChannelId = (channelId || mappedChannelId || "").trim();
  const effectiveChannelTitle = useMemo(() => {
    if (!effectiveChannelId) return "";
    return accounts.find((item) => item.channelId === effectiveChannelId)?.channelTitle || "";
  }, [accounts, effectiveChannelId]);
  const isScheduleReady = Boolean(scheduledAt);
  const hasVideoAsset = Boolean(videoUrl.trim());
  const hasTitle = Boolean(title.trim());
  const hasEffectiveChannel = Boolean(effectiveChannelId);
  const hasConnectedChannel = hasEffectiveChannel && accounts.some((item) => item.channelId === effectiveChannelId);
  const preflightIssues = useMemo(
    () => getPublishFormPreflightIssues({ hasVideoAsset, hasTitle, hasEffectiveChannel, hasConnectedChannel, authUrl, requireSchedule: false, scheduledAt }),
    [authUrl, hasConnectedChannel, hasEffectiveChannel, hasTitle, hasVideoAsset, scheduledAt]
  );
  const schedulePreflightIssues = useMemo(
    () => getPublishFormPreflightIssues({ hasVideoAsset, hasTitle, hasEffectiveChannel, hasConnectedChannel, authUrl, requireSchedule: true, scheduledAt }),
    [authUrl, hasConnectedChannel, hasEffectiveChannel, hasTitle, hasVideoAsset, scheduledAt]
  );
  const isPreflightReady = preflightIssues.length === 0;
  const isSchedulePreflightReady = schedulePreflightIssues.length === 0;
  usePreflightTracking({ issues: preflightIssues, page: "publish", stage: "publish", ready: isPreflightReady });
  usePreflightTracking({ issues: schedulePreflightIssues, page: "publish", stage: "schedule", ready: isSchedulePreflightReady });
  const quickGuide = !videoUrl
    ? "다음 행동: 스튜디오에서 영상을 먼저 생성하면 여기서 바로 발행/예약할 수 있습니다."
    : "다음 행동: 제목/설명을 확인한 뒤 지금 발행 또는 예약 발행을 선택하세요.";
  const {
    analyticsCategoryInsights,
    analyticsChannelId,
    analyticsChannelTitle,
    analyticsError,
    analyticsLoading,
    analyticsRecommendations,
    analyticsSummary,
    analyticsTimingInsights,
    analyticsVideoLeaders,
    analyticsVideoRisks,
    generateCodexStrategy,
    refreshAnalytics,
    setInsightsChannelId,
    strategyData,
    strategyError,
    strategyLoading,
    strategyModel,
  } = usePublishAnalytics({
    accounts,
    effectiveChannelId,
  });

  useEffect(() => {
    if (presetApplied.description) {
      setDescription(selectedMetadata.description);
    }
    if (presetApplied.tags) {
      setTags(selectedMetadata.tags.join(", "));
    }
  }, [presetApplied.description, presetApplied.tags, selectedMetadata]);

  useEffect(() => {
    if (categoryOptions.some((item) => item.key === selectedCategory)) return;
    const first = categoryOptions[0]?.key || DEFAULT_CATEGORY;
    setSelectedCategory(first);
  }, [categoryOptions, selectedCategory]);

  const refresh = useCallback(async () => {
    const snapshot = await fetchPublishComposerSnapshot();
    setAccounts(snapshot.accounts);
    setJobs(snapshot.jobs);
    setCategoryChannels(snapshot.categoryChannels);
    setCategoryMetadataMap(snapshot.categoryMetadataMap);
    setCategoryOptions(snapshot.categoryOptions as CategoryOption[]);
    setWorkspacePermissions(snapshot.workspacePermissions || null);
    if (snapshot.latestAsset?.url) {
      const incomingTitle = String(snapshot.latestAsset.title || "").trim();
      setVideoUrl(snapshot.latestAsset.url);
      setTitle((prev) => {
        const prevTrimmed = prev.trim();
        if (!incomingTitle) return prev;
        if (!prevTrimmed || prevTrimmed === autoFilledTitleRef.current) {
          autoFilledTitleRef.current = incomingTitle;
          return incomingTitle;
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    trackWorkflowEvent({ name: "page_view", page: "publish", stage: "publish", status: "success" });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const videoUrlParam = params.get("videoUrl") || "";
    const titleParam = params.get("title") || "";
    const decodedVideoUrl = safeDecode(videoUrlParam).trim();
    const decodedTitle = safeDecode(titleParam).trim();
    if (decodedVideoUrl.startsWith("http://") || decodedVideoUrl.startsWith("https://")) {
      setVideoUrl(decodedVideoUrl);
      trackWorkflowEvent({
        name: "publish_form_opened",
        page: "publish",
        stage: "publish",
        status: "success",
        detail: "query_context",
      });
    }
    if (decodedTitle) {
      setTitle(decodedTitle);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = readScopedStorage(PREFERRED_CHANNEL_KEY) || "";
      if (!saved) return;
      if (accounts.some((item) => item.channelId === saved)) {
        setChannelId(saved);
      }
    } catch {
      return;
    }
  }, [accounts]);

  useEffect(() => {
    try {
      if (!channelId) return;
      writeScopedStorage(PREFERRED_CHANNEL_KEY, channelId);
    } catch {
      return;
    }
  }, [channelId]);

  useEffect(() => {
    void refresh().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  useEffect(() => {
    setChannelColors(loadChannelColors());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (!auth) return;
    if (auth === "success") {
      const channel = params.get("channel") || "YouTube";
      setMessage(`연결 완료: ${channel}`);
      void refresh().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
      return;
    }
    const reason = params.get("reason") || "OAuth 인증 실패";
    const reasonLabelMap: Record<string, string> = {
      invalid_state: "인증 상태 값이 올바르지 않습니다.",
      missing_code: "인증 코드가 전달되지 않았습니다.",
      access_denied: "권한 동의가 거부되었습니다.",
    };
    setMessage(`OAuth 인증 실패: ${reasonLabelMap[reason] || reason}`);
  }, [refresh]);

  const submit = async (mode: "publish" | "schedule") => {
    if (!canPublishSelectedCategory) {
      setMessage(publishPermissionMessage || "선택한 콘텐츠 프로필은 발행 권한이 없습니다.");
      return;
    }
    setLoading(true);
    setMessage("");
    trackWorkflowEvent({
      name: "publish_clicked",
      page: "publish",
      stage: mode === "publish" ? "publish" : "schedule",
      status: "success",
    });
    try {
      const activeIssues = mode === "publish" ? preflightIssues : schedulePreflightIssues;
      await executePublishSubmission({
        page: "publish",
        mode,
        issues: videoUrl ? activeIssues : [{ key: "video_missing", message: "업로드된 영상 자산이 없습니다. 먼저 영상을 생성해 주세요." }],
        submit: () =>
          submitPublishRequest({
            mode,
            publishCategory: selectedCategory,
            channelId: channelId || undefined,
            videoUrl,
            title,
            description,
            tags: parseTagsInput(tags),
            visibility,
            scheduledAt: mode === "schedule" && scheduledAt ? localDateTimeToIso(scheduledAt) : undefined,
          }),
        refresh,
        setMessage,
        successMessage: mode === "publish" ? "즉시 발행 작업이 등록되었습니다." : "예약 발행 작업이 생성되었습니다.",
        onSuccess: () => {
          trackWorkflowEvent({
            name: mode === "publish" ? "upload_now" : "upload_scheduled",
            page: "publish",
            stage: mode === "publish" ? "publish" : "schedule",
            status: "success",
          });
        },
        onFailure: (error) => {
          trackWorkflowEvent({
            name: mode === "publish" ? "upload_now" : "upload_scheduled",
            page: "publish",
            stage: mode === "publish" ? "publish" : "schedule",
            status: "failure",
            detail: error instanceof Error ? error.message : String(error),
          });
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (value: string) => {
    const next = normalizeCategory(value) || DEFAULT_CATEGORY;
    const nextMetadata = categoryMetadataMap[next] || getPublishMetadata(next);
    setSelectedCategory(next);
    setDescription(nextMetadata.description);
    setTags(nextMetadata.tags.join(", "));
    setPresetApplied({ description: true, tags: true });
    trackWorkflowEvent({
      name: "category_selected",
      page: "publish",
      stage: "publish",
      status: "success",
      detail: next,
    });
  };

  const handleScheduleChange = (value: string) => {
    setScheduledAt(value);
    if (!value) return;
    trackWorkflowEvent({
      name: "schedule_set",
      page: "publish",
      stage: "schedule",
      status: "success",
      detail: value,
    });
  };

  return (
    <AppLayout>
      <div className="page-stack">

        <section className="card page-hero-card">
          <div className="page-hero-head">
            <div className="page-hero-copy">
              <div className="page-hero-eyebrow">Publish</div>
              <h1 className="page-hero-title">YouTube 발행</h1>
              <p className="page-hero-description">
                필수 항목만 확인해서 즉시 발행하거나 예약 발행하세요.
              </p>
            </div>
            <div className="page-hero-actions">
              <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
                새로고침
              </button>
            </div>
          </div>
          <div className="page-hero-stats">
            <span className="page-chip">연결 채널 <strong>{accounts.length}</strong></span>
            <span className="page-chip">전체 작업 <strong>{jobs.length}</strong></span>
          </div>
        </section>

        <PublishAnalyticsPanel
          accounts={accounts}
          analyticsChannelId={analyticsChannelId}
          analyticsChannelTitle={analyticsChannelTitle}
          analyticsLoading={analyticsLoading}
          analyticsError={analyticsError}
          analyticsSummary={analyticsSummary}
          analyticsCategoryInsights={analyticsCategoryInsights}
          analyticsTimingInsights={analyticsTimingInsights}
          analyticsVideoLeaders={analyticsVideoLeaders}
          analyticsVideoRisks={analyticsVideoRisks}
          analyticsRecommendations={analyticsRecommendations}
          strategyLoading={strategyLoading}
          strategyError={strategyError}
          strategyData={strategyData}
          strategyModel={strategyModel}
          youtubeAuthUrl={authUrl}
          onAnalyticsChannelChangeAction={setInsightsChannelId}
          onRefreshAnalyticsAction={() => void refreshAnalytics(analyticsChannelId)}
          onGenerateStrategyAction={() => void generateCodexStrategy()}
        />

        <div className="page-section">
          <PublishComposerPanel
            quickGuide={quickGuide}
            publishReady={isPreflightReady}
            scheduleReady={isSchedulePreflightReady}
            canPublishSelectedCategory={canPublishSelectedCategory}
            canManageWorkspace={canManageCurrentWorkspace}
            publishPermissionMessage={publishPermissionMessage}
            publishIssues={preflightIssues}
            scheduleIssues={schedulePreflightIssues}
            hasVideoAsset={hasVideoAsset}
            accounts={accounts}
            channelSearch={channelSearch}
            selectedChannelId={channelId}
            effectiveChannelId={effectiveChannelId}
            effectiveChannelTitle={effectiveChannelTitle}
            channelColors={channelColors}
            description={description}
            tags={tags}
            presetApplied={presetApplied}
            selectedCategory={selectedCategory}
            categoryOptions={categoryOptions}
            mappedChannelId={mappedChannelId}
            mappedChannelTitle={mappedChannelTitle}
            title={title}
            loading={loading}
            scheduledAt={scheduledAt}
            isScheduleReady={isScheduleReady}
            message={message}
            youtubeAuthUrl={authUrl}
            onChannelSearchChangeAction={setChannelSearch}
            onUseCategoryDefaultAction={() => setChannelId("")}
            onSelectChannelAction={setChannelId}
            onDescriptionChangeAction={(value) => {
              setDescription(value);
              setPresetApplied((prev) => ({ ...prev, description: false }));
            }}
            onTagsChangeAction={(value) => {
              setTags(value);
              setPresetApplied((prev) => ({ ...prev, tags: false }));
            }}
            onCategoryChangeAction={handleCategoryChange}
            onTitleChangeAction={setTitle}
            onScheduleChangeAction={handleScheduleChange}
            onSubmitPublishAction={() => void submit("publish")}
            onSubmitScheduleAction={() => void submit("schedule")}
          />
        </div>
      </div>
    </AppLayout>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AssetsCategoryBrowser } from "@/components/assets-category-browser";
import { AssetsExplorerPanel } from "@/components/assets-explorer-panel";
import { AssetsOverviewCard } from "@/components/assets-overview-card";
import { LocalAudioLibraryManager } from "@/components/local-audio-library-manager";
import { PersonalV1LibraryNav } from "@/components/personal-v1-library-nav";
import { StudioMediaAssetsManager } from "@/components/studio-media-assets-manager";
import { useAssetsDrafts } from "@/lib/assets/use-assets-drafts";
import {
  fetchAssetsWorkspaceSnapshot,
  type PublishWorkspaceSnapshot,
} from "@/lib/api/publish-workspace-client";
import {
  deleteAssetById,
  fetchAssetStudioSnapshot,
  type AssetsCategoryOption,
} from "@/lib/api/assets-client";
import { useAssetsBrowserState } from "@/lib/assets/use-assets-browser-state";
import { getPersonalV1AssetsViewFromSearch } from "@/lib/personal-v1/library-navigation";
import type { AssetsLatestResponse, PublishAccountSummary, PublishJobSummary, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { toTelemetryErrorDetail } from "@/lib/telemetry/error-detail";
import { loadChannelColors } from "@/lib/ui/channel-colors";
import { writeScopedStorage } from "@/lib/ui/scoped-storage";
import {
  canEditWorkspaceCategory,
} from "@/lib/ui/workspace-permissions";
import {
  type StudioWorkDraft,
  type TemplateBranding,
} from "@/app/shorts-json-studio/types";
import { restoreStudioWorkDraftFromAssetSnapshot } from "@/app/shorts-json-studio/studio-asset-snapshot";
import { persistStudioEditorPresetForCategory } from "@/app/shorts-json-studio/studio-category-preset-storage";
import { normalizeTemplateImageLayout, normalizeTemplateLayoutApply } from "@/app/shorts-json-studio/studio-page-helpers";
import { normalizeStudioTemplateData } from "@/app/shorts-json-studio/components/templates/template-registry";
import { normalizeStudioTemplateId } from "@/types/studio-template";
import {
  isStudioDraftStorageKey,
  isStudioHistoryStorageKey,
  STUDIO_LAST_PUBLISH_CATEGORY_KEY,
  readStoredStudioDraft,
  readStoredStudioHistory,
  writeStoredStudioDraft,
  writeStoredStudioHistory,
} from "@/app/shorts-json-studio/storage";
import {
  type PersonalV1ProjectContext,
  writePersonalV1ProjectContext,
} from "@/app/projects/new/project-context-storage";
import { buildPersonalV1HistoryArchiveEntryBeforeOverwrite } from "@/lib/personal-v1/studio-dashboard-helpers";
import { buildPersonalV1CompletedVideoRevision } from "@/lib/personal-v1/completed-video-revision";

type AssetsStudioResumeEntry = {
  draft: StudioWorkDraft;
  source: "draft" | "history";
  label: string;
  createdAt: string | null;
  historyId?: string | null;
};

function toComparableTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveStudioDraftTitle(draft: StudioWorkDraft | null): string {
  if (!draft) return "";
  const parsedJsonTitle = (() => {
    if (typeof draft.jsonText !== "string" || !draft.jsonText.trim()) return "";
    try {
      const parsed = JSON.parse(draft.jsonText) as Record<string, unknown>;
      return typeof parsed.title === "string" ? parsed.title : "";
    } catch {
      return "";
    }
  })();
  const slideTitle = Array.isArray(draft.slides) ? draft.slides.find((slide) => typeof slide?.title === "string" && slide.title.trim())?.title || "" : "";
  return toComparableTitle(parsedJsonTitle || slideTitle);
}

function buildStudioResumeMap(items: AssetsLatestResponse["items"]): Record<string, AssetsStudioResumeEntry> {
  const nextMap: Record<string, AssetsStudioResumeEntry> = {};
  const draftByCategory = new Map<string, StudioWorkDraft | null>();
  const historyByCategory = new Map<string, ReturnType<typeof readStoredStudioHistory>>();

  for (const item of items) {
    const categoryKey = String(item.publishCategory || "").trim() || "default";
    if (!draftByCategory.has(categoryKey)) {
      draftByCategory.set(categoryKey, readStoredStudioDraft(categoryKey));
    }
    if (!historyByCategory.has(categoryKey)) {
      historyByCategory.set(categoryKey, readStoredStudioHistory(categoryKey));
    }
    const currentDraft = draftByCategory.get(categoryKey) || null;
    const currentDraftTitle = resolveStudioDraftTitle(currentDraft);
    const historyState = historyByCategory.get(categoryKey);
    const historyEntries = Array.isArray(historyState?.historyEntries) ? historyState.historyEntries : [];
    const assetTitle = toComparableTitle(item.title || "");
    if (!assetTitle) continue;

    if (currentDraft && currentDraftTitle && currentDraftTitle === assetTitle) {
      nextMap[item.id] = {
        draft: currentDraft,
        source: "draft",
        label: "현재 작업 초안",
        createdAt: null,
        historyId: null,
      };
      continue;
    }

    const matchedHistory = historyEntries.find((entry) => resolveStudioDraftTitle(entry.draft) === assetTitle);
    if (!matchedHistory) continue;

    nextMap[item.id] = {
      draft: matchedHistory.draft,
      source: "history",
      label: matchedHistory.label || "저장된 스냅샷",
      createdAt: typeof matchedHistory.createdAt === "string" ? matchedHistory.createdAt : null,
      historyId: matchedHistory.id || null,
    };
  }

  return nextMap;
}

function CompletedVideoLibraryView() {
  const CATEGORY_INITIAL_VISIBLE_COUNT = 4;
  const CATEGORY_VISIBLE_STEP = 4;
  const openingStudioAssetIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<AssetsLatestResponse["items"]>([]);
  const [jobs, setJobs] = useState<PublishJobSummary[]>([]);
  const [accounts, setAccounts] = useState<PublishAccountSummary[]>([]);
  const [categoryChannels, setCategoryChannels] = useState<Partial<Record<string, string>>>({});
  const [categoryMetadataMap, setCategoryMetadataMap] = useState<PublishWorkspaceSnapshot["categoryMetadataMap"]>({});
  const [categoryOptions, setCategoryOptions] = useState<AssetsCategoryOption[]>([]);
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspacePermissionsSummary | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [channelColors, setChannelColors] = useState<Record<string, string>>({});
  const [studioResumeMap, setStudioResumeMap] = useState<Record<string, AssetsStudioResumeEntry>>({});
  const [openingStudioAssetId, setOpeningStudioAssetId] = useState<string | null>(null);
  const [creatingRevisionAssetId, setCreatingRevisionAssetId] = useState<string | null>(null);

  useEffect(() => {
    trackWorkflowEvent({
      name: "page_view",
      page: "assets",
      stage: "assets",
      status: "success",
    });
  }, []);

  useEffect(() => {
    setChannelColors(loadChannelColors());
  }, []);

  const refreshStudioResumeMap = useCallback(() => {
    setStudioResumeMap(buildStudioResumeMap(items));
  }, [items]);

  const refresh = useCallback(async () => {
    const snapshot = await fetchAssetsWorkspaceSnapshot();
    setItems(snapshot.assets.items);
    setCategoryOptions(snapshot.categoryOptions as AssetsCategoryOption[]);
    setJobs(snapshot.jobs);
    setAccounts(snapshot.accounts);
    setCategoryChannels(snapshot.categoryChannels);
    setCategoryMetadataMap(snapshot.categoryMetadataMap);
    setWorkspacePermissions(snapshot.workspacePermissions || null);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    refreshStudioResumeMap();
  }, [refreshStudioResumeMap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key && !isStudioDraftStorageKey(event.key) && !isStudioHistoryStorageKey(event.key)) return;
      refreshStudioResumeMap();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshStudioResumeMap);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshStudioResumeMap);
    };
  }, [refreshStudioResumeMap]);

  useEffect(() => {
    if (selectedCategory === "all" || selectedCategory === "uncategorized") return;
    const exists = categoryOptions.some((item) => item.key === selectedCategory);
    if (!exists) {
      setSelectedCategory("all");
    }
  }, [selectedCategory, categoryOptions]);

  const {
    draftMap,
  } = useAssetsDrafts({
    items,
    jobs,
    categoryChannels,
    categoryOptions,
    categoryMetadataMap,
  });
  const {
    categoryLabelMap,
    filteredItems,
    groupedItems,
    jobsByVideoUrl,
    loadMoreInCategory,
    visibleCountByCategory,
  } = useAssetsBrowserState({
    items,
    jobs,
    categoryOptions,
    selectedCategory,
    search,
    draftMap,
    categoryChannels,
    accounts,
    initialVisibleCount: CATEGORY_INITIAL_VISIBLE_COUNT,
    visibleStep: CATEGORY_VISIBLE_STEP,
  });
  const selectedCategoryEditable =
    selectedCategory !== "all" && selectedCategory !== "uncategorized"
      ? canEditWorkspaceCategory(workspacePermissions, selectedCategory)
      : true;
  const selectedCategoryPermissionNotice =
    !selectedCategoryEditable
      ? "선택한 콘텐츠 프로필의 영상은 현재 편집할 수 없습니다. 재생과 원본 확인만 가능합니다."
      : "";

  const activateStudioDraft = useCallback((input: {
    targetCategory: string;
    profileLabel: string;
    draft: StudioWorkDraft;
    historyId: string | null;
    projectContext?: PersonalV1ProjectContext;
    brandingDraft?: TemplateBranding;
  }) => {
    const targetCategory = input.targetCategory.trim();
    if (!targetCategory) throw new Error("작업을 열 콘텐츠 프로필이 없습니다.");

    const currentDraft = readStoredStudioDraft(targetCategory);
    const archiveEntry = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
      currentDraft,
      nextDraft: input.draft,
      category: targetCategory,
      categoryLabel: input.profileLabel,
      reason: "category_draft_overwrite",
    });
    const currentHistory = readStoredStudioHistory(targetCategory);
    if (archiveEntry || currentHistory.activeHistoryId !== input.historyId) {
      writeStoredStudioHistory(targetCategory, {
        activeHistoryId: input.historyId,
        historyEntries: archiveEntry
          ? [archiveEntry, ...currentHistory.historyEntries.filter((entry) => entry.id !== archiveEntry.id)]
          : currentHistory.historyEntries,
      });
    }

    writeScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY, targetCategory);
    writeStoredStudioDraft(targetCategory, input.draft);
    if (input.projectContext) writePersonalV1ProjectContext(input.projectContext);
    if (input.brandingDraft) {
      const templateId = normalizeStudioTemplateId(input.draft.templateId);
      persistStudioEditorPresetForCategory({
        category: targetCategory,
        branding: input.brandingDraft,
        templatePreset: {
          templateId,
          templateData: normalizeStudioTemplateData(templateId, input.draft.templateData),
          templateImageEnabled: Boolean(input.draft.templateImageEnabled),
          templateImageUrl: typeof input.draft.templateImageUrl === "string" ? input.draft.templateImageUrl : "",
          templateImageLayout: normalizeTemplateImageLayout(input.draft.templateImageLayout),
          templateLayoutApply: normalizeTemplateLayoutApply(input.draft.templateLayoutApply),
        },
      });
    }
  }, []);

  const deleteAsset = async (asset: AssetsLatestResponse["items"][number]) => {
    const confirmed = window.confirm(`"${asset.title}" 자산을 휴지통으로 이동할까요?\n휴지통에서 다시 복구할 수 있습니다.`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    trackWorkflowEvent({
      name: "asset_job_action_clicked",
      page: "assets",
      stage: "asset",
      status: "success",
      detail: "asset_delete",
    });
    try {
      await deleteAssetById(asset.id);
      trackWorkflowEvent({
        name: "asset_job_action_succeeded",
        page: "assets",
        stage: "asset",
        status: "success",
        detail: "asset_delete",
      });
      if (previewAssetId === asset.id) {
        setPreviewAssetId(null);
      }
      setMessage("자산을 휴지통으로 이동했습니다.");
      await refresh();
    } catch (e) {
      const telemetry = toTelemetryErrorDetail(e);
      trackWorkflowEvent({
        name: "asset_job_action_failed",
        page: "assets",
        stage: "asset",
        status: "failure",
        detail: `asset_delete: ${telemetry.detail}`,
        errorCode: telemetry.errorCode,
        retryable: telemetry.retryable,
      });
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const resumeStudioWork = useCallback(async (
    asset: AssetsLatestResponse["items"][number],
    categoryKey: string
  ) => {
    if (openingStudioAssetIdRef.current) return;
    openingStudioAssetIdRef.current = asset.id;
    setOpeningStudioAssetId(asset.id);
    setMessage("");
    try {
      let response: Awaited<ReturnType<typeof fetchAssetStudioSnapshot>> | null = null;
      let snapshotLoadError: unknown = null;
      try {
        response = await fetchAssetStudioSnapshot(asset.id);
      } catch (error) {
        snapshotLoadError = error;
      }
      if (response && (!response.asset || response.asset.id !== asset.id)) {
        throw new Error("완성 영상과 제작 스냅샷의 식별 정보가 일치하지 않습니다.");
      }
      const categoryCandidates = [
        categoryKey === "uncategorized" ? "" : categoryKey,
        asset.publishCategory,
        response?.asset.publishCategory,
        response?.snapshot?.draft?.publishCategory || response?.snapshot?.publishCategory,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const distinctCategories = Array.from(new Set(categoryCandidates));
      if (distinctCategories.length > 1) {
        throw new Error("완성 영상과 제작 스냅샷의 콘텐츠 프로필이 일치하지 않습니다.");
      }
      const resolvedCategory = distinctCategories[0] || "";
      if (resolvedCategory && !canEditWorkspaceCategory(workspacePermissions, resolvedCategory)) {
        throw new Error("이 콘텐츠 프로필을 편집할 수 없어 작업을 열 수 없습니다.");
      }
      const restored = restoreStudioWorkDraftFromAssetSnapshot({
        snapshot: response?.snapshot,
        assetUrl: response?.asset?.url || asset.url,
        fallbackPublishCategory: resolvedCategory || undefined,
      });
      if (restored) {
        const targetCategory = resolvedCategory || restored.draft.publishCategory || "default";
        if (!canEditWorkspaceCategory(workspacePermissions, targetCategory)) {
          throw new Error("이 콘텐츠 프로필을 편집할 수 없어 작업을 열 수 없습니다.");
        }
        const profileLabel = categoryOptions.find((option) => option.key === targetCategory)?.label || targetCategory;
        activateStudioDraft({
          targetCategory,
          profileLabel,
          draft: restored.draft,
          historyId: null,
          brandingDraft: restored.brandingDraft,
        });
        trackWorkflowEvent({
          name: "asset_job_action_clicked",
          page: "assets",
          stage: "asset",
          status: "success",
          detail: "resume_studio_asset_snapshot",
        });
        window.location.assign("/shorts-json-studio");
        return;
      }

      const matched = studioResumeMap[asset.id];
      if (!matched) {
        if (snapshotLoadError) throw snapshotLoadError;
        setMessage(
          `"${asset.title}" 자산에는 다시 열 수 있는 제작 스냅샷이 없습니다. 구형 자산과 제목이 일치하는 로컬 초안도 찾지 못했습니다.`
        );
        return;
      }
      const matchedCategory = String(matched.draft.publishCategory || "").trim();
      if (resolvedCategory && matchedCategory && resolvedCategory !== matchedCategory) {
        throw new Error("완성 영상과 로컬 제작 상태의 콘텐츠 프로필이 일치하지 않습니다.");
      }
      const targetCategory = resolvedCategory || matchedCategory || "default";
      if (!canEditWorkspaceCategory(workspacePermissions, targetCategory)) {
        throw new Error("이 콘텐츠 프로필을 편집할 수 없어 작업을 열 수 없습니다.");
      }
      const profileLabel = categoryOptions.find((option) => option.key === targetCategory)?.label || targetCategory;
      activateStudioDraft({
        targetCategory,
        profileLabel,
        draft: matched.draft,
        historyId: matched.source === "history" ? matched.historyId || null : null,
      });
      trackWorkflowEvent({
        name: "asset_job_action_clicked",
        page: "assets",
        stage: "asset",
        status: "success",
        detail: matched.source === "history" ? "resume_studio_history" : "resume_studio_draft",
      });
      window.location.assign("/shorts-json-studio");
    } catch (error) {
      const detail = toTelemetryErrorDetail(error);
      trackWorkflowEvent({
        name: "asset_job_action_failed",
        page: "assets",
        stage: "asset",
        status: "failure",
        detail: `resume_studio: ${detail.detail}`,
        errorCode: detail.errorCode,
        retryable: detail.retryable,
      });
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      openingStudioAssetIdRef.current = null;
      setOpeningStudioAssetId(null);
    }
  }, [activateStudioDraft, categoryOptions, studioResumeMap, workspacePermissions]);

  const createRevisionFromAsset = useCallback(async (
    asset: AssetsLatestResponse["items"][number],
    categoryKey: string
  ) => {
    if (openingStudioAssetIdRef.current) return;
    openingStudioAssetIdRef.current = asset.id;
    setCreatingRevisionAssetId(asset.id);
    setMessage("");
    try {
      const response = await fetchAssetStudioSnapshot(asset.id);
      if (!response.asset || response.asset.id !== asset.id) {
        throw new Error("완성 영상과 제작 스냅샷의 식별 정보가 일치하지 않습니다.");
      }

      const categoryCandidates = [
        categoryKey === "uncategorized" ? "" : categoryKey,
        asset.publishCategory,
        response.asset.publishCategory,
        response.snapshot?.draft?.publishCategory || response.snapshot?.publishCategory,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const distinctCategories = Array.from(new Set(categoryCandidates));
      if (distinctCategories.length > 1) {
        throw new Error("완성 영상과 제작 스냅샷의 콘텐츠 프로필이 일치하지 않습니다.");
      }
      const targetCategory = distinctCategories[0] || "";
      const profile = categoryOptions.find((option) => option.key === targetCategory);
      if (!targetCategory || !profile) {
        throw new Error("콘텐츠 프로필이 연결된 완성 영상에서만 수정본을 만들 수 있습니다.");
      }
      if (!canEditWorkspaceCategory(workspacePermissions, targetCategory)) {
        throw new Error("이 콘텐츠 프로필을 편집할 수 없어 수정본을 만들 수 없습니다.");
      }

      const restored = restoreStudioWorkDraftFromAssetSnapshot({
        snapshot: response.snapshot,
        assetUrl: response.asset.url || asset.url,
        fallbackPublishCategory: targetCategory,
      });
      if (!restored) {
        throw new Error(
          `"${asset.title}" 자산에는 수정본을 만들 수 있는 제작 스냅샷이 없습니다. 원본 영상은 그대로 유지됩니다.`
        );
      }

      const revision = buildPersonalV1CompletedVideoRevision({
        sourceDraft: restored.draft,
        category: targetCategory,
        profileLabel: profile.label,
        categoryMetadata: categoryMetadataMap[targetCategory] || null,
      });
      activateStudioDraft({
        targetCategory,
        profileLabel: profile.label,
        draft: revision.draft,
        historyId: null,
        projectContext: revision.context,
        brandingDraft: restored.brandingDraft,
      });
      trackWorkflowEvent({
        name: "asset_job_action_clicked",
        page: "assets",
        stage: "asset",
        status: "success",
        detail: "create_revision_from_asset_snapshot",
      });
      window.location.assign("/shorts-json-studio?mode=onboarding");
    } catch (error) {
      const detail = toTelemetryErrorDetail(error);
      trackWorkflowEvent({
        name: "asset_job_action_failed",
        page: "assets",
        stage: "asset",
        status: "failure",
        detail: `create_revision: ${detail.detail}`,
        errorCode: detail.errorCode,
        retryable: detail.retryable,
      });
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      openingStudioAssetIdRef.current = null;
      setCreatingRevisionAssetId(null);
    }
  }, [activateStudioDraft, categoryMetadataMap, categoryOptions, workspacePermissions]);

  return (
    <>
      <AssetsOverviewCard
        loading={loading}
        totalAssets={items.length}
        filteredAssets={filteredItems.length}
        onRefreshAction={() => void refresh()}
      />

      {message && <div className="assets-inline-banner is-error">{message}</div>}
      {selectedCategoryPermissionNotice ? (
        <div className="assets-inline-banner is-warning">
          {selectedCategoryPermissionNotice}
        </div>
      ) : null}

      <AssetsExplorerPanel
        selectedCategory={selectedCategory}
        categoryOptions={categoryOptions}
        search={search}
        hasResults={groupedItems.length > 0}
        onCategoryChangeAction={setSelectedCategory}
        onSearchChangeAction={setSearch}
      >
        <AssetsCategoryBrowser
          groupedItems={groupedItems}
          categoryLabelMap={categoryLabelMap}
          jobsByVideoUrl={jobsByVideoUrl}
          accounts={accounts}
          draftMap={draftMap}
          studioResumeMap={studioResumeMap}
          categoryChannels={categoryChannels}
          visibleCountByCategory={visibleCountByCategory}
          categoryInitialVisibleCount={CATEGORY_INITIAL_VISIBLE_COUNT}
          previewAssetId={previewAssetId}
          loading={loading}
          openingStudioAssetId={openingStudioAssetId}
          creatingRevisionAssetId={creatingRevisionAssetId}
          channelColors={channelColors}
          canEditCategoryAction={(categoryKey) => canEditWorkspaceCategory(workspacePermissions, categoryKey)}
          onTogglePreviewAction={(assetId) => setPreviewAssetId((prev) => (prev === assetId ? null : assetId))}
          onResumeStudioAction={resumeStudioWork}
          onCreateRevisionAction={createRevisionFromAsset}
          onDeleteAssetAction={(asset) => void deleteAsset(asset)}
          onLoadMoreAction={loadMoreInCategory}
        />
      </AssetsExplorerPanel>
    </>
  );
}

function SupportingAssetsLibraryView() {
  return (
    <>
      <section className="card page-hero-card assets-overview-card">
        <div className="page-hero-head">
          <div className="page-hero-copy">
            <div className="page-hero-eyebrow">Library · Source</div>
            <h1 className="page-hero-title">보조 자산</h1>
            <p className="page-hero-description">
              제작에 반복해서 사용하는 이미지·클립 소스와 배경음·효과음을 종류별 보관함에서 관리합니다.
            </p>
          </div>
        </div>
      </section>
      <StudioMediaAssetsManager />
      <LocalAudioLibraryManager />
    </>
  );
}

function AssetsPageContent() {
  const searchParams = useSearchParams();
  const libraryView = getPersonalV1AssetsViewFromSearch(searchParams.toString());

  return (
    <AppLayout>
      <div className="assets-page-stack">
        <PersonalV1LibraryNav activeSection={libraryView} />
        {libraryView === "videos" ? <CompletedVideoLibraryView /> : <SupportingAssetsLibraryView />}
      </div>
    </AppLayout>
  );
}

function AssetsPageFallback() {
  return (
    <AppLayout>
      <div className="assets-page-stack">
        <section className="card page-section-card" aria-live="polite">
          <div className="page-muted-box">라이브러리 구성을 불러오는 중입니다.</div>
        </section>
      </div>
    </AppLayout>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<AssetsPageFallback />}>
      <AssetsPageContent />
    </Suspense>
  );
}

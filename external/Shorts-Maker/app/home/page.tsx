"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  listStoredStudioHistoryEntries,
  readStoredStudioDraft,
  readStoredStudioDraftUpdatedAt,
  readStoredStudioHistory,
  setStoredStudioHistoryActiveId,
  STUDIO_LAST_PUBLISH_CATEGORY_KEY,
  writeStoredStudioDraft,
  writeStoredStudioHistory,
} from "@/app/shorts-json-studio/storage";
import { readPersonalV1ProjectContext } from "@/app/projects/new/project-context-storage";
import { fetchAssetsLatest } from "@/lib/api/assets-client";
import { fetchPublishWorkspaceSnapshot } from "@/lib/api/publish-workspace-client";
import {
  isPersonalV1MeaningfulDraft,
  buildPersonalV1HistoryArchiveEntryBeforeOverwrite,
  summarizePersonalV1CategoryDrafts,
  summarizePersonalV1HistoryEntries,
  summarizePersonalV1VideoAssets,
  type PersonalV1CategoryDraftSummary,
  type PersonalV1HistorySummary,
  type PersonalV1VideoAssetSummary,
} from "@/lib/personal-v1/studio-dashboard-helpers";
import {
  buildPersonalV1ProjectIndex,
  sortPersonalV1ProjectIndexByRepresentativeActivity,
  type PersonalV1ProjectIndexItem,
} from "@/lib/personal-v1/studio-project-index";
import { normalizeAssetsLatestResponse } from "@/lib/publish/client-normalize";
import { writeScopedStorage } from "@/lib/ui/scoped-storage";
import styles from "@/styles/personal-v1.module.css";

type DashboardData = {
  currentDrafts: PersonalV1CategoryDraftSummary[];
  history: PersonalV1HistorySummary[];
  assets: PersonalV1VideoAssetSummary[];
  assetError: string;
  draftActivityByCategory: Record<string, number>;
  accessibleCategories: string[];
};

const EMPTY_DASHBOARD: DashboardData = {
  currentDrafts: [],
  history: [],
  assets: [],
  assetError: "",
  draftActivityByCategory: {},
  accessibleCategories: [],
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "저장 시각 정보 없음";
  return DATE_FORMATTER.format(new Date(timestamp));
}

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "크기 정보 없음";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSafeAssetUrl(value: string): string {
  const url = value.trim();
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function toDashboardLoadError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message || /status\s*5\d\d|json 형식|failed to fetch|econnrefused/i.test(message)) return fallback;
  return message;
}

export default function HomePage() {
  const router = useRouter();
  const hasLoadedRef = useRef(false);
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    setActionError("");
    try {
      const [workspaceResult, assetsResult] = await Promise.allSettled([
        fetchPublishWorkspaceSnapshot(),
        fetchAssetsLatest(),
      ]);
      if (workspaceResult.status === "rejected") throw workspaceResult.reason;
      const snapshot = workspaceResult.value;
      const categoryLabels = Object.fromEntries(snapshot.categoryOptions.map((item) => [item.key, item.label]));
      const accessibleCategories = snapshot.categoryOptions.map((item) => item.key);
      const accessibleCategorySet = new Set(accessibleCategories);
      const draftsByCategory = Object.fromEntries(
        snapshot.categoryOptions.map((item) => [item.key, readStoredStudioDraft(item.key)])
      );
      const currentDrafts = summarizePersonalV1CategoryDrafts(draftsByCategory, categoryLabels).filter((item) =>
        isPersonalV1MeaningfulDraft(item.draft)
      );
      const accessibleHistoryEntries = listStoredStudioHistoryEntries(40).filter((entry) =>
        accessibleCategorySet.has(String(entry.draft?.publishCategory || "").trim())
      );
      const history = summarizePersonalV1HistoryEntries(accessibleHistoryEntries, categoryLabels, { limit: 12 });
      const assetPayload = assetsResult.status === "fulfilled" ? normalizeAssetsLatestResponse(assetsResult.value) : null;
      const assets = summarizePersonalV1VideoAssets(assetPayload?.items || [], categoryLabels, { limit: 6 });
      const assetError =
        assetsResult.status === "rejected"
          ? assetsResult.reason instanceof Error
            ? toDashboardLoadError(assetsResult.reason, "로컬 완성 영상 목록에 연결하지 못했습니다.")
            : "완성 영상 목록을 불러오지 못했습니다."
          : assetPayload?.ok
            ? ""
            : "완성 영상 목록을 불러오지 못했습니다.";
      const draftActivityByCategory = Object.fromEntries(
        currentDrafts.map((item) => {
          const context = readPersonalV1ProjectContext(item.category);
          return [
            item.category,
            Math.max(context ? Date.parse(context.updatedAt) || 0 : 0, readStoredStudioDraftUpdatedAt(item.category)),
          ];
        })
      );
      setData({ currentDrafts, history, assets, assetError, draftActivityByCategory, accessibleCategories });
    } catch (refreshError) {
      setError(toDashboardLoadError(refreshError, "로컬 데이터에 연결하지 못했습니다. 데이터 서비스 실행 상태를 확인해 주세요."));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  const recentProjects = useMemo(
    () =>
      sortPersonalV1ProjectIndexByRepresentativeActivity(
        buildPersonalV1ProjectIndex({
          drafts: data.currentDrafts.map((item) => ({
            ...item,
            updatedAt: data.draftActivityByCategory[item.category] || item.updatedAt,
          })),
          history: data.history,
        })
      ).slice(0, 8),
    [data]
  );
  const latestProject = recentProjects[0] || null;

  const openProject = (project: PersonalV1ProjectIndexItem) => {
    setActionError("");
    if (!data.accessibleCategories.includes(project.category)) {
      setActionError("현재 접근할 수 없는 콘텐츠 프로필입니다. 대시보드를 다시 불러와 주세요.");
      return;
    }
    try {
      if (project.source === "history") {
        const currentDraft = readStoredStudioDraft(project.category);
        const archiveEntry = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
          currentDraft,
          nextDraft: project.draft,
          category: project.category,
          categoryLabel: project.profileLabel,
          reason: "category_draft_overwrite",
        });
        if (archiveEntry) {
          const currentHistory = readStoredStudioHistory(project.category);
          writeStoredStudioHistory(project.category, {
            activeHistoryId: currentHistory.activeHistoryId,
            historyEntries: [archiveEntry, ...currentHistory.historyEntries.filter((entry) => entry.id !== archiveEntry.id)],
          });
        }
      }
      writeStoredStudioDraft(project.category, project.draft);
      setStoredStudioHistoryActiveId(project.category, project.historyId);
      writeScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY, project.category);
      router.push("/shorts-json-studio?mode=onboarding");
    } catch (openError) {
      setActionError(openError instanceof Error ? openError.message : "프로젝트를 열지 못했습니다.");
    }
  };

  return (
    <AppLayout>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <h1 className={styles.pageTitle}>대시보드</h1>
          </div>
          <Link href="/projects/new" className={styles.primaryButton}>새 프로젝트 만들기</Link>
        </header>

        {actionError ? <p className={styles.inlineError} role="alert">{actionError}</p> : null}

        {loading ? (
          <section className={styles.card} aria-live="polite">
            <div className={styles.loadingState}><p>불러오는 중...</p></div>
          </section>
        ) : error ? (
          <section className={styles.card}>
            <div className={styles.errorState} role="alert">
              <strong>대시보드를 불러오지 못했습니다.</strong>
              <p>{error}</p>
              <button type="button" className={styles.secondaryButton} onClick={() => void refresh()}>다시 불러오기</button>
            </div>
          </section>
        ) : recentProjects.length === 0 && data.assets.length === 0 && !data.assetError ? (
          <section className={styles.card}>
            <div className={styles.emptyState}>
              <strong>프로젝트가 없습니다.</strong>
              <Link href="/projects/new" className={styles.secondaryButton}>첫 프로젝트 시작</Link>
            </div>
          </section>
        ) : (
          <div className={styles.dashboardGrid}>
            <div className={styles.dashboardColumn}>
              {latestProject ? (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>마지막 작업</h2>
                    <span className={styles.statusBadge}>{latestProject.stageLabel}</span>
                  </div>
                  <div className={`${styles.cardBody} ${styles.resumeBody}`}>
                    <div>
                      <h3 className={styles.projectName}>{latestProject.title}</h3>
                      <div className={styles.metaList}>
                        <span>프로필 · {latestProject.profileLabel}</span>
                        <span>{formatDate(latestProject.versions[0]?.activityAt || latestProject.activityAt)}</span>
                        <span>{latestProject.source === "draft" ? "현재 초안" : "저장 버전"}</span>
                      </div>
                    </div>
                    <button type="button" className={styles.secondaryButton} onClick={() => openProject(latestProject)}>이어서 작업</button>
                  </div>
                </section>
              ) : null}

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>최근 프로젝트</h2>
                  <Link href="/projects" className={styles.ghostButton}>전체 보기</Link>
                </div>
                {recentProjects.length > 0 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <colgroup>
                        <col style={{ width: "42%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "20%" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">프로젝트</th>
                          <th scope="col">상태</th>
                          <th scope="col">저장</th>
                          <th scope="col">작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentProjects.slice(0, 6).map((project) => (
                          <tr key={project.id}>
                            <td className={styles.tableProjectCell}>
                              <span className={styles.tablePrimary}>{project.title}</span>
                              <span className={styles.tableSecondary}>{project.profileLabel}</span>
                            </td>
                            <td>{project.stageLabel}</td>
                            <td>{project.versions[0]?.activityAt ? formatDate(project.versions[0].activityAt) : "시각 없음"}</td>
                            <td>
                              <button type="button" className={`${styles.secondaryButton} ${styles.rowAction}`} onClick={() => openProject(project)}>열기</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.emptyState}><p>이어서 열 수 있는 프로젝트가 없습니다.</p></div>
                )}
              </section>
            </div>

            <aside className={styles.dashboardColumn}>
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>최근 완성 영상</h2>
                  <Link href="/assets" className={styles.ghostButton}>전체 보기</Link>
                </div>
                {data.assetError ? (
                  <div className={styles.errorState} role="alert">
                    <strong>완성 영상 목록을 불러오지 못했습니다.</strong>
                    <p>{data.assetError}</p>
                  </div>
                ) : data.assets.length > 0 ? (
                  <div className={styles.assetList}>
                    {data.assets.slice(0, 4).map((asset) => {
                      const safeUrl = getSafeAssetUrl(asset.url);
                      return (
                        <div key={asset.id} className={styles.assetRow}>
                          <div className={styles.tableProjectCell}>
                            <span className={styles.tablePrimary}>{asset.title}</span>
                            <span className={styles.tableSecondary}>{asset.label} · {formatFileSize(asset.sizeBytes)} · {formatDate(asset.createdAt)}</span>
                          </div>
                          {safeUrl ? <a className={styles.assetLink} href={safeUrl} target="_blank" rel="noreferrer">열기</a> : <span className={styles.tableSecondary}>경로 없음</span>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <strong>완성 영상이 없습니다.</strong>
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PersonalV1LibraryNav } from "@/components/personal-v1-library-nav";
import {
  listStoredStudioDraftCategories,
  listStoredStudioHistoryEntries,
  readStoredStudioDraft,
  readStoredStudioDraftUpdatedAt,
  readStoredStudioHistory,
  setStoredStudioHistoryActiveId,
  STUDIO_LAST_PUBLISH_CATEGORY_KEY,
  writeStoredStudioDraft,
  writeStoredStudioHistory,
} from "@/app/shorts-json-studio/storage";
import {
  createPersonalV1ProjectContext,
  readPersonalV1ProjectContext,
  writePersonalV1ProjectContext,
} from "@/app/projects/new/project-context-storage";
import { fetchPublishWorkspaceSnapshot, type PublishWorkspaceSnapshot } from "@/lib/api/publish-workspace-client";
import {
  buildPersonalV1HistoryArchiveEntryBeforeOverwrite,
  isPersonalV1MeaningfulDraft,
  summarizePersonalV1CategoryDrafts,
  summarizePersonalV1HistoryEntries,
} from "@/lib/personal-v1/studio-dashboard-helpers";
import {
  buildPersonalV1ProjectCloneDraft,
  buildPersonalV1ProjectIndex,
  filterPersonalV1ProjectIndex,
  getPersonalV1ProjectIndexStatus,
  getPersonalV1ProjectIndexStatusLabel,
  resolvePersonalV1ProjectIndexVersion,
  type PersonalV1ProjectIndexItem,
  type PersonalV1ProjectIndexStatusFilter,
} from "@/lib/personal-v1/studio-project-index";
import { createStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { writeScopedStorage } from "@/lib/ui/scoped-storage";
import styles from "@/styles/personal-v1.module.css";

type ProjectsPageData = {
  projects: PersonalV1ProjectIndexItem[];
  categoryOptions: Array<{ key: string; label: string }>;
  categoryMetadataMap: PublishWorkspaceSnapshot["categoryMetadataMap"];
  accessibleCategories: string[];
};

const EMPTY_DATA: ProjectsPageData = {
  projects: [],
  categoryOptions: [],
  categoryMetadataMap: {},
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

function toProjectLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message || /status\s*5\d\d|json 형식|failed to fetch|econnrefused/i.test(message)) {
    return "로컬 프로젝트 데이터에 연결하지 못했습니다. 데이터 서비스 실행 상태를 확인해 주세요.";
  }
  return message;
}

export default function ProjectsPage() {
  const router = useRouter();
  const hasLoadedRef = useRef(false);
  const [data, setData] = useState<ProjectsPageData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyProjectId, setBusyProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<PersonalV1ProjectIndexStatusFilter>("all");
  const [selectedVersionByProject, setSelectedVersionByProject] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const snapshot = await fetchPublishWorkspaceSnapshot();
      const categoryLabels = Object.fromEntries(snapshot.categoryOptions.map((item) => [item.key, item.label]));
      const accessibleCategories = snapshot.categoryOptions.map((item) => item.key);
      const historyEntries = listStoredStudioHistoryEntries();
      const storedCategories = new Set([
        ...accessibleCategories,
        ...listStoredStudioDraftCategories(),
        ...historyEntries.map((entry) => String(entry.draft?.publishCategory || "").trim()).filter(Boolean),
      ]);
      const draftsByCategory = Object.fromEntries(
        Array.from(storedCategories).map((category) => [category, readStoredStudioDraft(category)])
      );
      const drafts = summarizePersonalV1CategoryDrafts(draftsByCategory, categoryLabels)
        .filter((item) => isPersonalV1MeaningfulDraft(item.draft))
        .map((item) => {
          const context = readPersonalV1ProjectContext(item.category);
          return {
            ...item,
            updatedAt: Math.max(
              context ? Date.parse(context.updatedAt) || 0 : 0,
              readStoredStudioDraftUpdatedAt(item.category)
            ),
          };
        });
      const history = summarizePersonalV1HistoryEntries(historyEntries, categoryLabels, {
        limit: historyEntries.length,
      });
      const projects = buildPersonalV1ProjectIndex({ drafts, history });
      const categoryOptionMap = new Map(snapshot.categoryOptions.map((item) => [item.key, { key: item.key, label: item.label }]));
      for (const project of projects) {
        if (!categoryOptionMap.has(project.category)) {
          categoryOptionMap.set(project.category, { key: project.category, label: `${project.profileLabel} · 복구 필요` });
        }
      }
      setData({
        projects,
        categoryOptions: Array.from(categoryOptionMap.values()),
        categoryMetadataMap: snapshot.categoryMetadataMap,
        accessibleCategories,
      });
    } catch (refreshError) {
      setError(toProjectLoadError(refreshError));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  const filteredProjects = useMemo(
    () =>
      filterPersonalV1ProjectIndex(data.projects, {
        search,
        profile: profileFilter,
        status: statusFilter,
      }),
    [data.projects, profileFilter, search, statusFilter]
  );
  const statusCounts = useMemo(
    () =>
      data.projects.reduce(
        (counts, project) => {
          counts[getPersonalV1ProjectIndexStatus(project)] += 1;
          return counts;
        },
        { in_progress: 0, attention: 0, rendered: 0 }
      ),
    [data.projects]
  );

  const activateProjectDraft = useCallback(
    (input: {
      category: string;
      profileLabel: string;
      draft: PersonalV1ProjectIndexItem["draft"];
      historyId: string | null;
      context?: ReturnType<typeof createPersonalV1ProjectContext>;
    }) => {
      if (!data.accessibleCategories.includes(input.category)) {
        throw new Error("현재 접근할 수 없는 콘텐츠 프로필입니다. 프로젝트 목록을 다시 불러와 주세요.");
      }
      const currentDraft = readStoredStudioDraft(input.category);
      const archiveEntry = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
        currentDraft,
        nextDraft: input.draft,
        category: input.category,
        categoryLabel: input.profileLabel,
        reason: "category_draft_overwrite",
      });
      if (archiveEntry) {
        const currentHistory = readStoredStudioHistory(input.category);
        writeStoredStudioHistory(input.category, {
          activeHistoryId: currentHistory.activeHistoryId,
          historyEntries: [
            archiveEntry,
            ...currentHistory.historyEntries.filter((entry) => entry.id !== archiveEntry.id),
          ],
        });
      }
      if (input.context) writePersonalV1ProjectContext(input.context);
      writeStoredStudioDraft(input.category, input.draft);
      setStoredStudioHistoryActiveId(input.category, input.historyId);
      writeScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY, input.category);
      router.push("/shorts-json-studio?mode=onboarding");
    },
    [data.accessibleCategories, router]
  );

  const openProject = (project: PersonalV1ProjectIndexItem) => {
    setActionError("");
    setBusyProjectId(project.id);
    try {
      const selectedVersion = resolvePersonalV1ProjectIndexVersion(
        project,
        selectedVersionByProject[project.id]
      );
      if (!selectedVersion) throw new Error("열 수 있는 프로젝트 저장본이 없습니다.");
      activateProjectDraft({
        category: project.category,
        profileLabel: project.profileLabel,
        draft: selectedVersion.draft,
        historyId: selectedVersion.historyId,
      });
    } catch (openError) {
      setBusyProjectId("");
      setActionError(openError instanceof Error ? openError.message : "프로젝트를 열지 못했습니다.");
    }
  };

  const duplicateProject = (project: PersonalV1ProjectIndexItem) => {
    setActionError("");
    setBusyProjectId(project.id);
    try {
      const selectedVersion = resolvePersonalV1ProjectIndexVersion(
        project,
        selectedVersionByProject[project.id]
      );
      if (!selectedVersion) throw new Error("복제할 프로젝트 저장본이 없습니다.");
      const sourceSnapshot =
        selectedVersion.draft.projectProfileSnapshot?.contentProfile.category === project.category
          ? selectedVersion.draft.projectProfileSnapshot
          : null;
      const topicText = String(selectedVersion.draft.topicText || "").trim();
      const scriptText = String(selectedVersion.draft.scriptText || "").trim();
      const context = createPersonalV1ProjectContext({
        category: project.category,
        profileLabel: project.profileLabel,
        metadataSnapshot:
          sourceSnapshot?.contentProfile.metadataSnapshot || data.categoryMetadataMap[project.category] || null,
        inputMode: topicText ? "topic" : "script",
        originalText: topicText || scriptText,
      });
      const projectProfileSnapshot = createStudioProjectProfileSnapshot(context);
      const duplicateDraft = buildPersonalV1ProjectCloneDraft({
        source: selectedVersion.draft,
        projectProfileSnapshot,
      });
      activateProjectDraft({
        category: project.category,
        profileLabel: project.profileLabel,
        draft: duplicateDraft,
        historyId: null,
        context,
      });
    } catch (duplicateError) {
      setBusyProjectId("");
      setActionError(duplicateError instanceof Error ? duplicateError.message : "프로젝트를 복제하지 못했습니다.");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setProfileFilter("all");
    setStatusFilter("all");
  };

  return (
    <AppLayout>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <p className={styles.eyebrow}>라이브러리</p>
            <h1 className={styles.pageTitle}>프로젝트</h1>
            <p className={styles.pageDescription}>
              현재 작업본과 저장 버전을 프로젝트별로 묶어 찾고, 원하는 지점부터 이어서 편집합니다.
            </p>
          </div>
          <div className={styles.pageHeaderActions}>
            <Link href="/projects/new" className={styles.primaryButton}>새 프로젝트 만들기</Link>
          </div>
        </header>

        <PersonalV1LibraryNav activeSection="projects" />

        {actionError ? <p className={styles.inlineError} role="alert">{actionError}</p> : null}

        {loading ? (
          <section className={styles.card} aria-live="polite">
            <div className={styles.loadingState}><p>프로젝트와 저장 버전을 불러오는 중입니다.</p></div>
          </section>
        ) : error ? (
          <section className={styles.card}>
            <div className={styles.errorState} role="alert">
              <strong>프로젝트 목록을 불러오지 못했습니다.</strong>
              <p>{error}</p>
              <button type="button" className={styles.secondaryButton} onClick={() => void refresh()}>다시 불러오기</button>
            </div>
          </section>
        ) : data.projects.length === 0 ? (
          <section className={styles.card}>
            <div className={styles.emptyState}>
              <strong>아직 저장된 프로젝트가 없습니다.</strong>
              <p>콘텐츠 프로필과 시작 방식을 선택해 첫 프로젝트를 만들어 보세요.</p>
              <Link href="/projects/new" className={styles.secondaryButton}>첫 프로젝트 시작</Link>
            </div>
          </section>
        ) : (
          <>
            <section className={styles.projectMetrics} aria-label="프로젝트 상태 요약">
              <div className={styles.projectMetric}>
                <span className={styles.projectMetricValue}>{data.projects.length}</span>
                <span className={styles.projectMetricLabel}>전체 프로젝트</span>
              </div>
              <div className={styles.projectMetric}>
                <span className={styles.projectMetricValue}>{statusCounts.in_progress}</span>
                <span className={styles.projectMetricLabel}>진행 중</span>
              </div>
              <div className={styles.projectMetric}>
                <span className={styles.projectMetricValue}>{statusCounts.rendered}</span>
                <span className={styles.projectMetricLabel}>완성 저장본 있음</span>
              </div>
              <div className={styles.projectMetric}>
                <span className={styles.projectMetricValue}>{statusCounts.attention}</span>
                <span className={styles.projectMetricLabel}>확인 필요한 저장본</span>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>전체 프로젝트</h2>
                  <p className={styles.cardDescription}>같은 프로젝트의 자동·수동 저장 이력은 하나로 묶어 표시합니다.</p>
                </div>
              </div>
              <div className={styles.projectToolbar}>
                <label className={styles.projectControl}>
                  <span className={styles.projectControlLabel}>검색</span>
                  <input
                    className={styles.projectSearchInput}
                    type="search"
                    value={search}
                    placeholder="프로젝트 이름 또는 프로필 검색"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label className={styles.projectControl}>
                  <span className={styles.projectControlLabel}>콘텐츠 프로필</span>
                  <select className={styles.projectSelect} value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}>
                    <option value="all">전체 프로필</option>
                    {data.categoryOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
                <label className={styles.projectControl}>
                  <span className={styles.projectControlLabel}>상태</span>
                  <select
                    className={styles.projectSelect}
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as PersonalV1ProjectIndexStatusFilter)}
                  >
                    <option value="all">전체 상태</option>
                    <option value="in_progress">진행 중</option>
                    <option value="rendered">완성 저장본 있음</option>
                    <option value="attention">확인 필요한 저장본</option>
                  </select>
                </label>
              </div>
              <p className={styles.projectResultSummary} aria-live="polite">
                전체 {data.projects.length}개 중 {filteredProjects.length}개 표시
              </p>

              {filteredProjects.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <colgroup>
                      <col style={{ width: "27%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "22%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">프로젝트</th>
                        <th scope="col">상태</th>
                        <th scope="col">최근 수정</th>
                        <th scope="col">저장본</th>
                        <th scope="col">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project) => {
                        const busy = busyProjectId === project.id;
                        const accessible = data.accessibleCategories.includes(project.category);
                        return (
                          <tr key={project.id}>
                            <td className={styles.tableProjectCell}>
                              <span className={styles.tablePrimary}>{project.title}</span>
                              <span className={styles.tableSecondary}>
                                {project.profileLabel} · {accessible ? (project.source === "draft" ? "현재 작업본" : "보관 프로젝트") : "프로필 복구 필요"}
                              </span>
                            </td>
                            <td>
                              <span className={styles.statusBadge}>{getPersonalV1ProjectIndexStatusLabel(project)}</span>
                              <span className={styles.tableSecondary}>현재 작업본 · {project.stageLabel} · 장면 {project.slideCount}개</span>
                            </td>
                            <td>{formatDate(project.activityAt)}</td>
                            <td>
                              <select
                                className={styles.projectVersionSelect}
                                aria-label={`${project.title} 저장본 선택`}
                                value={selectedVersionByProject[project.id] || project.versions[0]?.id || ""}
                                onChange={(event) =>
                                  setSelectedVersionByProject((current) => ({
                                    ...current,
                                    [project.id]: event.target.value,
                                  }))
                                }
                              >
                                {project.versions.map((version) => (
                                  <option key={version.id} value={version.id}>
                                    {version.source === "draft" ? "현재 작업본" : version.label} · {formatDate(version.activityAt)}
                                  </option>
                                ))}
                              </select>
                              <span className={styles.tableSecondary}>작업본·버전 {project.storedVersionCount}개</span>
                            </td>
                            <td>
                              <div className={styles.projectTableActions}>
                                <button
                                  type="button"
                                  className={`${styles.secondaryButton} ${styles.rowAction}`}
                                  disabled={Boolean(busyProjectId) || !accessible}
                                  onClick={() => openProject(project)}
                                >
                                  {busy ? "여는 중..." : "이어서 작업"}
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.ghostButton} ${styles.rowAction}`}
                                  disabled={Boolean(busyProjectId) || !accessible}
                                  onClick={() => duplicateProject(project)}
                                >
                                  복제해서 열기
                                </button>
                                {!accessible ? <Link href="/trash" className={styles.assetLink}>프로필 복구</Link> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <strong>조건에 맞는 프로젝트가 없습니다.</strong>
                  <p>검색어나 필터를 바꾸면 전체 프로젝트를 다시 볼 수 있습니다.</p>
                  <button type="button" className={styles.secondaryButton} onClick={clearFilters}>필터 초기화</button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

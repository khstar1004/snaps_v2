import type { StudioHistoryEntry, StudioWorkDraft } from "@/app/shorts-json-studio/types";
import {
  STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL,
  resolveInterruptedStudioOperation,
} from "@/app/shorts-json-studio/studio-operation-recovery";
import { cloneStudioWorkDraft } from "@/app/shorts-json-studio/types";
import type { PublishCategory } from "@/lib/publish/types";
import { cloneStudioProjectProfileSnapshot, type StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { PersonalV1CategoryDraftSummary, PersonalV1HistorySummary } from "./studio-dashboard-helpers";

export type PersonalV1ProjectIndexSource = "draft" | "history";
export type PersonalV1ProjectIndexStatusFilter = "all" | "in_progress" | "attention" | "rendered";

export type PersonalV1ProjectIndexVersion = {
  id: string;
  source: PersonalV1ProjectIndexSource;
  historyId: string | null;
  label: string;
  activityAt: number;
  draft: StudioWorkDraft;
  stageLabel: string;
  slideCount: number;
  hasVideo: boolean;
};

export type PersonalV1ProjectIndexItem = {
  id: string;
  projectId: string;
  category: PublishCategory;
  profileLabel: string;
  title: string;
  activityAt: number;
  source: PersonalV1ProjectIndexSource;
  historyId: string | null;
  draft: StudioWorkDraft;
  storedVersionCount: number;
  stageLabel: string;
  slideCount: number;
  hasVideo: boolean;
  versions: PersonalV1ProjectIndexVersion[];
};

export type PersonalV1ProjectIndexFilters = {
  search?: string;
  profile?: PublishCategory | "all" | string;
  status?: PersonalV1ProjectIndexStatusFilter;
};

export type PersonalV1ProjectIndexCloneInput = {
  source: PersonalV1ProjectIndexItem | StudioWorkDraft;
  projectProfileSnapshot: StudioProjectProfileSnapshot;
  name?: string;
};

type ProjectIndexDraftInput = PersonalV1CategoryDraftSummary | { category: PublishCategory; label?: string; draft: StudioWorkDraft; updatedAt?: number };
type ProjectIndexHistoryInput =
  | PersonalV1HistorySummary
  | (StudioHistoryEntry & { category?: PublishCategory; label?: string; createdAtMs?: number; historyLabel?: string });

type MutableGroup = {
  key: string;
  projectId: string;
  category: PublishCategory;
  profileLabel: string;
  activityAt: number;
  versions: Array<{
    id: string;
    source: PersonalV1ProjectIndexSource;
    historyId: string | null;
    label: string;
    draft: StudioWorkDraft;
    activityAt: number;
  }>;
  representative: {
    source: PersonalV1ProjectIndexSource;
    historyId: string | null;
    draft: StudioWorkDraft;
    title: string;
    activityAt: number;
  } | null;
};

const MAX_CLONE_NAME_LENGTH = 120;
const RENDER_FAILURE_PATTERN = /(fail|failed|failure|error|오류|실패)/i;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toTimestamp(value: unknown): number {
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  const text = trimString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return compact.slice(0, maxLength).trimEnd();
}

function resolveDraftTitle(draft: StudioWorkDraft): string {
  const workName = trimString(draft.workName);
  if (workName) return workName;

  const jsonText = trimString(draft.jsonText);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const title = trimString(parsed.title);
      if (title) return title;
    } catch {
      // A broken JSON draft can still be shown in the project index.
    }
  }

  const slideTitle = Array.isArray(draft.slides)
    ? trimString(draft.slides.find((slide) => trimString(slide?.title))?.title)
    : "";
  return slideTitle || compactText(trimString(draft.topicText) || trimString(draft.scriptText), 48) || "제목 없는 프로젝트";
}

function getSnapshot(draft: StudioWorkDraft, expectedCategory?: PublishCategory): StudioProjectProfileSnapshot | null {
  const snapshot = draft.projectProfileSnapshot;
  if (!snapshot || snapshot.version !== 1 || !trimString(snapshot.projectId) || !trimString(snapshot.contentProfile?.category)) {
    return null;
  }
  if (expectedCategory && snapshot.contentProfile.category !== expectedCategory) return null;
  return snapshot;
}

function resolveCategory(draft: StudioWorkDraft, fallback?: PublishCategory): PublishCategory {
  if (trimString(fallback)) return trimString(fallback);
  const snapshot = getSnapshot(draft, fallback);
  return trimString(snapshot?.contentProfile.category) || trimString(draft.publishCategory) || trimString(fallback) || "default";
}

function resolveProfileLabel(draft: StudioWorkDraft, category: PublishCategory, fallback?: string): string {
  const snapshot = getSnapshot(draft, category);
  return trimString(snapshot?.contentProfile.label) || trimString(fallback) || category;
}

function hasVideo(draft: StudioWorkDraft): boolean {
  return Boolean(trimString(draft.videoUrl) || trimString(draft.uploadedVideoUrl));
}

function getSlideCount(draft: StudioWorkDraft): number {
  return Array.isArray(draft.slides) ? draft.slides.length : 0;
}

function getProjectKey(input: {
  draft: StudioWorkDraft;
  category: PublishCategory;
  source: PersonalV1ProjectIndexSource;
  historyId?: string | null;
  sequence: number;
}): { key: string; projectId: string } {
  const snapshot = getSnapshot(input.draft, input.category);
  if (snapshot) {
    const category = trimString(snapshot.contentProfile.category) || input.category;
    return {
      key: `project:${category}:${snapshot.projectId}`,
      projectId: snapshot.projectId,
    };
  }
  if (input.source === "history") {
    const historyId = trimString(input.historyId);
    return {
      key: `legacy-history:${input.category}:${historyId || `missing-${input.sequence}`}`,
      projectId: historyId ? `legacy-history-${historyId}` : `legacy-history-${input.category}`,
    };
  }
  return {
    key: `legacy-draft:${input.category}`,
    projectId: `legacy-draft-${input.category}`,
  };
}

function shouldReplaceRepresentative(
  current: MutableGroup["representative"],
  next: NonNullable<MutableGroup["representative"]>
): boolean {
  if (!current) return true;
  if (current.source !== "draft" && next.source === "draft") return true;
  if (current.source === next.source && next.activityAt > current.activityAt) return true;
  return false;
}

function addToGroup(groups: Map<string, MutableGroup>, input: {
  source: PersonalV1ProjectIndexSource;
  historyId?: string | null;
  draft: StudioWorkDraft;
  title?: string;
  activityAt?: number;
  category?: PublishCategory;
  profileLabel?: string;
  versionLabel?: string;
  sequence: number;
}): void {
  const draft = cloneStudioWorkDraft(input.draft || {});
  const category = resolveCategory(draft, input.category);
  draft.publishCategory = category;
  const profileLabel = resolveProfileLabel(draft, category, input.profileLabel);
  const key = getProjectKey({
    draft,
    category,
    source: input.source,
    historyId: input.historyId,
    sequence: input.sequence,
  });
  const group =
    groups.get(key.key) ||
    ({
      key: key.key,
      projectId: key.projectId,
      category,
      profileLabel,
      activityAt: 0,
      versions: [],
      representative: null,
    } satisfies MutableGroup);

  const representative = {
    source: input.source,
    historyId: input.source === "history" ? trimString(input.historyId) || null : null,
    draft,
    title: trimString(input.title) || resolveDraftTitle(draft),
    activityAt: Math.max(0, Math.floor(finiteNumber(input.activityAt) ?? 0)),
  };
  group.activityAt = Math.max(group.activityAt, representative.activityAt);
  group.versions.push({
    id: input.source === "draft" ? `draft:${key.key}` : `history:${trimString(input.historyId) || input.sequence}`,
    source: input.source,
    historyId: representative.historyId,
    label: trimString(input.versionLabel) || (input.source === "draft" ? "현재 작업본" : "저장 버전"),
    draft: cloneStudioWorkDraft(draft),
    activityAt: representative.activityAt,
  });
  if (shouldReplaceRepresentative(group.representative, representative)) {
    group.category = category;
    group.profileLabel = profileLabel;
    group.representative = representative;
  }
  groups.set(key.key, group);
}

export function calculatePersonalV1ProjectStageLabel(draft: StudioWorkDraft | null | undefined): string {
  if (!draft) return "입력 준비";
  const renderStatus = trimString(draft.renderStatus);
  if (resolveInterruptedStudioOperation(renderStatus)) return STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL;
  if (renderStatus && RENDER_FAILURE_PATTERN.test(renderStatus)) return "렌더 확인 필요";
  if (hasVideo(draft)) return "영상 생성 완료";
  if (getSlideCount(draft) > 0) return "컷 편집 중";
  if (trimString(draft.jsonText)) return "JSON 정리 중";
  if (trimString(draft.scriptText)) return "대본 편집 중";
  return "입력 준비";
}

export function buildPersonalV1ProjectIndex(input: {
  drafts?: ProjectIndexDraftInput[];
  history?: ProjectIndexHistoryInput[];
}): PersonalV1ProjectIndexItem[] {
  const groups = new Map<string, MutableGroup>();
  for (const [sequence, item] of (input.drafts || []).entries()) {
    addToGroup(groups, {
      source: "draft",
      draft: item.draft,
      title: "title" in item ? item.title : undefined,
      activityAt: "updatedAt" in item ? item.updatedAt : undefined,
      category: item.category,
      profileLabel: "label" in item ? item.label : undefined,
      versionLabel: "현재 작업본",
      sequence,
    });
  }
  const historySequenceOffset = (input.drafts || []).length;
  for (const [index, item] of (input.history || []).entries()) {
    addToGroup(groups, {
      source: "history",
      historyId: item.id,
      draft: item.draft,
      title: "title" in item ? item.title : "historyLabel" in item ? item.historyLabel : item.label,
      activityAt: "createdAtMs" in item ? item.createdAtMs : toTimestamp(item.createdAt),
      category: "category" in item ? item.category : undefined,
      profileLabel: "label" in item ? item.label : undefined,
      versionLabel: "historyLabel" in item ? item.historyLabel : item.label,
      sequence: historySequenceOffset + index,
    });
  }

  return Array.from(groups.values())
    .map((group): PersonalV1ProjectIndexItem | null => {
      if (!group.representative) return null;
      const draft = cloneStudioWorkDraft(group.representative.draft);
      const stageLabel = calculatePersonalV1ProjectStageLabel(draft);
      const versions = group.versions
        .map((version): PersonalV1ProjectIndexVersion => {
          const versionDraft = cloneStudioWorkDraft(version.draft);
          return {
            ...version,
            draft: versionDraft,
            stageLabel: calculatePersonalV1ProjectStageLabel(versionDraft),
            slideCount: getSlideCount(versionDraft),
            hasVideo: hasVideo(versionDraft),
          };
        })
        .sort((left, right) => {
          if (left.source !== right.source) return left.source === "draft" ? -1 : 1;
          return right.activityAt - left.activityAt || left.id.localeCompare(right.id);
        });
      return {
        id: group.key,
        projectId: group.projectId,
        category: group.category,
        profileLabel: group.profileLabel,
        title: group.representative.title,
        activityAt: group.activityAt,
        source: group.representative.source,
        historyId: group.representative.historyId,
        draft,
        storedVersionCount: versions.length,
        stageLabel,
        slideCount: getSlideCount(draft),
        hasVideo: hasVideo(draft),
        versions,
      };
    })
    .filter((item): item is PersonalV1ProjectIndexItem => Boolean(item))
    .sort((left, right) => right.activityAt - left.activityAt || left.title.localeCompare(right.title, "ko-KR"));
}

export function getPersonalV1ProjectIndexStatus(item: PersonalV1ProjectIndexItem): Exclude<PersonalV1ProjectIndexStatusFilter, "all"> {
  if (
    item.versions.some(
      (version) => version.stageLabel === "렌더 확인 필요" || version.stageLabel === STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL
    )
  ) {
    return "attention";
  }
  if (item.versions.some((version) => version.hasVideo)) return "rendered";
  return "in_progress";
}

export function getPersonalV1ProjectIndexStatusLabel(item: PersonalV1ProjectIndexItem): string {
  const status = getPersonalV1ProjectIndexStatus(item);
  if (status === "attention" && item.versions.some((version) => version.stageLabel === STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL)) {
    return STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL;
  }
  if (status === "attention") return "확인 필요한 저장본";
  if (status === "rendered") return "완성 저장본 있음";
  return item.stageLabel;
}

export function sortPersonalV1ProjectIndexByRepresentativeActivity(
  items: PersonalV1ProjectIndexItem[]
): PersonalV1ProjectIndexItem[] {
  return [...items].sort((left, right) => {
    const leftActivityAt = left.versions[0]?.activityAt ?? left.activityAt;
    const rightActivityAt = right.versions[0]?.activityAt ?? right.activityAt;
    return rightActivityAt - leftActivityAt || left.title.localeCompare(right.title, "ko-KR");
  });
}

export function filterPersonalV1ProjectIndex(
  items: PersonalV1ProjectIndexItem[],
  filters: PersonalV1ProjectIndexFilters = {}
): PersonalV1ProjectIndexItem[] {
  const search = trimString(filters.search).toLowerCase();
  const profile = trimString(filters.profile);
  const status = filters.status || "all";
  return items.filter((item) => {
    if (search) {
      const haystack = [
        item.title,
        item.profileLabel,
        item.category,
        item.projectId,
        item.stageLabel,
        ...item.versions.flatMap((version) => [version.label, version.stageLabel, resolveDraftTitle(version.draft)]),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (profile && profile !== "all" && item.category !== profile && item.profileLabel !== profile) return false;
    if (status !== "all" && getPersonalV1ProjectIndexStatus(item) !== status) return false;
    return true;
  });
}

export function resolvePersonalV1ProjectIndexVersion(
  item: PersonalV1ProjectIndexItem,
  versionId: string | null | undefined
): PersonalV1ProjectIndexVersion | null {
  const normalizedId = trimString(versionId);
  return item.versions.find((version) => version.id === normalizedId) || item.versions[0] || null;
}

export function buildPersonalV1ProjectCloneName(value: string): string {
  const suffix = " 복사본";
  const base = compactText(value, MAX_CLONE_NAME_LENGTH - suffix.length) || "제목 없는 프로젝트";
  return `${base}${suffix}`;
}

export function buildPersonalV1ProjectCloneDraft(input: PersonalV1ProjectIndexCloneInput): StudioWorkDraft {
  const sourceDraft = "draft" in input.source ? input.source.draft : input.source;
  const draft = cloneStudioWorkDraft(sourceDraft || {});
  const explicitName = trimString(input.name);
  draft.workName = explicitName
    ? compactText(explicitName, MAX_CLONE_NAME_LENGTH)
    : buildPersonalV1ProjectCloneName(resolveDraftTitle(draft));
  draft.publishCategory = input.projectProfileSnapshot.contentProfile.category;
  draft.projectProfileSnapshot = cloneStudioProjectProfileSnapshot(input.projectProfileSnapshot);

  delete draft.videoUrl;
  delete draft.uploadedVideoUrl;
  delete draft.renderStatus;
  delete draft.lastDraftRenderFingerprint;
  delete draft.lastFinalRenderFingerprint;
  delete draft.lastRenderPreflightFingerprint;
  delete draft.voiceApprovalFingerprint;
  delete draft.imageApprovalFingerprint;
  delete draft.quickScheduledAt;

  return draft;
}

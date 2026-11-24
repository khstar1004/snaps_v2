"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StudioProjectContextSummary } from "../studio-project-context-summary";
import {
  STUDIO_PROJECT_PROFILE_SETTING_GROUP_META,
  type StudioProjectProfileSettingGroupId,
} from "../studio-project-profile-settings";

type StudioProjectSettingsDrawerProps = {
  open: boolean;
  projectName: string;
  readOnly?: boolean;
  summary: StudioProjectContextSummary;
  profileToProjectGroupIds?: readonly StudioProjectProfileSettingGroupId[];
  projectToProfileGroupIds?: readonly StudioProjectProfileSettingGroupId[];
  hasProfileSnapshot?: boolean;
  syncBusy?: boolean;
  syncMessage?: string;
  projectTools?: ReactNode;
  onProjectNameChangeAction: (value: string) => void;
  onRefreshProfileAction?: () => void | Promise<void>;
  onApplyProfileGroupsAction?: (groupIds: readonly StudioProjectProfileSettingGroupId[]) => void | Promise<void>;
  onSaveProjectGroupsAction?: (groupIds: readonly StudioProjectProfileSettingGroupId[]) => void | Promise<void>;
  onCloseAction: () => void;
};

type SyncDirection = "profile-to-project" | "project-to-profile";
type LocalSyncState = {
  role: "status" | "alert";
  message: string;
};

const EMPTY_GROUP_IDS: readonly StudioProjectProfileSettingGroupId[] = [];

function resolveGroupLabel(groupId: StudioProjectProfileSettingGroupId): string {
  return STUDIO_PROJECT_PROFILE_SETTING_GROUP_META[groupId]?.label || groupId;
}

function resolveGroupImpact(groupId: StudioProjectProfileSettingGroupId): string {
  return STUDIO_PROJECT_PROFILE_SETTING_GROUP_META[groupId]?.impact || "선택한 기본값에 영향을 줍니다.";
}

function resolveSelectedGroupIds(
  groupIds: readonly StudioProjectProfileSettingGroupId[],
  selectedGroupIds: readonly StudioProjectProfileSettingGroupId[]
): StudioProjectProfileSettingGroupId[] {
  const availableGroupIds = new Set(groupIds);
  return selectedGroupIds.filter((groupId) => availableGroupIds.has(groupId));
}

function getSyncMessageRole(message?: string): "status" | "alert" {
  return /error|failed|오류|실패|불가/i.test(message || "") ? "alert" : "status";
}

export function StudioProjectSettingsDrawer({
  open,
  projectName,
  readOnly,
  summary,
  profileToProjectGroupIds = EMPTY_GROUP_IDS,
  projectToProfileGroupIds = EMPTY_GROUP_IDS,
  hasProfileSnapshot = false,
  syncBusy = false,
  syncMessage,
  projectTools,
  onProjectNameChangeAction,
  onRefreshProfileAction,
  onApplyProfileGroupsAction,
  onSaveProjectGroupsAction,
  onCloseAction,
}: StudioProjectSettingsDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedProfileToProjectGroupIds, setSelectedProfileToProjectGroupIds] = useState<
    StudioProjectProfileSettingGroupId[]
  >([]);
  const [selectedProjectToProfileGroupIds, setSelectedProjectToProfileGroupIds] = useState<
    StudioProjectProfileSettingGroupId[]
  >([]);
  const [localSyncState, setLocalSyncState] = useState<LocalSyncState | null>(null);

  const changedGroupCount = useMemo(() => {
    return new Set([...profileToProjectGroupIds, ...projectToProfileGroupIds]).size;
  }, [profileToProjectGroupIds, projectToProfileGroupIds]);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedProfileToProjectGroupIds([...profileToProjectGroupIds]);
  }, [open, profileToProjectGroupIds]);

  useEffect(() => {
    if (!open) return;
    setSelectedProjectToProfileGroupIds([...projectToProfileGroupIds]);
  }, [open, projectToProfileGroupIds]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseAction();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusableElements.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0]!;
      const lastElement = focusableElements[focusableElements.length - 1]!;
      if (!drawerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCloseAction, open]);

  if (!open) return null;

  const externalSyncState = syncMessage
    ? {
        role: getSyncMessageRole(syncMessage),
        message: syncMessage,
      }
    : null;
  const visibleSyncState = externalSyncState || localSyncState;
  const effectiveReadOnly = Boolean(readOnly);
  const baseDisabled = syncBusy || effectiveReadOnly || !hasProfileSnapshot;
  const profileToProjectSelectedGroupIds = resolveSelectedGroupIds(
    profileToProjectGroupIds,
    selectedProfileToProjectGroupIds
  );
  const projectToProfileSelectedGroupIds = resolveSelectedGroupIds(
    projectToProfileGroupIds,
    selectedProjectToProfileGroupIds
  );

  const toggleGroup = (
    direction: SyncDirection,
    groupId: StudioProjectProfileSettingGroupId,
    checked: boolean
  ) => {
    const update = (groupIds: StudioProjectProfileSettingGroupId[]) =>
      checked ? [...groupIds, groupId] : groupIds.filter((candidate) => candidate !== groupId);
    if (direction === "profile-to-project") {
      setSelectedProfileToProjectGroupIds(update);
      return;
    }
    setSelectedProjectToProfileGroupIds(update);
  };

  const runConfirmedSync = async (
    direction: SyncDirection,
    selectedGroupIds: readonly StudioProjectProfileSettingGroupId[]
  ) => {
    const action =
      direction === "profile-to-project" ? onApplyProfileGroupsAction : onSaveProjectGroupsAction;
    if (!action || baseDisabled || selectedGroupIds.length === 0) return;

    const selectedGroupLabels = selectedGroupIds.map(resolveGroupLabel);
    const selectedGroupImpacts = selectedGroupIds.map(
      (groupId) => `- ${resolveGroupLabel(groupId)}: ${resolveGroupImpact(groupId)}`
    );
    const isProfileToProject = direction === "profile-to-project";
    const confirmed = window.confirm(
      [
        `선택 변경 목록: ${selectedGroupLabels.join(", ")}`,
        `영향 범위: ${
          isProfileToProject
            ? "프로필 기본값에서 현재 프로젝트의 선택 그룹만 갱신합니다."
            : "현재 프로젝트 값에서 프로필 기본값의 선택 그룹만 갱신합니다."
        }`,
        ...selectedGroupImpacts,
        "자동 저장으로 이전 상태를 복구할 수 있습니다.",
        "승인된 자산은 영향받는 범위만 다시 검토합니다.",
      ].join("\n")
    );
    if (!confirmed) return;

    try {
      setLocalSyncState(null);
      await action(selectedGroupIds);
      setLocalSyncState({
        role: "status",
        message: isProfileToProject
          ? "선택한 프로필 기본값을 프로젝트에 적용했습니다."
          : "선택한 현재 값을 프로필 기본값으로 저장했습니다.",
      });
    } catch (error) {
      setLocalSyncState({
        role: "alert",
        message: error instanceof Error ? error.message : "프로필 동기화에 실패했습니다.",
      });
    }
  };

  const runRefreshProfile = async () => {
    if (!onRefreshProfileAction || syncBusy) return;
    try {
      setLocalSyncState(null);
      await onRefreshProfileAction();
      setLocalSyncState({ role: "status", message: "최신 원본을 새로고침했습니다." });
    } catch (error) {
      setLocalSyncState({
        role: "alert",
        message: error instanceof Error ? error.message : "최신 원본 새로고침에 실패했습니다.",
      });
    }
  };

  return (
    <div className="studio-project-settings-layer" role="presentation" onMouseDown={onCloseAction}>
      <aside
        id="studio-project-settings-drawer"
        ref={drawerRef}
        className="studio-project-settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-project-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="studio-project-settings-head">
          <div>
            <div className="studio-project-settings-kicker">PROJECT</div>
            <h2 id="studio-project-settings-title">프로젝트 설정</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="btn-secondary" onClick={onCloseAction}>
            닫기
          </button>
        </div>

        <label className="studio-project-settings-field">
          <span>프로젝트 이름</span>
          <input
            className="input-field"
            value={projectName}
            disabled={readOnly}
            maxLength={120}
            onChange={(event) => onProjectNameChangeAction(event.target.value)}
            placeholder="프로젝트 이름"
          />
        </label>

        <dl className="studio-project-settings-detail-list">
          <div>
            <dt>프로필 스냅샷</dt>
            <dd>{summary.profileLabel}</dd>
          </div>
          <div>
            <dt>스냅샷 생성일</dt>
            <dd>{summary.profileCreatedAtLabel}</dd>
          </div>
          <div>
            <dt>현재 템플릿</dt>
            <dd>{summary.templateSummary}</dd>
          </div>
          <div>
            <dt>출력 규격</dt>
            <dd>{summary.outputSummary}</dd>
          </div>
          <div>
            <dt>원본과 다른 값</dt>
            <dd>
              {hasProfileSnapshot
                ? changedGroupCount > 0
                  ? `${changedGroupCount}개 변경 그룹`
                  : "다른 값 없음"
                : "스냅샷 없음"}
            </dd>
          </div>
        </dl>

        {projectTools ? (
          <details className="studio-project-settings-tools">
            <summary>템플릿·브랜딩</summary>
            <div className="studio-project-settings-tools-body">{projectTools}</div>
          </details>
        ) : null}

        <div className="studio-project-settings-sync-head">
          <div>
            <h3>프로필 동기화</h3>
            <p>
              {syncBusy
                ? "동기화 작업을 처리 중입니다."
                : effectiveReadOnly
                  ? "읽기 전용 상태에서는 프로필 값을 변경할 수 없습니다."
                  : hasProfileSnapshot
                    ? "변경 그룹을 선택해 필요한 범위만 동기화합니다."
                    : "프로필 스냅샷이 없어 동기화할 수 없습니다."}
            </p>
          </div>
          <button type="button" className="btn-secondary" disabled={syncBusy} onClick={runRefreshProfile}>
            최신 원본 새로고침
          </button>
        </div>

        {visibleSyncState ? (
          <div
            className={`studio-project-settings-sync-message is-${visibleSyncState.role}`}
            role={visibleSyncState.role}
          >
            {visibleSyncState.message}
          </div>
        ) : null}

        <section className="studio-project-settings-sync-section" aria-labelledby="studio-profile-to-project-title">
          <div className="studio-project-settings-sync-section-head">
            <div>
              <h3 id="studio-profile-to-project-title">프로필 → 프로젝트</h3>
              <p>새 기본값과 다른 현재 프로젝트 항목만 표시합니다.</p>
            </div>
            <span>{profileToProjectGroupIds.length}개</span>
          </div>
          <StudioProjectSettingsGroupChecklist
            direction="profile-to-project"
            groupIds={profileToProjectGroupIds}
            selectedGroupIds={profileToProjectSelectedGroupIds}
            disabled={baseDisabled}
            emptyLabel={hasProfileSnapshot ? "프로젝트에 적용할 변경 그룹이 없습니다." : "스냅샷 없음"}
            onToggle={toggleGroup}
          />
          <button
            type="button"
            className="btn-primary studio-project-settings-sync-button"
            disabled={baseDisabled || profileToProjectSelectedGroupIds.length === 0}
            onClick={() => runConfirmedSync("profile-to-project", profileToProjectSelectedGroupIds)}
          >
            새 기본값을 이 프로젝트에 선택 적용
          </button>
        </section>

        <section className="studio-project-settings-sync-section" aria-labelledby="studio-project-to-profile-title">
          <div className="studio-project-settings-sync-section-head">
            <div>
              <h3 id="studio-project-to-profile-title">프로젝트 → 프로필</h3>
              <p>현재 프로젝트에서 프로필 기본값과 다른 항목만 표시합니다.</p>
            </div>
            <span>{projectToProfileGroupIds.length}개</span>
          </div>
          <StudioProjectSettingsGroupChecklist
            direction="project-to-profile"
            groupIds={projectToProfileGroupIds}
            selectedGroupIds={projectToProfileSelectedGroupIds}
            disabled={baseDisabled}
            emptyLabel={hasProfileSnapshot ? "프로필에 저장할 변경 그룹이 없습니다." : "스냅샷 없음"}
            onToggle={toggleGroup}
          />
          <button
            type="button"
            className="btn-primary studio-project-settings-sync-button"
            disabled={baseDisabled || projectToProfileSelectedGroupIds.length === 0}
            onClick={() => runConfirmedSync("project-to-profile", projectToProfileSelectedGroupIds)}
          >
            현재 값을 프로필 기본값으로 저장
          </button>
        </section>
      </aside>
    </div>
  );
}

type StudioProjectSettingsGroupChecklistProps = {
  direction: SyncDirection;
  groupIds: readonly StudioProjectProfileSettingGroupId[];
  selectedGroupIds: readonly StudioProjectProfileSettingGroupId[];
  disabled: boolean;
  emptyLabel: string;
  onToggle: (direction: SyncDirection, groupId: StudioProjectProfileSettingGroupId, checked: boolean) => void;
};

function StudioProjectSettingsGroupChecklist({
  direction,
  groupIds,
  selectedGroupIds,
  disabled,
  emptyLabel,
  onToggle,
}: StudioProjectSettingsGroupChecklistProps) {
  if (groupIds.length === 0) {
    return <div className="studio-project-settings-empty">{emptyLabel}</div>;
  }

  const selectedGroupIdSet = new Set(selectedGroupIds);

  return (
    <div className="studio-project-settings-checklist">
      {groupIds.map((groupId) => {
        const group = STUDIO_PROJECT_PROFILE_SETTING_GROUP_META[groupId];
        const label = group?.label || groupId;
        const description = group?.description;
        return (
          <label key={groupId} className="studio-project-settings-checkitem">
            <input
              type="checkbox"
              checked={selectedGroupIdSet.has(groupId)}
              disabled={disabled}
              onChange={(event) => onToggle(direction, groupId, event.target.checked)}
            />
            <span>
              <strong>{label}</strong>
              {description ? <small>{description}</small> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

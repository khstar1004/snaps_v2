"use client";

import Link from "next/link";
import { PreflightIssueList } from "@/components/preflight-issue-list";
import { PreflightSummaryBanner } from "@/components/preflight-summary-banner";
import { PublishChannelSelector } from "@/components/publish-channel-selector";
import type { PublishAccountSummary } from "@/lib/publish/client-types";
import type { PublishPreflightIssue } from "@/lib/publish/preflight";
import type { PublishCategory } from "@/lib/publish/types";

type CategoryOption = {
  key: PublishCategory;
  label: string;
};

type PublishComposerPanelProps = {
  quickGuide: string;
  publishReady: boolean;
  scheduleReady: boolean;
  canPublishSelectedCategory: boolean;
  canManageWorkspace: boolean;
  publishPermissionMessage: string;
  publishIssues: PublishPreflightIssue[];
  scheduleIssues: PublishPreflightIssue[];
  hasVideoAsset: boolean;
  accounts: PublishAccountSummary[];
  channelSearch: string;
  selectedChannelId: string;
  effectiveChannelId: string;
  effectiveChannelTitle: string;
  channelColors: Record<string, string>;
  description: string;
  tags: string;
  presetApplied: { description: boolean; tags: boolean };
  selectedCategory: PublishCategory;
  categoryOptions: CategoryOption[];
  mappedChannelId: string;
  mappedChannelTitle: string;
  title: string;
  loading: boolean;
  scheduledAt: string;
  isScheduleReady: boolean;
  message: string;
  youtubeAuthUrl: string;
  onChannelSearchChangeAction: (value: string) => void;
  onUseCategoryDefaultAction: () => void;
  onSelectChannelAction: (channelId: string) => void;
  onDescriptionChangeAction: (value: string) => void;
  onTagsChangeAction: (value: string) => void;
  onCategoryChangeAction: (value: string) => void;
  onTitleChangeAction: (value: string) => void;
  onScheduleChangeAction: (value: string) => void;
  onSubmitPublishAction: () => void;
  onSubmitScheduleAction: () => void;
};

export function PublishComposerPanel({
  quickGuide,
  publishReady,
  scheduleReady,
  canPublishSelectedCategory,
  canManageWorkspace,
  publishPermissionMessage,
  publishIssues,
  scheduleIssues,
  hasVideoAsset,
  accounts,
  channelSearch,
  selectedChannelId,
  effectiveChannelId,
  effectiveChannelTitle,
  channelColors,
  description,
  tags,
  presetApplied,
  selectedCategory,
  categoryOptions,
  mappedChannelId,
  mappedChannelTitle,
  title,
  loading,
  scheduledAt,
  isScheduleReady,
  message,
  youtubeAuthUrl,
  onChannelSearchChangeAction,
  onUseCategoryDefaultAction,
  onSelectChannelAction,
  onDescriptionChangeAction,
  onTagsChangeAction,
  onCategoryChangeAction,
  onTitleChangeAction,
  onScheduleChangeAction,
  onSubmitPublishAction,
  onSubmitScheduleAction,
}: PublishComposerPanelProps) {
  const descriptionId = "publish-description";
  const tagsId = "publish-tags";
  const categoryId = "publish-category";
  const titleId = "publish-title";
  const scheduleId = "publish-schedule";

  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <h2>빠른 발행 설정</h2>
      <div style={{ background: "#EFF6FF", color: "#1E3A8A", padding: "var(--space-3)", borderRadius: "var(--radius-md)", fontSize: "0.875rem" }}>
        {quickGuide}
      </div>
      {publishPermissionMessage ? (
        <div style={{ background: "#FFF7ED", color: "#9A3412", padding: "var(--space-3)", borderRadius: "var(--radius-md)", fontSize: "0.875rem" }}>
          {publishPermissionMessage}
        </div>
      ) : null}

      <PreflightSummaryBanner
        publishReady={publishReady}
        scheduleReady={scheduleReady}
        publishCount={publishIssues.length}
        scheduleCount={scheduleIssues.length}
        publishLabel="즉시 발행"
        scheduleLabel="예약 발행"
      />

      {!hasVideoAsset && (
        <div style={{ padding: "var(--space-4)", background: "#FEF2F2", color: "#B91C1C", borderRadius: "var(--radius-md)" }}>
          <p style={{ marginBottom: "var(--space-2)" }}>선택된 영상 자산이 없습니다. 스튜디오에서 먼저 생성하거나 라이브러리에서 선택해 주세요.</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Link href="/shorts-json-studio" className="btn-primary">스튜디오로 이동</Link>
            <Link href="/assets" className="btn-secondary">라이브러리</Link>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.95rem" }}>고급 발행 설정</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
            <PublishChannelSelector
              accounts={accounts}
              channelSearch={channelSearch}
              selectedChannelId={selectedChannelId}
              effectiveChannelId={effectiveChannelId}
              effectiveChannelTitle={effectiveChannelTitle}
              channelColors={channelColors}
              disabled={!canPublishSelectedCategory}
              onChannelSearchChangeAction={onChannelSearchChangeAction}
              onUseCategoryDefaultAction={onUseCategoryDefaultAction}
              onSelectChannelAction={onSelectChannelAction}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label htmlFor={descriptionId} style={{ fontWeight: 600 }}>설명</label>
              <textarea
                id={descriptionId}
                className="input-field"
                style={{ minHeight: "120px" }}
                value={description}
                onChange={(event) => onDescriptionChangeAction(event.target.value)}
                disabled={!canPublishSelectedCategory}
              />
              {presetApplied.description && <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 500 }}>프리셋 적용됨</span>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <label htmlFor={tagsId} style={{ fontWeight: 600 }}>태그(쉼표 구분)</label>
              <input id={tagsId} className="input-field" value={tags} onChange={(event) => onTagsChangeAction(event.target.value)} disabled={!canPublishSelectedCategory} />
              {presetApplied.tags && <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 500 }}>프리셋 적용됨</span>}
            </div>
          </div>
        </details>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label htmlFor={categoryId} style={{ fontWeight: 600 }}>콘텐츠 프로필</label>
          <select id={categoryId} className="input-field" value={selectedCategory} onChange={(event) => onCategoryChangeAction(event.target.value)}>
            {categoryOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          {mappedChannelId ? (
            <div style={{ fontSize: "0.875rem", color: "var(--success)" }}>
              프로필 기본 채널: {mappedChannelTitle ? `${mappedChannelTitle} (${mappedChannelId})` : mappedChannelId}
            </div>
          ) : (
            <div style={{ fontSize: "0.875rem", color: "var(--error)" }}>이 콘텐츠 프로필에 연결된 기본 채널이 없습니다. 설정에서 채널을 연결해 주세요.</div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label htmlFor={titleId} style={{ fontWeight: 600 }}>영상 제목</label>
          <input id={titleId} className="input-field" value={title} onChange={(event) => onTitleChangeAction(event.target.value)} disabled={!canPublishSelectedCategory} />
          <div style={{ fontSize: "0.875rem", color: publishReady ? "var(--success)" : "var(--error)" }}>
            사전 점검 상태: {publishReady ? "발행 가능" : `필수 항목 ${publishIssues.length}개 미충족`}
          </div>
          {!publishReady && <PreflightIssueList issues={publishIssues} idPrefix="publish-preflight" />}
        </div>
      </div>

      <hr style={{ borderTop: "1px solid var(--border-subtle)", width: "100%", borderBottom: 0 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div>
          <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={loading || !canPublishSelectedCategory || !publishReady} onClick={onSubmitPublishAction}>
            지금 발행
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", background: "var(--bg-app)", padding: "var(--space-4)", borderRadius: "var(--radius-md)" }}>
          <label htmlFor={scheduleId} style={{ fontWeight: 600 }}>예약 발행</label>
          <input id={scheduleId} className="input-field" type="datetime-local" value={scheduledAt} onChange={(event) => onScheduleChangeAction(event.target.value)} disabled={!canPublishSelectedCategory} />
          {!scheduleReady && <PreflightIssueList issues={scheduleIssues} idPrefix="publish-schedule-preflight" />}
          <button type="button" className="btn-secondary" disabled={loading || !canPublishSelectedCategory || !scheduleReady} onClick={onSubmitScheduleAction}>
            {isScheduleReady ? "예약 발행 확정" : "예약 시간을 입력하세요"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", marginTop: "var(--space-4)" }}>
        {canManageWorkspace ? (
          <a href={youtubeAuthUrl} className="btn-secondary">YouTube 채널 연결</a>
        ) : (
          <button type="button" className="btn-secondary" disabled title="현재 환경에서는 채널 연결 설정을 변경할 수 없습니다.">
            YouTube 채널 연결
          </button>
        )}
        {message && <div style={{ color: "var(--error)" }}>{message}</div>}
      </div>
    </section>
  );
}

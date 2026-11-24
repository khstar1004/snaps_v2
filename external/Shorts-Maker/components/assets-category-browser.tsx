"use client";

import { useRef } from "react";
import type { AssetsLatestResponse, PublishAccountSummary, PublishJobSummary } from "@/lib/publish/client-types";
import { getChannelColor, hexToRgba } from "@/lib/ui/channel-colors";

function toSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function toRelativeUploadedLabel(createdAt: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return "업로드 시각 없음";
  const diffMs = Date.now() - createdAt;
  if (diffMs < 45_000) return "방금 전 업로드";
  const rtf = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 60) return `${rtf.format(-diffMinutes, "minute")} 업로드`;
  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) < 24) return `${rtf.format(-diffHours, "hour")} 업로드`;
  const diffDays = Math.round(diffMs / 86_400_000);
  return `${rtf.format(-diffDays, "day")} 업로드`;
}

function toLocalDateTimeLabel(value: string | number | null | undefined, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("ko-KR");
}

type AssetsCategoryBrowserProps = {
  groupedItems: Array<[string, AssetsLatestResponse["items"]]>;
  categoryLabelMap: Map<string, string>;
  jobsByVideoUrl: Map<string, PublishJobSummary[]>;
  accounts: PublishAccountSummary[];
  draftMap: Record<string, { publishCategory: string; channelId: string }>;
  studioResumeMap: Record<string, { source: "draft" | "history"; label: string; createdAt: string | null }>;
  categoryChannels: Partial<Record<string, string>>;
  visibleCountByCategory: Record<string, number>;
  categoryInitialVisibleCount: number;
  previewAssetId: string | null;
  loading: boolean;
  openingStudioAssetId: string | null;
  creatingRevisionAssetId: string | null;
  channelColors: Record<string, string>;
  canEditCategoryAction: (categoryKey: string) => boolean;
  onTogglePreviewAction: (assetId: string) => void;
  onResumeStudioAction: (asset: AssetsLatestResponse["items"][number], categoryKey: string) => void;
  onCreateRevisionAction: (asset: AssetsLatestResponse["items"][number], categoryKey: string) => void;
  onDeleteAssetAction: (asset: AssetsLatestResponse["items"][number]) => void;
  onLoadMoreAction: (categoryKey: string) => void;
};

export function AssetsCategoryBrowser({
  groupedItems,
  categoryLabelMap,
  jobsByVideoUrl,
  accounts,
  draftMap,
  studioResumeMap,
  categoryChannels,
  visibleCountByCategory,
  categoryInitialVisibleCount,
  previewAssetId,
  loading,
  openingStudioAssetId,
  creatingRevisionAssetId,
  channelColors,
  canEditCategoryAction,
  onTogglePreviewAction,
  onResumeStudioAction,
  onCreateRevisionAction,
  onDeleteAssetAction,
  onLoadMoreAction,
}: AssetsCategoryBrowserProps) {
  const categoryCarouselRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollCategoryCarousel = (categoryKey: string, direction: "left" | "right") => {
    const node = categoryCarouselRefs.current[categoryKey];
    if (!node) return;
    const step = Math.max(280, Math.floor(node.clientWidth * 0.72));
    node.scrollBy({
      left: direction === "right" ? step : -step,
      behavior: "smooth",
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {groupedItems.map(([categoryKey, groupItems]) => (
        <div key={categoryKey} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "var(--space-2)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h3 style={{ fontSize: "1rem" }}>
                {categoryLabelMap.get(categoryKey) || categoryKey}{" "}
                <span style={{ color: "var(--text-secondary)", fontWeight: "normal", fontSize: "0.875rem" }}>({groupItems.length}개)</span>
              </h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                최근 {Math.min(groupItems.length, visibleCountByCategory[categoryKey] || categoryInitialVisibleCount)}개 표시
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "2px 8px", fontSize: "0.8125rem" }}
                onClick={() => scrollCategoryCarousel(categoryKey, "left")}
                aria-label={`${categoryLabelMap.get(categoryKey) || categoryKey} 왼쪽으로 이동`}
                title="왼쪽으로 이동"
              >
                ←
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "2px 8px", fontSize: "0.8125rem" }}
                onClick={() => scrollCategoryCarousel(categoryKey, "right")}
                aria-label={`${categoryLabelMap.get(categoryKey) || categoryKey} 오른쪽으로 이동`}
                title="오른쪽으로 이동"
              >
                →
              </button>
            </div>
          </div>
          <div
            ref={(node) => {
              categoryCarouselRefs.current[categoryKey] = node;
            }}
            style={{
              display: "flex",
              gap: "var(--space-4)",
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: "var(--space-2)",
              scrollSnapType: "x mandatory",
            }}
            onWheel={(event) => {
              if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
              event.preventDefault();
              event.currentTarget.scrollBy({ left: event.deltaY });
            }}
          >
            {groupItems.slice(0, visibleCountByCategory[categoryKey] || categoryInitialVisibleCount).map((item) => {
              const linkedJobs = jobsByVideoUrl.get(item.url) || [];
              const latestJob = linkedJobs[0];
              const draft = draftMap[item.id];
              const studioResume = studioResumeMap[item.id];
              const canEditAsset = canEditCategoryAction(categoryKey);
              const canCreateRevision = canEditAsset && categoryKey !== "uncategorized";
              const studioActionBusy = Boolean(openingStudioAssetId || creatingRevisionAssetId);
              const mappedChannelId = draft ? (categoryChannels[draft.publishCategory] || "").trim() : "";
              const effectiveChannelId = (draft?.channelId || mappedChannelId || "").trim();
              const colorKey = effectiveChannelId || latestJob?.channelId || "unassigned";
              const channelColor = getChannelColor(colorKey, channelColors);
              const channelLabel = effectiveChannelId
                ? accounts.find((account) => account.channelId === effectiveChannelId)?.channelTitle || effectiveChannelId
                : latestJob?.channelId
                  ? accounts.find((account) => account.channelId === latestJob.channelId)?.channelTitle || latestJob.channelId
                  : "미지정";

              return (
                <article
                  key={item.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                    flex: "0 0 min(360px, 90vw)",
                    background: `linear-gradient(0deg, ${hexToRgba(channelColor, 0.08)} 0%, var(--bg-surface) 42%)`,
                    border: `1px solid ${hexToRgba(channelColor, 0.35)}`,
                    borderLeft: `4px solid ${channelColor}`,
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-4)",
                    boxShadow: "var(--shadow-base)",
                    scrollSnapAlign: "start",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    <strong style={{ fontSize: "1rem", wordBreak: "break-all" }}>{item.title}</strong>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      <span title={toLocalDateTimeLabel(item.createdAt, "업로드 시각 없음")}>{toRelativeUploadedLabel(item.createdAt)}</span>
                      <span>{toSizeLabel(item.sizeBytes)} • {item.mimeType?.split("/")[1] || "mp4"}</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: channelColor, fontWeight: 600 }}>
                      채널: {channelLabel}
                    </div>
                  </div>

                  {previewAssetId === item.id && (
                    <video controls preload="metadata" src={item.url} style={{ width: "100%", borderRadius: "var(--radius-md)", background: "#000", aspectRatio: "9/16" }}>
                      <track kind="captions" srcLang="ko" label="한국어 자막" />
                    </video>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "0.875rem" }}
                      onClick={() => onTogglePreviewAction(item.id)}
                    >
                      {previewAssetId === item.id ? "재생 닫기" : "재생"}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: "4px 8px", fontSize: "0.875rem" }}
                      onClick={() => onCreateRevisionAction(item, categoryKey)}
                      disabled={!canCreateRevision || studioActionBusy}
                      title={
                        categoryKey === "uncategorized"
                          ? "콘텐츠 프로필이 연결된 완성 영상에서만 수정본을 만들 수 있습니다."
                          : !canEditAsset
                            ? "현재 이 영상은 편집할 수 없습니다."
                            : creatingRevisionAssetId === item.id
                              ? "완성 영상의 제작 상태를 복제하는 중입니다."
                              : "원본 완성 영상은 유지하고 편집 가능한 새 프로젝트를 만듭니다."
                      }
                    >
                      {categoryKey === "uncategorized"
                        ? "프로필 연결 필요"
                        : !canEditAsset
                          ? "편집 불가"
                          : creatingRevisionAssetId === item.id
                            ? "수정본 만드는 중..."
                            : "수정본 만들기"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "0.875rem" }}
                      onClick={() => onResumeStudioAction(item, categoryKey)}
                      disabled={!canEditAsset || studioActionBusy}
                      title={
                        !canEditAsset
                          ? "현재 이 영상은 편집할 수 없습니다."
                          : openingStudioAssetId === item.id
                            ? "저장된 제작 상태를 불러오는 중입니다."
                            : "저장된 제작 상태를 확인해 스튜디오에서 엽니다. 구형 자산은 로컬 초안을 대신 확인합니다."
                      }
                    >
                      {!canEditAsset ? "편집 불가" : openingStudioAssetId === item.id ? "불러오는 중..." : "스튜디오에서 열기"}
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "0.875rem" }}
                    >
                      원본 열기
                    </a>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "0.875rem", borderColor: "var(--error)", color: "var(--error)" }}
                      onClick={() => onDeleteAssetAction(item)}
                      disabled={loading || !canEditAsset}
                      title={canEditAsset ? "완성 영상을 휴지통으로 이동" : "현재 이 영상은 삭제할 수 없습니다."}
                    >
                      삭제
                    </button>
                  </div>

                  {studioResume ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {studioResume.source === "draft" ? "현재 로컬 초안 연결됨" : `저장된 스냅샷: ${studioResume.label}`}
                      {studioResume.createdAt ? ` · ${toLocalDateTimeLabel(studioResume.createdAt, "저장 시각 없음")}` : ""}
                    </div>
                  ) : null}

                  <details style={{ padding: "var(--space-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", marginTop: "var(--space-2)" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>상세 정보</summary>
                    <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      <div>자산 ID: <span style={{ color: "var(--text-primary)" }}>{item.id}</span></div>
                      <div>URL: <span style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{item.url}</span></div>
                    </div>
                  </details>
                </article>
              );
            })}
            {groupItems.length > (visibleCountByCategory[categoryKey] || categoryInitialVisibleCount) ? (
              <button
                type="button"
                className="btn-secondary"
                style={{
                  flex: "0 0 min(280px, 75vw)",
                  minHeight: 220,
                  borderStyle: "dashed",
                  borderWidth: 1.5,
                  scrollSnapAlign: "start",
                }}
                onClick={() => onLoadMoreAction(categoryKey)}
              >
                + 더 보기
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createStudioMediaAsset,
  deleteStudioMediaAsset,
  fetchStudioMediaAssets,
  updateStudioMediaAsset,
  type StudioMediaAssetItem,
} from "@/lib/api/studio-client";
import { normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import { isApiClientError } from "@/lib/ui/api-client";
import type { PreparedSlide, SlideMediaKind } from "@/types/studio-json";

type StudioMemeLibraryPanelProps = {
  slides: PreparedSlide[];
  canEditSelectedCategory?: boolean;
  permissionMessage?: string;
  onApplyAssetToSlideAction: (
    index: number,
    asset: {
      imageUrl: string;
      mediaUrl?: string;
      mediaKind?: SlideMediaKind;
      assetId?: string;
      title?: string;
    }
  ) => void;
};

type DraftState = {
  title: string;
  summary: string;
  tagsText: string;
  emotionTagsText: string;
  queryHintsText: string;
};

type MetadataOriginMode = "manual" | "auto" | "mixed" | "empty";

function parseCsv(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function toDraft(item: StudioMediaAssetItem): DraftState {
  return {
    title: item.title || "",
    summary: item.summary || "",
    tagsText: toCsv(item.manualTags || []),
    emotionTagsText: toCsv(item.manualEmotionTags || []),
    queryHintsText: toCsv(item.manualQueryHints || []),
  };
}

function tokenizeForTags(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .join(" ")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s/_-]/gu, " ")
        .replace(/[_/.-]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  ).slice(0, 24);
}

function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function isMotionKind(value?: SlideMediaKind): boolean {
  return value === "video" || value === "animated_image";
}

function getVisibleAssetTags(item: StudioMediaAssetItem): string[] {
  return Array.from(new Set([...(item.tags || []), ...(item.emotionTags || [])])).slice(0, 6);
}

function hasAutoMetadata(item: StudioMediaAssetItem): boolean {
  return (
    (item.autoTags && item.autoTags.length > 0) ||
    (item.autoEmotionTags && item.autoEmotionTags.length > 0) ||
    (item.autoQueryHints && item.autoQueryHints.length > 0)
  );
}

function hasManualMetadata(item: StudioMediaAssetItem): boolean {
  return (
    (item.manualTags && item.manualTags.length > 0) ||
    (item.manualEmotionTags && item.manualEmotionTags.length > 0) ||
    (item.manualQueryHints && item.manualQueryHints.length > 0)
  );
}

function hasAutoSourceMetadata(item: StudioMediaAssetItem): boolean {
  return Boolean(
    item.autoSourceMetadata?.provider ||
      item.autoSourceMetadata?.providerQuery ||
      item.autoSourceMetadata?.providerTitle ||
      item.autoSourceMetadata?.providerSlug ||
      item.autoSourceMetadata?.providerRating ||
      item.autoSourceMetadata?.providerTags?.length ||
      item.autoSourceMetadata?.providerCandidates?.length ||
      item.autoSourceMetadata?.selectionDetails?.length
  );
}

function resolveMetadataOriginMode(item: StudioMediaAssetItem): MetadataOriginMode {
  const manual = hasManualMetadata(item);
  const auto = hasAutoMetadata(item);
  if (manual && auto) return "mixed";
  if (manual) return "manual";
  if (auto) return "auto";
  return "empty";
}

function getMetadataOriginLabel(mode: MetadataOriginMode): string {
  if (mode === "mixed") return "MIXED";
  if (mode === "auto") return "AUTO";
  if (mode === "manual") return "MANUAL";
  return "EMPTY";
}

function renderAssetMedia(item: StudioMediaAssetItem) {
  if (item.mediaKind === "video" && item.mediaUrl) {
    return <video src={item.mediaUrl} className="studio-meme-gallery-image studio-meme-media-43" muted loop playsInline autoPlay />;
  }
  return <img src={item.imageUrl} alt={item.title || item.id} className="studio-meme-gallery-image studio-meme-media-43" />;
}

function toSlideAssetPayload(slide: PreparedSlide): {
  provider?: string;
  providerAssetId?: string;
  title?: string;
  summary?: string;
  mediaKind?: SlideMediaKind;
  sourceUrl?: string;
  sourceMediaUrl?: string;
  sourcePageUrl?: string;
  tags?: string[];
  emotionTags?: string[];
  queryHints?: string[];
  metadataOrigin: "manual" | "auto";
  autoSourceMetadata?: {
    provider?: string;
    providerQuery?: string;
    queryCandidates?: string[];
    providerTitle?: string;
    providerTags?: string[];
    providerCandidates?: string[];
    selectionDetails?: string[];
  };
} | null {
  const normalizedMedia = normalizeStudioMediaUrls({
    imageUrl: slide.imageUrl || slide.resolvedImageUrl || "",
    mediaUrl: slide.mediaUrl || "",
    mediaKind: slide.mediaKind,
  });
  const sourceUrl = String(normalizedMedia.imageUrl || "").trim();
  if (!sourceUrl) return null;
  const queryCandidates = slide.imageRequest?.queryCandidates || [];
  const selectedQuery = String(slide.imageSelection?.selectedQuery || "").trim();
  const selectionReason = String(slide.imageSelection?.selectionReason || "").trim();
  const metadataOrigin: "manual" | "auto" =
    slide.imageSelection?.provider && slide.imageSelection.provider !== "library" ? "auto" : "manual";
  return {
    provider: slide.imageSelection?.provider || "manual",
    providerAssetId: String(slide.imageSelection?.selectedCandidateId || "").trim() || undefined,
    title: slide.title || undefined,
    summary: selectionReason || undefined,
    mediaKind: normalizedMedia.mediaKind || slide.mediaKind,
    sourceUrl,
    sourceMediaUrl: String(normalizedMedia.mediaUrl || "").trim() || undefined,
    tags: tokenizeForTags([slide.title || "", slide.text || "", ...queryCandidates, selectedQuery]),
    emotionTags:
      slide.imageSelection?.intent && slide.imageSelection.intent !== "fallback" ? [slide.imageSelection.intent] : [],
    queryHints: Array.from(
      new Set([slide.imageRequest?.query || "", ...queryCandidates, selectedQuery].map((item) => item.trim()).filter(Boolean))
    ).slice(0, 16),
    metadataOrigin,
    autoSourceMetadata:
      metadataOrigin === "auto"
        ? {
            provider: slide.imageSelection?.provider,
            providerQuery: selectedQuery || slide.imageRequest?.query || undefined,
            queryCandidates,
            providerTitle: slide.title || undefined,
            providerTags: tokenizeForTags([slide.title || "", slide.text || "", selectedQuery, ...queryCandidates]),
            providerCandidates: slide.imageSelection?.providerCandidates || [],
            selectionDetails: selectionReason ? [selectionReason] : [],
          }
        : undefined,
  };
}

export function StudioMemeLibraryPanel({
  slides,
  canEditSelectedCategory = true,
  permissionMessage,
  onApplyAssetToSlideAction,
}: StudioMemeLibraryPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingCurrentSlide, setSavingCurrentSlide] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<StudioMediaAssetItem[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [emotionTagCounts, setEmotionTagCounts] = useState<Record<string, number>>({});
  const [stillCount, setStillCount] = useState(0);
  const [motionCount, setMotionCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedEmotionTag, setSelectedEmotionTag] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "motion">("all");
  const [metadataFilter, setMetadataFilter] = useState<"all" | "manual" | "auto" | "mixed">("all");
  const [selectedSlideIndex, setSelectedSlideIndex] = useState("0");
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [copyingId, setCopyingId] = useState("");
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState("");

  const loadAssets = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStudioMediaAssets({ limit: 200 });
      setEnabled(data.enabled);
      setItems(data.items || []);
      setTagCounts(data.stats?.tagCounts || {});
      setEmotionTagCounts(data.stats?.emotionTagCounts || {});
      setStillCount(data.stats?.stillCount || 0);
      setMotionCount(data.stats?.motionCount || 0);
      setDrafts(Object.fromEntries((data.items || []).map((item) => [item.id, toDraft(item)])));
    } catch (error) {
      setError(isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadAssets();
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (slides.length <= 0) {
      setSelectedSlideIndex("0");
      return;
    }
    const current = Number(selectedSlideIndex);
    if (!Number.isFinite(current) || current < 0 || current >= slides.length) {
      setSelectedSlideIndex("0");
    }
  }, [selectedSlideIndex, slides.length]);

  const selectedSlide = slides[Number(selectedSlideIndex)] || null;

  const filteredItems = useMemo(() => {
    const queryTokens = searchText
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    return items.filter((item) => {
      if (mediaFilter === "image" && item.mediaKind && item.mediaKind !== "image") return false;
      if (mediaFilter === "motion" && !isMotionKind(item.mediaKind)) return false;
      if (metadataFilter !== "all" && resolveMetadataOriginMode(item) !== metadataFilter) return false;
      if (selectedTag && !(item.tags || []).includes(selectedTag)) return false;
      if (selectedEmotionTag && !(item.emotionTags || []).includes(selectedEmotionTag)) return false;
      if (queryTokens.length <= 0) return true;
      const corpus = [
        item.title || "",
        item.summary || "",
        item.id,
        ...(item.tags || []),
        ...(item.emotionTags || []),
        ...(item.queryHints || []),
        item.autoSourceMetadata?.providerQuery || "",
        item.autoSourceMetadata?.providerTitle || "",
        item.autoSourceMetadata?.providerSlug || "",
        ...(item.autoSourceMetadata?.providerTags || []),
        ...(item.autoSourceMetadata?.providerCandidates || []),
        ...(item.autoSourceMetadata?.selectionDetails || []),
      ]
        .join(" ")
        .toLowerCase();
      return queryTokens.every((token) => corpus.includes(token));
    });
  }, [items, mediaFilter, metadataFilter, searchText, selectedEmotionTag, selectedTag]);

  const topTags = useMemo(
    () =>
      Object.entries(tagCounts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 14),
    [tagCounts]
  );

  const topEmotionTags = useMemo(
    () =>
      Object.entries(emotionTagCounts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 14),
    [emotionTagCounts]
  );

  const handleDraftChange = (id: string, patch: Partial<DraftState>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || { title: "", summary: "", tagsText: "", emotionTagsText: "", queryHintsText: "" }),
        ...patch,
      },
    }));
  };

  const handleSaveItem = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setStatus("");
    setError("");
    try {
      await updateStudioMediaAsset({
        id,
        title: draft.title.trim() || undefined,
        summary: draft.summary.trim() || undefined,
        tags: parseCsv(draft.tagsText),
        emotionTags: parseCsv(draft.emotionTagsText),
        queryHints: parseCsv(draft.queryHintsText),
      });
      setStatus(`저장 완료: ${id}`);
      await loadAssets();
    } catch (error) {
      setError(isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error));
    } finally {
      setSavingId("");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("이 자산을 DB에서 삭제할까요?")) return;
    setDeletingId(id);
    setStatus("");
    setError("");
    try {
      await deleteStudioMediaAsset(id);
      setStatus(`삭제 완료: ${id}`);
      await loadAssets();
    } catch (error) {
      setError(isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingId("");
    }
  };

  const handleCopyAutoMetadata = async (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item || !hasAutoMetadata(item)) return;
    const draft = drafts[id] || toDraft(item);
    const mergedTags = Array.from(new Set([...parseCsv(draft.tagsText), ...(item.autoTags || [])]));
    const mergedEmotionTags = Array.from(new Set([...parseCsv(draft.emotionTagsText), ...(item.autoEmotionTags || [])]));
    const mergedQueryHints = Array.from(new Set([...parseCsv(draft.queryHintsText), ...(item.autoQueryHints || [])]));
    setCopyingId(id);
    setStatus("");
    setError("");
    try {
      await updateStudioMediaAsset({
        id,
        tags: mergedTags,
        emotionTags: mergedEmotionTags,
        queryHints: mergedQueryHints,
      });
      setStatus(`자동 메타를 수동 메타로 복사했습니다: ${item.title || id}`);
      await loadAssets();
    } catch (error) {
      setError(isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error));
    } finally {
      setCopyingId("");
    }
  };

  const handleToggleFavorite = async (item: StudioMediaAssetItem) => {
    if (!canEditSelectedCategory) return;
    setFavoriteUpdatingId(item.id);
    setStatus("");
    setError("");
    try {
      const updated = await updateStudioMediaAsset({
        id: item.id,
        isFavorite: !item.isFavorite,
      });
      setItems((current) => current.map((entry) => (entry.id === updated.item.id ? updated.item : entry)));
      setStatus(`${item.title || item.id} 자산을 ${item.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}했습니다.`);
    } catch (error) {
      setError(isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error));
    } finally {
      setFavoriteUpdatingId("");
    }
  };

  const handleSaveSelectedSlide = async () => {
    if (!selectedSlide) {
      setError("저장할 슬라이드를 먼저 선택해 주세요.");
      return;
    }
    const payload = toSlideAssetPayload(selectedSlide);
    if (!payload) {
      setError("선택한 슬라이드에 저장할 이미지/움짤이 없습니다.");
      return;
    }
    setSavingCurrentSlide(true);
    setStatus("");
    setError("");
    try {
      await createStudioMediaAsset({
        ...payload,
      });
      setStatus(`슬라이드 ${Number(selectedSlideIndex) + 1} 자산을 studio_media_assets에 저장했습니다.`);
      await loadAssets();
    } catch (error) {
      setError(isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error));
    } finally {
      setSavingCurrentSlide(false);
    }
  };

  const previewItems = items.slice(0, 4);

  return (
    <>
      <section className="card studio-meme-launch-card">
        <div className="studio-panel-header">
          <div className="studio-meme-launch-copy">
            <div className="studio-meme-launch-eyebrow">
              studio_media_assets
            </div>
            <h3 className="studio-meme-launch-title">저장 미디어 자산함</h3>
            <div className="studio-meme-launch-description">
              DB의 `studio_media_assets`에서 저장된 사진/움짤을 읽고, 현재 영상 슬라이드에 바로 적용합니다.
            </div>
          </div>
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            자산함 열기
          </button>
        </div>

        <div className="studio-meme-launch-meta">
          <span className={`studio-meme-stat-pill ${enabled ? "is-success" : "is-muted"}`}>{enabled ? "DB 연결 활성" : "DB 비활성"}</span>
          <span className="studio-meme-stat-pill">전체 {items.length}</span>
          <span className="studio-meme-stat-pill">정지 {stillCount}</span>
          <span className="studio-meme-stat-pill">움직임 {motionCount}</span>
        </div>

        {previewItems.length > 0 ? (
          <div className="studio-meme-launch-strip">
            {previewItems.map((item) => (
              <div key={item.id} className="studio-meme-launch-thumb">
                {renderAssetMedia(item)}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {open ? (
        <div className="studio-meme-modal-layer" role="dialog" aria-modal="true" aria-label="저장 미디어 자산함">
          <button type="button" className="studio-meme-modal-backdrop" aria-label="자산함 닫기" onClick={() => setOpen(false)} />
          <div className="studio-meme-modal">
            <div className="studio-meme-modal-header">
              <div className="studio-meme-modal-copy">
                <div className="studio-meme-kicker">Saved Media Assets</div>
                <div className="studio-meme-modal-title">DB에 저장된 사진과 움짤을 바로 쓰는 자산함</div>
                <div className="studio-meme-modal-description">
                  조회, 태그 수정, 링크 확인, 삭제, 현재 슬라이드 적용, 현재 슬라이드 저장까지 여기서 처리합니다.
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>

            <div className="studio-meme-toolbar">
              <button type="button" className="btn-secondary" onClick={() => void loadAssets()} disabled={loading}>
                {loading ? "불러오는 중..." : "새로고침"}
              </button>
              <span className={`studio-meme-stat-pill ${enabled ? "is-success" : "is-muted"}`}>{enabled ? "DB 연결 활성" : "DB 비활성"}</span>
              <span className="studio-meme-stat-pill">검색 결과 {filteredItems.length}</span>
            </div>

            <div className="studio-meme-target-grid">
              <label className="studio-meme-target-label">
                적용/저장 대상 슬라이드
                <select className="input-field" value={selectedSlideIndex} onChange={(event) => setSelectedSlideIndex(event.target.value)}>
                  {slides.map((slide, index) => (
                    <option key={`${slide.title}-${index}`} value={String(index)}>
                      슬라이드 {index + 1}: {(slide.title || slide.text || "untitled").slice(0, 28)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="studio-meme-target-help">
                {selectedSlide
                  ? "선택된 슬라이드의 현재 이미지/움짤을 DB에 저장하거나, 아래 저장 자산을 이 슬라이드에 바로 적용할 수 있습니다."
                  : "슬라이드를 먼저 준비하면 이 자산함에서 바로 적용할 수 있습니다."}
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSaveSelectedSlide()}
                disabled={!selectedSlide || savingCurrentSlide || !enabled || !canEditSelectedCategory}
              >
                {savingCurrentSlide ? "저장 중..." : "선택 슬라이드 저장"}
              </button>
            </div>

            {!canEditSelectedCategory && permissionMessage ? (
              <div className="studio-meme-status is-info">
                {permissionMessage}
              </div>
            ) : null}

            <div className="studio-meme-search-row">
              <input className="input-field" placeholder="제목, 태그, 요약, query hint 검색" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
              <div className="studio-meme-filter-controls">
                <select className="input-field" value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value as "all" | "image" | "motion")}>
                  <option value="all">전체</option>
                  <option value="image">정지 이미지</option>
                  <option value="motion">움직이는 소스</option>
                </select>
                <select className="input-field" value={metadataFilter} onChange={(event) => setMetadataFilter(event.target.value as "all" | "manual" | "auto" | "mixed")}>
                  <option value="all">메타 전체</option>
                  <option value="manual">수동만</option>
                  <option value="auto">자동만</option>
                  <option value="mixed">혼합만</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                onClick={() => {
                  setSearchText("");
                  setSelectedTag("");
                  setSelectedEmotionTag("");
                  setMediaFilter("all");
                  setMetadataFilter("all");
                }}
                >
                  필터 초기화
                </button>
              </div>
            </div>

            {topEmotionTags.length > 0 ? (
              <div className="studio-meme-filter-section">
                <div className="studio-meme-filter-label">감정 태그</div>
                <div className="studio-meme-chip-row">
                  {topEmotionTags.map(([tag, count]) => (
                    <button key={tag} type="button" className={`studio-meme-chip ${selectedEmotionTag === tag ? "is-active" : ""}`} onClick={() => setSelectedEmotionTag((current) => (current === tag ? "" : tag))}>
                      {tag} ({count})
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {topTags.length > 0 ? (
              <div className="studio-meme-filter-section">
                <div className="studio-meme-filter-label">일반 태그</div>
                <div className="studio-meme-chip-row">
                  {topTags.map(([tag, count]) => (
                    <button key={tag} type="button" className={`studio-meme-chip ${selectedTag === tag ? "is-active" : ""}`} onClick={() => setSelectedTag((current) => (current === tag ? "" : tag))}>
                      {tag} ({count})
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {status ? <div className="studio-meme-status">{status}</div> : null}
            {error ? <div className="studio-meme-status is-error">{error}</div> : null}

            {filteredItems.length > 0 ? (
              <div className="studio-meme-gallery-scroll">
                <div className="studio-meme-gallery-grid">
                {filteredItems.map((item) => {
                  const draft = drafts[item.id] || toDraft(item);
                  const visibleTags = getVisibleAssetTags(item);
                  const metadataMode = resolveMetadataOriginMode(item);
                  const metadataLabel = getMetadataOriginLabel(metadataMode);
                  return (
                    <article key={item.id} className="studio-meme-gallery-tile">
                      <div className="studio-meme-gallery-media">
                        {renderAssetMedia(item)}
                        <span className="studio-meme-type-pill">{item.mediaKind === "video" ? "VIDEO" : item.mediaKind === "animated_image" ? "GIF" : "IMG"}</span>
                        <span className="studio-meme-provider-pill">
                          {item.provider}
                        </span>
                        <span className={`studio-meme-metadata-pill is-${metadataMode}`}>
                          {metadataLabel}
                        </span>
                      </div>
                      <div className="studio-meme-gallery-body">
                        <div className="studio-meme-gallery-title-row">
                          <div className="studio-meme-gallery-title">{item.title || item.id}</div>
                          <button
                            type="button"
                            className={`studio-meme-favorite-toggle${item.isFavorite ? " is-active" : ""}`}
                            onClick={() => void handleToggleFavorite(item)}
                            disabled={!enabled || !canEditSelectedCategory || favoriteUpdatingId === item.id}
                            aria-pressed={item.isFavorite}
                          >
                            {favoriteUpdatingId === item.id ? "저장 중" : item.isFavorite ? "고정됨" : "즐겨찾기"}
                          </button>
                        </div>
                        <div className="studio-meme-gallery-meta">
                          <span>{isMotionKind(item.mediaKind) ? "움직임" : "정지"}</span>
                          <span>수동 {item.manualTags.length + item.manualEmotionTags.length + item.manualQueryHints.length}</span>
                          <span>자동 {item.autoTags.length + item.autoEmotionTags.length + item.autoQueryHints.length}</span>
                          <span>{formatDateTime(item.updatedAtMs)}</span>
                        </div>
                        {item.summary ? <div className="studio-meme-gallery-summary">{item.summary}</div> : null}
                        <div className="studio-meme-gallery-tags">
                          {visibleTags.length > 0 ? (
                            visibleTags.map((tag) => <span key={`${item.id}-${tag}`}>{tag}</span>)
                          ) : (
                            <span>태그 없음</span>
                          )}
                        </div>
                        <div className="studio-meme-gallery-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() =>
                              onApplyAssetToSlideAction(Number(selectedSlideIndex), {
                                imageUrl: item.imageUrl,
                                mediaUrl: item.mediaUrl,
                                mediaKind: item.mediaKind,
                                assetId: item.id,
                                title: item.title,
                              })
                            }
                            disabled={!selectedSlide || !canEditSelectedCategory}
                          >
                            {selectedSlide ? `슬라이드 ${Number(selectedSlideIndex) + 1}에 넣기` : "슬라이드 준비 필요"}
                          </button>
                        </div>
                        <details className="studio-meme-gallery-details">
                          <summary>메타 수정</summary>
                          <div className="studio-meme-item-id">{item.id}</div>
                          <input className="input-field" value={draft.title} onChange={(event) => handleDraftChange(item.id, { title: event.target.value })} placeholder="제목" />
                          <textarea className="input-field studio-meme-edit-textarea" rows={2} value={draft.summary} onChange={(event) => handleDraftChange(item.id, { summary: event.target.value })} placeholder="요약" />
                          <input className="input-field" value={draft.tagsText} onChange={(event) => handleDraftChange(item.id, { tagsText: event.target.value })} placeholder="수동 태그 (쉼표 구분)" />
                          <input className="input-field" value={draft.emotionTagsText} onChange={(event) => handleDraftChange(item.id, { emotionTagsText: event.target.value })} placeholder="수동 감정 태그 (쉼표 구분)" />
                          <textarea className="input-field studio-meme-edit-textarea" rows={2} value={draft.queryHintsText} onChange={(event) => handleDraftChange(item.id, { queryHintsText: event.target.value })} placeholder="수동 query hints (쉼표 구분)" />
                          {hasAutoMetadata(item) ? (
                            <div className="studio-meme-meta-block is-auto">
                              <div className="studio-meme-meta-block-title">자동 메타데이터</div>
                              <div>자동 태그: {item.autoTags.length > 0 ? item.autoTags.join(", ") : "-"}</div>
                              <div>자동 감정 태그: {item.autoEmotionTags.length > 0 ? item.autoEmotionTags.join(", ") : "-"}</div>
                              <div>자동 query hints: {item.autoQueryHints.length > 0 ? item.autoQueryHints.join(", ") : "-"}</div>
                            </div>
                          ) : null}
                          {hasAutoSourceMetadata(item) ? (
                            <div className="studio-meme-meta-block is-source">
                              <div className="studio-meme-meta-block-title">자동 원본 메타</div>
                              <div>provider query: {item.autoSourceMetadata.providerQuery || "-"}</div>
                              <div>provider title: {item.autoSourceMetadata.providerTitle || "-"}</div>
                              <div>provider slug: {item.autoSourceMetadata.providerSlug || "-"}</div>
                              <div>provider rating: {item.autoSourceMetadata.providerRating || "-"}</div>
                              <div>provider tags: {item.autoSourceMetadata.providerTags.length > 0 ? item.autoSourceMetadata.providerTags.join(", ") : "-"}</div>
                              <div>provider pool: {item.autoSourceMetadata.providerCandidates.length > 0 ? item.autoSourceMetadata.providerCandidates.join(" -> ") : "-"}</div>
                              <div>trace: {item.autoSourceMetadata.selectionDetails.length > 0 ? item.autoSourceMetadata.selectionDetails.join(" | ") : "-"}</div>
                            </div>
                          ) : null}
                          <div className="studio-meme-gallery-actions">
                            <button type="button" className="btn-secondary" onClick={() => void handleSaveItem(item.id)} disabled={!enabled || savingId === item.id || deletingId === item.id}>
                              {savingId === item.id ? "저장 중..." : "메타 저장"}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => void handleCopyAutoMetadata(item.id)} disabled={!enabled || !hasAutoMetadata(item) || savingId === item.id || deletingId === item.id || copyingId === item.id}>
                              {copyingId === item.id ? "복사 중..." : "자동 -> 수동 복사"}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => void handleDeleteItem(item.id)} disabled={!enabled || savingId === item.id || deletingId === item.id}>
                              {deletingId === item.id ? "삭제 중..." : "삭제"}
                            </button>
                          </div>
                          <div className="studio-meme-gallery-links">
                            {item.sourcePageUrl ? (
                              <a href={item.sourcePageUrl} target="_blank" rel="noreferrer" className="btn-secondary studio-meme-link-btn">
                                원본 페이지
                              </a>
                            ) : null}
                            {item.sourceUrl ? (
                              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="btn-secondary studio-meme-link-btn">
                                source 링크
                              </a>
                            ) : null}
                            {item.storageUrl ? (
                              <a href={item.storageUrl} target="_blank" rel="noreferrer" className="btn-secondary studio-meme-link-btn">
                                storage 링크
                              </a>
                            ) : null}
                            {item.mediaUrl && item.mediaUrl !== item.imageUrl ? (
                              <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="btn-secondary studio-meme-link-btn">
                                media 링크
                              </a>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    </article>
                  );
                })}
                </div>
              </div>
            ) : (
              <div className="studio-meme-empty">
                <div className="studio-meme-empty-title">`studio_media_assets`에 표시할 자산이 없습니다.</div>
                <div>현재 슬라이드의 이미지/움짤을 먼저 저장하면 여기서 바로 재사용할 수 있습니다.</div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

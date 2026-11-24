"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchStudioMediaAssets,
  updateStudioMediaAsset,
  uploadStudioMediaAsset,
  type StudioMediaAssetItem,
} from "@/lib/api/studio-client";
import { isApiClientError } from "@/lib/ui/api-client";
import type { PreparedSlide, SlideMediaKind } from "@/types/studio-json";

type StudioSlideAssetPickerProps = {
  slide: PreparedSlide;
  slideIndex: number;
  onApplyAssetAction: (
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

const SUPPORTED_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/u, "").trim();
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
  return Array.from(new Set([...(item.tags || []), ...(item.emotionTags || [])])).slice(0, 5);
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

function renderAssetMedia(item: StudioMediaAssetItem) {
  if (item.mediaKind === "video" && item.mediaUrl) {
    return (
      <video
        src={item.mediaUrl}
        className="studio-meme-gallery-image studio-slide-asset-picker-media"
        muted
        loop
        playsInline
        autoPlay
      />
    );
  }
  return (
    <img
      src={item.imageUrl}
      alt={item.title || item.id}
      className="studio-meme-gallery-image studio-slide-asset-picker-media"
    />
  );
}

export function StudioSlideAssetPicker({
  slide,
  slideIndex,
  onApplyAssetAction,
}: StudioSlideAssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<StudioMediaAssetItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState("");

  const loadAssets = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStudioMediaAssets({ limit: 160 });
      setEnabled(data.enabled);
      setItems(data.items || []);
    } catch (nextError) {
      setError(isApiClientError(nextError) ? nextError.message : nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadAssets();
  }, [open]);

  const handleToggleFavorite = async (item: StudioMediaAssetItem) => {
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
    } catch (nextError) {
      setError(isApiClientError(nextError) ? nextError.message : nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setFavoriteUpdatingId("");
    }
  };

  const filteredItems = useMemo(() => {
    const queryTokens = searchText
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    return items.filter((item) => {
      if (queryTokens.length <= 0) return true;
      const corpus = [
        item.title || "",
        item.summary || "",
        ...(item.tags || []),
        ...(item.emotionTags || []),
        ...(item.queryHints || []),
        item.autoSourceMetadata?.providerQuery || "",
        item.autoSourceMetadata?.providerTitle || "",
        item.autoSourceMetadata?.providerSlug || "",
        ...(item.autoSourceMetadata?.providerTags || []),
      ]
        .join(" ")
        .toLowerCase();
      return queryTokens.every((token) => corpus.includes(token));
    });
  }, [items, searchText]);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (!SUPPORTED_UPLOAD_TYPES.has((file.type || "").toLowerCase())) {
      setError("PNG, JPG, WEBP, GIF, MP4, WEBM 파일만 업로드할 수 있습니다.");
      return;
    }
    setUploading(true);
    setStatus("");
    setError("");
    try {
      const queryHints = Array.from(
        new Set([
          slide.imageRequest?.query || "",
          ...(slide.imageRequest?.queryCandidates || []),
          slide.imageSelection?.selectedQuery || "",
        ].map((item) => item.trim()).filter(Boolean))
      ).slice(0, 16);
      const tags = tokenizeForTags([slide.title || "", slide.text || "", ...queryHints, stripExtension(file.name)]);
      const emotionTags =
        slide.imageSelection?.intent && slide.imageSelection.intent !== "fallback"
          ? [slide.imageSelection.intent]
          : [];
      const result = await uploadStudioMediaAsset({
        file,
        title: slide.title || stripExtension(file.name) || `슬라이드 ${slideIndex + 1} 업로드`,
        summary: slide.imageSelection?.selectionReason || slide.text || undefined,
        tags,
        emotionTags,
        queryHints,
        metadataOrigin: "manual",
      });
      onApplyAssetAction(slideIndex, {
        imageUrl: result.item.imageUrl,
        mediaUrl: result.item.mediaUrl,
        mediaKind: result.item.mediaKind,
        assetId: result.item.id,
        title: result.item.title,
      });
      setOpen(true);
      setStatus(`업로드 후 자산 저장 완료: ${result.item.title || result.item.id}`);
      await loadAssets();
    } catch (nextError) {
      setError(isApiClientError(nextError) ? nextError.message : nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="studio-slide-asset-picker">
      <div className="studio-slide-asset-picker-controls">
        <label className="studio-slide-asset-picker-upload-field">
          내 자산에 업로드
          <input
            className="input-field"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm"
            onChange={(event) => {
              void handleUpload(event.target.files?.[0] || null);
              event.currentTarget.value = "";
            }}
            disabled={uploading}
          />
        </label>
        <div className="studio-slide-asset-picker-toggle-row">
          <button
            className="btn-secondary studio-slide-asset-picker-toggle-btn"
            type="button"
            onClick={() => setOpen((current) => !current)}
            disabled={loading}
          >
            {open ? "내 자산 닫기" : "내 자산에서 가져오기"}
          </button>
        </div>
      </div>

      {status ? <div className="studio-meme-status">{status}</div> : null}
      {error ? <div className="studio-meme-status is-error">{error}</div> : null}

      {open ? (
        <div className="studio-slide-asset-picker-drawer">
          <div className="studio-slide-asset-picker-drawer-head">
            <div className="studio-slide-asset-picker-count">
              {enabled ? `저장 자산 ${filteredItems.length}개` : "DB 비활성"}
            </div>
            <button type="button" className="btn-secondary" onClick={() => void loadAssets()} disabled={loading}>
              {loading ? "불러오는 중..." : "새로고침"}
            </button>
          </div>
          <input
            className="input-field"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="제목, 태그, query hint 검색"
            disabled={!enabled}
          />

          {!enabled ? (
            <div className="studio-meme-empty">Supabase 저장 설정이 없어서 내 자산 갤러리를 열 수 없습니다.</div>
          ) : filteredItems.length > 0 ? (
            <div className="studio-meme-gallery-grid">
              {filteredItems.map((item) => {
                const visibleTags = getVisibleAssetTags(item);
                return (
                  <article key={item.id} className="studio-meme-gallery-tile">
                    <div className="studio-meme-gallery-media">
                      {renderAssetMedia(item)}
                      <span className="studio-meme-type-pill">
                        {item.mediaKind === "video" ? "VIDEO" : item.mediaKind === "animated_image" ? "GIF" : "IMG"}
                      </span>
                    </div>
                    <div className="studio-meme-gallery-body">
                      <div className="studio-meme-gallery-title-row">
                        <div className="studio-meme-gallery-title">{item.title || item.id}</div>
                        <button
                          type="button"
                          className={`studio-meme-favorite-toggle${item.isFavorite ? " is-active" : ""}`}
                          onClick={() => void handleToggleFavorite(item)}
                          disabled={!enabled || favoriteUpdatingId === item.id}
                          aria-pressed={item.isFavorite}
                        >
                          {favoriteUpdatingId === item.id ? "저장 중" : item.isFavorite ? "고정됨" : "즐겨찾기"}
                        </button>
                      </div>
                      <div className="studio-meme-gallery-meta">
                        {item.provider} · {isMotionKind(item.mediaKind) ? "움직임" : "정지"} · {formatDateTime(item.updatedAtMs)}
                      </div>
                      {item.summary ? <div className="studio-meme-gallery-summary">{item.summary}</div> : null}
                      <div className="studio-meme-gallery-tags">
                        {visibleTags.length > 0 ? (
                          visibleTags.map((tag) => <span key={`${item.id}-${tag}`}>{tag}</span>)
                        ) : (
                          <span>태그 없음</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() =>
                          onApplyAssetAction(slideIndex, {
                            imageUrl: item.imageUrl,
                            mediaUrl: item.mediaUrl,
                            mediaKind: item.mediaKind,
                            assetId: item.id,
                            title: item.title,
                          })
                        }
                      >
                        이 자산 사용
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="studio-meme-empty">
              저장된 자산이 없습니다. 위에서 파일을 업로드하거나, prepare 이후 자동 저장된 크롤링 결과를 새로고침으로 불러오세요.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

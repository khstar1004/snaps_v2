"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchStudioMediaAssets, updateStudioMediaAsset, type StudioMediaAssetItem } from "@/lib/api/studio-client";
import { isApiClientError } from "@/lib/ui/api-client";
import type { StudioPreselectedMediaApplyMode, StudioPreselectedMediaItem } from "../types";

type StudioPreselectedMediaPanelProps = {
  items: StudioPreselectedMediaItem[];
  applyMode: StudioPreselectedMediaApplyMode;
  sourceSlideCount: number;
  assignmentPreview: Array<{ itemId: string; slideIndex: number }>;
  validationMessage?: string;
  disabled?: boolean;
  onApplyModeChangeAction: (value: StudioPreselectedMediaApplyMode) => void;
  onAppendItemsAction: (items: StudioPreselectedMediaItem[]) => void;
  onRemoveItemAction: (id: string) => void;
  onTargetSlideChangeAction: (id: string, targetSlideIndex: number | null) => void;
  onMoveItemAction: (id: string, direction: -1 | 1) => void;
  onReorderItemAction: (id: string, toIndex: number) => void;
  onClearItemsAction: () => void;
};

const SESSION_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/u, "").trim();
}

function toErrorMessage(error: unknown): string {
  return isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function isMotionKind(value?: StudioMediaAssetItem["mediaKind"] | StudioPreselectedMediaItem["mediaKind"]): boolean {
  return value === "video" || value === "animated_image";
}

function getVisibleAssetTags(item: StudioMediaAssetItem): string[] {
  return Array.from(new Set([...(item.tags || []), ...(item.emotionTags || [])])).slice(0, 5);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.trim()) {
        reject(new Error("파일을 읽지 못했습니다."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function renderSelectedMedia(item: StudioPreselectedMediaItem) {
  if (item.mediaKind === "video" && item.mediaUrl) {
    return <video src={item.mediaUrl} className="studio-slide-asset-picker-preselect-preview-media" muted loop playsInline autoPlay />;
  }
  return <img src={item.imageUrl} alt={item.title} className="studio-slide-asset-picker-preselect-preview-media" />;
}

function renderLibraryMedia(item: StudioMediaAssetItem) {
  if (item.mediaKind === "video" && item.mediaUrl) {
    return <video src={item.mediaUrl} className="studio-meme-gallery-image studio-slide-asset-picker-media" muted loop playsInline autoPlay />;
  }
  return <img src={item.imageUrl} alt={item.title || item.id} className="studio-meme-gallery-image studio-slide-asset-picker-media" />;
}

export function StudioPreselectedMediaPanel({
  items,
  applyMode,
  sourceSlideCount,
  assignmentPreview,
  validationMessage,
  disabled = false,
  onApplyModeChangeAction,
  onAppendItemsAction,
  onRemoveItemAction,
  onTargetSlideChangeAction,
  onMoveItemAction,
  onReorderItemAction,
  onClearItemsAction,
}: StudioPreselectedMediaPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "motion">("all");
  const [libraryEnabled, setLibraryEnabled] = useState(false);
  const [libraryItems, setLibraryItems] = useState<StudioMediaAssetItem[]>([]);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState("");

  const assignmentMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const assignment of assignmentPreview) {
      map.set(assignment.itemId, [...(map.get(assignment.itemId) || []), assignment.slideIndex]);
    }
    return map;
  }, [assignmentPreview]);

  const selectedLibraryKeys = useMemo(
    () => new Set(items.filter((item) => item.source === "library").map((item) => item.assetId || item.id)),
    [items]
  );

  const filteredLibraryItems = useMemo(() => {
    const queryTokens = searchText
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    return libraryItems.filter((item) => {
      if (mediaFilter === "image" && item.mediaKind && item.mediaKind !== "image") return false;
      if (mediaFilter === "motion" && !isMotionKind(item.mediaKind)) return false;
      if (queryTokens.length <= 0) return true;
      const corpus = [
        item.title || "",
        item.summary || "",
        item.folderPath || "",
        ...(item.tags || []),
        ...(item.emotionTags || []),
        ...(item.queryHints || []),
      ]
        .join(" ")
        .toLowerCase();
      return queryTokens.every((token) => corpus.includes(token));
    });
  }, [libraryItems, mediaFilter, searchText]);

  useEffect(() => {
    if (!drawerOpen) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchStudioMediaAssets({ limit: 180 });
        if (cancelled) return;
        setLibraryEnabled(data.enabled);
        setLibraryItems(data.items || []);
      } catch (nextError) {
        if (!cancelled) {
          setError(toErrorMessage(nextError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen]);

  const handleToggleFavorite = async (item: StudioMediaAssetItem) => {
    setFavoriteUpdatingId(item.id);
    setError("");
    setStatus("");
    try {
      const updated = await updateStudioMediaAsset({
        id: item.id,
        isFavorite: !item.isFavorite,
      });
      setLibraryItems((current) => current.map((entry) => (entry.id === updated.item.id ? updated.item : entry)));
      setStatus(`${item.title || item.id} 자산을 ${item.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}했습니다.`);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setFavoriteUpdatingId("");
    }
  };

  const handleSessionUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length <= 0) return;
    setError("");
    setStatus("");
    const files = Array.from(fileList);
    const invalid = files.find((file) => !SESSION_UPLOAD_TYPES.has((file.type || "").toLowerCase()));
    if (invalid) {
      setError("이번 제작용 임시 업로드는 PNG, JPG, WEBP, GIF만 지원합니다.");
      return;
    }
    try {
      const createdAtMs = Date.now();
      const payload = await Promise.all(
        files.map(async (file, index) => {
          const imageUrl = await readFileAsDataUrl(file);
          return {
            id: `session:${createdAtMs}:${index}:${file.name}`.replace(/\s+/g, "_"),
            source: "session-upload" as const,
            title: stripExtension(file.name) || `임시 사진 ${index + 1}`,
            imageUrl,
            mediaUrl: undefined,
            mediaKind: file.type.toLowerCase() === "image/gif" ? "animated_image" : "image",
            createdAtMs,
          } satisfies StudioPreselectedMediaItem;
        })
      );
      onAppendItemsAction(payload);
      setStatus(`${payload.length}개 파일을 이번 제작용 미디어로 추가했습니다.`);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  };

  const handleLibrarySelect = (item: StudioMediaAssetItem) => {
    onAppendItemsAction([
      {
        id: `library:${item.id}`,
        source: "library",
        title: item.title || item.id,
        imageUrl: item.imageUrl,
        mediaUrl: item.mediaUrl,
        mediaKind: item.mediaKind,
        assetId: item.id,
        summary: item.summary || undefined,
        folderPath: item.folderPath || undefined,
        createdAtMs: Date.now(),
      },
    ]);
    setStatus(`${item.title || item.id} 자산을 미리 선택 목록에 추가했습니다.`);
  };

  return (
    <div className="studio-slide-asset-picker-preselect-shell">
      <div className="studio-slide-asset-picker-preselect-head">
        <div className="studio-slide-asset-picker-preselect-copy">
          <div className="studio-slide-asset-picker-preselect-title">미디어 미리 선택</div>
          <div className="studio-slide-asset-picker-preselect-description">
            선택한 사진과 저장 자산은 prepare 전에 슬라이드에 강제로 배치됩니다. 카드별로 특정 슬라이드에 고정할 수 있고, 고정하지 않은 항목은 {applyMode === "cycle-all" ? "남은 슬라이드에 순환 적용합니다." : "남은 슬라이드에 한 번씩 분산 적용합니다."} 이번 제작용 임시 업로드는 자산함에 저장되지 않고 현재 작업 세션에서만 유지됩니다.
          </div>
        </div>
        {items.length > 0 ? (
          <button type="button" className="btn-secondary" onClick={onClearItemsAction} disabled={disabled}>
            전체 비우기
          </button>
        ) : null}
      </div>

      <div className="studio-slide-asset-picker-preselect-pill-row">
        <span className="studio-slide-asset-picker-preselect-pill">선택 {items.length}개</span>
        <span className="studio-slide-asset-picker-preselect-pill">
          {sourceSlideCount > 0 ? `JSON 슬라이드 ${sourceSlideCount}개` : "JSON 슬라이드 계산 전"}
        </span>
        <span className="studio-slide-asset-picker-preselect-pill">
          {applyMode === "cycle-all" ? "전체 순환 적용" : "한 번씩 분산 적용"}
        </span>
        <span className="studio-slide-asset-picker-preselect-pill">강제 배치 {assignmentPreview.length}개</span>
      </div>

      <div className="studio-slide-asset-picker-preselect-tab-row">
        <button
          type="button"
          className={`studio-meme-tab${applyMode === "spread" ? " is-active" : ""}`}
          onClick={() => onApplyModeChangeAction("spread")}
          disabled={disabled}
        >
          한 번씩 분산
        </button>
        <button
          type="button"
          className={`studio-meme-tab${applyMode === "cycle-all" ? " is-active" : ""}`}
          onClick={() => onApplyModeChangeAction("cycle-all")}
          disabled={disabled}
        >
          전체 순환 적용
        </button>
      </div>

      {validationMessage ? <div className="warn studio-slide-asset-picker-preselect-alert">{validationMessage}</div> : null}
      {status ? <div className="studio-meme-status">{status}</div> : null}
      {error ? <div className="studio-meme-status is-error">{error}</div> : null}

      <div className="studio-slide-asset-picker-controls">
        <label className="studio-slide-asset-picker-upload-field">
          이번 제작용 사진 추가
          <input
            className="input-field"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            multiple
            onChange={(event) => {
              void handleSessionUpload(event.target.files);
              event.currentTarget.value = "";
            }}
            disabled={disabled}
          />
        </label>
        <div className="studio-slide-asset-picker-toggle-row">
          <button
            type="button"
            className="btn-secondary studio-slide-asset-picker-toggle-btn"
            onClick={() => setDrawerOpen((current) => !current)}
            disabled={disabled || loading}
          >
            {drawerOpen ? "저장 자산 닫기" : "자산함에서 가져오기"}
          </button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="studio-slide-asset-picker-preselect-grid">
          {items.map((item, index) => {
            const mappedSlideIndexes = assignmentMap.get(item.id) || [];
            const assignmentLabel =
              mappedSlideIndexes.length <= 0
                ? sourceSlideCount > 0
                  ? "현재 배치 대기"
                  : "JSON 변환 후 적용 위치를 계산합니다."
                : mappedSlideIndexes.length <= 4
                  ? `예상 적용: ${mappedSlideIndexes.map((slideIndex) => `${slideIndex + 1}번`).join(", ")} 슬라이드`
                  : `예상 적용: ${mappedSlideIndexes
                      .slice(0, 4)
                      .map((slideIndex) => `${slideIndex + 1}번`)
                      .join(", ")} 외 ${mappedSlideIndexes.length - 4}곳`;
            return (
              <article
                key={item.id}
                className={`studio-slide-asset-picker-preselect-card${draggingItemId === item.id ? " is-dragging" : ""}${dragOverItemId === item.id ? " is-drag-over" : ""}`}
                draggable={!disabled}
                onDragStart={(event) => {
                  if (disabled) return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                  setDraggingItemId(item.id);
                  setDragOverItemId(item.id);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!draggingItemId || draggingItemId === item.id) return;
                  setDragOverItemId(item.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!draggingItemId || draggingItemId === item.id) return;
                  event.dataTransfer.dropEffect = "move";
                  if (dragOverItemId !== item.id) {
                    setDragOverItemId(item.id);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = draggingItemId || event.dataTransfer.getData("text/plain");
                  if (!draggedId || draggedId === item.id) {
                    setDraggingItemId(null);
                    setDragOverItemId(null);
                    return;
                  }
                  onReorderItemAction(draggedId, index);
                  setDraggingItemId(null);
                  setDragOverItemId(null);
                }}
                onDragEnd={() => {
                  setDraggingItemId(null);
                  setDragOverItemId(null);
                }}
              >
                <div className="studio-slide-asset-picker-preselect-preview">{renderSelectedMedia(item)}</div>
                <div className="studio-slide-asset-picker-preselect-card-body">
                  <div className="studio-slide-asset-picker-preselect-card-top">
                    <div>
                      <div className="studio-slide-asset-picker-preselect-card-title">{item.title}</div>
                      <div className="studio-slide-asset-picker-preselect-card-meta">
                        {item.source === "library" ? "저장 자산" : "이번 제작용"} · {isMotionKind(item.mediaKind) ? "움직임" : "정지"} · {formatDateTime(item.createdAtMs)}
                      </div>
                    </div>
                    <div className="studio-slide-asset-picker-preselect-card-top-side">
                      <span className="studio-slide-asset-picker-preselect-order-pill">#{index + 1}</span>
                      <span className="studio-slide-asset-picker-preselect-drag-handle">드래그 정렬</span>
                    </div>
                  </div>
                  {item.summary ? <div className="studio-slide-asset-picker-preselect-card-summary">{item.summary}</div> : null}
                  {item.folderPath ? <div className="studio-slide-asset-picker-preselect-card-folder">{item.folderPath}</div> : null}
                  <label className="studio-slide-asset-picker-preselect-card-field">
                    <span className="studio-slide-asset-picker-preselect-card-field-label">적용 위치</span>
                    <select
                      className="input-field"
                      value={Number.isFinite(item.targetSlideIndex) ? String(item.targetSlideIndex) : "auto"}
                      onChange={(event) =>
                        onTargetSlideChangeAction(
                          item.id,
                          event.target.value === "auto" ? null : Number(event.target.value)
                        )
                      }
                      disabled={disabled || sourceSlideCount <= 0}
                    >
                      <option value="auto">자동 배치</option>
                      {Array.from({ length: sourceSlideCount }, (_, slideIndex) => (
                        <option key={`${item.id}:slide:${slideIndex}`} value={String(slideIndex)}>
                          {`${slideIndex + 1}번 슬라이드에 고정`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="studio-slide-asset-picker-preselect-card-assignment">
                    {assignmentLabel}
                  </div>
                  <div className="studio-slide-asset-picker-preselect-card-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onMoveItemAction(item.id, -1)}
                      disabled={disabled || index === 0}
                    >
                      앞으로
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onMoveItemAction(item.id, 1)}
                      disabled={disabled || index === items.length - 1}
                    >
                      뒤로
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onRemoveItemAction(item.id)} disabled={disabled}>
                      제거
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="studio-slide-asset-picker-preselect-empty">
          저장 자산을 고르거나 이번 제작용 사진을 올리면, prepare 때 일부 슬라이드에 자동 배치해 반드시 사용합니다.
        </div>
      )}

      {drawerOpen ? (
        <div className="studio-slide-asset-picker-drawer">
          <div className="studio-slide-asset-picker-drawer-head">
            <div className="studio-slide-asset-picker-count">
              {libraryEnabled ? `저장 자산 ${filteredLibraryItems.length}개` : "DB 비활성"}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDrawerOpen(false)}
              disabled={disabled}
            >
              닫기
            </button>
          </div>
          <div className="studio-slide-asset-picker-preselect-filter-row">
            <input
              className="input-field"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="제목, 폴더, 태그 검색"
              disabled={!libraryEnabled}
            />
            <div className="studio-slide-asset-picker-preselect-tab-row">
              {[
                { key: "all", label: "전체" },
                { key: "image", label: "사진" },
                { key: "motion", label: "움직임" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`studio-meme-tab${mediaFilter === option.key ? " is-active" : ""}`}
                  onClick={() => setMediaFilter(option.key as typeof mediaFilter)}
                  disabled={!libraryEnabled}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {!libraryEnabled ? (
            <div className="studio-meme-empty">Supabase 저장 설정이 없어서 자산함을 불러올 수 없습니다.</div>
          ) : filteredLibraryItems.length > 0 ? (
            <div className="studio-meme-gallery-grid">
              {filteredLibraryItems.map((item) => {
                const visibleTags = getVisibleAssetTags(item);
                const alreadySelected = selectedLibraryKeys.has(item.id);
                return (
                  <article key={item.id} className="studio-meme-gallery-tile">
                    <div className="studio-meme-gallery-media">
                      {renderLibraryMedia(item)}
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
                          disabled={!libraryEnabled || favoriteUpdatingId === item.id}
                          aria-pressed={item.isFavorite}
                        >
                          {favoriteUpdatingId === item.id ? "저장 중" : item.isFavorite ? "고정됨" : "즐겨찾기"}
                        </button>
                      </div>
                      <div className="studio-meme-gallery-meta">
                        {item.folderPath || item.provider} · {isMotionKind(item.mediaKind) ? "움직임" : "정지"}
                      </div>
                      {item.summary ? <div className="studio-meme-gallery-summary">{item.summary}</div> : null}
                      <div className="studio-meme-gallery-tags">
                        {visibleTags.length > 0 ? visibleTags.map((tag) => <span key={`${item.id}-${tag}`}>{tag}</span>) : <span>태그 없음</span>}
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleLibrarySelect(item)}
                        disabled={disabled || alreadySelected}
                      >
                        {alreadySelected ? "선택됨" : "미리 선택에 추가"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="studio-meme-empty">검색 조건에 맞는 저장 자산이 없습니다.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

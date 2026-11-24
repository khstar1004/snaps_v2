"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createStudioMediaFolder,
  createStudioMediaAsset,
  deleteStudioMediaAsset,
  fetchStudioMediaAssets,
  updateStudioMediaAsset,
  uploadStudioMediaAsset,
  type StudioMediaAssetItem,
} from "@/lib/api/studio-client";
import { isApiClientError } from "@/lib/ui/api-client";

type DraftState = {
  title: string;
  summary: string;
  folderPath: string;
  tagsText: string;
  emotionTagsText: string;
  queryHintsText: string;
};

type UploadBatchItemDraft = {
  id: string;
  file: File;
  title: string;
  summary: string;
  folderPath: string;
  tagsText: string;
  emotionTagsText: string;
  queryHintsText: string;
};

type ExternalBatchItemDraft = {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourcePageUrl: string;
  folderPath: string;
  mediaKind: "image" | "animated_image" | "video";
  tagsText: string;
  emotionTagsText: string;
  queryHintsText: string;
};

type MetadataOriginMode = "manual" | "auto" | "mixed" | "empty";
type ImportDialogMode = "upload" | "external" | null;

const SUPPORTED_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);
const COMMON_TAG_TIPS = ["웃긴", "리액션", "짤", "움짤", "이쁜", "감성", "인물", "풍경", "고양이", "강아지"];
const COMMON_EMOTION_TAG_TIPS = ["surprised", "laugh", "sad", "angry", "awkward", "confused", "scared"];

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

function mergeCsvValue(value: string, nextValue: string): string {
  return toCsv([...parseCsv(value), nextValue]);
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/u, "").trim();
}

function formatFileSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  if (value >= 1024) return `${Math.round(value / 1024)}KB`;
  return `${value}B`;
}

function createDraftId(prefix: string, value: string, index: number): string {
  return `${prefix}:${Date.now()}:${index}:${value}`.replace(/\s+/g, "_");
}

function inferMediaKindFromSourceUrl(value: string): ExternalBatchItemDraft["mediaKind"] {
  const safe = value.trim().toLowerCase();
  if (safe.endsWith(".gif") || safe.includes(".gif?")) return "animated_image";
  if (safe.endsWith(".mp4") || safe.endsWith(".webm") || safe.includes(".mp4?") || safe.includes(".webm?")) return "video";
  return "image";
}

function createUploadBatchItem(file: File, folderPath: string, index: number): UploadBatchItemDraft {
  return {
    id: createDraftId("upload", file.name, index),
    file,
    title: stripExtension(file.name) || `파일 ${index + 1}`,
    summary: "",
    folderPath,
    tagsText: "",
    emotionTagsText: "",
    queryHintsText: "",
  };
}

function createExternalBatchItem(sourceUrl: string, folderPath: string, index: number): ExternalBatchItemDraft {
  const safeUrl = sourceUrl.trim();
  const fileName = safeUrl.split("/").pop()?.split("?")[0]?.trim() || `링크 ${index + 1}`;
  return {
    id: createDraftId("external", safeUrl, index),
    title: stripExtension(fileName) || `링크 ${index + 1}`,
    summary: "",
    sourceUrl: safeUrl,
    sourcePageUrl: "",
    folderPath,
    mediaKind: inferMediaKindFromSourceUrl(safeUrl),
    tagsText: "",
    emotionTagsText: "",
    queryHintsText: "",
  };
}

function TagTipsInput(input: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions: string[];
}) {
  const [pending, setPending] = useState("");
  const values = parseCsv(input.value);

  const commitPending = () => {
    const nextValue = pending.trim();
    if (!nextValue) return;
    input.onChange(mergeCsvValue(input.value, nextValue));
    setPending("");
  };

  const handleRemove = (target: string) => {
    input.onChange(toCsv(values.filter((value) => value !== target)));
  };

  const handleSuggestion = (target: string) => {
    if (values.includes(target)) {
      handleRemove(target);
      return;
    }
    input.onChange(mergeCsvValue(input.value, target));
  };

  return (
    <div className="assets-tag-tips-field">
      <div className="assets-tag-tips-label">{input.label}</div>
      <div className="assets-tag-tips-shell">
        {values.length > 0 ? (
          <div className="assets-tag-tips-selected">
            {values.map((value) => (
              <button key={value} type="button" className="assets-tag-chip is-selected" onClick={() => handleRemove(value)}>
                {value}
              </button>
            ))}
          </div>
        ) : null}
        <input
          className="input-field"
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onBlur={commitPending}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commitPending();
            }
          }}
          placeholder={input.placeholder}
        />
        <div className="assets-tag-tips-list">
          {input.suggestions.map((value) => (
            <button
              key={value}
              type="button"
              className={`assets-tag-chip ${values.includes(value) ? "is-selected" : ""}`}
              onClick={() => handleSuggestion(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function toDraft(item: StudioMediaAssetItem): DraftState {
  return {
    title: item.title || "",
    summary: item.summary || "",
    folderPath: item.folderPath || "",
    tagsText: toCsv(item.manualTags || []),
    emotionTagsText: toCsv(item.manualEmotionTags || []),
    queryHintsText: toCsv(item.manualQueryHints || []),
  };
}

function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function isMotionKind(value?: StudioMediaAssetItem["mediaKind"]): boolean {
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

function getMetadataOriginBadge(mode: MetadataOriginMode): { label: string; background: string; color: string } {
  if (mode === "mixed") return { label: "MIXED", background: "#DBEAFE", color: "#1D4ED8" };
  if (mode === "auto") return { label: "AUTO", background: "#ECFCCB", color: "#3F6212" };
  if (mode === "manual") return { label: "MANUAL", background: "#E2E8F0", color: "#334155" };
  return { label: "EMPTY", background: "#F1F5F9", color: "#64748B" };
}

function renderAssetMedia(item: StudioMediaAssetItem) {
  if (item.mediaKind === "video" && item.mediaUrl) {
    return <video src={item.mediaUrl} className="studio-meme-gallery-image" style={{ aspectRatio: "4 / 3" }} muted loop playsInline autoPlay />;
  }
  return (
    <img
      src={item.mediaKind === "animated_image" ? item.mediaUrl || item.imageUrl : item.imageUrl}
      alt={item.title || item.id}
      className="studio-meme-gallery-image"
      style={{ aspectRatio: "4 / 3" }}
    />
  );
}

function renderBatchPreview(input: {
  mediaKind: "image" | "animated_image" | "video";
  previewUrl?: string;
  title: string;
}) {
  if (!input.previewUrl) {
    return <div className="assets-import-preview-empty">미리보기 없음</div>;
  }
  if (input.mediaKind === "video") {
    return <video src={input.previewUrl} className="assets-import-preview-media" muted loop playsInline autoPlay />;
  }
  return <img src={input.previewUrl} alt={input.title} className="assets-import-preview-media" />;
}

function toErrorMessage(error: unknown): string {
  return isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error);
}

function sortFolderPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter((item) => item.trim())))
    .sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right, "ko"));
}

type FolderNode = {
  path: string;
  label: string;
  depth: number;
  count: number;
};

function getFolderDepth(path: string): number {
  return Math.max(0, path.split("/").filter(Boolean).length - 1);
}

function getFolderLabel(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
}

function isFolderMatch(targetFolderPath: string, selectedFolderPath: string): boolean {
  const target = targetFolderPath.trim();
  const selected = selectedFolderPath.trim();
  if (!selected || selected === "all") return true;
  return target === selected || target.startsWith(`${selected}/`);
}

function buildFolderNodes(folderPaths: string[], items: StudioMediaAssetItem[]): FolderNode[] {
  const sortedPaths = sortFolderPaths(folderPaths);
  const counts = Object.fromEntries(sortedPaths.map((path) => [path, 0]));
  for (const item of items) {
    const itemFolderPath = (item.folderPath || "").trim();
    if (!itemFolderPath) continue;
    for (const folderPath of sortedPaths) {
      if (isFolderMatch(itemFolderPath, folderPath)) {
        counts[folderPath] = (counts[folderPath] || 0) + 1;
      }
    }
  }
  return sortedPaths.map((path) => ({
    path,
    label: getFolderLabel(path),
    depth: getFolderDepth(path),
    count: counts[path] || 0,
  }));
}

function buildNestedFolderPath(parentFolderPath: string, folderName: string): string {
  const safeName = folderName
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
  if (!safeName) return "";
  const safeParent = parentFolderPath.trim() === "all" ? "" : parentFolderPath.trim();
  return safeParent ? `${safeParent}/${safeName}` : safeName;
}

export function StudioMediaAssetsManager() {
  const folderDatalistId = "studio-media-folder-options";
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingExternal, setCreatingExternal] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<StudioMediaAssetItem[]>([]);
  const [stillCount, setStillCount] = useState(0);
  const [motionCount, setMotionCount] = useState(0);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "motion">("all");
  const [metadataFilter, setMetadataFilter] = useState<"all" | "manual" | "auto" | "mixed">("all");
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedAssetId, setFocusedAssetId] = useState("");
  const [showDetailPreview, setShowDetailPreview] = useState(true);
  const [batchFolderPath, setBatchFolderPath] = useState("");
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showFolderComposer, setShowFolderComposer] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("사진");
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [importDialogMode, setImportDialogMode] = useState<ImportDialogMode>(null);
  const [uploadBatchFolderPath, setUploadBatchFolderPath] = useState("");
  const [uploadBatchItems, setUploadBatchItems] = useState<UploadBatchItemDraft[]>([]);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState<Record<string, string>>({});
  const [externalBatchFolderPath, setExternalBatchFolderPath] = useState("");
  const [externalLinksText, setExternalLinksText] = useState("");
  const [externalBatchItems, setExternalBatchItems] = useState<ExternalBatchItemDraft[]>([]);
  const [copyingId, setCopyingId] = useState("");
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState("");

  const loadAssets = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStudioMediaAssets({ limit: 200 });
      setEnabled(data.enabled);
      setItems(data.items || []);
      setStillCount(data.stats?.stillCount || 0);
      setMotionCount(data.stats?.motionCount || 0);
      setFolderCounts(data.stats?.folderCounts || {});
      setFolderPaths(data.stats?.folderPaths || []);
      setDrafts(Object.fromEntries((data.items || []).map((item) => [item.id, toDraft(item)])));
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssets();
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const folderOptions = useMemo(() => {
    return sortFolderPaths([
      ...folderPaths,
      ...Object.keys(folderCounts),
      ...items.map((item) => item.folderPath || ""),
    ]);
  }, [folderCounts, folderPaths, items]);

  useEffect(() => {
    if (selectedFolder === "all") return;
    if (!folderOptions.includes(selectedFolder)) {
      setSelectedFolder("all");
    }
  }, [folderOptions, selectedFolder]);

  useEffect(() => {
    if (selectedFolder !== "all") {
      setNewFolderParent(selectedFolder);
      setBatchFolderPath(selectedFolder);
      setUploadBatchFolderPath((current) => current || selectedFolder);
      setExternalBatchFolderPath((current) => current || selectedFolder);
    }
  }, [selectedFolder]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
    if (focusedAssetId && !items.some((item) => item.id === focusedAssetId)) {
      setFocusedAssetId("");
    }
  }, [focusedAssetId, items]);

  useEffect(() => {
    const nextEntries = uploadBatchItems.map((item) => [item.id, URL.createObjectURL(item.file)] as const);
    setUploadPreviewUrls(Object.fromEntries(nextEntries));
    return () => {
      nextEntries.forEach(([, url]) => URL.revokeObjectURL(url));
    };
  }, [uploadBatchItems]);

  const filteredItems = useMemo(() => {
    const queryTokens = searchText
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    return items.filter((item) => {
      if (selectedFolder !== "all" && !isFolderMatch(item.folderPath || "", selectedFolder)) return false;
      if (mediaFilter === "image" && item.mediaKind && item.mediaKind !== "image") return false;
      if (mediaFilter === "motion" && !isMotionKind(item.mediaKind)) return false;
      if (metadataFilter !== "all" && resolveMetadataOriginMode(item) !== metadataFilter) return false;
      if (queryTokens.length <= 0) return true;
      const corpus = [
        item.title || "",
        item.summary || "",
        item.folderPath || "",
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
  }, [items, mediaFilter, metadataFilter, searchText, selectedFolder]);

  const folderNodes = useMemo(() => buildFolderNodes(folderOptions, items), [folderOptions, items]);
  const selectedFolderNode = useMemo(
    () => folderNodes.find((folder) => folder.path === selectedFolder) || null,
    [folderNodes, selectedFolder]
  );
  const focusedItem = useMemo(
    () => items.find((item) => item.id === focusedAssetId) || null,
    [focusedAssetId, items]
  );

  const previewItems = useMemo(() => items.slice(0, 4), [items]);

  const handleDraftChange = (id: string, patch: Partial<DraftState>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {
          title: "",
          summary: "",
          folderPath: "",
          tagsText: "",
          emotionTagsText: "",
          queryHintsText: "",
        }),
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
        folderPath: draft.folderPath,
        tags: parseCsv(draft.tagsText),
        emotionTags: parseCsv(draft.emotionTagsText),
        queryHints: parseCsv(draft.queryHintsText),
      });
      setStatus(`저장 완료: ${draft.title.trim() || id}`);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setSavingId("");
    }
  };

  const handleDeleteItem = async (id: string) => {
    const target = items.find((item) => item.id === id);
    const confirmed = window.confirm(`"${target?.title || id}" 자산을 삭제할까요?`);
    if (!confirmed) return;
    setDeletingId(id);
    setStatus("");
    setError("");
    try {
      await deleteStudioMediaAsset(id);
      setStatus(`삭제 완료: ${target?.title || id}`);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
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
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setCopyingId("");
    }
  };

  const handleToggleFavorite = async (item: StudioMediaAssetItem) => {
    setFavoriteUpdatingId(item.id);
    setStatus("");
    setError("");
    try {
      await updateStudioMediaAsset({
        id: item.id,
        isFavorite: !item.isFavorite,
      });
      setStatus(`${item.title || item.id} 자산을 ${item.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}했습니다.`);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setFavoriteUpdatingId("");
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((current) => {
      if (current) {
        setSelectedIds([]);
      } else {
        setFocusedAssetId("");
      }
      return !current;
    });
  };

  const toggleItemSelection = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const handleCardOpen = (id: string) => {
    if (selectionMode) {
      toggleItemSelection(id);
      return;
    }
    setFocusedAssetId(id);
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(filteredItems.map((item) => item.id));
    setSelectionMode(true);
    setFocusedAssetId("");
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleOpenFolderComposer = (parentFolderPath?: string) => {
    const nextParentFolderPath =
      typeof parentFolderPath === "string"
        ? parentFolderPath
        : selectedFolder !== "all"
          ? selectedFolder
          : newFolderParent;
    setNewFolderParent(nextParentFolderPath === "all" ? "" : nextParentFolderPath);
    setShowFolderComposer(true);
  };

  const handleBatchMove = async () => {
    const nextFolderPath = batchFolderPath.trim();
    if (selectedIds.length <= 0) {
      setError("먼저 선택할 자산을 골라 주세요.");
      return;
    }
    if (!nextFolderPath) {
      setError("이동할 폴더 경로를 입력해 주세요.");
      return;
    }
    setBatchMoving(true);
    setStatus("");
    setError("");
    try {
      await Promise.all(
        selectedIds.map((id) =>
          updateStudioMediaAsset({
            id,
            folderPath: nextFolderPath,
          })
        )
      );
      setStatus(`${selectedIds.length}개 자산을 ${nextFolderPath} 폴더로 이동했습니다.`);
      setSelectedFolder(nextFolderPath);
      setSelectedIds([]);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setBatchMoving(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length <= 0) {
      setError("먼저 선택할 자산을 골라 주세요.");
      return;
    }
    const confirmed = window.confirm(`선택한 ${selectedIds.length}개 자산을 삭제할까요?`);
    if (!confirmed) return;
    setBatchDeleting(true);
    setStatus("");
    setError("");
    try {
      await Promise.all(selectedIds.map((id) => deleteStudioMediaAsset(id)));
      setStatus(`${selectedIds.length}개 자산을 삭제했습니다.`);
      setSelectedIds([]);
      setFocusedAssetId("");
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleCreateFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFolderPath = buildNestedFolderPath(newFolderParent, newFolderName);
    if (!nextFolderPath) {
      setError("새 폴더 이름을 입력해 주세요.");
      return;
    }
    setCreatingFolder(true);
    setStatus("");
    setError("");
    try {
      const result = await createStudioMediaFolder(nextFolderPath);
      setStatus(`폴더를 만들었습니다: ${result.folderPath}`);
      setNewFolderName("");
      setShowFolderComposer(false);
      setSelectedFolder(result.folderPath);
      setBatchFolderPath(result.folderPath);
      setUploadBatchFolderPath(result.folderPath);
      setExternalBatchFolderPath(result.folderPath);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleOpenUploadDialog = () => {
    setImportDialogMode("upload");
    setUploadBatchFolderPath(selectedFolder !== "all" ? selectedFolder : "");
    setUploadBatchItems([]);
  };

  const handleOpenExternalDialog = () => {
    setImportDialogMode("external");
    setExternalBatchFolderPath(selectedFolder !== "all" ? selectedFolder : "");
    setExternalLinksText("");
    setExternalBatchItems([]);
  };

  const handleCloseImportDialog = () => {
    setImportDialogMode(null);
  };

  const handleUploadBatchFolderChange = (value: string) => {
    setUploadBatchFolderPath(value);
    setUploadBatchItems((current) => current.map((item) => ({ ...item, folderPath: value })));
  };

  const handleExternalBatchFolderChange = (value: string) => {
    setExternalBatchFolderPath(value);
    setExternalBatchItems((current) => current.map((item) => ({ ...item, folderPath: value })));
  };

  const handleUploadBatchFiles = (files: FileList | null) => {
    if (!files || files.length <= 0) return;
    const safeFolderPath = uploadBatchFolderPath.trim();
    const nextItems: UploadBatchItemDraft[] = [];
    const rejectedFiles: string[] = [];
    Array.from(files).forEach((file, index) => {
      if (!SUPPORTED_UPLOAD_TYPES.has((file.type || "").toLowerCase())) {
        rejectedFiles.push(file.name);
        return;
      }
      nextItems.push(createUploadBatchItem(file, safeFolderPath, index));
    });
    if (nextItems.length > 0) {
      setUploadBatchItems((current) => [
        ...current,
        ...nextItems.filter(
          (nextItem) =>
            !current.some(
              (currentItem) =>
                currentItem.file.name === nextItem.file.name &&
                currentItem.file.size === nextItem.file.size &&
                currentItem.file.lastModified === nextItem.file.lastModified
            )
        ),
      ]);
    }
    if (rejectedFiles.length > 0) {
      setError(`지원하지 않는 파일 형식은 제외했습니다: ${rejectedFiles.join(", ")}`);
    }
  };

  const handleBuildExternalBatch = () => {
    const urls = Array.from(
      new Set(
        externalLinksText
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    if (urls.length <= 0) {
      setError("링크를 한 줄에 하나씩 입력해 주세요.");
      return;
    }
    setExternalBatchItems(urls.map((url, index) => createExternalBatchItem(url, externalBatchFolderPath.trim(), index)));
    setError("");
  };

  const handleUploadBatchItemChange = (id: string, patch: Partial<UploadBatchItemDraft>) => {
    setUploadBatchItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleExternalBatchItemChange = (id: string, patch: Partial<ExternalBatchItemDraft>) => {
    setExternalBatchItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleRemoveUploadBatchItem = (id: string) => {
    setUploadBatchItems((current) => current.filter((item) => item.id !== id));
  };

  const handleRemoveExternalBatchItem = (id: string) => {
    setExternalBatchItems((current) => current.filter((item) => item.id !== id));
  };

  const handleUploadBatchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enabled) {
      setError("Supabase 저장 설정이 없어 업로드를 진행할 수 없습니다.");
      return;
    }
    if (uploadBatchItems.length <= 0) {
      setError("업로드할 파일을 먼저 선택해 주세요.");
      return;
    }

    setUploading(true);
    setStatus("");
    setError("");
    try {
      let uploadedCount = 0;
      for (const item of uploadBatchItems) {
        await uploadStudioMediaAsset({
          file: item.file,
          title: item.title.trim() || undefined,
          summary: item.summary.trim() || undefined,
          folderPath: item.folderPath.trim() || undefined,
          tags: parseCsv(item.tagsText),
          emotionTags: parseCsv(item.emotionTagsText),
          queryHints: parseCsv(item.queryHintsText),
          metadataOrigin: "manual",
        });
        uploadedCount += 1;
      }
      setUploadBatchItems([]);
      setImportDialogMode(null);
      setStatus(`${uploadedCount}개 파일 업로드를 완료했습니다.`);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setUploading(false);
    }
  };

  const handleExternalBatchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enabled) {
      setError("Supabase 저장 설정이 없어 외부 링크 등록을 진행할 수 없습니다.");
      return;
    }
    if (externalBatchItems.length <= 0) {
      setError("먼저 링크 목록을 불러와 주세요.");
      return;
    }

    setCreatingExternal(true);
    setStatus("");
    setError("");
    try {
      let createdCount = 0;
      for (const item of externalBatchItems) {
        const sourceUrl = item.sourceUrl.trim();
        if (!sourceUrl) continue;
        const isMotion = item.mediaKind === "video" || item.mediaKind === "animated_image";
        await createStudioMediaAsset({
          provider: "manual",
          title: item.title.trim() || undefined,
          summary: item.summary.trim() || undefined,
          folderPath: item.folderPath.trim() || undefined,
          mediaKind: item.mediaKind,
          sourceUrl,
          sourceMediaUrl: isMotion ? sourceUrl : undefined,
          sourcePageUrl: item.sourcePageUrl.trim() || undefined,
          tags: parseCsv(item.tagsText),
          emotionTags: parseCsv(item.emotionTagsText),
          queryHints: parseCsv(item.queryHintsText),
          metadataOrigin: "manual",
        });
        createdCount += 1;
      }
      setExternalLinksText("");
      setExternalBatchItems([]);
      setImportDialogMode(null);
      setStatus(`${createdCount}개 외부 링크 등록을 완료했습니다.`);
      await loadAssets();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setCreatingExternal(false);
    }
  };

  return (
    <>
      <section className="card studio-meme-launch-card">
        <div className="studio-panel-header">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#0EA5E9" }}>
              core media vault
            </div>
            <h3 style={{ fontSize: "1rem" }}>짤 · 사진 폴더 보관함</h3>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              짤, 사진, GIF, 클립을 폴더 기준으로 묶어서 찾고, 외부 링크 등록과 수동 업로드를 같은 보관함에서 처리합니다.
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary" onClick={() => void loadAssets()} disabled={loading}>
              {loading ? "불러오는 중..." : "새로고침"}
            </button>
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              폴더 관리 열기
            </button>
          </div>
        </div>

        <div className="studio-meme-launch-meta">
          <span className={`studio-meme-stat-pill ${enabled ? "is-success" : "is-muted"}`}>{enabled ? "DB 연결 활성" : "DB 비활성"}</span>
          <span className="studio-meme-stat-pill">전체 {items.length}</span>
          <span className="studio-meme-stat-pill">폴더 {folderOptions.length}</span>
          <span className="studio-meme-stat-pill">사진 {stillCount}</span>
          <span className="studio-meme-stat-pill">움직임 {motionCount}</span>
        </div>

        {previewItems.length > 0 ? (
          <div className="studio-meme-launch-strip">
            {previewItems.map((item) => (
              <div key={item.id} className="studio-meme-launch-thumb">
                {renderAssetMedia(item)}
                <div className="studio-meme-launch-thumb-tags">
                  <span>{item.folderPath || "미분류"}</span>
                  {getVisibleAssetTags(item).slice(0, 2).map((tag) => (
                    <span key={`${item.id}-${tag}`}>{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="studio-meme-empty">
            아직 저장된 자산이 없습니다. 폴더 관리 창에서 외부 링크를 등록하거나 파일을 업로드해 보세요.
          </div>
        )}
      </section>

      {open ? (
        <div className="studio-meme-modal-layer" role="dialog" aria-modal="true" aria-label="짤 및 사진 폴더 관리 창">
          <button type="button" className="studio-meme-modal-backdrop" aria-label="관리 창 닫기" onClick={() => setOpen(false)} />
          <div className="studio-meme-modal" style={{ padding: "var(--space-6)" }}>
            <datalist id={folderDatalistId}>
              {folderOptions.map((folderPath) => (
                <option key={folderPath} value={folderPath} />
              ))}
            </datalist>

            <div className="studio-meme-modal-header">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="studio-meme-kicker">Folder Based Media Library</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0F172A" }}>짤과 사진을 폴더 중심으로 묶어 관리하는 핵심 보관함</div>
                <div style={{ fontSize: "0.8125rem", color: "#475569" }}>
                  폴더를 기준으로 검색, 업로드, 외부 링크 등록, 메타 수정, 삭제를 한 곳에서 처리합니다.
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>

            <div className="studio-meme-toolbar">
              <button type="button" className="btn-secondary" onClick={() => void loadAssets()} disabled={loading}>
                {loading ? "불러오는 중..." : "목록 새로고침"}
              </button>
              <span className={`studio-meme-stat-pill ${enabled ? "is-success" : "is-muted"}`}>{enabled ? "DB 연결 활성" : "DB 비활성"}</span>
              <span className="studio-meme-stat-pill">검색 결과 {filteredItems.length}</span>
              <span className="studio-meme-stat-pill">폴더 {folderOptions.length}</span>
            </div>

            {status ? <div className="studio-meme-status">{status}</div> : null}
            {error ? <div className="studio-meme-status is-error">{error}</div> : null}

            {!enabled ? (
              <div className="studio-meme-empty">
                Supabase 저장 설정이 없어 이 보관함은 읽기/쓰기 할 수 없습니다. 설정이 연결되면 폴더 기준 저장과 업로드가 활성화됩니다.
              </div>
            ) : null}

            <div className="assets-library-shell">
              <aside className="assets-folder-sidebar">
                <div className="assets-finder-sidebar-header">
                  <div className="assets-finder-sidebar-eyebrow">Media Folders</div>
                  <div className="assets-finder-sidebar-title-row">
                    <div className="assets-folder-sidebar-title">폴더</div>
                    <button type="button" className="assets-finder-create-button" onClick={() => handleOpenFolderComposer()}>
                      새 폴더
                    </button>
                  </div>
                </div>

                <div className="assets-finder-location-card">
                  <div className="assets-finder-location-label">현재 위치</div>
                  <div className="assets-finder-location-path">{selectedFolder === "all" ? "전체 자산" : selectedFolder}</div>
                  <div className="assets-finder-location-meta">
                    {selectedFolder === "all"
                      ? `폴더 ${folderNodes.length}개 · 자산 ${items.length}개`
                      : `하위 포함 자산 ${selectedFolderNode?.count || 0}개`}
                  </div>
                  <div className="assets-finder-location-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleOpenFolderComposer(selectedFolder === "all" ? "" : selectedFolder)}
                    >
                      {selectedFolder === "all" ? "루트 폴더 만들기" : "하위 폴더 만들기"}
                    </button>
                  </div>
                </div>

                {showFolderComposer ? (
                  <form className="assets-finder-composer" onSubmit={(event) => void handleCreateFolder(event)}>
                    <div className="assets-finder-composer-header">
                      <div className="assets-folder-sidebar-title">새 폴더</div>
                      <button type="button" className="assets-finder-inline-close" onClick={() => setShowFolderComposer(false)}>
                        닫기
                      </button>
                    </div>
                    <label className="assets-folder-field">
                      저장 위치
                      <select className="input-field" value={newFolderParent} onChange={(event) => setNewFolderParent(event.target.value)}>
                        <option value="">루트</option>
                        {folderOptions.map((folderPath) => (
                          <option key={folderPath} value={folderPath}>
                            {folderPath}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="assets-folder-field">
                      폴더 이름
                      <input
                        className="input-field"
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        placeholder="예: 웃긴 짤 모음"
                        autoFocus
                      />
                    </label>
                    <div className="assets-folder-create-preview">
                      {buildNestedFolderPath(newFolderParent, newFolderName) || "생성 경로 미리보기"}
                    </div>
                    <div className="assets-finder-composer-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowFolderComposer(false)}>
                        취소
                      </button>
                      <button type="submit" className="btn-primary" disabled={!enabled || creatingFolder}>
                        {creatingFolder ? "폴더 생성 중..." : "폴더 만들기"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="assets-folder-sidebar-section">
                  <div className="assets-folder-sidebar-title">폴더 트리</div>
                  <div className="assets-folder-tree">
                    <button
                      type="button"
                      className={`assets-folder-button assets-folder-button-tree ${selectedFolder === "all" ? "is-active" : ""}`}
                      onClick={() => setSelectedFolder("all")}
                    >
                      <span className="assets-folder-button-main">
                        <span className="assets-folder-glyph is-library" aria-hidden="true" />
                        <span className="assets-folder-button-text">
                          <span className="assets-folder-button-label">전체 자산</span>
                          <span className="assets-folder-button-path">Shared media vault</span>
                        </span>
                      </span>
                      <strong>{items.length}</strong>
                    </button>
                    {folderNodes.map((folder) => (
                      <button
                        key={folder.path}
                        type="button"
                        className={`assets-folder-button assets-folder-button-tree ${selectedFolder === folder.path ? "is-active" : ""}`}
                        onClick={() => setSelectedFolder(folder.path)}
                        style={{ ["--folder-depth" as string]: String(folder.depth) }}
                      >
                        <span className="assets-folder-button-main">
                          <span className={`assets-folder-glyph ${folder.depth === 0 ? "is-root" : ""}`} aria-hidden="true" />
                          <span className="assets-folder-button-text">
                            <span className="assets-folder-button-label">{folder.label}</span>
                            <span className="assets-folder-button-path">{folder.path}</span>
                          </span>
                        </span>
                        <strong>{folder.count}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="assets-library-main">
                <div className="assets-import-launcher">
                  <button type="button" className="assets-import-launcher-card" onClick={handleOpenUploadDialog} disabled={!enabled}>
                    <span className="assets-import-launcher-kicker">Batch Upload</span>
                    <strong>파일 여러 장 추가</strong>
                    <span>사진, GIF, 클립을 한 번에 고르고 각 항목별 태그를 바로 입력합니다.</span>
                  </button>
                  <button type="button" className="assets-import-launcher-card" onClick={handleOpenExternalDialog} disabled={!enabled}>
                    <span className="assets-import-launcher-kicker">Link Import</span>
                    <strong>외부 링크 여러 개 추가</strong>
                    <span>링크를 여러 줄로 붙여 넣고 항목별 제목, 타입, 태그를 한 번에 정리합니다.</span>
                  </button>
                </div>

                <div className="studio-meme-search-row">
                  <input className="input-field" placeholder="제목, 폴더, 태그, 설명, query hint 검색" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(120px, 180px) auto", gap: "var(--space-2)" }}>
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
                        setMediaFilter("all");
                        setMetadataFilter("all");
                      }}
                    >
                      필터 초기화
                    </button>
                  </div>
                </div>

                <div className="assets-selection-toolbar">
                  <div className="assets-selection-actions">
                    <button type="button" className="btn-secondary" onClick={toggleSelectionMode}>
                      {selectionMode ? "선택 모드 종료" : "선택 모드"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleSelectAllFiltered} disabled={filteredItems.length <= 0}>
                      전체 선택
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleClearSelection} disabled={selectedIds.length <= 0}>
                      선택 해제
                    </button>
                  </div>
                  <div className="assets-selection-summary">
                    {selectionMode ? `선택 ${selectedIds.length}개` : focusedItem ? `상세 선택: ${focusedItem.title || focusedItem.id}` : "카드를 누르면 상세 관리, 선택 모드에서는 다중 선택"}
                  </div>
                </div>

                {selectedIds.length > 0 ? (
                  <div className="assets-batch-panel">
                    <div className="assets-batch-grid">
                      <label className="assets-folder-field">
                        선택 자산 이동 폴더
                        <input
                          className="input-field"
                          list={folderDatalistId}
                          value={batchFolderPath}
                          onChange={(event) => setBatchFolderPath(event.target.value)}
                          placeholder="예: 사진/이쁜 사진 모음"
                        />
                      </label>
                      <button type="button" className="btn-primary" onClick={() => void handleBatchMove()} disabled={batchMoving}>
                        {batchMoving ? "이동 중..." : `${selectedIds.length}개 폴더 이동`}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => void handleBatchDelete()} disabled={batchDeleting}>
                        {batchDeleting ? "삭제 중..." : `${selectedIds.length}개 삭제`}
                      </button>
                    </div>
                  </div>
                ) : null}

                {filteredItems.length > 0 ? (
                  <div style={{ maxHeight: "52vh", overflowY: "auto", paddingRight: 4 }}>
                    <div className="studio-meme-gallery-grid">
                      {filteredItems.map((item) => {
                        const visibleTags = getVisibleAssetTags(item);
                        const isSelected = selectedIds.includes(item.id);
                        return (
                          <article
                            key={item.id}
                            className={`studio-meme-gallery-tile ${isSelected ? "is-selected" : ""} ${focusedAssetId === item.id ? "is-focused" : ""}`}
                          >
                            <button type="button" className="studio-meme-gallery-media studio-meme-gallery-card-button" onClick={() => handleCardOpen(item.id)}>
                              {renderAssetMedia(item)}
                              {selectionMode ? (
                                <span className={`studio-meme-select-badge ${isSelected ? "is-active" : ""}`}>
                                  {isSelected ? "선택됨" : "선택"}
                                </span>
                              ) : null}
                            </button>
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
                              <div className="studio-meme-gallery-tags">
                                {visibleTags.length > 0 ? visibleTags.map((tag) => <span key={`${item.id}-${tag}`}>{tag}</span>) : <span>태그 없음</span>}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="studio-meme-empty">
                    조건에 맞는 자산이 없습니다. 다른 폴더를 선택하거나 위에서 새 자산을 등록해 보세요.
                  </div>
                )}

                {focusedItem && !selectionMode ? (
                  <div className="assets-detail-panel">
                    <div className="assets-detail-header">
                      <div>
                        <div className="assets-detail-title">{focusedItem.title || focusedItem.id}</div>
                        <div className="assets-detail-subtitle">
                          {focusedItem.folderPath || "미분류"} · {isMotionKind(focusedItem.mediaKind) ? "움직임" : "정지"} · 업데이트 {formatDateTime(focusedItem.updatedAtMs)}
                        </div>
                      </div>
                      <div className="assets-detail-badges">
                        <span className="studio-meme-stat-pill">{focusedItem.provider}</span>
                        <button
                          type="button"
                          className={`studio-meme-favorite-toggle${focusedItem.isFavorite ? " is-active" : ""}`}
                          onClick={() => void handleToggleFavorite(focusedItem)}
                          disabled={!enabled || favoriteUpdatingId === focusedItem.id}
                          aria-pressed={focusedItem.isFavorite}
                        >
                          {favoriteUpdatingId === focusedItem.id ? "저장 중" : focusedItem.isFavorite ? "고정됨" : "즐겨찾기"}
                        </button>
                        <span className="studio-meme-stat-pill">{getMetadataOriginBadge(resolveMetadataOriginMode(focusedItem)).label}</span>
                        <button type="button" className="btn-secondary" onClick={() => setShowDetailPreview((current) => !current)}>
                          {showDetailPreview ? "이미지 숨기기" : "이미지 보이기"}
                        </button>
                      </div>
                    </div>

                    <div className={`assets-detail-grid ${showDetailPreview ? "" : "is-preview-hidden"}`}>
                      {showDetailPreview ? <div className="assets-detail-preview">{renderAssetMedia(focusedItem)}</div> : null}
                      <div className="assets-detail-form">
                        <div style={{ fontSize: "0.72rem", color: "#64748B", wordBreak: "break-all" }}>{focusedItem.id}</div>
                        <input className="input-field" value={(drafts[focusedItem.id] || toDraft(focusedItem)).folderPath} onChange={(event) => handleDraftChange(focusedItem.id, { folderPath: event.target.value })} placeholder="폴더 경로" list={folderDatalistId} />
                        <input className="input-field" value={(drafts[focusedItem.id] || toDraft(focusedItem)).title} onChange={(event) => handleDraftChange(focusedItem.id, { title: event.target.value })} placeholder="제목" />
                        <textarea className="input-field" rows={2} value={(drafts[focusedItem.id] || toDraft(focusedItem)).summary} onChange={(event) => handleDraftChange(focusedItem.id, { summary: event.target.value })} placeholder="설명" style={{ resize: "vertical" }} />
                        <input className="input-field" value={(drafts[focusedItem.id] || toDraft(focusedItem)).tagsText} onChange={(event) => handleDraftChange(focusedItem.id, { tagsText: event.target.value })} placeholder="수동 태그 (쉼표 구분)" />
                        <input className="input-field" value={(drafts[focusedItem.id] || toDraft(focusedItem)).emotionTagsText} onChange={(event) => handleDraftChange(focusedItem.id, { emotionTagsText: event.target.value })} placeholder="수동 감정 태그 (쉼표 구분)" />
                        <textarea className="input-field" rows={2} value={(drafts[focusedItem.id] || toDraft(focusedItem)).queryHintsText} onChange={(event) => handleDraftChange(focusedItem.id, { queryHintsText: event.target.value })} placeholder="수동 query hints (쉼표 구분)" style={{ resize: "vertical" }} />
                        <div className="studio-meme-gallery-actions">
                          <button type="button" className="btn-secondary" onClick={() => void handleSaveItem(focusedItem.id)} disabled={!enabled || savingId === focusedItem.id || deletingId === focusedItem.id}>
                            {savingId === focusedItem.id ? "저장 중..." : "메타 저장"}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => void handleCopyAutoMetadata(focusedItem.id)} disabled={!enabled || !hasAutoMetadata(focusedItem) || savingId === focusedItem.id || deletingId === focusedItem.id || copyingId === focusedItem.id}>
                            {copyingId === focusedItem.id ? "복사 중..." : "자동 -> 수동 복사"}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => void handleDeleteItem(focusedItem.id)} disabled={!enabled || savingId === focusedItem.id || deletingId === focusedItem.id}>
                            {deletingId === focusedItem.id ? "삭제 중..." : "삭제"}
                          </button>
                          <a href={focusedItem.imageUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                            미리보기 열기
                          </a>
                          {focusedItem.sourcePageUrl ? (
                            <a href={focusedItem.sourcePageUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                              원본 페이지
                            </a>
                          ) : null}
                        </div>
                        {hasAutoMetadata(focusedItem) ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "#EFF6FF", color: "#1E3A8A", fontSize: "0.75rem" }}>
                            <div style={{ fontWeight: 700 }}>자동 메타데이터</div>
                            <div>자동 태그: {focusedItem.autoTags.length > 0 ? focusedItem.autoTags.join(", ") : "-"}</div>
                            <div>자동 감정 태그: {focusedItem.autoEmotionTags.length > 0 ? focusedItem.autoEmotionTags.join(", ") : "-"}</div>
                            <div>자동 query hints: {focusedItem.autoQueryHints.length > 0 ? focusedItem.autoQueryHints.join(", ") : "-"}</div>
                          </div>
                        ) : null}
                        {hasAutoSourceMetadata(focusedItem) ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "#F8FAFC", color: "#334155", fontSize: "0.75rem" }}>
                            <div style={{ fontWeight: 700 }}>자동 원본 메타</div>
                            <div>provider query: {focusedItem.autoSourceMetadata.providerQuery || "-"}</div>
                            <div>provider title: {focusedItem.autoSourceMetadata.providerTitle || "-"}</div>
                            <div>provider slug: {focusedItem.autoSourceMetadata.providerSlug || "-"}</div>
                            <div>provider rating: {focusedItem.autoSourceMetadata.providerRating || "-"}</div>
                            <div>provider tags: {focusedItem.autoSourceMetadata.providerTags.length > 0 ? focusedItem.autoSourceMetadata.providerTags.join(", ") : "-"}</div>
                            <div>provider pool: {focusedItem.autoSourceMetadata.providerCandidates.length > 0 ? focusedItem.autoSourceMetadata.providerCandidates.join(" -> ") : "-"}</div>
                            <div>trace: {focusedItem.autoSourceMetadata.selectionDetails.length > 0 ? focusedItem.autoSourceMetadata.selectionDetails.join(" | ") : "-"}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {importDialogMode ? (
              <div className="assets-import-modal-layer" role="dialog" aria-modal="true" aria-label={importDialogMode === "upload" ? "파일 일괄 업로드" : "외부 링크 일괄 등록"}>
                <button type="button" className="assets-import-modal-backdrop" aria-label="등록 창 닫기" onClick={handleCloseImportDialog} />
                <div className="assets-import-modal">
                  <div className="assets-import-modal-header">
                    <div>
                      <div className="assets-import-modal-kicker">{importDialogMode === "upload" ? "Batch Upload" : "Batch Link Import"}</div>
                      <div className="assets-import-modal-title">
                        {importDialogMode === "upload" ? "파일 여러 장 한 번에 업로드" : "외부 링크 여러 개 한 번에 등록"}
                      </div>
                      <div className="assets-import-modal-subtitle">
                        {importDialogMode === "upload"
                          ? "파일을 고른 뒤 각 항목별 제목, 태그, 감정 태그, query hint를 한 화면에서 정리합니다."
                          : "링크를 줄바꿈으로 붙여 넣고 항목별 제목, 타입, 태그를 한 번에 편집합니다."}
                      </div>
                    </div>
                    <button type="button" className="btn-secondary" onClick={handleCloseImportDialog}>
                      닫기
                    </button>
                  </div>

                  {importDialogMode === "upload" ? (
                    <form className="assets-import-modal-body" onSubmit={(event) => void handleUploadBatchSubmit(event)}>
                      <div className="assets-import-controls">
                        <label className="assets-folder-field">
                          파일 선택
                          <input
                            className="input-field"
                            type="file"
                            multiple
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm"
                            onChange={(event) => {
                              handleUploadBatchFiles(event.target.files);
                              event.currentTarget.value = "";
                            }}
                            disabled={uploading}
                          />
                        </label>
                        <label className="assets-folder-field">
                          공통 폴더 경로
                          <input
                            className="input-field"
                            list={folderDatalistId}
                            value={uploadBatchFolderPath}
                            onChange={(event) => handleUploadBatchFolderChange(event.target.value)}
                            placeholder="예: 사진/이쁜 사진 모음"
                          />
                        </label>
                        <div className="assets-import-summary-card">
                          <strong>{uploadBatchItems.length}개 선택됨</strong>
                          <span>각 항목 아래에서 태그를 바로 입력할 수 있습니다.</span>
                        </div>
                      </div>

                      {uploadBatchItems.length > 0 ? (
                        <div className="assets-import-item-list">
                          {uploadBatchItems.map((item, index) => (
                            <article key={item.id} className="assets-import-item-card">
                              <div className="assets-import-item-header">
                                <div>
                                  <div className="assets-import-item-title">{item.file.name}</div>
                                  <div className="assets-import-item-meta">{formatFileSize(item.file.size)} · 항목 {index + 1}</div>
                                </div>
                                <button type="button" className="btn-secondary" onClick={() => handleRemoveUploadBatchItem(item.id)}>
                                  제외
                                </button>
                              </div>
                              <div className="assets-import-item-layout">
                                <div className="assets-import-preview-frame">
                                  {renderBatchPreview({
                                    mediaKind: item.file.type.startsWith("video/") ? "video" : item.file.type === "image/gif" ? "animated_image" : "image",
                                    previewUrl: uploadPreviewUrls[item.id],
                                    title: item.title,
                                  })}
                                </div>
                                <div className="assets-import-item-grid">
                                  <input className="input-field" value={item.title} onChange={(event) => handleUploadBatchItemChange(item.id, { title: event.target.value })} placeholder="제목" />
                                  <input className="input-field" value={item.folderPath} onChange={(event) => handleUploadBatchItemChange(item.id, { folderPath: event.target.value })} placeholder="폴더 경로" list={folderDatalistId} />
                                  <textarea className="input-field" rows={2} value={item.summary} onChange={(event) => handleUploadBatchItemChange(item.id, { summary: event.target.value })} placeholder="설명" style={{ resize: "vertical" }} />
                                  <TagTipsInput
                                    label="태그"
                                    value={item.tagsText}
                                    onChange={(value) => handleUploadBatchItemChange(item.id, { tagsText: value })}
                                    placeholder="엔터나 쉼표로 추가"
                                    suggestions={COMMON_TAG_TIPS}
                                  />
                                  <TagTipsInput
                                    label="감정 태그"
                                    value={item.emotionTagsText}
                                    onChange={(value) => handleUploadBatchItemChange(item.id, { emotionTagsText: value })}
                                    placeholder="surprised, laugh"
                                    suggestions={COMMON_EMOTION_TAG_TIPS}
                                  />
                                  <input className="input-field" value={item.queryHintsText} onChange={(event) => handleUploadBatchItemChange(item.id, { queryHintsText: event.target.value })} placeholder="query hint (쉼표 구분)" />
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="studio-meme-empty">업로드할 파일을 여러 장 선택해 주세요.</div>
                      )}

                      <div className="assets-import-modal-actions">
                        <button type="button" className="btn-secondary" onClick={handleCloseImportDialog}>
                          취소
                        </button>
                        <button type="submit" className="btn-primary" disabled={uploading || uploadBatchItems.length <= 0}>
                          {uploading ? "업로드 중..." : `${uploadBatchItems.length}개 업로드`}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form className="assets-import-modal-body" onSubmit={(event) => void handleExternalBatchSubmit(event)}>
                      <div className="assets-import-controls">
                        <label className="assets-folder-field">
                          링크 목록
                          <textarea
                            className="input-field"
                            rows={5}
                            value={externalLinksText}
                            onChange={(event) => setExternalLinksText(event.target.value)}
                            placeholder={"https://...gif\nhttps://...jpg\nhttps://...mp4"}
                            style={{ resize: "vertical" }}
                          />
                        </label>
                        <label className="assets-folder-field">
                          공통 폴더 경로
                          <input
                            className="input-field"
                            list={folderDatalistId}
                            value={externalBatchFolderPath}
                            onChange={(event) => handleExternalBatchFolderChange(event.target.value)}
                            placeholder="예: 짤/웃긴 짤 모음"
                          />
                        </label>
                        <div className="assets-import-inline-actions">
                          <button type="button" className="btn-secondary" onClick={handleBuildExternalBatch}>
                            링크 목록 불러오기
                          </button>
                          <div className="assets-import-summary-card">
                            <strong>{externalBatchItems.length}개 준비됨</strong>
                            <span>줄바꿈 단위로 파싱한 뒤 각 항목 태그를 개별 수정합니다.</span>
                          </div>
                        </div>
                      </div>

                      {externalBatchItems.length > 0 ? (
                        <div className="assets-import-item-list">
                          {externalBatchItems.map((item, index) => (
                            <article key={item.id} className="assets-import-item-card">
                              <div className="assets-import-item-header">
                                <div>
                                  <div className="assets-import-item-title">{item.sourceUrl}</div>
                                  <div className="assets-import-item-meta">항목 {index + 1}</div>
                                </div>
                                <button type="button" className="btn-secondary" onClick={() => handleRemoveExternalBatchItem(item.id)}>
                                  제외
                                </button>
                              </div>
                              <div className="assets-import-item-layout">
                                <div className="assets-import-preview-frame">
                                  {renderBatchPreview({
                                    mediaKind: item.mediaKind,
                                    previewUrl: item.sourceUrl,
                                    title: item.title,
                                  })}
                                </div>
                                <div className="assets-import-item-grid">
                                  <input className="input-field" value={item.title} onChange={(event) => handleExternalBatchItemChange(item.id, { title: event.target.value })} placeholder="제목" />
                                  <input className="input-field" value={item.folderPath} onChange={(event) => handleExternalBatchItemChange(item.id, { folderPath: event.target.value })} placeholder="폴더 경로" list={folderDatalistId} />
                                  <select className="input-field" value={item.mediaKind} onChange={(event) => handleExternalBatchItemChange(item.id, { mediaKind: event.target.value as ExternalBatchItemDraft["mediaKind"] })}>
                                    <option value="image">정지 이미지</option>
                                    <option value="animated_image">GIF / 움짤</option>
                                    <option value="video">비디오</option>
                                  </select>
                                  <input className="input-field" value={item.sourcePageUrl} onChange={(event) => handleExternalBatchItemChange(item.id, { sourcePageUrl: event.target.value })} placeholder="원본 페이지 URL (선택)" />
                                  <textarea className="input-field" rows={2} value={item.summary} onChange={(event) => handleExternalBatchItemChange(item.id, { summary: event.target.value })} placeholder="설명" style={{ resize: "vertical" }} />
                                  <TagTipsInput
                                    label="태그"
                                    value={item.tagsText}
                                    onChange={(value) => handleExternalBatchItemChange(item.id, { tagsText: value })}
                                    placeholder="엔터나 쉼표로 추가"
                                    suggestions={COMMON_TAG_TIPS}
                                  />
                                  <TagTipsInput
                                    label="감정 태그"
                                    value={item.emotionTagsText}
                                    onChange={(value) => handleExternalBatchItemChange(item.id, { emotionTagsText: value })}
                                    placeholder="surprised, laugh"
                                    suggestions={COMMON_EMOTION_TAG_TIPS}
                                  />
                                  <input className="input-field" value={item.queryHintsText} onChange={(event) => handleExternalBatchItemChange(item.id, { queryHintsText: event.target.value })} placeholder="query hint (쉼표 구분)" />
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="studio-meme-empty">링크를 여러 줄로 붙여 넣고 목록을 불러와 주세요.</div>
                      )}

                      <div className="assets-import-modal-actions">
                        <button type="button" className="btn-secondary" onClick={handleCloseImportDialog}>
                          취소
                        </button>
                        <button type="submit" className="btn-primary" disabled={creatingExternal || externalBatchItems.length <= 0}>
                          {creatingExternal ? "등록 중..." : `${externalBatchItems.length}개 링크 등록`}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

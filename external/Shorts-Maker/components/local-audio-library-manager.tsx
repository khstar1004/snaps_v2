"use client";

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  createAudioLibraryFolder,
  deleteAudioLibraryFile,
  deleteAudioLibraryFolder,
  fetchAudioLibrary,
  moveAudioLibraryFile,
  renameAudioLibraryFolder,
  uploadAudioLibraryFiles,
  type AudioLibraryFolder,
  type AudioLibraryItem,
  type AudioLibraryKind,
} from "@/lib/api/assets-client";
import { isApiClientError } from "@/lib/ui/api-client";

const ALL_SFX_FOLDERS = "__all_sfx__";
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

function toErrorMessage(error: unknown): string {
  return isApiClientError(error) ? error.message : error instanceof Error ? error.message : String(error);
}

function toSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUpdatedAt(updatedAtMs: number): string {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(updatedAtMs);
}

function getFolderDepth(path: string): number {
  return Math.max(0, path.split("/").filter(Boolean).length - 1);
}

function getFolderLabel(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
}

function getFolderParentPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

function buildFolderPath(parentPath: string, name: string): string {
  const safeName = name
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
  if (!safeName) return "";
  return parentPath.trim() ? `${parentPath.trim()}/${safeName}` : safeName;
}

function isSupportedAudioFile(file: File): boolean {
  const mimeType = String(file.type || "").toLowerCase();
  const safeName = String(file.name || "").toLowerCase();
  return SUPPORTED_AUDIO_TYPES.has(mimeType) || [".mp3", ".wav", ".ogg", ".m4a"].some((ext) => safeName.endsWith(ext));
}

function mergeQueuedFiles(current: File[], nextFiles: File[]): File[] {
  const map = new Map<string, File>();
  for (const file of [...current, ...nextFiles]) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    map.set(key, file);
  }
  return Array.from(map.values());
}

export function LocalAudioLibraryManager() {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [deletingKey, setDeletingKey] = useState("");
  const [movingKey, setMovingKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState<AudioLibraryKind>("sfx");
  const [folders, setFolders] = useState<AudioLibraryFolder[]>([]);
  const [items, setItems] = useState<AudioLibraryItem[]>([]);
  const [selectedSfxFolder, setSelectedSfxFolder] = useState(ALL_SFX_FOLDERS);
  const [searchText, setSearchText] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("");
  const [renameFolderPath, setRenameFolderPath] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [uploadTargetFolderPath, setUploadTargetFolderPath] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState("");
  const [dragOverFolderPath, setDragOverFolderPath] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchAudioLibrary();
      const nextFolders = Array.isArray(response.folders) ? response.folders : [];
      const nextItems = Array.isArray(response.items) ? response.items : [];
      setFolders(nextFolders);
      setItems(nextItems);
      setSelectedSfxFolder((current) => {
        if (current === ALL_SFX_FOLDERS || current === "") return current;
        return nextFolders.some((folder) => folder.kind === "sfx" && folder.path === current) ? current : ALL_SFX_FOLDERS;
      });
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const sfxFolders = useMemo(
    () =>
      folders
        .filter((folder) => folder.kind === "sfx")
        .sort((left, right) => left.path.localeCompare(right.path, "ko")),
    [folders]
  );

  useEffect(() => {
    setUploadTargetFolderPath((current) => {
      if (kind !== "sfx") return "";
      if (current && sfxFolders.some((folder) => folder.path === current)) return current;
      if (selectedSfxFolder === "") return "";
      if (selectedSfxFolder !== ALL_SFX_FOLDERS && sfxFolders.some((folder) => folder.path === selectedSfxFolder)) return selectedSfxFolder;
      return "";
    });
  }, [kind, selectedSfxFolder, sfxFolders]);

  const visibleItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return items.filter((item) => {
      if (item.kind !== kind) return false;
      if (kind === "sfx" && selectedSfxFolder !== ALL_SFX_FOLDERS && item.folderPath !== selectedSfxFolder) return false;
      if (!keyword) return true;
      return [item.label, item.fileName, item.folderPath, item.folderLabel].join(" ").toLowerCase().includes(keyword);
    });
  }, [items, kind, searchText, selectedSfxFolder]);

  const stats = useMemo(
    () => ({
      totalFiles: items.length,
      sfxCount: items.filter((item) => item.kind === "sfx").length,
      bgmCount: items.filter((item) => item.kind === "bgm").length,
      folderCount: sfxFolders.length,
      generalSfxCount: items.filter((item) => item.kind === "sfx" && !item.folderPath).length,
    }),
    [items, sfxFolders.length]
  );

  const draggingItem = useMemo(() => items.find((item) => item.id === draggingItemId) || null, [draggingItemId, items]);
  const selectedFolderMeta = useMemo(
    () => sfxFolders.find((folder) => folder.path === selectedSfxFolder) || null,
    [selectedSfxFolder, sfxFolders]
  );

  const queueFiles = (files: File[]) => {
    const supported = files.filter((file) => isSupportedAudioFile(file));
    if (supported.length <= 0) {
      setError("MP3, WAV, OGG, M4A 파일만 업로드할 수 있습니다.");
      return;
    }
    setError("");
    setQueuedFiles((current) => mergeQueuedFiles(current, supported));
  };

  const handleCreateFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFolderPath = buildFolderPath(newFolderParent, newFolderName);
    if (!nextFolderPath) {
      setError("새 효과음 폴더 이름을 입력해 주세요.");
      return;
    }
    setCreatingFolder(true);
    setMessage("");
    setError("");
    try {
      const result = await createAudioLibraryFolder("sfx", nextFolderPath);
      setNewFolderName("");
      setSelectedSfxFolder(result.folder.path);
      setUploadTargetFolderPath(result.folder.path);
      setMessage(`효과음 폴더를 만들었습니다: ${result.folder.path}`);
      await refresh();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameFolderPath) {
      setError("이름을 바꿀 폴더를 선택해 주세요.");
      return;
    }
    const parentPath = renameFolderPath.split("/").slice(0, -1).join("/");
    const nextFolderPath = buildFolderPath(parentPath, renameFolderName);
    if (!nextFolderPath) {
      setError("새 폴더 이름을 입력해 주세요.");
      return;
    }
    setRenamingFolder(true);
    setMessage("");
    setError("");
    try {
      const result = await renameAudioLibraryFolder({
        kind: "sfx",
        folderPath: renameFolderPath,
        nextFolderPath,
      });
      setRenameFolderPath(result.folder.path);
      setRenameFolderName(getFolderLabel(result.folder.path));
      setSelectedSfxFolder(result.folder.path);
      setUploadTargetFolderPath(result.folder.path);
      setMessage(`폴더 이름을 바꿨습니다: ${result.folder.path}`);
      await refresh();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setRenamingFolder(false);
    }
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (queuedFiles.length <= 0) {
      setError("업로드할 파일을 먼저 선택해 주세요.");
      return;
    }
    const normalizedTargetFolder = kind === "sfx" ? uploadTargetFolderPath : "";
    const existingNames = new Set(
      items
        .filter((item) => {
          if (item.kind !== kind) return false;
          const itemFolder = item.folderPath || "";
          return itemFolder === normalizedTargetFolder;
        })
        .map((item) => item.fileName.trim().toLowerCase())
    );
    const filesToUpload = queuedFiles.filter((file) => !existingNames.has(file.name.trim().toLowerCase()));
    const skippedCount = queuedFiles.length - filesToUpload.length;
    if (filesToUpload.length <= 0) {
      setMessage("");
      setError("기존 파일명과 중복된 파일만 있어 업로드에서 모두 제외했습니다.");
      return;
    }
    setUploading(true);
    setMessage("");
    setError("");
    try {
      await uploadAudioLibraryFiles({
        kind,
        folderPath: kind === "sfx" ? uploadTargetFolderPath : undefined,
        files: filesToUpload,
      });
      setQueuedFiles([]);
      setUploadInputKey((current) => current + 1);
      setMessage(
        skippedCount > 0
          ? `${filesToUpload.length}개 업로드, ${skippedCount}개는 기존 파일명 중복으로 제외했습니다.`
          : `${filesToUpload.length}개 파일을 업로드했습니다.`
      );
      await refresh();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setUploading(false);
    }
  };

  const handleMoveItem = async (item: AudioLibraryItem, nextFolderPath: string) => {
    if (item.kind !== "sfx" || !nextFolderPath || item.folderPath === nextFolderPath) return;
    setMovingKey(item.id);
    setMessage("");
    setError("");
    try {
      await moveAudioLibraryFile({
        kind: "sfx",
        fromFolderPath: item.folderPath,
        toFolderPath: nextFolderPath,
        fileName: item.fileName,
      });
      setMessage(`"${item.fileName}" 파일을 ${nextFolderPath} 폴더로 이동했습니다.`);
      await refresh();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setMovingKey("");
      setDraggingItemId("");
      setDragOverFolderPath("");
    }
  };

  const handleDeleteItem = async (item: AudioLibraryItem) => {
    if (!window.confirm(`"${item.fileName}" 파일을 삭제할까요?`)) return;
    setDeletingKey(item.id);
    setMessage("");
    setError("");
    try {
      await deleteAudioLibraryFile({
        kind: item.kind,
        folderPath: item.folderPath || undefined,
        fileName: item.fileName,
      });
      setMessage("오디오 파일을 삭제했습니다.");
      await refresh();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setDeletingKey("");
    }
  };

  const handleDeleteFolder = async (folder: AudioLibraryFolder) => {
    if (!window.confirm(`"${folder.path}" 폴더를 삭제할까요?\n비어 있어야만 삭제됩니다.`)) return;
    setDeletingKey(folder.id);
    setMessage("");
    setError("");
    try {
      await deleteAudioLibraryFolder({ kind: "sfx", folderPath: folder.path });
      setSelectedSfxFolder(ALL_SFX_FOLDERS);
      setMessage(`폴더를 삭제했습니다: ${folder.path}`);
      await refresh();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setDeletingKey("");
    }
  };

  const handleDropUpload = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setUploadDragActive(false);
    queueFiles(Array.from(event.dataTransfer.files || []));
  };

  const resolveDraggedItem = (event: DragEvent<HTMLElement>): AudioLibraryItem | null => {
    const draggedId =
      draggingItemId ||
      event.dataTransfer.getData("application/x-audio-library-item") ||
      event.dataTransfer.getData("text/plain");
    if (!draggedId) return null;
    return items.find((item) => item.id === draggedId) || null;
  };

  return (
    <section className="card audio-library-panel">
      <div className="audio-library-head">
        <div className="audio-library-head-copy">
          <p className="audio-library-eyebrow">Local Audio Library</p>
          <h2 className="audio-library-title">효과음 · 배경음 관리 탭</h2>
          <p className="audio-library-description">다중 업로드, 중첩 폴더, 드래그 이동으로 로컬 오디오를 탐색기처럼 정리합니다.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {message ? <div className="assets-inline-banner">{message}</div> : null}
      {error ? <div className="assets-inline-banner is-error">{error}</div> : null}

      <div className="audio-library-stats">
        <article className="audio-library-stat-card"><strong>{stats.totalFiles}</strong><span>전체 파일</span></article>
        <article className="audio-library-stat-card"><strong>{stats.folderCount}</strong><span>효과음 폴더</span></article>
        <article className="audio-library-stat-card"><strong>{stats.sfxCount}</strong><span>효과음</span></article>
        <article className="audio-library-stat-card"><strong>{stats.bgmCount}</strong><span>배경음</span></article>
      </div>

      <div className="audio-library-toolbar">
        <div className="audio-library-tabs" role="tablist" aria-label="오디오 종류">
          <button type="button" className={`audio-library-tab ${kind === "sfx" ? "is-active" : ""}`} onClick={() => setKind("sfx")}>효과음</button>
          <button type="button" className={`audio-library-tab ${kind === "bgm" ? "is-active" : ""}`} onClick={() => setKind("bgm")}>배경음</button>
        </div>
        <input className="input-field audio-library-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="파일명 또는 폴더 검색" />
      </div>

      <div className="assets-library-shell audio-library-shell">
        <aside className="assets-folder-sidebar audio-library-sidebar">
          {kind === "sfx" ? (
            <>
              <div className="audio-library-section-card">
                <div className="audio-library-section-head"><strong>새 폴더 만들기</strong><span>한글 폴더명 가능</span></div>
                <form className="audio-library-form" onSubmit={(event) => void handleCreateFolder(event)}>
                  <select className="input-field" value={newFolderParent} onChange={(event) => setNewFolderParent(event.target.value)}>
                    <option value="">루트</option>
                    {sfxFolders.map((folder) => <option key={folder.path} value={folder.path}>{folder.path}</option>)}
                  </select>
                  <input className="input-field" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="예: 놀람, 전환, 긴장감" />
                  <button type="submit" className="btn-primary" disabled={creatingFolder}>{creatingFolder ? "생성 중..." : "폴더 만들기"}</button>
                </form>
              </div>

              <div className="audio-library-section-card audio-library-folder-panel">
                <div className="audio-library-section-head"><strong>폴더 트리</strong><span>Finder 스타일 분류</span></div>
                <div className="audio-library-folder-list">
                  <button type="button" className={`assets-folder-button assets-folder-button-tree audio-library-folder-button ${selectedSfxFolder === ALL_SFX_FOLDERS ? "is-active" : ""}`} onClick={() => setSelectedSfxFolder(ALL_SFX_FOLDERS)}>
                    <span className="assets-folder-button-main">
                      <span className="assets-folder-glyph is-library" aria-hidden="true" />
                      <span className="assets-folder-button-text">
                        <span className="assets-folder-button-label">전체 효과음</span>
                        <span className="assets-folder-button-path">모든 폴더 보기</span>
                      </span>
                    </span>
                    <strong>{stats.sfxCount}</strong>
                  </button>
                  <button type="button" className={`assets-folder-button assets-folder-button-tree audio-library-folder-button ${selectedSfxFolder === "" ? "is-active" : ""}`} onClick={() => setSelectedSfxFolder("")}>
                    <span className="assets-folder-button-main">
                      <span className="assets-folder-glyph is-root" aria-hidden="true" />
                      <span className="assets-folder-button-text">
                        <span className="assets-folder-button-label">일반 효과음</span>
                        <span className="assets-folder-button-path">자동 업로드 기본 보관함</span>
                      </span>
                    </span>
                    <strong>{stats.generalSfxCount}</strong>
                  </button>
                  {sfxFolders.map((folder) => (
                    <div
                      key={folder.path}
                      className={`audio-library-folder-row ${dragOverFolderPath === folder.path ? "is-drag-over" : ""}`}
                      onDragEnter={(event) => {
                        const dragged = resolveDraggedItem(event);
                        if (!dragged || dragged.folderPath === folder.path) return;
                        event.preventDefault();
                        setDragOverFolderPath(folder.path);
                      }}
                      onDragOver={(event) => {
                        const dragged = resolveDraggedItem(event);
                        if (!dragged || dragged.folderPath === folder.path) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverFolderPath(folder.path);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dragged = resolveDraggedItem(event);
                        if (!dragged) return;
                        void handleMoveItem(dragged, folder.path);
                      }}
                    >
                      <button
                        type="button"
                        className={`assets-folder-button assets-folder-button-tree audio-library-folder-button ${selectedSfxFolder === folder.path ? "is-active" : ""}`}
                        onClick={() => setSelectedSfxFolder(folder.path)}
                        title={folder.path}
                      >
                        <span className={`assets-folder-button-main audio-library-folder-depth-${Math.min(getFolderDepth(folder.path), 5)}`}>
                          <span className={`assets-folder-glyph ${getFolderDepth(folder.path) <= 0 ? "is-root" : ""}`} aria-hidden="true" />
                          <span className="assets-folder-button-text">
                            <span className="assets-folder-button-label">{getFolderLabel(folder.path)}</span>
                            <span className="assets-folder-button-path">{getFolderParentPath(folder.path) || "루트"}</span>
                          </span>
                        </span>
                        <strong>{folder.fileCount}</strong>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {renameFolderPath ? (
                <div className="audio-library-section-card">
                  <div className="audio-library-section-head"><strong>폴더 이름 변경</strong><span>{renameFolderPath}</span></div>
                  <form className="audio-library-form" onSubmit={(event) => void handleRenameFolder(event)}>
                    <div className="audio-library-note">현재 위치: {getFolderParentPath(renameFolderPath) || "루트"}</div>
                    <input className="input-field" value={renameFolderName} onChange={(event) => setRenameFolderName(event.target.value)} placeholder="새 폴더 이름" />
                    <div className="audio-library-inline-actions">
                      <button type="submit" className="btn-primary" disabled={renamingFolder}>{renamingFolder ? "변경 중..." : "이름 변경"}</button>
                      <button type="button" className="btn-secondary" onClick={() => { setRenameFolderPath(""); setRenameFolderName(""); }}>닫기</button>
                    </div>
                  </form>
                </div>
              ) : null}
            </>
          ) : (
            <div className="audio-library-section-card">
              <div className="audio-library-section-head"><strong>배경음 보관함</strong><span>루트 업로드</span></div>
              <p className="audio-library-note">배경음은 현재 `public/bgm` 루트에서 관리합니다. 이번 개선에서는 다중 업로드를 우선 강화했습니다.</p>
            </div>
          )}
        </aside>

        <div className="assets-library-main audio-library-main audio-library-main-panel">
          <div className="audio-library-top-grid">
            <form className="audio-library-upload-card" onSubmit={(event) => void handleUpload(event)}>
              <div className="audio-library-section-head"><strong>다중 업로드</strong><span>{queuedFiles.length}개 대기</span></div>
              {kind === "sfx" ? (
                <select className="input-field" value={uploadTargetFolderPath} onChange={(event) => setUploadTargetFolderPath(event.target.value)}>
                  <option value="">일반 효과음 (자동용 기본 보관함)</option>
                  {sfxFolders.map((folder) => <option key={folder.path} value={folder.path}>{folder.path}</option>)}
                </select>
              ) : null}
              <label
                className={`audio-library-dropzone ${uploadDragActive ? "is-drag-over" : ""}`}
                onDragEnter={(event) => {
                  if (event.dataTransfer.files.length > 0) {
                    event.preventDefault();
                    setUploadDragActive(true);
                  }
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.files.length > 0) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setUploadDragActive(true);
                  }
                }}
                onDragLeave={() => setUploadDragActive(false)}
                onDrop={handleDropUpload}
              >
                <input key={uploadInputKey} type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" multiple className="audio-library-hidden-input" onChange={(event) => queueFiles(Array.from(event.target.files || []))} />
                <strong>여러 파일을 한 번에 선택하거나 끌어다 놓기</strong>
                <span>{kind === "sfx" ? (uploadTargetFolderPath ? `대상 폴더: ${uploadTargetFolderPath}` : "대상 분류: 일반 효과음") : "대상 폴더: public/bgm"}</span>
              </label>
              {queuedFiles.length > 0 ? (
                <div className="audio-library-queue-list">
                  {queuedFiles.map((file) => {
                    const key = `${file.name}:${file.size}:${file.lastModified}`;
                    return (
                      <div key={key} className="audio-library-queue-chip">
                        <span>{file.name}</span>
                        <button type="button" className="audio-library-inline-button" onClick={() => setQueuedFiles((current) => current.filter((item) => `${item.name}:${item.size}:${item.lastModified}` !== key))}>제외</button>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="audio-library-empty">업로드 대기열이 비어 있습니다.</div>}
              <div className="audio-library-inline-actions">
                <button type="submit" className="btn-primary" disabled={uploading || queuedFiles.length <= 0}>{uploading ? "업로드 중..." : `${queuedFiles.length}개 업로드`}</button>
                <button type="button" className="btn-secondary" onClick={() => { setQueuedFiles([]); setUploadInputKey((current) => current + 1); }} disabled={uploading || queuedFiles.length <= 0}>대기열 비우기</button>
              </div>
            </form>

            <div className="audio-library-section-card audio-library-inspector-card">
              <div className="audio-library-section-head"><strong>현재 위치</strong><span>{kind === "sfx" ? "Finder 선택 상태" : "루트 보관함"}</span></div>
              {kind === "sfx" ? (
                <>
                  <div className="audio-library-location-title">{selectedSfxFolder === ALL_SFX_FOLDERS ? "전체 효과음" : selectedSfxFolder ? getFolderLabel(selectedSfxFolder) : "일반 효과음"}</div>
                  <div className="audio-library-location-path">{selectedSfxFolder === ALL_SFX_FOLDERS ? "모든 폴더 보기" : selectedSfxFolder || "public/sfx"}</div>
                  <div className="audio-library-location-meta">
                    {selectedSfxFolder === ALL_SFX_FOLDERS
                      ? `총 ${stats.folderCount}개 폴더, ${stats.sfxCount}개 효과음`
                      : selectedSfxFolder
                        ? `이 폴더 직접 포함 ${selectedFolderMeta?.fileCount || 0}개`
                        : `일반 효과음 ${stats.generalSfxCount}개`}
                  </div>
                  <div className="audio-library-note">오른쪽 목록의 드래그 핸들을 잡아 왼쪽 폴더로 놓으면 바로 이동합니다.</div>
                  {selectedFolderMeta ? (
                    <div className="audio-library-inline-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setRenameFolderPath(selectedFolderMeta.path);
                          setRenameFolderName(getFolderLabel(selectedFolderMeta.path));
                        }}
                      >
                        폴더 수정
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => void handleDeleteFolder(selectedFolderMeta)} disabled={deletingKey === selectedFolderMeta.id}>
                        {deletingKey === selectedFolderMeta.id ? "삭제 중..." : "폴더 삭제"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="audio-library-location-title">배경음 기본 보관함</div>
                  <div className="audio-library-location-path">public/bgm</div>
                  <div className="audio-library-location-meta">배경음은 루트 기준으로 관리합니다.</div>
                </>
              )}
            </div>
          </div>

          <div className="audio-library-items-head">
            <strong>{kind === "sfx" ? (selectedSfxFolder === ALL_SFX_FOLDERS ? "전체 효과음" : selectedSfxFolder || "일반 효과음") : "배경음"}</strong>
            <span>{visibleItems.length}개 파일</span>
          </div>

          <div className="audio-library-list-shell">
            <div className="audio-library-list-header">
              <span>이름</span>
              <span>위치</span>
              <span>업데이트</span>
              <span>미리듣기 / 작업</span>
            </div>
            <div className="audio-library-list-body">
              {visibleItems.length > 0 ? visibleItems.map((item) => (
                <article key={item.id} className={`audio-library-list-row ${draggingItemId === item.id ? "is-dragging" : ""}`}>
                  <div className="audio-library-row-main">
                    {item.kind === "sfx" ? (
                      <button
                        type="button"
                        className="audio-library-drag-handle"
                        draggable={!movingKey}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("application/x-audio-library-item", item.id);
                          event.dataTransfer.setData("text/plain", item.id);
                          setDraggingItemId(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggingItemId("");
                          setDragOverFolderPath("");
                        }}
                        aria-label={`${item.fileName} 드래그 이동`}
                      >
                        ⋮⋮
                      </button>
                    ) : <span className="audio-library-row-kind">BGM</span>}
                    <div className="audio-library-row-copy">
                      <strong>{item.label}</strong>
                      <span>{item.fileName}</span>
                      <small>{item.extension.replace(".", "").toUpperCase()} · {toSizeLabel(item.sizeBytes)}</small>
                    </div>
                  </div>
                  <div className="audio-library-row-location">
                    <strong>{item.kind === "sfx" ? (item.folderPath ? getFolderLabel(item.folderPath) : "일반 효과음") : "배경음"}</strong>
                    <span>{item.kind === "sfx" ? item.folderPath || "public/sfx" : "public/bgm"}</span>
                  </div>
                  <div className="audio-library-row-updated">
                    <strong>{formatUpdatedAt(item.updatedAtMs)}</strong>
                    <span>{item.kind === "sfx" ? "효과음" : "배경음"}</span>
                  </div>
                  <div className="audio-library-row-actions">
                    <audio controls preload="none" src={item.url} className="audio-library-player" />
                    <div className="audio-library-inline-actions">
                      <a href={item.url} target="_blank" rel="noreferrer" className="btn-secondary audio-library-compact-button">열기</a>
                      <button type="button" className="btn-secondary audio-library-compact-button" onClick={() => void handleDeleteItem(item)} disabled={deletingKey === item.id || movingKey === item.id}>
                        {deletingKey === item.id ? "삭제 중..." : movingKey === item.id ? "이동 중..." : "삭제"}
                      </button>
                    </div>
                  </div>
                </article>
              )) : <div className="audio-library-empty">표시할 오디오 파일이 없습니다.</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { AssetsLatestResponse, PublishJobsResponse, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import { requestApi } from "@/lib/ui/api-client";
import type { StudioAssetSnapshot } from "@/types/studio-snapshot";

export type AssetsCategoryOption = {
  key: string;
  label: string;
};

export type AudioLibraryKind = "sfx" | "bgm";

export type AudioLibraryFolder = {
  id: string;
  kind: AudioLibraryKind;
  path: string;
  label: string;
  fileCount: number;
};

export type AudioLibraryItem = {
  id: string;
  kind: AudioLibraryKind;
  folderPath: string;
  folderLabel: string;
  fileName: string;
  label: string;
  url: string;
  extension: string;
  sizeBytes: number;
  updatedAtMs: number;
};

export type AssetsCategoriesResponse = {
  ok: boolean;
  categories?: AssetsCategoryOption[];
  workspacePermissions?: WorkspacePermissionsSummary;
};

export type AssetsCategoryMetadataResponse = {
  ok: boolean;
  categoryMetadata?: Record<string, PublishMetadata>;
};

export type AssetStudioSnapshotResponse = {
  ok: boolean;
  asset: {
    id: string;
    title: string;
    url: string;
    publishCategory?: string;
  };
  snapshot: StudioAssetSnapshot | null;
};

export type AudioLibraryResponse = {
  ok: boolean;
  folders?: AudioLibraryFolder[];
  items?: AudioLibraryItem[];
  stats?: {
    totalFiles: number;
    sfxCount: number;
    bgmCount: number;
    folderCount: number;
  };
};

export async function fetchAssetsLatest(): Promise<AssetsLatestResponse> {
  return requestApi<AssetsLatestResponse>("/api/assets/latest", { cache: "no-store" }, "업로드 자산을 불러오지 못했습니다.");
}

export async function fetchAssetStudioSnapshot(assetId: string): Promise<AssetStudioSnapshotResponse> {
  const params = new URLSearchParams({ assetId });
  return requestApi<AssetStudioSnapshotResponse>(
    `/api/assets/snapshot?${params.toString()}`,
    { cache: "no-store" },
    "자산의 스튜디오 작업 상태를 불러오지 못했습니다."
  );
}

export async function fetchAssetsCategories(): Promise<AssetsCategoriesResponse> {
  return requestApi<AssetsCategoriesResponse>("/api/publish/categories", { cache: "no-store" }, "카테고리 목록을 불러오지 못했습니다.");
}

export async function fetchAssetsJobs(): Promise<PublishJobsResponse> {
  return requestApi<PublishJobsResponse>("/api/publish/jobs", { cache: "no-store" }, "발행 작업 목록을 불러오지 못했습니다.");
}

export async function fetchAssetsCategoryMetadata(): Promise<AssetsCategoryMetadataResponse> {
  return requestApi<AssetsCategoryMetadataResponse>(
    "/api/publish/category-metadata",
    { cache: "no-store" },
    "카테고리 메타데이터를 불러오지 못했습니다."
  );
}

export async function runPublishJobAction(jobId: string, action: "cancel" | "run-now" | "delete"): Promise<{ ok: boolean }> {
  const endpoint = action === "cancel" ? "/api/publish/cancel" : action === "run-now" ? "/api/publish/run-now" : "/api/publish/delete";
  return requestApi<{ ok: boolean }>(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    },
    "작업 처리에 실패했습니다."
  );
}

export async function deleteAssetById(assetId: string): Promise<{ ok: boolean }> {
  return requestApi<{ ok: boolean }>(
    "/api/assets/delete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    },
    "자산 삭제에 실패했습니다."
  );
}

export async function fetchAudioLibrary(): Promise<AudioLibraryResponse> {
  return requestApi<AudioLibraryResponse>("/api/assets/audio-library", { cache: "no-store" }, "오디오 라이브러리를 불러오지 못했습니다.");
}

export async function createAudioLibraryFolder(kind: AudioLibraryKind, folderPath: string): Promise<{ ok: boolean; folder: AudioLibraryFolder }> {
  return requestApi<{ ok: boolean; folder: AudioLibraryFolder }>(
    "/api/assets/audio-library",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-folder",
        kind,
        folderPath,
      }),
    },
    "오디오 폴더를 만들지 못했습니다."
  );
}

export async function uploadAudioLibraryFile(input: {
  kind: AudioLibraryKind;
  folderPath?: string;
  file: File;
}): Promise<{ ok: boolean; item: AudioLibraryItem }> {
  const response = await uploadAudioLibraryFiles({
    kind: input.kind,
    folderPath: input.folderPath,
    files: [input.file],
  });
  return {
    ok: response.ok,
    item: response.items[0],
  };
}

export async function uploadAudioLibraryFiles(input: {
  kind: AudioLibraryKind;
  folderPath?: string;
  files: File[];
}): Promise<{ ok: boolean; items: AudioLibraryItem[] }> {
  const formData = new FormData();
  formData.set("kind", input.kind);
  if (input.folderPath?.trim()) formData.set("folderPath", input.folderPath.trim());
  for (const file of input.files) {
    formData.append("files", file);
  }
  return requestApi<{ ok: boolean; items: AudioLibraryItem[] }>(
    "/api/assets/audio-library",
    {
      method: "POST",
      body: formData,
    },
    "오디오 파일 업로드에 실패했습니다."
  );
}

export async function moveAudioLibraryFile(input: {
  kind: AudioLibraryKind;
  fromFolderPath?: string;
  toFolderPath?: string;
  fileName: string;
}): Promise<{ ok: boolean; item: AudioLibraryItem }> {
  return requestApi<{ ok: boolean; item: AudioLibraryItem }>(
    "/api/assets/audio-library",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move-file",
        kind: input.kind,
        fromFolderPath: input.fromFolderPath,
        toFolderPath: input.toFolderPath,
        fileName: input.fileName,
      }),
    },
    "오디오 파일 이동에 실패했습니다."
  );
}

export async function renameAudioLibraryFolder(input: {
  kind: AudioLibraryKind;
  folderPath: string;
  nextFolderPath: string;
}): Promise<{ ok: boolean; folder: AudioLibraryFolder }> {
  return requestApi<{ ok: boolean; folder: AudioLibraryFolder }>(
    "/api/assets/audio-library",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rename-folder",
        kind: input.kind,
        folderPath: input.folderPath,
        nextFolderPath: input.nextFolderPath,
      }),
    },
    "오디오 폴더 이름 변경에 실패했습니다."
  );
}

export async function deleteAudioLibraryFile(input: {
  kind: AudioLibraryKind;
  folderPath?: string;
  fileName: string;
}): Promise<{ ok: boolean; deletedFileName: string }> {
  const params = new URLSearchParams();
  params.set("kind", input.kind);
  params.set("fileName", input.fileName);
  if (input.folderPath?.trim()) params.set("folderPath", input.folderPath.trim());
  return requestApi<{ ok: boolean; deletedFileName: string }>(
    `/api/assets/audio-library?${params.toString()}`,
    {
      method: "DELETE",
    },
    "오디오 파일 삭제에 실패했습니다."
  );
}

export async function deleteAudioLibraryFolder(input: {
  kind: AudioLibraryKind;
  folderPath: string;
}): Promise<{ ok: boolean; deletedFolderPath: string }> {
  const params = new URLSearchParams();
  params.set("kind", input.kind);
  params.set("folderPath", input.folderPath);
  return requestApi<{ ok: boolean; deletedFolderPath: string }>(
    `/api/assets/audio-library?${params.toString()}`,
    {
      method: "DELETE",
    },
    "오디오 폴더 삭제에 실패했습니다."
  );
}

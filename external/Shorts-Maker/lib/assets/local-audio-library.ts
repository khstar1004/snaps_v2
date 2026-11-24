import { mkdir, readdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

export type LocalAudioLibraryKind = "sfx" | "bgm";

export type LocalAudioLibraryFolder = {
  id: string;
  kind: LocalAudioLibraryKind;
  path: string;
  label: string;
  fileCount: number;
};

export type LocalAudioLibraryFile = {
  id: string;
  kind: LocalAudioLibraryKind;
  folderPath: string;
  folderLabel: string;
  fileName: string;
  label: string;
  url: string;
  extension: string;
  sizeBytes: number;
  updatedAtMs: number;
};

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const MAX_FOLDER_DEPTH = 6;

function toLabel(value: string): string {
  return value
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function toSafeSegment(value: string): string {
  const compact = value
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return compact;
}

function normalizeFolderPath(kind: LocalAudioLibraryKind, value: string): string {
  if (kind === "bgm") return "";
  const safe = value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => toSafeSegment(segment))
    .filter(Boolean)
    .slice(0, MAX_FOLDER_DEPTH)
    .join("/");
  return safe;
}

function resolveRoot(kind: LocalAudioLibraryKind): string {
  return join(process.cwd(), "public", kind === "sfx" ? "sfx" : "bgm");
}

function resolveFolderAbsolutePath(kind: LocalAudioLibraryKind, folderPath: string): string {
  const root = resolveRoot(kind);
  const safeFolderPath = normalizeFolderPath(kind, folderPath);
  return kind === "sfx" && safeFolderPath ? join(root, safeFolderPath) : root;
}

function resolvePublicUrl(kind: LocalAudioLibraryKind, folderPath: string, fileName: string): string {
  if (kind === "sfx") {
    const folderSegments = folderPath
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return folderSegments ? `/sfx/${folderSegments}/${encodeURIComponent(fileName)}` : `/sfx/${encodeURIComponent(fileName)}`;
  }
  return `/bgm/${encodeURIComponent(fileName)}`;
}

async function pathExists(absolutePath: string): Promise<boolean> {
  return stat(absolutePath)
    .then(() => true)
    .catch(() => false);
}

async function listSfxFolderPaths(rootPath: string, parentFolderPath = ""): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const nextPath = [parentFolderPath, entry.name].filter(Boolean).join("/");
      return normalizeFolderPath("sfx", nextPath);
    })
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));
  const nested = await Promise.all(folders.map((folderPath) => listSfxFolderPaths(resolveFolderAbsolutePath("sfx", folderPath), folderPath)));
  return folders.concat(...nested);
}

function toSafeUploadFileName(fileName: string): string {
  const extension = extname(fileName || "").toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error("지원하는 오디오 형식은 mp3, wav, ogg, m4a 입니다.");
  }
  const baseName = fileName.slice(0, Math.max(0, fileName.length - extension.length));
  const safeBase = toSafeSegment(baseName) || "audio";
  return `${safeBase}${extension}`;
}

function normalizeExistingFileName(fileName: string): string {
  const safe = fileName.trim();
  if (!safe || safe.includes("/") || safe.includes("\\") || safe.includes("..")) {
    throw new Error("삭제할 오디오 파일명이 올바르지 않습니다.");
  }
  if (!AUDIO_EXTENSIONS.has(extname(safe).toLowerCase())) {
    throw new Error("지원하는 오디오 형식은 mp3, wav, ogg, m4a 입니다.");
  }
  return safe;
}

async function listAudioFilesInFolder(kind: LocalAudioLibraryKind, folderPath: string): Promise<LocalAudioLibraryFile[]> {
  const absoluteFolderPath = resolveFolderAbsolutePath(kind, folderPath);
  const folderLabel = kind === "sfx" ? toLabel(folderPath) || folderPath : "기본";
  const entries = await readdir(absoluteFolderPath, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const extension = extname(entry.name).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(extension)) return null;
        const stats = await stat(join(absoluteFolderPath, entry.name)).catch(() => null);
        return {
          id: `${kind}:${folderPath || "_root"}:${entry.name}`,
          kind,
          folderPath,
          folderLabel,
          fileName: entry.name,
          label: toLabel(entry.name) || entry.name,
          url: resolvePublicUrl(kind, folderPath, entry.name),
          extension,
          sizeBytes: stats?.size || 0,
          updatedAtMs: Number(stats?.mtimeMs) || 0,
        } satisfies LocalAudioLibraryFile;
      })
  );
  return files.filter((item): item is LocalAudioLibraryFile => Boolean(item)).sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.fileName.localeCompare(right.fileName, "ko"));
}

export async function listLocalAudioLibrary(): Promise<{
  folders: LocalAudioLibraryFolder[];
  items: LocalAudioLibraryFile[];
}> {
  const folders: LocalAudioLibraryFolder[] = [];
  const items: LocalAudioLibraryFile[] = [];

  const sfxRoot = resolveRoot("sfx");
  await mkdir(sfxRoot, { recursive: true });
  const sfxRootItems = await listAudioFilesInFolder("sfx", "");
  items.push(...sfxRootItems);
  const sfxFolders = await listSfxFolderPaths(sfxRoot);

  for (const folderPath of sfxFolders) {
    const folderItems = await listAudioFilesInFolder("sfx", folderPath);
    folders.push({
      id: `sfx:${folderPath}`,
      kind: "sfx",
      path: folderPath,
      label: toLabel(folderPath) || folderPath,
      fileCount: folderItems.length,
    });
    items.push(...folderItems);
  }

  const bgmRoot = resolveRoot("bgm");
  await mkdir(bgmRoot, { recursive: true });
  const bgmItems = await listAudioFilesInFolder("bgm", "");
  folders.push({
    id: "bgm:root",
    kind: "bgm",
    path: "",
    label: "기본",
    fileCount: bgmItems.length,
  });
  items.push(...bgmItems);

  return {
    folders,
    items: items.sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.fileName.localeCompare(right.fileName, "ko")),
  };
}

export async function createLocalAudioFolder(kind: LocalAudioLibraryKind, folderPath: string): Promise<LocalAudioLibraryFolder> {
  if (kind !== "sfx") {
    throw new Error("배경음은 별도 폴더 없이 기본 보관함만 사용합니다.");
  }
  const safeFolderPath = normalizeFolderPath(kind, folderPath);
  if (!safeFolderPath) {
    throw new Error("효과음 폴더 이름을 입력해 주세요.");
  }
  await mkdir(resolveFolderAbsolutePath(kind, safeFolderPath), { recursive: true });
  return {
    id: `sfx:${safeFolderPath}`,
    kind: "sfx",
    path: safeFolderPath,
    label: toLabel(safeFolderPath) || safeFolderPath,
    fileCount: 0,
  };
}

export async function uploadLocalAudioFile(input: {
  kind: LocalAudioLibraryKind;
  folderPath?: string;
  file: File;
}): Promise<LocalAudioLibraryFile> {
  const safeFolderPath = normalizeFolderPath(input.kind, input.folderPath || "");
  const safeFileName = toSafeUploadFileName(input.file.name);
  const targetDirectory = resolveFolderAbsolutePath(input.kind, safeFolderPath);
  await mkdir(targetDirectory, { recursive: true });
  const absoluteFilePath = join(targetDirectory, safeFileName);
  const exists = await pathExists(absoluteFilePath);
  if (exists) {
    throw new Error("같은 이름의 오디오 파일이 이미 있습니다. 파일명을 바꿔 업로드해 주세요.");
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());
  await writeFile(absoluteFilePath, bytes);
  const stats = await stat(absoluteFilePath);
  return {
    id: `${input.kind}:${safeFolderPath || "_root"}:${safeFileName}`,
    kind: input.kind,
    folderPath: safeFolderPath,
    folderLabel: input.kind === "sfx" ? toLabel(safeFolderPath) || safeFolderPath : "기본",
    fileName: safeFileName,
    label: toLabel(safeFileName) || safeFileName,
    url: resolvePublicUrl(input.kind, safeFolderPath, safeFileName),
    extension: extname(safeFileName).toLowerCase(),
    sizeBytes: stats.size,
    updatedAtMs: Number(stats.mtimeMs) || Date.now(),
  };
}

export async function uploadLocalAudioFiles(input: {
  kind: LocalAudioLibraryKind;
  folderPath?: string;
  files: File[];
}): Promise<LocalAudioLibraryFile[]> {
  const uploaded: LocalAudioLibraryFile[] = [];
  for (const file of input.files) {
    uploaded.push(
      await uploadLocalAudioFile({
        kind: input.kind,
        folderPath: input.folderPath,
        file,
      })
    );
  }
  return uploaded;
}

export async function deleteLocalAudioFile(input: {
  kind: LocalAudioLibraryKind;
  folderPath?: string;
  fileName: string;
}): Promise<void> {
  const safeFolderPath = normalizeFolderPath(input.kind, input.folderPath || "");
  const safeFileName = normalizeExistingFileName(input.fileName);
  const absoluteFilePath = join(resolveFolderAbsolutePath(input.kind, safeFolderPath), safeFileName);
  await unlink(absoluteFilePath).catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    throw error;
  });
}

export async function deleteLocalAudioFolder(kind: LocalAudioLibraryKind, folderPath: string): Promise<void> {
  if (kind !== "sfx") {
    throw new Error("배경음 기본 보관함은 삭제할 수 없습니다.");
  }
  const safeFolderPath = normalizeFolderPath(kind, folderPath);
  if (!safeFolderPath) {
    throw new Error("삭제할 폴더가 올바르지 않습니다.");
  }
  const absoluteFolderPath = resolveFolderAbsolutePath(kind, safeFolderPath);
  const entries = await readdir(absoluteFolderPath, { withFileTypes: true }).catch(() => []);
  if (entries.length > 0) {
    throw new Error("폴더 안에 파일이 남아 있어 삭제할 수 없습니다. 먼저 파일을 비워 주세요.");
  }
  await rmdir(absoluteFolderPath).catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    throw error;
  });
}

export async function moveLocalAudioFile(input: {
  kind: LocalAudioLibraryKind;
  fromFolderPath?: string;
  toFolderPath?: string;
  fileName: string;
}): Promise<LocalAudioLibraryFile> {
  const fromFolderPath = normalizeFolderPath(input.kind, input.fromFolderPath || "");
  const toFolderPath = normalizeFolderPath(input.kind, input.toFolderPath || "");
  if (input.kind === "sfx" && !toFolderPath) {
    throw new Error("효과음은 이동할 대상 폴더가 필요합니다.");
  }
  const safeFileName = normalizeExistingFileName(input.fileName);
  const sourcePath = join(resolveFolderAbsolutePath(input.kind, fromFolderPath), safeFileName);
  const targetDirectory = resolveFolderAbsolutePath(input.kind, toFolderPath);
  const targetPath = join(targetDirectory, safeFileName);
  if (!(await pathExists(sourcePath))) {
    throw new Error("이동할 오디오 파일을 찾지 못했습니다.");
  }
  if (sourcePath === targetPath) {
    const stats = await stat(sourcePath);
    return {
      id: `${input.kind}:${toFolderPath || "_root"}:${safeFileName}`,
      kind: input.kind,
      folderPath: toFolderPath,
      folderLabel: input.kind === "sfx" ? toLabel(toFolderPath) || toFolderPath : "기본",
      fileName: safeFileName,
      label: toLabel(safeFileName) || safeFileName,
      url: resolvePublicUrl(input.kind, toFolderPath, safeFileName),
      extension: extname(safeFileName).toLowerCase(),
      sizeBytes: stats.size,
      updatedAtMs: Number(stats.mtimeMs) || Date.now(),
    };
  }
  await mkdir(targetDirectory, { recursive: true });
  if (await pathExists(targetPath)) {
    throw new Error("대상 폴더에 같은 이름의 파일이 이미 있습니다.");
  }
  await rename(sourcePath, targetPath);
  const stats = await stat(targetPath);
  return {
    id: `${input.kind}:${toFolderPath || "_root"}:${safeFileName}`,
    kind: input.kind,
    folderPath: toFolderPath,
    folderLabel: input.kind === "sfx" ? toLabel(toFolderPath) || toFolderPath : "기본",
    fileName: safeFileName,
    label: toLabel(safeFileName) || safeFileName,
    url: resolvePublicUrl(input.kind, toFolderPath, safeFileName),
    extension: extname(safeFileName).toLowerCase(),
    sizeBytes: stats.size,
    updatedAtMs: Number(stats.mtimeMs) || Date.now(),
  };
}

export async function renameLocalAudioFolder(kind: LocalAudioLibraryKind, folderPath: string, nextFolderPath: string): Promise<LocalAudioLibraryFolder> {
  if (kind !== "sfx") {
    throw new Error("배경음 기본 보관함은 이름을 바꿀 수 없습니다.");
  }
  const safeFolderPath = normalizeFolderPath(kind, folderPath);
  const safeNextFolderPath = normalizeFolderPath(kind, nextFolderPath);
  if (!safeFolderPath || !safeNextFolderPath) {
    throw new Error("폴더 경로가 올바르지 않습니다.");
  }
  if (safeFolderPath === safeNextFolderPath) {
    const items = await listAudioFilesInFolder("sfx", safeNextFolderPath);
    return {
      id: `sfx:${safeNextFolderPath}`,
      kind: "sfx",
      path: safeNextFolderPath,
      label: toLabel(safeNextFolderPath) || safeNextFolderPath,
      fileCount: items.length,
    };
  }
  if (safeNextFolderPath.startsWith(`${safeFolderPath}/`)) {
    throw new Error("폴더를 자기 자신의 하위 폴더로 이동할 수 없습니다.");
  }
  const sourcePath = resolveFolderAbsolutePath(kind, safeFolderPath);
  const targetPath = resolveFolderAbsolutePath(kind, safeNextFolderPath);
  if (!(await pathExists(sourcePath))) {
    throw new Error("이름을 바꿀 폴더를 찾지 못했습니다.");
  }
  if (await pathExists(targetPath)) {
    throw new Error("같은 이름의 대상 폴더가 이미 있습니다.");
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);
  const items = await listAudioFilesInFolder("sfx", safeNextFolderPath);
  return {
    id: `sfx:${safeNextFolderPath}`,
    kind: "sfx",
    path: safeNextFolderPath,
    label: toLabel(safeNextFolderPath) || safeNextFolderPath,
    fileCount: items.length,
  };
}

export function isSupportedLocalAudioFileName(fileName: string): boolean {
  return AUDIO_EXTENSIONS.has(extname(fileName || "").toLowerCase());
}

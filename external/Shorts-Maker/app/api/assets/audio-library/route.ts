import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  createLocalAudioFolder,
  deleteLocalAudioFile,
  deleteLocalAudioFolder,
  listLocalAudioLibrary,
  moveLocalAudioFile,
  renameLocalAudioFolder,
  uploadLocalAudioFile,
  uploadLocalAudioFiles,
  type LocalAudioLibraryKind,
} from "@/lib/assets/local-audio-library";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseKind(value: unknown): LocalAudioLibraryKind {
  const safe = asString(value);
  return safe === "bgm" ? "bgm" : "sfx";
}

function toErrorResponse(message: string, status = 400, errorCode = "AUDIO_LIBRARY_REQUEST_INVALID") {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      errorCode,
      retryable: false,
    },
    { status }
  );
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  void user;

  try {
    const library = await listLocalAudioLibrary();
    const stats = {
      totalFiles: library.items.length,
      sfxCount: library.items.filter((item) => item.kind === "sfx").length,
      bgmCount: library.items.filter((item) => item.kind === "bgm").length,
      folderCount: library.folders.length,
    };
    return NextResponse.json({
      ok: true,
      folders: library.folders,
      items: library.items,
      stats,
    });
  } catch (error) {
    return toErrorResponse(error instanceof Error ? error.message : String(error), 500, "AUDIO_LIBRARY_FETCH_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  void user;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const kind = parseKind(formData.get("kind"));
      const folderPath = asString(formData.get("folderPath"));
      const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
      const singleFile = formData.get("file");
      if (files.length <= 0 && singleFile instanceof File) {
        files.push(singleFile);
      }
      if (files.length <= 0) {
        return toErrorResponse("업로드할 오디오 파일이 필요합니다.", 400, "AUDIO_LIBRARY_FILE_REQUIRED");
      }
      const items =
        files.length === 1
          ? [
              await uploadLocalAudioFile({
                kind,
                folderPath,
                file: files[0],
              }),
            ]
          : await uploadLocalAudioFiles({
              kind,
              folderPath,
              files,
            });
      return NextResponse.json({
        ok: true,
        item: items[0],
        items,
      });
    }

    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const action = asString(row.action);
    if (action === "create-folder") {
      const folder = await createLocalAudioFolder(parseKind(row.kind), asString(row.folderPath));
      return NextResponse.json({
        ok: true,
        folder,
      });
    }
    if (action === "move-file") {
      const item = await moveLocalAudioFile({
        kind: parseKind(row.kind),
        fromFolderPath: asString(row.fromFolderPath),
        toFolderPath: asString(row.toFolderPath),
        fileName: asString(row.fileName),
      });
      return NextResponse.json({
        ok: true,
        item,
      });
    }
    if (action === "rename-folder") {
      const folder = await renameLocalAudioFolder(parseKind(row.kind), asString(row.folderPath), asString(row.nextFolderPath));
      return NextResponse.json({
        ok: true,
        folder,
      });
    }
    return toErrorResponse("지원하지 않는 오디오 라이브러리 작업입니다.", 400, "AUDIO_LIBRARY_ACTION_INVALID");
  } catch (error) {
    return toErrorResponse(error instanceof Error ? error.message : String(error), 400, "AUDIO_LIBRARY_CREATE_FAILED");
  }
}

export async function DELETE(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  void user;

  try {
    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get("kind"));
    const folderPath = asString(searchParams.get("folderPath"));
    const fileName = asString(searchParams.get("fileName"));
    if (fileName) {
      await deleteLocalAudioFile({
        kind,
        folderPath,
        fileName,
      });
      return NextResponse.json({
        ok: true,
        deletedFileName: fileName,
      });
    }
    await deleteLocalAudioFolder(kind, folderPath);
    return NextResponse.json({
      ok: true,
      deletedFolderPath: folderPath,
    });
  } catch (error) {
    return toErrorResponse(error instanceof Error ? error.message : String(error), 400, "AUDIO_LIBRARY_DELETE_FAILED");
  }
}

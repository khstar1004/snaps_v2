import { NextResponse } from "next/server";
import { listLocalAudioLibrary } from "@/lib/assets/local-audio-library";
import { GENERAL_STUDIO_SFX_CATEGORY_ID, type StudioSfxCategoryOption } from "@/lib/studio/audio-options";

export const runtime = "nodejs";

function toLabel(value: string): string {
  return value
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function toFileTag(folderPath: string, fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/u, "").trim();
  return folderPath ? `file:${folderPath}/${baseName}` : `file:${baseName}`;
}

export async function GET() {
  try {
    const library = await listLocalAudioLibrary();
    const categories: StudioSfxCategoryOption[] = [];
    const allSfxFiles = library.items
      .filter((item) => item.kind === "sfx")
      .map((item) => ({
        id: toFileTag(item.folderPath, item.fileName),
        tag: GENERAL_STUDIO_SFX_CATEGORY_ID,
        label: toLabel(item.label || item.fileName),
        path: item.url,
        defaultGainDb: -3,
      }));

    if (allSfxFiles.length > 0) {
      categories.push({
        id: GENERAL_STUDIO_SFX_CATEGORY_ID,
        label: GENERAL_STUDIO_SFX_CATEGORY_ID,
        files: allSfxFiles,
      });
    }

    for (const folder of library.folders.filter((item) => item.kind === "sfx")) {
      const categoryId = folder.path.trim();
      if (!categoryId) continue;
      const files = library.items
        .filter((item) => item.kind === "sfx" && item.folderPath === categoryId)
        .map((item) => {
          return {
            id: toFileTag(item.folderPath, item.fileName),
            tag: categoryId,
            label: toLabel(item.label || item.fileName),
            path: item.url,
            defaultGainDb: -3,
          };
        });
      if (files.length <= 0) continue;
      categories.push({
        id: categoryId,
        label: folder.label || toLabel(categoryId),
        files,
      });
    }

    categories.sort((a, b) => {
      if (a.id === GENERAL_STUDIO_SFX_CATEGORY_ID) return -1;
      if (b.id === GENERAL_STUDIO_SFX_CATEGORY_ID) return 1;
      return a.label.localeCompare(b.label, "ko");
    });
    return NextResponse.json({
      ok: true,
      categories,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

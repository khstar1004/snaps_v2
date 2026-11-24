import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import { createStudioMediaFolder, listStudioMediaFolders } from "@/lib/studio/media-assets";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const folders = await listStudioMediaFolders({ userId: user.id });
    return NextResponse.json({
      ok: true,
      folders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_STUDIO_MEDIA_FOLDER_QUERY", "STUDIO_MEDIA_FOLDER_FETCH_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const folderPath = asString(row.folderPath);
    if (!folderPath) {
      throw new Error("folderPath is required");
    }
    const createdFolderPath = await createStudioMediaFolder({
      userId: user.id,
      folderPath,
    });
    return NextResponse.json({
      ok: true,
      folderPath: createdFolderPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_STUDIO_MEDIA_FOLDER_CREATE", "STUDIO_MEDIA_FOLDER_CREATE_FAILED");
  }
}

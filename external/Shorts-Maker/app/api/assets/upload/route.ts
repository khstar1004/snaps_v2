import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { createVideoAsset } from "@/lib/publish/publish-store";
import { normalizeCategory } from "@/lib/publish/categories";
import { buildShortsStorageObjectKey } from "@/lib/storage/object-key";
import { uploadSupabaseStorageFile } from "@/lib/supabase/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  try {
    const formData = await request.formData();
    const title = String(formData.get("title") || "숏츠").trim();
    const publishCategory = normalizeCategory(String(formData.get("publishCategory") || ""));
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!canEditCategory(scope, publishCategory)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)으로만 자산을 업로드할 수 있습니다.");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return toApiErrorResponse("파일이 필요합니다.", {
        status: 400,
        errorCode: "ASSET_FILE_REQUIRED",
        retryable: false,
      });
    }

    const ext = file.type === "video/mp4" ? "mp4" : "bin";
    const id = randomUUID();
    const path = buildShortsStorageObjectKey({
      title,
      id,
      ext,
    });
    const stored = await uploadSupabaseStorageFile({
      path,
      file,
      contentType: file.type || "application/octet-stream",
    });

    const record = await createVideoAsset({
      userId: user.id,
      id,
      title: title || "숏츠",
      url: stored.publicUrl,
      publishCategory: publishCategory || undefined,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
      storageBucket: stored.bucket,
      storagePath: stored.path,
    });

    return NextResponse.json({ ok: true, asset: record });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("SUPABASE_URL") || message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return toApiErrorResponse(message, {
        status: 500,
        errorCode: "ASSET_UPLOAD_STORAGE_CONFIG_MISSING",
        retryable: false,
      });
    }
    return toApiErrorResponse(message, {
      status: 400,
      errorCode: "ASSET_UPLOAD_INVALID",
      retryable: false,
    });
  }
}

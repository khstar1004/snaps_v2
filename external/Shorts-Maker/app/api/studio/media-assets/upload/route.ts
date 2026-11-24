import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { rebaseLocalStorageUrlsToRequestOrigin } from "@/lib/local/asset-url-origin";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import {
  buildStudioMediaAssetMetadata,
  createOrUpdateStudioMediaAsset,
  isStudioMediaAssetsEnabled,
  normalizeStudioMediaFolderPath,
  resolveStudioMediaAssetUrls,
} from "@/lib/studio/media-assets";
import { getSharedStudioLibraryScope } from "@/lib/studio/library-scope";
import { buildStudioMediaStorageObjectKey } from "@/lib/storage/object-key";
import { uploadSupabaseStorageFile } from "@/lib/supabase/storage";
import type { SlideMediaKind } from "@/types/studio-json";

export const runtime = "nodejs";

const SUPPORTED_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      )
    );
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function asJsonObject(value: FormDataEntryValue | null): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseMetadataOrigin(value: FormDataEntryValue | null): "manual" | "auto" {
  return asString(value) === "auto" ? "auto" : "manual";
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/u, "").trim();
}

function resolveMediaKind(file: File): SlideMediaKind {
  const type = (file.type || "").toLowerCase();
  if (type === "image/gif") return "animated_image";
  if (type.startsWith("video/")) return "video";
  return "image";
}

function resolveFileExtension(file: File): string {
  const type = (file.type || "").toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "video/mp4") return "mp4";
  if (type === "video/webm") return "webm";
  const fallback = file.name.split(".").pop()?.trim().toLowerCase();
  return fallback || "bin";
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    if (!isStudioMediaAssetsEnabled()) {
      throw new Error("studio media assets storage is not configured");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("file is required");
    }
    if (!SUPPORTED_UPLOAD_TYPES.has((file.type || "").toLowerCase())) {
      throw new Error("supported file types: png, jpg, webp, gif, mp4, webm");
    }

    const mediaKind = resolveMediaKind(file);
    const title = asString(formData.get("title")) || stripExtension(file.name) || "업로드 자산";
    const summary = asString(formData.get("summary"));
    const folderPath = normalizeStudioMediaFolderPath(asString(formData.get("folderPath")));
    const manualTags = asStringArray(formData.get("tags"));
    const manualEmotionTags = asStringArray(formData.get("emotionTags"));
    const manualQueryHints = asStringArray(formData.get("queryHints"));
    const metadataOrigin = parseMetadataOrigin(formData.get("metadataOrigin"));
    const autoSourceMetadata = asJsonObject(formData.get("autoSourceMetadata"));
    const metadata = buildStudioMediaAssetMetadata({
      title,
      summary,
      provider: "manual",
      mediaKind,
      queryHints: metadataOrigin === "auto" ? manualQueryHints : [],
      tags: metadataOrigin === "auto" ? manualTags : [],
      emotionTags: metadataOrigin === "auto" ? manualEmotionTags : [],
      extraTexts: [stripExtension(file.name)],
    });

    const assetId = randomUUID();
    const ext = resolveFileExtension(file);
    const path = buildStudioMediaStorageObjectKey({
      scope: getSharedStudioLibraryScope(),
      folderPath,
      title,
      id: assetId,
      ext,
    });
    const stored = await uploadSupabaseStorageFile({
      path,
      file,
      contentType: file.type || "application/octet-stream",
    });

    const item = await createOrUpdateStudioMediaAsset({
      userId: user.id,
      provider: "manual",
      providerAssetId: assetId,
      title,
      summary: metadata.summary,
      mediaKind,
      sourceUrl: stored.publicUrl,
      sourceMediaUrl: mediaKind === "image" ? undefined : stored.publicUrl,
      storageUrl: mediaKind === "video" ? undefined : stored.publicUrl,
      storageMediaUrl: mediaKind === "image" ? undefined : stored.publicUrl,
      tags: metadataOrigin === "auto" ? metadata.tags : manualTags,
      emotionTags: metadataOrigin === "auto" ? metadata.emotionTags : manualEmotionTags,
      queryHints: metadataOrigin === "auto" ? metadata.queryHints : manualQueryHints,
      folderPath,
      metadataOrigin,
      autoSourceMetadata,
    });
    const urls = resolveStudioMediaAssetUrls(item);

    const responsePayload = {
      ok: true,
      item: {
        ...item,
        imageUrl: urls.imageUrl,
        mediaUrl: urls.mediaUrl,
      },
    };
    return NextResponse.json(rebaseLocalStorageUrlsToRequestOrigin(responsePayload, request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(
      message,
      "INVALID_STUDIO_MEDIA_ASSET_UPLOAD",
      "STUDIO_MEDIA_ASSET_UPLOAD_FAILED",
      ["file", "supported file types", "configured"]
    );
  }
}

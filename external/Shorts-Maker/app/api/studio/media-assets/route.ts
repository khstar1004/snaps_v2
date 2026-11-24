import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { rebaseLocalStorageUrlsToRequestOrigin } from "@/lib/local/asset-url-origin";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import {
  createOrUpdateStudioMediaAsset,
  deleteStudioMediaAsset,
  isStudioMediaAssetsEnabled,
  listStudioMediaAssets,
  listStudioMediaFolders,
  resolveStudioMediaAssetUrls,
  updateStudioMediaAsset,
} from "@/lib/studio/media-assets";
import type { SlideMediaKind } from "@/types/studio-json";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObjectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function asPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseMediaKind(value: unknown): SlideMediaKind | undefined {
  const safe = asString(value);
  return safe === "image" || safe === "video" || safe === "animated_image" ? safe : undefined;
}

function parseMetadataOrigin(value: unknown): "manual" | "auto" {
  return asString(value) === "auto" ? "auto" : "manual";
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const { searchParams } = new URL(request.url);
    const items = isStudioMediaAssetsEnabled()
      ? await listStudioMediaAssets({
          userId: user.id,
          limit: asPositiveInt(searchParams.get("limit"), 200, 1, 500),
          query: asString(searchParams.get("query")),
          tag: asString(searchParams.get("tag")),
          emotionTag: asString(searchParams.get("emotionTag")),
          mediaKind: (asString(searchParams.get("mediaKind")) as "all" | "image" | "motion") || "all",
          folderPath: asString(searchParams.get("folderPath")),
        })
      : [];

    const tagCounts: Record<string, number> = {};
    const emotionTagCounts: Record<string, number> = {};
    const folderCounts: Record<string, number> = {};
    let stillCount = 0;
    let motionCount = 0;
    const payloadItems = items.map((item) => {
      const urls = resolveStudioMediaAssetUrls(item);
      if (item.mediaKind === "video" || item.mediaKind === "animated_image") motionCount += 1;
      else stillCount += 1;
      const folderPath = item.folderPath || "";
      if (folderPath) {
        folderCounts[folderPath] = (folderCounts[folderPath] || 0) + 1;
      }
      for (const tag of item.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
      for (const tag of item.emotionTags || []) {
        emotionTagCounts[tag] = (emotionTagCounts[tag] || 0) + 1;
      }
      return {
        ...item,
        imageUrl: urls.imageUrl,
        mediaUrl: urls.mediaUrl,
      };
    });
    const folderPaths = await listStudioMediaFolders({
      userId: user.id,
      assetFolderPaths: payloadItems.map((item) => item.folderPath || ""),
    });

    const responsePayload = {
      ok: true,
      enabled: isStudioMediaAssetsEnabled(),
      items: payloadItems,
      stats: {
        total: payloadItems.length,
        stillCount,
        motionCount,
        tagCounts,
        emotionTagCounts,
        folderCounts,
        folderPaths,
      },
    };
    return NextResponse.json(rebaseLocalStorageUrlsToRequestOrigin(responsePayload, request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_STUDIO_MEDIA_ASSETS_QUERY", "STUDIO_MEDIA_ASSETS_FETCH_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const sourceUrl = asString(row.sourceUrl) || asString(row.url);
    const storageUrl = asString(row.storageUrl);
    if (!sourceUrl && !storageUrl) {
      throw new Error("sourceUrl is required");
    }
    const item = await createOrUpdateStudioMediaAsset({
      userId: user.id,
      provider: asString(row.provider) || "manual",
      providerAssetId: asString(row.providerAssetId) || undefined,
      title: asString(row.title) || undefined,
      summary: asString(row.summary) || undefined,
      mediaKind: parseMediaKind(row.mediaKind),
      sourceUrl: sourceUrl || undefined,
      sourceMediaUrl: asString(row.sourceMediaUrl) || asString(row.mediaUrl) || undefined,
      sourcePageUrl: asString(row.sourcePageUrl) || asString(row.pageUrl) || undefined,
      storageUrl: storageUrl || undefined,
      storageMediaUrl: asString(row.storageMediaUrl) || undefined,
      tags: asStringArray(row.tags),
      emotionTags: asStringArray(row.emotionTags),
      queryHints: asStringArray(row.queryHints),
      folderPath: Object.prototype.hasOwnProperty.call(row, "folderPath") ? asString(row.folderPath) : undefined,
      metadataOrigin: parseMetadataOrigin(row.metadataOrigin),
      autoSourceMetadata: asObjectRecord(row.autoSourceMetadata),
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
    return toStudioFailureResponse(message, "INVALID_STUDIO_MEDIA_ASSETS_CREATE", "STUDIO_MEDIA_ASSETS_CREATE_FAILED");
  }
}

export async function PATCH(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const id = asString(row.id);
    if (!id) throw new Error("id is required");
    const item = await updateStudioMediaAsset({
      id,
      userId: user.id,
      isFavorite: typeof row.isFavorite === "boolean" ? row.isFavorite : undefined,
      title: typeof row.title === "string" ? row.title : undefined,
      summary: typeof row.summary === "string" ? row.summary : undefined,
      tags: Array.isArray(row.tags) ? asStringArray(row.tags) : undefined,
      emotionTags: Array.isArray(row.emotionTags) ? asStringArray(row.emotionTags) : undefined,
      queryHints: Array.isArray(row.queryHints) ? asStringArray(row.queryHints) : undefined,
      folderPath: Object.prototype.hasOwnProperty.call(row, "folderPath") ? asString(row.folderPath) : undefined,
    });
    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: "자산을 찾지 못했습니다.",
          errorCode: "STUDIO_MEDIA_ASSET_NOT_FOUND",
          retryable: false,
        },
        { status: 404 }
      );
    }
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
    return toStudioFailureResponse(message, "INVALID_STUDIO_MEDIA_ASSETS_PATCH", "STUDIO_MEDIA_ASSETS_PATCH_FAILED");
  }
}

export async function DELETE(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const { searchParams } = new URL(request.url);
    const id = asString(searchParams.get("id"));
    if (!id) throw new Error("id is required");
    await deleteStudioMediaAsset(id, user.id);
    return NextResponse.json({
      ok: true,
      deletedId: id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_STUDIO_MEDIA_ASSETS_DELETE", "STUDIO_MEDIA_ASSETS_DELETE_FAILED");
  }
}

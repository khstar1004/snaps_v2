import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import {
  countMemeLibraryByEmotionTag,
  deleteMemeLibraryItem,
  isMemeLibraryStoreEnabled,
  listMemeLibraryItems,
  saveMemeLibraryItem,
  updateMemeLibraryItem,
} from "@/lib/studio/meme-library";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const { searchParams } = new URL(request.url);
    const limit = asPositiveInt(searchParams.get("limit"), 120, 1, 500);
    const query = asString(searchParams.get("query"));
    const tag = asString(searchParams.get("tag"));
    const emotionTag = asString(searchParams.get("emotionTag"));
    const mediaKindRaw = asString(searchParams.get("mediaKind"));
    const mediaKind =
      mediaKindRaw === "image" || mediaKindRaw === "motion" || mediaKindRaw === "all" ? mediaKindRaw : "all";
    const enabled = isMemeLibraryStoreEnabled(user.id);
    const items = enabled
      ? await listMemeLibraryItems({
          limit,
          query,
          tag,
          emotionTag,
          mediaKind,
          userScope: user.id,
        })
      : [];
    const emotionTagCounts = enabled ? await countMemeLibraryByEmotionTag({ userScope: user.id }) : {};
    const tagCounts: Record<string, number> = {};
    let stillCount = 0;
    let motionCount = 0;
    for (const item of items) {
      if (item.mediaKind === "video" || item.mediaKind === "animated_image") motionCount += 1;
      else stillCount += 1;
      for (const tagValue of item.tags || []) {
        const key = tagValue.trim();
        if (!key) continue;
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      }
    }
    return NextResponse.json({
      ok: true,
      enabled,
      items,
      stats: {
        total: items.length,
        stillCount,
        motionCount,
        emotionTagCounts,
        tagCounts,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_MEME_LIBRARY_QUERY", "MEME_LIBRARY_FETCH_FAILED");
  }
}

export async function PATCH(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const id = asString(row.id);
    if (!id) {
      throw new Error("id is required");
    }
    const item = await updateMemeLibraryItem({
      id,
      title: typeof row.title === "string" ? row.title : undefined,
      tags: Array.isArray(row.tags) ? asStringArray(row.tags) : undefined,
      emotionTags: Array.isArray(row.emotionTags) ? asStringArray(row.emotionTags) : undefined,
      queryHints: Array.isArray(row.queryHints) ? asStringArray(row.queryHints) : undefined,
      userScope: user.id,
    });
    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: "저장된 항목을 찾지 못했습니다.",
          errorCode: "MEME_LIBRARY_ITEM_NOT_FOUND",
          retryable: false,
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_MEME_LIBRARY_PATCH", "MEME_LIBRARY_PATCH_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const url = asString(row.url);
    const mediaUrl = asString(row.mediaUrl);
    const mediaKindRaw = asString(row.mediaKind);
    const mediaKind =
      mediaKindRaw === "video" || mediaKindRaw === "animated_image" || mediaKindRaw === "image"
        ? mediaKindRaw
        : undefined;
    if (!url && !mediaUrl) {
      throw new Error("url is required");
    }
    const item = await saveMemeLibraryItem(
      {
        provider: "manual",
        title: asString(row.title) || undefined,
        pageUrl: asString(row.pageUrl) || undefined,
        url: url || mediaUrl,
        mediaUrl: mediaUrl || undefined,
        mediaKind,
        queryHints: asStringArray(row.queryHints),
        tags: asStringArray(row.tags),
        emotionTags: asStringArray(row.emotionTags),
      },
      { userScope: user.id }
    );
    if (!item) {
      throw new Error("failed to save library item");
    }
    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_MEME_LIBRARY_CREATE", "MEME_LIBRARY_CREATE_FAILED");
  }
}

export async function DELETE(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const { searchParams } = new URL(request.url);
    const id = asString(searchParams.get("id"));
    if (!id) {
      throw new Error("id is required");
    }
    await deleteMemeLibraryItem(id, { userScope: user.id });
    return NextResponse.json({
      ok: true,
      deletedId: id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_MEME_LIBRARY_DELETE", "MEME_LIBRARY_DELETE_FAILED");
  }
}

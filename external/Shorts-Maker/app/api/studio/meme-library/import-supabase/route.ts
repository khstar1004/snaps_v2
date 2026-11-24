import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import { inferMemeEmotionTags, storeMemeLibraryItems } from "@/lib/studio/meme-library";
import {
  getSupabaseStoragePublicUrl,
  getSupabaseVideoAssetsBucket,
  listSupabaseStorageObjects,
  normalizeSupabaseStoragePrefix,
  type SupabaseStorageObject,
} from "@/lib/supabase/storage";
import type { SlideMediaKind } from "@/types/studio-json";

export const runtime = "nodejs";

type ImportRequest = {
  bucket?: string;
  prefix?: string;
  limit?: number;
  recursive?: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return !(normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no");
}

function asPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function resolveDefaultPrefix(userId: string): string {
  const raw = (process.env.SUPABASE_MEDIA_LIBRARY_PREFIX || "").trim();
  if (!raw) return "";
  return normalizeSupabaseStoragePrefix(raw.replace(/\{userId\}/g, userId));
}

function parseImportRequest(body: unknown, userId: string): Required<ImportRequest> {
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const bucket =
    asString(row.bucket) ||
    (process.env.SUPABASE_MEDIA_LIBRARY_BUCKET || "").trim() ||
    getSupabaseVideoAssetsBucket();
  return {
    bucket,
    prefix: normalizeSupabaseStoragePrefix(asString(row.prefix) || resolveDefaultPrefix(userId)),
    limit: asPositiveInt(row.limit, 120, 1, 500),
    recursive: asBoolean(row.recursive, true),
  };
}

function joinStoragePath(prefix: string, name: string): string {
  const safePrefix = normalizeSupabaseStoragePrefix(prefix);
  const safeName = name.trim().replace(/^\/+|\/+$/g, "");
  if (!safePrefix) return safeName;
  if (!safeName) return safePrefix;
  return `${safePrefix}/${safeName}`;
}

function toFileExtension(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return "";
  return trimmed.slice(dotIndex);
}

function inferMediaKind(row: SupabaseStorageObject): SlideMediaKind | null {
  const mimeType = typeof row.metadata?.mimetype === "string" ? row.metadata.mimetype.trim().toLowerCase() : "";
  const extension = toFileExtension(String(row.name || ""));
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "image/gif" || extension === ".gif") return "animated_image";
  if (mimeType.startsWith("image/")) return "image";
  if (extension === ".mp4" || extension === ".webm" || extension === ".mov" || extension === ".m4v") return "video";
  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp" || extension === ".avif") {
    return "image";
  }
  return null;
}

function isDirectoryRow(row: SupabaseStorageObject): boolean {
  return !inferMediaKind(row) && !String(row.metadata?.mimetype || "").trim();
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/_-]/gu, " ")
    .replace(/[_/.-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function toTitleFromPath(path: string): string {
  const fileName = path.split("/").pop() || path;
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveTags(path: string): string[] {
  const parts = path.split("/").map((part) => part.trim()).filter(Boolean);
  const values = parts.flatMap((part) => tokenize(part.replace(/\.[^.]+$/, "")));
  return Array.from(new Set(values)).slice(0, 24);
}

function deriveQueryHints(path: string, title: string): string[] {
  const parents = path
    .split("/")
    .slice(-3, -1)
    .map((part) => part.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim())
    .filter(Boolean);
  return Array.from(new Set([title, ...parents].filter(Boolean))).slice(0, 16);
}

function parseDimension(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function collectStorageFiles(input: {
  bucket: string;
  prefix: string;
  limit: number;
  recursive: boolean;
}): Promise<Array<{ row: SupabaseStorageObject; path: string }>> {
  const queue = [input.prefix];
  const collected: Array<{ row: SupabaseStorageObject; path: string }> = [];

  while (queue.length > 0 && collected.length < input.limit) {
    const currentPrefix = queue.shift() || "";
    let offset = 0;
    let keepPaging = true;

    while (keepPaging && collected.length < input.limit) {
      const rows = await listSupabaseStorageObjects({
        bucket: input.bucket,
        prefix: currentPrefix,
        limit: Math.min(100, input.limit),
        offset,
      });
      if (rows.length <= 0) break;

      for (const row of rows) {
        const name = asString(row.name);
        if (!name) continue;
        const path = joinStoragePath(currentPrefix, name);
        const mediaKind = inferMediaKind(row);
        if (mediaKind) {
          collected.push({ row, path });
          if (collected.length >= input.limit) break;
          continue;
        }
        if (input.recursive && isDirectoryRow(row)) {
          queue.push(path);
        }
      }

      keepPaging = rows.length >= Math.min(100, input.limit) && collected.length < input.limit;
      offset += rows.length;
    }
  }

  return collected.slice(0, input.limit);
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const payload = parseImportRequest(body, user.id);
    const files = await collectStorageFiles(payload);
    const rows = files.map(({ row, path }) => {
      const mediaKind = inferMediaKind(row) || "image";
      const title = toTitleFromPath(path);
      const tags = deriveTags(path);
      const queryHints = deriveQueryHints(path, title);
      const publicUrl = getSupabaseStoragePublicUrl(payload.bucket, path);
      return {
        provider: "supabase" as const,
        id: `supabase:${payload.bucket}:${path}`,
        title,
        url: publicUrl,
        mediaUrl: mediaKind === "video" || mediaKind === "animated_image" ? publicUrl : undefined,
        mediaKind,
        width: parseDimension((row.metadata as Record<string, unknown> | null | undefined)?.width),
        height: parseDimension((row.metadata as Record<string, unknown> | null | undefined)?.height),
        storageBucket: payload.bucket,
        storagePath: path,
        queryHints,
        tags,
        emotionTags: inferMemeEmotionTags([title, ...tags, ...queryHints]),
      };
    });

    await storeMemeLibraryItems(rows, { userScope: user.id });

    return NextResponse.json({
      ok: true,
      importedCount: rows.length,
      bucket: payload.bucket,
      prefix: payload.prefix,
      recursive: payload.recursive,
      limit: payload.limit,
      sample: rows.slice(0, 5).map((row) => ({
        id: row.id,
        title: row.title,
        mediaKind: row.mediaKind,
        storagePath: row.storagePath,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toStudioFailureResponse(message, "INVALID_MEME_LIBRARY_SUPABASE_IMPORT", "MEME_LIBRARY_SUPABASE_IMPORT_FAILED");
  }
}

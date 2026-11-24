import { Readable } from "node:stream";
import {
  deleteLocalStorageObject,
  getLocalStoragePublicUrl,
  hasLocalStorageConfig,
  listLocalStorageObjects,
  parseLocalStoragePublicUrl,
  uploadLocalStorageFile,
  uploadLocalStorageStream,
} from "@/lib/local/storage";
import {
  hasRemoteSupabaseServiceConfig,
  readSupabaseErrorMessage,
  requireSupabaseServiceUrl,
  supabaseServiceFetch,
} from "@/lib/supabase/server";

type StreamingRequestInit = RequestInit & {
  duplex?: "half";
};

export type SupabaseStorageObject = {
  id?: string | null;
  name?: string | null;
  bucket_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    mimetype?: string | null;
    size?: number | null;
    cacheControl?: string | null;
  } | null;
};

export function getSupabaseVideoAssetsBucket(): string {
  return (process.env.SUPABASE_VIDEO_ASSETS_BUCKET || "video-assets").trim() || "video-assets";
}

export function hasAssetStorageConfig(): boolean {
  return hasLocalStorageConfig() || hasRemoteSupabaseServiceConfig();
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function decodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

export function normalizeSupabaseStoragePrefix(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function getSupabaseStoragePublicUrl(bucket: string, path: string): string {
  if (hasLocalStorageConfig()) {
    return getLocalStoragePublicUrl(bucket, path);
  }
  return `${requireSupabaseServiceUrl()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

export async function createSignedSupabaseStorageUrl(input: {
  bucket?: string;
  path: string;
  expiresInSec?: number;
}): Promise<string> {
  const bucket = (input.bucket || getSupabaseVideoAssetsBucket()).trim();
  const safePath = input.path.trim().replace(/^\/+/, "");
  const expiresInSec = Math.max(60, Math.min(60 * 60 * 24 * 7, Math.floor(input.expiresInSec || 3600)));
  if (!bucket) {
    throw new Error("SUPABASE_VIDEO_ASSETS_BUCKET is required");
  }
  if (!safePath) {
    throw new Error("storage path is required");
  }
  if (hasLocalStorageConfig()) {
    return getLocalStoragePublicUrl(bucket, safePath);
  }
  const response = await supabaseServiceFetch(
    `/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(safePath)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ expiresIn: expiresInSec }),
    }
  );
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const signedPathRaw =
    (typeof payload.signedURL === "string" && payload.signedURL.trim()) ||
    (typeof payload.signedUrl === "string" && payload.signedUrl.trim()) ||
    (typeof payload.path === "string" && payload.path.trim()) ||
    "";
  if (!signedPathRaw) {
    throw new Error("signed storage URL is missing");
  }
  if (/^https?:\/\//i.test(signedPathRaw)) {
    return signedPathRaw;
  }
  return `${requireSupabaseServiceUrl()}${signedPathRaw.startsWith("/") ? signedPathRaw : `/${signedPathRaw}`}`;
}

export async function listSupabaseStorageObjects(input: {
  bucket?: string;
  prefix?: string;
  limit?: number;
  offset?: number;
  sortBy?: {
    column?: "name" | "updated_at" | "created_at" | "last_accessed_at";
    order?: "asc" | "desc";
  };
}): Promise<SupabaseStorageObject[]> {
  const bucket = (input.bucket || getSupabaseVideoAssetsBucket()).trim();
  if (!bucket) {
    throw new Error("SUPABASE_VIDEO_ASSETS_BUCKET is required");
  }
  if (hasLocalStorageConfig()) {
    return listLocalStorageObjects({
      bucket,
      prefix: input.prefix,
      limit: input.limit,
      offset: input.offset,
      sortBy: input.sortBy,
    });
  }
  const response = await supabaseServiceFetch(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      prefix: normalizeSupabaseStoragePrefix(input.prefix || ""),
      limit: Math.max(1, Math.min(1000, Math.floor(input.limit || 100))),
      offset: Math.max(0, Math.floor(input.offset || 0)),
      sortBy: {
        column: input.sortBy?.column || "updated_at",
        order: input.sortBy?.order === "asc" ? "asc" : "desc",
      },
    }),
  });
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return (await response.json().catch(() => [])) as SupabaseStorageObject[];
}

async function uploadSupabaseStorageObject(input: {
  bucket?: string;
  path: string;
  body: BodyInit;
  contentType?: string;
  upsert?: boolean;
  duplex?: "half";
}): Promise<{ bucket: string; path: string; publicUrl: string }> {
  const bucket = (input.bucket || getSupabaseVideoAssetsBucket()).trim();
  const safePath = input.path.trim().replace(/^\/+/, "");
  if (!bucket) {
    throw new Error("SUPABASE_VIDEO_ASSETS_BUCKET is required");
  }
  if (!safePath) {
    throw new Error("storage path is required");
  }
  const response = await supabaseServiceFetch(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(safePath)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": input.contentType || "application/octet-stream",
        "x-upsert": input.upsert ? "true" : "false",
      },
      body: input.body,
      duplex: input.duplex,
    } as StreamingRequestInit
  );
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
  return {
    bucket,
    path: safePath,
    publicUrl: getSupabaseStoragePublicUrl(bucket, safePath),
  };
}

export async function uploadSupabaseStorageFile(input: {
  bucket?: string;
  path: string;
  file: Blob;
  contentType?: string;
  upsert?: boolean;
}): Promise<{ bucket: string; path: string; publicUrl: string }> {
  if (hasLocalStorageConfig()) {
    return uploadLocalStorageFile({
      bucket: input.bucket || getSupabaseVideoAssetsBucket(),
      path: input.path,
      file: input.file,
      contentType: input.contentType,
      upsert: input.upsert,
    });
  }
  return uploadSupabaseStorageObject({
    bucket: input.bucket,
    path: input.path,
    body: input.file,
    contentType: input.contentType,
    upsert: input.upsert,
  });
}

export async function uploadSupabaseStorageStream(input: {
  bucket?: string;
  path: string;
  stream: Readable;
  contentType: string;
  upsert?: boolean;
}): Promise<{ bucket: string; path: string; publicUrl: string }> {
  if (hasLocalStorageConfig()) {
    return uploadLocalStorageStream({
      bucket: input.bucket || getSupabaseVideoAssetsBucket(),
      path: input.path,
      stream: input.stream,
      contentType: input.contentType,
      upsert: input.upsert,
    });
  }
  return uploadSupabaseStorageObject({
    bucket: input.bucket,
    path: input.path,
    body: Readable.toWeb(input.stream) as unknown as BodyInit,
    contentType: input.contentType,
    upsert: input.upsert,
    duplex: "half",
  });
}

export async function deleteSupabaseStorageObject(input: { bucket?: string; path: string }): Promise<void> {
  const bucket = (input.bucket || getSupabaseVideoAssetsBucket()).trim();
  const safePath = input.path.trim().replace(/^\/+/, "");
  if (!bucket || !safePath) return;
  if (hasLocalStorageConfig()) {
    await deleteLocalStorageObject({ bucket, path: safePath });
    return;
  }
  const response = await supabaseServiceFetch(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(safePath)}`,
    {
      method: "DELETE",
    }
  );
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(await readSupabaseErrorMessage(response));
  }
}

export function parseSupabaseStoragePublicUrl(url: string): { bucket: string; path: string } | null {
  const local = parseLocalStoragePublicUrl(url);
  if (local) return local;
  const baseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  const prefix = `${baseUrl}/storage/v1/object/public/`;
  if (!url.startsWith(prefix)) return null;
  const remainder = url.slice(prefix.length).split("?")[0].split("#")[0];
  const slashIndex = remainder.indexOf("/");
  if (slashIndex <= 0) return null;
  const bucket = decodeURIComponent(remainder.slice(0, slashIndex));
  const path = decodeStoragePath(remainder.slice(slashIndex + 1));
  if (!bucket || !path) return null;
  return { bucket, path };
}

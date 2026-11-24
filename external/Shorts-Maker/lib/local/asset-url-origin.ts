import type { NextRequest } from "next/server";
import type { VideoAssetRecord } from "@/lib/publish/types";

const LOCAL_STORAGE_PATH_PREFIX = "/api/local-storage/";
const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

type JsonLike =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonLike[]
  | { [key: string]: JsonLike };

function isHttpOrigin(origin: URL): boolean {
  return origin.protocol === "http:" || origin.protocol === "https:";
}

export function isLoopbackHostForLocalStorage(hostname: string): boolean {
  return LOCALHOST_NAMES.has(hostname.toLowerCase());
}

export function getRequestOriginForLocalStorage(request: Pick<NextRequest, "url">): string {
  const url = new URL(request.url);
  if (!isHttpOrigin(url)) {
    throw new Error("unsupported request origin");
  }
  return url.origin;
}

export function rebaseLocalStorageUrlToRequestOrigin(value: string, requestOrigin: string): string {
  const raw = value.trim();
  if (!raw) return value;

  const origin = new URL(requestOrigin);
  if (!isHttpOrigin(origin)) return value;

  const isRootRelativeLocalStorageUrl = raw.startsWith(LOCAL_STORAGE_PATH_PREFIX);
  if (isRootRelativeLocalStorageUrl) {
    return new URL(raw, origin).toString();
  }

  if (raw.startsWith("/") || raw.startsWith("//")) return value;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return value;
  }

  if (!isHttpOrigin(parsed)) return value;
  if (!parsed.pathname.startsWith(LOCAL_STORAGE_PATH_PREFIX)) return value;
  if (!isLoopbackHostForLocalStorage(parsed.hostname) && parsed.origin !== origin.origin) return value;

  return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, origin).toString();
}

export function rebaseLocalStorageUrlsInJson<T>(value: T, requestOrigin: string): T {
  if (typeof value === "string") {
    return rebaseLocalStorageUrlToRequestOrigin(value, requestOrigin) as T;
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => rebaseLocalStorageUrlsInJson(item, requestOrigin)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, JsonLike>).map(([key, nested]) => [
      key,
      rebaseLocalStorageUrlsInJson(nested, requestOrigin),
    ])
  ) as T;
}

export function rebaseLocalStorageUrlsToRequestOrigin<T>(
  value: T,
  request: Pick<NextRequest, "url">
): T {
  return rebaseLocalStorageUrlsInJson(value, getRequestOriginForLocalStorage(request));
}

export function rebaseVideoAssetRecordLocalStorageUrls<T extends VideoAssetRecord | null | undefined>(
  asset: T,
  requestOrigin: string
): T {
  if (!asset) return asset;
  return {
    ...asset,
    url: rebaseLocalStorageUrlToRequestOrigin(asset.url, requestOrigin),
  } as T;
}

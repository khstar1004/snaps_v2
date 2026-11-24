import { stat } from "node:fs/promises";
import { isLoopbackHostForLocalStorage } from "@/lib/local/asset-url-origin";
import { getLocalStorageFilePath, hasLocalStorageConfig } from "@/lib/local/storage";
import {
  cancelResponseBodyQuietly,
  fetchWithRedirectValidation,
  readResponseBodyWithinLimit,
} from "@/lib/network/request-guard";
import { parseSupabaseStoragePublicUrl } from "@/lib/supabase/storage";

export const DEFAULT_ANCHOR_IMAGE_MAX_BYTES = 1024 * 1024 * 12;
export const DEFAULT_ANCHOR_IMAGE_TIMEOUT_MS = 1000 * 10;

export type AnchorImageFetchResult = {
  buffer: Buffer;
  contentType: string;
  sourceUrl: string;
};

export type AnchorImageFetcherDependencies = {
  fetchImpl: typeof fetch;
  readFile: (path: string) => Promise<Buffer | string | Uint8Array>;
  stat?: typeof stat;
};

function normalizeUrl(value: string): string {
  return value.trim();
}

function getConfiguredLocalStorageOrigins(): Set<string> {
  const origins = new Set<string>();
  const candidates = [
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    `http://localhost:${process.env.PORT || "3000"}`,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().replace(/\/+$/, "");
    if (!normalized) continue;
    try {
      origins.add(new URL(normalized).origin);
    } catch {
      // ignore invalid local configuration values here; URL parsing below still fails closed.
    }
  }
  return origins;
}

function parseAnchorImageTarget(value: string): URL {
  try {
    return new URL(value);
  } catch {
    if (!value.startsWith("/api/local-storage/") || value.startsWith("//")) throw new Error("invalid anchor image url");
    const origin = getConfiguredLocalStorageOrigins().values().next().value;
    if (!origin) throw new Error("local storage origin is not configured");
    return new URL(value, origin);
  }
}

function isTrustedLocalStoragePublicUrl(target: URL): boolean {
  if (!hasLocalStorageConfig()) return false;
  if (!target.pathname.startsWith("/api/local-storage/")) return false;
  return getConfiguredLocalStorageOrigins().has(target.origin) || isLoopbackHostForLocalStorage(target.hostname);
}

async function readLocalStorageAnchorImage(
  target: URL,
  deps: AnchorImageFetcherDependencies,
  maxBytes: number
): Promise<AnchorImageFetchResult | null> {
  if (!isTrustedLocalStoragePublicUrl(target)) return null;
  const parsed = parseSupabaseStoragePublicUrl(target.toString());
  if (!parsed) return null;
  const filePath = getLocalStorageFilePath(parsed.bucket, parsed.path);
  const fileStat = deps.stat ? await deps.stat(filePath) : await stat(filePath);
  if (fileStat.size > maxBytes) {
    throw new Error("anchor image content too large");
  }
  const bytes = deps.readFile ? await deps.readFile(filePath) : Buffer.alloc(0);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length > maxBytes) {
    throw new Error("anchor image content too large");
  }
  return {
    buffer,
    contentType: "",
    sourceUrl: target.toString(),
  };
}

export async function fetchAnchorImageBytes(
  url: string,
  deps: AnchorImageFetcherDependencies,
  options?: {
    maxBytes?: number;
    timeoutMs?: number;
  }
): Promise<AnchorImageFetchResult> {
  const normalized = normalizeUrl(url);
  const target = parseAnchorImageTarget(normalized);
  const maxBytes = Math.max(1, Math.floor(options?.maxBytes || DEFAULT_ANCHOR_IMAGE_MAX_BYTES));

  const localResult = await readLocalStorageAnchorImage(target, deps, maxBytes);
  if (localResult) return localResult;

  const timeoutMs = Math.max(1, Math.floor(options?.timeoutMs || DEFAULT_ANCHOR_IMAGE_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithRedirectValidation(target, {
      signal: controller.signal,
      fetchImpl: deps.fetchImpl,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "Shorts-Maker Codex Local Image Generator",
      },
    });
    if (!response.ok) {
      await cancelResponseBodyQuietly(response, new Error("anchor image response discarded"));
      throw new Error(`anchor image fetch failed (${response.status})`);
    }
    const buffer = Buffer.from(await readResponseBodyWithinLimit(response, maxBytes, "anchor image content too large"));
    return {
      buffer,
      contentType: response.headers.get("content-type") || "",
      sourceUrl: target.toString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

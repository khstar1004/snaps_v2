import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { SupabaseStorageObject } from "@/lib/supabase/storage";

let envLoadAttempted = false;
const require = createRequire(import.meta.url);

function ensureLocalEnvLoaded(): void {
  if (envLoadAttempted) return;
  envLoadAttempted = true;
  try {
    const nextEnv = require("@next/env");
    if (typeof nextEnv?.loadEnvConfig === "function") {
      nextEnv.loadEnvConfig(process.cwd());
    }
  } catch {
    // ignore
  }
}

function getLocalStorageRoot(): string {
  ensureLocalEnvLoaded();
  return (process.env.LOCAL_STORAGE_ROOT || "").trim();
}

export function hasLocalStorageConfig(): boolean {
  if (process.env.NODE_ENV === "test" && process.env.LOCAL_STORAGE_ENABLE_IN_TESTS !== "1") {
    return false;
  }
  return Boolean(getLocalStorageRoot());
}

function normalizePath(value: string): string {
  const safe = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!safe || safe.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("invalid local storage path");
  }
  return safe;
}

function resolveStoragePath(bucket: string, path: string): string {
  const root = resolve(getLocalStorageRoot());
  const target = resolve(root, normalizePath(bucket), ...normalizePath(path).split("/"));
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("local storage path escaped storage root");
  }
  return target;
}

function getPublicBaseUrl(): string {
  return (
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${process.env.PORT || "3000"}`
  )
    .trim()
    .replace(/\/+$/, "");
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getLocalStoragePublicUrl(bucket: string, path: string): string {
  return `${getPublicBaseUrl()}/api/local-storage/${encodeURIComponent(bucket)}/${encodePath(normalizePath(path))}`;
}

export function parseLocalStoragePublicUrl(url: string): { bucket: string; path: string } | null {
  const marker = "/api/local-storage/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const remainder = url.slice(index + marker.length).split("?")[0].split("#")[0];
  const slashIndex = remainder.indexOf("/");
  if (slashIndex <= 0) return null;
  const bucket = decodeURIComponent(remainder.slice(0, slashIndex));
  const path = remainder
    .slice(slashIndex + 1)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  if (!bucket || !path) return null;
  return { bucket, path };
}

export async function uploadLocalStorageFile(input: {
  bucket: string;
  path: string;
  file: Blob;
  contentType?: string;
  upsert?: boolean;
}): Promise<{ bucket: string; path: string; publicUrl: string }> {
  const safePath = normalizePath(input.path);
  const target = resolveStoragePath(input.bucket, safePath);
  await mkdir(dirname(target), { recursive: true });
  if (!input.upsert) {
    await writeFile(target, Buffer.from(await input.file.arrayBuffer()), { flag: "wx" });
  } else {
    await writeFile(target, Buffer.from(await input.file.arrayBuffer()));
  }
  return {
    bucket: input.bucket,
    path: safePath,
    publicUrl: getLocalStoragePublicUrl(input.bucket, safePath),
  };
}

export async function uploadLocalStorageStream(input: {
  bucket: string;
  path: string;
  stream: Readable;
  contentType: string;
  upsert?: boolean;
}): Promise<{ bucket: string; path: string; publicUrl: string }> {
  const safePath = normalizePath(input.path);
  const target = resolveStoragePath(input.bucket, safePath);
  await mkdir(dirname(target), { recursive: true });
  const chunks: Buffer[] = [];
  for await (const chunk of input.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  await writeFile(target, Buffer.concat(chunks), input.upsert ? undefined : { flag: "wx" });
  return {
    bucket: input.bucket,
    path: safePath,
    publicUrl: getLocalStoragePublicUrl(input.bucket, safePath),
  };
}

export async function listLocalStorageObjects(input: {
  bucket: string;
  prefix?: string;
  limit?: number;
  offset?: number;
  sortBy?: {
    column?: "name" | "updated_at" | "created_at" | "last_accessed_at";
    order?: "asc" | "desc";
  };
}): Promise<SupabaseStorageObject[]> {
  const prefix = (input.prefix || "").trim().replace(/^\/+|\/+$/g, "");
  const directory = prefix ? resolveStoragePath(input.bucket, prefix) : resolve(getLocalStorageRoot(), normalizePath(input.bucket));
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const rows = await Promise.all(
    entries.map(async (entry): Promise<SupabaseStorageObject> => {
      const childPath = join(directory, entry.name);
      const childStat = await stat(childPath);
      return {
        id: entry.isFile() ? `${input.bucket}/${prefix ? `${prefix}/` : ""}${entry.name}` : null,
        name: entry.name,
        bucket_id: input.bucket,
        created_at: childStat.birthtime.toISOString(),
        updated_at: childStat.mtime.toISOString(),
        last_accessed_at: childStat.atime.toISOString(),
        metadata: entry.isFile()
          ? {
              size: childStat.size,
              mimetype: null,
              cacheControl: null,
            }
          : null,
      };
    })
  );
  const direction = input.sortBy?.order === "asc" ? 1 : -1;
  const column = input.sortBy?.column || "updated_at";
  rows.sort((left, right) => String(left[column] || "").localeCompare(String(right[column] || "")) * direction);
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit || 100)));
  return rows.slice(offset, offset + limit);
}

export async function deleteLocalStorageObject(input: { bucket: string; path: string }): Promise<void> {
  await rm(resolveStoragePath(input.bucket, input.path), { force: true });
}

export function getLocalStorageFilePath(bucket: string, path: string): string {
  return resolveStoragePath(bucket, path);
}

export function createLocalStorageReadStream(bucket: string, path: string, options?: { start?: number; end?: number }): Readable {
  return createReadStream(resolveStoragePath(bucket, path), options);
}

export function toSafeStorageObjectSlug(value: string, fallback = "shorts"): string {
  const source = String(value || "").trim();
  if (!source) return fallback;
  const normalized = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (slug) return slug;
  const encoded = encodeURIComponent(source)
    .toLowerCase()
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
  return encoded || fallback;
}

function toSafeStorageExtension(value: string, fallback = "bin"): string {
  const ext = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/[^a-z0-9]+/g, "");
  return ext || fallback;
}

function toSafeStorageId(value: string, fallback = "asset"): string {
  const id = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "")
    .slice(0, 64);
  return id || fallback;
}

export function buildShortsStorageObjectKey(input: {
  title: string;
  id: string;
  ext: string;
  now?: number;
}): string {
  const safeExt = toSafeStorageExtension(input.ext);
  const safeId = toSafeStorageId(input.id);
  const safeSlug = toSafeStorageObjectSlug(input.title);
  const timestamp = Number.isFinite(input.now) ? Math.max(0, Math.floor(input.now as number)) : Date.now();
  return `shorts/${timestamp}-${safeSlug}-${safeId}.${safeExt}`;
}

export function buildStudioMediaStorageObjectKey(input: {
  scope: string;
  folderPath?: string;
  title: string;
  id: string;
  ext: string;
  now?: number;
}): string {
  const scope = toSafeStorageObjectSlug(input.scope, "shared-library");
  const folderPrefix = String(input.folderPath || "")
    .split("/")
    .map((segment) => toSafeStorageObjectSlug(segment, "folder"))
    .filter(Boolean)
    .join("/");
  const safeSlug = toSafeStorageObjectSlug(input.title, "asset");
  const safeId = toSafeStorageId(input.id);
  const safeExt = toSafeStorageExtension(input.ext);
  const timestamp = Number.isFinite(input.now) ? Math.max(0, Math.floor(input.now as number)) : Date.now();
  return `studio-media-assets/${scope}/${folderPrefix ? `${folderPrefix}/` : ""}${timestamp}-${safeSlug}-${safeId}.${safeExt}`;
}

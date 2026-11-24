import {
  deleteAppCacheEntry,
  getAppCacheEntry,
  normalizeAppCacheUserScope,
  setAppCacheEntry,
} from "@/lib/supabase/app-cache";
import { ensureSharedLibraryUser } from "@/lib/auth/bootstrap";
import {
  deleteSupabaseRows,
  hasSupabaseServiceConfig,
  insertSupabaseRows,
  selectSupabaseRows,
  updateSupabaseRows,
} from "@/lib/supabase/server";
import { getSharedStudioLibraryScope, getSharedStudioLibraryUserId } from "@/lib/studio/library-scope";
import { normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import { inferMemeEmotionTags } from "@/lib/studio/meme-library";
import type { SlideMediaKind } from "@/types/studio-json";

type StudioMediaAssetRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_asset_id?: string | null;
  is_favorite?: boolean | null;
  title?: string | null;
  summary?: string | null;
  media_kind?: SlideMediaKind | null;
  source_url?: string | null;
  source_media_url?: string | null;
  source_page_url?: string | null;
  storage_url?: string | null;
  storage_media_url?: string | null;
  width?: number | null;
  height?: number | null;
  tags?: unknown[] | null;
  manual_tags?: unknown[] | null;
  auto_tags?: unknown[] | null;
  emotion_tags?: unknown[] | null;
  manual_emotion_tags?: unknown[] | null;
  auto_emotion_tags?: unknown[] | null;
  query_hints?: unknown[] | null;
  manual_query_hints?: unknown[] | null;
  auto_query_hints?: unknown[] | null;
  auto_source_metadata?: unknown | null;
  vlm_status?: string | null;
  inserted_at_ms: number;
  updated_at_ms: number;
};

export type StudioMediaAssetAutoSourceMetadata = {
  provider?: string;
  providerQuery?: string;
  queryCandidates: string[];
  providerTitle?: string;
  providerSlug?: string;
  providerRating?: string;
  providerTags: string[];
  providerCandidates: string[];
  selectionDetails: string[];
};

export type StudioMediaAssetRecord = {
  id: string;
  userId: string;
  provider: string;
  providerAssetId?: string;
  isFavorite: boolean;
  title?: string;
  summary?: string;
  mediaKind?: SlideMediaKind;
  sourceUrl?: string;
  sourceMediaUrl?: string;
  sourcePageUrl?: string;
  storageUrl?: string;
  storageMediaUrl?: string;
  width?: number;
  height?: number;
  tags: string[];
  manualTags: string[];
  autoTags: string[];
  emotionTags: string[];
  manualEmotionTags: string[];
  autoEmotionTags: string[];
  queryHints: string[];
  manualQueryHints: string[];
  autoQueryHints: string[];
  autoSourceMetadata: StudioMediaAssetAutoSourceMetadata;
  vlmStatus?: string;
  folderPath?: string;
  insertedAtMs: number;
  updatedAtMs: number;
};

type StudioMediaAssetMetadataOrigin = "manual" | "auto";

export type StudioMediaAssetListOptions = {
  userId?: string;
  limit?: number;
  query?: string;
  tag?: string;
  emotionTag?: string;
  mediaKind?: "all" | "image" | "motion";
  folderPath?: string;
};

export function isStudioMediaAssetsEnabled(): boolean {
  return hasSupabaseServiceConfig();
}

const STUDIO_MEDIA_TAG_STOPWORDS = new Set([
  "이미지",
  "사진",
  "장면",
  "모습",
  "관련",
  "하는",
  "있는",
  "그리고",
  "slide",
  "slides",
  "image",
  "photo",
  "media",
  "asset",
]);

const STUDIO_MEDIA_ASSET_FOLDER_SCOPE = "studio_media_asset_folder";
const STUDIO_MEDIA_FOLDER_REGISTRY_SCOPE = "studio_media_asset_folder_registry";
const DEFAULT_STUDIO_MEDIA_FOLDERS: Record<SlideMediaKind, string> = {
  image: "사진",
  animated_image: "짤/움짤",
  video: "비디오/클립",
};
const EMPTY_AUTO_SOURCE_METADATA: StudioMediaAssetAutoSourceMetadata = {
  queryCandidates: [],
  providerTags: [],
  providerCandidates: [],
  selectionDetails: [],
};
const AUTO_METADATA_NORMALIZATION_RULES: Array<{
  tag: string;
  emotionTag: string;
  hints: string[];
}> = [
  { tag: "놀람", emotionTag: "surprised", hints: ["wtf", "omg", "shocked", "shock", "surprise", "surprised", "startled", "gasp"] },
  { tag: "당황", emotionTag: "awkward", hints: ["awkward", "cringe", "yikes", "embarrassed", "flustered", "nervous"] },
  { tag: "분노", emotionTag: "angry", hints: ["angry", "mad", "rage", "furious", "annoyed"] },
  { tag: "웃음", emotionTag: "laugh", hints: ["lol", "lmao", "laugh", "laughing", "funny", "rofl"] },
  { tag: "슬픔", emotionTag: "sad", hints: ["sad", "cry", "crying", "tears", "tearful", "sobbing"] },
  { tag: "공포", emotionTag: "scared", hints: ["scared", "fear", "fearful", "terrified", "horror", "creepy"] },
  { tag: "어이없음", emotionTag: "confused", hints: ["facepalm", "eyeroll", "side eye", "wtf", "confused"] },
];

type AppCacheEntryRow = {
  scope: string;
  user_scope: string;
  cache_key: string;
  value_text?: string | null;
  value_json?: unknown | null;
  created_at_ms: number;
  updated_at_ms: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function resolveStudioMediaLibraryUserId(_userId?: string): Promise<string> {
  await ensureSharedLibraryUser();
  return getSharedStudioLibraryUserId();
}

export function normalizeStudioMediaFolderPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 6)
    .join("/");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter(Boolean)
    )
  );
}

function uniqueValues(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

function uniqueTrimmedValues(values: string[], limit: number): string[] {
  return uniqueValues(values).slice(0, limit);
}

function pickArrayWithFallback(primary: string[], fallback: string[], existing: string[], limit: number): string[] {
  if (primary.length > 0) return uniqueTrimmedValues([...primary, ...fallback], limit);
  if (fallback.length > 0) return uniqueTrimmedValues(fallback, limit);
  return uniqueTrimmedValues(existing, limit);
}

function normalizeTagValues(values: string[], limit: number): string[] {
  return Array.from(
    new Set(
      values
        .map((item) =>
          item
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s/_-]/gu, " ")
            .replace(/[_/.-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function stripGenericEmotionTag(values: string[]): string[] {
  return values.filter((value) => value !== "generic");
}

function normalizeAutoSourceMetadata(value: unknown): StudioMediaAssetAutoSourceMetadata {
  const row = asObjectRecord(value);
  if (!row) return { ...EMPTY_AUTO_SOURCE_METADATA };
  return {
    provider: asString(row.provider) || undefined,
    providerQuery: asString(row.providerQuery ?? row.provider_query) || undefined,
    queryCandidates: uniqueTrimmedValues(asStringArray(row.queryCandidates ?? row.query_candidates), 12),
    providerTitle: asString(row.providerTitle ?? row.provider_title) || undefined,
    providerSlug: asString(row.providerSlug ?? row.provider_slug) || undefined,
    providerRating: asString(row.providerRating ?? row.provider_rating) || undefined,
    providerTags: uniqueTrimmedValues(asStringArray(row.providerTags ?? row.provider_tags), 24),
    providerCandidates: uniqueTrimmedValues(asStringArray(row.providerCandidates ?? row.provider_candidates), 8),
    selectionDetails: uniqueTrimmedValues(asStringArray(row.selectionDetails ?? row.selection_details), 10),
  };
}

function buildAutoSourceMetadata(input: Partial<StudioMediaAssetAutoSourceMetadata>): StudioMediaAssetAutoSourceMetadata {
  return {
    provider: asString(input.provider) || undefined,
    providerQuery: asString(input.providerQuery) || undefined,
    queryCandidates: uniqueTrimmedValues(input.queryCandidates || [], 12),
    providerTitle: asString(input.providerTitle) || undefined,
    providerSlug: asString(input.providerSlug) || undefined,
    providerRating: asString(input.providerRating) || undefined,
    providerTags: uniqueTrimmedValues(input.providerTags || [], 24),
    providerCandidates: uniqueTrimmedValues(input.providerCandidates || [], 8),
    selectionDetails: uniqueTrimmedValues(input.selectionDetails || [], 10),
  };
}

function normalizeAutoMetadata(input: {
  provider?: string;
  mediaKind?: SlideMediaKind;
  title?: string;
  summary?: string;
  tags: string[];
  emotionTags: string[];
  queryHints: string[];
  autoSourceMetadata: StudioMediaAssetAutoSourceMetadata;
}): {
  tags: string[];
  emotionTags: string[];
  queryHints: string[];
} {
  const normalizedTags = new Set(normalizeTagValues(input.tags, 24));
  const normalizedEmotionTags = new Set(stripGenericEmotionTag(normalizeTagValues(input.emotionTags, 12)));
  const normalizedQueryHints = uniqueTrimmedValues(input.queryHints, 16);
  const signalCorpus = uniqueValues([
    input.title,
    input.summary,
    ...input.tags,
    ...input.queryHints,
    input.autoSourceMetadata.providerQuery,
    input.autoSourceMetadata.providerTitle,
    input.autoSourceMetadata.providerSlug,
    ...input.autoSourceMetadata.queryCandidates,
    ...input.autoSourceMetadata.providerTags,
    ...input.autoSourceMetadata.selectionDetails,
  ]).map((value) => value.toLowerCase());

  if (input.mediaKind === "animated_image") {
    normalizedTags.add("움짤");
    normalizedTags.add("리액션");
  }
  if (asString(input.provider).toLowerCase() === "giphy") {
    normalizedTags.add("giphy");
  }

  for (const rule of AUTO_METADATA_NORMALIZATION_RULES) {
    if (!signalCorpus.some((value) => rule.hints.some((hint) => value.includes(hint)))) continue;
    normalizedTags.add(rule.tag);
    normalizedEmotionTags.add(rule.emotionTag);
  }

  return {
    tags: uniqueTrimmedValues(Array.from(normalizedTags), 24),
    emotionTags: uniqueTrimmedValues(Array.from(normalizedEmotionTags), 12),
    queryHints: normalizedQueryHints,
  };
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

function inferTagTokens(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((item) => tokenize(item))
        .filter((token) => token.length >= 2 && !STUDIO_MEDIA_TAG_STOPWORDS.has(token))
    )
  );
}

export function buildStudioMediaAssetMetadata(input: {
  title?: string;
  summary?: string;
  provider?: string;
  mediaKind?: SlideMediaKind;
  queryHints?: string[];
  tags?: string[];
  emotionTags?: string[];
  extraTexts?: string[];
}): {
  summary?: string;
  tags: string[];
  emotionTags: string[];
  queryHints: string[];
} {
  const summary = asString(input.summary) || undefined;
  const queryHints = uniqueValues(input.queryHints || []).slice(0, 16);
  const mediaKindTags =
    input.mediaKind === "animated_image"
      ? ["gif", "motion"]
      : input.mediaKind === "video"
        ? ["video", "motion"]
        : input.mediaKind === "image"
          ? ["image", "still"]
          : [];
  const inferenceValues = uniqueValues([
    input.title,
    summary,
    input.provider,
    ...(input.extraTexts || []),
    ...queryHints,
  ]);
  const inferredTags = normalizeTagValues(
    [
      ...inferTagTokens(inferenceValues),
      ...mediaKindTags,
      asString(input.provider).toLowerCase(),
    ],
    24
  );
  const tags = uniqueValues([
    ...normalizeTagValues(input.tags || [], 24),
    ...inferredTags,
  ]).slice(0, 24);
  const inferredEmotionTags = inferMemeEmotionTags(inferenceValues).filter((tag) => tag !== "generic");
  const emotionTags = uniqueValues([
    ...normalizeTagValues(input.emotionTags || [], 12),
    ...normalizeTagValues(inferredEmotionTags, 12),
  ]).slice(0, 12);
  return {
    summary,
    tags,
    emotionTags: emotionTags.length > 0 ? emotionTags : ["generic"],
    queryHints,
  };
}

function toRecord(row: StudioMediaAssetRow): StudioMediaAssetRecord {
  const hasSplitMetadataColumns =
    "manual_tags" in row ||
    "auto_tags" in row ||
    "manual_emotion_tags" in row ||
    "auto_emotion_tags" in row ||
    "manual_query_hints" in row ||
    "auto_query_hints" in row;
  const legacyTags = asStringArray(row.tags);
  const legacyEmotionTags = asStringArray(row.emotion_tags);
  const legacyQueryHints = asStringArray(row.query_hints);
  const manualTags = hasSplitMetadataColumns ? asStringArray(row.manual_tags) : legacyTags;
  const autoTags = hasSplitMetadataColumns ? asStringArray(row.auto_tags) : [];
  const manualEmotionTags = hasSplitMetadataColumns ? asStringArray(row.manual_emotion_tags) : legacyEmotionTags;
  const autoEmotionTags = hasSplitMetadataColumns ? asStringArray(row.auto_emotion_tags) : [];
  const manualQueryHints = hasSplitMetadataColumns ? asStringArray(row.manual_query_hints) : legacyQueryHints;
  const autoQueryHints = hasSplitMetadataColumns ? asStringArray(row.auto_query_hints) : [];
  const autoSourceMetadata = normalizeAutoSourceMetadata(row.auto_source_metadata);
  return {
    id: row.id,
    userId: row.user_id,
    provider: asString(row.provider),
    providerAssetId: asString(row.provider_asset_id),
    isFavorite: row.is_favorite === true,
    title: asString(row.title) || undefined,
    summary: asString(row.summary) || undefined,
    mediaKind: row.media_kind || undefined,
    sourceUrl: asString(row.source_url) || undefined,
    sourceMediaUrl: asString(row.source_media_url) || undefined,
    sourcePageUrl: asString(row.source_page_url) || undefined,
    storageUrl: asString(row.storage_url) || undefined,
    storageMediaUrl: asString(row.storage_media_url) || undefined,
    width: typeof row.width === "number" && Number.isFinite(row.width) ? row.width : undefined,
    height: typeof row.height === "number" && Number.isFinite(row.height) ? row.height : undefined,
    tags: uniqueTrimmedValues([...manualTags, ...autoTags], 24),
    manualTags,
    autoTags,
    emotionTags: uniqueTrimmedValues([...manualEmotionTags, ...autoEmotionTags], 12),
    manualEmotionTags,
    autoEmotionTags,
    queryHints: uniqueTrimmedValues([...manualQueryHints, ...autoQueryHints], 16),
    manualQueryHints,
    autoQueryHints,
    autoSourceMetadata,
    vlmStatus: asString(row.vlm_status) || undefined,
    folderPath: undefined,
    insertedAtMs: Number(row.inserted_at_ms) || 0,
    updatedAtMs: Number(row.updated_at_ms) || 0,
  };
}

function inferStudioMediaFolderPath(record: Pick<StudioMediaAssetRecord, "mediaKind">): string {
  const mediaKind = record.mediaKind || "image";
  return DEFAULT_STUDIO_MEDIA_FOLDERS[mediaKind];
}

function sortStudioMediaFolderPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((value) => normalizeStudioMediaFolderPath(value)).filter(Boolean))).sort(
    (left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right, "ko")
  );
}

function readFolderValue(row: Pick<AppCacheEntryRow, "value_text" | "value_json"> | null | undefined): string {
  if (!row) return "";
  if (typeof row.value_text === "string") {
    return normalizeStudioMediaFolderPath(row.value_text);
  }
  return typeof row.value_json === "string" ? normalizeStudioMediaFolderPath(row.value_json) : "";
}

async function listStudioMediaAssetFolderMap(userId: string): Promise<Record<string, string>> {
  const rows = await selectSupabaseRows<AppCacheEntryRow>("app_cache_entries", {
    filters: {
      scope: STUDIO_MEDIA_ASSET_FOLDER_SCOPE,
      user_scope: normalizeAppCacheUserScope(getSharedStudioLibraryScope()),
    },
    orderBy: {
      column: "updated_at_ms",
      ascending: false,
    },
    limit: 5000,
  });
  const folderMap: Record<string, string> = {};
  for (const row of rows) {
    const assetId = asString(row.cache_key);
    const folderPath = readFolderValue(row);
    if (!assetId || !folderPath) continue;
    folderMap[assetId] = folderPath;
  }
  return folderMap;
}

async function listPersistedStudioMediaFolders(userId: string): Promise<string[]> {
  void userId;
  const rows = await selectSupabaseRows<AppCacheEntryRow>("app_cache_entries", {
    filters: {
      scope: STUDIO_MEDIA_FOLDER_REGISTRY_SCOPE,
      user_scope: normalizeAppCacheUserScope(getSharedStudioLibraryScope()),
    },
    orderBy: {
      column: "updated_at_ms",
      ascending: false,
    },
    limit: 5000,
  });
  return sortStudioMediaFolderPaths(
    rows.map((row) => readFolderValue(row) || asString(row.cache_key))
  );
}

async function persistStudioMediaFolderRegistry(userId: string, folderPath: string): Promise<void> {
  void userId;
  const normalized = normalizeStudioMediaFolderPath(folderPath);
  if (!normalized) return;
  const segments = normalized.split("/").filter(Boolean);
  const paths: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    paths.push(segments.slice(0, index + 1).join("/"));
  }
  await Promise.all(
    paths.map((path) =>
      setAppCacheEntry({
        scope: STUDIO_MEDIA_FOLDER_REGISTRY_SCOPE,
        userScope: getSharedStudioLibraryScope(),
        key: path,
        value: path,
      })
    )
  );
}

async function resolveStudioMediaAssetFolderPath(userId: string, assetId: string, fallbackRecord?: StudioMediaAssetRecord): Promise<string> {
  void userId;
  const entry = await getAppCacheEntry(STUDIO_MEDIA_ASSET_FOLDER_SCOPE, getSharedStudioLibraryScope(), assetId);
  const folderPath = normalizeStudioMediaFolderPath(
    typeof entry?.valueText === "string"
      ? entry.valueText
      : typeof entry?.valueJson === "string"
        ? entry.valueJson
        : ""
  );
  if (folderPath) return folderPath;
  return inferStudioMediaFolderPath(fallbackRecord || { mediaKind: "image" });
}

async function persistStudioMediaAssetFolderPath(userId: string, assetId: string, folderPath: string): Promise<void> {
  void userId;
  const safeAssetId = asString(assetId);
  if (!safeAssetId) return;
  const normalized = normalizeStudioMediaFolderPath(folderPath);
  if (!normalized) {
    await deleteAppCacheEntry(STUDIO_MEDIA_ASSET_FOLDER_SCOPE, getSharedStudioLibraryScope(), safeAssetId).catch(() => undefined);
    return;
  }
  await setAppCacheEntry({
    scope: STUDIO_MEDIA_ASSET_FOLDER_SCOPE,
    userScope: getSharedStudioLibraryScope(),
    key: safeAssetId,
    value: normalized,
  });
  await persistStudioMediaFolderRegistry(userId, normalized);
}

export async function listStudioMediaFolders(options?: {
  userId?: string;
  assetFolderPaths?: string[];
}): Promise<string[]> {
  const libraryUserId = await resolveStudioMediaLibraryUserId(options?.userId);
  const persistedFolders = await listPersistedStudioMediaFolders(libraryUserId);
  return sortStudioMediaFolderPaths([
    ...Object.values(DEFAULT_STUDIO_MEDIA_FOLDERS),
    ...(options?.assetFolderPaths || []),
    ...persistedFolders,
  ]);
}

export async function createStudioMediaFolder(input: {
  userId?: string;
  folderPath: string;
}): Promise<string> {
  const normalized = normalizeStudioMediaFolderPath(input.folderPath);
  if (!normalized) {
    throw new Error("folderPath is required");
  }
  const libraryUserId = await resolveStudioMediaLibraryUserId(input.userId);
  await persistStudioMediaFolderRegistry(libraryUserId, normalized);
  return normalized;
}

function buildCorpus(record: StudioMediaAssetRecord): string[] {
  return Array.from(
    new Set([
      ...tokenize(record.title || ""),
      ...tokenize(record.folderPath || ""),
      ...tokenize(record.summary || ""),
      ...tokenize(record.sourceUrl || ""),
      ...tokenize(record.sourceMediaUrl || ""),
      ...tokenize(record.sourcePageUrl || ""),
      ...tokenize(record.storageUrl || ""),
      ...tokenize(record.storageMediaUrl || ""),
      ...(record.tags || []).flatMap((item) => tokenize(item)),
      ...(record.emotionTags || []).flatMap((item) => tokenize(item)),
      ...(record.queryHints || []).flatMap((item) => tokenize(item)),
      ...tokenize(record.autoSourceMetadata.provider || ""),
      ...tokenize(record.autoSourceMetadata.providerQuery || ""),
      ...tokenize(record.autoSourceMetadata.providerTitle || ""),
      ...tokenize(record.autoSourceMetadata.providerSlug || ""),
      ...tokenize(record.autoSourceMetadata.providerRating || ""),
      ...(record.autoSourceMetadata.queryCandidates || []).flatMap((item) => tokenize(item)),
      ...(record.autoSourceMetadata.providerTags || []).flatMap((item) => tokenize(item)),
      ...(record.autoSourceMetadata.providerCandidates || []).flatMap((item) => tokenize(item)),
      ...(record.autoSourceMetadata.selectionDetails || []).flatMap((item) => tokenize(item)),
    ])
  );
}

export function resolveStudioMediaAssetUrls(record: StudioMediaAssetRecord): {
  imageUrl: string;
  mediaUrl?: string;
} {
  const normalizedSource = normalizeStudioMediaUrls({
    imageUrl: record.sourceUrl,
    mediaUrl: record.sourceMediaUrl,
    mediaKind: record.mediaKind,
  });
  const normalizedStorage = normalizeStudioMediaUrls({
    imageUrl: record.storageUrl,
    mediaUrl: record.storageMediaUrl,
    mediaKind: record.mediaKind,
  });
  const imageUrl =
    record.mediaKind === "animated_image"
      ? normalizedSource.mediaUrl ||
        normalizedStorage.mediaUrl ||
        normalizedSource.imageUrl ||
        normalizedStorage.imageUrl ||
        ""
      : normalizedStorage.imageUrl ||
        normalizedSource.imageUrl ||
        normalizedStorage.mediaUrl ||
        normalizedSource.mediaUrl ||
        "";
  const mediaUrl =
    record.mediaKind === "animated_image"
      ? normalizedSource.mediaUrl ||
        normalizedStorage.mediaUrl ||
        normalizedSource.imageUrl ||
        normalizedStorage.imageUrl ||
        undefined
      : normalizedStorage.mediaUrl ||
        normalizedSource.mediaUrl ||
        (record.mediaKind === "video" && imageUrl ? imageUrl : undefined);
  return {
    imageUrl,
    mediaUrl,
  };
}

async function findExistingStudioMediaAsset(input: {
  userId?: string;
  provider?: string;
  providerAssetId?: string;
  sourceUrl?: string;
  sourceMediaUrl?: string;
  storageUrl?: string;
  storageMediaUrl?: string;
}): Promise<StudioMediaAssetRecord | null> {
  const libraryUserId = await resolveStudioMediaLibraryUserId(input.userId);
  if (input.provider && input.providerAssetId) {
    const rows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
      filters: {
        user_id: libraryUserId,
        provider: input.provider,
        provider_asset_id: input.providerAssetId,
      },
      limit: 1,
    });
    if (rows[0]) return toRecord(rows[0]);
  }
  if (input.storageUrl) {
    const rows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
      filters: {
        user_id: libraryUserId,
        storage_url: input.storageUrl,
      },
      limit: 1,
    });
    if (rows[0]) return toRecord(rows[0]);
  }
  if (input.storageMediaUrl) {
    const rows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
      filters: {
        user_id: libraryUserId,
        storage_media_url: input.storageMediaUrl,
      },
      limit: 1,
    });
    if (rows[0]) return toRecord(rows[0]);
  }
  if (input.sourceUrl) {
    const rows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
      filters: {
        user_id: libraryUserId,
        source_url: input.sourceUrl,
      },
      limit: 1,
    });
    if (rows[0]) return toRecord(rows[0]);
  }
  if (input.sourceMediaUrl) {
    const rows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
      filters: {
        user_id: libraryUserId,
        source_media_url: input.sourceMediaUrl,
      },
      limit: 1,
    });
    if (rows[0]) return toRecord(rows[0]);
  }
  return null;
}

export async function listStudioMediaAssets(options: StudioMediaAssetListOptions): Promise<StudioMediaAssetRecord[]> {
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit || 200)));
  const libraryUserId = await resolveStudioMediaLibraryUserId(options.userId);
  const rows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
    filters: {
      user_id: libraryUserId,
    },
    orderBy: {
      column: "updated_at_ms",
      ascending: false,
    },
    limit,
  });
  const folderMap = await listStudioMediaAssetFolderMap(libraryUserId);
  const records = rows.map((row) => {
    const record = toRecord(row);
    return {
      ...record,
      folderPath: folderMap[record.id] || inferStudioMediaFolderPath(record),
    };
  });
  const queryTokens = tokenize(options.query || "");
  const tagFilter = asString(options.tag).toLowerCase();
  const emotionFilter = asString(options.emotionTag).toLowerCase();
  const mediaKind = options.mediaKind || "all";
  const folderFilter = normalizeStudioMediaFolderPath(options.folderPath || "");
  return records.filter((record) => {
    if (mediaKind === "image" && record.mediaKind && record.mediaKind !== "image") return false;
    if (mediaKind === "motion" && record.mediaKind !== "video" && record.mediaKind !== "animated_image") return false;
    if (folderFilter && record.folderPath !== folderFilter) return false;
    if (tagFilter && !(record.tags || []).includes(tagFilter)) return false;
    if (emotionFilter && !(record.emotionTags || []).includes(emotionFilter)) return false;
    if (queryTokens.length > 0) {
      const corpus = buildCorpus(record);
      if (!queryTokens.every((token) => corpus.some((item) => item.includes(token) || token.includes(item)))) {
        return false;
      }
    }
    return true;
  }).sort((left, right) => {
    if (left.isFavorite !== right.isFavorite) {
      return left.isFavorite ? -1 : 1;
    }
    return right.updatedAtMs - left.updatedAtMs;
  });
}

export async function createOrUpdateStudioMediaAsset(input: {
  userId?: string;
  provider?: string;
  providerAssetId?: string;
  isFavorite?: boolean;
  title?: string;
  summary?: string;
  mediaKind?: SlideMediaKind;
  sourceUrl?: string;
  sourceMediaUrl?: string;
  sourcePageUrl?: string;
  storageUrl?: string;
  storageMediaUrl?: string;
  width?: number;
  height?: number;
  tags?: string[];
  emotionTags?: string[];
  queryHints?: string[];
  folderPath?: string | null;
  preserveExistingMetadataOnUpdate?: boolean;
  metadataOrigin?: StudioMediaAssetMetadataOrigin;
  autoSourceMetadata?: Partial<StudioMediaAssetAutoSourceMetadata>;
}): Promise<StudioMediaAssetRecord> {
  const now = Date.now();
  const hasFolderPath = Object.prototype.hasOwnProperty.call(input, "folderPath");
  const preserveExistingMetadataOnUpdate = input.preserveExistingMetadataOnUpdate === true;
  const metadataOrigin: StudioMediaAssetMetadataOrigin = input.metadataOrigin === "auto" ? "auto" : "manual";
  const libraryUserId = await resolveStudioMediaLibraryUserId(input.userId);
  const normalizedSource = normalizeStudioMediaUrls({
    imageUrl: input.sourceUrl,
    mediaUrl: input.sourceMediaUrl,
    mediaKind: input.mediaKind,
  });
  const normalizedStorage = normalizeStudioMediaUrls({
    imageUrl: input.storageUrl,
    mediaUrl: input.storageMediaUrl,
    mediaKind: input.mediaKind,
  });
  const normalizedMediaKind =
    normalizedSource.mediaKind || normalizedStorage.mediaKind || input.mediaKind;
  const existing = await findExistingStudioMediaAsset({
    userId: libraryUserId,
    provider: input.provider,
    providerAssetId: input.providerAssetId,
    sourceUrl: normalizedSource.imageUrl || input.sourceUrl,
    sourceMediaUrl: normalizedSource.mediaUrl || input.sourceMediaUrl,
    storageUrl: normalizedStorage.imageUrl || input.storageUrl,
    storageMediaUrl: normalizedStorage.mediaUrl || input.storageMediaUrl,
  });
  const normalizedInputTags = normalizeTagValues(input.tags || [], 24);
  const normalizedInputEmotionTags = normalizeTagValues(input.emotionTags || [], 12);
  const normalizedInputQueryHints = uniqueTrimmedValues((input.queryHints || []).map((item) => item.trim()), 16);
  const normalizedInputAutoSourceMetadata = buildAutoSourceMetadata(input.autoSourceMetadata || {});
  const metadata = buildStudioMediaAssetMetadata({
    title: input.title,
    summary: input.summary,
    provider: input.provider,
    mediaKind: normalizedMediaKind,
    queryHints: metadataOrigin === "auto" ? normalizedInputQueryHints : [],
    tags: metadataOrigin === "auto" ? normalizedInputTags : [],
    emotionTags: metadataOrigin === "auto" ? normalizedInputEmotionTags : [],
    extraTexts: [
      input.sourcePageUrl || "",
      normalizedSource.imageUrl || input.sourceUrl || "",
      normalizedSource.mediaUrl || input.sourceMediaUrl || "",
      normalizedInputAutoSourceMetadata.providerQuery || "",
      normalizedInputAutoSourceMetadata.providerTitle || "",
      normalizedInputAutoSourceMetadata.providerSlug || "",
      ...normalizedInputAutoSourceMetadata.providerTags,
      ...normalizedInputAutoSourceMetadata.queryCandidates,
      ...normalizedInputAutoSourceMetadata.selectionDetails,
    ],
  });
  const normalizedAutoMetadata = normalizeAutoMetadata({
    provider: input.provider,
    mediaKind: normalizedMediaKind,
    title: input.title,
    summary: metadata.summary || input.summary,
    tags: metadata.tags,
    emotionTags: metadata.emotionTags,
    queryHints: metadata.queryHints,
    autoSourceMetadata: normalizedInputAutoSourceMetadata,
  });
  const nextManualTags =
    metadataOrigin === "manual"
      ? existing && normalizedInputTags.length <= 0
        ? existing.manualTags
        : normalizedInputTags
      : existing?.manualTags || [];
  const nextManualEmotionTags =
    metadataOrigin === "manual"
      ? existing && normalizedInputEmotionTags.length <= 0
        ? existing.manualEmotionTags
        : normalizedInputEmotionTags
      : existing?.manualEmotionTags || [];
  const nextManualQueryHints =
    metadataOrigin === "manual"
      ? existing && normalizedInputQueryHints.length <= 0
        ? existing.manualQueryHints
        : normalizedInputQueryHints
      : existing?.manualQueryHints || [];
  const nextAutoTags =
    metadataOrigin === "auto"
      ? normalizedAutoMetadata.tags
      : existing
        ? existing.autoTags
        : [];
  const nextAutoEmotionTags =
    metadataOrigin === "auto"
      ? normalizedAutoMetadata.emotionTags
      : existing
        ? existing.autoEmotionTags
        : [];
  const nextAutoQueryHints =
    metadataOrigin === "auto"
      ? normalizedAutoMetadata.queryHints
      : existing?.autoQueryHints || [];
  const fallbackAutoSourceMetadata = buildAutoSourceMetadata({
    provider: asString(input.provider) || existing?.provider || undefined,
    providerQuery: normalizedInputAutoSourceMetadata.providerQuery || normalizedInputQueryHints[0] || undefined,
    queryCandidates:
      normalizedInputAutoSourceMetadata.queryCandidates.length > 0
        ? normalizedInputAutoSourceMetadata.queryCandidates
        : normalizedInputQueryHints,
    providerTitle: normalizedInputAutoSourceMetadata.providerTitle || asString(input.title) || undefined,
    providerSlug: normalizedInputAutoSourceMetadata.providerSlug,
    providerRating: normalizedInputAutoSourceMetadata.providerRating,
    providerTags: normalizedInputAutoSourceMetadata.providerTags,
    providerCandidates: normalizedInputAutoSourceMetadata.providerCandidates,
    selectionDetails: normalizedInputAutoSourceMetadata.selectionDetails,
  });
  const existingAutoSourceMetadata = existing?.autoSourceMetadata || { ...EMPTY_AUTO_SOURCE_METADATA };
  const nextAutoSourceMetadata =
    metadataOrigin === "auto"
      ? buildAutoSourceMetadata({
          provider:
            normalizedInputAutoSourceMetadata.provider ||
            fallbackAutoSourceMetadata.provider ||
            existingAutoSourceMetadata.provider,
          providerQuery:
            normalizedInputAutoSourceMetadata.providerQuery ||
            fallbackAutoSourceMetadata.providerQuery ||
            existingAutoSourceMetadata.providerQuery,
          queryCandidates: pickArrayWithFallback(
            normalizedInputAutoSourceMetadata.queryCandidates,
            fallbackAutoSourceMetadata.queryCandidates,
            existingAutoSourceMetadata.queryCandidates,
            12
          ),
          providerTitle:
            normalizedInputAutoSourceMetadata.providerTitle ||
            fallbackAutoSourceMetadata.providerTitle ||
            existingAutoSourceMetadata.providerTitle,
          providerSlug:
            normalizedInputAutoSourceMetadata.providerSlug ||
            fallbackAutoSourceMetadata.providerSlug ||
            existingAutoSourceMetadata.providerSlug,
          providerRating:
            normalizedInputAutoSourceMetadata.providerRating ||
            fallbackAutoSourceMetadata.providerRating ||
            existingAutoSourceMetadata.providerRating,
          providerTags: pickArrayWithFallback(
            normalizedInputAutoSourceMetadata.providerTags,
            fallbackAutoSourceMetadata.providerTags,
            existingAutoSourceMetadata.providerTags,
            24
          ),
          providerCandidates: pickArrayWithFallback(
            normalizedInputAutoSourceMetadata.providerCandidates,
            fallbackAutoSourceMetadata.providerCandidates,
            existingAutoSourceMetadata.providerCandidates,
            8
          ),
          selectionDetails: pickArrayWithFallback(
            normalizedInputAutoSourceMetadata.selectionDetails,
            fallbackAutoSourceMetadata.selectionDetails,
            existingAutoSourceMetadata.selectionDetails,
            10
          ),
        })
      : existingAutoSourceMetadata;
  const nextTitle =
    preserveExistingMetadataOnUpdate && existing?.title
      ? existing.title
      : asString(input.title) || existing?.title || null;
  const nextSummary =
    preserveExistingMetadataOnUpdate && existing?.summary
      ? existing.summary
      : metadata.summary || existing?.summary || null;
  const nextTags = uniqueTrimmedValues([...nextManualTags, ...nextAutoTags], 24);
  const nextEmotionTags = uniqueTrimmedValues([...nextManualEmotionTags, ...nextAutoEmotionTags], 12);
  const nextQueryHints = uniqueTrimmedValues([...nextManualQueryHints, ...nextAutoQueryHints], 16);
  const nextSourceUrl =
    normalizedSource.imageUrl ||
    normalizedStorage.imageUrl ||
    normalizedSource.mediaUrl ||
    normalizedStorage.mediaUrl ||
    asString(input.sourceUrl) ||
    asString(input.storageUrl) ||
    asString(input.sourceMediaUrl) ||
    asString(input.storageMediaUrl) ||
    existing?.sourceUrl ||
    existing?.storageUrl ||
    existing?.sourceMediaUrl ||
    existing?.storageMediaUrl ||
    "";
  const rowBase = {
    user_id: libraryUserId,
    provider: asString(input.provider) || existing?.provider || "manual",
    provider_asset_id: asString(input.providerAssetId) || existing?.providerAssetId || null,
    is_favorite: input.isFavorite === true || existing?.isFavorite === true,
    title: nextTitle,
    summary: nextSummary,
    media_kind: normalizedMediaKind || existing?.mediaKind || "image",
    source_url: nextSourceUrl,
    source_media_url: normalizedSource.mediaUrl || asString(input.sourceMediaUrl) || existing?.sourceMediaUrl || null,
    source_page_url: asString(input.sourcePageUrl) || existing?.sourcePageUrl || null,
    storage_url: normalizedStorage.imageUrl || asString(input.storageUrl) || existing?.storageUrl || null,
    storage_media_url: normalizedStorage.mediaUrl || asString(input.storageMediaUrl) || existing?.storageMediaUrl || null,
    width: typeof input.width === "number" && Number.isFinite(input.width) ? input.width : existing?.width || null,
    height: typeof input.height === "number" && Number.isFinite(input.height) ? input.height : existing?.height || null,
    manual_tags: nextManualTags,
    auto_tags: nextAutoTags,
    tags: nextTags,
    manual_emotion_tags: nextManualEmotionTags,
    auto_emotion_tags: nextAutoEmotionTags,
    emotion_tags: nextEmotionTags,
    manual_query_hints: nextManualQueryHints,
    auto_query_hints: nextAutoQueryHints,
    query_hints: nextQueryHints,
    auto_source_metadata: nextAutoSourceMetadata,
    updated_at_ms: now,
  };

  if (existing) {
    const rows = await updateSupabaseRows<StudioMediaAssetRow>(
      "studio_media_assets",
      {
        id: existing.id,
        user_id: libraryUserId,
      },
      rowBase
    );
    const record = toRecord(rows[0] || ({ ...rowBase, id: existing.id, inserted_at_ms: existing.insertedAtMs } as StudioMediaAssetRow));
    if (hasFolderPath) {
      await persistStudioMediaAssetFolderPath(libraryUserId, record.id, typeof input.folderPath === "string" ? input.folderPath : "");
      return {
        ...record,
        folderPath: normalizeStudioMediaFolderPath(typeof input.folderPath === "string" ? input.folderPath : "") || inferStudioMediaFolderPath(record),
      };
    }
    return {
      ...record,
      folderPath: await resolveStudioMediaAssetFolderPath(libraryUserId, record.id, record),
    };
  }

  const newId = globalThis.crypto?.randomUUID?.() || `asset-${now}`;
  const rows = await insertSupabaseRows<StudioMediaAssetRow>("studio_media_assets", [
    {
      id: newId,
      inserted_at_ms: now,
      ...rowBase,
    },
  ]);
  const record = toRecord(rows[0]);
  if (hasFolderPath) {
    await persistStudioMediaAssetFolderPath(libraryUserId, record.id, typeof input.folderPath === "string" ? input.folderPath : "");
    return {
      ...record,
      folderPath: normalizeStudioMediaFolderPath(typeof input.folderPath === "string" ? input.folderPath : "") || inferStudioMediaFolderPath(record),
    };
  }
  return {
    ...record,
    folderPath: await resolveStudioMediaAssetFolderPath(libraryUserId, record.id, record),
  };
}

export async function updateStudioMediaAsset(input: {
  id: string;
  userId?: string;
  isFavorite?: boolean;
  title?: string;
  summary?: string;
  tags?: string[];
  emotionTags?: string[];
  queryHints?: string[];
  folderPath?: string | null;
}): Promise<StudioMediaAssetRecord | null> {
  const safeId = asString(input.id);
  if (!safeId) return null;
  const hasFolderPath = Object.prototype.hasOwnProperty.call(input, "folderPath");
  const libraryUserId = await resolveStudioMediaLibraryUserId(input.userId);
  const existingRows = await selectSupabaseRows<StudioMediaAssetRow>("studio_media_assets", {
    filters: {
      id: safeId,
      user_id: libraryUserId,
    },
    limit: 1,
  });
  const existingRow = existingRows[0];
  if (!existingRow) return null;
  const existing = toRecord(existingRow);
  const nextManualTags = input.tags !== undefined ? normalizeTagValues(input.tags, 24) : existing.manualTags;
  const nextManualEmotionTags =
    input.emotionTags !== undefined ? normalizeTagValues(input.emotionTags, 12) : existing.manualEmotionTags;
  const nextManualQueryHints =
    input.queryHints !== undefined ? uniqueTrimmedValues(input.queryHints.map((item) => item.trim()), 16) : existing.manualQueryHints;
  const patch: Record<string, unknown> = {
    updated_at_ms: Date.now(),
  };
  if (typeof input.isFavorite === "boolean") patch.is_favorite = input.isFavorite;
  if (input.title !== undefined) patch.title = asString(input.title) || null;
  if (input.summary !== undefined) patch.summary = asString(input.summary) || null;
  patch.manual_tags = nextManualTags;
  patch.auto_tags = existing.autoTags;
  patch.tags = uniqueTrimmedValues([...nextManualTags, ...existing.autoTags], 24);
  patch.manual_emotion_tags = nextManualEmotionTags;
  patch.auto_emotion_tags = existing.autoEmotionTags;
  patch.emotion_tags = uniqueTrimmedValues([...nextManualEmotionTags, ...existing.autoEmotionTags], 12);
  patch.manual_query_hints = nextManualQueryHints;
  patch.auto_query_hints = existing.autoQueryHints;
  patch.query_hints = uniqueTrimmedValues([...nextManualQueryHints, ...existing.autoQueryHints], 16);
  const rows = await updateSupabaseRows<StudioMediaAssetRow>(
    "studio_media_assets",
    {
      id: safeId,
      user_id: libraryUserId,
    },
    patch
  );
  const row = rows[0];
  if (!row) return null;
  const record = toRecord(row);
  if (hasFolderPath) {
    await persistStudioMediaAssetFolderPath(libraryUserId, safeId, typeof input.folderPath === "string" ? input.folderPath : "");
    return {
      ...record,
      folderPath: normalizeStudioMediaFolderPath(typeof input.folderPath === "string" ? input.folderPath : "") || inferStudioMediaFolderPath(record),
    };
  }
  return {
    ...record,
    folderPath: await resolveStudioMediaAssetFolderPath(libraryUserId, safeId, record),
  };
}

export async function deleteStudioMediaAsset(id: string, userId?: string): Promise<void> {
  const safeId = asString(id);
  if (!safeId) return;
  const libraryUserId = await resolveStudioMediaLibraryUserId(userId);
  await deleteSupabaseRows("studio_media_assets", {
    id: safeId,
    user_id: libraryUserId,
  });
  await deleteAppCacheEntry(STUDIO_MEDIA_ASSET_FOLDER_SCOPE, getSharedStudioLibraryScope(), safeId).catch(() => undefined);
}

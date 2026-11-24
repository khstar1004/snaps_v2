import { getSupabaseKeyValueStoreOrNull, type SupabaseKeyValueStore } from "@/lib/supabase/app-cache";
import { createSignedSupabaseStorageUrl, getSupabaseStoragePublicUrl } from "@/lib/supabase/storage";
import { getSharedStudioLibraryScope } from "@/lib/studio/library-scope";
import type { ImageRequest, SlideMediaKind } from "@/types/studio-json";

export const MEME_LIBRARY_INDEX_KEY = "studio:meme-library:index";
export const MEME_LIBRARY_ITEM_PREFIX = "studio:meme-library:item:";
export const MEME_LIBRARY_TTL_SEC = Math.max(
  60 * 60,
  Number.parseInt((process.env.MEME_LIBRARY_TTL_SEC || "").trim() || "7776000", 10) || 7776000
);
const MEME_LIBRARY_MAX_ITEMS = Math.max(
  50,
  Number.parseInt((process.env.MEME_LIBRARY_MAX_ITEMS || "").trim() || "500", 10) || 500
);
const MEME_LIBRARY_SCAN_LIMIT = Math.max(
  20,
  Number.parseInt((process.env.MEME_LIBRARY_SCAN_LIMIT || "").trim() || "120", 10) || 120
);

const MEME_LIBRARY_SCOPE = "studio_meme_library";

export type MemeLibraryRecord = {
  provider: "giphy" | "supabase" | "manual";
  id: string;
  title?: string;
  pageUrl?: string;
  url: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  width?: number;
  height?: number;
  storageBucket?: string;
  storagePath?: string;
  queryHints: string[];
  tags: string[];
  emotionTags: string[];
  insertedAt: number;
  updatedAt: number;
};

export type MemeLibraryIdentitySet = {
  ids: Set<string>;
  urls: Set<string>;
  tokenSets: string[][];
};

export type MemeLibraryListOptions = {
  limit?: number;
  query?: string;
  tag?: string;
  emotionTag?: string;
  mediaKind?: "all" | "image" | "motion";
};

const EMOTION_RULES: Array<{ tag: string; hints: string[] }> = [
  { tag: "embarrassed", hints: ["민망", "뻘쭘", "embarrassed"] },
  { tag: "flustered", hints: ["당황", "허둥", "어색", "awkward", "nervous", "flustered", "cringe"] },
  { tag: "speechless", hints: ["어이없", "황당", "정색", "speechless", "wtf"] },
  { tag: "facepalm", hints: ["답답", "한숨", "현실부정", "facepalm", "bruh", "tired"] },
  { tag: "mental_break", hints: ["멘붕", "mental break", "breakdown"] },
  { tag: "empty", hints: ["현타", "허탈", "망함", "망했다", "defeated", "empty", "burnout"] },
  { tag: "furious", hints: ["분노", "빡침", "rage", "furious"] },
  { tag: "irritated", hints: ["화남", "열받", "짜증", "angry", "mad", "irritated"] },
  { tag: "crying", hints: ["눈물", "울컥", "crying", "sob"] },
  { tag: "gloomy", hints: ["슬픔", "우울", "sad", "depressed", "blue"] },
  { tag: "startled", hints: ["깜놀", "철렁", "움찔", "화들짝", "startled", "jump scare", "jumpscare"] },
  { tag: "scared", hints: ["공포", "무섭", "무서움", "겁", "겁남", "fear", "fearful", "afraid", "scared", "terrified"] },
  { tag: "creepy", hints: ["오싹", "소름", "섬뜩", "기괴", "creepy", "eerie", "haunted"] },
  { tag: "wronged", hints: ["억울", "억까", "분함", "wronged", "unfair"] },
  { tag: "shocked", hints: ["충격", "경악", "헉", "shocked", "omg"] },
  { tag: "confused", hints: ["놀람", "얼탐", "띠용", "surprised", "confused"] },
  { tag: "smug", hints: ["우쭐", "당당", "smug", "confident"] },
  { tag: "winning", hints: ["뿌듯", "자신", "이김", "winning", "proud"] },
];

const EMOTION_FALLBACKS: Record<string, string[]> = {
  embarrassed: ["awkward", "generic"],
  flustered: ["awkward", "generic"],
  speechless: ["annoyed", "generic"],
  facepalm: ["annoyed", "generic"],
  mental_break: ["breakdown", "generic"],
  empty: ["breakdown", "generic"],
  furious: ["angry", "generic"],
  irritated: ["angry", "generic"],
  crying: ["sad", "generic"],
  gloomy: ["sad", "generic"],
  startled: ["surprised", "generic"],
  scared: ["surprised", "generic"],
  creepy: ["scared", "surprised", "generic"],
  wronged: ["unfair", "generic"],
  shocked: ["surprised", "generic"],
  confused: ["surprised", "generic"],
  smug: ["proud", "generic"],
  winning: ["proud", "generic"],
  awkward: ["generic"],
  annoyed: ["generic"],
  breakdown: ["generic"],
  angry: ["generic"],
  sad: ["generic"],
  unfair: ["generic"],
  surprised: ["generic"],
  proud: ["generic"],
  generic: [],
};

const EMOTION_PARENTS: Record<string, string[]> = {
  embarrassed: ["awkward"],
  flustered: ["awkward"],
  speechless: ["annoyed"],
  facepalm: ["annoyed"],
  mental_break: ["breakdown"],
  empty: ["breakdown"],
  furious: ["angry"],
  irritated: ["angry"],
  crying: ["sad"],
  gloomy: ["sad"],
  startled: ["surprised"],
  scared: ["surprised"],
  creepy: ["scared"],
  wronged: ["unfair"],
  shocked: ["surprised"],
  confused: ["surprised"],
  smug: ["proud"],
  winning: ["proud"],
};

function resolveSignedUrlTtlSec(): number {
  return Math.max(
    60,
    Math.min(
      60 * 60 * 24 * 7,
      Number.parseInt((process.env.SUPABASE_MEDIA_LIBRARY_SIGNED_URL_TTL_SEC || "").trim() || "3600", 10) || 3600
    )
  );
}

export function getMemeLibraryRedisOrNull(userScope?: string): SupabaseKeyValueStore | null {
  return getSupabaseKeyValueStoreOrNull(MEME_LIBRARY_SCOPE, getSharedStudioLibraryScope() || userScope);
}

export function isMemeLibraryStoreEnabled(userScope?: string): boolean {
  return Boolean(getMemeLibraryRedisOrNull(userScope));
}

function uniqueSorted(values: string[]): string[] {
  return unique(values).sort((left, right) => left.localeCompare(right));
}

function toItemKey(id: string): string {
  return `${MEME_LIBRARY_ITEM_PREFIX}${id.trim()}`;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!out.includes(compact)) out.push(compact);
  }
  return out;
}

function sanitizeTagList(values: string[], limit: number): string[] {
  return unique(
    values
      .map((value) => normalizeText(value))
      .filter(Boolean)
  ).slice(0, limit);
}

async function resolveLibraryAccessRecord(record: MemeLibraryRecord): Promise<MemeLibraryRecord> {
  if (record.provider !== "supabase" || !record.storageBucket || !record.storagePath) {
    return record;
  }
  try {
    const accessUrl = await createSignedSupabaseStorageUrl({
      bucket: record.storageBucket,
      path: record.storagePath,
      expiresInSec: resolveSignedUrlTtlSec(),
    });
    if (record.mediaKind === "video") {
      return {
        ...record,
        url: accessUrl,
        mediaUrl: accessUrl,
      };
    }
    return {
      ...record,
      url: accessUrl,
      mediaUrl: record.mediaUrl || (record.mediaKind === "animated_image" ? accessUrl : undefined),
    };
  } catch {
    const fallbackUrl = getSupabaseStoragePublicUrl(record.storageBucket, record.storagePath);
    if (record.mediaKind === "video") {
      return {
        ...record,
        url: fallbackUrl,
        mediaUrl: record.mediaUrl || fallbackUrl,
      };
    }
    return {
      ...record,
      url: fallbackUrl,
      mediaUrl: record.mediaUrl || (record.mediaKind === "animated_image" ? fallbackUrl : undefined),
    };
  }
}

function inferEmotionTags(values: string[]): string[] {
  const corpus = normalizeText(values.join(" "));
  const out: string[] = [];
  for (const rule of EMOTION_RULES) {
    if (rule.hints.some((hint) => corpus.includes(hint.toLowerCase()))) {
      out.push(rule.tag);
    }
  }
  if (out.length <= 0) return ["generic"];
  const expanded = [...out];
  for (const tag of out) {
    for (const parent of EMOTION_PARENTS[tag] || []) {
      if (!expanded.includes(parent)) expanded.push(parent);
    }
  }
  if (!expanded.includes("generic")) expanded.push("generic");
  return expanded;
}

function expandSearchEmotionTags(values: string[]): string[] {
  const inferred = inferEmotionTags(values);
  const ordered: string[] = [];
  for (const tag of inferred) {
    if (!ordered.includes(tag)) ordered.push(tag);
    for (const fallback of EMOTION_FALLBACKS[tag] || []) {
      if (!ordered.includes(fallback)) ordered.push(fallback);
    }
  }
  if (!ordered.includes("generic")) ordered.push("generic");
  return ordered;
}

function buildRequestTokens(request: ImageRequest): string[] {
  return unique([
    ...tokenize(request.query || ""),
    ...((request.queryCandidates || []).flatMap((item) => tokenize(item))),
    ...tokenize(request.scene || ""),
  ]).slice(0, 12);
}

function buildRecordCorpus(record: MemeLibraryRecord): string[] {
  return unique([
    ...tokenize(record.title || ""),
    ...tokenize(record.pageUrl || ""),
    ...tokenize(record.url || ""),
    ...tokenize(record.storagePath || ""),
    ...(record.queryHints || []).flatMap((item) => tokenize(item)),
    ...(record.tags || []).flatMap((item) => tokenize(item)),
  ]);
}

function scoreRecord(record: MemeLibraryRecord, requestTokens: string[]): number {
  const corpusTokens = buildRecordCorpus(record);
  if (corpusTokens.length <= 0) return 0;
  let score = 0;
  for (const token of requestTokens) {
    if (corpusTokens.includes(token)) score += 8;
    else if (corpusTokens.some((item) => item.includes(token) || token.includes(item))) score += 4;
  }
  if (record.provider === "supabase") score += 8;
  if (record.mediaKind === "video" || record.mediaKind === "animated_image") score += 6;
  if ((record.width || 0) * (record.height || 0) >= 320 * 480) score += 3;
  score += Math.max(0, Math.min(6, Math.round((Date.now() - record.updatedAt) / (1000 * 60 * 60 * 24 * -30))));
  return score;
}

export async function storeMemeLibraryItems(
  items: Array<{
    provider: "giphy" | "supabase" | "manual";
    id: string;
    title?: string;
    pageUrl?: string;
    url: string;
    mediaUrl?: string;
    mediaKind?: SlideMediaKind;
    width?: number;
    height?: number;
    storageBucket?: string;
    storagePath?: string;
    queryHints?: string[];
    tags?: string[];
    emotionTags?: string[];
  }>,
  options?: { userScope?: string }
): Promise<void> {
  const redis = getMemeLibraryRedisOrNull(options?.userScope);
  if (!redis || items.length <= 0) return;

  const now = Date.now();
  const nextIds: string[] = [];
  for (const item of items) {
    const id = item.id.trim();
    const url = item.url.trim();
    if (!id || !url) continue;
    const existing = await redis.get<MemeLibraryRecord | null>(toItemKey(id)).catch(() => null);
    const record: MemeLibraryRecord = {
      provider: item.provider || existing?.provider || "giphy",
      id,
      title: item.title?.trim() || existing?.title,
      pageUrl: item.pageUrl?.trim() || existing?.pageUrl,
      url,
      mediaUrl: item.mediaUrl?.trim() || existing?.mediaUrl,
      mediaKind: item.mediaKind || existing?.mediaKind,
      width: typeof item.width === "number" ? item.width : existing?.width,
      height: typeof item.height === "number" ? item.height : existing?.height,
      storageBucket: item.storageBucket?.trim() || existing?.storageBucket,
      storagePath: item.storagePath?.trim() || existing?.storagePath,
      queryHints: unique([...(existing?.queryHints || []), ...(item.queryHints || [])]).slice(0, 16),
      tags: unique([...(existing?.tags || []), ...(item.tags || [])]).slice(0, 24),
      emotionTags: unique([
        ...(existing?.emotionTags || []),
        ...(item.emotionTags || []),
        ...inferEmotionTags([item.title || "", ...(item.queryHints || []), ...(item.tags || [])]),
      ]).slice(0, 8),
      insertedAt: existing?.insertedAt || now,
      updatedAt: now,
    };
    await redis.set(toItemKey(id), record, { ex: MEME_LIBRARY_TTL_SEC }).catch(() => null);
    nextIds.push(id);
  }

  if (nextIds.length <= 0) return;
  const currentIds = (await redis.get<string[] | null>(MEME_LIBRARY_INDEX_KEY).catch(() => null)) || [];
  const merged = unique([...nextIds, ...currentIds]).slice(0, MEME_LIBRARY_MAX_ITEMS);
  await redis.set(MEME_LIBRARY_INDEX_KEY, merged).catch(() => null);
}

export async function saveMemeLibraryItem(
  input: {
    provider?: "giphy" | "supabase" | "manual";
    id?: string;
    title?: string;
    pageUrl?: string;
    url: string;
    mediaUrl?: string;
    mediaKind?: SlideMediaKind;
    width?: number;
    height?: number;
    storageBucket?: string;
    storagePath?: string;
    queryHints?: string[];
    tags?: string[];
    emotionTags?: string[];
  },
  options?: { userScope?: string }
): Promise<MemeLibraryRecord | null> {
  const baseUrl = input.url.trim() || input.mediaUrl?.trim() || "";
  if (!baseUrl) return null;
  const id =
    input.id?.trim() ||
    `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await storeMemeLibraryItems(
    [
      {
        provider: input.provider || "manual",
        id,
        title: input.title,
        pageUrl: input.pageUrl,
        url: baseUrl,
        mediaUrl: input.mediaUrl,
        mediaKind: input.mediaKind,
        width: input.width,
        height: input.height,
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        queryHints: input.queryHints,
        tags: input.tags,
        emotionTags: input.emotionTags,
      },
    ],
    options
  );
  return updateMemeLibraryItem(
    {
      id,
      title: input.title,
      tags: input.tags,
      emotionTags: input.emotionTags,
      queryHints: input.queryHints,
      userScope: options?.userScope,
    }
  );
}

export async function getMemeLibraryIdentitySet(): Promise<MemeLibraryIdentitySet> {
  return getMemeLibraryIdentitySetForEmotionTags(["generic"]);
}

export async function getMemeLibraryIdentitySetForEmotionTags(
  emotionTags: string[],
  options?: { userScope?: string }
): Promise<MemeLibraryIdentitySet> {
  const redis = getMemeLibraryRedisOrNull(options?.userScope);
  const ids = new Set<string>();
  const urls = new Set<string>();
  const tokenSets: string[][] = [];
  if (!redis) return { ids, urls, tokenSets };
  const emotionSet = new Set(unique(emotionTags.map((item) => item.trim()).filter(Boolean)));
  const indexedIds = ((await redis.get<string[] | null>(MEME_LIBRARY_INDEX_KEY).catch(() => null)) || []).slice(0, MEME_LIBRARY_MAX_ITEMS);
  for (const item of indexedIds) {
    const safeId = String(item || "").trim();
    if (!safeId) continue;
    const record = await redis.get<MemeLibraryRecord | null>(toItemKey(safeId)).catch(() => null);
    if (!record) continue;
    const recordEmotionTags = Array.isArray(record.emotionTags) && record.emotionTags.length > 0 ? record.emotionTags : ["generic"];
    if (emotionSet.size > 0 && !recordEmotionTags.some((tag) => emotionSet.has(tag))) continue;
    ids.add(safeId);
    if (record.url?.trim()) urls.add(record.url.trim());
    if (record.mediaUrl?.trim()) urls.add(record.mediaUrl.trim());
    const tokens = uniqueSorted(buildRecordCorpus(record));
    if (tokens.length > 0) tokenSets.push(tokens);
  }
  return { ids, urls, tokenSets };
}

export function buildMemeCandidateTokens(input: {
  title?: string;
  pageUrl?: string;
  url?: string;
  queryHints?: string[];
  tags?: string[];
}): string[] {
  return uniqueSorted([
    ...tokenize(input.title || ""),
    ...tokenize(input.pageUrl || ""),
    ...tokenize(input.url || ""),
    ...((input.queryHints || []).flatMap((item) => tokenize(item))),
    ...((input.tags || []).flatMap((item) => tokenize(item))),
  ]);
}

export function inferMemeEmotionTags(values: string[]): string[] {
  return inferEmotionTags(values);
}

export function buildMemeEmotionSearchOrder(values: string[]): string[] {
  return expandSearchEmotionTags(values);
}

export async function searchMemeLibrary(
  request: ImageRequest,
  options?: { limit?: number; excludeIds?: string[]; excludeUrls?: string[]; userScope?: string }
): Promise<MemeLibraryRecord[]> {
  const redis = getMemeLibraryRedisOrNull(options?.userScope);
  if (!redis) return [];
  const limit = Math.max(1, Math.min(24, Math.floor(options?.limit || 8)));
  const requestTokens = buildRequestTokens(request);
  if (requestTokens.length <= 0) return [];
  const requestEmotionTags = expandSearchEmotionTags([request.query || "", ...(request.queryCandidates || []), request.scene || ""]);
  const shouldFilterByEmotion = requestEmotionTags.some((tag) => tag !== "generic");
  const excludeIds = new Set((options?.excludeIds || []).map((item) => item.trim()).filter(Boolean));
  const excludeUrls = new Set((options?.excludeUrls || []).map((item) => item.trim()).filter(Boolean));
  const ids = ((await redis.get<string[] | null>(MEME_LIBRARY_INDEX_KEY).catch(() => null)) || []).slice(0, MEME_LIBRARY_SCAN_LIMIT);
  const scored: Array<{ record: MemeLibraryRecord; score: number }> = [];

  for (const id of ids) {
    const safeId = String(id || "").trim();
    if (!safeId || excludeIds.has(safeId)) continue;
    const record = await redis.get<MemeLibraryRecord | null>(toItemKey(safeId)).catch(() => null);
    if (!record || !record.url || excludeUrls.has(record.url.trim())) continue;
    const recordEmotionTags = Array.isArray(record.emotionTags) && record.emotionTags.length > 0 ? record.emotionTags : ["generic"];
    if (shouldFilterByEmotion && !recordEmotionTags.some((tag) => requestEmotionTags.includes(tag))) continue;
    const score = scoreRecord(record, requestTokens);
    if (score <= 0) continue;
    scored.push({ record, score });
  }

  const selected = scored
    .sort((left, right) => right.score - left.score || right.record.updatedAt - left.record.updatedAt)
    .slice(0, limit)
    .map(({ record }) => record);
  return Promise.all(selected.map((record) => resolveLibraryAccessRecord(record)));
}

export async function countMemeLibraryByEmotionTag(options?: { userScope?: string }): Promise<Record<string, number>> {
  const redis = getMemeLibraryRedisOrNull(options?.userScope);
  const counts: Record<string, number> = {};
  if (!redis) return counts;
  const ids = ((await redis.get<string[] | null>(MEME_LIBRARY_INDEX_KEY).catch(() => null)) || []).slice(0, MEME_LIBRARY_MAX_ITEMS);
  for (const id of ids) {
    const safeId = String(id || "").trim();
    if (!safeId) continue;
    const record = await redis.get<MemeLibraryRecord | null>(toItemKey(safeId)).catch(() => null);
    if (!record) continue;
    const tags = Array.isArray(record.emotionTags) && record.emotionTags.length > 0 ? record.emotionTags : ["generic"];
    for (const tag of tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

async function readIndexedMemeLibraryRecords(limit: number, userScope?: string): Promise<MemeLibraryRecord[]> {
  const redis = getMemeLibraryRedisOrNull(userScope);
  if (!redis) return [];
  const ids = ((await redis.get<string[] | null>(MEME_LIBRARY_INDEX_KEY).catch(() => null)) || []).slice(
    0,
    Math.max(1, Math.min(MEME_LIBRARY_MAX_ITEMS, limit))
  );
  const records: MemeLibraryRecord[] = [];
  for (const id of ids) {
    const safeId = String(id || "").trim();
    if (!safeId) continue;
    const record = await redis.get<MemeLibraryRecord | null>(toItemKey(safeId)).catch(() => null);
    if (!record) continue;
    records.push(record);
  }
  return records;
}

export async function listMemeLibraryItems(
  options?: MemeLibraryListOptions & { userScope?: string }
): Promise<MemeLibraryRecord[]> {
  const limit = Math.max(1, Math.min(MEME_LIBRARY_MAX_ITEMS, Math.floor(options?.limit || 120)));
  const queryTokens = tokenize(options?.query || "");
  const tagFilter = normalizeText(options?.tag || "");
  const emotionFilter = normalizeText(options?.emotionTag || "");
  const mediaKind = options?.mediaKind || "all";
  const records = await readIndexedMemeLibraryRecords(limit, options?.userScope);
  const filtered = records
    .filter((record) => {
      if (mediaKind === "image" && record.mediaKind && record.mediaKind !== "image") return false;
      if (mediaKind === "motion" && record.mediaKind !== "video" && record.mediaKind !== "animated_image") return false;
      if (tagFilter && !(record.tags || []).some((tag) => normalizeText(tag) === tagFilter)) return false;
      if (emotionFilter && !(record.emotionTags || []).some((tag) => normalizeText(tag) === emotionFilter)) return false;
      if (queryTokens.length > 0) {
        const corpus = buildRecordCorpus(record);
        if (!queryTokens.every((token) => corpus.some((item) => item.includes(token) || token.includes(item)))) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
  return Promise.all(filtered.map((record) => resolveLibraryAccessRecord(record)));
}

export async function updateMemeLibraryItem(input: {
  id: string;
  title?: string;
  tags?: string[];
  emotionTags?: string[];
  queryHints?: string[];
  userScope?: string;
}): Promise<MemeLibraryRecord | null> {
  const redis = getMemeLibraryRedisOrNull(input.userScope);
  const safeId = input.id.trim();
  if (!redis || !safeId) return null;
  const existing = await redis.get<MemeLibraryRecord | null>(toItemKey(safeId)).catch(() => null);
  if (!existing) return null;
  const title = typeof input.title === "string" ? input.title.trim() : existing.title;
  const tags = Array.isArray(input.tags) ? sanitizeTagList(input.tags, 24) : existing.tags;
  const queryHints = Array.isArray(input.queryHints)
    ? unique(input.queryHints.map((item) => item.trim()).filter(Boolean)).slice(0, 16)
    : existing.queryHints;
  const emotionTags = Array.isArray(input.emotionTags)
    ? sanitizeTagList(input.emotionTags, 8)
    : unique([
        ...(existing.emotionTags || []),
        ...inferEmotionTags([title || "", ...queryHints, ...tags]),
      ]).slice(0, 8);
  const nextRecord: MemeLibraryRecord = {
    ...existing,
    title: title || undefined,
    tags,
    queryHints,
    emotionTags: emotionTags.length > 0 ? emotionTags : ["generic"],
    updatedAt: Date.now(),
  };
  await redis.set(toItemKey(safeId), nextRecord, { ex: MEME_LIBRARY_TTL_SEC }).catch(() => null);
  return resolveLibraryAccessRecord(nextRecord);
}

export async function deleteMemeLibraryItem(id: string, options?: { userScope?: string }): Promise<boolean> {
  const redis = getMemeLibraryRedisOrNull(options?.userScope);
  const safeId = id.trim();
  if (!redis || !safeId) return false;
  await redis.del(toItemKey(safeId)).catch(() => 0);
  const ids = ((await redis.get<string[] | null>(MEME_LIBRARY_INDEX_KEY).catch(() => null)) || []).filter(
    (item) => String(item || "").trim() !== safeId
  );
  await redis.set(MEME_LIBRARY_INDEX_KEY, ids.slice(0, MEME_LIBRARY_MAX_ITEMS)).catch(() => null);
  return true;
}

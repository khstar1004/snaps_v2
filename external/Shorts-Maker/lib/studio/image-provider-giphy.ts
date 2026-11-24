import { analyzeImageRequestSearchSignal, normalizeMemeSearchPhrase } from "@/lib/studio/images/intent";
import { buildMemeEmotionSearchOrder, getMemeLibraryIdentitySetForEmotionTags, searchMemeLibrary, storeMemeLibraryItems } from "@/lib/studio/meme-library";
import {
  DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES,
  dedupeGiphyQueriesByFamily,
  isGiphySearchableQuery,
  normalizeGiphySearchQuery,
} from "@/lib/studio/giphy-query-utils";
import { normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import { buildGiphyReactionQueriesFromRequest, deriveProviderTags, trimQueryLength, dedupeQueries, containsLatin, containsHangul } from "@/lib/studio/image-provider-resolver-helpers";
import { toEnglishHint } from "@/lib/studio/query-translation";
import type { ImageRequest, SlideMediaKind } from "@/types/studio-json";

type GiphyProviderIntent = "news" | "meme";

type GiphyProviderSourceMetadata = {
  providerQuery?: string;
  providerTitle?: string;
  providerSlug?: string;
  providerRating?: string;
  providerTags?: string[];
};

type GiphyProviderCandidate = {
  provider: "giphy";
  id: string;
  url: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  pageUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  sourceMetadata?: GiphyProviderSourceMetadata;
};

type GiphyAdapterResult = {
  ok: boolean;
  candidates: GiphyProviderCandidate[];
  reason?: string;
  searchedQueries?: string[];
};

type GiphySearchOptions = {
  intent: GiphyProviderIntent;
  maxCandidatesPerProvider: number;
  providerTimeBudgetMs: number;
  libraryUserScope: string;
  libraryOnly?: boolean;
};

type GiphySearchStrategy = {
  useLibraryCandidates: boolean;
  useLibraryIdentityFilter: boolean;
  useExternalApi: boolean;
};

const DEFAULT_PROVIDER_TIME_BUDGET_MS = 5_000;
const GIPHY_DEFAULT_RATING = "pg-13";

const GIPHY_MEME_TAG_HINTS = [
  "reaction",
  "meme",
  "funny",
  "lol",
  "lmao",
  "facepalm",
  "awkward",
  "cringe",
  "shocked",
  "surprised",
  "angry",
  "laughing",
  "confused",
  "wtf",
  "omg",
  "fail",
  "scared",
  "horror",
  "creepy",
  "terrified",
  "startled",
];
const GIPHY_CONTEXT_STOPWORDS = [
  "자영업자",
  "소상공인",
  "사장",
  "사장님",
  "직장인",
  "회사원",
  "세무",
  "세금",
  "환급",
  "경정청구",
  "홈택스",
  "신고",
  "서류",
  "상담",
  "회계",
  "법률",
  "법무",
  "변호사",
  "업무",
  "일",
  "표정",
  "사진",
  "이미지",
  "짤",
  "움짤",
  "gif",
  "meme",
  "reaction",
];
const GIPHY_REACTION_QUERY_MAP: Array<{ hints: string[]; keywords: string[]; queries: string[] }> = [
  { hints: ["기쁨", "기쁜", "행복", "행복함", "즐거움", "즐거운", "신남", "신난"], keywords: ["happy", "joy", "excited", "celebration"], queries: ["happy reaction", "happy meme", "excited reaction", "celebration reaction"] },
  { hints: ["여유", "느긋", "편안", "평온", "안심", "안도"], keywords: ["relieved", "chill", "calm", "smug"], queries: ["relieved reaction", "chill reaction", "calm smile", "smug smile"] },
  { hints: ["자신", "당당", "뿌듯", "우쭐", "의기양양"], keywords: ["confident", "smug", "boss", "winning"], queries: ["confident reaction", "smug reaction", "boss reaction", "winning reaction"] },
  { hints: ["당황", "민망", "어색", "뻘쭘"], keywords: ["awkward", "cringe", "flustered", "side eye"], queries: ["awkward reaction", "nervous laugh", "cringe reaction", "side eye reaction"] },
  { hints: ["놀람", "충격", "경악", "헉"], keywords: ["surprise", "shocked", "surprised", "omg"], queries: ["shocked reaction", "surprised reaction", "omg reaction"] },
  { hints: ["분노", "화남", "열받", "빡침"], keywords: ["angry", "mad", "rage", "furious"], queries: ["angry reaction", "mad reaction", "rage reaction"] },
  { hints: ["답답", "한숨", "어이없", "황당"], keywords: ["facepalm", "wtf", "bruh", "speechless"], queries: ["facepalm reaction", "tired reaction", "done with this reaction"] },
  { hints: ["웃김", "웃긴", "폭소", "웃음"], keywords: ["funny", "laughing", "lol", "lmao"], queries: ["funny reaction", "laughing reaction", "lol reaction"] },
  { hints: ["슬픔", "우울", "눈물", "울컥"], keywords: ["crying", "sad", "sobbing"], queries: ["crying reaction", "sad reaction"] },
  { hints: ["고민", "걱정", "불안", "초조"], keywords: ["thinking", "anxious", "worried"], queries: ["thinking reaction", "anxious reaction", "worried reaction"] },
  { hints: ["공포", "무섭", "오싹", "소름", "섬뜩", "철렁", "새벽"], keywords: ["scared", "horror", "creepy", "startled", "terrified"], queries: ["scared reaction", "horror reaction", "creepy reaction", "startled reaction", "terrified reaction"] },
  { hints: ["실망", "허탈", "망함", "망했다"], keywords: ["disappointed", "fail", "bruh", "defeated"], queries: ["disappointed reaction", "fail reaction", "bruh reaction"] },
  { hints: ["부럽", "질투"], keywords: ["jealous", "envy"], queries: ["jealous reaction", "envy reaction"] },
  { hints: ["돈", "매출", "대박", "수익"], keywords: ["money", "rich", "success"], queries: ["money reaction", "rich reaction", "success reaction"] },
  { hints: ["정색", "굳음", "얼음", "무표정"], keywords: ["deadpan", "serious", "blank stare"], queries: ["deadpan reaction", "serious face reaction", "blank stare reaction"] },
  { hints: ["멘붕", "현타", "멍함", "멍", "머리 하얘"], keywords: ["mind blown", "stunned", "buffering"], queries: ["mind blown reaction", "stunned reaction", "buffering reaction"] },
  { hints: ["식은땀", "진땀", "쫄림", "긴장"], keywords: ["nervous", "sweating", "panicked"], queries: ["nervous reaction", "sweating reaction", "panicked reaction"] },
  { hints: ["억울", "분통"], keywords: ["frustrated", "upset", "sulking"], queries: ["frustrated reaction", "upset reaction", "sulking reaction"] },
  { hints: ["수상", "의심", "찝찝", "쎄한"], keywords: ["suspicious", "side eye", "skeptical"], queries: ["suspicious reaction", "side eye reaction", "skeptical reaction"] },
];

export function resolveGiphySearchStrategy(options: Pick<GiphySearchOptions, "libraryOnly">): GiphySearchStrategy {
  if (options.libraryOnly) {
    return {
      useLibraryCandidates: true,
      useLibraryIdentityFilter: true,
      useExternalApi: true,
    };
  }
  return {
    useLibraryCandidates: false,
    useLibraryIdentityFilter: false,
    useExternalApi: true,
  };
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await withTimeout(fetch(url, init), timeoutMs, url);
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status})`);
  }
  return await response.json();
}

export function buildGiphyQuery(request: ImageRequest, intent: GiphyProviderIntent): string {
  const signal = analyzeImageRequestSearchSignal(request);
  const directSearchableSeeds = dedupeGiphyQueriesByFamily(
    [request.query, ...(request.queryCandidates || [])]
      .map((value) => normalizeGiphySearchQuery(normalizeMemeSearchPhrase(value.trim())))
      .filter(isGiphySearchableQuery),
    { sanitize: false }
  );
  const reactionQueries =
    intent === "meme"
      ? dedupeGiphyQueriesByFamily(
          buildGiphyReactionQueriesFromRequest(request)
            .map((query) => normalizeGiphySearchQuery(query))
            .filter(isGiphySearchableQuery),
          { sanitize: false }
        )
      : [];
  if (intent === "meme") {
    if (directSearchableSeeds[0]) return directSearchableSeeds[0];
    const bareKeyword = reactionQueries.find((query) => !query.includes("reaction") && !query.includes(" "));
    if (bareKeyword) return bareKeyword;
    if (reactionQueries[0]) return reactionQueries[0];
  }
  const seeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => normalizeGiphySearchQuery(normalizeMemeSearchPhrase(value.trim())))
    .filter(Boolean);
  const englishSeeds = dedupeQueries(
    [...seeds, request.scene?.trim() || ""]
      .map((value) => normalizeGiphySearchQuery(toEnglishHint(value)))
      .filter((value) => containsLatin(value) && isGiphySearchableQuery(value))
  );
  const base = normalizeGiphySearchQuery(
    englishSeeds[0] || (intent === "meme" ? DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES[0] : signal.hasReactionCue ? "reaction" : "daily life scene")
  );
  if (!containsLatin(base) || containsHangul(base)) {
    return intent === "meme" ? DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES[0] : signal.hasReactionCue ? "reaction" : "daily life scene";
  }
  if (intent === "meme") {
    if (!isGiphySearchableQuery(base)) {
      return reactionQueries[0] || DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES[0];
    }
    if (base.includes("reaction") || base.includes("meme")) return base;
    const withReaction = `${base} reaction`.trim();
    return isGiphySearchableQuery(withReaction) ? withReaction : reactionQueries[0] || DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES[0];
  }
  if (signal.hasReactionCue && !base.includes("reaction")) return `${base} reaction`.trim();
  return base;
}

function buildGiphyQueries(request: ImageRequest, options: GiphySearchOptions): string[] {
  const primaryQuery = buildGiphyQuery(request, options.intent);
  const directQueries = dedupeGiphyQueriesByFamily(
    [request.query, ...(request.queryCandidates || [])]
      .map((value) => normalizeGiphySearchQuery(normalizeMemeSearchPhrase(String(value || "").trim())))
      .filter(isGiphySearchableQuery),
    { sanitize: false }
  );
  const reactionQueries =
    options.intent === "meme"
      ? dedupeGiphyQueriesByFamily(
          buildGiphyReactionQueriesFromRequest(request)
            .map((query) => normalizeGiphySearchQuery(query))
            .filter(isGiphySearchableQuery),
          { sanitize: false }
        )
      : [];
  const englishQueries = dedupeGiphyQueriesByFamily(
    [request.query, ...(request.queryCandidates || []), request.scene || ""]
      .map((value) => normalizeGiphySearchQuery(toEnglishHint(String(value || "").trim())))
      .filter((value) => containsLatin(value) && !containsHangul(value) && isGiphySearchableQuery(value))
    ,
    { sanitize: false }
  );
  const fallbackQueries =
    options.intent === "meme"
      ? [...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES]
      : ["reaction", "daily life scene"];
  if (options.intent !== "meme") {
    return dedupeQueries([primaryQuery, ...directQueries, ...reactionQueries, ...englishQueries, ...fallbackQueries]).slice(0, 6);
  }
  return dedupeGiphyQueriesByFamily([primaryQuery, ...directQueries, ...reactionQueries, ...englishQueries, ...fallbackQueries], {
    limit: 6,
    sanitize: true,
  });
}

function toGiphyCandidateIdentity(candidate: Pick<GiphyProviderCandidate, "id" | "url" | "mediaUrl" | "pageUrl">): string {
  const id = String(candidate.id || "").trim();
  if (id) return `id:${id}`;
  const mediaUrl = String(candidate.mediaUrl || "").trim();
  if (mediaUrl) return `media:${mediaUrl}`;
  const imageUrl = String(candidate.url || "").trim();
  if (imageUrl) return `image:${imageUrl}`;
  const pageUrl = String(candidate.pageUrl || "").trim();
  return pageUrl ? `page:${pageUrl}` : "";
}

function mergeUniqueGiphyCandidates(
  existing: GiphyProviderCandidate[],
  incoming: GiphyProviderCandidate[],
  limit: number
): GiphyProviderCandidate[] {
  const next = [...existing];
  const seen = new Set(
    next
      .map((candidate) => toGiphyCandidateIdentity(candidate))
      .filter(Boolean)
  );
  for (const candidate of incoming) {
    const identity = toGiphyCandidateIdentity(candidate);
    if (!identity || seen.has(identity)) continue;
    next.push(candidate);
    seen.add(identity);
    if (next.length >= limit) break;
  }
  return next;
}

function toGiphyLibraryCandidate(record: Awaited<ReturnType<typeof searchMemeLibrary>>[number]): GiphyProviderCandidate {
  return {
    provider: "giphy",
    id: record.id,
    url: record.url,
    mediaUrl: record.mediaUrl,
    mediaKind: record.mediaKind,
    pageUrl: record.pageUrl,
    title: record.title,
    width: record.width,
    height: record.height,
  };
}

function readGiphyImageAsset(images: Record<string, unknown>, key: string): {
  url: string;
  width: number;
  height: number;
} | null {
  const row = images[key];
  if (!row || typeof row !== "object") return null;
  const asset = row as Record<string, unknown>;
  const url = typeof asset.url === "string" ? asset.url.trim() : "";
  if (!url) return null;
  return {
    url,
    width: Number.isFinite(Number(asset.width)) ? Number(asset.width) : 0,
    height: Number.isFinite(Number(asset.height)) ? Number(asset.height) : 0,
  };
}

function pickGiphyStillCandidate(
  images: Record<string, unknown>,
  orientation: ImageRequest["orientation"]
): {
  url: string;
  width: number;
  height: number;
} | null {
  const preferredKeys =
    orientation === "portrait"
      ? ["fixed_height_still", "downsized_still", "original_still", "fixed_width_still"]
      : orientation === "landscape"
        ? ["fixed_width_still", "downsized_still", "original_still", "fixed_height_still"]
        : ["downsized_still", "original_still", "fixed_width_still", "fixed_height_still"];
  for (const key of preferredKeys) {
    const candidate = readGiphyImageAsset(images, key);
    if (candidate?.url) return candidate;
  }
  return null;
}

function readGiphyVideoAsset(images: Record<string, unknown>, key: string): {
  url: string;
  width: number;
  height: number;
} | null {
  const row = images[key];
  if (!row || typeof row !== "object") return null;
  const asset = row as Record<string, unknown>;
  const url = typeof asset.mp4 === "string" ? asset.mp4.trim() : "";
  if (!url) return null;
  return {
    url,
    width: Number.isFinite(Number(asset.width)) ? Number(asset.width) : 0,
    height: Number.isFinite(Number(asset.height)) ? Number(asset.height) : 0,
  };
}

function readGiphyAnimatedImageAsset(images: Record<string, unknown>, key: string): {
  url: string;
  width: number;
  height: number;
} | null {
  const row = images[key];
  if (!row || typeof row !== "object") return null;
  const asset = row as Record<string, unknown>;
  const url =
    (typeof asset.url === "string" && asset.url.trim()) ||
    (typeof asset.webp === "string" && asset.webp.trim()) ||
    "";
  if (!url) return null;
  return {
    url,
    width: Number.isFinite(Number(asset.width)) ? Number(asset.width) : 0,
    height: Number.isFinite(Number(asset.height)) ? Number(asset.height) : 0,
  };
}

function pickGiphyAnimatedCandidate(
  images: Record<string, unknown>,
  orientation: ImageRequest["orientation"]
): {
  url: string;
  width: number;
  height: number;
  mediaKind: SlideMediaKind;
} | null {
  const preferredVideoKeys =
    orientation === "portrait"
      ? ["fixed_height", "downsized", "original", "fixed_width"]
      : orientation === "landscape"
        ? ["fixed_width", "downsized", "original", "fixed_height"]
        : ["downsized", "original", "fixed_width", "fixed_height"];
  for (const key of preferredVideoKeys) {
    const candidate = readGiphyVideoAsset(images, key);
    if (candidate?.url) {
      return {
        ...candidate,
        mediaKind: "video",
      };
    }
  }

  const preferredAnimatedImageKeys =
    orientation === "portrait"
      ? ["fixed_height", "fixed_width", "downsized", "original"]
      : orientation === "landscape"
        ? ["fixed_width", "fixed_height", "downsized", "original"]
        : ["downsized", "original", "fixed_width", "fixed_height"];
  for (const key of preferredAnimatedImageKeys) {
    const candidate = readGiphyAnimatedImageAsset(images, key);
    if (candidate?.url) {
      return {
        ...candidate,
        mediaKind: "animated_image",
      };
    }
  }
  return null;
}

function mapGiphyItemToCandidate(
  item: Record<string, unknown>,
  index: number,
  request: ImageRequest,
  query: string
): { candidate: GiphyProviderCandidate | null; missingStill: boolean } {
  const images = item.images && typeof item.images === "object" ? (item.images as Record<string, unknown>) : {};
  const still = pickGiphyStillCandidate(images, request.orientation);
  const animated = pickGiphyAnimatedCandidate(images, request.orientation);
  const primaryAsset = still || animated;
  const imageUrl = primaryAsset?.url || "";
  const providerTitle =
    (typeof item.title === "string" && item.title.trim()) ||
    (typeof item.slug === "string" && item.slug.trim()) ||
    undefined;
  const providerSlug = typeof item.slug === "string" ? item.slug.trim() : "";
  const providerRating = typeof item.rating === "string" ? item.rating.trim().toLowerCase() : "";
  if (!imageUrl) {
    return { candidate: null, missingStill: !still?.url };
  }
  const normalizedMedia = normalizeStudioMediaUrls({
    imageUrl,
    mediaUrl: animated?.url || undefined,
    mediaKind: animated?.mediaKind || ("image" as const),
  });
  const normalizedImageUrl = String(normalizedMedia.imageUrl || imageUrl).trim();
  const normalizedMediaUrl = String(normalizedMedia.mediaUrl || "").trim() || undefined;
  const normalizedMediaKind = normalizedMedia.mediaKind || animated?.mediaKind || ("image" as const);
  if (!normalizedImageUrl) {
    return { candidate: null, missingStill: !still?.url };
  }
  return {
    candidate: {
      provider: "giphy",
      id: `giphy:${String(item.id || index)}`,
      url: normalizedImageUrl,
      mediaUrl: normalizedMediaUrl,
      mediaKind: normalizedMediaKind,
      pageUrl:
        (typeof item.url === "string" && item.url.trim()) ||
        (typeof item.embed_url === "string" && item.embed_url.trim()) ||
        undefined,
      title: providerTitle,
      width: primaryAsset?.width || 0,
      height: primaryAsset?.height || 0,
      sourceMetadata: {
        providerQuery: query,
        providerTitle,
        providerSlug: providerSlug || undefined,
        providerRating: providerRating || undefined,
        providerTags: deriveProviderTags([query, providerTitle || "", providerSlug]),
      },
    },
    missingStill: !still?.url,
  };
}

async function fetchGiphyTranslateCandidate(params: {
  apiKey: string;
  query: string;
  request: ImageRequest;
  providerTimeBudgetMs: number;
}): Promise<GiphyProviderCandidate | null> {
  const safeQuery = trimQueryLength(params.query);
  if (!safeQuery) return null;
  const endpoint = new URL("https://api.giphy.com/v1/gifs/translate");
  endpoint.searchParams.set("api_key", params.apiKey);
  endpoint.searchParams.set("s", safeQuery);
  endpoint.searchParams.set("rating", GIPHY_DEFAULT_RATING);
  try {
    const payload = (await fetchJson(
      endpoint.toString(),
      {
        method: "GET",
        cache: "no-store",
      },
      params.providerTimeBudgetMs
    )) as { data?: Record<string, unknown> };
    const row = payload.data;
    if (!row || typeof row !== "object") return null;
    return mapGiphyItemToCandidate(row, 0, params.request, safeQuery).candidate;
  } catch {
    return null;
  }
}

async function searchGiphy(
  request: ImageRequest,
  options: GiphySearchOptions
): Promise<GiphyAdapterResult> {
  const strategy = resolveGiphySearchStrategy(options);
  const candidateLimit = Math.max(1, Math.min(3, Math.floor(options.maxCandidatesPerProvider || 3)));
  const apiFetchLimit = Math.max(candidateLimit, Math.min(24, candidateLimit * 4));
  const requestEmotionTags = buildMemeEmotionSearchOrder([request.query || "", ...(request.queryCandidates || []), request.scene || ""]);
  let memoizedLibraryCandidates: GiphyProviderCandidate[] | null = null;
  const loadLibraryCandidates = async () => {
    if (memoizedLibraryCandidates) return memoizedLibraryCandidates;
    if (options.intent !== "meme") {
      memoizedLibraryCandidates = [];
      return memoizedLibraryCandidates;
    }
    const records = await searchMemeLibrary(request, {
      limit: candidateLimit,
      userScope: options.libraryUserScope,
    });
    memoizedLibraryCandidates = records.filter((item) => item.provider === "giphy").map((item) => toGiphyLibraryCandidate(item));
    return memoizedLibraryCandidates;
  };
  const queries = buildGiphyQueries(request, options);
  if (!strategy.useExternalApi) {
    const libraryCandidates = await loadLibraryCandidates();
    return {
      ok: libraryCandidates.length > 0,
      candidates: libraryCandidates.slice(0, candidateLimit),
      reason: libraryCandidates.length > 0 ? undefined : "personal giphy library empty",
      searchedQueries: queries.slice(0, 1),
    };
  }

  const apiKey = (process.env.GIPHY_API_KEY || "").trim();
  if (!apiKey) {
    const libraryCandidates = await loadLibraryCandidates();
    return {
      ok: libraryCandidates.length > 0,
      candidates: libraryCandidates.slice(0, candidateLimit),
      reason: libraryCandidates.length > 0 ? undefined : "GIPHY_API_KEY missing",
      searchedQueries: queries.slice(0, 1),
    };
  }
  let collectedCandidates: GiphyProviderCandidate[] = [];
  const searchedQueries: string[] = [];
  const failureReasons: string[] = [];

  for (const query of queries) {
    if (collectedCandidates.length >= candidateLimit) break;
    const endpoint = new URL("https://api.giphy.com/v1/gifs/search");
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("q", trimQueryLength(query));
    endpoint.searchParams.set("limit", String(apiFetchLimit));
    endpoint.searchParams.set("rating", GIPHY_DEFAULT_RATING);
    endpoint.searchParams.set("lang", "en");
    endpoint.searchParams.set("country_code", "US");
    endpoint.searchParams.set("bundle", "messaging_non_clips");
    endpoint.searchParams.set("remove_low_contrast", "true");
    searchedQueries.push(query);
    try {
      const payload = (await fetchJson(
        endpoint.toString(),
        {
          method: "GET",
          cache: "no-store",
        },
        options.providerTimeBudgetMs
      )) as { data?: Array<Record<string, unknown>> };
      const items = Array.isArray(payload.data) ? payload.data : [];
      const mappedCandidates = items
        .map((item, index) => mapGiphyItemToCandidate(item, index, request, query))
        .filter((row): row is { candidate: GiphyProviderCandidate; missingStill: boolean } => Boolean(row?.candidate))
        .map((row) => row.candidate);
      if (mappedCandidates.length > 0) {
        collectedCandidates = mergeUniqueGiphyCandidates(collectedCandidates, mappedCandidates, candidateLimit);
        await storeMemeLibraryItems(
          mappedCandidates.map((candidate) => ({
            provider: "giphy",
            id: candidate.id,
            title: candidate.title,
            pageUrl: candidate.pageUrl,
            url: candidate.url,
            mediaUrl: candidate.mediaUrl,
            mediaKind: candidate.mediaKind,
            width: candidate.width,
            height: candidate.height,
            queryHints: [query, request.query, ...(request.queryCandidates || []), ...queries],
            tags: [query, candidate.title || ""],
            emotionTags: requestEmotionTags,
          })),
          { userScope: options.libraryUserScope }
        );
      } else {
        failureReasons.push(items.length > 0 ? `giphy search returned no usable media for query=${query}` : `giphy empty for query=${query}`);
      }
    } catch (error) {
      failureReasons.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (collectedCandidates.length < candidateLimit) {
    const libraryCandidates =
      strategy.useLibraryCandidates || collectedCandidates.length > 0 || failureReasons.length > 0
        ? await loadLibraryCandidates()
        : [];
    if (libraryCandidates.length > 0) {
      collectedCandidates = mergeUniqueGiphyCandidates(collectedCandidates, libraryCandidates, candidateLimit);
    }
  }

  if (collectedCandidates.length > 0) {
    return {
      ok: true,
      candidates: collectedCandidates.slice(0, candidateLimit),
      searchedQueries: searchedQueries.length > 0 ? searchedQueries : queries.slice(0, 1),
    };
  }

  return {
    ok: false,
    candidates: [],
    reason: failureReasons[failureReasons.length - 1] || "giphy empty",
    searchedQueries: searchedQueries.length > 0 ? searchedQueries : queries.slice(0, 1),
  };
}

export async function seedMemeLibraryFromGiphy(input: {
  queries: string[];
  limitPerQuery?: number;
  providerTimeBudgetMs?: number;
  userScope?: string;
}): Promise<{
  ok: boolean;
  addedCount: number;
  queryCount: number;
  results: Array<{ query: string; addedCount: number; skippedExistingCount: number; reason?: string }>;
}> {
  const queries = dedupeQueries(input.queries.map((item) => item.trim())).slice(0, 24);
  const limitPerQuery = Math.max(1, Math.min(25, Math.floor(input.limitPerQuery || 8)));
  const providerTimeBudgetMs = Math.max(500, Math.min(30_000, Math.floor(input.providerTimeBudgetMs || DEFAULT_PROVIDER_TIME_BUDGET_MS)));
  const results: Array<{ query: string; addedCount: number; skippedExistingCount: number; reason?: string }> = [];
  let addedCount = 0;

  for (const query of queries) {
    const before = await getMemeLibraryIdentitySetForEmotionTags(buildMemeEmotionSearchOrder([query]), {
      userScope: input.userScope,
    });
    const request: ImageRequest = {
      query,
      queryCandidates: [query],
      orientation: "any",
    };
    const resolved = await searchGiphy(request, {
      intent: "meme",
      maxCandidatesPerProvider: limitPerQuery,
      providerTimeBudgetMs,
      libraryUserScope: input.userScope || "",
    });
    if (!resolved.ok || resolved.candidates.length <= 0) {
      results.push({
        query,
        addedCount: 0,
        skippedExistingCount: 0,
        reason: resolved.reason || "no candidates",
      });
      continue;
    }
    const freshCandidates = resolved.candidates.filter((candidate) => {
      const id = candidate.id.trim();
      const url = candidate.url.trim();
      const mediaUrl = String(candidate.mediaUrl || "").trim();
      if (!id || !url) return false;
      if (before.ids.has(id)) return false;
      if (before.urls.has(url)) return false;
      if (mediaUrl && before.urls.has(mediaUrl)) return false;
      return true;
    });
    results.push({
      query,
      addedCount: freshCandidates.length,
      skippedExistingCount: Math.max(0, resolved.candidates.length - freshCandidates.length),
    });
    addedCount += freshCandidates.length;
  }

  return {
    ok: addedCount > 0,
    addedCount,
    queryCount: queries.length,
    results,
  };
}

export { searchGiphy };

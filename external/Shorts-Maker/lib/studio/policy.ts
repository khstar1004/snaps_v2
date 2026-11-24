import { resolveEffectiveIntent } from "@/lib/studio/effective-intent";
import { buildGiphyFallbackQueriesFromRequest, isGiphySearchableQuery } from "@/lib/studio/giphy-query-utils";
import { resolveImageUrlByProviders } from "@/lib/studio/image-provider-resolver";
import {
  buildStudioMediaAssetMetadata,
  createOrUpdateStudioMediaAsset,
  isStudioMediaAssetsEnabled,
} from "@/lib/studio/media-assets";
import { buildMediaReservationKeys } from "@/lib/studio/media-reservation";
import {
  analyzeImageRequestSearchSignal,
  buildConcreteVisualSearchCandidates,
  buildShortReactionSearchCandidates,
  inferVisualIntent,
  normalizeMemeSearchPhrase,
  sanitizeSearchQueryCandidate,
  stripMemeSearchSuffix,
} from "@/lib/studio/images/intent";
import { resolveImagePolicyProfile, type ImagePolicyScoreWeights } from "@/lib/studio/images/policy-registry";
import { toFallbackImageDataUrl } from "@/lib/studio/policy-fallback";
import { toImageProxyUrl } from "@/lib/studio/image-proxy";
import { toKoreanNaverQuery } from "@/lib/studio/image-resolver";
import { normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import {
  buildCandidateNoveltySignals,
  buildSelectionNoveltyHistorySignature,
  cloneSelectionNoveltyHistory,
  createSelectionNoveltyHistory,
  hasSelectionNoveltySignals,
  recordSelectionNovelty,
  type SelectionNoveltyHistory,
  type SelectionNoveltySignals,
} from "@/lib/studio/provider-candidate-diversity";
import { buildReservationDelta, hasReservationDeltaConflict } from "@/lib/studio/policy-reservation";
import { normalizeConfiguredImageProviders, resolveProviderOrder } from "@/lib/studio/provider-order";
import { buildProviderResolutionCacheKey } from "@/lib/studio/provider-resolution-cache";
import type {
  ImageProviderId,
  ImageRequest,
  ImageScoreBreakdown,
  ImageSelectionCandidate,
  PreparedSlide,
  SlideInput,
  SlideMediaKind,
  StudioPrepareRequest,
} from "@/types/studio-json";

const QUERY_DROP_TOKENS = new Set([
  "한국",
  "대한민국",
  "국내",
  "해외",
  "장면",
  "모습",
  "화난",
  "강한",
  "표정",
  "미친",
  "듯이",
  "소리",
  "지르는",
  "하는",
  "있는",
  "에서",
  "으로",
  "지지율",
  "조사",
  "결과",
  "발표",
  "여론조사",
  "그래프",
  "내부",
  "갈등",
  "논란",
  "엑스",
  "게시글",
  "페이스북",
  "소셜미디어",
  "소셜",
  "포스트",
  "캡처",
  "관련",
  "공유",
]);

const DEFAULT_MUST_AVOID = ["캡처", "일러스트", "합성", "로고", "워터마크", "썸네일"];
const CTA_HINT_TOKENS = ["구독", "좋아요", "알림", "팔로우", "follow", "subscribe", "comment", "댓글", "메일", "이메일"];
const DEFAULT_MAX_QUERY_VARIANTS_PER_SLIDE = parseEnvPositiveInt("NAVER_MAX_QUERY_VARIANTS_PER_SLIDE", 3, 1, 40);
const DEFAULT_MAX_CRAWL_ATTEMPTS_PER_SLIDE = parseEnvPositiveInt("NAVER_MAX_CRAWL_ATTEMPTS_PER_SLIDE", 6, 1, 200);
const DEFAULT_SLIDE_CRAWL_TIME_BUDGET_MS = parseEnvPositiveInt("NAVER_SLIDE_TIME_BUDGET_MS", 4_000, 1000, 60_000);
const FUN_MAX_QUERY_VARIANTS_PER_SLIDE = parseEnvPositiveInt("FUN_MAX_QUERY_VARIANTS_PER_SLIDE", 2, 1, 12);
const FUN_MAX_CRAWL_ATTEMPTS_PER_SLIDE = parseEnvPositiveInt("FUN_MAX_CRAWL_ATTEMPTS_PER_SLIDE", 4, 1, 24);
const FUN_SLIDE_CRAWL_TIME_BUDGET_MS = parseEnvPositiveInt("FUN_SLIDE_TIME_BUDGET_MS", 2_500, 1000, 20_000);
const DEFAULT_NAVER_NO_FILTER = parseEnvBoolean("NAVER_NO_FILTER", false);
const BASELINE_IMAGE_PROVIDER_FALLBACKS: ImageProviderId[] = ["giphy", "naver"];
const DEFAULT_MAX_CANDIDATES_PER_PROVIDER = parseEnvPositiveInt("IMAGE_MAX_CANDIDATES_PER_PROVIDER", 18, 1, 50);
const MIN_REVIEW_CANDIDATES_PER_PROVIDER = 3;
const DEFAULT_PROVIDER_TIME_BUDGET_MS = parseEnvPositiveInt("IMAGE_PROVIDER_TIME_BUDGET_MS", 2_500, 500, 30_000);
const FUN_PROVIDER_TIME_BUDGET_MS = parseEnvPositiveInt("FUN_PROVIDER_TIME_BUDGET_MS", 1_500, 500, 10_000);
const IMAGE_POLICY_PARALLELISM = parseEnvPositiveInt("IMAGE_POLICY_PARALLELISM", 4, 1, 8);
const IMAGE_POLICY_MIN_PARALLELISM = 4;
const RECENT_SELECTION_HISTORY_TTL_MS = parseEnvPositiveInt(
  "IMAGE_RECENT_SELECTION_HISTORY_TTL_MS",
  10 * 60 * 1000,
  1_000,
  60 * 60 * 1000
);

type ResolvedImageSearchTuning = {
  naverNoFilter: boolean;
  maxQueryVariantsPerSlide: number;
  maxCrawlAttemptsPerSlide: number;
  perSlideTimeBudgetMs: number;
  providers: ImageProviderId[];
  maxCandidatesPerProvider: number;
  providerTimeBudgetMs: number;
  giphyLibraryOnly: boolean;
};

function applyScoreWeights(
  breakdown: ImageScoreBreakdown | undefined,
  weights: ImagePolicyScoreWeights,
  fallbackTotal: number | undefined
): ImageScoreBreakdown | undefined {
  if (!breakdown) {
    if (!Number.isFinite(fallbackTotal)) return undefined;
    return {
      semantic: 0,
      entity: 0,
      freshness: 0,
      technical: 0,
      policy: 0,
      total: Number(fallbackTotal),
    };
  }
  const weightedSemantic = (breakdown.semantic * weights.semantic) / 100;
  const weightedEntity = (breakdown.entity * weights.entity) / 100;
  const weightedFreshness = (breakdown.freshness * weights.freshness) / 100;
  const weightedTechnical = (breakdown.technical * weights.technical) / 100;
  const weightedPolicy = (breakdown.policy * weights.policy) / 100;
  const total =
    weightedSemantic +
    weightedEntity +
    weightedFreshness +
    weightedTechnical +
    weightedPolicy;
  return {
    semantic: Math.round(weightedSemantic),
    entity: Math.round(weightedEntity),
    freshness: Math.round(weightedFreshness),
    technical: Math.round(weightedTechnical),
    policy: Math.round(weightedPolicy),
    total: Math.round(total),
  };
}

function parseEnvPositiveInt(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || "").trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function resolveImageSearchTuning(payload: StudioPrepareRequest): ResolvedImageSearchTuning {
  const tuning = payload.imageSearchTuning;
  const providers = normalizeConfiguredImageProviders(tuning?.providers);
  const minQueryVariants = providers.length > 1 ? 2 : 1;
  const minAttempts = Math.max(6, Math.min(16, providers.length * 2));
  const providerBudgetFloorMs = providers.length > 1 ? 1200 : 800;
  const slideBudgetFloorMs = Math.max(4000, providerBudgetFloorMs * Math.min(3, providers.length || 1));
  return {
    naverNoFilter: typeof tuning?.naverNoFilter === "boolean" ? tuning.naverNoFilter : DEFAULT_NAVER_NO_FILTER,
    maxQueryVariantsPerSlide: Math.max(
      minQueryVariants,
      clampInteger(
        tuning?.maxQueryVariantsPerSlide,
        1,
        40,
        DEFAULT_MAX_QUERY_VARIANTS_PER_SLIDE
      )
    ),
    maxCrawlAttemptsPerSlide: Math.max(
      minAttempts,
      clampInteger(
        tuning?.maxCrawlAttemptsPerSlide,
        1,
        200,
        DEFAULT_MAX_CRAWL_ATTEMPTS_PER_SLIDE
      )
    ),
    perSlideTimeBudgetMs: Math.max(
      slideBudgetFloorMs,
      clampInteger(
        tuning?.perSlideTimeBudgetMs,
        1000,
        60_000,
        DEFAULT_SLIDE_CRAWL_TIME_BUDGET_MS
      )
    ),
    providers,
    maxCandidatesPerProvider: Math.max(
      MIN_REVIEW_CANDIDATES_PER_PROVIDER,
      clampInteger(
        tuning?.maxCandidatesPerProvider,
        1,
        50,
        DEFAULT_MAX_CANDIDATES_PER_PROVIDER
      )
    ),
    providerTimeBudgetMs: Math.max(
      providerBudgetFloorMs,
      clampInteger(
        tuning?.providerTimeBudgetMs,
        500,
        30_000,
        DEFAULT_PROVIDER_TIME_BUDGET_MS
      )
    ),
    giphyLibraryOnly: tuning?.giphyLibraryOnly === true,
  };
}

function withDefaultMustAvoid(request: ImageRequest): ImageRequest {
  const merged = [...(request.mustAvoid ?? []), ...DEFAULT_MUST_AVOID]
    .map((x) => x.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  for (const token of merged) {
    if (!deduped.includes(token)) deduped.push(token);
  }
  return {
    ...request,
    orientation: request.orientation || "any",
    mustAvoid: deduped,
  };
}

function inferSceneSuffix(tokens: string[]): string {
  const joined = tokens.join(" ");
  if (
    joined.includes("유튜브") ||
    joined.includes("쇼츠") ||
    joined.includes("구독") ||
    joined.includes("댓글") ||
    joined.includes("알림") ||
    joined.includes("채널")
  ) {
    return "유튜브 구독 버튼 화면 사진";
  }
  if (joined.includes("의원총회") || joined.includes("본회의") || joined.includes("국회")) {
    return "국회 회의장 사진";
  }
  if (joined.includes("대통령") || joined.includes("대통령실") || joined.includes("청와대")) {
    return "대통령실 브리핑 사진";
  }
  if (joined.includes("국민의힘") || joined.includes("대표")) {
    return "국회 기자회견 사진";
  }
  return "현장 사진";
}

function buildQueryVariants(rawQuery: string): string[] {
  const compact = rawQuery.trim();
  if (!compact) return [];

  const sanitized =
    sanitizeSearchQueryCandidate(compact, {
      mode: "stock",
      allowMemeTerms: false,
      maxTokens: 4,
    }) || compact;
  const simplified = simplifyImageQuery(sanitized);
  const simplifiedTokens = simplified
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "사진");

  const focusedCore = simplifiedTokens.slice(0, 3);
  const focused = [...focusedCore, inferSceneSuffix(simplifiedTokens)].join(" ").trim();
  const nounFocused = toNounFocusedQuery(sanitized);

  const keepCompact = compact.split(/\s+/).filter(Boolean).length <= 4 && compact.length <= 28;
  return mergeUniqueValues([sanitized, simplified, nounFocused, focused, keepCompact ? compact : ""]);
}

function buildShortMemeQueries(rawQuery: string): string[] {
  return buildShortReactionSearchCandidates([rawQuery]);
}

function buildMemeVariants(rawQuery: string): string[] {
  const compact = normalizeMemeSearchPhrase(rawQuery.trim());
  if (!compact) return [];
  const signal = analyzeImageRequestSearchSignal(compact);
  const shortQueries = buildShortMemeQueries(compact);
  const visualQueries = buildConcreteVisualSearchCandidates([compact]);
  const normalized = compact
    .replaceAll("사진", " ")
    .replaceAll("이미지", " ")
    .replaceAll("현장", " ")
    .replace(/\s+/g, " ")
    .trim();
  const sanitized =
    sanitizeSearchQueryCandidate(compact, {
      mode: "fun",
      allowMemeTerms: !signal.hasConcreteVisualCue,
      maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
    }) || normalized || compact;
  const base = stripMemeSearchSuffix(sanitized) || normalized || compact;
  const exactKoreanPhrase = stripMemeSearchSuffix(compact);
  const keepCompact = compact.split(/\s+/).filter(Boolean).length <= 4 && compact.length <= 28;
  const leadingQueries = signal.hasConcreteVisualCue ? visualQueries : shortQueries;
  const secondaryQueries = signal.hasConcreteVisualCue ? shortQueries : visualQueries;
  return mergeUniqueValues([
    ...leadingQueries,
    /[가-힣]/u.test(exactKoreanPhrase) ? exactKoreanPhrase : "",
    /[가-힣]/u.test(exactKoreanPhrase) && !signal.hasConcreteVisualCue ? `${exactKoreanPhrase} 짤` : "",
    ...secondaryQueries,
    sanitized,
    signal.hasConcreteVisualCue ? base : `${base} 짤`,
    signal.hasConcreteVisualCue ? `${base} 사진` : `${base} 밈`,
    signal.hasConcreteVisualCue ? "" : `${base} 움짤`,
    signal.hasConcreteVisualCue ? "" : `${base} gif`,
    keepCompact ? compact : "",
  ]);
}

function buildSeedQueries(request: ImageRequest, options?: { memeIntent?: boolean }): string[] {
  const memeIntent = Boolean(options?.memeIntent);
  const signal = analyzeImageRequestSearchSignal(request);
  const mode = memeIntent ? "fun" : "stock";
  const seeds = [request.query, ...(request.queryCandidates ?? [])]
    .map((x) => normalizeMemeSearchPhrase(x.trim()))
    .filter(Boolean);
  const reactionSeedShortcuts = memeIntent ? buildShortReactionSearchCandidates(seeds) : [];
  const visualSeedQueries = memeIntent ? buildConcreteVisualSearchCandidates([request.scene || "", ...seeds]) : [];
  const uniqueSeeds = mergeUniqueValues([
    ...(memeIntent ? (signal.hasConcreteVisualCue ? visualSeedQueries : reactionSeedShortcuts) : []),
    ...seeds,
    ...seeds.map((seed) =>
      sanitizeSearchQueryCandidate(seed, {
        mode,
        allowMemeTerms: memeIntent && !signal.hasConcreteVisualCue,
        maxTokens: memeIntent && signal.hasConcreteVisualCue ? 4 : 3,
      })
    ),
    ...(memeIntent ? (signal.hasConcreteVisualCue ? reactionSeedShortcuts : visualSeedQueries) : []),
  ]);

  const suppressSceneSeed =
    !signal.hasConcreteVisualCue &&
    ((request.plannerSource === "codex" || request.plannerSource === "heuristic") || (memeIntent && signal.hasReactionCue));
  const shouldIncludeSceneSeed = !suppressSceneSeed || signal.hasConcreteVisualCue || !signal.hasReactionCue;
  const people = request.people ?? [];
  const scene = normalizeMemeSearchPhrase((request.scene || "").trim());
  const sanitizedScene = scene
    ? sanitizeSearchQueryCandidate(scene, {
        mode: memeIntent ? "fun" : "stock",
        allowMemeTerms: false,
        maxTokens: 4,
      })
    : "";
  if (shouldIncludeSceneSeed && people.length > 0 && scene) {
    uniqueSeeds.push(
      sanitizeSearchQueryCandidate(`${people[0]} ${scene}`, {
        mode: memeIntent ? "fun" : "stock",
        allowMemeTerms: false,
        maxTokens: 4,
      }) || `${people[0]} ${scene} 사진`
    );
  }
  if (shouldIncludeSceneSeed && scene) {
    uniqueSeeds.push(sanitizedScene || `${scene} 사진`);
  }

  const deduped: string[] = [];
  for (const seed of uniqueSeeds) {
    const compact = seed.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function buildQueryVariantsFromRequest(request: ImageRequest, options?: { memeIntent?: boolean }): string[] {
  if (request.plannerSource === "codex" && request.preferredProviders?.[0] === "naver") {
    return mergeUniqueValues([request.query, ...(request.queryCandidates ?? [])]).filter(Boolean);
  }
  const seeds = buildSeedQueries(request, options);
  const variants: string[] = [];
  const memeIntent = Boolean(options?.memeIntent);
  for (const seed of seeds) {
    const perSeedVariants = memeIntent ? buildMemeVariants(seed) : buildQueryVariants(seed);
    for (const variant of perSeedVariants) {
      if (!variants.includes(variant)) variants.push(variant);
    }
  }
  return variants;
}

function isEnglishLikeQuery(value: string): boolean {
  const normalized = normalizePolicyWhitespace(value);
  if (!normalized) return false;
  if (/[가-힣]/u.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function toNaverMemeQuery(value: string): string {
  const normalized = normalizePolicyWhitespace(stripMemeSearchSuffix(value));
  if (!normalized) return "";
  if (/[가-힣]/u.test(normalized)) return `${normalized} 짤`;
  return "";
}

function buildProviderScopedQueryVariants(
  provider: ImageProviderId,
  request: ImageRequest,
  options?: { memeIntent?: boolean }
): string[] {
  if (provider === "naver" && request.plannerSource === "codex") {
    const verbatimCandidates = mergeUniqueValues([request.query, ...(request.queryCandidates ?? [])]).filter(Boolean);
    if (verbatimCandidates.length > 0) return verbatimCandidates;
  }
  const baseVariants = buildQueryVariantsFromRequest(request, options);
  if (provider === "naver") {
    const seeds = [request.query, ...(request.queryCandidates ?? []), request.scene || ""]
      .map((value) => normalizeMemeSearchPhrase(value.trim()))
      .filter(Boolean);
    const localizedVariants = mergeUniqueValues([
      ...seeds.map((seed) => toKoreanNaverQuery(seed)).filter(Boolean),
      ...baseVariants.map((variant) => toKoreanNaverQuery(variant)).filter(Boolean),
      ...buildShortReactionSearchCandidates(seeds).map((variant) => toKoreanNaverQuery(variant)).filter(Boolean),
    ]).filter((variant) => /[가-힣]/u.test(variant) && !/[a-z]/i.test(variant));
    if (localizedVariants.length > 0) return localizedVariants;
    return [options?.memeIntent ? "표정" : "현장 사진"];
  }
  if (!options?.memeIntent) return baseVariants;
  if (provider === "giphy") {
    const englishOnly = baseVariants.filter((variant) => isEnglishLikeQuery(variant) && isGiphySearchableQuery(variant));
    if (englishOnly.length > 0) return englishOnly;
    const translatedFallback = buildGiphyFallbackQueriesFromRequest(request).filter(
      (variant) => isEnglishLikeQuery(variant) && isGiphySearchableQuery(variant)
    );
    if (translatedFallback.length > 0) return translatedFallback;
    return mergeUniqueValues([
      ...buildShortReactionSearchCandidates([request.query, ...(request.queryCandidates || []), request.scene || ""]).filter((variant) =>
        isEnglishLikeQuery(variant) && isGiphySearchableQuery(variant)
      ),
      "funny reaction",
      "meme reaction",
      "relatable reaction",
    ]);
  }
  return baseVariants;
}

function includesCtaToken(value: string): boolean {
  const lower = value.toLowerCase();
  return CTA_HINT_TOKENS.some((token) => lower.includes(token));
}

function isSubscribeCtaSlide(title: string, text: string, request: ImageRequest, index: number, total: number): boolean {
  const query = request.query || "";
  const scene = request.scene || "";
  const candidates = request.queryCandidates || [];
  if (includesCtaToken(title) || includesCtaToken(text) || includesCtaToken(query) || includesCtaToken(scene)) return true;
  if (candidates.some((candidate) => includesCtaToken(candidate))) return true;
  return total > 1 && index >= total - 1;
}

function buildCtaFallbackVariants(): string[] {
  return [
    "유튜브 구독 버튼 화면 사진",
    "유튜브 댓글창 화면 사진",
    "쇼츠 영상 재생 화면 사진",
    "유튜브 좋아요 알림 버튼 사진",
    "youtube subscribe button screenshot",
    "youtube shorts comment screen",
  ];
}

function mergeUniqueValues(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function toStableSelectionHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildImageSelectionOffset(
  slide: SlideInput,
  slideIndex: number,
  request: Pick<ImageRequest, "query" | "queryCandidates" | "scene" | "preferredProviders">
): number {
  const seed = mergeUniqueValues([
    `slide:${slideIndex}`,
    slide.title || "",
    slide.text || "",
    ...(slide.lines || []),
    request.query || "",
    ...(request.queryCandidates || []).slice(0, 3),
    request.scene || "",
    ...(request.preferredProviders || []).slice(0, 2),
  ])
    .join("|")
    .toLowerCase();
  return toStableSelectionHash(seed);
}

async function autoSaveStudioMediaAssetForSlide(input: {
  userId?: string;
  publishCategory?: string;
  slide: PreparedSlide;
  logLabel: string;
  debugImageSearch?: boolean;
  warnings: string[];
  provider?: ImageProviderId;
  providerAssetId?: string;
  mediaKind?: SlideMediaKind;
  sourceUrl?: string;
  sourceMediaUrl?: string;
  sourcePageUrl?: string;
  width?: number;
  height?: number;
  title?: string;
  summary?: string;
  selectedQuery?: string;
  queryCandidates?: string[];
  autoSourceMetadata?: {
    provider?: string;
    providerQuery?: string;
    queryCandidates?: string[];
    providerTitle?: string;
    providerSlug?: string;
    providerRating?: string;
    providerTags?: string[];
    providerCandidates?: string[];
    selectionDetails?: string[];
  };
}): Promise<void> {
  if (!input.userId || !isStudioMediaAssetsEnabled()) return;
  if (input.provider === "library") return;
  const mediaKind = input.mediaKind || input.slide.mediaKind;
  if (mediaKind !== "animated_image") return;
  const sourceUrl = String(input.sourceUrl || "").trim();
  const sourceMediaUrl = String(input.sourceMediaUrl || "").trim();
  if (!sourceUrl && !sourceMediaUrl) return;

  const metadata = buildStudioMediaAssetMetadata({
    title: input.title || input.slide.title,
    summary: input.summary || input.slide.text,
    provider: input.provider,
    mediaKind,
    queryHints: mergeUniqueValues([
      input.selectedQuery || "",
      ...(input.queryCandidates || []),
      input.slide.imageRequest?.query || "",
      ...(input.slide.imageRequest?.queryCandidates || []),
    ]).slice(0, 16),
    extraTexts: [
      input.slide.text,
      input.publishCategory || "",
      input.slide.imageSelection?.intent || "",
      input.title || "",
      input.summary || "",
    ],
  });

  try {
    await createOrUpdateStudioMediaAsset({
      userId: input.userId,
      provider: input.provider || "manual",
      providerAssetId: input.providerAssetId,
      title: input.title || input.slide.title || undefined,
      summary: metadata.summary || undefined,
      mediaKind,
      sourceUrl: sourceUrl || undefined,
      sourceMediaUrl: sourceMediaUrl || undefined,
      sourcePageUrl: String(input.sourcePageUrl || "").trim() || undefined,
      width: input.width,
      height: input.height,
      tags: metadata.tags,
      emotionTags: metadata.emotionTags,
      queryHints: metadata.queryHints,
      preserveExistingMetadataOnUpdate: true,
      metadataOrigin: "auto",
      autoSourceMetadata: input.autoSourceMetadata,
    });
    if (input.debugImageSearch) {
      input.warnings.push(
        `[debug] ${input.logLabel} asset-saved provider=${input.provider || "manual"} source=${sourceMediaUrl || sourceUrl} tags=${metadata.tags.slice(0, 6).join(",")}`
      );
    }
  } catch (error) {
    if (!input.debugImageSearch) return;
    input.warnings.push(
      `[debug] ${input.logLabel} asset-save-failed reason=${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function dropTrailingParticle(token: string): string {
  const compact = token.trim();
  if (compact.length < 3) return compact;
  if (/(에서|으로|으로서|으로는|에게|에게서|처럼|같은)$/u.test(compact)) {
    return compact.replace(/(에서|으로|으로서|으로는|에게|에게서|처럼|같은)$/u, "").trim();
  }
  return compact;
}

function toNounFocusedQuery(rawQuery: string): string {
  const compact = rawQuery.trim();
  if (!compact) return "";
  const tokens = compact
    .split(/\s+/)
    .map((x) => dropTrailingParticle(x))
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !/^(20\d{2}년?|20\d{2}|\d{1,2}월|\d{1,2}일)$/u.test(x))
    .filter((x) => !QUERY_DROP_TOKENS.has(x));
  const deduped: string[] = [];
  for (const token of tokens) {
    if (!deduped.includes(token)) deduped.push(token);
  }
  const core = deduped.slice(0, 3);
  if (core.length === 0) return "";
  if (!core.includes("사진")) core.push("사진");
  return core.join(" ").trim();
}

function simplifyImageQuery(rawQuery: string): string {
  const compact = rawQuery.trim();
  if (!compact) return "";
  const tokens = compact
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !/^(20\d{2}년?|20\d{2}|\d{1,2}월|\d{1,2}일)$/u.test(x))
    .filter((x) => !QUERY_DROP_TOKENS.has(x));

  const deduped: string[] = [];
  for (const token of tokens) {
    if (!deduped.includes(token)) deduped.push(token);
  }

  const core = deduped.slice(0, 4);
  if (core.length === 0) return compact;
  if (!core.includes("사진")) core.push("사진");
  return core.join(" ").trim();
}

function buildReservationFallbackSlide(
  slide: Pick<PreparedSlide, "title" | "text" | "lines" | "layout" | "imageRequest" | "imageSelection">,
  options: {
    selectedCandidateId: string;
    salt: string;
    selectionReason: string;
  }
): PreparedSlide {
  const fallbackDataUrl = toFallbackImageDataUrl(slide.title, slide.text, options.salt);
  return {
    ...slide,
    imageUrl: fallbackDataUrl,
    mediaUrl: undefined,
    mediaKind: undefined,
    resolvedImageUrl: fallbackDataUrl,
    resolvedBy: "fallback",
    imageSelection: {
      intent: slide.imageSelection?.intent || "fallback",
      queryCandidates: slide.imageSelection?.queryCandidates || slide.imageRequest?.queryCandidates?.slice(0, 2) || [],
      selectedQuery: slide.imageSelection?.selectedQuery || slide.imageRequest?.query || slide.imageRequest?.queryCandidates?.[0] || undefined,
      provider: slide.imageSelection?.provider,
      providerCandidates: slide.imageSelection?.providerCandidates,
      candidateOptions: slide.imageSelection?.candidateOptions,
      selectedCandidateId: options.selectedCandidateId,
      selectionReason: [slide.imageSelection?.selectionReason, options.selectionReason].filter(Boolean).join("; "),
      scoreBreakdown: emptyScoreBreakdown(),
    },
  };
}

function summarizeSearchSignal(request: ImageRequest): string {
  const signal = analyzeImageRequestSearchSignal(request);
  return [
    signal.hasReactionCue ? "reaction" : "no-reaction",
    signal.hasConcreteVisualCue ? "visual" : "no-visual",
    signal.hasMemeCue ? "meme" : "plain",
    signal.looksLikeSentence ? "sentence" : "short",
  ].join(",");
}

function formatDebugValues(values: string[]): string {
  return values.slice(0, 4).join(" | ") || "none";
}

function toPolicyLogValue(value: unknown, maxLength = 80): string {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "-";
  return compact.length > maxLength ? `${compact.slice(0, Math.max(0, maxLength - 3))}...` : compact;
}

function splitProviderSearchPhases(
  providers: ImageProviderId[],
  options?: { preferGiphyFirst?: boolean }
): ImageProviderId[][] {
  const phases: ImageProviderId[][] = [];
  const libraryPhase = providers.filter((provider) => provider === "library");
  const leadPhase = providers.filter((provider) => provider === "giphy" || provider === "naver");
  const stockPhase = providers.filter((provider) => provider === "pexels" || provider === "pixabay");
  const archivePhase = providers.filter((provider) => provider === "openverse" || provider === "wikimedia");
  if (options?.preferGiphyFirst) {
    if (libraryPhase.length > 0 || leadPhase.length > 0) phases.push([...libraryPhase, ...leadPhase]);
    if (stockPhase.length > 0) phases.push(stockPhase);
    if (archivePhase.length > 0) phases.push(archivePhase);
  } else {
    const photoFirstPhase = [
      ...libraryPhase,
      ...leadPhase.filter((provider) => provider === "naver"),
      ...stockPhase,
    ];
    if (photoFirstPhase.length > 0) phases.push(photoFirstPhase);
    if (archivePhase.length > 0) phases.push(archivePhase);
    const giphyPhase = leadPhase.filter((provider) => provider === "giphy");
    if (giphyPhase.length > 0) phases.push(giphyPhase);
  }
  for (const provider of providers) {
    if (!provider) continue;
    if (phases.some((phase) => phase.includes(provider))) continue;
    phases.push([provider]);
  }
  return phases;
}

function buildFallbackImageRequest(slide: StudioPrepareRequest["slides"][number]): ImageRequest {
  const title = String(slide.title || "").trim();
  const text = String(slide.text || "").trim();
  const base = simplifyImageQuery(`${title} ${text}`.trim()) || "뉴스 현장 사진";
  return {
    query: base,
    queryCandidates: [base, toNounFocusedQuery(base)].filter(Boolean),
    orientation: "portrait",
    mustAvoid: DEFAULT_MUST_AVOID,
  };
}

function normalizePolicyWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getNormalizedPolicyLines(slide: Pick<SlideInput, "text" | "lines">): string[] {
  const lines = Array.isArray(slide.lines)
    ? slide.lines.map((line) => normalizePolicyWhitespace(line)).filter(Boolean)
    : [];
  if (lines.length > 0) return lines;
  const text = normalizePolicyWhitespace(slide.text || "");
  return text ? [text] : ["현장 사진"];
}

function getPrimaryImageBeat(slide: SlideInput): NonNullable<SlideInput["imageBeats"]>[number] | undefined {
  if (!Array.isArray(slide.imageBeats)) return undefined;
  return slide.imageBeats
    .filter((beat) => Number.isFinite(beat.startLineIndex) && beat.startLineIndex >= 0)
    .slice()
    .sort((left, right) => left.startLineIndex - right.startLineIndex)[0];
}

function collapseSlideToSingleImage(slide: SlideInput): SlideInput {
  const primaryBeat = getPrimaryImageBeat(slide);
  if (!primaryBeat && !slide.imageBeats) return slide;
  return {
    ...slide,
    imageRequest: slide.imageRequest || primaryBeat?.imageRequest,
    imageUrl: slide.imageUrl || primaryBeat?.imageUrl,
    imageBeats: undefined,
  };
}

function buildFallbackImageRequestForBeat(
  slide: SlideInput,
  beats: Array<Pick<NonNullable<SlideInput["imageBeats"]>[number], "startLineIndex">>,
  beatIndex: number,
  crawlMode?: StudioPrepareRequest["crawlMode"]
): { request: ImageRequest; startLineIndex: number; endLineIndex: number } {
  const lines = getNormalizedPolicyLines(slide);
  const currentBeat = beats[beatIndex];
  const nextBeat = beats[beatIndex + 1];
  const startLineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(currentBeat?.startLineIndex ?? 0)));
  const nextStartLineIndex = Math.max(startLineIndex + 1, Math.floor(nextBeat?.startLineIndex ?? lines.length));
  const endLineIndex = Math.max(startLineIndex + 1, Math.min(lines.length, nextStartLineIndex));
  const beatLines = lines.slice(startLineIndex, endLineIndex);
  const beatText = normalizePolicyWhitespace(beatLines.join(" ")) || normalizePolicyWhitespace(slide.text || "") || "현장 사진";
  const surroundingLines = mergeUniqueValues([
    lines[Math.max(0, startLineIndex - 1)] || "",
    ...beatLines,
    lines[Math.min(lines.length - 1, endLineIndex)] || "",
  ]);
  const titleText = normalizePolicyWhitespace(slide.title || "");
  const slideText = normalizePolicyWhitespace(slide.text || "");
  const contextSeeds = mergeUniqueValues([
    titleText,
    beatText,
    ...beatLines,
    ...surroundingLines,
    slideText,
    ...(slide.imageRequest?.queryCandidates || []),
    slide.imageRequest?.query || "",
    slide.imageRequest?.scene || "",
  ]);
  const visualCandidates = buildConcreteVisualSearchCandidates(contextSeeds);
  const scene =
    sanitizeSearchQueryCandidate(visualCandidates[0] || beatText, {
      mode: crawlMode === "fun" ? "fun" : "stock",
      allowMemeTerms: false,
      maxTokens: 4,
    }) ||
    simplifyImageQuery(beatText) ||
    "현장 사진";
  const signal = analyzeImageRequestSearchSignal({
    query: beatText,
    queryCandidates: beatLines,
    scene,
  });
  const queryMode = crawlMode === "fun" ? "fun" : "stock";
  const contextQueryValues = mergeUniqueValues([
    scene,
    titleText,
    ...visualCandidates,
    ...surroundingLines,
    beatText,
    slideText,
    ...(slide.imageRequest?.queryCandidates || []),
    slide.imageRequest?.query || "",
  ]);
  const contextBaseQuery =
    contextQueryValues
      .map((value) =>
        sanitizeSearchQueryCandidate(value, {
          mode: queryMode,
          allowMemeTerms: crawlMode === "fun" && !signal.hasConcreteVisualCue,
          maxTokens: crawlMode === "fun" && signal.hasConcreteVisualCue ? 4 : crawlMode === "fun" ? 3 : 4,
        })
      )
      .find(Boolean) ||
    "";
  const baseQuery =
    sanitizeSearchQueryCandidate(beatText, {
      mode: queryMode,
      allowMemeTerms: crawlMode === "fun" && !signal.hasConcreteVisualCue,
      maxTokens: crawlMode === "fun" && signal.hasConcreteVisualCue ? 4 : crawlMode === "fun" ? 3 : 4,
    }) ||
    contextBaseQuery ||
    simplifyImageQuery(beatText) ||
    scene ||
    "현장 사진";
  const queryCandidates =
    crawlMode === "fun"
      ? mergeUniqueValues([
          ...buildShortReactionSearchCandidates([...contextSeeds, scene]),
          ...buildConcreteVisualSearchCandidates([scene, ...contextSeeds]),
          baseQuery,
          simplifyImageQuery(baseQuery),
          ...contextQueryValues,
          scene,
        ]).slice(0, 6)
      : mergeUniqueValues([
          baseQuery,
          simplifyImageQuery(baseQuery),
          toNounFocusedQuery(baseQuery),
          scene,
          ...contextQueryValues,
          scene,
        ]).slice(0, 6);
  return {
    request: withDefaultMustAvoid({
      query: queryCandidates[0] || baseQuery || "현장 사진",
      queryCandidates,
      people: slide.imageRequest?.people || [],
      scene,
      orientation: slide.imageRequest?.orientation || "landscape",
      mustAvoid: slide.imageRequest?.mustAvoid,
      plannerSource: "fallback",
    }),
    startLineIndex,
    endLineIndex,
  };
}

function shouldForceDistinctBeatMedia(
  slide: SlideInput,
  hasExplicitBeatRequest: boolean
): boolean {
  const lineCount = getNormalizedPolicyLines(slide).length;
  if (lineCount === 4) return true;
  return hasExplicitBeatRequest;
}

function resolveBeatPlannerSource(
  slide: Pick<SlideInput, "imageRequest">,
  beat: Pick<NonNullable<SlideInput["imageBeats"]>[number], "imageRequest">
): ImageRequest["plannerSource"] | undefined {
  const beatPlannerSource = beat.imageRequest?.plannerSource;
  if (beatPlannerSource) return beatPlannerSource;
  return slide.imageRequest?.plannerSource;
}

function shouldReusePreviousBeatMedia(
  slide: SlideInput,
  beat: NonNullable<SlideInput["imageBeats"]>[number],
  beatIndex: number
): boolean {
  if (beatIndex <= 0) return false;
  const lineCount = getNormalizedPolicyLines(slide).length;
  if (lineCount === 4) return false;
  if (normalizePolicyWhitespace(beat.reason || "")) return false;
  if (normalizePolicyWhitespace(beat.imageUrl || "")) return false;
  const plannerSource = resolveBeatPlannerSource(slide, beat);
  if (plannerSource === "codex" || plannerSource === "manual") return false;
  return true;
}

type NaverCacheEntry = Awaited<ReturnType<typeof resolveImageUrlByProviders>>;

type RecentSelectionHistoryBucket = {
  media: Map<string, number>;
  source: Map<string, number>;
  family: Map<string, number>;
  queryRoot: Map<string, number>;
};

const recentSelectionHistoryStore = new Map<string, RecentSelectionHistoryBucket>();

function createRecentSelectionHistoryBucket(): RecentSelectionHistoryBucket {
  return {
    media: new Map<string, number>(),
    source: new Map<string, number>(),
    family: new Map<string, number>(),
    queryRoot: new Map<string, number>(),
  };
}

function pruneRecentSelectionHistoryBucket(bucket: RecentSelectionHistoryBucket, nowMs: number): boolean {
  let hasEntries = false;
  for (const values of [bucket.media, bucket.source, bucket.family, bucket.queryRoot]) {
    for (const [key, expiresAt] of values.entries()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        values.delete(key);
        continue;
      }
      hasEntries = true;
    }
  }
  return hasEntries;
}

function buildRecentSelectionHistoryScopeKey(
  payload: Pick<StudioPrepareRequest, "libraryUserScope" | "publishCategory">
): string {
  return `user:${String(payload.libraryUserScope || "").trim() || "global"}|category:${String(payload.publishCategory || "").trim() || "all"}`;
}

function loadRecentSelectionHistory(scopeKey: string, nowMs = Date.now()): SelectionNoveltyHistory {
  const history = createSelectionNoveltyHistory();
  const bucket = recentSelectionHistoryStore.get(scopeKey);
  if (!bucket) return history;
  if (!pruneRecentSelectionHistoryBucket(bucket, nowMs)) {
    recentSelectionHistoryStore.delete(scopeKey);
    return history;
  }
  for (const [key] of bucket.media.entries()) history.media.set(key, 1);
  for (const [key] of bucket.source.entries()) history.source.set(key, 1);
  for (const [key] of bucket.family.entries()) history.family.set(key, 1);
  for (const [key] of bucket.queryRoot.entries()) history.queryRoot.set(key, 1);
  return history;
}

function rememberRecentSelectionHistory(
  scopeKey: string,
  signals: SelectionNoveltySignals,
  nowMs = Date.now(),
  ttlMs = RECENT_SELECTION_HISTORY_TTL_MS
): void {
  if (!scopeKey || !hasSelectionNoveltySignals(signals)) return;
  const bucket = recentSelectionHistoryStore.get(scopeKey) || createRecentSelectionHistoryBucket();
  const expiresAt = nowMs + Math.max(1_000, ttlMs);
  if (signals.mediaIdentity) bucket.media.set(signals.mediaIdentity, expiresAt);
  if (signals.sourceIdentity) bucket.source.set(signals.sourceIdentity, expiresAt);
  if (signals.reactionFamily) bucket.family.set(signals.reactionFamily, expiresAt);
  if (signals.queryRoot) bucket.queryRoot.set(signals.queryRoot, expiresAt);
  pruneRecentSelectionHistoryBucket(bucket, nowMs);
  if (bucket.media.size + bucket.source.size + bucket.family.size + bucket.queryRoot.size > 0) {
    recentSelectionHistoryStore.set(scopeKey, bucket);
  } else {
    recentSelectionHistoryStore.delete(scopeKey);
  }
}

function clearRecentSelectionHistory(scopeKey?: string): void {
  if (!scopeKey) {
    recentSelectionHistoryStore.clear();
    return;
  }
  recentSelectionHistoryStore.delete(scopeKey);
}

type ImagePolicyRuntimeContext = {
  payload: StudioPrepareRequest;
  warnings: string[];
  searchTuning: ResolvedImageSearchTuning;
  debugImageSearch: boolean;
  naverCache: Map<string, NaverCacheEntry>;
  usedResolvedImageUrls: Set<string>;
  usedCandidateIds: Set<string>;
  animatedSlideIndexes: Set<number>;
  recentSelectionHistory: SelectionNoveltyHistory;
  recentSelectionHistoryScopeKey: string;
};

type ImagePolicyAttemptContext = ImagePolicyRuntimeContext & {
  warnings: string[];
  baselineResolvedImageUrls: Set<string>;
  baselineCandidateIds: Set<string>;
  pendingRecentSelectionSignals: SelectionNoveltySignals[];
};

type MediaReservationContext = Pick<ImagePolicyRuntimeContext, "usedCandidateIds" | "usedResolvedImageUrls">;

function rememberResolvedMedia(
  context: MediaReservationContext,
  input: {
    candidateId?: string;
    imageUrls?: Array<string | null | undefined>;
    mediaUrls?: Array<string | null | undefined>;
    referenceUrls?: Array<string | null | undefined>;
  }
): void {
  const candidateId = input.candidateId?.trim();
  if (candidateId && !candidateId.startsWith("direct:")) {
    context.usedCandidateIds.add(candidateId);
  }
  for (const value of buildMediaReservationKeys([
    ...(input.imageUrls || []),
    ...(input.mediaUrls || []),
    ...(input.referenceUrls || []),
  ])) {
    context.usedResolvedImageUrls.add(value);
  }
}

function queuePendingSelectionNovelty(
  context: ImagePolicyAttemptContext,
  signals: SelectionNoveltySignals | undefined
): void {
  if (!signals || !hasSelectionNoveltySignals(signals)) return;
  context.pendingRecentSelectionSignals.push(signals);
}

function hasReservedMediaConflict(
  context: MediaReservationContext,
  input: {
    candidateId?: string;
    imageUrls?: Array<string | null | undefined>;
    mediaUrls?: Array<string | null | undefined>;
    referenceUrls?: Array<string | null | undefined>;
  }
): boolean {
  const candidateId = input.candidateId?.trim();
  if (candidateId && !candidateId.startsWith("direct:") && context.usedCandidateIds.has(candidateId)) {
    return true;
  }
  for (const value of buildMediaReservationKeys([
    ...(input.imageUrls || []),
    ...(input.mediaUrls || []),
    ...(input.referenceUrls || []),
  ])) {
    if (context.usedResolvedImageUrls.has(value)) return true;
  }
  return false;
}

function mergeReservationValues(target: Set<string>, extra?: Set<string>): string[] {
  const merged = new Set<string>(target);
  for (const value of extra || []) {
    const compact = String(value || "").trim();
    if (!compact) continue;
    merged.add(compact);
  }
  return Array.from(merged);
}

function cloneAttemptContext(context: ImagePolicyRuntimeContext): ImagePolicyAttemptContext {
  return {
    ...context,
    warnings: [],
    baselineResolvedImageUrls: new Set(context.usedResolvedImageUrls),
    baselineCandidateIds: new Set(context.usedCandidateIds),
    usedResolvedImageUrls: new Set(context.usedResolvedImageUrls),
    usedCandidateIds: new Set(context.usedCandidateIds),
    recentSelectionHistory: cloneSelectionNoveltyHistory(context.recentSelectionHistory),
    pendingRecentSelectionSignals: [],
  };
}

function commitAttemptContext(
  target: ImagePolicyRuntimeContext,
  attempt: ImagePolicyAttemptContext
): boolean {
  const nextCandidateIds = buildReservationDelta(attempt.usedCandidateIds, attempt.baselineCandidateIds);
  const nextUrls = buildReservationDelta(attempt.usedResolvedImageUrls, attempt.baselineResolvedImageUrls);

  if (
    hasReservationDeltaConflict(target.usedCandidateIds, attempt.baselineCandidateIds, attempt.usedCandidateIds) ||
    hasReservationDeltaConflict(target.usedResolvedImageUrls, attempt.baselineResolvedImageUrls, attempt.usedResolvedImageUrls)
  ) {
    return false;
  }

  for (const candidateId of nextCandidateIds) {
    target.usedCandidateIds.add(candidateId);
  }
  for (const url of nextUrls) {
    target.usedResolvedImageUrls.add(url);
  }
  for (const signals of attempt.pendingRecentSelectionSignals) {
    recordSelectionNovelty(target.recentSelectionHistory, signals);
    rememberRecentSelectionHistory(target.recentSelectionHistoryScopeKey, signals);
  }
  if (attempt.warnings.length > 0) {
    target.warnings.push(...attempt.warnings);
  }
  return true;
}

async function resolveSlideImageWithReservation(
  slide: SlideInput,
  slideIndex: number,
  context: ImagePolicyRuntimeContext
): Promise<PreparedSlide> {
  const maxAttempts = Math.max(1, Math.min(4, IMAGE_POLICY_PARALLELISM + 1));
  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attemptContext = cloneAttemptContext(context);
    const resolved = await resolveSlideImage(slide, slideIndex, attemptContext);
    if (commitAttemptContext(context, attemptContext)) {
      return resolved;
    }
    if (context.debugImageSearch) {
      context.warnings.push(
        `[debug] slide[${slideIndex}] reservation-conflict retry=${attemptIndex + 1}/${maxAttempts}`
      );
    }
  }

  const finalContext = cloneAttemptContext(context);
  const resolved = await resolveSlideImage(slide, slideIndex, finalContext);
  if (commitAttemptContext(context, finalContext)) {
    return resolved;
  }
  const fallbackSlide = buildReservationFallbackSlide(resolved, {
    selectedCandidateId: `fallback:reservation:slide:${slideIndex}`,
    salt: `reservation-slide-${slideIndex}`,
    selectionReason: "reservation conflict after retries; unique fallback applied",
  });
  rememberResolvedMedia(context, {
    candidateId: fallbackSlide.imageSelection?.selectedCandidateId,
    imageUrls: [fallbackSlide.imageUrl, fallbackSlide.resolvedImageUrl],
    mediaUrls: [fallbackSlide.mediaUrl],
  });
  context.warnings.push(`slide[${slideIndex}] duplicated media was replaced with fallback after reservation conflict`);
  return fallbackSlide;
}

function emptyScoreBreakdown(total = 0): ImageScoreBreakdown {
  return {
    semantic: 0,
    entity: 0,
    freshness: 0,
    technical: 0,
    policy: 0,
    total,
  };
}

function resolveAnimatedSlideQuota(totalSlides: number, crawlMode?: StudioPrepareRequest["crawlMode"]): number {
  if (crawlMode !== "fun") return 0;
  if (totalSlides <= 1) return 1;
  if (totalSlides <= 3) return 1;
  if (totalSlides <= 6) return 2;
  return Math.min(3, Math.ceil(totalSlides / 3));
}

function slidePrefersGiphy(slide: SlideInput): boolean {
  if (slide.imageRequest?.preferredProviders?.[0] === "giphy") return true;
  if (!Array.isArray(slide.imageBeats)) return false;
  return slide.imageBeats.some((beat) => beat.imageRequest?.preferredProviders?.[0] === "giphy");
}

function buildAnimatedSlideIndexes(
  slides: SlideInput[],
  crawlMode?: StudioPrepareRequest["crawlMode"]
): Set<number> {
  const totalSlides = slides.length;
  const codexRequested = new Set<number>();
  for (let index = 0; index < totalSlides; index += 1) {
    const slide = slides[index];
    if (!slide) continue;
    if (slidePrefersGiphy(slide)) {
      codexRequested.add(index);
    }
  }
  if (codexRequested.size > 0) return codexRequested;
  const quota = resolveAnimatedSlideQuota(totalSlides, crawlMode);
  if (quota <= 0 || totalSlides <= 0) return new Set<number>();
  const lastContentIndex = totalSlides > 1 ? totalSlides - 2 : 0;
  const eligibleIndexes: number[] = [];
  for (let index = 0; index <= lastContentIndex; index += 1) {
    const slide = slides[index];
    if (!slide) continue;
    const request = slide.imageRequest || buildFallbackImageRequest(slide);
    if (isSubscribeCtaSlide(slide.title, slide.text, request, index, totalSlides)) {
      continue;
    }
    eligibleIndexes.push(index);
  }
  if (eligibleIndexes.length <= 0) return new Set<number>();

  const targetCount = Math.min(quota, Math.ceil(eligibleIndexes.length / 2));
  const picks = new Set<number>();
  for (let slot = 0; slot < targetCount; slot += 1) {
    const ratio = targetCount === 1 ? 0.5 : slot / Math.max(1, targetCount - 1);
    const rawPosition = Math.round(ratio * Math.max(0, eligibleIndexes.length - 1));
    const preferredIndex = eligibleIndexes[Math.max(0, Math.min(eligibleIndexes.length - 1, rawPosition))];
    const candidatePool = [
      preferredIndex,
      ...eligibleIndexes.filter((value) => value !== preferredIndex),
    ];
    const picked = candidatePool.find((candidate) => {
      if (picks.has(candidate)) return false;
      return !picks.has(candidate - 1) && !picks.has(candidate + 1);
    });
    if (typeof picked === "number") {
      picks.add(picked);
    }
  }

  if (picks.size < targetCount) {
    for (const candidate of eligibleIndexes) {
      if (picks.size >= targetCount) break;
      if (picks.has(candidate)) continue;
      if (picks.has(candidate - 1) || picks.has(candidate + 1)) continue;
      picks.add(candidate);
    }
  }
  return picks;
}

function stripAnimatedMedia(slide: PreparedSlide, reason: string): PreparedSlide {
  if (!slide.mediaUrl || (slide.mediaKind !== "video" && slide.mediaKind !== "animated_image")) {
    return slide;
  }
  return {
    ...slide,
    mediaUrl: undefined,
    mediaKind: undefined,
    imageSelection: slide.imageSelection
      ? {
          ...slide.imageSelection,
          selectionReason: slide.imageSelection.selectionReason
            ? `${slide.imageSelection.selectionReason}; ${reason}`
            : reason,
        }
      : slide.imageSelection,
  };
}

async function resolveSlideUnitImage(
  slide: SlideInput,
  slideIndex: number,
  logLabel: string,
  context: ImagePolicyAttemptContext,
  localReservation?: MediaReservationContext
): Promise<PreparedSlide> {
  const { payload, warnings, searchTuning, debugImageSearch, naverCache } = context;
  const allowAnimatedMedia = context.animatedSlideIndexes.has(slideIndex);
  const effectiveLayout: PreparedSlide["layout"] = "photo+body";
  const base: PreparedSlide = { ...slide, layout: effectiveLayout };
  const effectiveRequest = slide.imageRequest ? withDefaultMustAvoid(slide.imageRequest) : null;
  let lastFailureReason = "";

  if (slide.imageUrl) {
    const proxied = slide.mediaKind === "video" || slide.mediaKind === "animated_image" ? null : toImageProxyUrl(slide.imageUrl);
    const resolvedImageUrl = proxied || slide.resolvedImageUrl || slide.imageUrl;
    const directIntent = inferVisualIntent({
      category: payload.publishCategory,
      text: slide.text,
      request: effectiveRequest || buildFallbackImageRequest(slide),
    });
    return {
      ...base,
      imageUrl: resolvedImageUrl,
      mediaUrl: slide.mediaUrl,
      mediaKind: slide.mediaKind,
      resolvedImageUrl,
      resolvedBy: slide.resolvedBy || "direct",
      imageSelection:
        slide.imageSelection ||
        (slide.resolvedBy === "crawl" || slide.resolvedBy === "fallback"
          ? undefined
          : {
              intent: directIntent.profileId,
              queryCandidates: effectiveRequest?.queryCandidates || [effectiveRequest?.query || ""].filter(Boolean),
              selectedQuery: effectiveRequest?.query || undefined,
              selectedCandidateId: "direct:user-provided",
              selectionReason: "manual/direct image URL",
            }),
    };
  }

  if (effectiveRequest) {
    const preparedRequest = effectiveRequest;
    const inferredIntent = inferVisualIntent({
      category: payload.publishCategory,
      text: slide.text,
      request: preparedRequest,
    });
    const effectiveIntent = resolveEffectiveIntent(inferredIntent, preparedRequest, payload.crawlMode);
    const isCtaSlide = isSubscribeCtaSlide(slide.title, slide.text, preparedRequest, slideIndex, payload.slides.length);
    const policyProfile = resolveImagePolicyProfile({
      intent: effectiveIntent,
      noFilter: searchTuning.naverNoFilter,
      isCtaSlide,
    });
    const preferredPrimaryProvider = preparedRequest.preferredProviders?.[0];
    const allowGiphyForSlide = allowAnimatedMedia;
    const preferGiphyFirst =
      preferredPrimaryProvider === "giphy"
        ? true
        : preferredPrimaryProvider === "naver"
          ? false
          : policyProfile.searchIntent === "meme";
    const providerOrder = resolveProviderOrder(policyProfile.searchIntent, preparedRequest, searchTuning.providers, payload.crawlMode, {
      preferGiphy: preferGiphyFirst,
      allowGiphy: allowGiphyForSlide,
    });
    const memeIntent = policyProfile.searchIntent === "meme";
    const queryVariants = mergeUniqueValues([
      ...buildQueryVariantsFromRequest(preparedRequest, { memeIntent }),
      ...(isCtaSlide ? buildCtaFallbackVariants() : []),
    ]).slice(0, policyProfile.maxVariantCount);
    const providerQueryVariants = new Map<ImageProviderId, string[]>(
      providerOrder.map((provider) => [
        provider,
        buildProviderScopedQueryVariants(provider, preparedRequest, { memeIntent }).slice(0, policyProfile.maxVariantCount),
      ])
    );
    const providerPhases = splitProviderSearchPhases(providerOrder, { preferGiphyFirst });
    const naverNoFilter = searchTuning.naverNoFilter;
    let resolvedSlide: PreparedSlide | null = null;
    const mustAvoidProfiles = policyProfile.mustAvoidProfiles;
    const querySignalSummary = summarizeSearchSignal(preparedRequest);
    const providerPhaseSummary = providerPhases.map((phase) => phase.join("+")).join(">");

    if (debugImageSearch) {
      warnings.push(
        `[debug] ${logLabel} intent=${effectiveIntent.profileId}/${policyProfile.searchIntent} variants=${queryVariants.length} profile=${policyProfile.id} crawlMode=${payload.crawlMode || "auto"} providers=${providerOrder.join(">")} phases=${providerPhaseSummary} signal=${querySignalSummary} queries=${formatDebugValues(queryVariants)}`
      );
    }

    type CrawlProviderCandidate = {
      url: string;
      score: number;
      query: string;
      profile: string;
      sort: "sim" | "date";
      phaseLabel: string;
      queryCandidates: string[];
      provider?: ImageProviderId;
      providerCandidates?: ImageProviderId[];
      candidateOptions?: ImageSelectionCandidate[];
      candidateId?: string;
      selectionReason?: string;
      selectionDetails?: string[];
      scoreBreakdown?: ImageScoreBreakdown;
      mediaUrl?: string;
      mediaKind?: SlideInput["mediaKind"];
      pageUrl?: string;
      title?: string;
      width?: number;
      height?: number;
      sourceMetadata?: {
        providerQuery?: string;
        providerTitle?: string;
        providerSlug?: string;
        providerRating?: string;
        providerTags?: string[];
      };
    };
    let bestProviderCandidate: CrawlProviderCandidate | null = null;
    const crawlStartedAt = Date.now();
    let crawlAttempts = 0;
    const earlyAcceptScore = naverNoFilter ? 0 : policyProfile.earlyAcceptScore;
    const searchPhases = providerPhases.map((providers) => ({
      providers,
      queries: mergeUniqueValues(
        [
          ...providers.flatMap((provider) => providerQueryVariants.get(provider) || []),
          ...queryVariants,
        ]
      ).slice(0, searchTuning.maxQueryVariantsPerSlide),
    }));
    crawlLoop: for (const phase of searchPhases) {
      if (Date.now() - crawlStartedAt >= searchTuning.perSlideTimeBudgetMs) break crawlLoop;
      if (phase.queries.length <= 0) continue;
      const phaseLabel = phase.providers.join("+");
      const phaseHasNaver = phase.providers.includes("naver");
      const tries: Array<{ sort: "sim" | "date"; label: string }> = phaseHasNaver
        ? naverNoFilter
          ? [{ sort: "sim", label: "sim" }]
          : [
              { sort: "sim", label: "sim" },
              { sort: "date", label: "date" },
            ]
        : [{ sort: "sim", label: "default" }];
      let phaseBestCandidate: CrawlProviderCandidate | null = null;
      let stopPhaseSearch = false;

      for (const variant of phase.queries) {
        if (Date.now() - crawlStartedAt >= searchTuning.perSlideTimeBudgetMs) {
          if (phaseBestCandidate) bestProviderCandidate = phaseBestCandidate;
          break crawlLoop;
        }
        for (const profile of mustAvoidProfiles) {
          if (Date.now() - crawlStartedAt >= searchTuning.perSlideTimeBudgetMs) {
            if (phaseBestCandidate) bestProviderCandidate = phaseBestCandidate;
            break crawlLoop;
          }
          const variantRequest: ImageRequest = {
            ...preparedRequest,
            query: variant,
            mustAvoid: profile.mustAvoid,
          };
          const selectionOffset = buildImageSelectionOffset(slide, slideIndex, variantRequest);
          for (const attempt of tries) {
            if (Date.now() - crawlStartedAt >= searchTuning.perSlideTimeBudgetMs) {
              if (phaseBestCandidate) bestProviderCandidate = phaseBestCandidate;
              break crawlLoop;
            }
            if (crawlAttempts >= searchTuning.maxCrawlAttemptsPerSlide) {
              if (phaseBestCandidate) bestProviderCandidate = phaseBestCandidate;
              break crawlLoop;
            }
            crawlAttempts += 1;
            const excludeCandidateIds = mergeReservationValues(context.usedCandidateIds, localReservation?.usedCandidateIds);
            const excludeUrls = mergeReservationValues(context.usedResolvedImageUrls, localReservation?.usedResolvedImageUrls);
            const recentHistorySnapshot = cloneSelectionNoveltyHistory(context.recentSelectionHistory);
            const recentHistorySignature = buildSelectionNoveltyHistorySignature(recentHistorySnapshot);
            const cacheKey = buildProviderResolutionCacheKey({
              providers: phase.providers,
              query: variantRequest.query,
              scene: variantRequest.scene || "",
              mustAvoid: variantRequest.mustAvoid || [],
              sort: attempt.sort,
              minScore: profile.minScore,
              intent: policyProfile.searchIntent,
              crawlMode: payload.crawlMode || "auto",
              noFilter: naverNoFilter,
              selectionOffset,
              historySignature: recentHistorySignature,
              excludeCandidateIds,
              excludeUrls,
            });
            let resolved = naverCache.get(cacheKey);
            if (!resolved) {
              resolved = await resolveImageUrlByProviders(variantRequest, {
                providers: phase.providers,
                intent: policyProfile.searchIntent,
                maxCandidatesPerProvider: searchTuning.maxCandidatesPerProvider,
                providerTimeBudgetMs: searchTuning.providerTimeBudgetMs,
                giphyLibraryOnly: searchTuning.giphyLibraryOnly,
                finalizeOnAcceptedProvider:
                  allowAnimatedMedia && (preferredPrimaryProvider === "giphy" || policyProfile.searchIntent === "meme")
                    ? "giphy"
                    : undefined,
                selectionOffset,
                recentHistory: recentHistorySnapshot,
                libraryUserScope: payload.libraryUserScope,
                excludeCandidateIds,
                excludeUrls,
                naver: {
                  sort: attempt.sort,
                  minScore: profile.minScore,
                  intent: policyProfile.searchIntent,
                  noFilter: naverNoFilter,
                  selectionOffset,
                  recentHistory: recentHistorySnapshot,
                },
              });
              naverCache.set(cacheKey, resolved);
            }
            if (debugImageSearch) {
              const statusParts = [
                `[debug] ${logLabel} provider-call phase=${phaseLabel}`,
                `query="${variantRequest.query}"`,
                `sort=${attempt.sort}`,
                `ok=${resolved.ok ? "1" : "0"}`,
                `hasUrl=${resolved.url ? "1" : "0"}`,
              ];
              if (resolved.ok) {
                statusParts.push(`provider=${resolved.provider || "unknown"}`);
                if (typeof resolved.score === "number" && Number.isFinite(resolved.score)) {
                  statusParts.push(`score=${resolved.score}`);
                }
              } else if (resolved.reason) {
                statusParts.push(`reason=${toPolicyLogValue(resolved.reason, 180)}`);
              }
              warnings.push(statusParts.join(" "));
            }
            if (!resolved.ok && resolved.reason) {
              lastFailureReason = resolved.reason;
            }
            if (resolved.ok && resolved.url) {
              const score = typeof resolved.score === "number" && Number.isFinite(resolved.score) ? resolved.score : 0;
              if (naverNoFilter || !phaseBestCandidate || score > phaseBestCandidate.score) {
                phaseBestCandidate = {
                  url: resolved.url,
                  score,
                  query: resolved.sourceMetadata?.providerQuery || variantRequest.query,
                  profile: profile.label,
                  sort: attempt.sort,
                  phaseLabel,
                  queryCandidates: phase.queries,
                  provider: resolved.provider,
                  providerCandidates: resolved.providerCandidates,
                  candidateOptions: resolved.candidateOptions,
                  candidateId: resolved.candidateId,
                  selectionReason: resolved.selectionReason,
                  selectionDetails: resolved.selectionDetails,
                  scoreBreakdown: resolved.scoreBreakdown,
                  mediaUrl: resolved.mediaUrl,
                  mediaKind: resolved.mediaKind,
                  pageUrl: resolved.pageUrl,
                  title: resolved.title,
                  width: resolved.width,
                  height: resolved.height,
                  sourceMetadata: resolved.sourceMetadata,
                };
                if (debugImageSearch) {
                  warnings.push(
                    `[debug] ${logLabel} candidate-accepted phase=${phaseLabel} query="${variantRequest.query}" provider=${resolved.provider || "unknown"} score=${score}`
                  );
                }
              }
              if (naverNoFilter || score >= earlyAcceptScore) {
                stopPhaseSearch = true;
                break;
              }
            }
          }
          if (stopPhaseSearch) break;
        }
        if (stopPhaseSearch) break;
      }

      if (phaseBestCandidate) {
        bestProviderCandidate = phaseBestCandidate;
        break crawlLoop;
      }
    }

    if (bestProviderCandidate) {
      const normalizedMedia = normalizeStudioMediaUrls({
        imageUrl: bestProviderCandidate.url,
        mediaUrl: bestProviderCandidate.mediaUrl,
        mediaKind: bestProviderCandidate.mediaKind,
      });
      const normalizedImageUrl = String(normalizedMedia.imageUrl || bestProviderCandidate.url).trim();
      const normalizedMediaUrl = String(normalizedMedia.mediaUrl || "").trim() || undefined;
      const normalizedMediaKind = normalizedMedia.mediaKind || bestProviderCandidate.mediaKind;
      const proxied =
        normalizedMediaKind === "video" || normalizedMediaKind === "animated_image"
          ? null
          : toImageProxyUrl(normalizedImageUrl);
      const resolvedImageCandidates = bestProviderCandidate.queryCandidates || queryVariants;
      const resolvedImageUrl = proxied || normalizedImageUrl;
      rememberResolvedMedia(context, {
        candidateId: bestProviderCandidate.candidateId,
        imageUrls: [normalizedImageUrl, resolvedImageUrl],
        mediaUrls: [normalizedMediaUrl],
        referenceUrls: [
          bestProviderCandidate.pageUrl,
          bestProviderCandidate.sourceMetadata?.providerSlug
            ? `${bestProviderCandidate.provider || "unknown"}:${bestProviderCandidate.sourceMetadata.providerSlug}`
            : undefined,
        ],
      });
      queuePendingSelectionNovelty(
        context,
        buildCandidateNoveltySignals({
          provider: bestProviderCandidate.provider,
          id: bestProviderCandidate.candidateId,
          url: normalizedImageUrl,
          mediaUrl: normalizedMediaUrl,
          mediaKind: normalizedMediaKind,
          pageUrl: bestProviderCandidate.pageUrl,
          title: bestProviderCandidate.title,
          query: bestProviderCandidate.sourceMetadata?.providerQuery || bestProviderCandidate.query,
          queryCandidates: resolvedImageCandidates,
          sourceMetadata: bestProviderCandidate.sourceMetadata,
        })
      );
      const weightedBreakdown = applyScoreWeights(
        bestProviderCandidate.scoreBreakdown,
        policyProfile.scoreWeights,
        bestProviderCandidate.score
      );
      resolvedSlide = {
        ...base,
        imageUrl: resolvedImageUrl,
        mediaUrl: normalizedMediaUrl,
        mediaKind: normalizedMediaKind,
        resolvedImageUrl,
        resolvedBy: "crawl",
        imageSelection: {
          intent: inferredIntent.profileId,
          queryCandidates: resolvedImageCandidates.slice(0, 3),
          selectedQuery: bestProviderCandidate.query,
          provider: bestProviderCandidate.provider,
          providerCandidates: bestProviderCandidate.providerCandidates,
          candidateOptions: bestProviderCandidate.candidateOptions,
          selectedCandidateId:
            bestProviderCandidate.candidateId || `crawl:${bestProviderCandidate.profile}:${bestProviderCandidate.sort}:${slideIndex}`,
          selectionReason:
            `query=${bestProviderCandidate.query}; provider=${bestProviderCandidate.provider || "unknown"}; phase=${bestProviderCandidate.phaseLabel}; ${
              bestProviderCandidate.selectionReason ||
              `profile=${bestProviderCandidate.profile}; sort=${bestProviderCandidate.sort}`
            }`,
          scoreBreakdown: weightedBreakdown,
        },
      };
      if (debugImageSearch) {
        warnings.push(
          `[debug] ${logLabel} crawl-hit query="${bestProviderCandidate.query}" provider=${bestProviderCandidate.provider || "unknown"} phase=${bestProviderCandidate.phaseLabel} profile=${bestProviderCandidate.profile} sort=${bestProviderCandidate.sort} attempts=${crawlAttempts} score=${bestProviderCandidate.score} signal=${querySignalSummary}`
        );
        if (bestProviderCandidate.selectionReason) {
          warnings.push(`[debug] ${logLabel} selection=${bestProviderCandidate.selectionReason}`);
        }
        if (bestProviderCandidate.selectionDetails && bestProviderCandidate.selectionDetails.length > 0) {
          warnings.push(
            `[debug] ${logLabel} trace=${bestProviderCandidate.selectionDetails.slice(-3).join(" || ")}`
          );
        }
      }
      await autoSaveStudioMediaAssetForSlide({
        userId: payload.libraryUserScope,
        publishCategory: payload.publishCategory,
        slide: resolvedSlide,
        logLabel,
        debugImageSearch,
        warnings,
        provider: bestProviderCandidate.provider,
        providerAssetId: bestProviderCandidate.candidateId,
        mediaKind: normalizedMediaKind,
        sourceUrl: normalizedImageUrl,
        sourceMediaUrl: normalizedMediaUrl,
        sourcePageUrl: bestProviderCandidate.pageUrl,
        width: bestProviderCandidate.width,
        height: bestProviderCandidate.height,
        title: bestProviderCandidate.title || slide.title,
        summary: bestProviderCandidate.selectionReason || slide.text,
        selectedQuery: bestProviderCandidate.query,
        queryCandidates: resolvedImageCandidates,
        autoSourceMetadata: {
          provider: bestProviderCandidate.provider || "unknown",
          providerQuery: bestProviderCandidate.sourceMetadata?.providerQuery || bestProviderCandidate.query,
          queryCandidates: resolvedImageCandidates,
          providerTitle: bestProviderCandidate.sourceMetadata?.providerTitle || bestProviderCandidate.title || slide.title || undefined,
          providerSlug: bestProviderCandidate.sourceMetadata?.providerSlug,
          providerRating: bestProviderCandidate.sourceMetadata?.providerRating,
          providerTags: bestProviderCandidate.sourceMetadata?.providerTags || [],
          providerCandidates: (bestProviderCandidate.providerCandidates || []).map((value) => value.trim()).filter(Boolean),
          selectionDetails: bestProviderCandidate.selectionDetails || [],
        },
      });
    } else if (debugImageSearch) {
      const elapsedMs = Math.max(0, Date.now() - crawlStartedAt);
      const reason = lastFailureReason ? ` reason=${lastFailureReason}` : "";
      warnings.push(
        `[debug] ${logLabel} crawl-miss attempts=${crawlAttempts} elapsedMs=${elapsedMs} providers=${providerOrder.join(">")} phases=${providerPhaseSummary} queries=${formatDebugValues(queryVariants.slice(0, searchTuning.maxQueryVariantsPerSlide))}${reason}`
      );
    }

    if (resolvedSlide) {
      return allowAnimatedMedia
        ? resolvedSlide
        : stripAnimatedMedia(resolvedSlide, "animation suppressed to keep motion sparse across slides");
    }
  }

  if (payload.imagePolicy.fallback === "error") {
    throw new Error(`image resolution failed for ${logLabel}`);
  }

  const fallbackReason = lastFailureReason
    ? `no candidate passed policy; ${lastFailureReason}`
    : "no candidate passed policy; fallback data-url image applied";
  const fallbackDataUrl = toFallbackImageDataUrl(slide.title, slide.text);
  warnings.push(
    `${logLabel} image was not found; fallback image applied${lastFailureReason ? ` (${toPolicyLogValue(lastFailureReason, 120)})` : ""}`
  );
  if (debugImageSearch) {
    warnings.push(`[debug] ${logLabel} fallback=image-data-url`);
  }
  return {
    ...base,
    layout: "photo+body",
    imageUrl: fallbackDataUrl,
    resolvedImageUrl: fallbackDataUrl,
    resolvedBy: "fallback",
    imageSelection: {
      intent: "fallback",
      queryCandidates: effectiveRequest?.queryCandidates?.slice(0, 2) || [],
      selectedQuery: effectiveRequest?.query || effectiveRequest?.queryCandidates?.[0] || undefined,
      selectedCandidateId: `fallback:${slideIndex}`,
      selectionReason: fallbackReason,
      scoreBreakdown: emptyScoreBreakdown(),
    },
  };
}

async function resolveSlideImage(
  slide: SlideInput,
  slideIndex: number,
  context: ImagePolicyAttemptContext
): Promise<PreparedSlide> {
  const explicitMediaBeats = (slide.imageBeats || [])
    .filter(
      (beat) =>
        beat.clearVisual === true || Boolean(String(beat.imageUrl || beat.resolvedImageUrl || beat.mediaUrl || "").trim())
    )
    .slice()
    .sort((left, right) => left.startLineIndex - right.startLineIndex)
    .slice(0, 2);
  if (explicitMediaBeats.length > 0) {
    const resolvedSlide = await resolveSlideUnitImage(
      { ...slide, imageBeats: undefined },
      slideIndex,
      `slide[${slideIndex}]`,
      context
    );
    return {
      ...resolvedSlide,
      imageBeats: explicitMediaBeats.map((beat) => {
        if (beat.clearVisual === true) {
          return {
            ...beat,
            imageUrl: undefined,
            resolvedImageUrl: undefined,
            resolvedBy: undefined,
            imageSelection: undefined,
            mediaUrl: undefined,
            mediaKind: undefined,
            imageRequest: undefined,
          };
        }
        const sourceImageUrl = beat.imageUrl || beat.resolvedImageUrl;
        const proxied =
          beat.mediaKind === "video" || beat.mediaKind === "animated_image" || !sourceImageUrl
            ? null
            : toImageProxyUrl(sourceImageUrl);
        const resolvedImageUrl = proxied || beat.resolvedImageUrl || beat.imageUrl;
        return {
          ...beat,
          imageUrl: proxied || sourceImageUrl,
          resolvedImageUrl,
          resolvedBy: beat.resolvedBy || "direct",
          imageSelection:
            beat.imageSelection ||
            {
              intent: "direct",
              queryCandidates: beat.imageRequest?.queryCandidates || [beat.imageRequest?.query || ""].filter(Boolean),
              selectedQuery: beat.imageRequest?.query || undefined,
              selectedCandidateId: "direct:user-provided",
              selectionReason: "manual/direct image URL",
            },
        };
      }),
    };
  }
  const normalizedSlide = collapseSlideToSingleImage(slide);
  if (context.debugImageSearch && Array.isArray(slide.imageBeats) && slide.imageBeats.length > 0) {
    context.warnings.push(
      `[debug] slide[${slideIndex}] image-beats ignored; using a single primary image`
    );
  }
  const resolvedSlide = await resolveSlideUnitImage(normalizedSlide, slideIndex, `slide[${slideIndex}]`, context);
  return {
    ...resolvedSlide,
    imageBeats: undefined,
  };
}

export async function applyImagePolicy(payload: StudioPrepareRequest): Promise<{
  slides: PreparedSlide[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const slides: PreparedSlide[] = [];
  let searchTuning = resolveImageSearchTuning(payload);
  const debugImageSearch = Boolean(payload.debugImageSearch);
  const configuredProviders = [...searchTuning.providers];
  const providerAvailability: Record<ImageProviderId, boolean> = {
    library: true,
    naver: Boolean((process.env.NAVER_SEARCH_CLIENT_ID || "").trim() && (process.env.NAVER_SEARCH_CLIENT_SECRET || "").trim()),
    pexels: Boolean((process.env.PEXELS_API_KEY || "").trim()),
    pixabay: Boolean((process.env.PIXABAY_API_KEY || "").trim()),
    openverse: true,
    wikimedia: true,
    giphy: Boolean((process.env.GIPHY_API_KEY || "").trim()),
  };
  const availableProviders = searchTuning.providers.filter((provider) => providerAvailability[provider]);
  if (availableProviders.length > 0 && availableProviders.length < searchTuning.providers.length) {
    searchTuning = {
      ...searchTuning,
      providers: availableProviders,
    };
  }
  const unavailableProviders = configuredProviders.filter((provider) => !providerAvailability[provider]);
  const configuredOnlineProviders = configuredProviders.filter((provider) => provider !== "library");
  if (configuredOnlineProviders.length > 0 && unavailableProviders.length >= configuredOnlineProviders.length) {
    warnings.push("[image-search] 온라인 이미지 provider 자격 증명이 없어 crawl 검색이 비활성화됩니다.");
  } else if (unavailableProviders.length > 0) {
    warnings.push(`[image-search] 자격 증명이 없어 ${unavailableProviders.join(", ")} provider는 건너뜁니다.`);
  }
  const animatedSlideIndexes = buildAnimatedSlideIndexes(payload.slides, payload.crawlMode);
  if (debugImageSearch) {
    warnings.push(
      `[debug] image-search tuning: providers=${searchTuning.providers.join("|")}, giphyLibraryOnly=${searchTuning.giphyLibraryOnly ? "1" : "0"}, noFilter=${searchTuning.naverNoFilter ? "1" : "0"}, maxVariants=${searchTuning.maxQueryVariantsPerSlide}, maxAttempts=${searchTuning.maxCrawlAttemptsPerSlide}, slideBudgetMs=${searchTuning.perSlideTimeBudgetMs}`
    );
    warnings.push(
      `[debug] animated-slides=${Array.from(animatedSlideIndexes).join(",") || "none"}`
    );
  }
  const naverCache = new Map<string, NaverCacheEntry>();
  const directMediaSlideCount = payload.slides.filter((slide) => {
    const imageUrl = String(slide.imageUrl || "").trim();
    const mediaUrl = String(slide.mediaUrl || "").trim();
    return Boolean(imageUrl || mediaUrl);
  }).length;
  const beatSlideCount = payload.slides.filter(
    (slide) => Array.isArray(slide.imageBeats) && slide.imageBeats.length > 0
  ).length;
  console.info(
    `[studio-prepare:policy] slides=${payload.slides.length} direct_media=${directMediaSlideCount} beat_slides=${beatSlideCount} workers=${Math.min(
      Math.max(IMAGE_POLICY_MIN_PARALLELISM, IMAGE_POLICY_PARALLELISM),
      Math.max(1, payload.slides.length)
    )} providers=${searchTuning.providers.join(">")} giphy_library_only=${searchTuning.giphyLibraryOnly ? "1" : "0"} slide_budget_ms=${searchTuning.perSlideTimeBudgetMs} provider_budget_ms=${searchTuning.providerTimeBudgetMs} max_variants=${searchTuning.maxQueryVariantsPerSlide} max_attempts=${searchTuning.maxCrawlAttemptsPerSlide}`
  );
  const recentSelectionHistoryScopeKey = buildRecentSelectionHistoryScopeKey(payload);
  const recentSelectionHistory = loadRecentSelectionHistory(recentSelectionHistoryScopeKey);
  if (debugImageSearch) {
    warnings.push(
      `[debug] recent-history scope=${recentSelectionHistoryScopeKey} signature=${buildSelectionNoveltyHistorySignature(recentSelectionHistory) || "none"} ttlMs=${RECENT_SELECTION_HISTORY_TTL_MS}`
    );
  }
  const context: ImagePolicyRuntimeContext = {
    payload,
    warnings,
    searchTuning,
    debugImageSearch,
    naverCache,
    usedResolvedImageUrls: new Set<string>(),
    usedCandidateIds: new Set<string>(),
    animatedSlideIndexes,
    recentSelectionHistory,
    recentSelectionHistoryScopeKey,
  };

  slides.length = payload.slides.length;
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(IMAGE_POLICY_MIN_PARALLELISM, IMAGE_POLICY_PARALLELISM), Math.max(1, payload.slides.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= payload.slides.length) return;
      const sourceSlide = payload.slides[index];
      const beatCount =
        Array.isArray(sourceSlide.imageBeats) && sourceSlide.imageBeats.length > 0
          ? sourceSlide.imageBeats.length
          : 1;
      const slideStartedAt = Date.now();
      const resolvedSlide = await resolveSlideImageWithReservation(sourceSlide, index, context);
      const elapsedMs = Math.max(0, Date.now() - slideStartedAt);
      console.info(
        `[studio-prepare:policy] slide=${index} beats=${beatCount} elapsed_ms=${elapsedMs} resolved_by=${toPolicyLogValue(
          resolvedSlide.resolvedBy || "unknown",
          24
        )} provider=${toPolicyLogValue(resolvedSlide.imageSelection?.provider || "", 24)} planner_source=${toPolicyLogValue(
          sourceSlide.imageRequest?.plannerSource || "",
          24
        )} query=${toPolicyLogValue(
          resolvedSlide.imageSelection?.selectedQuery || sourceSlide.imageRequest?.query || "",
          96
        )} title=${toPolicyLogValue(sourceSlide.title || sourceSlide.text || "", 72)}`
      );
      slides[index] = resolvedSlide;
    }
  });
  await Promise.all(workers);

  return {
    slides: slides.filter((slide): slide is PreparedSlide => Boolean(slide)),
    warnings,
  };
}

export const __internal = {
  resolveImageSearchTuning,
  buildRecentSelectionHistoryScopeKey,
  loadRecentSelectionHistory,
  rememberRecentSelectionHistory,
  clearRecentSelectionHistory,
  RECENT_SELECTION_HISTORY_TTL_MS,
};

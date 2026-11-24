import {
  buildConcreteVisualSearchCandidates,
  buildShortReactionSearchCandidates,
  normalizeMemeSearchPhrase,
  sanitizeSearchQueryCandidate,
  stripMemeSearchSuffix,
  analyzeImageRequestSearchSignal,
} from "@/lib/studio/images/intent";
import {
  buildNeutralBrollFallbacks,
  buildStockReactionQueriesFromRequest,
  containsHangul,
  dedupeQueries,
  trimQueryLength,
} from "@/lib/studio/image-provider-resolver-helpers";
import { buildGiphyQuery } from "@/lib/studio/image-provider-giphy";
import { toEnglishHint } from "@/lib/studio/query-translation";
import type { ImageProviderId, ImageRequest } from "@/types/studio-json";
import type { ProviderIntent } from "@/lib/studio/image-provider-resolver-search-evaluation";
export { probeCandidateMedia, scoreCandidate } from "@/lib/studio/image-provider-resolver-search-evaluation";
export { runProviderSearch } from "@/lib/studio/image-provider-resolver-search-adapters";
export type {
  CandidateProbeResult,
  ProviderAdapterResult,
  ProviderCandidate,
  ProviderIntent,
  ProviderSearchOptions,
  ProviderSourceMetadata,
} from "@/lib/studio/image-provider-resolver-search-evaluation";

export const DEFAULT_MAX_CANDIDATES_PER_PROVIDER = 18;
export const DEFAULT_PROVIDER_TIME_BUDGET_MS = 5_000;

function buildPexelsQuery(request: ImageRequest, intent: ProviderIntent): string {
  const signal = analyzeImageRequestSearchSignal(request);
  const seeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => value.trim())
    .filter(Boolean);
  const sanitizedBase =
    sanitizeSearchQueryCandidate(seeds[0] || request.scene?.trim() || "", {
      mode: intent === "meme" ? "fun" : "stock",
      allowMemeTerms: false,
      maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
    }) ||
    seeds[0] ||
    request.scene?.trim() ||
    "office work";
  const stockReaction = buildStockReactionQueriesFromRequest(request);
  const visualFallback = buildConcreteVisualSearchCandidates([request.scene || "", ...seeds])[0];
  const base = toEnglishHint(stockReaction[0] || visualFallback || sanitizedBase) || "office work";
  return base;
}

function buildPixabayQuery(request: ImageRequest, intent: ProviderIntent): string {
  const signal = analyzeImageRequestSearchSignal(request);
  const seeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => value.trim())
    .filter(Boolean);
  const sanitizedBase =
    sanitizeSearchQueryCandidate(seeds[0] || request.scene?.trim() || "", {
      mode: intent === "meme" ? "fun" : "stock",
      allowMemeTerms: false,
      maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
    }) ||
    seeds[0] ||
    request.scene?.trim() ||
    "office work";
  const stockReaction = buildStockReactionQueriesFromRequest(request);
  const visualFallback = buildConcreteVisualSearchCandidates([request.scene || "", ...seeds])[0];
  const base = toEnglishHint(stockReaction[0] || visualFallback || sanitizedBase) || "office work";
  return base;
}

export function buildProviderQueries(
  provider: ImageProviderId,
  request: ImageRequest,
  intent: ProviderIntent
): string[] {
  const signal = analyzeImageRequestSearchSignal(request);
  const isGiphyMemeSearch = provider === "giphy" && intent === "meme";
  const isNaverMemeSearch = provider === "naver" && intent === "meme";
  const querySeeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => normalizeMemeSearchPhrase(value.trim()))
    .filter(Boolean);
  const sceneSeed = normalizeMemeSearchPhrase((request.scene || "").trim());
  const seeds =
    (request.plannerSource === "codex" || request.plannerSource === "heuristic") &&
    intent === "meme" &&
    !signal.hasConcreteVisualCue
      ? querySeeds
      : [...querySeeds, sceneSeed].filter(Boolean);
  const sanitizedSeeds = dedupeQueries(
    seeds
      .map((seed) =>
        sanitizeSearchQueryCandidate(seed, {
          mode: intent === "meme" ? "fun" : "stock",
          allowMemeTerms: isNaverMemeSearch || (isGiphyMemeSearch && !signal.hasConcreteVisualCue),
          maxTokens: intent === "meme" && signal.hasConcreteVisualCue ? 4 : 3,
        })
      )
      .filter(Boolean)
  );
  const reactionShortcuts = intent === "meme" ? buildShortReactionSearchCandidates(seeds) : [];
  const naverReactionQueries = isNaverMemeSearch
    ? dedupeQueries(
        [...querySeeds, ...reactionShortcuts]
          .map((seed) =>
            sanitizeSearchQueryCandidate(seed, {
              mode: "fun",
              allowMemeTerms: true,
              maxTokens: 3,
            })
          )
          .filter(Boolean)
      )
    : [];
  const visualFallbacks = intent === "meme" ? buildConcreteVisualSearchCandidates([sceneSeed, ...seeds]) : [];
  const stockReactionQueries = provider !== "giphy" && intent === "meme" ? buildStockReactionQueriesFromRequest(request) : [];
  const providerBase =
    provider === "pexels"
      ? buildPexelsQuery(request, intent)
      : provider === "giphy"
        ? buildGiphyQuery(request, intent)
        : provider === "pixabay"
          ? buildPixabayQuery(request, intent)
          : isNaverMemeSearch
            ? naverReactionQueries[0] || sanitizedSeeds[0] || seeds[0] || request.query.trim()
            : sanitizedSeeds[0] || seeds[0] || request.query.trim();
  const englishSeedInputs =
    provider === "giphy" && signal.looksLikeSentence
      ? []
      : [...sanitizedSeeds, ...seeds, ...reactionShortcuts, ...visualFallbacks];
  const englishSeeds = dedupeQueries(
    englishSeedInputs
      .map((seed) => toEnglishHint(seed))
      .filter(Boolean)
  );
  const exactPhraseSeeds =
    provider === "giphy"
      ? dedupeQueries(
          (signal.looksLikeSentence ? sanitizedSeeds : querySeeds)
            .map((seed) => trimQueryLength(stripMemeSearchSuffix(seed)))
            .filter((seed) => Boolean(seed) && !containsHangul(seed))
        )
      : [];
  const baseQueries =
    provider === "giphy"
      ? [providerBase, ...englishSeeds, ...exactPhraseSeeds]
      : isNaverMemeSearch
        ? [
            providerBase,
            ...naverReactionQueries,
            ...sanitizedSeeds,
            ...sanitizedSeeds.map((seed) => stripMemeSearchSuffix(seed)),
            ...visualFallbacks,
            ...buildNeutralBrollFallbacks(request),
          ]
      : intent === "meme"
        ? [
            providerBase,
            ...stockReactionQueries,
            ...visualFallbacks,
            ...sanitizedSeeds.map((seed) => stripMemeSearchSuffix(seed)),
            ...englishSeeds,
            ...buildNeutralBrollFallbacks(request),
          ]
        : [providerBase, ...sanitizedSeeds, ...englishSeeds, ...buildNeutralBrollFallbacks(request)];
  const out = dedupeQueries(baseQueries);
  return out.slice(0, 6);
}

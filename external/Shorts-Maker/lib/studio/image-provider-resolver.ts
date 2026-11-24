import {
  resolveImageUrlByNaver,
  type NaverResolveOptions,
  type NaverResolveResult,
} from "@/lib/studio/image-resolver";
import { buildMediaReservationKeys, hasExcludedMediaReservationMatch } from "@/lib/studio/media-reservation";
import { mergeResolvedProviderCandidate } from "@/lib/studio/provider-selection";
import { seedMemeLibraryFromGiphy } from "@/lib/studio/image-provider-giphy";
import { getMinProviderScore, normalizeProviders, orientationMatches } from "@/lib/studio/image-provider-resolver-helpers";
import {
  DEFAULT_MAX_CANDIDATES_PER_PROVIDER,
  DEFAULT_PROVIDER_TIME_BUDGET_MS,
  type ProviderCandidate,
  type ProviderIntent,
  type ProviderSourceMetadata,
  runProviderSearch,
  probeCandidateMedia,
  scoreCandidate,
} from "@/lib/studio/image-provider-resolver-search";
import {
  appendSelectionReasonTags,
  diversifyNoveltyScoredCandidates,
  normalizeSelectionOffset,
  type SelectionNoveltyHistory,
} from "@/lib/studio/provider-candidate-diversity";
import type { ImageProviderId, ImageRequest, ImageSelectionCandidate, SlideMediaKind } from "@/types/studio-json";

export { seedMemeLibraryFromGiphy };

export type ImageProviderResolveOptions = {
  providers?: ImageProviderId[];
  intent?: ProviderIntent;
  naver?: NaverResolveOptions;
  maxCandidatesPerProvider?: number;
  providerTimeBudgetMs?: number;
  giphyLibraryOnly?: boolean;
  excludeCandidateIds?: string[];
  excludeUrls?: string[];
  libraryUserScope?: string;
  finalizeOnAcceptedProvider?: ImageProviderId;
  selectionOffset?: number;
  recentHistory?: SelectionNoveltyHistory;
};

export type ImageProviderResolveResult = NaverResolveResult & {
  provider?: ImageProviderId;
  providerCandidates?: ImageProviderId[];
  selectionDetails?: string[];
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  pageUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  sourceMetadata?: ProviderSourceMetadata;
};

type RankedResolvedCandidate = ImageProviderResolveResult & {
  providerRank: number;
};

function isExcludedCandidate(
  candidate: Pick<ProviderCandidate, "id" | "url" | "mediaUrl" | "pageUrl">,
  excludedCandidateIds: Set<string>,
  excludedUrls: Set<string>
): boolean {
  const candidateId = candidate.id.trim();
  if (candidateId && excludedCandidateIds.has(candidateId)) return true;
  if (hasExcludedMediaReservationMatch([candidate.url, candidate.mediaUrl, candidate.pageUrl], excludedUrls)) return true;
  return false;
}

function toImageSelectionCandidate(candidate: ProviderCandidate): ImageSelectionCandidate {
  return {
    provider: candidate.provider,
    candidateId: candidate.id,
    imageUrl: candidate.url,
    mediaUrl: candidate.mediaUrl,
    mediaKind: candidate.mediaKind,
    pageUrl: candidate.pageUrl,
    title: candidate.title,
    width: candidate.width,
    height: candidate.height,
    query: candidate.sourceMetadata?.providerQuery,
  };
}

export function buildGiphyCandidateOptionsForReview(candidates: ProviderCandidate[]): ImageSelectionCandidate[] {
  return candidates.slice(0, 3).map((item) => toImageSelectionCandidate(item));
}

function rankDirectGiphyCandidates(
  candidates: ProviderCandidate[],
  excludedCandidateIds: Set<string>,
  excludedUrls: Set<string>,
  selectionOffset?: number,
  recentHistory?: SelectionNoveltyHistory
) {
  const selectableCandidates = candidates.filter((candidate) => !isExcludedCandidate(candidate, excludedCandidateIds, excludedUrls));
  return diversifyNoveltyScoredCandidates(
    selectableCandidates.slice(0, 3).map((candidate, index) => ({
      candidate,
      score: Math.max(1, 12 - index),
      reason: index === 0 ? "direct-first-candidate" : "direct-ranked-candidate",
    })),
    {
      selectionOffset,
      maxPoolSize: 3,
      scoreWindow: 12,
      recentHistory,
      getNoveltySignals: ({ candidate }) => ({
        provider: candidate.provider,
        id: candidate.id,
        url: candidate.url,
        mediaUrl: candidate.mediaUrl,
        mediaKind: candidate.mediaKind,
        pageUrl: candidate.pageUrl,
        title: candidate.title,
        query: candidate.sourceMetadata?.providerQuery,
        sourceMetadata: candidate.sourceMetadata,
      }),
    }
  );
}

export function selectDirectGiphyCandidate(
  candidates: ProviderCandidate[],
  excludedCandidateIds: Set<string>,
  excludedUrls: Set<string>,
  selectionOffset?: number,
  recentHistory?: SelectionNoveltyHistory
): ProviderCandidate | null {
  return rankDirectGiphyCandidates(candidates, excludedCandidateIds, excludedUrls, selectionOffset, recentHistory)[0]?.candidate || null;
}

export async function resolveImageUrlByProviders(
  request: ImageRequest,
  options?: ImageProviderResolveOptions
): Promise<ImageProviderResolveResult> {
  const providers = normalizeProviders(options?.providers);
  const intent = options?.intent || "news";
  const maxCandidatesPerProvider = Math.max(1, Math.min(50, Math.floor(options?.maxCandidatesPerProvider || DEFAULT_MAX_CANDIDATES_PER_PROVIDER)));
  const providerTimeBudgetMs = Math.max(500, Math.min(30_000, Math.floor(options?.providerTimeBudgetMs || DEFAULT_PROVIDER_TIME_BUDGET_MS)));
  const libraryUserScope = options?.libraryUserScope || "";
  const excludedCandidateIds = new Set((options?.excludeCandidateIds || []).map((value) => value.trim()).filter(Boolean));
  const excludedUrls = new Set(buildMediaReservationKeys(options?.excludeUrls || []));
  const failureReasons: string[] = [];
  let bestResolved: RankedResolvedCandidate | null = null;

  for (let providerRank = 0; providerRank < providers.length; providerRank += 1) {
    const provider = providers[providerRank];
    if (provider === "naver") {
      const resolved = await resolveImageUrlByNaver(request, {
        ...(options?.naver || {}),
        excludeCandidateIds: options?.excludeCandidateIds,
        excludeUrls: options?.excludeUrls,
        recentHistory: options?.recentHistory,
      });
      if (resolved.ok && resolved.url) {
        const candidate: RankedResolvedCandidate = {
          ...resolved,
          provider,
          pageUrl: resolved.pageUrl,
          title: resolved.title,
          sourceMetadata: {
            providerQuery: resolved.selectedQuery || request.query.trim(),
            providerTitle: resolved.title,
          },
          providerCandidates: providers,
          selectionDetails: [
            ...failureReasons.slice(-4),
            `naver: selected score=${typeof resolved.score === "number" ? resolved.score : 0}; ${resolved.selectionReason || "verified candidate"}`,
          ],
          providerRank,
        };
        const nextSelection: { best: RankedResolvedCandidate; finalized: boolean } = mergeResolvedProviderCandidate(
          bestResolved,
          candidate,
          options
        );
        bestResolved = nextSelection.best;
        if (nextSelection.finalized) {
          const { providerRank: _providerRank, ...resolvedCandidate } = nextSelection.best;
          return resolvedCandidate;
        }
      }
      if (resolved.reason) failureReasons.push(`naver: ${resolved.reason}`);
      continue;
    }

    const providerResult = await runProviderSearch(provider, request, {
      intent,
      maxCandidatesPerProvider,
      providerTimeBudgetMs,
      libraryUserScope,
      giphyLibraryOnly: options?.giphyLibraryOnly,
    });

    const searchedQueries = providerResult.searchedQueries || [];
    if (!providerResult.ok || providerResult.candidates.length <= 0) {
      if (providerResult.reason) {
        failureReasons.push(
          `${provider}: queries=${searchedQueries.slice(0, 3).join(" / ") || "none"}; ${providerResult.reason}`
        );
      }
      continue;
    }

    if (provider === "giphy") {
      const candidateOptions = buildGiphyCandidateOptionsForReview(providerResult.candidates);
      const rankedDirectCandidates = rankDirectGiphyCandidates(
        providerResult.candidates,
        excludedCandidateIds,
        excludedUrls,
        options?.selectionOffset,
        options?.recentHistory
      );
      const selectedDirectCandidate = rankedDirectCandidates[0];
      if (!selectedDirectCandidate) {
        failureReasons.push(`${provider}: queries=${searchedQueries.slice(0, 3).join(" / ") || "none"}; all candidates excluded`);
        continue;
      }
      const skippedDirectPenaltyTags = options?.recentHistory
        ? Array.from(new Set(rankedDirectCandidates.slice(1, 3).flatMap((candidate) => candidate.noveltyTags)))
        : [];
      const directCandidate = selectedDirectCandidate.candidate;
      const directCandidateOffset = normalizeSelectionOffset(options?.selectionOffset, Math.min(3, rankedDirectCandidates.length));
      const directReason = appendSelectionReasonTags(
        appendSelectionReasonTags(
          directCandidateOffset > 0 ? `direct-offset-candidate:${directCandidateOffset}` : "direct-first-candidate",
          selectedDirectCandidate.noveltyTags
        ),
        skippedDirectPenaltyTags
      );
      const candidate: RankedResolvedCandidate = {
        ok: true,
        url: directCandidate.url,
        score: Math.max(0, getMinProviderScore(provider, request, intent)),
        candidateId: directCandidate.id,
        selectionReason: directReason,
        selectionDetails: [
          ...failureReasons.slice(-4),
          `${provider}: queries=${searchedQueries.slice(0, 3).join(" / ") || "none"}`,
          `${provider}: selected=${directCandidate.id}; ${directReason}`,
        ],
        candidateOptions,
        provider,
        providerCandidates: providers,
        mediaUrl: directCandidate.mediaUrl,
        mediaKind: directCandidate.mediaKind,
        pageUrl: directCandidate.pageUrl,
        title: directCandidate.title,
        width: directCandidate.width,
        height: directCandidate.height,
        sourceMetadata: directCandidate.sourceMetadata,
        providerRank,
      };
      const nextSelection: { best: RankedResolvedCandidate; finalized: boolean } = mergeResolvedProviderCandidate(
        bestResolved,
        candidate,
        options
      );
      bestResolved = nextSelection.best;
      if (nextSelection.finalized) {
        const { providerRank: _providerRank, ...resolvedCandidate } = nextSelection.best;
        return resolvedCandidate;
      }
      continue;
    }

    const scored = providerResult.candidates
      .filter((candidate) => {
        if (candidate.provider === "giphy" && intent === "meme") return true;
        if (candidate.provider === "library" && intent === "meme" && (candidate.mediaKind === "video" || candidate.mediaKind === "animated_image")) {
          return true;
        }
        return orientationMatches(request.orientation, candidate.width, candidate.height);
      })
      .map((candidate) => {
        const judged = scoreCandidate(candidate, request, intent);
        return { candidate, score: judged.score, reason: judged.reason };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    const minProviderScore = getMinProviderScore(provider, request, intent);

    const preferred = diversifyNoveltyScoredCandidates(
      scored.filter(({ candidate }) => !isExcludedCandidate(candidate, excludedCandidateIds, excludedUrls)),
      {
        selectionOffset: options?.selectionOffset,
        maxPoolSize: 6,
        scoreWindow: 10,
        recentHistory: options?.recentHistory,
        getNoveltySignals: ({ candidate }) => ({
          provider: candidate.provider,
          id: candidate.id,
          url: candidate.url,
          mediaUrl: candidate.mediaUrl,
          mediaKind: candidate.mediaKind,
          pageUrl: candidate.pageUrl,
          title: candidate.title,
          query: candidate.sourceMetadata?.providerQuery,
          sourceMetadata: candidate.sourceMetadata,
        }),
      }
    );
    const recentSkippedPenaltyTags = options?.recentHistory
      ? Array.from(new Set(preferred.slice(1, 3).flatMap((candidate) => candidate.noveltyTags)))
      : [];
    let providerBestSelection:
      | {
          candidate: ProviderCandidate;
          score: number;
          reason: string;
          belowMinAccepted: boolean;
          searchedQueries: string[];
          noveltyTags: string[];
        }
      | null = null;

    for (const judged of preferred) {
      const probe = await probeCandidateMedia(judged.candidate);
      if (!probe.ok) {
        failureReasons.push(
          `${provider}: probe failed candidate=${judged.candidate.id} (${probe.reason || "unknown"})`
        );
        continue;
      }
      providerBestSelection = {
        candidate: judged.candidate,
        score: judged.score,
        reason: appendSelectionReasonTags(
          appendSelectionReasonTags(judged.reason, judged.noveltyTags),
          recentSkippedPenaltyTags
        ),
        belowMinAccepted: judged.score < minProviderScore,
        searchedQueries,
        noveltyTags: judged.noveltyTags,
      };
      break;
    }

    if (!providerBestSelection && preferred.length > 0) {
      const fallback = preferred[0]!;
      providerBestSelection = {
        candidate: fallback.candidate,
        score: fallback.score,
        reason: `${appendSelectionReasonTags(
          appendSelectionReasonTags(fallback.reason, fallback.noveltyTags),
          recentSkippedPenaltyTags
        )}; unverified-accepted`,
        belowMinAccepted: true,
        searchedQueries,
        noveltyTags: fallback.noveltyTags,
      };
    }

    if (providerBestSelection) {
      const candidate: RankedResolvedCandidate = {
        ok: true,
        url: providerBestSelection.candidate.url,
        score: providerBestSelection.score,
        candidateId: providerBestSelection.candidate.id,
        selectionReason: providerBestSelection.belowMinAccepted
          ? `${providerBestSelection.reason}; below-min-accepted`
          : providerBestSelection.reason,
        selectionDetails: [
          ...failureReasons.slice(-4),
          `${provider}: queries=${providerBestSelection.searchedQueries.slice(0, 3).join(" / ") || "none"}`,
          `${provider}: selected=${providerBestSelection.candidate.id} score=${providerBestSelection.score}; ${providerBestSelection.reason}${providerBestSelection.belowMinAccepted ? "; below-min-accepted" : ""}`,
        ],
        provider,
        providerCandidates: providers,
        mediaUrl: providerBestSelection.candidate.mediaUrl,
        mediaKind: providerBestSelection.candidate.mediaKind,
        pageUrl: providerBestSelection.candidate.pageUrl,
        title: providerBestSelection.candidate.title,
        width: providerBestSelection.candidate.width,
        height: providerBestSelection.candidate.height,
        sourceMetadata: providerBestSelection.candidate.sourceMetadata,
        providerRank,
      };
      const nextSelection: { best: RankedResolvedCandidate; finalized: boolean } = mergeResolvedProviderCandidate(
        bestResolved,
        candidate,
        options
      );
      bestResolved = nextSelection.best;
      if (nextSelection.finalized) {
        const { providerRank: _providerRank, ...resolvedCandidate } = nextSelection.best;
        return resolvedCandidate;
      }
      continue;
    }

    if (scored.length > 0) {
      const topCandidates = scored
        .slice(0, 2)
        .map((item) => `${item.candidate.id}:${item.score}`)
        .join(", ");
      failureReasons.push(
        `${provider}: queries=${searchedQueries.slice(0, 3).join(" / ") || "none"}; best=${topCandidates}; min=${minProviderScore}; reason=${scored[0].reason || "none"}`
      );
    }
  }

  if (bestResolved?.ok && bestResolved.url) {
    const { providerRank: _providerRank, ...resolved } = bestResolved;
    return resolved;
  }

  return {
    ok: false,
    url: null,
    reason: `No configured image provider returned a candidate (${failureReasons.join(" | ") || providers.join(", ")})`,
    providerCandidates: providers,
  };
}

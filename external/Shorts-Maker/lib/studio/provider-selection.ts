import type { ImageProviderId } from "@/types/studio-json";

type RankedResolvedCandidateLike = {
  provider?: ImageProviderId;
  providerRank: number;
  score?: number;
};

export function mergeResolvedProviderCandidate<T extends RankedResolvedCandidateLike>(
  current: T | null,
  candidate: T,
  options?: { finalizeOnAcceptedProvider?: ImageProviderId }
): { best: T; finalized: boolean } {
  const best =
    !current ||
    (candidate.score || 0) > (current.score || 0) ||
    (((candidate.score || 0) === (current.score || 0)) && candidate.providerRank < current.providerRank)
      ? candidate
      : current;
  return {
    best,
    finalized: best === candidate && options?.finalizeOnAcceptedProvider === candidate.provider,
  };
}

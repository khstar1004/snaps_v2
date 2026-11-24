import type { ImageSelectionCandidate } from "@/types/studio-json";

function normalizeCandidateValue(value: unknown): string {
  return String(value || "").trim();
}

export function buildImageSelectionCandidateIdentity(
  candidate: Pick<ImageSelectionCandidate, "candidateId" | "imageUrl" | "mediaUrl" | "pageUrl" | "provider">
): string {
  const candidateId = normalizeCandidateValue(candidate.candidateId);
  if (candidateId) return `id:${candidateId}`;

  const imageUrl = normalizeCandidateValue(candidate.imageUrl);
  if (imageUrl) return `image:${imageUrl}`;

  const mediaUrl = normalizeCandidateValue(candidate.mediaUrl);
  if (mediaUrl) return `media:${mediaUrl}`;

  const pageUrl = normalizeCandidateValue(candidate.pageUrl);
  if (pageUrl) return `page:${pageUrl}`;

  const provider = normalizeCandidateValue(candidate.provider);
  return provider ? `provider:${provider}` : "";
}

export function dedupeImageSelectionCandidates(
  candidates: ImageSelectionCandidate[] | undefined,
  limit?: number
): ImageSelectionCandidate[] {
  const next: ImageSelectionCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates || []) {
    if (!candidate) continue;
    const identity = buildImageSelectionCandidateIdentity(candidate) || `fallback:${next.length}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    next.push(candidate);
    if (typeof limit === "number" && next.length >= limit) break;
  }

  return next;
}

export function buildImageSelectionCandidateReactKey(candidate: ImageSelectionCandidate, index: number): string {
  return [
    buildImageSelectionCandidateIdentity(candidate),
    normalizeCandidateValue(candidate.imageUrl),
    normalizeCandidateValue(candidate.mediaUrl),
    normalizeCandidateValue(candidate.pageUrl),
    String(index),
  ]
    .filter(Boolean)
    .join("|");
}

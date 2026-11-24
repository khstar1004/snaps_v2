import { dedupeImageSelectionCandidates } from "@/lib/studio/image-selection-candidates";
import { normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import type { ImageSelectionCandidate, PreparedSlide, SlideMediaKind } from "@/types/studio-json";

export const STUDIO_IMAGE_CANDIDATE_VISIBLE_LIMIT = 3;
export const STUDIO_AUTO_APPLIED_SELECTION_REASON = "auto-applied generated image candidate";

type LinkedSlideResolver = (slides: PreparedSlide[], index: number) => Set<number>;

type StudioImageCandidateAssetInput = {
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  assetId?: string;
  title?: string;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function candidateMatchesSelected(candidate: ImageSelectionCandidate, selectedCandidateId?: string): boolean {
  const selectedId = normalizeText(selectedCandidateId);
  return Boolean(selectedId && normalizeText(candidate.candidateId) === selectedId);
}

export function selectVisibleStudioImageCandidates(
  candidates: ImageSelectionCandidate[] | undefined,
  selectedCandidateId?: string,
  limit = STUDIO_IMAGE_CANDIDATE_VISIBLE_LIMIT
): ImageSelectionCandidate[] {
  const safeLimit = Math.max(1, Math.floor(limit));
  const deduped = dedupeImageSelectionCandidates(candidates, Math.max(safeLimit, (candidates || []).length));
  if (deduped.length <= safeLimit) return deduped;

  const visible = deduped.slice(0, safeLimit);
  const selected = deduped.find((candidate) => candidateMatchesSelected(candidate, selectedCandidateId));
  if (!selected || visible.some((candidate) => candidateMatchesSelected(candidate, selectedCandidateId))) {
    return visible;
  }
  return [...visible.slice(0, safeLimit - 1), selected];
}

export function buildStudioLibraryImageCandidate(asset: StudioImageCandidateAssetInput): ImageSelectionCandidate | null {
  const normalizedMedia = normalizeStudioMediaUrls({
    imageUrl: asset.imageUrl,
    mediaUrl: asset.mediaUrl,
    mediaKind: asset.mediaKind,
  });
  const imageUrl = normalizeText(normalizedMedia.imageUrl);
  if (!imageUrl) return null;
  return {
    provider: "library",
    candidateId: normalizeText(asset.assetId) || `library:${imageUrl}`,
    imageUrl,
    mediaUrl: normalizedMedia.mediaUrl,
    mediaKind: normalizedMedia.mediaKind,
    title: normalizeText(asset.title) || undefined,
  };
}

export function addStudioImageCandidateToSlides(params: {
  slides: PreparedSlide[];
  index: number;
  getLinkedSlideIndexes: LinkedSlideResolver;
  candidate: ImageSelectionCandidate;
}): PreparedSlide[] {
  if (!params.slides[params.index]) return params.slides;
  const candidateImageUrl = normalizeText(params.candidate.imageUrl);
  if (!candidateImageUrl) return params.slides;
  const linkedIndexes = params.getLinkedSlideIndexes(params.slides, params.index);

  return params.slides.map((slide, slideIndex) =>
    linkedIndexes.has(slideIndex)
      ? {
          ...slide,
          imageSelection: {
            intent: slide.imageSelection?.intent || "library",
            queryCandidates:
              slide.imageSelection?.queryCandidates || [params.candidate.query || slide.imageRequest?.query || ""].filter(Boolean),
            selectedQuery: slide.imageSelection?.selectedQuery,
            provider: slide.imageSelection?.provider,
            providerCandidates: slide.imageSelection?.providerCandidates,
            candidateOptions: selectVisibleStudioImageCandidates(
              [params.candidate, ...(slide.imageSelection?.candidateOptions || [])],
              slide.imageSelection?.selectedCandidateId,
              STUDIO_IMAGE_CANDIDATE_VISIBLE_LIMIT
            ),
            selectedCandidateId: slide.imageSelection?.selectedCandidateId,
            selectionReason: slide.imageSelection?.selectionReason,
            scoreBreakdown: slide.imageSelection?.scoreBreakdown,
          },
        }
      : slide
  );
}

export function applyStudioImageCandidateToSlides(params: {
  slides: PreparedSlide[];
  index: number;
  getLinkedSlideIndexes: LinkedSlideResolver;
  candidate: ImageSelectionCandidate;
  selectionReason?: string;
}): PreparedSlide[] {
  if (!params.slides[params.index]) return params.slides;
  const normalizedMedia = normalizeStudioMediaUrls({
    imageUrl: params.candidate.imageUrl,
    mediaUrl: params.candidate.mediaUrl,
    mediaKind: params.candidate.mediaKind,
  });
  const nextImageUrl = normalizeText(normalizedMedia.imageUrl);
  if (!nextImageUrl) return params.slides;
  const linkedIndexes = params.getLinkedSlideIndexes(params.slides, params.index);
  const resolvedBy = params.candidate.provider === "library" ? "direct" : "crawl";

  return params.slides.map((slide, slideIndex) =>
    linkedIndexes.has(slideIndex)
      ? {
          ...slide,
          imageUrl: nextImageUrl,
          mediaUrl: normalizedMedia.mediaUrl,
          mediaKind: normalizedMedia.mediaKind,
          resolvedImageUrl: nextImageUrl,
          resolvedBy,
          imageSelection: {
            intent: slide.imageSelection?.intent || params.candidate.provider,
            queryCandidates:
              slide.imageSelection?.queryCandidates || [params.candidate.query || slide.imageRequest?.query || ""].filter(Boolean),
            selectedQuery: params.candidate.query || slide.imageSelection?.selectedQuery || slide.imageRequest?.query || undefined,
            provider: params.candidate.provider,
            providerCandidates: slide.imageSelection?.providerCandidates?.includes(params.candidate.provider)
              ? slide.imageSelection.providerCandidates
              : [params.candidate.provider, ...(slide.imageSelection?.providerCandidates || [])],
            candidateOptions: selectVisibleStudioImageCandidates(
              [params.candidate, ...(slide.imageSelection?.candidateOptions || [])],
              params.candidate.candidateId,
              STUDIO_IMAGE_CANDIDATE_VISIBLE_LIMIT
            ),
            selectedCandidateId: params.candidate.candidateId,
            selectionReason:
              params.selectionReason ||
              `manual provider candidate selection: ${params.candidate.provider}${params.candidate.title ? ` / ${params.candidate.title}` : ""}`,
            scoreBreakdown: slide.imageSelection?.scoreBreakdown,
          },
        }
      : slide
  );
}

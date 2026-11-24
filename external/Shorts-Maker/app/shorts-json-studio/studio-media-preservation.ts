import type { PreparedSlide } from "@/types/studio-json";

export function hasInlineStudioMediaUrl(value: string | null | undefined): boolean {
  const normalized = String(value || "").trim();
  return normalized.startsWith("data:") || normalized.startsWith("blob:");
}

export function shouldPreserveSlideMediaAfterTextChange(
  slide: PreparedSlide | null | undefined
): boolean {
  if (!slide) return false;
  const imageUrl = String(slide.imageUrl || "").trim();
  const mediaUrl = String(slide.mediaUrl || "").trim();
  if (!imageUrl && !mediaUrl) return false;

  const selectionReason = String(slide.imageSelection?.selectionReason || "").trim().toLowerCase();
  if (selectionReason.includes("codex generated")) return false;
  if (selectionReason.includes("manual")) return true;

  const selectedCandidateId = String(slide.imageSelection?.selectedCandidateId || "").trim().toLowerCase();
  if (selectedCandidateId === "direct:user-provided" || selectedCandidateId.startsWith("library:")) return true;
  if (slide.resolvedBy === "crawl" || slide.resolvedBy === "fallback") return false;
  if (hasInlineStudioMediaUrl(imageUrl) || hasInlineStudioMediaUrl(mediaUrl)) return true;
  return slide.resolvedBy === "direct";
}

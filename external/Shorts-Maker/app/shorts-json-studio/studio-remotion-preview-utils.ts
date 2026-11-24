import { normalizeStudioMediaUrls } from "@/lib/studio/media-url-utils";
import type { PreparedSlide } from "@/types/studio-json";

type SlidePreviewMediaInput = Pick<PreparedSlide, "imageUrl" | "mediaKind" | "mediaUrl">;

export function slideHasMotionPreviewMedia(slide: SlidePreviewMediaInput): boolean {
  const normalized = normalizeStudioMediaUrls({
    imageUrl: slide.imageUrl,
    mediaUrl: slide.mediaUrl,
    mediaKind: slide.mediaKind,
  });
  if (!normalized.imageUrl && !normalized.mediaUrl) return false;
  return normalized.mediaKind === "video" || normalized.mediaKind === "animated_image";
}

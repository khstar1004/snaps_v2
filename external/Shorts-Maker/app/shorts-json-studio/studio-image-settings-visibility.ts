import type { ImageSource } from "@/types/studio-json";

export type StudioImageSettingsVisibility = {
  showCrawlSettings: boolean;
  showFixedCharacterSelection: boolean;
  showImageStyle: boolean;
};

export function resolveStudioImageSettingsVisibility(
  imageSource: ImageSource,
  hasValidFixedCharacterProfile: boolean
): StudioImageSettingsVisibility {
  const isAiImageMode =
    imageSource === "manual-ai-prompt" || imageSource === "auto-ai-generate";
  return {
    showCrawlSettings: imageSource === "crawl-only",
    showFixedCharacterSelection: isAiImageMode,
    showImageStyle: isAiImageMode && !hasValidFixedCharacterProfile,
  };
}

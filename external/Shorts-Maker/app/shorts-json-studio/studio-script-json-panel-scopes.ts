import { resolveStudioImageSettingsVisibility } from "./studio-image-settings-visibility";

export type StudioScriptJsonPanelSectionScope = "all" | "script" | "voice" | "image";

export type StudioScriptJsonPanelScopeVisibility = {
  showScriptSections: boolean;
  showNarrationVoiceSection: boolean;
  showVoiceDialogueSections: boolean;
  showImageStyleSection: boolean;
  showCharacterSection: boolean;
};

export function resolveStudioScriptJsonPanelSectionScope(
  sectionScope?: StudioScriptJsonPanelSectionScope
): StudioScriptJsonPanelSectionScope {
  return sectionScope || "all";
}

export function resolveStudioScriptJsonPanelScopeVisibility(
  sectionScope?: StudioScriptJsonPanelSectionScope,
  imageSource?: string,
  hasFixedCharacterProfile = false
): StudioScriptJsonPanelScopeVisibility {
  const resolvedScope = resolveStudioScriptJsonPanelSectionScope(sectionScope);
  const imageSettingsVisibility = resolveStudioImageSettingsVisibility(
    imageSource === "manual-ai-prompt" || imageSource === "auto-ai-generate"
      ? imageSource
      : "crawl-only",
    hasFixedCharacterProfile
  );
  return {
    showScriptSections: resolvedScope === "all" || resolvedScope === "script",
    showNarrationVoiceSection: resolvedScope === "all",
    showVoiceDialogueSections: resolvedScope === "all" || resolvedScope === "voice",
    showImageStyleSection:
      (resolvedScope === "all" || resolvedScope === "image") &&
      imageSettingsVisibility.showImageStyle,
    showCharacterSection: false,
  };
}

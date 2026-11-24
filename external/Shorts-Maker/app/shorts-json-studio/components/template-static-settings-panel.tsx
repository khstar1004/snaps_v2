"use client";

import type {
  BlackTemplateData,
  DefaultTemplateData,
  FunCaptionTemplateData,
  StudioTemplateId,
  StudioTemplatePayload,
} from "@/types/studio-template";
import { getStudioTemplateFeatureToggles } from "@/types/studio-feature-document";
import type { PreparedSlide } from "@/types/studio-json";
import type { TemplateBranding } from "../types";
import { CaptionFeatureManagerPanel } from "./caption-feature-manager-panel";
import { OverlayFeatureManagerPanel } from "./overlay-feature-manager-panel";
import { normalizeStudioTemplateData } from "./templates/template-registry";
import { BlackTemplateSettingsPanel } from "./templates/black-template-settings-panel";
import { DefaultTemplateSettingsPanel } from "./templates/default-template-settings-panel";
import { FunCaptionTemplateSettingsPanel } from "./templates/fun-caption-template-settings-panel";

type TemplateStaticSettingsPanelProps = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload | undefined;
  onChangeAction: (value: StudioTemplatePayload) => void;
  previewSlide?: PreparedSlide | null;
  branding?: TemplateBranding | null;
};

export function TemplateStaticSettingsPanel({ templateId, templateData, onChangeAction, previewSlide, branding }: TemplateStaticSettingsPanelProps) {
  if (templateId === "fun-caption") {
    const normalized = normalizeStudioTemplateData("fun-caption", templateData) as FunCaptionTemplateData;
    const featureToggles = getStudioTemplateFeatureToggles("fun-caption", normalized);
    return (
      <div className="studio-template-static-stack">
        <FunCaptionTemplateSettingsPanel value={normalized} onChangeAction={(value) => onChangeAction(value)} />
        {featureToggles.captionFeature ? (
          <CaptionFeatureManagerPanel
            value={normalized}
            onChangeAction={(value) => onChangeAction(value)}
            previewSlide={previewSlide}
            branding={branding}
          />
        ) : null}
        {featureToggles.overlayFeature ? (
          <OverlayFeatureManagerPanel value={normalized} onChangeAction={(value) => onChangeAction(value)} />
        ) : null}
      </div>
    );
  }

  if (templateId === "black") {
    const normalized = normalizeStudioTemplateData("black", templateData) as BlackTemplateData;
    return <BlackTemplateSettingsPanel value={normalized} onChangeAction={(value) => onChangeAction(value)} />;
  }

  const normalized = normalizeStudioTemplateData("default", templateData) as DefaultTemplateData;
  return <DefaultTemplateSettingsPanel value={normalized} onChangeAction={(value) => onChangeAction(value)} />;
}

"use client";

import type { PreparedSlide } from "@/types/studio-json";
import type { StudioTemplateSupportedFeatures } from "@/types/studio-feature-document";
import type {
  StudioTemplateDataMap,
  StudioTemplateId,
  StudioTemplatePayloadFor,
} from "@/types/studio-template";
import { blackTemplateModule } from "./black-template-module";
import { defaultTemplateModule } from "./default-template-module";
import { funCaptionTemplateModule } from "./fun-caption-template-module";
import type { StudioTemplateDefinition, StudioTemplateModule } from "./template-module-types";

export const STUDIO_TEMPLATE_MODULES: Record<StudioTemplateId, StudioTemplateModule> = {
  default: defaultTemplateModule,
  black: blackTemplateModule,
  "fun-caption": funCaptionTemplateModule,
};

export const STUDIO_TEMPLATE_DEFINITIONS: Record<StudioTemplateId, StudioTemplateDefinition> = {
  default: STUDIO_TEMPLATE_MODULES.default.definition,
  black: STUDIO_TEMPLATE_MODULES.black.definition,
  "fun-caption": STUDIO_TEMPLATE_MODULES["fun-caption"].definition,
};

export function getStudioTemplateModule<T extends StudioTemplateId>(templateId: T): StudioTemplateModule<T> {
  return (STUDIO_TEMPLATE_MODULES[templateId] ?? STUDIO_TEMPLATE_MODULES.default) as StudioTemplateModule<T>;
}

export function getStudioTemplateDefinition(templateId: StudioTemplateId): StudioTemplateDefinition {
  return getStudioTemplateModule(templateId).definition;
}

export function getStudioTemplateSupportedFeatures(templateId: StudioTemplateId): StudioTemplateSupportedFeatures {
  return getStudioTemplateDefinition(templateId).supportedFeatures;
}

export function createStudioTemplateData<T extends StudioTemplateId>(templateId: T): StudioTemplatePayloadFor<T> {
  return getStudioTemplateModule(templateId).createTemplateData() as StudioTemplatePayloadFor<T>;
}

export function normalizeStudioTemplateData<T extends StudioTemplateId>(templateId: T, value: unknown): StudioTemplatePayloadFor<T> {
  return getStudioTemplateModule(templateId).normalizeTemplateData(value) as StudioTemplatePayloadFor<T>;
}

export function buildStudioTemplateSampleSlide(templateId: StudioTemplateId, imageUrl?: string): PreparedSlide {
  return getStudioTemplateModule(templateId).buildSampleSlide(imageUrl);
}

export function getTemplateRequirementAlert(templateId: StudioTemplateId, slides: PreparedSlide[]): string | null {
  return getStudioTemplateModule(templateId).getRequirementAlert(slides);
}

export type { StudioTemplateDefinition } from "./template-module-types";
export type { StudioTemplateDataMap };

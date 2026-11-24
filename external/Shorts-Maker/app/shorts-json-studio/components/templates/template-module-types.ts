"use client";

import type { PreparedSlide } from "@/types/studio-json";
import type { StudioTemplateSupportedFeatures } from "@/types/studio-feature-document";
import type { StudioTemplateId, StudioTemplatePayloadFor } from "@/types/studio-template";

export type StudioTemplateRequiredField = "title" | "text" | "imageOrMedia";

export type StudioTemplateDefinition = {
  id: StudioTemplateId;
  label: string;
  accent: string;
  description: string;
  summary: string;
  inputGuide: string;
  layoutStudioHint: string;
  usesLegacyOverlayEditor: boolean;
  supportedFeatures: StudioTemplateSupportedFeatures;
  requiredFields: StudioTemplateRequiredField[];
};

export type StudioTemplateModule<T extends StudioTemplateId = StudioTemplateId> = {
  id: T;
  definition: StudioTemplateDefinition;
  createTemplateData: () => StudioTemplatePayloadFor<T>;
  normalizeTemplateData: (value: unknown) => StudioTemplatePayloadFor<T>;
  buildSampleSlide: (imageUrl?: string) => PreparedSlide;
  getRequirementAlert: (slides: PreparedSlide[]) => string | null;
};

export function hasSlideText(slide: PreparedSlide): boolean {
  if (String(slide.text || "").trim()) return true;
  if (Array.isArray(slide.lines) && slide.lines.some((line) => String(line || "").trim())) return true;
  return false;
}

export function hasSlideMedia(slide: PreparedSlide): boolean {
  if (String(slide.imageUrl || "").trim()) return true;
  if (String(slide.mediaUrl || "").trim()) return true;
  return false;
}

export function buildTemplateRequirementAlert(
  label: string,
  requiredFields: StudioTemplateRequiredField[],
  slides: PreparedSlide[]
): string | null {
  if (slides.length <= 0) return null;

  const missingCounts = {
    title: 0,
    text: 0,
    imageOrMedia: 0,
  };

  for (const slide of slides) {
    if (requiredFields.includes("title") && !String(slide.title || "").trim()) {
      missingCounts.title += 1;
    }
    if (requiredFields.includes("text") && !hasSlideText(slide)) {
      missingCounts.text += 1;
    }
    if (requiredFields.includes("imageOrMedia") && !hasSlideMedia(slide)) {
      missingCounts.imageOrMedia += 1;
    }
  }

  const messages: string[] = [];
  if (missingCounts.title > 0) messages.push(`제목 누락 ${missingCounts.title}개`);
  if (missingCounts.text > 0) messages.push(`본문 누락 ${missingCounts.text}개`);
  if (missingCounts.imageOrMedia > 0) messages.push(`이미지/영상 누락 ${missingCounts.imageOrMedia}개`);

  if (messages.length === 0) return null;
  return `${label} 필수 입력 확인: ${messages.join(", ")}.`;
}

export function toScale(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.7, Math.min(1.4, numeric));
}

export function toNumberInRange(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  if (!next) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(next) ? next : fallback;
}

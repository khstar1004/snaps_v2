"use client";

import { toCategoryLabel } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";

type PreviewTimingLike = {
  frameDurationsSec: number[];
} | null;

export function hasStudioWorkContent(input: {
  topicText: string;
  scriptText: string;
  jsonText: string;
  slides: PreparedSlide[];
  preselectedMediaItemCount: number;
  previewTiming: PreviewTimingLike;
  videoUrl: string | null;
  uploadedVideoUrl: string | null;
  renderStatus: string;
}): boolean {
  return Boolean(
    input.topicText.trim() ||
      input.scriptText.trim() ||
      input.jsonText.trim() ||
      input.slides.length > 0 ||
      input.preselectedMediaItemCount > 0 ||
      input.previewTiming?.frameDurationsSec.length ||
      (input.videoUrl && input.videoUrl.trim()) ||
      (input.uploadedVideoUrl && input.uploadedVideoUrl.trim()) ||
      input.renderStatus.trim()
  );
}

export function getSuggestedStudioWorkName(input: {
  workName: string;
  publishTitle: string;
  slides: PreparedSlide[];
  topicText: string;
  scriptText: string;
  publishCategory: PublishCategory;
}): string {
  const topicLine = input.topicText.trim().split(/\r?\n/, 1)[0] || "";
  const scriptLine = input.scriptText.trim().split(/\r?\n/, 1)[0] || "";
  return (
    input.workName.trim() ||
    input.publishTitle.trim() ||
    (Array.isArray(input.slides) ? String(input.slides[0]?.title || "").trim() : "") ||
    topicLine ||
    scriptLine ||
    `${toCategoryLabel(input.publishCategory)} 작업`
  );
}

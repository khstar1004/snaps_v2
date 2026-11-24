"use client";

import { Player, Thumbnail } from "@remotion/player";
import { memo, useMemo } from "react";
import { getSlideNarrationText } from "@/lib/studio/narration-text";
import { StudioShortsComposition } from "@/remotion/StudioShortsComposition";
import type { PreparedSlide } from "@/types/studio-json";
import type {
  StudioRemotionCompositionProps,
  StudioRenderTemplateImageLayout,
  StudioRenderTemplateLayoutApply,
} from "@/types/studio-renderer";
import { slideHasMotionPreviewMedia } from "../studio-remotion-preview-utils";
import { normalizeStudioTemplateId, type StudioTemplateId, type StudioTemplatePayload } from "../types";

const PREVIEW_FPS = 30;
const PREVIEW_WIDTH = 1080;
const PREVIEW_HEIGHT = 1920;
const THUMBNAIL_FRAME_STYLE = {
  width: "100%",
  aspectRatio: "9 / 16",
  borderRadius: 0,
  overflow: "hidden",
  background: "#0f172a",
} as const;
const THUMBNAIL_LOADING_STYLE = {
  width: "100%",
  aspectRatio: "9 / 16",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111827",
  color: "rgba(255,255,255,0.7)",
  fontSize: 12,
} as const;
const THUMBNAIL_ERROR_STYLE = {
  width: "100%",
  aspectRatio: "9 / 16",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111827",
  color: "#fca5a5",
  fontSize: 12,
  padding: 12,
  textAlign: "center",
} as const;
const PLAYER_FRAME_STYLE = {
  width: "100%",
  aspectRatio: "9 / 16",
  borderRadius: 0,
  overflow: "hidden",
  background: "#000000",
} as const;
const PLAYER_LOADING_STYLE = {
  width: "100%",
  aspectRatio: "9 / 16",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111827",
  color: "rgba(255,255,255,0.7)",
  fontSize: 13,
} as const;
const PLAYER_ERROR_STYLE = {
  width: "100%",
  aspectRatio: "9 / 16",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111827",
  color: "#fca5a5",
  fontSize: 13,
  padding: 16,
  textAlign: "center",
} as const;

type RemotionPreviewVisualProps = {
  slides: PreparedSlide[];
  branding: {
    headerTitle: string;
    headerAccentText?: string;
    headerColor: string;
    footerColor: string;
    infoLineText: string;
    fontFamily: string;
    imageRounded: boolean;
  };
  templateId?: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: StudioRenderTemplateImageLayout;
  templateLayoutApply?: StudioRenderTemplateLayoutApply;
  frameDurationsSec?: number[];
  playbackRate?: number;
};

function clampDurationSec(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toPreviewFrameDurationsSec(slides: PreparedSlide[]): number[] {
  return slides.map((slide) => {
    const lineCount = Array.isArray(slide.lines) && slide.lines.length > 0 ? slide.lines.length : 2;
    const textLength = getSlideNarrationText(slide).length;
    const estimated = 1.2 + lineCount * 0.32 + Math.min(1, textLength / 70);
    return clampDurationSec(estimated, 1.8, 3.4);
  });
}

function buildPreviewCompositionProps(input: RemotionPreviewVisualProps): StudioRemotionCompositionProps {
  const slides = input.slides;
  const frameDurationsSec =
    Array.isArray(input.frameDurationsSec) && input.frameDurationsSec.length === slides.length
      ? input.frameDurationsSec.map((value) => clampDurationSec(Number(value), 0.001, 60))
      : toPreviewFrameDurationsSec(slides);
  const totalSec = frameDurationsSec.reduce((acc, cur) => acc + cur, 0);
  const durationInFrames = Math.max(1, Math.round(totalSec * PREVIEW_FPS));
  return {
    slides,
    branding: {
      ...input.branding,
      headerAccentText: input.branding.headerAccentText || "",
    },
    templateId: normalizeStudioTemplateId(input.templateId),
    templateData: input.templateData,
    templateImageEnabled: input.templateImageEnabled,
    templateImageUrl: input.templateImageUrl,
    templateImageLayout: input.templateImageLayout,
    templateLayoutApply: input.templateLayoutApply,
    frameDurationsSec,
    durationInFrames,
    fps: PREVIEW_FPS,
    playbackRate: input.playbackRate,
  };
}

function StudioRemotionSlideThumbnailInner({
  slide,
  branding,
  templateId,
  templateData,
  templateImageEnabled,
  templateImageUrl,
  templateImageLayout,
  templateLayoutApply,
  playMotionMedia = false,
}: {
  slide: PreparedSlide;
  branding: RemotionPreviewVisualProps["branding"];
  templateId?: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: StudioRenderTemplateImageLayout;
  templateLayoutApply?: StudioRenderTemplateLayoutApply;
  playMotionMedia?: boolean;
}) {
  const inputProps = useMemo(
    () =>
      buildPreviewCompositionProps({
        slides: [slide],
        branding,
        templateId: normalizeStudioTemplateId(templateId),
        templateData,
        templateImageEnabled,
        templateImageUrl,
        templateImageLayout,
        templateLayoutApply,
        frameDurationsSec: undefined,
      }),
    [branding, slide, templateId, templateData, templateImageEnabled, templateImageLayout, templateImageUrl, templateLayoutApply]
  );
  const frameToDisplay = Math.min(inputProps.durationInFrames - 1, Math.max(0, Math.round(inputProps.durationInFrames * 0.4)));
  const shouldAutoplayMotionPreview = playMotionMedia && slideHasMotionPreviewMedia(slide);

  if (shouldAutoplayMotionPreview) {
    return (
      <Player
        component={StudioShortsComposition}
        inputProps={inputProps}
        durationInFrames={inputProps.durationInFrames}
        compositionWidth={PREVIEW_WIDTH}
        compositionHeight={PREVIEW_HEIGHT}
        fps={PREVIEW_FPS}
        controls={false}
        loop
        autoPlay
        initiallyMuted
        showVolumeControls={false}
        allowFullscreen={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        acknowledgeRemotionLicense
        logLevel="error"
        style={THUMBNAIL_FRAME_STYLE}
        renderLoading={() => (
          <div style={THUMBNAIL_LOADING_STYLE}>
            미리보기 로딩 중
          </div>
        )}
        errorFallback={({ error }) => (
          <div style={THUMBNAIL_ERROR_STYLE}>
            {error.message}
          </div>
        )}
      />
    );
  }

  return (
    <Thumbnail
      component={StudioShortsComposition}
      inputProps={inputProps}
      frameToDisplay={frameToDisplay}
      durationInFrames={inputProps.durationInFrames}
      compositionWidth={PREVIEW_WIDTH}
      compositionHeight={PREVIEW_HEIGHT}
      fps={PREVIEW_FPS}
      logLevel="error"
      style={THUMBNAIL_FRAME_STYLE}
      renderLoading={() => (
        <div style={THUMBNAIL_LOADING_STYLE}>
          미리보기 로딩 중
        </div>
      )}
      errorFallback={({ error }) => (
        <div style={THUMBNAIL_ERROR_STYLE}>
          {error.message}
        </div>
      )}
    />
  );
}

function StudioRemotionPlayerPreviewInner({
  slides,
  branding,
  templateId,
  templateData,
  templateImageEnabled,
  templateImageUrl,
  templateImageLayout,
  templateLayoutApply,
  frameDurationsSec,
  playbackRate,
}: RemotionPreviewVisualProps) {
  const inputProps = useMemo(
    () =>
      buildPreviewCompositionProps({
        slides,
        branding,
        templateId: normalizeStudioTemplateId(templateId),
        templateData,
        templateImageEnabled,
        templateImageUrl,
        templateImageLayout,
        templateLayoutApply,
        frameDurationsSec,
        playbackRate,
      }),
    [
      branding,
      frameDurationsSec,
      slides,
      templateId,
      templateData,
      templateImageEnabled,
      templateImageLayout,
      templateImageUrl,
      templateLayoutApply,
      playbackRate,
    ]
  );

  return (
    <Player
      component={StudioShortsComposition}
      inputProps={inputProps}
      durationInFrames={inputProps.durationInFrames}
      compositionWidth={PREVIEW_WIDTH}
      compositionHeight={PREVIEW_HEIGHT}
      fps={PREVIEW_FPS}
      controls
      loop
      initiallyMuted
      showVolumeControls={false}
      clickToPlay
      doubleClickToFullscreen
      acknowledgeRemotionLicense
      logLevel="error"
      style={PLAYER_FRAME_STYLE}
      renderLoading={() => (
        <div style={PLAYER_LOADING_STYLE}>
          Remotion 미리보기 로딩 중
        </div>
      )}
      errorFallback={({ error }) => (
        <div style={PLAYER_ERROR_STYLE}>
          {error.message}
        </div>
      )}
    />
  );
}

export const StudioRemotionSlideThumbnail = memo(StudioRemotionSlideThumbnailInner);
StudioRemotionSlideThumbnail.displayName = "StudioRemotionSlideThumbnail";

export const StudioRemotionPlayerPreview = memo(StudioRemotionPlayerPreviewInner);
StudioRemotionPlayerPreview.displayName = "StudioRemotionPlayerPreview";

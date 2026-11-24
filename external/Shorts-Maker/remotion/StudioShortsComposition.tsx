import type { CSSProperties } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type {
  StudioRemotionCompositionProps,
  StudioRenderLayoutRect,
  StudioRenderTemplateImageLayout,
  StudioRenderTemplateId,
  StudioRenderTemplateLayoutApply,
} from "../types/studio-renderer";
import {
  buildAutoCaptionCueOverrides,
  getStudioCaptionStylePreset,
  normalizeStudioCaptionCueOverrides,
  parseStudioCaptionCueLine,
  resolveStudioCaptionCueAnalysis,
} from "../types/studio-caption";
import { getStudioTemplateFeatureToggles } from "../types/studio-feature-document";
import { getStudioOverlayPreset } from "../types/studio-overlay";
import { buildStudioMediaSequences, resolveStudioMediaSequenceStep } from "../lib/studio/remotion-media-sequences";
import { inferStudioRenderableMedia } from "../lib/studio/media-url-utils";
import { estimateTextWidthPxApprox } from "../lib/studio/caption-layout";
import { getStudioCaptionCueTiming } from "../lib/studio/caption-cue-timing";
import type { PreparedSlide } from "../types/studio-json";
import { normalizeStudioTemplateData } from "../app/shorts-json-studio/components/templates/template-registry";

const DEFAULT_TEMPLATE_IMAGE_LAYOUT: StudioRenderTemplateImageLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
  bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
  imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
  infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
  headerTitleColor: "#ffffff",
  headerAccentColor: "rgba(255,255,255,0.9)",
  titleColor: "#ffffff",
  bodyColor: "#ffffff",
  infoColor: "rgba(255,255,255,0.92)",
  titleAlign: "center",
  bodyAlign: "center",
  headerSize: 17,
  titleSize: 46,
  bodySize: 26,
  infoSize: 15,
};

const DEFAULT_TEMPLATE_LAYOUT_APPLY: StudioRenderTemplateLayoutApply = {
  title: true,
  body: true,
  image: true,
  info: true,
};

function scaleByWidth(value: number, width: number): number {
  return (value * width) / 270;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampFontWeight(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return clamp(Math.round((value as number) / 100) * 100, 100, 900);
}

function resolveNewsTextColor(
  key: "titleColor" | "bodyColor" | "infoColor",
  value: string,
  fallback: string
): string {
  if (key === "titleColor" && value === "#ffffff") return "#18181b";
  if (key === "bodyColor" && value === "#ffffff") return fallback;
  if (key === "infoColor" && value === "rgba(255,255,255,0.92)") return "#71717a";
  return value;
}

function HeartGlyph({
  size,
  fill,
  opacity,
}: {
  size: number;
  fill: string;
  opacity: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block", opacity }}>
      <path
        d="M32 56C17 46 8 36 8 23.5C8 15.2 14.5 9 22.3 9C27.2 9 31 11.4 32 15C33 11.4 36.8 9 41.7 9C49.5 9 56 15.2 56 23.5C56 36 47 46 32 56Z"
        fill={fill}
      />
    </svg>
  );
}

function OverlayFeatureLayer({
  preset,
  placement,
  opacity,
  scale,
  density,
  frame,
  width,
  height,
}: {
  preset: string;
  placement: string;
  opacity: number;
  scale: number;
  density: number;
  frame: number;
  width: number;
  height: number;
}) {
  const overlayPreset = getStudioOverlayPreset(preset);
  if (overlayPreset.id === "none" || opacity <= 0.01 || density <= 0.01) {
    return null;
  }

  const placementTop =
    placement === "bottom" ? height * 0.56 : placement === "center" ? height * 0.24 : 0;
  const placementHeight =
    placement === "bottom" ? height * 0.44 : placement === "center" ? height * 0.52 : height;

  if (overlayPreset.id === "fire") {
    const flameCount = Math.max(4, Math.round(7 * density));
    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: placement === "center" ? height * 0.26 : height * 0.22,
            background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${toRgba(
              overlayPreset.accentColor,
              opacity * 0.18,
            )} 60%, ${toRgba(overlayPreset.primaryColor, opacity * 0.35)} 100%)`,
            mixBlendMode: "screen",
          }}
        />
        {Array.from({ length: flameCount }).map((_, index) => {
          const local = (frame * (1.1 + index * 0.05) + index * 9) % 32;
          const sway = Math.sin((frame + index * 6) / 7) * scaleByWidth(10, width);
          const left = ((index + 0.5) / flameCount) * width;
          const flameWidth = scaleByWidth(28 + index * 4, width) * scale;
          const flameHeight = scaleByWidth(78 + (index % 3) * 18, width) * scale * (0.85 + density * 0.22);
          return (
            <div
              key={`fire-${index}`}
              style={{
                position: "absolute",
                left: left - flameWidth / 2 + sway,
                bottom: placement === "center" ? height * 0.22 : -scaleByWidth(6, width),
                width: flameWidth,
                height: flameHeight,
                borderRadius: "50% 50% 40% 40%",
                background: `radial-gradient(circle at 50% 78%, ${toRgba(
                  overlayPreset.secondaryColor,
                  opacity,
                )} 0%, ${toRgba(overlayPreset.primaryColor, opacity * 0.92)} 48%, rgba(239,68,68,0) 76%)`,
                transform: `translateY(${Math.sin(local / 5) * scaleByWidth(6, width)}px) scaleY(${
                  0.88 + Math.sin(local / 7) * 0.12
                }) rotate(${Math.sin((frame + index * 3) / 10) * 4}deg)`,
                filter: `blur(${2 + density * 2}px)`,
                opacity: clamp(opacity * 1.05, 0, 1),
                mixBlendMode: "screen",
              }}
            />
          );
        })}
      </div>
    );
  }

  if (overlayPreset.id === "spark") {
    const sparkCount = Math.max(6, Math.round(12 * density));
    return (
      <div style={{ position: "absolute", inset: 0, top: placementTop, height: placementHeight, pointerEvents: "none" }}>
        {Array.from({ length: sparkCount }).map((_, index) => {
          const cycle = ((frame * (0.9 + index * 0.03) + index * 11) % 84) / 84;
          const x = (((index * 17) % 100) / 100) * width;
          const y = placementHeight * cycle;
          const size = scaleByWidth(6 + (index % 4) * 4, width) * scale;
          return (
            <div
              key={`spark-${index}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: size,
                height: size,
                borderRadius: 999,
                background: index % 3 === 0 ? overlayPreset.accentColor : overlayPreset.primaryColor,
                boxShadow: `0 0 ${Math.round(size * 1.8)}px ${toRgba(overlayPreset.secondaryColor, opacity)}`,
                opacity: opacity * (0.35 + (1 - cycle) * 0.65),
                transform: `scale(${0.8 + Math.sin((frame + index * 8) / 6) * 0.22})`,
              }}
            />
          );
        })}
      </div>
    );
  }

  const heartCount = Math.max(4, Math.round(9 * density));
  return (
    <div style={{ position: "absolute", inset: 0, top: placementTop, height: placementHeight, pointerEvents: "none" }}>
      {Array.from({ length: heartCount }).map((_, index) => {
        const cycle = ((frame * (0.75 + index * 0.04) + index * 13) % 96) / 96;
        const x = ((((index * 19) % 100) / 100) * 0.82 + 0.09) * width;
        const y = placementHeight - cycle * placementHeight;
        const size = scaleByWidth(22 + (index % 3) * 8, width) * scale;
        const fill = index % 2 === 0 ? overlayPreset.primaryColor : overlayPreset.secondaryColor;
        return (
          <div
            key={`heart-${index}`}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `translate(-50%, -50%) rotate(${Math.sin((frame + index * 5) / 9) * 8}deg) scale(${
                0.88 + Math.sin((frame + index * 11) / 8) * 0.14
              })`,
              filter: `drop-shadow(0 0 ${Math.round(size * 0.55)}px ${toRgba(overlayPreset.secondaryColor, opacity * 0.85)})`,
              opacity: opacity * (0.28 + (1 - cycle) * 0.72),
            }}
          >
            <HeartGlyph size={size} fill={fill} opacity={1} />
          </div>
        );
      })}
    </div>
  );
}

function toDisplayText(slide: PreparedSlide): string {
  const lines = Array.isArray(slide.lines) ? slide.lines.filter((line) => line.trim().length > 0) : [];
  if (lines.length > 0) return lines.join("\n");
  return String(slide.text || "—").trim() || "—";
}

function fitTitleFontSizePxApprox(text: string, width: number, basePx: number, minPx: number): number {
  const safeText = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!safeText) return basePx;
  const safeWidth = Math.max(1, width);
  const estimatedWidth = estimateTextWidthPxApprox(safeText, basePx);
  if (estimatedWidth <= safeWidth) return basePx;
  const ratio = safeWidth / estimatedWidth;
  let nextPx = Math.max(minPx, Math.floor(basePx * ratio));
  while (nextPx > minPx && estimateTextWidthPxApprox(safeText, nextPx) > safeWidth) {
    nextPx -= 1;
  }
  return nextPx;
}

function estimateRenderedLineCount(lines: string[], availableWidthPx: number, fontPx: number): number {
  const safeWidth = Math.max(1, availableWidthPx);
  return Math.max(
    1,
    lines.reduce((count, line) => {
      const safeLine = String(line || "").trim();
      if (!safeLine) return count + 1;
      const estimatedWidth = estimateTextWidthPxApprox(safeLine, fontPx);
      return count + Math.max(1, Math.ceil(estimatedWidth / safeWidth));
    }, 0)
  );
}

function layoutRectStyle(rect: StudioRenderLayoutRect): CSSProperties {
  return {
    position: "absolute",
    left: `${(rect.x * 100).toFixed(4)}%`,
    top: `${(rect.y * 100).toFixed(4)}%`,
    width: `${(rect.w * 100).toFixed(4)}%`,
    height: `${(rect.h * 100).toFixed(4)}%`,
  };
}

function PlaceholderImage() {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #dbeafe 0%, #eff6ff 45%, #e5e7eb 100%)",
      }}
    />
  );
}

function splitHeadline(text: string): [string, string] {
  const normalized = String(text || "").trim().replace(/\s+/g, " ");
  if (!normalized) return ["제목을", "입력하세요"];
  const words = normalized.split(" ");
  if (words.length === 1) return [words[0], ""];
  const pivot = Math.max(1, Math.ceil(words.length / 2));
  return [words.slice(0, pivot).join(" "), words.slice(pivot).join(" ")];
}

function getFunCaptionCueLines(slide: PreparedSlide) {
  const structuredCues =
    Array.isArray(slide.captionCues) && slide.captionCues.length > 0
      ? slide.captionCues
          .map((cue) => ({
            text: String(cue?.text || "").trim(),
            overrides: normalizeStudioCaptionCueOverrides(cue?.overrides),
          }))
          .filter((cue) => cue.text.length > 0)
      : [];
  if (structuredCues.length > 0) return structuredCues;
  const authoredLines = Array.isArray(slide.lines)
    ? slide.lines.map((line) => String(line || "").trim()).filter((line) => line.length > 0)
    : [];
  if (authoredLines.length > 0) return authoredLines.map((line) => parseStudioCaptionCueLine(line));
  const text = String(slide.text || "").trim();
  if (!text) return [parseStudioCaptionCueLine("중앙 자막을 입력하세요")];
  const split = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (split.length > 0 ? split : [text]).map((line) => parseStudioCaptionCueLine(line));
}

function getFunCaptionAnimationState(preset: string, progress: number, frame: number) {
  if (preset === "slide-up") {
    return {
      opacity: interpolate(progress, [0, 1], [0, 1]),
      translateY: interpolate(progress, [0, 1], [60, 0]),
      scale: interpolate(progress, [0, 1], [0.96, 1]),
      rotate: 0,
    };
  }
  if (preset === "bounce") {
    return {
      opacity: interpolate(progress, [0, 1], [0, 1]),
      translateY: interpolate(progress, [0, 0.55, 0.82, 1], [82, -12, 6, 0]),
      scale: interpolate(progress, [0, 0.65, 1], [0.78, 1.08, 1]),
      rotate: interpolate(progress, [0, 1], [-2.4, 0]),
    };
  }
  if (preset === "pulse") {
    return {
      opacity: interpolate(progress, [0, 1], [0, 1]),
      translateY: interpolate(progress, [0, 1], [24, 0]),
      scale: interpolate(progress, [0, 0.45, 1], [0.88, 1.12, 1 + Math.sin(frame / 4) * 0.015]),
      rotate: 0,
    };
  }
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    translateY: interpolate(progress, [0, 1], [42, 0]),
    scale: interpolate(progress, [0, 0.45, 1], [0.84, 1.08, 1]),
    rotate: 0,
  };
}

function getFunCaptionExitState(preset: string, progress: number) {
  if (preset === "fade") {
    return {
      opacity: interpolate(progress, [0, 1], [1, 0]),
      translateY: 0,
      scale: 1,
      rotate: 0,
    };
  }
  if (preset === "shrink") {
    return {
      opacity: interpolate(progress, [0, 1], [1, 0]),
      translateY: interpolate(progress, [0, 1], [0, 10]),
      scale: interpolate(progress, [0, 1], [1, 0.78]),
      rotate: interpolate(progress, [0, 1], [0, -2]),
    };
  }
  if (preset === "slide-down") {
    return {
      opacity: interpolate(progress, [0, 1], [1, 0]),
      translateY: interpolate(progress, [0, 1], [0, 54]),
      scale: interpolate(progress, [0, 1], [1, 0.96]),
      rotate: 0,
    };
  }
  return {
    opacity: 1,
    translateY: 0,
    scale: 1,
    rotate: 0,
  };
}

function normalizeCaptionHighlightToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/^[^0-9a-zA-Z가-힣]+|[^0-9a-zA-Z가-힣]+$/g, "");
}

function renderFunCaptionHighlightedText({
  text,
  highlightWords,
  baseColor,
  highlightColor,
  highlightScale,
}: {
  text: string;
  highlightWords: string[];
  baseColor: string;
  highlightColor: string;
  highlightScale: number;
}) {
  const highlightSet = new Set(highlightWords.map((word) => normalizeCaptionHighlightToken(word)).filter(Boolean));
  const parts = String(text || "").split(/(\s+)/);
  return parts.map((part, index) => {
    const token = normalizeCaptionHighlightToken(part);
    const isHighlight = token.length > 0 && highlightSet.has(token);
    return (
      <span
        key={`${token || "space"}-${index}`}
        style={
          isHighlight
            ? {
                color: highlightColor,
                display: "inline-block",
                transform: `scale(${highlightScale})`,
                transformOrigin: "50% 65%",
                filter: `drop-shadow(0 0 10px ${toRgba(highlightColor, 0.45)})`,
              }
            : { color: baseColor }
        }
      >
        {part}
      </span>
    );
  });
}

function SlideScene({
  slide,
  mediaSlide,
  branding,
  templateId,
  templateData,
  templateImageEnabled,
  templateImageUrl,
  templateImageLayout,
  templateLayoutApply,
  playbackRate,
  frameOverride,
}: Omit<StudioRemotionCompositionProps, "slides" | "frameDurationsSec" | "durationInFrames" | "fps"> & {
  slide: PreparedSlide;
  mediaSlide?: PreparedSlide;
  frameOverride?: number;
}) {
  const videoConfig = useVideoConfig();
  const { width, height } = videoConfig;
  const frameRate = videoConfig.fps;
  const sequenceFrame = useCurrentFrame();
  const frame =
    typeof frameOverride === "number" && Number.isFinite(frameOverride)
      ? Math.max(0, Math.floor(frameOverride))
      : sequenceFrame;
  const cardTranslate = 0;
  const cardOpacity = 1;
  const lineOpacity = 1;
  const displayText = toDisplayText(slide);
  const imageRadius = 0;
  const slideMedia = inferStudioRenderableMedia(mediaSlide || slide);
  const hasImage = Boolean(slideMedia?.url);
  const effectiveTemplateId: StudioRenderTemplateId =
    templateId === "black" || templateId === "fun-caption" ? templateId : "default";
  const resolvedTemplateData = normalizeStudioTemplateData(effectiveTemplateId, templateData);
  const customLayout = templateImageLayout || DEFAULT_TEMPLATE_IMAGE_LAYOUT;
  const slotApply = templateLayoutApply || DEFAULT_TEMPLATE_LAYOUT_APPLY;
  const usesTemplateBackground = Boolean(templateImageEnabled && templateImageUrl);
  const renderedTitle = String(slide.title || "").trim();
  const [headlineTop, headlineBottom] = splitHeadline(renderedTitle);
  const authoredLines = Array.isArray(slide.lines)
    ? slide.lines.map((line) => String(line || "").trim()).filter((line) => line.length > 0)
    : [];
  const newsHeaderFontPx = scaleByWidth(Math.max(10, Math.min(32, customLayout.headerSize)), width);
  const newsBodyFontPx = scaleByWidth(Math.max(10, Math.min(36, customLayout.bodySize)), width) * ("bodyScale" in resolvedTemplateData ? resolvedTemplateData.bodyScale : 1);
  const newsInfoFontPx = scaleByWidth(Math.max(8, Math.min(24, customLayout.infoSize)), width);
  const titleScale = "titleScale" in resolvedTemplateData ? resolvedTemplateData.titleScale : 1;
  const newsTitleAvailableWidthPx = Math.max(1, customLayout.titleSlot.w * 270 - 12);
  const imageTitleAvailableWidthPx = Math.max(1, customLayout.titleSlot.w * 270 - 16);
  const newsTitleFontPx =
    scaleByWidth(
      fitTitleFontSizePxApprox(renderedTitle, newsTitleAvailableWidthPx / Math.max(0.5, titleScale), customLayout.titleSize, 12),
      width
    ) * titleScale;
  const imageTitleFontPx =
    scaleByWidth(
      fitTitleFontSizePxApprox(renderedTitle, imageTitleAvailableWidthPx / Math.max(0.5, titleScale), customLayout.titleSize, 12),
      width
    ) * titleScale;
  const imageTitleWeight = clampFontWeight(customLayout.titleWeight, 800);
  const imageBodyWeight = clampFontWeight(customLayout.bodyWeight, 400);
  const imageInfoWeight = clampFontWeight(customLayout.infoWeight, 400);
  const newsHeaderTitleWeight = clampFontWeight(customLayout.headerTitleWeight, 600);
  const newsHeaderAccentWeight = clampFontWeight(customLayout.headerAccentWeight, 400);
  const newsTitleWeight = clampFontWeight(customLayout.titleWeight, 700);
  const newsBodyWeight = clampFontWeight(customLayout.bodyWeight, 600);
  const newsInfoWeight = clampFontWeight(customLayout.infoWeight, 400);
  const newsHeaderTitleColor = customLayout.headerTitleColor || "#ffffff";
  const newsHeaderAccentColor = customLayout.headerAccentColor || "rgba(255,255,255,0.9)";
  const newsTitleColor = resolveNewsTextColor("titleColor", customLayout.titleColor, "#18181b");
  const newsInfoColor = resolveNewsTextColor("infoColor", customLayout.infoColor, "#71717a");
  const newsBodyColor = resolveNewsTextColor("bodyColor", customLayout.bodyColor, "#27272a");
  const bodyPaddingPx = scaleByWidth(usesTemplateBackground ? 8 : 6, width);
  const bodyFontPx = usesTemplateBackground ? scaleByWidth(customLayout.bodySize, width) : newsBodyFontPx;
  const bodyLineHeightPx = usesTemplateBackground ? bodyFontPx * 1.35 : bodyFontPx * 1.65;
  const bodyAvailableWidthPx = customLayout.bodySlot.w * width - bodyPaddingPx * 2;
  const renderedLineCount = estimateRenderedLineCount(
    authoredLines.length > 0 ? authoredLines : [displayText],
    bodyAvailableWidthPx,
    bodyFontPx
  );
  const bodyTextHeightPx = bodyFontPx + Math.max(0, renderedLineCount - 1) * bodyLineHeightPx;
  const bodyBottomPx = customLayout.bodySlot.y * height + bodyPaddingPx + bodyTextHeightPx;
  const imageTopPx = bodyBottomPx + scaleByWidth(usesTemplateBackground ? 16 : 22, width);
  const headerBandBottomPx =
    Math.max(
      (customLayout.headerTitleSlot.y + customLayout.headerTitleSlot.h) * height,
      (customLayout.headerAccentSlot.y + customLayout.headerAccentSlot.h) * height
    ) + scaleByWidth(8, width);
  const dynamicImageSlotStyle: CSSProperties = {
    position: "absolute",
    left: `${(customLayout.imageSlot.x * 100).toFixed(4)}%`,
    top: `${((imageTopPx / height) * 100).toFixed(4)}%`,
    width: `${(customLayout.imageSlot.w * 100).toFixed(4)}%`,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    overflow: "visible",
  };
  const slideImageNode = hasImage ? (
    <div
      style={{
        width: "100%",
        margin: "0 auto",
      }}
    >
      {slideMedia?.kind === "video" ? (
        <OffthreadVideo
          src={slideMedia.url}
          muted
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            objectFit: "contain",
          }}
        />
      ) : (
        <Img
          src={slideMedia?.url as string}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            objectFit: "contain",
          }}
        />
      )}
    </div>
  ) : (
    <PlaceholderImage />
  );

  if (effectiveTemplateId === "black") {
    const blackTemplateData = normalizeStudioTemplateData("black", templateData);
    const blackFeatureToggles = getStudioTemplateFeatureToggles("black", blackTemplateData);
    const blackCueLines = blackFeatureToggles.cueMetadata
      ? getFunCaptionCueLines(slide)
      : [parseStudioCaptionCueLine(displayText || "본문을 입력하세요")];
    const { activeCueIndex, cueLocalFrame, cueWindowFrames } = getStudioCaptionCueTiming({
      cues: blackCueLines,
      fps: frameRate,
      defaultDurationSec: blackTemplateData.cueDurationSec,
      frame,
      playbackRate,
    });
    const activeCue = blackCueLines[activeCueIndex] || parseStudioCaptionCueLine(displayText || "본문을 입력하세요");
    const autoCueAnalysis = resolveStudioCaptionCueAnalysis({
      text: activeCue.text,
      cueIndex: activeCueIndex,
      cueCount: blackCueLines.length,
      overrides: activeCue.overrides,
    });
    const resolvedCueOverrides = {
      ...(blackFeatureToggles.autoCaptionFx
        ? buildAutoCaptionCueOverrides({
            text: activeCue.text,
            cueIndex: activeCueIndex,
            cueCount: blackCueLines.length,
            profile: blackTemplateData.autoCaptionProfile,
            intensity: blackTemplateData.autoCaptionIntensity,
            analysis: autoCueAnalysis,
          })
        : {}),
      ...(blackFeatureToggles.cueMetadata ? activeCue.overrides : {}),
    };
    const bodyEntrance = spring({
      frame: Math.max(0, frame - 6),
      fps: frameRate,
      config: {
        damping: 180,
        stiffness: 220,
        mass: 0.84,
      },
    });
    const cueEntrance = spring({
      frame: blackCueLines.length > 1 ? cueLocalFrame : Math.max(0, frame - 4),
      fps: frameRate,
      config: {
        damping: 180,
        stiffness: 220,
        mass: 0.82,
      },
    });
    const bodyAnimation = blackFeatureToggles.cueMetadata
      ? getFunCaptionAnimationState(resolvedCueOverrides.animation || "slide-up", cueEntrance, frame)
      : { opacity: 1, translateY: 0, scale: 1, rotate: 0 };
    const cueExitFrames = Math.max(6, Math.min(16, Math.floor(cueWindowFrames * 0.32)));
    const exitStartFrame = Math.max(0, cueWindowFrames - cueExitFrames);
    const cueExitProgress =
      cueWindowFrames > cueExitFrames && cueLocalFrame >= exitStartFrame
        ? interpolate(cueLocalFrame, [exitStartFrame, cueWindowFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 0;
    const exitState = blackFeatureToggles.cueMetadata
      ? getFunCaptionExitState(resolvedCueOverrides.exitAnimation || "none", cueExitProgress)
      : { opacity: 1, translateY: 0, scale: 1, rotate: 0 };
    const bodyStylePreset = getStudioCaptionStylePreset(resolvedCueOverrides.style || "bold-yellow");
    const bodyGlow = resolvedCueOverrides.glow ?? Math.min(0.72, 0.24 + blackTemplateData.autoCaptionIntensity * 0.34);
    const bodyScale =
      interpolate(bodyEntrance, [0, 1], [0.92, 1]) *
      bodyAnimation.scale *
      exitState.scale *
      (resolvedCueOverrides.scale ?? 1);
    const bodyTranslateY = interpolate(bodyEntrance, [0, 1], [26, 0]) + bodyAnimation.translateY + exitState.translateY;
    const bodyOpacity = interpolate(bodyEntrance, [0, 1], [0, 1]) * bodyAnimation.opacity * exitState.opacity;
    const bodyAlign = resolvedCueOverrides.align || "left";

    return (
      <AbsoluteFill
        style={{
          background: "#000000",
          color: "#ffffff",
          fontFamily: branding.fontFamily,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: `${scaleByWidth(20, width)}px ${scaleByWidth(22, width)}px ${scaleByWidth(26, width)}px`,
            display: "flex",
            flexDirection: "column",
            gap: scaleByWidth(18, width),
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: scaleByWidth(4, width),
              lineHeight: 1.02,
              letterSpacing: "-0.05em",
              fontWeight: 900,
              textAlign: "center",
            }}
          >
            <div
              style={{
                  fontSize: scaleByWidth(30, width),
                  color: "#ffffff",
                textShadow: "0 3px 10px rgba(0,0,0,0.38)",
                wordBreak: "keep-all",
              }}
            >
              {headlineTop}
            </div>
            {headlineBottom ? (
              <div
                style={{
                  fontSize: scaleByWidth(31, width) * ("titleScale" in resolvedTemplateData ? resolvedTemplateData.titleScale : 1),
                  color: "accentColor" in resolvedTemplateData ? resolvedTemplateData.accentColor : "#ffe03e",
                  textShadow: "0 3px 10px rgba(0,0,0,0.34)",
                  wordBreak: "keep-all",
                }}
              >
                {headlineBottom}
              </div>
            ) : null}
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              borderRadius: scaleByWidth("mediaRadius" in resolvedTemplateData ? resolvedTemplateData.mediaRadius : 14, width),
              overflow: "hidden",
              background: "#111111",
              boxShadow: "0 16px 32px rgba(0,0,0,0.35)",
            }}
          >
            {slideMedia?.kind === "video" ? (
              <OffthreadVideo
                src={slideMedia.url}
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : hasImage ? (
              <Img
                src={slideMedia?.url as string}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <PlaceholderImage />
            )}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.16) 100%)",
              }}
            />
          </div>

          <div
            style={{
              fontSize: scaleByWidth(20, width) * ("bodyScale" in resolvedTemplateData ? resolvedTemplateData.bodyScale : 1),
              fontWeight: 800,
              lineHeight: 1.28,
              letterSpacing: "-0.03em",
              textAlign: bodyAlign,
              wordBreak: "keep-all",
              whiteSpace: "pre-line",
              textShadow: "0 3px 12px rgba(0,0,0,0.42)",
              padding: `0 ${scaleByWidth(4, width)}px`,
              minHeight: scaleByWidth(96, width),
            }}
          >
            <span
              style={{
                display: "inline-block",
                opacity: bodyOpacity,
                transform: `translateY(${bodyTranslateY}px) scale(${bodyScale}) rotate(${bodyAnimation.rotate + exitState.rotate}deg)`,
                transformOrigin: bodyAlign === "center" ? "50% 60%" : "0% 60%",
                color: resolvedCueOverrides.color || "#ffffff",
                textShadow: [
                  `0 0 ${Math.round(8 + 18 * bodyGlow)}px rgba(255,255,255,${Math.max(0.16, bodyGlow * 0.42)})`,
                  "0 3px 12px rgba(0,0,0,0.42)",
                ].join(", "),
                WebkitTextStroke: `${Math.max(0, resolvedCueOverrides.strokeWidth ?? 0)}px ${resolvedCueOverrides.strokeColor || bodyStylePreset.strokeColor}`,
                background: resolvedCueOverrides.background || "transparent",
                borderRadius: bodyStylePreset.borderRadius,
                padding: resolvedCueOverrides.background ? bodyStylePreset.padding : undefined,
              }}
            >
              {blackFeatureToggles.autoCaptionFx && blackTemplateData.autoHighlightEnabled
                ? renderFunCaptionHighlightedText({
                    text: activeCue.text,
                    highlightWords: autoCueAnalysis.highlightWords,
                    baseColor: resolvedCueOverrides.color || "#ffffff",
                    highlightColor: blackTemplateData.autoHighlightColor || blackTemplateData.accentColor,
                    highlightScale: blackTemplateData.autoHighlightScale,
                  })
                : activeCue.text || displayText}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (effectiveTemplateId === "fun-caption") {
    const funTemplateData = normalizeStudioTemplateData("fun-caption", templateData);
    const funFeatureToggles = getStudioTemplateFeatureToggles("fun-caption", funTemplateData);
    const topCaptionText = renderedTitle || "상단 캡션을 입력하세요";
    const cueLines =
      funFeatureToggles.captionFeature && funFeatureToggles.cueMetadata
        ? getFunCaptionCueLines(slide)
        : [parseStudioCaptionCueLine(displayText || "중앙 자막을 입력하세요")];
    const { activeCueIndex, cueLocalFrame, cueWindowFrames } = getStudioCaptionCueTiming({
      cues: cueLines,
      fps: frameRate,
      defaultDurationSec: funTemplateData.cueDurationSec,
      frame,
      playbackRate,
    });
    const activeCue = cueLines[activeCueIndex] || parseStudioCaptionCueLine(displayText || "중앙 자막을 입력하세요");
    const autoCueAnalysis = resolveStudioCaptionCueAnalysis({
      text: activeCue.text,
      cueIndex: activeCueIndex,
      cueCount: cueLines.length,
      overrides: activeCue.overrides,
    });
    const resolvedCueOverrides = normalizeStudioCaptionCueOverrides({
      ...(funFeatureToggles.autoCaptionFx
        ? buildAutoCaptionCueOverrides({
            text: activeCue.text,
            cueIndex: activeCueIndex,
            cueCount: cueLines.length,
            profile: funTemplateData.autoCaptionProfile,
            intensity: funTemplateData.autoCaptionIntensity,
            analysis: autoCueAnalysis,
          })
        : {}),
      ...(funFeatureToggles.cueMetadata ? activeCue.overrides : {}),
    });
    const topCaptionEntrance = spring({
      frame,
      fps: frameRate,
      config: {
        damping: 200,
        stiffness: 240,
        mass: 0.9,
      },
    });
    const mainCaptionEntrance = spring({
      frame: Math.max(0, frame - 8),
      fps: frameRate,
      config: {
        damping: 170,
        stiffness: 220,
        mass: 0.82,
      },
    });
    const cueEntrance = spring({
      frame: cueLines.length > 1 ? cueLocalFrame : Math.max(0, frame - 4),
      fps: frameRate,
      config: {
        damping: 180,
        stiffness: 220,
        mass: 0.82,
      },
    });
    const mainCaptionPulse = interpolate(frame, [0, 8, 16, 28], [0.92, 1.06, 0.995, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const topCaptionTranslateY = interpolate(topCaptionEntrance, [0, 1], [-28, 0]);
    const topCaptionOpacity = interpolate(topCaptionEntrance, [0, 1], [0, 1]);
    const cueAlign = resolvedCueOverrides.align || funTemplateData.mainCaptionAlign;
    const cueY = resolvedCueOverrides.y ?? funTemplateData.mainCaptionY;
    const cueScale = resolvedCueOverrides.scale ?? 1;
    const cueGlow = resolvedCueOverrides.glow ?? funTemplateData.mainCaptionGlow;
    const cueStrokeWidth = resolvedCueOverrides.strokeWidth ?? funTemplateData.mainCaptionStrokeWidth;
    const animationState = funFeatureToggles.captionFeature
      ? getFunCaptionAnimationState(resolvedCueOverrides.animation || funTemplateData.animationPreset, cueEntrance, frame)
      : { opacity: 1, translateY: 0, scale: 1, rotate: 0 };
    const cueExitFrames = Math.max(6, Math.min(16, Math.floor(cueWindowFrames * 0.32)));
    const exitStartFrame = Math.max(0, cueWindowFrames - cueExitFrames);
    const cueExitProgress =
      cueWindowFrames > cueExitFrames && cueLocalFrame >= exitStartFrame
        ? interpolate(cueLocalFrame, [exitStartFrame, cueWindowFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 0;
    const exitState =
      funFeatureToggles.captionFeature && funFeatureToggles.cueMetadata
        ? getFunCaptionExitState(resolvedCueOverrides.exitAnimation || "none", cueExitProgress)
        : { opacity: 1, translateY: 0, scale: 1, rotate: 0 };
    const stylePreset = getStudioCaptionStylePreset(resolvedCueOverrides.style || funTemplateData.captionStyle);
    const mainCaptionTranslateY =
      interpolate(mainCaptionEntrance, [0, 1], [52, 0]) + animationState.translateY + exitState.translateY;
    const mainCaptionOpacity = interpolate(mainCaptionEntrance, [0, 1], [0, 1]) * animationState.opacity * exitState.opacity;
    const mainCaptionScale =
      interpolate(mainCaptionEntrance, [0, 1], [0.84, 1]) * mainCaptionPulse * animationState.scale * cueScale * exitState.scale;

    return (
      <AbsoluteFill
        style={{
          background: "#05070a",
          color: "#ffffff",
          fontFamily: branding.fontFamily,
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          {slideMedia?.kind === "video" ? (
            <OffthreadVideo
              src={slideMedia.url}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : hasImage ? (
            <Img
              src={slideMedia?.url as string}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <PlaceholderImage />
          )}
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(0,0,0,${Math.max(0.1, funTemplateData.overlayStrength * 0.55)}) 0%, rgba(0,0,0,${funTemplateData.overlayStrength}) 55%, rgba(0,0,0,${Math.min(0.78, funTemplateData.overlayStrength + 0.16)}) 100%)`,
          }}
        />

        {funFeatureToggles.overlayFeature ? (
          <OverlayFeatureLayer
            preset={funTemplateData.overlayPreset}
            placement={funTemplateData.overlayPlacement}
            opacity={funTemplateData.overlayOpacity}
            scale={funTemplateData.overlayScale}
            density={funTemplateData.overlayDensity}
            frame={frame}
            width={width}
            height={height}
          />
        ) : null}

        {funFeatureToggles.captionFeature ? (
          <div
            style={{
              position: "absolute",
              top: scaleByWidth(funTemplateData.topCaptionY, width),
              left: scaleByWidth(18, width),
              right: scaleByWidth(18, width),
              display: "flex",
              justifyContent: funTemplateData.topCaptionAlign === "center" ? "center" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: `${funTemplateData.captionMaxWidth}%`,
                padding: `${scaleByWidth(8, width)}px ${scaleByWidth(12, width)}px`,
                borderRadius: scaleByWidth(12, width),
                background: toRgba(funTemplateData.topCaptionBgColor, funTemplateData.topCaptionBgOpacity),
                color: funTemplateData.topCaptionTextColor,
                fontSize: scaleByWidth(15, width) * funTemplateData.topCaptionScale,
                fontWeight: 700,
                lineHeight: 1.35,
                letterSpacing: "-0.02em",
                wordBreak: "keep-all",
                boxShadow: "0 12px 24px rgba(0,0,0,0.28)",
                transform: `translateY(${topCaptionTranslateY}px)`,
                opacity: topCaptionOpacity,
                textAlign: funTemplateData.topCaptionAlign,
              }}
            >
              {topCaptionText}
            </div>
          </div>
        ) : null}

        {funFeatureToggles.captionFeature ? (
          <div
            style={{
              position: "absolute",
              left: scaleByWidth(24, width),
              right: scaleByWidth(24, width),
              top: `${cueY}%`,
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: cueAlign === "left" ? "flex-start" : "center",
              textAlign: cueAlign,
            }}
          >
            <div
              style={{
                fontSize: scaleByWidth(34, width) * funTemplateData.mainCaptionScale,
                fontWeight: 900,
                lineHeight: funTemplateData.captionLineHeight,
                letterSpacing: "-0.06em",
                whiteSpace: "pre-line",
                wordBreak: "keep-all",
                transform: `translateY(${mainCaptionTranslateY}px) scale(${mainCaptionScale})`,
                opacity: mainCaptionOpacity,
                maxWidth: `${funTemplateData.captionMaxWidth}%`,
              }}
            >
              <span
                style={{
                  color: resolvedCueOverrides.color || funTemplateData.mainCaptionColor || stylePreset.color,
                  textShadow: [
                    `0 0 ${Math.round(10 + 26 * cueGlow)}px rgba(${stylePreset.glowColor}, ${Math.max(0.15, cueGlow)})`,
                    `0 4px 14px ${stylePreset.shadowColor}`,
                  ].join(", "),
                  WebkitTextStroke: `${Math.max(0, cueStrokeWidth || stylePreset.strokeWidth)}px ${resolvedCueOverrides.strokeColor || funTemplateData.mainCaptionStrokeColor || stylePreset.strokeColor}`,
                  padding: stylePreset.padding,
                  borderRadius: stylePreset.borderRadius,
                  background: resolvedCueOverrides.background || stylePreset.background,
                  display: "inline-block",
                  transform: `rotate(${animationState.rotate + exitState.rotate}deg)`,
                }}
              >
                {funFeatureToggles.autoCaptionFx && funTemplateData.autoHighlightEnabled
                  ? renderFunCaptionHighlightedText({
                      text: activeCue.text,
                      highlightWords: autoCueAnalysis.highlightWords,
                      baseColor: resolvedCueOverrides.color || funTemplateData.mainCaptionColor || stylePreset.color,
                      highlightColor: funTemplateData.autoHighlightColor,
                      highlightScale: funTemplateData.autoHighlightScale,
                    })
                  : activeCue.text}
              </span>
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  const defaultTemplateData = normalizeStudioTemplateData("default", templateData);
  const defaultFeatureToggles = getStudioTemplateFeatureToggles("default", defaultTemplateData);
  const defaultCueLines = defaultFeatureToggles.cueMetadata
    ? getFunCaptionCueLines(slide)
    : [parseStudioCaptionCueLine(displayText || "—")];
  const { activeCueIndex: defaultCueIndex, cueLocalFrame: defaultCueLocalFrame, cueWindowFrames: defaultCueWindowFrames } = getStudioCaptionCueTiming({
    cues: defaultCueLines,
    fps: frameRate,
    defaultDurationSec: defaultTemplateData.cueDurationSec,
    frame,
    playbackRate,
  });
  const defaultActiveCue = defaultCueLines[defaultCueIndex] || parseStudioCaptionCueLine(displayText || "—");
  const defaultAutoCueAnalysis = resolveStudioCaptionCueAnalysis({
    text: defaultActiveCue.text,
    cueIndex: defaultCueIndex,
    cueCount: defaultCueLines.length,
    overrides: defaultActiveCue.overrides,
  });
  const defaultResolvedCueOverrides = {
    ...(defaultFeatureToggles.autoCaptionFx
      ? buildAutoCaptionCueOverrides({
          text: defaultActiveCue.text,
          cueIndex: defaultCueIndex,
          cueCount: defaultCueLines.length,
          profile: defaultTemplateData.autoCaptionProfile,
          intensity: defaultTemplateData.autoCaptionIntensity,
          analysis: defaultAutoCueAnalysis,
        })
      : {}),
    ...(defaultFeatureToggles.cueMetadata ? defaultActiveCue.overrides : {}),
  };
  const defaultCueEntrance = defaultFeatureToggles.cueMetadata
    ? spring({
        frame: defaultCueLines.length > 1 ? defaultCueLocalFrame : Math.max(0, frame - 4),
        fps: frameRate,
        config: {
          damping: 190,
          stiffness: 220,
          mass: 0.85,
        },
      })
    : 1;
  const defaultBodyAnimation = defaultFeatureToggles.cueMetadata
    ? getFunCaptionAnimationState(defaultResolvedCueOverrides.animation || "slide-up", defaultCueEntrance, frame)
    : { opacity: 1, translateY: 0, scale: 1, rotate: 0 };
  const defaultCueExitFrames = Math.max(6, Math.min(16, Math.floor(defaultCueWindowFrames * 0.32)));
  const defaultExitStartFrame = Math.max(0, defaultCueWindowFrames - defaultCueExitFrames);
  const defaultCueExitProgress =
    defaultCueWindowFrames > defaultCueExitFrames && defaultCueLocalFrame >= defaultExitStartFrame
      ? interpolate(defaultCueLocalFrame, [defaultExitStartFrame, defaultCueWindowFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;
  const defaultExitState = defaultFeatureToggles.cueMetadata
    ? getFunCaptionExitState(defaultResolvedCueOverrides.exitAnimation || "none", defaultCueExitProgress)
    : { opacity: 1, translateY: 0, scale: 1, rotate: 0 };
  const defaultBodyTextNode =
    defaultFeatureToggles.autoCaptionFx && defaultTemplateData.autoHighlightEnabled
      ? renderFunCaptionHighlightedText({
          text: defaultActiveCue.text || displayText,
          highlightWords: defaultAutoCueAnalysis.highlightWords,
          baseColor: newsBodyColor,
          highlightColor: defaultTemplateData.autoHighlightColor,
          highlightScale: defaultTemplateData.autoHighlightScale,
        })
      : defaultActiveCue.text || displayText;
  const defaultBodyOpacity = defaultBodyAnimation.opacity * defaultExitState.opacity;
  const defaultBodyTransform = `translateY(${defaultBodyAnimation.translateY + defaultExitState.translateY}px) scale(${
    defaultBodyAnimation.scale * defaultExitState.scale * (defaultResolvedCueOverrides.scale ?? 1)
  }) rotate(${defaultBodyAnimation.rotate + defaultExitState.rotate}deg)`;

  return (
    <AbsoluteFill
      style={{
        background: templateImageEnabled && templateImageUrl ? "#000000" : "#ffffff",
        fontFamily: branding.fontFamily,
        transform: `translateY(${cardTranslate}px)`,
        opacity: cardOpacity,
      }}
    >
      {usesTemplateBackground ? (
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          <Img
            src={templateImageUrl || ""}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "50% 50%",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.22) 100%)",
            }}
          />
          {slotApply.title ? (
            <div style={{ ...layoutRectStyle(customLayout.titleSlot), padding: scaleByWidth(8, width), overflow: "hidden" }}>
              <h3
                style={{
                  margin: 0,
                  color: customLayout.titleColor,
                  fontSize: imageTitleFontPx,
                  fontWeight: imageTitleWeight,
                  lineHeight: 1.15,
                  textAlign: customLayout.titleAlign,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "clip",
                  wordBreak: "keep-all",
                }}
              >
                {renderedTitle}
              </h3>
            </div>
          ) : null}
          {slotApply.info ? (
            <div style={{ ...layoutRectStyle(customLayout.infoSlot), padding: scaleByWidth(8, width), overflow: "hidden" }}>
              <p
                style={{
                  margin: 0,
                  color: customLayout.infoColor,
                  fontSize: scaleByWidth(customLayout.infoSize, width),
                  fontWeight: imageInfoWeight,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {branding.infoLineText}
              </p>
            </div>
          ) : null}
          {slotApply.image ? (
            <div
              style={{
                ...dynamicImageSlotStyle,
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxHeight: "100%",
                  overflow: "hidden",
                  borderRadius: imageRadius,
                  position: "relative",
                }}
              >
                {slideImageNode}
              </div>
            </div>
          ) : null}
          {slotApply.body ? (
            <div style={{ ...layoutRectStyle(customLayout.bodySlot), padding: scaleByWidth(8, width), overflow: "hidden" }}>
              <p
                style={{
                  margin: 0,
                  color: customLayout.bodyColor,
                  fontSize: scaleByWidth(customLayout.bodySize, width),
                  fontWeight: imageBodyWeight,
                  lineHeight: 1.35,
                  textAlign: customLayout.bodyAlign,
                  whiteSpace: "pre-line",
                  wordBreak: "keep-all",
                  opacity: lineOpacity,
                }}
              >
                {displayText}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: "#ffffff", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: Math.max(scaleByWidth(42, width), headerBandBottomPx),
              backgroundColor: branding.headerColor,
            }}
          />
          <div style={{ ...layoutRectStyle(customLayout.headerTitleSlot), padding: scaleByWidth(6, width), overflow: "hidden" }}>
            <p
              style={{
                margin: 0,
                fontSize: newsHeaderFontPx,
                fontWeight: newsHeaderTitleWeight,
                color: newsHeaderTitleColor,
                letterSpacing: "0.02em",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {branding.headerTitle}
            </p>
          </div>
          <div style={{ ...layoutRectStyle(customLayout.headerAccentSlot), padding: scaleByWidth(6, width), overflow: "hidden" }}>
            <p
              style={{
                margin: 0,
                fontSize: Math.max(scaleByWidth(10, width), newsHeaderFontPx - scaleByWidth(1, width)),
                color: newsHeaderAccentColor,
                fontWeight: newsHeaderAccentWeight,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "right",
              }}
            >
              {branding.headerAccentText || ""}
            </p>
          </div>
          <div style={{ ...layoutRectStyle(customLayout.titleSlot), padding: scaleByWidth(6, width), overflow: "hidden" }}>
            <h3
              style={{
                margin: 0,
                fontSize: newsTitleFontPx,
                fontWeight: newsTitleWeight,
                color: newsTitleColor,
                lineHeight: 1.2,
                textAlign: customLayout.titleAlign,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "clip",
                wordBreak: "keep-all",
              }}
            >
              {renderedTitle}
            </h3>
          </div>
          <div style={{ ...layoutRectStyle(customLayout.infoSlot), padding: scaleByWidth(6, width), overflow: "hidden" }}>
            <p
              style={{
                margin: 0,
                fontSize: newsInfoFontPx,
                color: newsInfoColor,
                fontWeight: newsInfoWeight,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {branding.infoLineText}
            </p>
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              width: `${(customLayout.infoSlot.w * 100).toFixed(4)}%`,
              transform: "translateX(-50%)",
              top: `${((customLayout.infoSlot.y + customLayout.infoSlot.h) * 100 + 1.2).toFixed(4)}%`,
              borderTop: "2px solid #e4e4e7",
            }}
          />
          {slide.layout === "photo+body" ? (
            <>
              <div style={{ ...layoutRectStyle(customLayout.bodySlot), padding: scaleByWidth(6, width), overflow: "hidden" }}>
                <p
                  style={{
                    margin: 0,
                    whiteSpace: "pre-line",
                    textWrap: "pretty",
                    wordBreak: "keep-all",
                    fontSize: newsBodyFontPx,
                    fontWeight: newsBodyWeight,
                    color: newsBodyColor,
                    textAlign: customLayout.bodyAlign,
                    lineHeight: 1.65,
                    opacity: lineOpacity * defaultBodyOpacity,
                    transform: defaultBodyTransform,
                    transformOrigin: customLayout.bodyAlign === "center" ? "50% 60%" : "0% 60%",
                    textShadow: defaultFeatureToggles.autoCaptionFx
                      ? `0 0 ${Math.round(4 + 12 * defaultTemplateData.autoCaptionIntensity)}px ${toRgba(defaultTemplateData.autoHighlightColor, 0.14)}`
                      : undefined,
                  }}
                >
                  {defaultBodyTextNode}
                </p>
              </div>
              <div
                style={{
                  ...dynamicImageSlotStyle,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    borderRadius: imageRadius,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {slideImageNode}
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...layoutRectStyle(customLayout.bodySlot), padding: scaleByWidth(6, width), overflow: "hidden" }}>
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-line",
                  textWrap: "pretty",
                  wordBreak: "keep-all",
                  fontSize: newsBodyFontPx,
                  fontWeight: newsBodyWeight,
                  color: newsBodyColor,
                  textAlign: customLayout.bodyAlign,
                  lineHeight: 1.65,
                  opacity: lineOpacity * defaultBodyOpacity,
                  transform: defaultBodyTransform,
                  transformOrigin: customLayout.bodyAlign === "center" ? "50% 60%" : "0% 60%",
                  textShadow: defaultFeatureToggles.autoCaptionFx
                    ? `0 0 ${Math.round(4 + 12 * defaultTemplateData.autoCaptionIntensity)}px ${toRgba(defaultTemplateData.autoHighlightColor, 0.14)}`
                    : undefined,
                }}
              >
                {defaultBodyTextNode}
              </p>
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: scaleByWidth(8, width),
              backgroundColor: branding.footerColor,
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
}

function SlideMediaSequence({
  slides,
  frameDurationsSec,
  branding,
  templateId,
  templateData,
  templateImageEnabled,
  templateImageUrl,
  templateImageLayout,
  templateLayoutApply,
  playbackRate,
}: Omit<StudioRemotionCompositionProps, "slides" | "frameDurationsSec" | "durationInFrames" | "fps"> & {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
}) {
  const { fps } = useVideoConfig();
  const localFrame = useCurrentFrame();
  const { activeIndex, stepFrame } = resolveStudioMediaSequenceStep({
    frameDurationsSec,
    fps,
    localFrame,
  });
  const fallbackSlide = slides[slides.length - 1] || slides[0];
  const activeSlide = slides[Math.max(0, Math.min(slides.length - 1, activeIndex))] || fallbackSlide;
  if (!activeSlide) return null;

  return (
    <SlideScene
      slide={activeSlide}
      mediaSlide={slides[0] || activeSlide}
      branding={branding}
      templateId={templateId}
      templateData={templateData}
      templateImageEnabled={templateImageEnabled}
      templateImageUrl={templateImageUrl}
      templateImageLayout={templateImageLayout}
      templateLayoutApply={templateLayoutApply}
      playbackRate={playbackRate}
      frameOverride={stepFrame}
    />
  );
}

export function StudioShortsComposition(props: StudioRemotionCompositionProps) {
  const { fps } = useVideoConfig();
  const sequences = buildStudioMediaSequences({
    slides: props.slides,
    frameDurationsSec: props.frameDurationsSec,
    fps,
    totalFrames: props.durationInFrames,
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
      {sequences.map((sequence) => {
        return (
          <Sequence key={sequence.key} from={sequence.from} durationInFrames={sequence.duration}>
            <SlideMediaSequence
              slides={sequence.slides}
              frameDurationsSec={sequence.frameDurationsSec}
              branding={props.branding}
              templateId={props.templateId}
              templateData={props.templateData}
              templateImageEnabled={props.templateImageEnabled}
              templateImageUrl={props.templateImageUrl}
              templateImageLayout={props.templateImageLayout}
              templateLayoutApply={props.templateLayoutApply}
              playbackRate={props.playbackRate}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function toRgba(hex: string, alpha: number) {
  const normalized = String(hex || "").trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(normalized);
  if (!match) return `rgba(15,23,35,${alpha})`;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

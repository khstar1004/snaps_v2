import type { SlideInput } from "@/types/studio-json";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasFrameMetadata<T extends SlideInput>(slides: T[]): boolean {
  if (slides.length === 0) return false;
  return slides.every((slide) => isNumber(slide.groupId) && isNumber(slide.stepIndex));
}

export function explodeSlidesForPop<T extends SlideInput>(slides: T[]): T[] {
  if (hasFrameMetadata(slides)) return slides;

  const expanded: T[] = [];
  for (let groupId = 0; groupId < slides.length; groupId += 1) {
    const slide = slides[groupId];
    const lines = slide.lines.filter((line) => line.trim().length > 0);
    const sourceLines = lines.length > 0 ? lines : [slide.text || ""];
    const imageBeats = Array.isArray(slide.imageBeats) && slide.imageBeats.length > 0
      ? slide.imageBeats
          .filter((beat) => Number.isFinite(beat.startLineIndex) && beat.startLineIndex >= 0)
          .slice()
          .sort((left, right) => left.startLineIndex - right.startLineIndex)
      : [];
    const cumulative: string[] = [];
    for (let stepIndex = 0; stepIndex < sourceLines.length; stepIndex += 1) {
      const line = sourceLines[stepIndex].trim();
      if (!line) continue;
      cumulative.push(line);
      const activeBeat = imageBeats.reduce<typeof imageBeats[number] | null>((selected, beat) => {
        if (beat.startLineIndex > stepIndex) return selected;
        return beat;
      }, null);
      const hasActiveBeat = Boolean(activeBeat);
      const clearsVisual = activeBeat?.clearVisual === true;
      const matchedSfxPlan = (slide.sfxPlan || []).find((item) => item.lineIndex === stepIndex);
      const manualCueTag = String(slide.sfxCue?.tag || "").trim();
      const manualCue =
        stepIndex === 0 && slide.sfxCue && manualCueTag
          ? {
              enabled: slide.sfxCue.enabled !== false,
              tag: manualCueTag,
              gainDb: slide.sfxCue.gainDb,
              offsetMs: slide.sfxCue.offsetMs,
              source: slide.sfxCue.source || "manual",
            }
          : undefined;
      expanded.push({
        ...slide,
        text: line,
        lines: [...cumulative],
        imageUrl: hasActiveBeat
          ? clearsVisual
            ? undefined
            : activeBeat?.imageUrl || activeBeat?.resolvedImageUrl
          : slide.imageUrl,
        resolvedImageUrl: hasActiveBeat
          ? clearsVisual
            ? undefined
            : activeBeat?.resolvedImageUrl || activeBeat?.imageUrl
          : slide.resolvedImageUrl,
        resolvedBy: hasActiveBeat ? (clearsVisual ? undefined : activeBeat?.resolvedBy) : slide.resolvedBy,
        imageSelection: hasActiveBeat ? (clearsVisual ? undefined : activeBeat?.imageSelection) : slide.imageSelection,
        mediaUrl: hasActiveBeat ? (clearsVisual ? undefined : activeBeat?.mediaUrl) : slide.mediaUrl,
        mediaKind: hasActiveBeat ? (clearsVisual ? undefined : activeBeat?.mediaKind) : slide.mediaKind,
        imageRequest: hasActiveBeat ? (clearsVisual ? undefined : activeBeat?.imageRequest) : slide.imageRequest,
        imageVariantId: activeBeat?.beatId || `${groupId}:0`,
        imageVariantStartLineIndex: activeBeat?.startLineIndex ?? 0,
        groupId,
        stepIndex,
        sfxCue: manualCue
          ? manualCue
          : matchedSfxPlan
            ? {
              enabled: matchedSfxPlan.enabled !== false,
              tag: matchedSfxPlan.tag,
              gainDb: matchedSfxPlan.gainDb,
              offsetMs: matchedSfxPlan.offsetMs,
              source: matchedSfxPlan.source || "auto",
            }
            : undefined,
      });
    }
  }

  return expanded;
}

import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import type { PreparedSlide, RenderPlan } from "@/types/studio-json";
import type { StudioRenderSfxCue } from "@/types/studio-renderer";

export function buildStudioRenderSfxCues(input: {
  renderPlan?: RenderPlan | null;
  slides: PreparedSlide[];
  playbackRate?: number;
}): StudioRenderSfxCue[] {
  const playbackRate = normalizeStudioPlaybackRate(input.playbackRate);

  const planSfxCues = Array.isArray(input.renderPlan?.sfxCuesResolved)
    ? input.renderPlan.sfxCuesResolved
        .map((cue): StudioRenderSfxCue | null => {
          const tag = String(cue.tag || "").trim();
          if (!tag) return null;
          return {
            cueId: cue.cueId,
            frameIndex: Number.isFinite(cue.frameIndex) ? cue.frameIndex : undefined,
            startMs: Number.isFinite(cue.startMs) ? cue.startMs / playbackRate : undefined,
            enabled: true,
            tag,
            gainDb: cue.gainDb,
            offsetMs: Number.isFinite(cue.offsetMs) ? Number(cue.offsetMs) / playbackRate : cue.offsetMs,
          };
        })
        .filter((cue): cue is StudioRenderSfxCue => Boolean(cue))
    : [];

  const fallbackSlideSfxCues = input.slides
    .map((slide, frameIndex): StudioRenderSfxCue | null => {
      const cue = slide.sfxCue;
      const tag = String(cue?.tag || "").trim();
      if (!cue || cue.enabled === false || !tag) return null;
      return {
        cueId: `${frameIndex}:${tag}`,
        frameIndex,
        enabled: true,
        tag,
        gainDb: cue.gainDb,
        offsetMs: Number.isFinite(cue.offsetMs) ? Number(cue.offsetMs) / playbackRate : cue.offsetMs,
      };
    })
    .filter((cue): cue is StudioRenderSfxCue => Boolean(cue));

  return (planSfxCues.length > 0 ? planSfxCues : fallbackSlideSfxCues).slice(0, 40);
}

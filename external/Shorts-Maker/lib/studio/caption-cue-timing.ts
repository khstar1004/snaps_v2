import { normalizeStudioPlaybackRate } from "./playback-rate";

export type StudioCaptionCueTimingCue = {
  overrides: {
    durationSec?: number;
  };
};

export type StudioCaptionCueTimingResult = {
  activeCueIndex: number;
  cueLocalFrame: number;
  cueWindowFrames: number;
};

export function getStudioCaptionCueTiming({
  cues,
  fps,
  defaultDurationSec,
  frame,
  playbackRate,
}: {
  cues: StudioCaptionCueTimingCue[];
  fps: number;
  defaultDurationSec: number;
  frame: number;
  playbackRate?: number;
}): StudioCaptionCueTimingResult {
  const rate = normalizeStudioPlaybackRate(playbackRate, 1);

  if (cues.length === 0) {
    const fallbackWindow = Math.max(10, Math.floor((fps * defaultDurationSec) / rate));
    return {
      activeCueIndex: 0,
      cueLocalFrame: Math.max(0, frame),
      cueWindowFrames: fallbackWindow,
    };
  }

  const cueWindows = cues.map((cue) =>
    Math.max(6, Math.floor((fps * (cue.overrides.durationSec ?? defaultDurationSec)) / rate))
  );
  let accumulated = 0;

  for (let index = 0; index < cueWindows.length; index += 1) {
    const windowFrames = cueWindows[index] || Math.max(10, Math.floor((fps * defaultDurationSec) / rate));
    if (frame < accumulated + windowFrames) {
      return {
        activeCueIndex: index,
        cueLocalFrame: Math.max(0, frame - accumulated),
        cueWindowFrames: windowFrames,
      };
    }
    accumulated += windowFrames;
  }

  const lastIndex = cueWindows.length - 1;
  return {
    activeCueIndex: lastIndex,
    cueLocalFrame: cueWindows[lastIndex],
    cueWindowFrames: cueWindows[lastIndex],
  };
}

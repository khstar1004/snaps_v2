import assert from "node:assert/strict";
import test from "node:test";
import { STUDIO_PLAYBACK_RATE_MAX } from "./playback-rate";
import { getStudioCaptionCueTiming } from "./caption-cue-timing";

function threeCues(durationSec?: number) {
  return [
    { overrides: { durationSec } },
    { overrides: { durationSec } },
    { overrides: { durationSec } },
  ];
}

test("rate 1.0 characterizes the original (unscaled) behavior", () => {
  const cues = threeCues();
  const fps = 30;
  const defaultDurationSec = 1.35;

  // Window size for each cue at frame 0: floor(30 * 1.35) = 40.
  const first = getStudioCaptionCueTiming({ cues, fps, defaultDurationSec, frame: 0, playbackRate: 1 });
  assert.deepEqual(first, { activeCueIndex: 0, cueLocalFrame: 0, cueWindowFrames: 40 });

  // Frame 40 rolls into the second cue's window.
  const second = getStudioCaptionCueTiming({ cues, fps, defaultDurationSec, frame: 40, playbackRate: 1 });
  assert.deepEqual(second, { activeCueIndex: 1, cueLocalFrame: 0, cueWindowFrames: 40 });

  // Past the end of all cues clamps to the last cue's full window.
  const past = getStudioCaptionCueTiming({ cues, fps, defaultDurationSec, frame: 1000, playbackRate: 1 });
  assert.deepEqual(past, { activeCueIndex: 2, cueLocalFrame: 40, cueWindowFrames: 40 });
});

test("rate 1.5 scales cue windows so all 3 cues fit inside a 3.0s (90-frame) slide", () => {
  const cues = threeCues();
  const fps = 30;
  const defaultDurationSec = 1.35;

  const windows = [0, 1, 2].map((index) => {
    // Probe each cue's window size by evaluating at its expected start frame.
    const frame = index * 27;
    const result = getStudioCaptionCueTiming({ cues, fps, defaultDurationSec, frame, playbackRate: 1.5 });
    return result.cueWindowFrames;
  });

  assert.deepEqual(windows, [27, 27, 27]);
  const totalAtRate1_5 = windows.reduce((a, b) => a + b, 0);
  assert.ok(totalAtRate1_5 <= 90, `expected total window frames <= 90, got ${totalAtRate1_5}`);

  // At rate 1.0 the same 3 cues would NOT fit inside a 90-frame slide -- that is the bug being fixed.
  const totalAtRate1 =
    getStudioCaptionCueTiming({ cues, fps, defaultDurationSec, frame: 0, playbackRate: 1 }).cueWindowFrames * 3;
  assert.ok(totalAtRate1 > 90, `expected total window frames > 90 at rate 1.0, got ${totalAtRate1}`);
});

test("per-cue overrides.durationSec is scaled by playbackRate", () => {
  const cues = threeCues(2);
  const result = getStudioCaptionCueTiming({
    cues,
    fps: 30,
    defaultDurationSec: 1.35,
    frame: 0,
    playbackRate: 2,
  });
  // floor(30 * 2 / 2) = 30
  assert.equal(result.cueWindowFrames, 30);
});

test("empty-cues fallback path is scaled by playbackRate", () => {
  const result = getStudioCaptionCueTiming({
    cues: [],
    fps: 30,
    defaultDurationSec: 2,
    frame: 0,
    playbackRate: 2,
  });
  // floor(30 * 2 / 2) = 30
  assert.deepEqual(result, { activeCueIndex: 0, cueLocalFrame: 0, cueWindowFrames: 30 });
});

test("the 6-frame floor still applies for tiny durations at a high rate", () => {
  const cues = threeCues(0.2);
  const result = getStudioCaptionCueTiming({
    cues,
    fps: 30,
    defaultDurationSec: 1.35,
    frame: 0,
    playbackRate: 3,
  });
  // floor(30 * 0.2 / 3) = floor(2) = 2, clamped up to the 6-frame floor.
  assert.equal(result.cueWindowFrames, 6);
});

test("absent or invalid playbackRate leaves cue windows unscaled", () => {
  const cues = threeCues();
  const unscaled = getStudioCaptionCueTiming({ cues, fps: 30, defaultDurationSec: 1.35, frame: 0, playbackRate: 1 });

  // A missing rate means the caller could not tell us; identity is the only safe
  // assumption, and it matches remotion/Root.tsx defaultProps.
  assert.deepEqual(getStudioCaptionCueTiming({ cues, fps: 30, defaultDurationSec: 1.35, frame: 0 }), unscaled);
  assert.deepEqual(
    getStudioCaptionCueTiming({ cues, fps: 30, defaultDurationSec: 1.35, frame: 0, playbackRate: Number.NaN }),
    unscaled
  );

  // A finite rate is still clamped by normalizeStudioPlaybackRate.
  assert.deepEqual(
    getStudioCaptionCueTiming({ cues, fps: 30, defaultDurationSec: 1.35, frame: 0, playbackRate: 99 }),
    getStudioCaptionCueTiming({ cues, fps: 30, defaultDurationSec: 1.35, frame: 0, playbackRate: STUDIO_PLAYBACK_RATE_MAX })
  );
});

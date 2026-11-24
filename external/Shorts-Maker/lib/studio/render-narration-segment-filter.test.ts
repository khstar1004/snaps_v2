import assert from "node:assert/strict";
import test from "node:test";
import {
  buildServerNarrationSegmentInputFilter,
  normalizeServerNarrationSegment,
} from "@/lib/studio/render-native-server";
import {
  buildClientNarrationSegmentInputFilter,
  normalizeClientNarrationSegment,
} from "@/lib/studio/render-shorts-video";
import type { StudioRenderNarrationSegment } from "@/types/studio-renderer";

const baseSegment: StudioRenderNarrationSegment = {
  segmentId: "segment-1",
  groupId: 0,
  audioBase64: "YXVkaW8=",
  durationMs: 1250,
  trimStartMs: 120,
  trimEndMs: 1370,
};

test("client and native narration filters do not add artificial silence for a 0ms pause", () => {
  const expected = "[0:a]atrim=start=0.120:end=1.370,atrim=duration=1.250,asetpts=PTS-STARTPTS[s0]";

  assert.equal(buildServerNarrationSegmentInputFilter({ ...baseSegment, pauseAfterMs: 0 }, 0), expected);
  assert.equal(buildClientNarrationSegmentInputFilter({ ...baseSegment, pauseAfterMs: 0 }, 0), expected);
  assert.doesNotMatch(expected, /apad/);
});

test("client and native narration filters append only the requested pause and cap the total duration", () => {
  const segment: StudioRenderNarrationSegment = {
    ...baseSegment,
    durationMs: 1750,
    pauseAfterMs: 500,
  };
  const expected =
    "[2:a]atrim=start=0.120:end=1.370,apad=pad_dur=0.500,atrim=duration=1.750,asetpts=PTS-STARTPTS[s2]";

  assert.equal(buildServerNarrationSegmentInputFilter(segment, 2), expected);
  assert.equal(buildClientNarrationSegmentInputFilter(segment, 2), expected);
});

test("client and native narration normalization preserve and clamp pauseAfterMs to 0..3000", () => {
  const normalizers = [normalizeServerNarrationSegment, normalizeClientNarrationSegment];

  for (const normalize of normalizers) {
    assert.equal(normalize({ ...baseSegment, pauseAfterMs: 480.9 }, 0)?.pauseAfterMs, 480);
    assert.equal(normalize({ ...baseSegment, pauseAfterMs: -20 }, 0)?.pauseAfterMs, 0);
    assert.equal(normalize({ ...baseSegment, pauseAfterMs: 5000 }, 0)?.pauseAfterMs, 3000);
    assert.equal(normalize({ ...baseSegment, pauseAfterMs: undefined }, 0)?.pauseAfterMs, 0);
    assert.equal(normalize({ ...baseSegment, durationMs: 1730, pauseAfterMs: 480 }, 0)?.durationMs, 1730);
  }
});

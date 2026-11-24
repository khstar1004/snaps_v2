import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STUDIO_PLAYBACK_RATE,
  normalizeStudioPlaybackRate,
  STUDIO_PLAYBACK_RATE_MAX,
  STUDIO_PLAYBACK_RATE_MIN,
} from "./playback-rate";

test("normalizeStudioPlaybackRate clamps explicit values to the editor range", () => {
  assert.equal(normalizeStudioPlaybackRate(0.2), STUDIO_PLAYBACK_RATE_MIN);
  assert.equal(normalizeStudioPlaybackRate(5), STUDIO_PLAYBACK_RATE_MAX);
  assert.equal(normalizeStudioPlaybackRate("1.8"), 1.8);
});

test("normalizeStudioPlaybackRate falls back for blank or invalid values", () => {
  assert.equal(normalizeStudioPlaybackRate(undefined), DEFAULT_STUDIO_PLAYBACK_RATE);
  assert.equal(normalizeStudioPlaybackRate(""), DEFAULT_STUDIO_PLAYBACK_RATE);
  assert.equal(normalizeStudioPlaybackRate("invalid", 1.7), 1.7);
});

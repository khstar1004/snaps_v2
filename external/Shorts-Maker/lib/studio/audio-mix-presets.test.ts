import assert from "node:assert/strict";
import test from "node:test";
import {
  getStudioAudioMixPreset,
  normalizeStudioBgmVolume,
} from "./audio-mix-presets";

test("normalizeStudioBgmVolume clamps explicit values to the renderer range", () => {
  assert.equal(normalizeStudioBgmVolume(-1), 0);
  assert.equal(normalizeStudioBgmVolume(0.42), 0.42);
  assert.equal(normalizeStudioBgmVolume(2), 1);
});

test("normalizeStudioBgmVolume falls back to the selected mix preset", () => {
  assert.equal(normalizeStudioBgmVolume(undefined, "impact"), getStudioAudioMixPreset("impact").bgmVolume);
  assert.equal(normalizeStudioBgmVolume(null, "impact"), getStudioAudioMixPreset("impact").bgmVolume);
  assert.equal(normalizeStudioBgmVolume("not-a-number", "balanced"), getStudioAudioMixPreset("balanced").bgmVolume);
});

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PUBLISH_BGM_VOLUME, DEFAULT_PUBLISH_PLAYBACK_RATE } from "@/lib/publish/category-metadata";
import { buildStudioBootstrapMetadataMap, mergeStudioBootstrapMetadata } from "@/lib/studio/bootstrap-metadata";

test("studio bootstrap metadata defaults BGM volume from voice-focus preset", () => {
  const metadata = mergeStudioBootstrapMetadata("news", null);

  assert.equal(metadata.bgmVolume, DEFAULT_PUBLISH_BGM_VOLUME);
  assert.equal(metadata.bgmVolume, 0.28);
  assert.equal(metadata.playbackRate, DEFAULT_PUBLISH_PLAYBACK_RATE);
  assert.equal(metadata.playbackRate, 1.5);
});

test("studio bootstrap metadata clamps stored BGM volume and playback rate", () => {
  const metadata = mergeStudioBootstrapMetadata("news", {
    description: "desc",
    tags: [],
    ttsVoiceId: "",
    bgmTrackId: "",
    mixPresetId: "voice-focus",
    bgmVolume: 2,
    playbackRate: 7,
    templateNotes: "",
  });

  assert.equal(metadata.bgmVolume, 1);
  assert.equal(metadata.playbackRate, 3);
});

test("studio bootstrap metadata derives a missing BGM volume from the stored mix preset", () => {
  const metadata = mergeStudioBootstrapMetadata("news", {
    description: "desc",
    tags: [],
    ttsVoiceId: "",
    bgmTrackId: "",
    mixPresetId: "impact",
    templateNotes: "",
  });

  assert.equal(metadata.bgmVolume, 0.34);
});

test("studio bootstrap includes dynamic content-profile metadata in project defaults", () => {
  const metadataMap = buildStudioBootstrapMetadataMap({
    categories: ["AI Center"],
    storedMetadataMap: {
      "AI Center": {
        ...mergeStudioBootstrapMetadata("AI Center", null),
        bgmEnabled: false,
        sfxEnabled: false,
        playbackRate: 1.8,
      },
    },
  });

  assert.equal(metadataMap["AI Center"]?.bgmEnabled, false);
  assert.equal(metadataMap["AI Center"]?.sfxEnabled, false);
  assert.equal(metadataMap["AI Center"]?.playbackRate, 1.8);
});

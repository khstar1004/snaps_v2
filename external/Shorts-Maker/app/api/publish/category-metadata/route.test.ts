import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PUBLISH_BGM_VOLUME, DEFAULT_PUBLISH_PLAYBACK_RATE } from "@/lib/publish/category-metadata";
import {
  buildPublishCategoryMetadataMap,
  mergePublishCategoryMetadata,
  resolvePublishCategoryBgmVolumeUpdate,
} from "@/lib/publish/category-metadata-merge";

test("publish category metadata route defaults BGM volume from voice-focus preset", () => {
  const metadata = mergePublishCategoryMetadata("news", null, "default");

  assert.equal(metadata.bgmVolume, DEFAULT_PUBLISH_BGM_VOLUME);
  assert.equal(metadata.bgmVolume, 0.28);
  assert.equal(metadata.playbackRate, DEFAULT_PUBLISH_PLAYBACK_RATE);
  assert.equal(metadata.playbackRate, 1.5);
});

test("publish category metadata route clamps stored BGM volume and playback rate", () => {
  const high = mergePublishCategoryMetadata(
    "news",
    {
      description: "desc",
      tags: [],
      ttsVoiceId: "",
      bgmTrackId: "",
      mixPresetId: "voice-focus",
      bgmVolume: 1.5,
      playbackRate: 9,
      templateNotes: "",
    },
    "default"
  );
  const low = mergePublishCategoryMetadata(
    "news",
    {
      description: "desc",
      tags: [],
      ttsVoiceId: "",
      bgmTrackId: "",
      mixPresetId: "voice-focus",
      bgmVolume: -0.2,
      playbackRate: 0.1,
      templateNotes: "",
    },
    "default"
  );

  assert.equal(high.bgmVolume, 1);
  assert.equal(low.bgmVolume, 0);
  assert.equal(high.playbackRate, 3);
  assert.equal(low.playbackRate, 0.8);
});

test("publish category metadata route keeps the legacy preset volume when no direct value is stored", () => {
  const metadata = mergePublishCategoryMetadata(
    "news",
    {
      description: "desc",
      tags: [],
      ttsVoiceId: "",
      bgmTrackId: "",
      mixPresetId: "impact",
      templateNotes: "",
    },
    "default"
  );

  assert.equal(metadata.bgmVolume, 0.34);
});

test("publish category metadata partial preset updates only preserve an explicitly stored direct volume", () => {
  assert.equal(
    resolvePublishCategoryBgmVolumeUpdate({
      currentBgmVolume: 0.28,
      hasBgmVolume: false,
      requestedBgmVolume: undefined,
      hasMixPresetId: true,
      nextMixPresetId: "impact",
      storedHasExplicitBgmVolume: false,
    }),
    0.34
  );
  assert.equal(
    resolvePublishCategoryBgmVolumeUpdate({
      currentBgmVolume: 0.47,
      hasBgmVolume: false,
      requestedBgmVolume: undefined,
      hasMixPresetId: true,
      nextMixPresetId: "impact",
      storedHasExplicitBgmVolume: true,
    }),
    0.47
  );
});

test("publish category metadata map supplies defaults for dynamic content profiles without stored rows", () => {
  const metadataMap = buildPublishCategoryMetadataMap({
    categories: ["AI Center"],
    storedMap: {},
    templateId: "default",
  });

  assert.ok(metadataMap["AI Center"]);
  assert.equal(metadataMap["AI Center"].bgmEnabled, true);
  assert.equal(metadataMap["AI Center"].sfxEnabled, true);
  assert.equal(metadataMap["AI Center"].playbackRate, DEFAULT_PUBLISH_PLAYBACK_RATE);
});

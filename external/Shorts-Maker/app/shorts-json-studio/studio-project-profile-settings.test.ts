import assert from "node:assert/strict";
import test from "node:test";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import {
  buildCurrentProjectPublishMetadata,
  diffPublishMetadataSettingGroups,
  mergePublishMetadataSettingGroups,
  mergeStudioProjectProfileSnapshotGroups,
  resolveStudioProjectProfileSyncInvalidation,
  resolveStudioProfileMetadataForComparison,
  STUDIO_PROFILE_METADATA_TEMPLATE_ID,
} from "./studio-project-profile-settings";

function makeTemplatePreset(overrides: Partial<PublishCategoryTemplatePreset> = {}): PublishCategoryTemplatePreset {
  return {
    templateId: "black",
    templateData: { accentColor: "#ffffff", titleScale: 1, bodyScale: 1 } as never,
    templateImageEnabled: true,
    templateImageUrl: "https://example.com/template.png",
    templateImageLayout: {
      headerTitleSlot: { x: 0, y: 0, w: 1, h: 1 },
      headerAccentSlot: { x: 0, y: 0, w: 1, h: 1 },
      titleSlot: { x: 0, y: 0, w: 1, h: 1 },
      bodySlot: { x: 0, y: 0, w: 1, h: 1 },
      imageSlot: { x: 0, y: 0, w: 1, h: 1 },
      infoSlot: { x: 0, y: 0, w: 1, h: 1 },
      titleColor: "#111111",
      bodyColor: "#222222",
      infoColor: "#333333",
      titleAlign: "center",
      bodyAlign: "left",
      headerSize: 20,
      titleSize: 30,
      bodySize: 18,
      infoSize: 12,
    },
    templateLayoutApply: {
      title: true,
      body: false,
      image: true,
      info: false,
    },
    ...overrides,
  };
}

test("project profile sync uses the default profile metadata namespace", () => {
  assert.equal(STUDIO_PROFILE_METADATA_TEMPLATE_ID, "default");
});

test("implicit default template metadata compares equal to a normalized default project template", () => {
  const implicitDefault = makeTemplatePreset({ templateId: "default" });
  const profile = resolveStudioProfileMetadataForComparison(
    makeMetadata({ templatePreset: null }),
    implicitDefault
  );
  const project = makeMetadata({ templatePreset: implicitDefault });

  assert.deepEqual(diffPublishMetadataSettingGroups(profile, project, "news"), []);
});

function makeMetadata(overrides: Partial<PublishMetadata> = {}): PublishMetadata {
  return {
    description: "base description",
    tags: ["base", "tag"],
    ttsVoiceId: "voice-base",
    bgmEnabled: true,
    bgmTrackId: "bgm-base",
    mixPresetId: "mix-base",
    bgmVolume: 0.4,
    playbackRate: 1,
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "base notes",
    topicToScriptPrompt: "topic base",
    scriptToJsonPrompt: "json base",
    templatePreset: makeTemplatePreset(),
    mascotStyle: "base style",
    ...overrides,
  };
}

test("diffPublishMetadataSettingGroups returns the changed groups only", () => {
  const left = makeMetadata();
  const right = makeMetadata({
    ttsVoiceId: "voice-next",
    bgmVolume: 0.8,
    sfxEnabled: false,
    templateNotes: "next notes",
    mascotStyle: "next style",
    tags: ["next", "tag"],
  });

  assert.deepEqual(diffPublishMetadataSettingGroups(left, right, "news"), [
    "voicePlayback",
    "bgm",
    "sfx",
    "template",
    "imageStyle",
    "publishing",
  ]);
});

test("diffPublishMetadataSettingGroups uses stable deep equality for template presets and tags", () => {
  const left = makeMetadata({
    tags: ["a", "b"],
    templatePreset: makeTemplatePreset({
      templateData: { z: 1, a: { two: true, one: false } } as never,
    }),
  });
  const right = makeMetadata({
    tags: ["a", "b"],
    templatePreset: makeTemplatePreset({
      templateData: { a: { one: false, two: true }, z: 1 } as never,
    }),
  });

  assert.deepEqual(diffPublishMetadataSettingGroups(left, right, "news"), []);

  right.tags.reverse();
  assert.deepEqual(diffPublishMetadataSettingGroups(left, right, "news"), ["publishing"]);
});

test("mergePublishMetadataSettingGroups overwrites only selected groups", () => {
  const base = makeMetadata();
  const source = makeMetadata({
    ttsVoiceId: "voice-source",
    playbackRate: 1.25,
    bgmTrackId: "bgm-source",
    tags: ["source"],
    mascotStyle: "source style",
  });

  const merged = mergePublishMetadataSettingGroups({
    category: "news",
    base,
    source,
    groups: ["voicePlayback", "imageStyle"],
  });

  assert.equal(merged.ttsVoiceId, "voice-source");
  assert.equal(merged.playbackRate, 1.25);
  assert.equal(merged.mascotStyle, "source style");
  assert.equal(merged.bgmTrackId, "bgm-base");
  assert.deepEqual(merged.tags, ["base", "tag"]);
});

test("mergePublishMetadataSettingGroups clears optional keys missing from source", () => {
  const base = makeMetadata({ bgmVolume: 0.6, templatePreset: makeTemplatePreset(), mascotStyle: "base style" });
  const source = makeMetadata();
  delete source.bgmVolume;
  delete source.templatePreset;
  delete source.mascotStyle;

  const merged = mergePublishMetadataSettingGroups({
    category: "news",
    base,
    source,
    groups: ["bgm", "template", "imageStyle"],
  });

  assert.equal(Object.prototype.hasOwnProperty.call(merged, "bgmVolume"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "templatePreset"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "mascotStyle"), false);
});

test("mergePublishMetadataSettingGroups does not mutate inputs", () => {
  const base = makeMetadata({ templatePreset: makeTemplatePreset() });
  const source = makeMetadata({
    templatePreset: makeTemplatePreset({
      templateData: { accentColor: "#000000" } as never,
    }),
  });

  const merged = mergePublishMetadataSettingGroups({
    category: "news",
    base,
    source,
    groups: ["template"],
  });

  (merged.templatePreset?.templateData as Record<string, unknown>).accentColor = "#ff0000";
  assert.equal((source.templatePreset?.templateData as Record<string, unknown>).accentColor, "#000000");
  assert.equal((base.templatePreset?.templateData as Record<string, unknown>).accentColor, "#ffffff");
});

test("mergeStudioProjectProfileSnapshotGroups keeps creation identity and applies server-normalized selected groups", () => {
  const snapshot: StudioProjectProfileSnapshot = {
    version: 1,
    projectId: "project-1",
    createdAt: "2026-07-22T00:00:00.000Z",
    contentProfile: {
      category: "news",
      label: "기존 프로필",
      metadataSnapshot: makeMetadata({
        ttsVoiceId: "voice-before",
        playbackRate: 1,
        bgmEnabled: false,
      }),
    },
  };
  const serverMetadata = makeMetadata({
    ttsVoiceId: "voice-normalized",
    playbackRate: 1.2,
    bgmEnabled: true,
  });

  const merged = mergeStudioProjectProfileSnapshotGroups({
    snapshot,
    category: "news",
    source: serverMetadata,
    groups: ["voicePlayback"],
    profileLabel: " 최신 프로필 ",
  });

  assert.notEqual(merged, snapshot);
  assert.equal(merged.createdAt, snapshot.createdAt);
  assert.equal(merged.projectId, snapshot.projectId);
  assert.equal(merged.contentProfile.label, "최신 프로필");
  assert.equal(merged.contentProfile.metadataSnapshot?.ttsVoiceId, "voice-normalized");
  assert.equal(merged.contentProfile.metadataSnapshot?.playbackRate, 1.2);
  assert.equal(merged.contentProfile.metadataSnapshot?.bgmEnabled, false);
  assert.equal(snapshot.contentProfile.metadataSnapshot?.ttsVoiceId, "voice-before");
});

test("resolveStudioProjectProfileSyncInvalidation limits approvals and render work to affected groups", () => {
  assert.deepEqual(resolveStudioProjectProfileSyncInvalidation(["publishing"]), {
    imageApproval: false,
    renderedAsset: false,
  });
  assert.deepEqual(resolveStudioProjectProfileSyncInvalidation(["voicePlayback", "imageStyle"]), {
    imageApproval: true,
    renderedAsset: true,
  });
});

test("buildCurrentProjectPublishMetadata preserves publishing fields and reflects current studio state", () => {
  const snapshotMetadata = makeMetadata({
    description: "snapshot description",
    tags: ["snapshot"],
    topicToScriptPrompt: "snapshot topic",
    scriptToJsonPrompt: "snapshot json",
    ttsVoiceId: "snapshot voice",
    bgmTrackId: "snapshot bgm",
  });
  const projectProfileSnapshot: StudioProjectProfileSnapshot = {
    version: 1,
    projectId: "project-1",
    createdAt: "2026-07-22T00:00:00.000Z",
    contentProfile: {
      category: "news",
      label: "News",
      metadataSnapshot: snapshotMetadata,
    },
  };
  const effectiveTemplatePreset = makeTemplatePreset({
    templateId: "fun-caption",
    templateData: { captionStyle: "neon-pink" } as never,
  });

  const built = buildCurrentProjectPublishMetadata({
    category: "news",
    projectProfileSnapshot,
    latestMetadata: makeMetadata({ description: "latest description" }),
    selectedVoiceId: "voice-current",
    playbackRate: 1.15,
    bgmEnabled: false,
    selectedBgmTrack: "bgm-current",
    mixPresetId: "mix-current",
    bgmVolume: 0.25,
    sfxEnabled: false,
    sfxMasterGainDb: -4,
    effectiveTemplatePreset,
    templateNotesDraft: "current notes",
    imageStylePrompt: "current image style",
  });

  assert.equal(built.description, "snapshot description");
  assert.deepEqual(built.tags, ["snapshot"]);
  assert.equal(built.topicToScriptPrompt, "snapshot topic");
  assert.equal(built.scriptToJsonPrompt, "snapshot json");
  assert.equal(built.ttsVoiceId, "voice-current");
  assert.equal(built.playbackRate, 1.15);
  assert.equal(built.bgmEnabled, false);
  assert.equal(built.bgmTrackId, "bgm-current");
  assert.equal(built.mixPresetId, "mix-current");
  assert.equal(built.bgmVolume, 0.25);
  assert.equal(built.sfxEnabled, false);
  assert.equal(built.sfxMasterGainDb, -4);
  assert.equal(built.templateNotes, "current notes");
  assert.equal(built.templatePreset?.templateId, "fun-caption");
  assert.equal(built.mascotPrompt, "current image style");

  (built.templatePreset?.templateData as Record<string, unknown>).captionStyle = "flame-gold";
  assert.equal((effectiveTemplatePreset.templateData as Record<string, unknown>).captionStyle, "neon-pink");
  assert.equal(snapshotMetadata.ttsVoiceId, "snapshot voice");
});

test("buildCurrentProjectPublishMetadata falls back to category defaults when metadata is null", () => {
  const built = buildCurrentProjectPublishMetadata({
    category: "conservative",
    projectProfileSnapshot: {
      version: 1,
      projectId: "project-null",
      createdAt: "2026-07-22T00:00:00.000Z",
      contentProfile: {
        category: "conservative",
        label: "Conservative",
        metadataSnapshot: null,
      },
    },
    selectedVoiceId: "voice-current",
  });

  assert.equal(built.ttsVoiceId, "voice-current");
  assert.ok(built.description.includes("공신뉴스"));
});

test("buildCurrentProjectPublishMetadata preserves the snapshot image style before structured JSON exists", () => {
  const built = buildCurrentProjectPublishMetadata({
    category: "news",
    projectProfileSnapshot: {
      version: 1,
      projectId: "project-image-style",
      createdAt: "2026-07-22T00:00:00.000Z",
      contentProfile: {
        category: "news",
        label: "뉴스",
        metadataSnapshot: makeMetadata({ mascotPrompt: "snapshot image style" }),
      },
    },
  });

  assert.equal(built.mascotPrompt, "snapshot image style");
});

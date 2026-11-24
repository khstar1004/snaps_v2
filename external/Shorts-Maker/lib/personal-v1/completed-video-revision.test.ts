import assert from "node:assert/strict";
import test from "node:test";
import type { StudioWorkDraft } from "@/app/shorts-json-studio/types";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { buildPersonalV1CompletedVideoRevision } from "./completed-video-revision";

function makeMetadata(description: string): PublishMetadata {
  return {
    description,
    tags: [description],
    ttsVoiceId: "voice-a",
    bgmEnabled: true,
    bgmTrackId: "bgm-a",
    mixPresetId: "mix-a",
    sfxEnabled: true,
    sfxMasterGainDb: 1,
    templateNotes: "",
    topicToScriptPrompt: "topic prompt",
    scriptToJsonPrompt: "json prompt",
  };
}

function makeSnapshot(
  projectId: string,
  category = "alpha",
  label = "Alpha 채널",
  metadataSnapshot: PublishMetadata | null = makeMetadata("source metadata")
): StudioProjectProfileSnapshot {
  return {
    version: 1,
    projectId,
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category,
      label,
      metadataSnapshot,
    },
  };
}

function makeDraft(overrides: StudioWorkDraft = {}): StudioWorkDraft {
  return {
    workName: "완성 영상",
    topicText: "기존 주제",
    scriptText: "기존 대본",
    publishCategory: "alpha",
    projectProfileSnapshot: makeSnapshot("old-project"),
    videoUrl: "https://example.com/final.mp4",
    uploadedVideoUrl: "https://example.com/uploaded.mp4",
    renderStatus: "done",
    lastDraftRenderFingerprint: "draft-fp",
    lastFinalRenderFingerprint: "final-fp",
    lastRenderPreflightFingerprint: "preflight-fp",
    voiceApprovalFingerprint: "voice-fp",
    imageApprovalFingerprint: "image-fp",
    quickScheduledAt: "2026-07-21T00:00:00.000Z",
    selectedVoiceId: "voice-a",
    playbackRate: 1.15,
    sfxEnabled: true,
    slides: [{ title: "s1", text: "one", lines: ["one"], layout: "photo+body" }],
    ...overrides,
  };
}

test("buildPersonalV1CompletedVideoRevision creates a new project clone from a completed video draft", () => {
  const sourceMetadata = makeMetadata("source metadata");
  const result = buildPersonalV1CompletedVideoRevision({
    sourceDraft: makeDraft({
      projectProfileSnapshot: makeSnapshot("old-project", "alpha", "Alpha 채널", sourceMetadata),
    }),
    category: "alpha",
    profileLabel: "Alpha 채널",
    categoryMetadata: makeMetadata("fallback metadata"),
    now: "2026-07-21T00:00:00.000Z",
  });

  assert.equal(result.context.createdAt, "2026-07-21T00:00:00.000Z");
  assert.equal(result.context.contentProfile.category, "alpha");
  assert.equal(result.context.contentProfile.metadataSnapshot?.description, "source metadata");
  assert.equal(result.context.input.mode, "topic");
  assert.equal(result.context.input.originalText, "기존 주제");
  assert.equal(result.draft.publishCategory, "alpha");
  assert.equal(result.draft.projectProfileSnapshot?.projectId, result.context.projectId);
  assert.notEqual(result.draft.projectProfileSnapshot?.projectId, "old-project");
  assert.equal(result.draft.videoUrl, undefined);
  assert.equal(result.draft.uploadedVideoUrl, undefined);
  assert.equal(result.draft.renderStatus, undefined);
  assert.equal(result.draft.lastDraftRenderFingerprint, undefined);
  assert.equal(result.draft.lastFinalRenderFingerprint, undefined);
  assert.equal(result.draft.lastRenderPreflightFingerprint, undefined);
  assert.equal(result.draft.voiceApprovalFingerprint, undefined);
  assert.equal(result.draft.imageApprovalFingerprint, undefined);
  assert.equal(result.draft.quickScheduledAt, undefined);
  assert.equal(result.draft.selectedVoiceId, "voice-a");
  assert.equal(result.draft.playbackRate, 1.15);
  assert.equal(result.draft.sfxEnabled, true);
});

test("buildPersonalV1CompletedVideoRevision falls back to category metadata when source profile category differs", () => {
  const result = buildPersonalV1CompletedVideoRevision({
    sourceDraft: makeDraft({
      topicText: "",
      scriptText: "대본만 있는 영상",
      publishCategory: "beta",
      projectProfileSnapshot: makeSnapshot("old-project", "beta", "Beta 채널", makeMetadata("beta source")),
    }),
    category: "alpha",
    profileLabel: "Alpha 채널",
    categoryMetadata: makeMetadata("alpha fallback"),
  });

  assert.equal(result.context.contentProfile.category, "alpha");
  assert.equal(result.context.contentProfile.metadataSnapshot?.description, "alpha fallback");
  assert.equal(result.context.input.mode, "script");
  assert.equal(result.context.input.originalText, "대본만 있는 영상");
  assert.equal(result.draft.publishCategory, "alpha");
});

test("buildPersonalV1CompletedVideoRevision allows json-only restored drafts and records script input mode", () => {
  const result = buildPersonalV1CompletedVideoRevision({
    sourceDraft: makeDraft({
      topicText: "",
      scriptText: "",
      jsonText: JSON.stringify({ title: "JSON 영상" }),
    }),
    category: "alpha",
    profileLabel: "Alpha 채널",
  });

  assert.equal(result.context.input.mode, "script");
  assert.equal(result.context.input.originalText, "");
  assert.equal(result.draft.jsonText, JSON.stringify({ title: "JSON 영상" }));
});

test("buildPersonalV1CompletedVideoRevision validates category, profile label, and source content", () => {
  assert.throws(
    () =>
      buildPersonalV1CompletedVideoRevision({
        sourceDraft: makeDraft(),
        category: "",
        profileLabel: "Alpha 채널",
      }),
    /콘텐츠 프로필/
  );
  assert.throws(
    () =>
      buildPersonalV1CompletedVideoRevision({
        sourceDraft: makeDraft(),
        category: "alpha",
        profileLabel: " ",
      }),
    /콘텐츠 프로필 이름/
  );
  assert.throws(
    () =>
      buildPersonalV1CompletedVideoRevision({
        sourceDraft: {
          workName: "",
          topicText: "",
          scriptText: "",
          jsonText: "",
          slides: [],
          publishCategory: "alpha",
        },
        category: "alpha",
        profileLabel: "Alpha 채널",
      }),
    /제작 내용/
  );
});

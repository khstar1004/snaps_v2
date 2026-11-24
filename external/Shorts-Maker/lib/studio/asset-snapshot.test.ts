import test from "node:test";
import assert from "node:assert/strict";
import {
  completeStudioAssetSnapshot,
  normalizeStudioAssetSnapshotRequest,
  STUDIO_ASSET_SNAPSHOT_MAX_BYTES,
} from "./asset-snapshot";

function makeProjectProfileSnapshot(category = "alpha") {
  return {
    version: 1 as const,
    projectId: "project-alpha-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category,
      label: "알파 채널",
      metadataSnapshot: {
        description: "desc",
        tags: ["alpha"],
        ttsVoiceId: "voice-alpha",
        bgmEnabled: true,
        bgmTrackId: "bgm-alpha",
        mixPresetId: "mix-alpha",
        sfxEnabled: true,
        sfxMasterGainDb: -3,
        templateNotes: "notes",
        topicToScriptPrompt: "snapshot topic prompt",
        scriptToJsonPrompt: "snapshot json prompt",
      },
    },
  };
}

test("normalizeStudioAssetSnapshotRequest keeps the V2 allowlist and clamps audio values", () => {
  const snapshot = normalizeStudioAssetSnapshotRequest({
    version: 2,
    renderStage: "final",
    createdAtMs: 123,
    ignored: "discarded",
    draft: {
      workName: "테스트 작업",
      publishCategory: "alpha",
      playbackRate: 9,
      bgmVolume: 5,
      sfxMasterGainDb: -90,
      voiceApprovalFingerprint: `voice-${"a".repeat(300)}`,
      imageApprovalFingerprint: "image-approved-fingerprint",
      unexpected: "discarded",
    },
    brandingDraft: {
      headerTitle: "헤더",
      headerColor: "#111111",
      footerColor: "#222222",
      infoLineText: "정보",
      fontFamily: "Pretendard",
      imageRounded: false,
    },
  });

  assert.equal(snapshot?.version, 2);
  assert.equal(snapshot?.renderStage, "final");
  assert.equal(snapshot?.draft?.playbackRate, 3);
  assert.equal(snapshot?.draft?.bgmVolume, 1);
  assert.equal(snapshot?.draft?.sfxMasterGainDb, -24);
  assert.equal(snapshot?.draft?.voiceApprovalFingerprint, `voice-${"a".repeat(250)}`);
  assert.equal(snapshot?.draft?.imageApprovalFingerprint, "image-approved-fingerprint");
  assert.equal(snapshot?.brandingDraft?.imageRounded, false);
  assert.equal("unexpected" in (snapshot?.draft || {}), false);
  assert.equal("ignored" in (snapshot || {}), false);
});

test("normalizeStudioAssetSnapshotRequest preserves valid project profile snapshots", () => {
  const snapshot = normalizeStudioAssetSnapshotRequest({
    version: 2,
    renderStage: "final",
    createdAtMs: 123,
    draft: {
      publishCategory: "alpha",
      projectProfileSnapshot: makeProjectProfileSnapshot("alpha"),
    },
  });

  assert.equal(snapshot?.draft?.projectProfileSnapshot?.projectId, "project-alpha-1");
  assert.equal(snapshot?.draft?.projectProfileSnapshot?.contentProfile.category, "alpha");
  assert.equal(
    snapshot?.draft?.projectProfileSnapshot?.contentProfile.metadataSnapshot?.topicToScriptPrompt,
    "snapshot topic prompt"
  );
});

test("normalizeStudioAssetSnapshotRequest omits mismatched project profile snapshots", () => {
  const snapshot = normalizeStudioAssetSnapshotRequest({
    version: 2,
    renderStage: "final",
    createdAtMs: 123,
    draft: {
      publishCategory: "alpha",
      projectProfileSnapshot: makeProjectProfileSnapshot("other"),
    },
  });

  assert.equal(snapshot?.draft?.projectProfileSnapshot, undefined);
});

test("normalizeStudioAssetSnapshotRequest rejects incomplete and legacy request payloads", () => {
  assert.equal(normalizeStudioAssetSnapshotRequest(null), null);
  assert.equal(normalizeStudioAssetSnapshotRequest({ version: 1, renderStage: "final", draft: {} }), null);
  assert.equal(normalizeStudioAssetSnapshotRequest({ version: 2, draft: {} }), null);
});

test("completeStudioAssetSnapshot injects durable render media and final asset URLs", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      createdAtMs: 123,
      draft: {
        workName: "테스트 작업",
        lastDraftRenderFingerprint: "draft-fingerprint",
        lastFinalRenderFingerprint: "final-fingerprint",
        voiceApprovalFingerprint: "voice-approved-fingerprint",
        imageApprovalFingerprint: "image-approved-fingerprint",
        projectProfileSnapshot: makeProjectProfileSnapshot("verified-category"),
      },
    },
    slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
    frameDurationsSec: [1.25],
    assetUrl: "https://cdn.example.com/final.mp4",
    publishCategory: "verified-category",
  });

  assert.deepEqual(completed?.draft?.slides?.map((slide) => slide.title), ["첫 장"]);
  assert.deepEqual(completed?.draft?.previewFrameDurationsSec, [1.25]);
  assert.equal(completed?.draft?.videoUrl, "https://cdn.example.com/final.mp4");
  assert.equal(completed?.draft?.uploadedVideoUrl, "https://cdn.example.com/final.mp4");
  assert.equal(completed?.draft?.publishCategory, "verified-category");
  assert.equal(completed?.draft?.voiceApprovalFingerprint, "voice-approved-fingerprint");
  assert.equal(completed?.draft?.imageApprovalFingerprint, "image-approved-fingerprint");
  assert.equal(completed?.draft?.projectProfileSnapshot?.projectId, "project-alpha-1");
  assert.equal(completed?.draft?.projectProfileSnapshot?.contentProfile.category, "verified-category");
});

test("completeStudioAssetSnapshot drops project profile snapshots that mismatch the final category", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      createdAtMs: 123,
      draft: {
        publishCategory: "alpha",
        projectProfileSnapshot: makeProjectProfileSnapshot("alpha"),
      },
    },
    slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
    frameDurationsSec: [1.25],
    assetUrl: "https://cdn.example.com/final.mp4",
    publishCategory: "beta",
  });

  assert.equal(completed?.draft?.publishCategory, "beta");
  assert.equal(completed?.draft?.projectProfileSnapshot, undefined);
});

test("completeStudioAssetSnapshot preserves editable image and SFX metadata omitted by render visuals", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        slides: [
          {
            title: "편집 제목",
            text: "본문",
            lines: ["본문"],
            layout: "photo+body",
            imageSelection: {
              intent: "news",
              queryCandidates: ["검색어"],
              selectedCandidateId: "candidate-1",
            },
            imageRequest: { query: "검색어", scene: "편집 장면" },
            sfxCue: {
              enabled: true,
              tag: "impact",
              gainDb: -4,
              offsetMs: 150,
              source: "manual",
            },
          },
        ],
      },
    },
    visuals: {
      slides: [
        {
          title: "렌더 제목",
          text: "본문",
          lines: ["본문"],
          layout: "photo+body",
          imageUrl: "https://cdn.example.com/rendered.jpg",
        },
      ],
      branding: {
        headerTitle: "헤더",
        headerAccentText: "",
        headerColor: "#111111",
        footerColor: "#222222",
        infoLineText: "정보",
        fontFamily: "Pretendard",
        imageRounded: true,
      },
    },
    frameDurationsSec: [1.5],
    assetUrl: "https://cdn.example.com/final.mp4",
  });

  const restoredSlide = completed?.draft?.slides?.[0];
  assert.equal(restoredSlide?.title, "렌더 제목");
  assert.equal(restoredSlide?.imageUrl, "https://cdn.example.com/rendered.jpg");
  assert.equal(restoredSlide?.imageSelection?.selectedCandidateId, "candidate-1");
  assert.equal(restoredSlide?.imageRequest?.scene, "편집 장면");
  assert.deepEqual(restoredSlide?.sfxCue, {
    enabled: true,
    tag: "impact",
    gainDb: -4,
    offsetMs: 150,
    source: "manual",
  });
});

test("completeStudioAssetSnapshot keeps draft renders out of uploadedVideoUrl", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: { version: 2, renderStage: "draft", draft: {} },
    slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
    frameDurationsSec: [1],
    assetUrl: "https://cdn.example.com/draft.mp4",
  });

  assert.equal(completed?.draft?.videoUrl, "https://cdn.example.com/draft.mp4");
  assert.equal(completed?.draft?.uploadedVideoUrl, undefined);
});

test("completeStudioAssetSnapshot removes non-durable blob URLs without dropping the snapshot", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: { version: 2, renderStage: "final", draft: {} },
    slides: [
      {
        title: "첫 장",
        text: "본문",
        lines: ["본문"],
        layout: "photo+body",
        imageUrl: "blob:http://localhost/non-durable",
      },
    ],
    frameDurationsSec: [1],
    assetUrl: "https://cdn.example.com/final.mp4",
  });

  assert.equal(completed?.draft?.slides?.[0]?.imageUrl, undefined);
  assert.equal(completed?.draft?.nonDurableMediaRemoved, true);
});

test("completeStudioAssetSnapshot sanitizes oversized inline media before applying snapshot limits", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        jsonText: JSON.stringify({
          title: "인라인 이미지",
          slides: [{ imageUrl: `data:image/png;base64,${"a".repeat(510_000)}` }],
        }),
        slides: [
          {
            title: "편집 장면",
            text: "본문",
            lines: ["본문"],
            layout: "photo+body",
            imageUrl: `data:image/png;base64,${"a".repeat(2_600_000)}`,
            imageRequest: { query: "보존할 검색어", scene: "보존할 장면" },
          },
        ],
      },
    },
    slides: [{ title: "렌더 장면", text: "본문", lines: ["본문"], layout: "photo+body" }],
    frameDurationsSec: [1],
    assetUrl: "https://cdn.example.com/final.mp4",
  });

  assert.ok(completed);
  assert.equal(completed.draft?.slides?.[0]?.imageUrl, undefined);
  assert.equal(completed.draft?.slides?.[0]?.imageRequest?.query, "보존할 검색어");
  assert.equal(completed.draft?.nonDurableMediaRemoved, true);
  const parsedJson = JSON.parse(completed.draft?.jsonText || "{}") as {
    slides?: Array<{ imageUrl?: string }>;
  };
  assert.equal(parsedJson.slides?.[0]?.imageUrl, undefined);
});

test("normalizeStudioAssetSnapshotRequest omits oversized invalid editor JSON instead of truncating it", () => {
  const normalized = normalizeStudioAssetSnapshotRequest({
    version: 2,
    renderStage: "draft",
    draft: {
      scriptText: "복원 가능한 대본",
      jsonText: `{${"a".repeat(510_000)}`,
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.draft?.jsonText, undefined);
  assert.equal(normalized.draft?.scriptText, "복원 가능한 대본");
});

test("completeStudioAssetSnapshot bounds the durable JSON payload size", () => {
  const completed = completeStudioAssetSnapshot({
    snapshot: { version: 2, renderStage: "final", draft: {} },
    slides: [
      {
        title: "a".repeat(STUDIO_ASSET_SNAPSHOT_MAX_BYTES),
        text: "본문",
        lines: ["본문"],
        layout: "photo+body",
      },
    ],
    frameDurationsSec: [1],
    assetUrl: "https://cdn.example.com/final.mp4",
  });

  assert.equal(completed, null);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioAssetSnapshot } from "@/types/studio-snapshot";
import { buildStudioAssetSnapshot, restoreStudioWorkDraftFromAssetSnapshot } from "./studio-asset-snapshot";

const slide: PreparedSlide = {
  title: "첫 장면",
  text: "첫 문장",
  lines: ["첫 문장"],
  layout: "photo+body",
  imageSelection: {
    intent: "news",
    queryCandidates: ["첫 장면"],
    candidateOptions: [
      {
        provider: "naver",
        candidateId: "candidate-1",
        imageUrl: "https://example.com/candidate.jpg",
      },
    ],
    selectedCandidateId: "candidate-1",
  },
  imageRequest: {
    query: "첫 장면",
    scene: "장면 설명",
  },
  sfxCue: {
    enabled: true,
    tag: "impact",
    gainDb: -3,
    offsetMs: 120,
    source: "manual",
  },
};

function makeProjectProfileSnapshot(category = "news") {
  return {
    version: 1 as const,
    projectId: "project-news-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category,
      label: "뉴스 채널",
      metadataSnapshot: {
        description: "채널 설명",
        tags: ["뉴스"],
        ttsVoiceId: "voice-snapshot",
        bgmEnabled: true,
        bgmTrackId: "bgm-snapshot",
        mixPresetId: "mix-snapshot",
        bgmVolume: 0.4,
        playbackRate: 1.2,
        sfxEnabled: true,
        sfxMasterGainDb: -2,
        templateNotes: "스냅샷 템플릿",
        topicToScriptPrompt: "스냅샷 주제 프롬프트",
        scriptToJsonPrompt: "스냅샷 JSON 프롬프트",
      },
    },
  };
}

test("buildStudioAssetSnapshot keeps editable slides but leaves timings and asset URLs to the server", () => {
  const inputSlides = [slide];
  const projectProfileSnapshot = makeProjectProfileSnapshot();
  const inputDraft = {
    workName: "정밀 편집본",
    scriptText: "대본",
    publishCategory: "news",
    projectProfileSnapshot,
    previewFrameDurationsSec: [1.25],
    videoUrl: "blob:preview",
    uploadedVideoUrl: "/old-final.mp4",
    playbackRate: 1.4,
    bgmVolume: 0.37,
    lastDraftRenderFingerprint: "draft-fp",
    lastFinalRenderFingerprint: "final-fp",
    voiceApprovalFingerprint: "voice-approved-fp",
    imageApprovalFingerprint: "image-approved-fp",
    preselectedMediaApplyMode: "cycle-all" as const,
    preselectedMediaItems: [
      {
        id: "library-1",
        source: "library" as const,
        title: "고정 캐릭터",
        imageUrl: "/api/assets/media/library-1",
        assetId: "asset-1",
        createdAtMs: 100,
      },
      {
        id: "session-1",
        source: "session-upload" as const,
        title: "임시 업로드",
        imageUrl: "blob:session-upload",
        createdAtMs: 200,
      },
    ],
  };

  const snapshot = buildStudioAssetSnapshot({
    stage: "final",
    createdAtMs: 1_234,
    draft: inputDraft,
    slides: inputSlides,
    brandingDraft: {
      variant: "news",
      headerTitle: "채널 뉴스",
      headerColor: "#111111",
      footerColor: "#222222",
      infoLineText: "오늘의 정보",
      fontFamily: "Pretendard",
      imageRounded: true,
    },
  });

  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.renderStage, "final");
  assert.equal(snapshot.createdAtMs, 1_234);
  assert.equal(snapshot.draft?.workName, "정밀 편집본");
  assert.equal(snapshot.draft?.playbackRate, 1.4);
  assert.equal(snapshot.draft?.bgmVolume, 0.37);
  assert.equal(snapshot.draft?.lastDraftRenderFingerprint, "draft-fp");
  assert.equal(snapshot.draft?.lastFinalRenderFingerprint, "final-fp");
  assert.equal(snapshot.draft?.voiceApprovalFingerprint, "voice-approved-fp");
  assert.equal(snapshot.draft?.imageApprovalFingerprint, "image-approved-fp");
  assert.equal(snapshot.draft?.projectProfileSnapshot?.projectId, "project-news-1");
  assert.equal(snapshot.draft?.projectProfileSnapshot?.contentProfile.metadataSnapshot?.ttsVoiceId, "voice-snapshot");
  assert.deepEqual(snapshot.draft?.slides, [slide]);
  assert.equal("previewFrameDurationsSec" in (snapshot.draft || {}), false);
  assert.equal("videoUrl" in (snapshot.draft || {}), false);
  assert.equal("uploadedVideoUrl" in (snapshot.draft || {}), false);
  assert.deepEqual(snapshot.draft?.preselectedMediaItems?.map((item) => item.id), ["library-1"]);
  assert.equal(snapshot.brandingDraft?.headerTitle, "채널 뉴스");
  assert.equal(inputSlides[0], slide);
  assert.equal(inputDraft.preselectedMediaItems[1]?.imageUrl, "blob:session-upload");
  projectProfileSnapshot.contentProfile.metadataSnapshot.tags.push("mutated");
  assert.deepEqual(snapshot.draft?.projectProfileSnapshot?.contentProfile.metadataSnapshot?.tags, ["뉴스"]);
});

test("buildStudioAssetSnapshot strips inline slide media and marks the snapshot for relinking", () => {
  const snapshot = buildStudioAssetSnapshot({
    stage: "final",
    draft: {
      scriptText: "data:는 대본 텍스트로 유지",
      jsonText: JSON.stringify({
        title: "임시 이미지 작업",
        slides: [{ ...slide, imageUrl: "data:image/png;base64,AAAA" }],
      }),
    },
    slides: [
      {
        ...slide,
        imageUrl: "data:image/png;base64,AAAA",
        imageSelection: {
          intent: "news",
          queryCandidates: ["첫 장면"],
          candidateOptions: [
            {
              provider: "naver",
              candidateId: "inline",
              imageUrl: "blob:http://localhost/candidate",
            },
          ],
          selectedCandidateId: "inline",
        },
      },
    ],
  });

  const parsedJson = JSON.parse(snapshot.draft?.jsonText || "{}") as {
    slides?: Array<{ imageUrl?: string }>;
  };
  assert.equal(snapshot.draft?.slides?.[0]?.imageUrl, undefined);
  assert.deepEqual(snapshot.draft?.slides?.[0]?.imageSelection?.candidateOptions, []);
  assert.equal(snapshot.draft?.slides?.[0]?.imageSelection?.selectedCandidateId, undefined);
  assert.equal(parsedJson.slides?.[0]?.imageUrl, undefined);
  assert.equal(snapshot.draft?.scriptText, "data:는 대본 텍스트로 유지");
  assert.equal(snapshot.draft?.nonDurableMediaRemoved, true);
});

test("restoreStudioWorkDraftFromAssetSnapshot restores a final V2 snapshot with the current asset URL", () => {
  const snapshot: StudioAssetSnapshot = {
    version: 2,
    renderStage: "final",
    createdAtMs: 9_999,
    draft: {
      workName: "보관된 작업",
      scriptText: "보관된 대본",
      publishCategory: "news",
      slides: [slide],
      previewFrameDurationsSec: [1.5],
      videoUrl: "/stale.mp4",
      uploadedVideoUrl: "/stale.mp4",
      selectedMaleVoiceId: "voice-male",
      lastFinalRenderFingerprint: "final-fp",
      voiceApprovalFingerprint: "voice-approved-fp",
      imageApprovalFingerprint: "image-approved-fp",
      templateId: "black",
    },
    brandingDraft: {
      variant: "news",
      headerTitle: "뉴스",
      headerColor: "#000000",
      footerColor: "#333333",
      infoLineText: "정보",
      fontFamily: "Pretendard",
      imageRounded: false,
    },
  };

  const restored = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot,
    assetUrl: "/api/assets/video/current.mp4",
    fallbackPublishCategory: "fallback",
  });

  assert.ok(restored);
  assert.equal(restored.renderStage, "final");
  assert.equal(restored.createdAtMs, 9_999);
  assert.equal(restored.draft.publishCategory, "fallback");
  assert.equal(restored.draft.videoUrl, "/api/assets/video/current.mp4");
  assert.equal(restored.draft.uploadedVideoUrl, "/api/assets/video/current.mp4");
  assert.deepEqual(restored.draft.previewFrameDurationsSec, [1.5]);
  assert.equal(restored.draft.selectedMaleVoiceId, "voice-male");
  assert.equal(restored.draft.voiceApprovalFingerprint, "voice-approved-fp");
  assert.equal(restored.draft.imageApprovalFingerprint, "image-approved-fp");
  assert.equal(restored.brandingDraft?.headerTitle, "뉴스");
});

test("restoreStudioWorkDraftFromAssetSnapshot keeps a valid project profile snapshot", () => {
  const restored = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        scriptText: "보관된 대본",
        publishCategory: "news",
        projectProfileSnapshot: makeProjectProfileSnapshot(),
        slides: [slide],
      },
    },
    assetUrl: "/final.mp4",
  });

  assert.ok(restored);
  assert.equal(restored.draft.projectProfileSnapshot?.projectId, "project-news-1");
  assert.equal(restored.draft.projectProfileSnapshot?.contentProfile.category, "news");
  assert.equal(restored.draft.projectProfileSnapshot?.contentProfile.metadataSnapshot?.topicToScriptPrompt, "스냅샷 주제 프롬프트");
});

test("restoreStudioWorkDraftFromAssetSnapshot excludes invalid or mismatched project profile snapshots", () => {
  const invalid = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        scriptText: "보관된 대본",
        publishCategory: "news",
        projectProfileSnapshot: { ...makeProjectProfileSnapshot(), version: 2 },
        slides: [slide],
      } as never,
    },
    assetUrl: "/final.mp4",
  });
  const mismatched = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        scriptText: "보관된 대본",
        publishCategory: "news",
        projectProfileSnapshot: makeProjectProfileSnapshot("other"),
        slides: [slide],
      },
    },
    assetUrl: "/final.mp4",
  });

  assert.ok(invalid);
  assert.ok(mismatched);
  assert.equal(invalid.draft.projectProfileSnapshot, undefined);
  assert.equal(mismatched.draft.projectProfileSnapshot, undefined);
});

test("restoreStudioWorkDraftFromAssetSnapshot does not mark draft renders as uploaded finals", () => {
  const restored = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "draft",
      draft: { jsonText: '{"title":"초안"}', slides: [slide] },
    },
    assetUrl: "/draft.mp4",
    fallbackPublishCategory: "story",
  });

  assert.ok(restored);
  assert.equal(restored.draft.videoUrl, "/draft.mp4");
  assert.equal(restored.draft.uploadedVideoUrl, undefined);
  assert.equal(restored.draft.publishCategory, "story");
  assert.equal(restored.draft.voiceApprovalFingerprint, undefined);
  assert.equal(restored.draft.imageApprovalFingerprint, undefined);
});

test("restoreStudioWorkDraftFromAssetSnapshot warns when temporary media was removed", () => {
  const restored = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        scriptText: "보관된 대본",
        slides: [slide],
        renderStatus: "기존 상태 메시지",
        nonDurableMediaRemoved: true,
      },
    },
    assetUrl: "/final.mp4",
  });

  assert.ok(restored);
  assert.match(restored.draft.renderStatus || "", /임시 이미지는 저장되지 않아 다시 연결/);
});

test("restoreStudioWorkDraftFromAssetSnapshot accepts the legacy top-level shape", () => {
  const restored = restoreStudioWorkDraftFromAssetSnapshot({
    snapshot: {
      title: "구형 작업",
      scriptText: "구형 대본",
      slides: [slide],
      selectedVoiceId: "legacy-voice",
      publishCategory: "legacy",
    },
    assetUrl: "/legacy.mp4",
  });

  assert.ok(restored);
  assert.equal(restored.draft.workName, "구형 작업");
  assert.equal(restored.draft.scriptText, "구형 대본");
  assert.equal(restored.draft.selectedVoiceId, "legacy-voice");
  assert.equal(restored.draft.videoUrl, "/legacy.mp4");
  assert.equal(restored.draft.uploadedVideoUrl, "/legacy.mp4");
  assert.equal(restored.renderStage, "final");
});

test("restoreStudioWorkDraftFromAssetSnapshot rejects incomplete and mismatched nested snapshots", () => {
  assert.equal(
    restoreStudioWorkDraftFromAssetSnapshot({
      snapshot: { version: 2, renderStage: "final", draft: { workName: "내용 없음" } },
      assetUrl: "/empty.mp4",
    }),
    null
  );
  assert.equal(
    restoreStudioWorkDraftFromAssetSnapshot({
      snapshot: { version: 1, renderStage: "final", draft: { scriptText: "중첩 구형" } },
      assetUrl: "/wrong-version.mp4",
    }),
    null
  );
});

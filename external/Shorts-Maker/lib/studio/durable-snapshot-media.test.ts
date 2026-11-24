import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeStudioAssetSnapshotMedia } from "./durable-snapshot-media";

test("durable snapshot media sanitizer removes nested inline URLs but preserves editing metadata", () => {
  const result = sanitizeStudioAssetSnapshotMedia({
    version: 2,
    renderStage: "final",
    draft: {
      scriptText: "data:는 대본 안의 일반 텍스트로 남아야 합니다.",
      slides: [
        {
          title: "장면",
          text: "본문",
          lines: ["본문"],
          layout: "photo+body",
          imageUrl: "data:image/png;base64,AAAA",
          imageSelection: {
            intent: "news",
            queryCandidates: ["검색어"],
            candidateOptions: [
              { provider: "naver", candidateId: "inline", imageUrl: "blob:http://localhost/inline" },
              { provider: "naver", candidateId: "durable", imageUrl: "https://cdn.example.com/image.jpg" },
            ],
            selectedCandidateId: "inline",
          },
          manualImagePrompt: {
            source: "codex",
            mascotName: "캐릭터",
            basePrompt: "기준",
            scenePrompt: "장면",
            finalPrompt: "최종",
            anchorImageUrl: "data:image/png;base64,BBBB",
            usesFallbackMascot: false,
          },
          imageBeats: [
            {
              beatId: "beat-1",
              startLineIndex: 0,
              mediaUrl: "blob:http://localhost/beat",
              reason: "편집 이유",
            },
          ],
          sfxCue: { enabled: true, tag: "impact", gainDb: -3, offsetMs: 100, source: "manual" },
        },
      ],
    },
  });

  const slide = result.snapshot.draft?.slides?.[0];
  assert.equal(result.removedCount, 4);
  assert.equal(result.snapshot.draft?.nonDurableMediaRemoved, true);
  assert.equal(slide?.imageUrl, undefined);
  assert.equal(slide?.manualImagePrompt?.anchorImageUrl, undefined);
  assert.equal(slide?.imageBeats?.[0]?.mediaUrl, undefined);
  assert.equal(slide?.imageBeats?.[0]?.reason, "편집 이유");
  assert.deepEqual(slide?.imageSelection?.candidateOptions?.map((item) => item.candidateId), ["durable"]);
  assert.equal(slide?.imageSelection?.selectedCandidateId, undefined);
  assert.equal(slide?.manualImagePrompt?.finalPrompt, "최종");
  assert.equal(slide?.sfxCue?.offsetMs, 100);
  assert.equal(result.snapshot.draft?.scriptText, "data:는 대본 안의 일반 텍스트로 남아야 합니다.");
});

test("durable snapshot media sanitizer also cleans structured editor JSON", () => {
  const result = sanitizeStudioAssetSnapshotMedia({
    version: 2,
    renderStage: "final",
    draft: {
      jsonText: JSON.stringify({
        title: "테스트",
        slides: [
          {
            title: "장면",
            text: "본문",
            lines: ["본문"],
            layout: "photo+body",
            imageUrl: "data:image/png;base64,AAAA",
          },
        ],
      }),
    },
  });

  const parsed = JSON.parse(result.snapshot.draft?.jsonText || "{}") as {
    slides?: Array<{ imageUrl?: string }>;
  };
  assert.equal(parsed.slides?.[0]?.imageUrl, undefined);
  assert.equal(result.snapshot.draft?.nonDurableMediaRemoved, true);
});

test("durable snapshot media sanitizer downgrades stale video kinds after temporary media removal", () => {
  const result = sanitizeStudioAssetSnapshotMedia({
    version: 2,
    renderStage: "final",
    draft: {
      slides: [
        {
          title: "장면",
          text: "본문",
          lines: ["본문"],
          layout: "photo+body",
          imageUrl: "https://cdn.example.com/slide.jpg",
          mediaUrl: "blob:http://localhost/slide-video",
          mediaKind: "video",
          imageSelection: {
            intent: "news",
            queryCandidates: ["장면"],
            candidateOptions: [
              {
                provider: "naver",
                candidateId: "candidate",
                imageUrl: "https://cdn.example.com/candidate.jpg",
                mediaUrl: "blob:http://localhost/candidate-video",
                mediaKind: "video",
              },
            ],
          },
          imageBeats: [
            {
              beatId: "beat-1",
              startLineIndex: 0,
              imageUrl: "https://cdn.example.com/beat.jpg",
              mediaUrl: "blob:http://localhost/beat-video",
              mediaKind: "video",
            },
          ],
        },
      ],
      preselectedMediaItems: [
        {
          id: "library-1",
          source: "library",
          title: "라이브러리 썸네일",
          imageUrl: "https://cdn.example.com/library.jpg",
          mediaUrl: "blob:http://localhost/library-video",
          mediaKind: "video",
          createdAtMs: 1,
        },
      ],
    },
  });

  const slide = result.snapshot.draft?.slides?.[0];
  assert.equal(result.removedCount, 4);
  assert.equal(slide?.mediaUrl, undefined);
  assert.equal(slide?.mediaKind, "image");
  assert.equal(slide?.imageSelection?.candidateOptions?.[0]?.mediaKind, "image");
  assert.equal(slide?.imageBeats?.[0]?.mediaKind, "image");
  assert.equal(result.snapshot.draft?.preselectedMediaItems?.[0]?.mediaKind, "image");
});

test("durable snapshot media sanitizer strips transient anchor credentials from fields and prompt text", () => {
  const result = sanitizeStudioAssetSnapshotMedia({
    version: 2,
    renderStage: "final",
    draft: {
      projectProfileSnapshot: {
        version: 1,
        projectId: "project-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        contentProfile: {
          category: "story",
          label: "스토리",
          metadataSnapshot: {
            description: "",
            tags: [],
            ttsVoiceId: "",
            bgmEnabled: false,
            bgmTrackId: "",
            mixPresetId: "",
            sfxEnabled: false,
            sfxMasterGainDb: 0,
            templateNotes: "",
            topicToScriptPrompt: "",
            scriptToJsonPrompt: "",
            mascotAnchorImageUrl: "https://profile:secret@assets.example.com/mascot.png?signature=profile#view",
          },
        },
      },
      slides: [
        {
          title: "장면",
          text: "본문",
          lines: ["본문"],
          layout: "photo+body",
          manualImagePrompt: {
            source: "codex",
            mascotName: "주인공",
            basePrompt: "기준 이미지 URL=https://user:pass@assets.example.com/anchor.png?token=abc#preview.",
            scenePrompt: "장면",
            finalPrompt: "참고 https://assets.example.com/anchor.png?token=abc#preview",
            anchorImageUrl: "https://user:pass@assets.example.com/anchor.png?token=abc#preview",
            usesFallbackMascot: false,
          },
        },
      ],
      jsonText: JSON.stringify({
        slides: [
          {
            manualImagePrompt: {
              anchorImageUrl: "https://json:secret@assets.example.com/anchor.png?token=json-secret#preview",
              basePrompt: "기준 https://json:secret@assets.example.com/anchor.png?token=json-secret#preview",
              finalPrompt: "최종 https://assets.example.com/anchor.png?token=json-secret#preview",
            },
          },
        ],
      }),
    },
  });

  const draft = result.snapshot.draft;
  const prompt = draft?.slides?.[0]?.manualImagePrompt;
  assert.equal(prompt?.anchorImageUrl, "https://assets.example.com/anchor.png");
  assert.equal(
    draft?.projectProfileSnapshot?.contentProfile.metadataSnapshot?.mascotAnchorImageUrl,
    "https://assets.example.com/mascot.png"
  );
  assert.doesNotMatch(prompt?.basePrompt || "", /user:pass|token=abc|#preview/);
  assert.doesNotMatch(prompt?.finalPrompt || "", /token=abc|#preview/);
  const jsonDraft = JSON.parse(draft?.jsonText || "{}") as {
    slides?: Array<{ manualImagePrompt?: { anchorImageUrl?: string; basePrompt?: string; finalPrompt?: string } }>;
  };
  const jsonPrompt = jsonDraft.slides?.[0]?.manualImagePrompt;
  assert.equal(jsonPrompt?.anchorImageUrl, "https://assets.example.com/anchor.png");
  assert.doesNotMatch(jsonPrompt?.basePrompt || "", /json:secret|token=json-secret|#preview/);
  assert.doesNotMatch(jsonPrompt?.finalPrompt || "", /token=json-secret|#preview/);
});

test("durable snapshot media sanitizer drops dangerous keys without changing object prototypes", () => {
  const malicious = JSON.parse(`{
    "version": 2,
    "renderStage": "draft",
    "draft": {
      "__proto__": {
        "workName": "inherited work",
        "publishCategory": "default",
        "templateId": "default",
        "slides": [{ "title": "inherited slide" }]
      },
      "constructor": { "prototype": { "polluted": true } },
      "prototype": { "polluted": true }
    }
  }`) as Parameters<typeof sanitizeStudioAssetSnapshotMedia>[0];

  const result = sanitizeStudioAssetSnapshotMedia(malicious);
  const draft = result.snapshot.draft as Record<string, unknown> | undefined;

  assert.equal(Object.getPrototypeOf(result.snapshot), Object.prototype);
  assert.equal(Object.getPrototypeOf(draft), Object.prototype);
  assert.equal(Object.hasOwn(draft || {}, "__proto__"), false);
  assert.equal(Object.hasOwn(draft || {}, "constructor"), false);
  assert.equal(Object.hasOwn(draft || {}, "prototype"), false);
  assert.equal(draft?.workName, undefined);
  assert.equal(draft?.slides, undefined);
});

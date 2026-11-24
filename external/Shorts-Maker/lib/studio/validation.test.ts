import assert from "node:assert/strict";
import test from "node:test";
import { parsePrepareRequest, parseRenderRequest, parseStudioNativeRenderRequest } from "./validation";

test("parsePrepareRequest preserves project profile snapshot and rejects mismatched categories", () => {
  const parsed = parsePrepareRequest({
    publishCategory: "news",
    projectProfileSnapshot: {
      version: 1,
      projectId: "project-1",
      createdAt: "2026-07-20T00:00:00.000Z",
      contentProfile: {
        category: "news",
        label: "뉴스",
        metadataSnapshot: {
          description: "snapshot",
          tags: ["뉴스"],
          ttsVoiceId: "",
          bgmEnabled: true,
          bgmTrackId: "bgm",
          mixPresetId: "mix",
          sfxEnabled: true,
          sfxMasterGainDb: 2,
          templateNotes: "",
          topicToScriptPrompt: "snapshot topic",
          scriptToJsonPrompt: "snapshot script",
        },
      },
    },
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: [
      {
        text: "본문",
        lines: ["본문"],
      },
    ],
  });

  assert.equal(parsed.projectProfileSnapshot?.contentProfile.category, "news");
  assert.equal(parsed.projectProfileSnapshot?.contentProfile.metadataSnapshot?.topicToScriptPrompt, "snapshot topic");
  assert.throws(
    () =>
      parsePrepareRequest({
        publishCategory: "news",
        projectProfileSnapshot: {
          version: 1,
          projectId: "project-1",
          createdAt: "2026-07-20T00:00:00.000Z",
          contentProfile: {
            category: "other",
            label: "다른 프로필",
            metadataSnapshot: null,
          },
        },
        imagePolicy: {
          source: "crawl-only",
          allowGenerated: false,
          fallback: "body-only",
        },
        slides: [
          {
            text: "본문",
            lines: ["본문"],
          },
        ],
      }),
    /projectProfileSnapshot is invalid or does not match publishCategory/
  );
  assert.throws(
    () =>
      parsePrepareRequest({
        projectProfileSnapshot: {
          version: 1,
          projectId: "project-1",
          createdAt: "2026-07-20T00:00:00.000Z",
          contentProfile: {
            category: "news",
            label: "뉴스",
            metadataSnapshot: null,
          },
        },
        imagePolicy: {
          source: "crawl-only",
          allowGenerated: false,
          fallback: "body-only",
        },
        slides: [{ text: "본문", lines: ["본문"] }],
      }),
    /projectProfileSnapshot is invalid or does not match publishCategory/
  );
});

test("parsePrepareRequest preserves manual image prompt payload on slides", () => {
  const parsed = parsePrepareRequest({
    publishCategory: "news",
    videoMode: "segments",
    imageStylePrompt: "warm editorial illustration, beige and mint palette",
    fixedCharacterProfileId: "saved_hero",
    imagePolicy: {
      source: "manual-ai-prompt",
      allowGenerated: true,
      fallback: "body-only",
    },
    characterProfiles: [
      {
        characterId: "female_1",
        displayName: "도서관 여자",
        identityPrompt: "20대 여자 대학생, 긴 생머리, 베이지 가디건",
      },
    ],
    slides: [
      {
        text: "본문",
        lines: ["본문"],
        characterIds: ["female_1"],
        manualImagePrompt: {
          source: "codex",
          mascotName: "브리피",
          characterIds: ["female_1"],
          characterNames: ["도서관 여자"],
          characterSummary: "도서관 여자",
          basePrompt: "base prompt",
          scenePrompt: "scene prompt",
          finalPrompt: "final prompt",
          emotion: "자신감",
          usesFallbackMascot: false,
        },
      },
    ],
  });

  assert.equal(parsed.slides.length, 1);
  assert.equal(parsed.slides[0]?.manualImagePrompt?.source, "codex");
  assert.equal(parsed.slides[0]?.manualImagePrompt?.mascotName, "브리피");
  assert.equal(parsed.imageStylePrompt, "warm editorial illustration, beige and mint palette");
  assert.equal(parsed.fixedCharacterProfileId, "saved_hero");
  assert.deepEqual(parsed.characterProfiles, [
    {
      characterId: "female_1",
      displayName: "도서관 여자",
      identityPrompt: "20대 여자 대학생, 긴 생머리, 베이지 가디건",
    },
  ]);
  assert.deepEqual(parsed.slides[0]?.characterIds, ["female_1"]);
  assert.deepEqual(parsed.slides[0]?.manualImagePrompt?.characterIds, ["female_1"]);
  assert.deepEqual(parsed.slides[0]?.manualImagePrompt?.characterNames, ["도서관 여자"]);
  assert.equal(parsed.slides[0]?.manualImagePrompt?.characterSummary, "도서관 여자");
  assert.equal(parsed.slides[0]?.manualImagePrompt?.basePrompt, "base prompt");
  assert.equal(parsed.slides[0]?.manualImagePrompt?.scenePrompt, "scene prompt");
  assert.equal(parsed.slides[0]?.manualImagePrompt?.finalPrompt, "final prompt");
  assert.equal(parsed.slides[0]?.manualImagePrompt?.emotion, "자신감");
  assert.equal(parsed.slides[0]?.manualImagePrompt?.usesFallbackMascot, false);
});

test("parsePrepareRequest accepts auto AI generation image source", () => {
  const parsed = parsePrepareRequest({
    publishCategory: "news",
    videoMode: "segments",
    imagePolicy: {
      source: "auto-ai-generate",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: [
      {
        text: "본문",
        lines: ["본문"],
      },
    ],
  });

  assert.equal(parsed.imagePolicy.source, "auto-ai-generate");
  assert.equal(parsed.imagePolicy.allowGenerated, true);
});

test("parsePrepareRequest preserves sfxPlan enabled and source metadata", () => {
  const parsed = parsePrepareRequest({
    publishCategory: "news",
    videoMode: "segments",
    imagePolicy: {
      source: "manual-ai-prompt",
      allowGenerated: true,
      fallback: "body-only",
    },
    slides: [
      {
        text: "첫 줄\n둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        sfxPlan: [
          {
            lineIndex: 1.8,
            enabled: false,
            tag: "강조 효과음",
            gainDb: 30,
            offsetMs: -1600,
            source: "manual",
          },
        ],
      },
    ],
  });

  assert.deepEqual(parsed.slides[0]?.sfxPlan, [
    {
      lineIndex: 1,
      enabled: false,
      tag: "강조 효과음",
      gainDb: 12,
      offsetMs: -1200,
      source: "manual",
    },
  ]);
});

test("parsePrepareRequest normalizes explicit per-line speed and pause overrides", () => {
  const parsed = parsePrepareRequest({
    publishCategory: "news",
    videoMode: "segments",
    slides: [
      {
        text: "첫 줄\n둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        dialogueSegments: [
          { type: "narration", text: "첫 줄", speed: 0.1, pauseAfterMs: -20 },
          { type: "quote", text: "둘째 줄", speed: "2.8", pauseAfterMs: "4500.9" },
          { type: "narration", text: "기본값", speed: "", pauseAfterMs: "invalid" },
        ],
      },
    ],
  });

  assert.equal(parsed.slides[0]?.dialogueSegments?.[0]?.speed, 0.5);
  assert.equal(parsed.slides[0]?.dialogueSegments?.[0]?.pauseAfterMs, 0);
  assert.equal(parsed.slides[0]?.dialogueSegments?.[1]?.speed, 2);
  assert.equal(parsed.slides[0]?.dialogueSegments?.[1]?.pauseAfterMs, 3000);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.slides[0]?.dialogueSegments?.[2] || {}, "speed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.slides[0]?.dialogueSegments?.[2] || {}, "pauseAfterMs"), false);
});

test("parseStudioNativeRenderRequest preserves clamped segment pause duration", () => {
  const parsed = parseStudioNativeRenderRequest({
    narration: {
      mode: "segments",
      segments: [
        { segmentId: "first", groupId: 0, audioBase64: "AAAA", durationMs: 3100, pauseAfterMs: 4500.9 },
        { segmentId: "second", groupId: 1, audioBase64: "BBBB", durationMs: 500, pauseAfterMs: -40 },
      ],
    },
    durationMs: 3600,
    frameDurationsSec: [1.8, 1.8],
    asset: {
      title: "렌더 결과",
      publishCategory: "news",
      studioSnapshot: {
        version: 2,
        renderStage: "final",
        createdAtMs: 123,
        ignored: "discarded",
        draft: {
          workName: "다시 열 작업",
          playbackRate: 9,
          unexpected: "discarded",
        },
      },
    },
    visuals: {
      slides: [
        { text: "첫 줄", lines: ["첫 줄"] },
        { text: "둘째 줄", lines: ["둘째 줄"] },
      ],
      branding: {
        headerColor: "#111111",
        footerColor: "#222222",
        fontFamily: "sans-serif",
      },
      templateId: "default",
      templateImageEnabled: false,
      templateImageLayout: {
        headerTitleSlot: { x: 0.1, y: 0.01, w: 0.4, h: 0.04 },
        headerAccentSlot: { x: 0.6, y: 0.01, w: 0.3, h: 0.04 },
        titleSlot: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
        bodySlot: { x: 0.1, y: 0.3, w: 0.8, h: 0.2 },
        imageSlot: { x: 0.1, y: 0.5, w: 0.8, h: 0.3 },
        infoSlot: { x: 0.1, y: 0.9, w: 0.8, h: 0.04 },
      },
      templateLayoutApply: { title: true, body: true, image: true, info: true },
    },
  });

  const narration = parsed.narration;
  assert.equal(narration?.mode, "segments");
  if (!narration || narration.mode !== "segments") return;
  assert.equal(narration.segments[0]?.pauseAfterMs, 3000);
  assert.equal(narration.segments[1]?.pauseAfterMs, 0);
  assert.equal(parsed.asset?.studioSnapshot?.version, 2);
  assert.equal(parsed.asset?.studioSnapshot?.renderStage, "final");
  assert.equal(parsed.asset?.studioSnapshot?.createdAtMs, 123);
  assert.equal(parsed.asset?.studioSnapshot?.draft?.workName, "다시 열 작업");
  assert.equal(parsed.asset?.studioSnapshot?.draft?.playbackRate, 3);
  assert.equal("unexpected" in (parsed.asset?.studioSnapshot?.draft || {}), false);
  assert.equal("ignored" in (parsed.asset?.studioSnapshot || {}), false);
});

test("parseStudioNativeRenderRequest clamps render playback rate to the editor range", () => {
  const buildRequest = (playbackRate: number) => ({
    narration: {
      mode: "singleAudio",
      fullAudio: "AAAA",
    },
    durationMs: 1000,
    frameDurationsSec: [1],
    audioOptions: { playbackRate },
    visuals: {
      slides: [{ text: "한 줄", lines: ["한 줄"] }],
      branding: {
        headerColor: "#111111",
        footerColor: "#222222",
        fontFamily: "sans-serif",
      },
      templateId: "default",
      templateImageEnabled: false,
      templateImageLayout: {
        headerTitleSlot: { x: 0.1, y: 0.01, w: 0.4, h: 0.04 },
        headerAccentSlot: { x: 0.6, y: 0.01, w: 0.3, h: 0.04 },
        titleSlot: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
        bodySlot: { x: 0.1, y: 0.3, w: 0.8, h: 0.2 },
        imageSlot: { x: 0.1, y: 0.5, w: 0.8, h: 0.3 },
        infoSlot: { x: 0.1, y: 0.9, w: 0.8, h: 0.04 },
      },
      templateLayoutApply: { title: true, body: true, image: true, info: true },
    },
  });
  const low = parseStudioNativeRenderRequest(buildRequest(0.2));
  const high = parseStudioNativeRenderRequest(buildRequest(8));

  assert.equal(low.audioOptions?.playbackRate, 0.8);
  assert.equal(high.audioOptions?.playbackRate, 3);
});

test("parseRenderRequest preserves persisted image provenance", () => {
  const parsed = parseRenderRequest({
    videoMode: "singleAudio",
    slides: [
      {
        title: "자동 이미지",
        text: "본문",
        lines: ["본문"],
        imageUrl: "https://example.com/auto.png",
        resolvedImageUrl: "https://example.com/resolved-auto.png",
        resolvedBy: "crawl",
        imageSelection: {
          intent: "news",
          queryCandidates: ["automatic query"],
          selectedQuery: "automatic query",
          provider: "naver",
          selectedCandidateId: "naver:auto",
          selectionReason: "automatic provider selection: naver",
        },
      },
    ],
  });

  assert.equal(parsed.slides[0]?.resolvedImageUrl, "https://example.com/resolved-auto.png");
  assert.equal(parsed.slides[0]?.resolvedBy, "crawl");
  assert.deepEqual(parsed.slides[0]?.imageSelection, {
    intent: "news",
    queryCandidates: ["automatic query"],
    selectedQuery: "automatic query",
    provider: "naver",
    providerCandidates: undefined,
    candidateOptions: undefined,
    selectedCandidateId: "naver:auto",
    selectionReason: "automatic provider selection: naver",
    scoreBreakdown: undefined,
  });
});

test("parseRenderRequest preserves image beat media provenance", () => {
  const parsed = parseRenderRequest({
    videoMode: "singleAudio",
    slides: [
      {
        title: "전환",
        text: "첫 줄\n둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        imageBeats: [
          {
            beatId: "manual-right",
            startLineIndex: 1,
            imageUrl: "https://example.com/manual.png",
            resolvedImageUrl: "https://example.com/manual-resolved.png",
            resolvedBy: "direct",
            mediaUrl: "https://example.com/manual.mp4",
            mediaKind: "video",
            imageSelection: {
              intent: "library",
              queryCandidates: [],
              selectedCandidateId: "library:manual",
              selectionReason: "manual library selection",
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(parsed.slides[0]?.imageBeats?.[0], {
    beatId: "manual-right",
    startLineIndex: 1,
    clearVisual: undefined,
    imageUrl: "https://example.com/manual.png",
    resolvedImageUrl: "https://example.com/manual-resolved.png",
    resolvedBy: "direct",
    mediaUrl: "https://example.com/manual.mp4",
    mediaKind: "video",
    imageSelection: {
      intent: "library",
      queryCandidates: [],
      selectedQuery: undefined,
      provider: undefined,
      providerCandidates: undefined,
      candidateOptions: undefined,
      selectedCandidateId: "library:manual",
      selectionReason: "manual library selection",
      scoreBreakdown: undefined,
    },
    imageRequest: undefined,
    reason: undefined,
  });
});

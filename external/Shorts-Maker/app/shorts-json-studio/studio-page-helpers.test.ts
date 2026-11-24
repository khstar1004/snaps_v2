import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide, SlideManualImagePrompt } from "@/types/studio-json";
import {
  assignDialogueSegmentSpeakerInScriptJson,
  applyStudioImageSearchSourceToPreparePayload,
  extractDialogueSpeakerAssignmentRows,
  extractSpeakerVoiceRows,
  extractStoryCharacterProfileRows,
  hasScriptJsonImagePromptInputsChanged,
  hasScriptJsonPreparedContentChanged,
  hasManualPreparedMedia,
  hydrateRenderedSlidesWithPrepared,
  mergePreparedSlidesPreservingManualMedia,
  mergePreparedSlidesPreservingSfx,
  mergeSlidesPreservingMedia,
  normalizeScriptJsonSlidesPayload,
  syncPreparedSlideCharactersFromScriptJson,
  syncPreparedSlideDialogueSegmentsFromScriptJson,
  toRenderCompatibleSlidePayload,
  toPrepareCompatibleSlidePayload,
  toServerRenderVisualSlides,
} from "./studio-page-helpers";

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "테스트 슬라이드",
    text: "첫 줄",
    lines: ["첫 줄"],
    layout: "photo+body",
    ...overrides,
  };
}

function makeManualImagePrompt(finalPrompt: string): SlideManualImagePrompt {
  return {
    source: "codex",
    mascotName: "테스트 캐릭터",
    basePrompt: "테스트 기본 프롬프트",
    scenePrompt: "테스트 장면 프롬프트",
    finalPrompt,
    usesFallbackMascot: false,
  };
}

test("hydrateRenderedSlidesWithPrepared keeps editing metadata when rendered media is already resolved", () => {
  const source = makeSlide({
    groupId: 4,
    stepIndex: 0,
    imageSelection: {
      intent: "news",
      queryCandidates: ["검색어"],
      selectedCandidateId: "candidate-1",
    },
    imageRequest: { query: "검색어", scene: "편집 장면" },
    manualImagePrompt: makeManualImagePrompt("최종 프롬프트"),
    sfxCue: { enabled: true, tag: "impact", gainDb: -3, offsetMs: 120, source: "manual" },
  });
  const rendered = makeSlide({
    groupId: 4,
    stepIndex: 0,
    imageUrl: "https://cdn.example.com/resolved.jpg",
    resolvedImageUrl: "https://cdn.example.com/resolved.jpg",
    resolvedBy: "crawl",
  });

  const [hydrated] = hydrateRenderedSlidesWithPrepared([rendered], [source]);

  assert.equal(hydrated.imageUrl, "https://cdn.example.com/resolved.jpg");
  assert.equal(hydrated.imageSelection?.selectedCandidateId, "candidate-1");
  assert.equal(hydrated.imageRequest?.scene, "편집 장면");
  assert.equal(hydrated.manualImagePrompt?.finalPrompt, "최종 프롬프트");
  assert.deepEqual(hydrated.sfxCue, source.sfxCue);
});

test("mergePreparedSlidesPreservingSfx preserves manual cue when prepare output omits it", () => {
  const currentSlides: PreparedSlide[] = [
    makeSlide({
      text: "첫 줄",
      lines: ["첫 줄"],
      groupId: 3,
      stepIndex: 0,
      sfxPlan: [{ lineIndex: 0, tag: "일반 효과음", gainDb: -3 }],
      sfxCue: { enabled: true, tag: "수동 효과음", gainDb: -3, source: "manual" },
    }),
    makeSlide({
      text: "둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      groupId: 3,
      stepIndex: 1,
      sfxPlan: [{ lineIndex: 1, tag: "file:재미/7. 뿅", offsetMs: 120 }],
      sfxCue: { enabled: true, tag: "다른 수동 효과음", offsetMs: 120, source: "manual" },
    }),
  ];

  const preparedSlides: PreparedSlide[] = [
    makeSlide({
      text: "첫 줄",
      lines: ["첫 줄"],
      groupId: 3,
      stepIndex: 0,
    }),
    makeSlide({
      text: "둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      groupId: 3,
      stepIndex: 1,
    }),
  ];

  const merged = mergePreparedSlidesPreservingSfx(preparedSlides, currentSlides);

  assert.deepEqual(merged.map((slide) => slide.sfxCue), currentSlides.map((slide) => slide.sfxCue));
  assert.deepEqual(merged.map((slide) => slide.sfxPlan), [undefined, undefined]);
});

test("mergePreparedSlidesPreservingSfx keeps freshly prepared sfx instead of stale current values", () => {
  const currentSlides: PreparedSlide[] = [
    makeSlide({
      groupId: 5,
      stepIndex: 0,
      sfxPlan: [{ lineIndex: 0, tag: "old-tag" }],
      sfxCue: { enabled: true, tag: "old-tag", source: "auto" },
    }),
  ];

  const preparedSlides: PreparedSlide[] = [
    makeSlide({
      groupId: 5,
      stepIndex: 0,
      sfxPlan: [{ lineIndex: 0, tag: "new-tag", gainDb: 2 }],
      sfxCue: { enabled: true, tag: "new-tag", gainDb: 2, source: "auto" },
    }),
  ];

  const merged = mergePreparedSlidesPreservingSfx(preparedSlides, currentSlides);

  assert.deepEqual(merged[0]?.sfxPlan, preparedSlides[0]?.sfxPlan);
  assert.deepEqual(merged[0]?.sfxCue, preparedSlides[0]?.sfxCue);
});

test("mergePreparedSlidesPreservingSfx keeps an existing manual cue ahead of freshly prepared auto SFX", () => {
  const currentSlides: PreparedSlide[] = [
    makeSlide({
      groupId: 6,
      stepIndex: 0,
      sfxCue: { enabled: false, tag: "수동 효과음", gainDb: -4, source: "manual" },
    }),
  ];
  const preparedSlides: PreparedSlide[] = [
    makeSlide({
      groupId: 6,
      stepIndex: 0,
      sfxPlan: [{ lineIndex: 0, tag: "자동 효과음", source: "auto" }],
      sfxCue: { enabled: true, tag: "자동 효과음", source: "auto" },
    }),
  ];

  const merged = mergePreparedSlidesPreservingSfx(preparedSlides, currentSlides);

  assert.deepEqual(merged[0]?.sfxCue, currentSlides[0]?.sfxCue);
  assert.deepEqual(merged[0]?.sfxPlan, preparedSlides[0]?.sfxPlan);
});

test("mergePreparedSlidesPreservingSfx drops stale auto and source-less cues when prepare output omits them", () => {
  const preparedSlides: PreparedSlide[] = [
    makeSlide({ groupId: 7, stepIndex: 0 }),
    makeSlide({ groupId: 7, stepIndex: 1 }),
  ];

  const currentSlides: PreparedSlide[] = [
    makeSlide({
      groupId: 7,
      stepIndex: 0,
      sfxPlan: [{ lineIndex: 0, tag: "자동 효과음" }],
      sfxCue: { enabled: true, tag: "자동 효과음", source: "auto" },
    }),
    makeSlide({
      groupId: 7,
      stepIndex: 1,
      sfxCue: { enabled: true, tag: "출처 없는 효과음" },
    }),
  ];

  const merged = mergePreparedSlidesPreservingSfx(preparedSlides, currentSlides);

  assert.deepEqual(
    merged.map((slide) => ({ sfxPlan: slide.sfxPlan, sfxCue: slide.sfxCue })),
    [
      { sfxPlan: undefined, sfxCue: undefined },
      { sfxPlan: undefined, sfxCue: undefined },
    ]
  );
});

test("mergePreparedSlidesPreservingSfx does not spread a later manual cue to earlier steps", () => {
  const prepared = [
    makeSlide({ groupId: 31, stepIndex: 0 }),
    makeSlide({ groupId: 31, stepIndex: 1 }),
  ];
  const current = [
    makeSlide({ groupId: 31, stepIndex: 0 }),
    makeSlide({
      groupId: 31,
      stepIndex: 1,
      sfxCue: { enabled: false, tag: "수동 효과음", source: "manual" },
    }),
  ];

  const merged = mergePreparedSlidesPreservingSfx(prepared, current);

  assert.equal(merged[0]?.sfxCue, undefined);
  assert.deepEqual(merged[1]?.sfxCue, current[1]?.sfxCue);
});

test("hasManualPreparedMedia rejects derived direct and fallback assets before direct-url checks", () => {
  assert.equal(
    hasManualPreparedMedia(
      makeSlide({
        imageUrl: "https://example.com/codex.png",
        resolvedBy: "direct",
        imageSelection: {
          intent: "generated",
          queryCandidates: [],
          selectionReason: "codex generated asset: old scene",
        },
      })
    ),
    false
  );
  assert.equal(
    hasManualPreparedMedia(
      makeSlide({
        imageUrl: "data:image/svg+xml;base64,AAAA",
        resolvedBy: "fallback",
      })
    ),
    false
  );
  assert.equal(
    hasManualPreparedMedia(
      makeSlide({
        imageUrl: "https://example.com/manual.png",
        resolvedBy: "crawl",
        imageSelection: {
          intent: "news",
          queryCandidates: [],
          selectionReason: "manual provider candidate selection: naver",
        },
      })
    ),
    true
  );
});

test("mergePreparedSlidesPreservingManualMedia does not restore a stale Codex-generated direct asset", () => {
  const prepared = [makeSlide({ imageUrl: undefined })];
  const current = [
    makeSlide({
      imageUrl: "https://example.com/codex.png",
      resolvedImageUrl: "https://example.com/codex.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "generated",
        queryCandidates: [],
        selectionReason: "codex generated asset: old scene",
      },
    }),
  ];

  const merged = mergePreparedSlidesPreservingManualMedia(prepared, current);

  assert.equal(merged[0]?.imageUrl, undefined);
  assert.equal(merged[0]?.resolvedImageUrl, undefined);
});

test("mergePreparedSlidesPreservingManualMedia does not spread a later frame asset to earlier steps", () => {
  const prepared = [
    makeSlide({ groupId: 30, stepIndex: 0 }),
    makeSlide({ groupId: 30, stepIndex: 1 }),
  ];
  const current = [
    makeSlide({ groupId: 30, stepIndex: 0 }),
    makeSlide({
      groupId: 30,
      stepIndex: 1,
      imageUrl: "https://example.com/manual-right.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:right",
        selectionReason: "manual library selection",
      },
    }),
  ];

  const merged = mergePreparedSlidesPreservingManualMedia(prepared, current);

  assert.equal(merged[0]?.imageUrl, undefined);
  assert.equal(merged[1]?.imageUrl, "https://example.com/manual-right.png");
});

test("prepare restoration matches manual media and SFX by visual source ordinal when group ids are renumbered", () => {
  const current = [
    makeSlide({ groupId: 9, stepIndex: 0 }),
    makeSlide({
      groupId: 9,
      stepIndex: 1,
      imageUrl: "https://example.com/manual-right.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:right",
        selectionReason: "manual library selection",
      },
      sfxCue: { enabled: false, tag: "수동 효과음", source: "manual" },
    }),
  ];
  const prepared = [
    makeSlide({ groupId: 0, stepIndex: 0 }),
    makeSlide({ groupId: 0, stepIndex: 1 }),
  ];

  const mediaMerged = mergePreparedSlidesPreservingManualMedia(prepared, current);
  const sfxMerged = mergePreparedSlidesPreservingSfx(prepared, current);

  assert.equal(mediaMerged[0]?.imageUrl, undefined);
  assert.equal(mediaMerged[1]?.imageUrl, "https://example.com/manual-right.png");
  assert.equal(sfxMerged[0]?.sfxCue, undefined);
  assert.deepEqual(sfxMerged[1]?.sfxCue, current[1]?.sfxCue);
});

test("mergeSlidesPreservingMedia keeps only explicit manual cues after script text changes", () => {
  const currentSlides = [
    makeSlide({ sfxCue: { enabled: true, tag: "자동 효과음", source: "auto" } }),
    makeSlide({ sfxCue: { enabled: true, tag: "수동 효과음", source: "manual" } }),
    makeSlide({ sfxCue: { enabled: true, tag: "출처 없는 효과음" } }),
  ];
  const nextJson = {
    title: "새 대본",
    slides: [
      { text: "새 첫 줄", lines: ["새 첫 줄"], layout: "photo+body" },
      { text: "새 둘째 줄", lines: ["새 둘째 줄"], layout: "photo+body" },
      { text: "새 셋째 줄", lines: ["새 셋째 줄"], layout: "photo+body" },
    ],
  };

  const merged = mergeSlidesPreservingMedia(currentSlides, nextJson);

  assert.equal(merged[0]?.sfxCue, undefined);
  assert.deepEqual(merged[1]?.sfxCue, { enabled: true, tag: "수동 효과음", source: "manual" });
  assert.equal(merged[2]?.sfxCue, undefined);
  assert.deepEqual(merged.map((slide) => slide.sfxPlan), [undefined, undefined, undefined]);
});

test("mergeSlidesPreservingMedia collapses later grouped manual cues into the matching source slide", () => {
  const currentSlides = [
    makeSlide({
      text: "첫 줄",
      lines: ["첫 줄"],
      groupId: 12,
      stepIndex: 0,
      sfxCue: { enabled: true, tag: "자동 효과음", source: "auto" },
    }),
    makeSlide({
      text: "둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      groupId: 12,
      stepIndex: 1,
      sfxCue: { enabled: false, tag: "수동 효과음", gainDb: -3, offsetMs: 80, source: "manual" },
    }),
  ];
  const nextJson = {
    title: "새 대본",
    slides: [{ text: "새 첫 줄\n새 둘째 줄", lines: ["새 첫 줄", "새 둘째 줄"], layout: "photo+body" }],
  };

  const merged = mergeSlidesPreservingMedia(currentSlides, nextJson);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.sfxCue, undefined);
  assert.deepEqual(merged[0]?.sfxPlan, [
    { lineIndex: 1, enabled: false, tag: "수동 효과음", gainDb: -3, offsetMs: 80, source: "manual" },
  ]);
});

test("mergeSlidesPreservingMedia clears derived assets and preserves a later manual asset as a timed beat", () => {
  const currentSlides = [
    makeSlide({
      text: "첫 줄",
      lines: ["첫 줄"],
      groupId: 20,
      stepIndex: 0,
      imageUrl: "https://example.com/automatic.png",
      resolvedImageUrl: "https://example.com/automatic.png",
      resolvedBy: "crawl",
    }),
    makeSlide({
      text: "둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      groupId: 20,
      stepIndex: 1,
      imageUrl: "https://example.com/manual.png",
      resolvedImageUrl: "https://example.com/manual.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:manual",
        selectionReason: "manual library selection",
      },
    }),
    makeSlide({
      imageUrl: "https://example.com/codex.png",
      resolvedImageUrl: "https://example.com/codex.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "generated",
        queryCandidates: [],
        selectionReason: "codex generated asset: stale scene",
      },
    }),
  ];
  const nextJson = {
    title: "새 대본",
    slides: [
      { text: "새 그룹 본문", lines: ["새 그룹 본문"], layout: "photo+body" },
      { text: "새 단독 본문", lines: ["새 단독 본문"], layout: "photo+body" },
    ],
  };

  const merged = mergeSlidesPreservingMedia(currentSlides, nextJson);

  assert.equal(merged[0]?.imageUrl, undefined);
  assert.equal(merged[0]?.imageSelection, undefined);
  assert.deepEqual(merged[0]?.imageBeats, [
    {
      beatId: "manual:1",
      startLineIndex: 1,
      imageUrl: "https://example.com/manual.png",
      resolvedImageUrl: "https://example.com/manual.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:manual",
        selectionReason: "manual library selection",
      },
      mediaUrl: undefined,
      mediaKind: undefined,
      reason: "preserved manual visual after text change",
    },
  ]);
  assert.equal(merged[1]?.imageUrl, undefined);
  assert.equal(merged[1]?.resolvedImageUrl, undefined);
  assert.equal(merged[1]?.imageSelection, undefined);
});

test("normalizeScriptJsonSlidesPayload keeps manual SFX tombstones and image provenance for prepare", () => {
  const normalized = normalizeScriptJsonSlidesPayload([
    {
      text: "첫 줄\n둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      imageUrl: "https://example.com/auto.png",
      resolvedImageUrl: "https://example.com/auto-resolved.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["automatic query"],
        selectionReason: "automatic provider selection",
      },
      sfxPlan: [
        {
          lineIndex: 1,
          enabled: false,
          tag: "수동 효과음",
          gainDb: -3,
          offsetMs: 80,
          source: "manual",
        },
      ],
    },
  ]);

  assert.equal(normalized[0]?.resolvedBy, "crawl");
  assert.equal(normalized[0]?.imageSelection?.selectionReason, "automatic provider selection");
  assert.deepEqual(normalized[0]?.sfxPlan, [
    { lineIndex: 1, enabled: false, tag: "수동 효과음", gainDb: -3, offsetMs: 80, source: "manual" },
  ]);

  const preparePayload = toPrepareCompatibleSlidePayload(normalized[0] as PreparedSlide);
  assert.equal(preparePayload.resolvedImageUrl, "https://example.com/auto-resolved.png");
  assert.equal(preparePayload.resolvedBy, "crawl");
  assert.deepEqual(preparePayload.imageSelection, normalized[0]?.imageSelection);
  assert.deepEqual(preparePayload.sfxPlan, normalized[0]?.sfxPlan);
});

test("normalizeScriptJsonSlidesPayload preserves and clamps explicit dialogue timing only", () => {
  const normalized = normalizeScriptJsonSlidesPayload([
    {
      text: "첫 줄 둘째 줄 기본값",
      lines: ["첫 줄", "둘째 줄", "기본값"],
      dialogueSegments: [
        { type: "narration", text: "첫 줄", speed: "0.25", pauseAfterMs: -10 },
        { type: "quote", text: "둘째 줄", speed: 2.5, pauseAfterMs: "3500.7" },
        { type: "narration", text: "기본값", speed: "", pauseAfterMs: "invalid" },
      ],
    },
  ]);

  assert.equal(normalized[0]?.dialogueSegments?.[0]?.speed, 0.5);
  assert.equal(normalized[0]?.dialogueSegments?.[0]?.pauseAfterMs, 0);
  assert.equal(normalized[0]?.dialogueSegments?.[1]?.speed, 2);
  assert.equal(normalized[0]?.dialogueSegments?.[1]?.pauseAfterMs, 3000);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized[0]?.dialogueSegments?.[2] || {}, "speed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized[0]?.dialogueSegments?.[2] || {}, "pauseAfterMs"), false);
});

test("applyStudioImageSearchSourceToPreparePayload forces crawl providers without mutating other tuning", () => {
  const payload = applyStudioImageSearchSourceToPreparePayload(
    {
      imageSearchTuning: {
        naverNoFilter: true,
        maxQueryVariantsPerSlide: 5,
        maxCandidatesPerProvider: 1,
        providers: ["library", "giphy"],
        giphyLibraryOnly: true,
      },
    },
    "crawl"
  );

  assert.deepEqual(payload.imageSearchTuning, {
    naverNoFilter: true,
    maxQueryVariantsPerSlide: 5,
    maxCandidatesPerProvider: 3,
    providers: ["giphy", "naver"],
    giphyLibraryOnly: false,
  });
});

test("applyStudioImageSearchSourceToPreparePayload enables giphy library-only mode while keeping naver crawl", () => {
  const payload = applyStudioImageSearchSourceToPreparePayload({}, "library");

  assert.deepEqual(payload.imageSearchTuning, {
    maxCandidatesPerProvider: 3,
    providers: ["giphy", "naver"],
    giphyLibraryOnly: true,
  });
});

test("toRenderCompatibleSlidePayload strips inline image payloads but keeps remote urls and frame metadata", () => {
  const payload = toRenderCompatibleSlidePayload(
    makeSlide({
      imageUrl: "data:image/png;base64,AAAA",
      mediaUrl: "blob:http://localhost/example",
      mediaKind: "image",
      imageBeats: [
        {
          beatId: "0:0",
          startLineIndex: 0,
          imageUrl: "data:image/png;base64,BBBB",
          imageRequest: {
            query: "테스트",
          },
          reason: "first beat",
        },
        {
          beatId: "0:1",
          startLineIndex: 1,
          imageUrl: "https://images.example.com/beat.jpg",
          reason: "second beat",
        },
      ],
      groupId: 7,
      stepIndex: 1,
    })
  );

  assert.equal(payload.imageUrl, undefined);
  assert.equal(payload.mediaUrl, undefined);
  assert.deepEqual(payload.imageBeats, [
    {
      beatId: "0:0",
      startLineIndex: 0,
      clearVisual: undefined,
      imageUrl: undefined,
      resolvedImageUrl: undefined,
      resolvedBy: undefined,
      imageSelection: undefined,
      mediaUrl: undefined,
      mediaKind: undefined,
      imageRequest: {
        query: "테스트",
      },
      reason: "first beat",
    },
    {
      beatId: "0:1",
      startLineIndex: 1,
      clearVisual: undefined,
      imageUrl: "https://images.example.com/beat.jpg",
      resolvedImageUrl: undefined,
      resolvedBy: undefined,
      imageSelection: undefined,
      mediaUrl: undefined,
      mediaKind: undefined,
      imageRequest: undefined,
      reason: "second beat",
    },
  ]);
  assert.equal(payload.groupId, 7);
  assert.equal(payload.stepIndex, 1);
});

test("toRenderCompatibleSlidePayload preserves remote image provenance", () => {
  const payload = toRenderCompatibleSlidePayload(
    makeSlide({
      imageUrl: "https://example.com/auto.png",
      resolvedImageUrl: "https://example.com/auto-resolved.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["automatic query"],
        selectionReason: "automatic provider selection",
      },
    })
  );

  assert.equal(payload.resolvedImageUrl, "https://example.com/auto-resolved.png");
  assert.equal(payload.resolvedBy, "crawl");
  assert.deepEqual(payload.imageSelection, {
    intent: "news",
    queryCandidates: ["automatic query"],
    selectionReason: "automatic provider selection",
  });
});

test("toServerRenderVisualSlides strips repeated inline media on contiguous frames while preserving variant metadata", () => {
  const slides = toServerRenderVisualSlides([
    makeSlide({
      imageUrl: "data:image/png;base64,AAAA",
      groupId: 1,
      stepIndex: 0,
      imageVariantId: "1:0",
      imageVariantStartLineIndex: 0,
    }),
    makeSlide({
      imageUrl: "data:image/png;base64,AAAA",
      groupId: 1,
      stepIndex: 1,
      imageVariantId: "1:0",
      imageVariantStartLineIndex: 0,
    }),
    makeSlide({
      imageUrl: "data:image/png;base64,BBBB",
      groupId: 1,
      stepIndex: 2,
      imageVariantId: "1:1",
      imageVariantStartLineIndex: 2,
    }),
  ]);

  assert.equal(slides[0]?.imageUrl, "data:image/png;base64,AAAA");
  assert.equal(slides[1]?.imageUrl, undefined);
  assert.equal(slides[1]?.imageVariantId, "1:0");
  assert.equal(slides[2]?.imageUrl, "data:image/png;base64,BBBB");
  assert.equal(slides[2]?.imageVariantId, "1:1");
});

test("extractSpeakerVoiceRows surfaces unknown speakers with quote samples for manual assignment", () => {
  const rows = extractSpeakerVoiceRows({
    speakerVoices: {
      female_1: "voice-female",
    },
    slides: [
      {
        dialogueSegments: [
          { type: "quote", speakerId: "unknown_1", text: "여기 앉으실래요?" },
          { type: "quote", speakerId: "unknown_1", text: "오늘 뭐 공부해요?" },
          { type: "quote", speakerId: "female_1", text: "전 사실 진작에 물어볼 줄 알았어요" },
        ],
      },
    ],
  });

  assert.equal(rows[0]?.speakerId, "unknown_1");
  assert.equal(rows[0]?.isUnknown, true);
  assert.deepEqual(rows[0]?.sampleTexts, ["여기 앉으실래요?", "오늘 뭐 공부해요?"]);
  assert.equal(rows[0]?.quoteCount, 2);
  assert.equal(rows[1]?.speakerId, "female_1");
  assert.equal(rows[1]?.voiceId, "voice-female");
});

test("extractDialogueSpeakerAssignmentRows returns quote rows with slide and segment indexes", () => {
  const rows = extractDialogueSpeakerAssignmentRows({
    title: "테스트 작업",
    slides: [
      {
        title: "첫 장면",
        dialogueSegments: [
          { type: "narration", text: "도입" },
          { type: "quote", speakerId: "unknown_1", text: "여기 앉으실래요?" },
        ],
      },
      {
        dialogueSegments: [{ type: "quote", text: "오늘 뭐 공부해요?" }],
      },
    ],
  });

  assert.deepEqual(rows, [
    {
      slideIndex: 0,
      segmentIndex: 1,
      speakerId: "unknown_1",
      text: "여기 앉으실래요?",
      slideTitle: "첫 장면",
    },
    {
      slideIndex: 1,
      segmentIndex: 0,
      speakerId: "",
      text: "오늘 뭐 공부해요?",
      slideTitle: "테스트 작업",
    },
  ]);
});

test("assignDialogueSegmentSpeakerInScriptJson updates a single quote and slide character ids", () => {
  const next = assignDialogueSegmentSpeakerInScriptJson(
    {
      mode: "normal",
      slides: [
        {
          characterIds: ["unknown_1", "mentor"],
          manualImagePrompt: makeManualImagePrompt("stale first prompt"),
          dialogueSegments: [
            { type: "quote", speakerId: "unknown_1", text: "여기 앉으실래요?" },
            { type: "quote", speakerId: "male_1", text: "좋아요" },
          ],
        },
        {
          text: "다른 슬라이드",
          lines: ["다른 슬라이드"],
          manualImagePrompt: makeManualImagePrompt("stale unrelated prompt"),
        },
      ],
    },
    {
      slideIndex: 0,
      segmentIndex: 0,
      speakerId: "female_1",
    }
  );

  assert.equal(next.mode, "dialogue");
  const slide = Array.isArray(next.slides) ? (next.slides[0] as Record<string, unknown>) : {};
  const segments = Array.isArray(slide.dialogueSegments) ? (slide.dialogueSegments as Array<Record<string, unknown>>) : [];
  assert.equal(segments[0]?.speakerId, "female_1");
  assert.equal(segments[1]?.speakerId, "male_1");
  assert.deepEqual(slide.characterIds, ["mentor", "female_1"]);
  assert.equal(Object.prototype.hasOwnProperty.call(slide, "manualImagePrompt"), false);
  const unrelatedSlide = Array.isArray(next.slides) ? (next.slides[1] as Record<string, unknown>) : {};
  assert.equal(Object.prototype.hasOwnProperty.call(unrelatedSlide, "manualImagePrompt"), false);
});

test("syncPreparedSlideCharactersFromScriptJson syncs grouped character ids and clears stale prompts", () => {
  const synced = syncPreparedSlideCharactersFromScriptJson(
    [
      makeSlide({
        text: "첫 프레임",
        groupId: 0,
        stepIndex: 0,
        characterIds: ["unknown_1"],
        manualImagePrompt: makeManualImagePrompt("stale group 0 prompt"),
      }),
      makeSlide({
        text: "둘째 프레임",
        groupId: 0,
        stepIndex: 1,
        characterIds: ["unknown_1"],
        manualImagePrompt: makeManualImagePrompt("stale group 0 prompt copy"),
      }),
      makeSlide({
        text: "다른 그룹",
        groupId: 1,
        stepIndex: 0,
        characterIds: ["mentor"],
        manualImagePrompt: makeManualImagePrompt("stale group 1 prompt"),
      }),
    ],
    {
      slides: [
        {
          text: "원본 0",
          lines: ["원본 0"],
          characterIds: ["female_1", "female_1", "mentor"],
          dialogueSegments: [
            { type: "narration", text: "옆에서" },
            { type: "quote", text: "안녕하세요", speakerId: "female_1" },
          ],
        },
        {
          text: "원본 1",
          lines: ["원본 1"],
        },
      ],
    }
  );

  assert.deepEqual(synced[0]?.characterIds, ["female_1", "mentor"]);
  assert.deepEqual(synced[1]?.characterIds, ["female_1", "mentor"]);
  assert.deepEqual(synced[0]?.dialogueSegments, [
    { type: "narration", text: "옆에서", speakerId: undefined, voice: undefined },
    { type: "quote", text: "안녕하세요", speakerId: "female_1", voice: undefined },
  ]);
  assert.deepEqual(synced[1]?.dialogueSegments, synced[0]?.dialogueSegments);
  assert.equal(Object.prototype.hasOwnProperty.call(synced[2] || {}, "characterIds"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(synced[2] || {}, "dialogueSegments"), false);
  for (const slide of synced) {
    assert.equal(Object.prototype.hasOwnProperty.call(slide, "manualImagePrompt"), false);
  }
});

test("syncPreparedSlideDialogueSegmentsFromScriptJson updates grouped timing without clearing approved media", () => {
  const current = [
    makeSlide({
      groupId: 0,
      stepIndex: 0,
      imageUrl: "https://example.com/approved.png",
      manualImagePrompt: makeManualImagePrompt("approved prompt"),
      dialogueSegments: [{ type: "narration", text: "첫 줄", speed: 1 }],
    }),
    makeSlide({
      groupId: 0,
      stepIndex: 1,
      imageUrl: "https://example.com/approved.png",
      manualImagePrompt: makeManualImagePrompt("approved prompt"),
      dialogueSegments: [{ type: "narration", text: "첫 줄", speed: 1 }],
    }),
  ];

  const synced = syncPreparedSlideDialogueSegmentsFromScriptJson(current, {
    slides: [
      {
        text: "첫 줄",
        lines: ["첫 줄"],
        dialogueSegments: [{ type: "narration", text: "첫 줄", speed: 1.25, pauseAfterMs: 300 }],
      },
    ],
  });

  assert.equal(synced[0]?.dialogueSegments?.[0]?.speed, 1.25);
  assert.equal(synced[1]?.dialogueSegments?.[0]?.pauseAfterMs, 300);
  assert.equal(synced[0]?.imageUrl, "https://example.com/approved.png");
  assert.equal(synced[0]?.manualImagePrompt?.finalPrompt, "approved prompt");
});

test("syncPreparedSlideCharactersFromScriptJson maps a remaining stale group id to the reordered source row", () => {
  const synced = syncPreparedSlideCharactersFromScriptJson(
    [
      makeSlide({ text: "남은 첫 프레임", groupId: 1, stepIndex: 0, characterIds: ["old"] }),
      makeSlide({ text: "남은 둘째 프레임", groupId: 1, stepIndex: 1, characterIds: ["old"] }),
    ],
    {
      slides: [
        {
          text: "앞 그룹 삭제 후 남은 원본",
          lines: ["앞 그룹 삭제 후 남은 원본"],
          characterIds: ["female_1"],
        },
      ],
    }
  );

  assert.deepEqual(synced.map((slide) => slide.characterIds), [["female_1"], ["female_1"]]);
});

test("hasScriptJsonImagePromptInputsChanged detects identity edits but ignores generated prompt edits", () => {
  const previous = {
    imageStylePrompt: "실사",
    characterProfiles: [{ characterId: "female_1", identityPrompt: "긴 머리" }],
    slides: [
      {
        text: "안녕하세요",
        lines: ["안녕하세요"],
        characterIds: ["female_1"],
        dialogueSegments: [{ type: "quote", text: "안녕하세요", speakerId: "female_1" }],
        manualImagePrompt: makeManualImagePrompt("old prompt"),
      },
    ],
  };

  assert.equal(
    hasScriptJsonImagePromptInputsChanged(previous, {
      ...previous,
      slides: [{ ...previous.slides[0], manualImagePrompt: makeManualImagePrompt("new prompt") }],
    }),
    false
  );
  assert.equal(
    hasScriptJsonImagePromptInputsChanged(previous, {
      ...previous,
      slides: [{ ...previous.slides[0], characterIds: ["male_1"] }],
    }),
    true
  );
  assert.equal(
    hasScriptJsonImagePromptInputsChanged(previous, {
      ...previous,
      characterProfiles: [{ characterId: "female_1", identityPrompt: "짧은 머리" }],
    }),
    true
  );
});

test("hasScriptJsonPreparedContentChanged requires re-prepare for scene text but not speaker identity changes", () => {
  const previous = {
    title: "테스트",
    slides: [
      {
        text: "안녕하세요",
        lines: ["안녕하세요"],
        dialogueSegments: [{ type: "quote", text: "안녕하세요", speakerId: "female_1" }],
      },
    ],
  };

  assert.equal(
    hasScriptJsonPreparedContentChanged(previous, {
      ...previous,
      slides: [{ ...previous.slides[0], text: "반갑습니다", lines: ["반갑습니다"] }],
    }),
    true
  );
  assert.equal(
    hasScriptJsonPreparedContentChanged(previous, {
      ...previous,
      slides: [
        {
          ...previous.slides[0],
          dialogueSegments: [{ type: "quote", text: "안녕하세요", speakerId: "male_1" }],
        },
      ],
    }),
    false
  );
});

test("extractStoryCharacterProfileRows merges saved profiles with inferred speaker rows", () => {
  const speakerRows = extractSpeakerVoiceRows({
    slides: [
      {
        dialogueSegments: [
          { type: "quote", speakerId: "male_1", text: "안녕하세요" },
          { type: "quote", speakerId: "female_1", text: "여기 앉으실래요?" },
        ],
      },
    ],
  });

  const rows = extractStoryCharacterProfileRows(
    {
      characterProfiles: [
        {
          characterId: "female_1",
          displayName: "도서관 여자",
          identityPrompt: "긴 생머리, 베이지 가디건",
        },
      ],
    },
    speakerRows
  );

  assert.equal(rows[0]?.characterId, "female_1");
  assert.equal(rows[0]?.displayName, "도서관 여자");
  assert.equal(rows[0]?.isInferred, false);
  assert.equal(rows[1]?.characterId, "male_1");
  assert.deepEqual(rows[1]?.sampleTexts, ["안녕하세요"]);
  assert.equal(rows[1]?.isInferred, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  applySlideAssetToSlides,
  applySlideCharacterIdsToSlides,
  applySlideCharacterIdsToJsonText,
  applySlideSfxCueChangeToSlides,
  applySlideNarrationTextChangeToSlides,
  applyPreparedSlidesToJsonText,
  applyGeneratedCharacterProfilesToJsonText,
  buildAddedStandaloneSlide,
  buildStudioManualImageGenerateRequest,
  mergeManualImageGenerateCandidateSlides,
  mergeStandaloneDialogueSegments,
  normalizeSlideCharacterIds,
  rebuildDialogueSegmentsForEditedLines,
  resolvePreferredPreservedMediaSource,
  resolvePreferredManualSfxCue,
  shouldPreserveSlideMediaAfterTextChange,
  splitStandaloneDialogueSegments,
} from "./use-studio-slide-edit-actions";
import { parseRenderRequest } from "@/lib/studio/validation";
import { explodeSlidesForPop } from "@/lib/studio/frames";
import {
  applyStudioImageCandidateToSlides,
  STUDIO_AUTO_APPLIED_SELECTION_REASON,
} from "@/lib/studio/image-candidate-approval";
import type { ImageSelectionCandidate, PreparedSlide, SlideManualImagePrompt } from "@/types/studio-json";

function makeManualImagePrompt(finalPrompt: string): SlideManualImagePrompt {
  return {
    source: "codex",
    mascotName: "테스트 캐릭터",
    basePrompt: "기본 프롬프트",
    scenePrompt: "장면 프롬프트",
    finalPrompt,
    usesFallbackMascot: false,
  };
}

function makeGroupedFrame(groupId: number, stepIndex: number, lines: string[]): PreparedSlide {
  const safeLines = lines.map((line) => line.trim()).filter(Boolean);
  const text = safeLines[safeLines.length - 1] || "기본 문장";
  return {
    title: "테스트 슬라이드",
    text,
    lines: safeLines,
    layout: "photo+body",
    groupId,
    stepIndex,
  };
}

function makeSlideWithMedia(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "미디어 장면",
    text: "기존 장면",
    lines: ["기존 장면"],
    layout: "photo+body",
    imageUrl: "https://example.com/media.png",
    ...overrides,
  };
}

test("grouped narration edit removes blank lines and rebuilds frame count from non-empty lines only", () => {
  const slides: PreparedSlide[] = [
    { ...makeGroupedFrame(7, 0, ["첫 줄"]), manualImagePrompt: makeManualImagePrompt("stale 1") },
    { ...makeGroupedFrame(7, 1, ["첫 줄", "둘째 줄"]), manualImagePrompt: makeManualImagePrompt("stale 2") },
    { ...makeGroupedFrame(7, 2, ["첫 줄", "둘째 줄", "셋째 줄"]), manualImagePrompt: makeManualImagePrompt("stale 3") },
    { ...makeGroupedFrame(7, 3, ["첫 줄", "둘째 줄", "셋째 줄", "넷째 줄"]), manualImagePrompt: makeManualImagePrompt("stale 4") },
  ];

  const next = applySlideNarrationTextChangeToSlides({
    slides,
    index: 1,
    value: "지금 세금마다\n\n통장 잔액이 무서운\n사장님이라면",
    autoGenerateCaptionMetadata: false,
  });

  assert.equal(next.length, 3);
  assert.deepEqual(
    next.map((slide) => slide.text),
    ["지금 세금마다", "통장 잔액이 무서운", "사장님이라면"],
  );
  assert.deepEqual(
    next.map((slide) => slide.lines),
    [
      ["지금 세금마다"],
      ["지금 세금마다", "통장 잔액이 무서운"],
      ["지금 세금마다", "통장 잔액이 무서운", "사장님이라면"],
    ],
  );
  assert.deepEqual(next.map((slide) => slide.stepIndex), [0, 1, 2]);
  assert.equal(next.every((slide) => !slide.manualImagePrompt), true);
});

test("standalone narration edit also ignores blank textarea lines", () => {
  const slides: PreparedSlide[] = [
    {
      title: "단일 슬라이드",
      text: "기존 문장",
      lines: ["기존 문장"],
      layout: "photo+body",
      manualImagePrompt: makeManualImagePrompt("stale standalone"),
    },
  ];

  const next = applySlideNarrationTextChangeToSlides({
    slides,
    index: 0,
    value: "첫 줄\n\n둘째 줄\n   \n셋째 줄",
    autoGenerateCaptionMetadata: false,
  });

  assert.equal(next.length, 1);
  assert.equal(next[0]?.text, "첫 줄 둘째 줄 셋째 줄");
  assert.deepEqual(next[0]?.lines, ["첫 줄", "둘째 줄", "셋째 줄"]);
  assert.equal(next[0]?.manualImagePrompt, undefined);
});

test("buildStudioManualImageGenerateRequest forwards project profile snapshots with character profiles", () => {
  const slides = [makeSlideWithMedia()];
  const projectProfileSnapshot = {
    version: 1 as const,
    projectId: "project-profile-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category: "default",
      label: "기본 채널",
      metadataSnapshot: null,
    },
  };
  const request = buildStudioManualImageGenerateRequest({
    publishCategory: "default",
    imageSource: "auto-ai-generate",
    slides,
    slideIndexes: [0],
    mode: "selected",
    codexModel: "gpt-5.6-sol",
    imageStylePrompt: "consistent character style",
    jsonText: JSON.stringify({
      characterProfiles: [{ characterId: "female_1", anchorImageUrl: "https://assets.example.com/female.png" }],
    }),
    projectProfileSnapshot,
  });

  assert.deepEqual(request, {
    publishCategory: "default",
    imageSource: "auto-ai-generate",
    slides,
    slideIndexes: [0],
    mode: "selected",
    codexModel: "gpt-5.6-sol",
    imageStylePrompt: "consistent character style",
    characterProfiles: [{ characterId: "female_1", anchorImageUrl: "https://assets.example.com/female.png" }],
    projectProfileSnapshot,
  });
});

test("buildStudioManualImageGenerateRequest excludes style and automatic identities for a fixed character", () => {
  const request = buildStudioManualImageGenerateRequest({
    publishCategory: "default",
    imageSource: "auto-ai-generate",
    slides: [makeSlideWithMedia()],
    mode: "selected",
    fixedCharacterProfileId: "saved_hero",
    imageStylePrompt: "automatic-only style",
    jsonText: JSON.stringify({
      characterProfiles: [{ characterId: "auto_hero", identityPrompt: "generated identity" }],
    }),
  });

  assert.equal(request.imageSource, "auto-ai-generate");
  assert.equal(request.fixedCharacterProfileId, "saved_hero");
  assert.equal(Object.prototype.hasOwnProperty.call(request, "imageStylePrompt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request, "characterProfiles"), false);
});

test("applyGeneratedCharacterProfilesToJsonText applies generated profiles when request profile identity is unchanged", () => {
  const requestJsonText = JSON.stringify(
    {
      title: "요청 제목",
      characterProfiles: [
        {
          characterId: "hero",
          displayName: "히어로",
          identityPrompt: "red jacket",
        },
      ],
      slides: [{ text: "요청 장면" }],
    },
    null,
    2
  );
  const currentJsonText = JSON.stringify(
    {
      title: "응답 전 사용자가 고친 제목",
      characterProfiles: [
        {
          characterId: "hero",
          displayName: "히어로",
          identityPrompt: "red jacket",
        },
      ],
      slides: [{ text: "응답 전 사용자가 고친 장면" }],
      extraSetting: true,
    },
    null,
    2
  );
  const generatedProfiles = [
    {
      characterId: "hero",
      displayName: "히어로",
      identityPrompt: "red jacket",
      anchorImageUrl: "https://assets.example.com/hero-anchor.png",
      anchorAssetId: "asset-anchor-hero",
    },
  ];

  const parsed = JSON.parse(
    applyGeneratedCharacterProfilesToJsonText({
      requestJsonText,
      currentJsonText,
      characterProfiles: generatedProfiles,
    })
  ) as Record<string, unknown>;

  assert.equal(parsed.title, "응답 전 사용자가 고친 제목");
  assert.deepEqual(parsed.slides, [{ text: "응답 전 사용자가 고친 장면" }]);
  assert.equal(parsed.extraSetting, true);
  assert.deepEqual(parsed.characterProfiles, generatedProfiles);
});

test("applyGeneratedCharacterProfilesToJsonText ignores response after in-flight profile edits", () => {
  const requestJsonText = JSON.stringify({
    characterProfiles: [
      {
        characterId: "hero",
        displayName: "히어로",
        identityPrompt: "red jacket",
        anchorImageUrl: "https://assets.example.com/old-anchor.png",
      },
    ],
  });
  const generatedProfiles = [
    {
      characterId: "hero",
      displayName: "히어로",
      identityPrompt: "red jacket",
      anchorImageUrl: "https://assets.example.com/generated-anchor.png",
    },
  ];
  const changedCases = [
    {
      characterProfiles: [
        {
          characterId: "hero",
          displayName: "새 이름",
          identityPrompt: "red jacket",
          anchorImageUrl: "https://assets.example.com/old-anchor.png",
        },
      ],
    },
    {
      characterProfiles: [
        {
          characterId: "hero",
          displayName: "히어로",
          identityPrompt: "blue jacket",
          anchorImageUrl: "https://assets.example.com/old-anchor.png",
        },
      ],
    },
    {
      characterProfiles: [
        {
          characterId: "hero",
          displayName: "히어로",
          identityPrompt: "red jacket",
          anchorImageUrl: "https://assets.example.com/current-anchor.png",
        },
      ],
    },
    { characterProfiles: [] },
    {
      characterProfiles: [
        {
          characterId: "hero",
          displayName: "히어로",
          identityPrompt: "red jacket",
          anchorImageUrl: "https://assets.example.com/old-anchor.png",
        },
        { characterId: "mentor", displayName: "멘토" },
      ],
    },
  ];

  for (const current of changedCases) {
    const currentJsonText = JSON.stringify(current);
    assert.equal(
      applyGeneratedCharacterProfilesToJsonText({
        requestJsonText,
        currentJsonText,
        characterProfiles: generatedProfiles,
      }),
      currentJsonText
    );
  }

  const reorderedRequest = JSON.stringify({
    characterProfiles: [
      { characterId: "hero", displayName: "히어로" },
      { characterId: "mentor", displayName: "멘토" },
    ],
  });
  const reorderedCurrent = JSON.stringify({
    characterProfiles: [
      { characterId: "mentor", displayName: "멘토" },
      { characterId: "hero", displayName: "히어로" },
    ],
  });
  assert.equal(
    applyGeneratedCharacterProfilesToJsonText({
      requestJsonText: reorderedRequest,
      currentJsonText: reorderedCurrent,
      characterProfiles: generatedProfiles,
    }),
    reorderedCurrent
  );
});

test("applyGeneratedCharacterProfilesToJsonText keeps malformed or empty inputs unchanged", () => {
  assert.equal(
    applyGeneratedCharacterProfilesToJsonText({
      requestJsonText: "{ invalid",
      currentJsonText: JSON.stringify({ characterProfiles: [] }),
      characterProfiles: [{ characterId: "hero" }],
    }),
    JSON.stringify({ characterProfiles: [] })
  );
  assert.equal(
    applyGeneratedCharacterProfilesToJsonText({
      requestJsonText: JSON.stringify({ characterProfiles: [] }),
      currentJsonText: "{ invalid",
      characterProfiles: [{ characterId: "hero" }],
    }),
    "{ invalid"
  );
  const currentJsonText = JSON.stringify({ title: "keep" });
  assert.equal(
    applyGeneratedCharacterProfilesToJsonText({
      requestJsonText: currentJsonText,
      currentJsonText,
      characterProfiles: [],
    }),
    currentJsonText
  );
});

test("splitStandaloneDialogueSegments preserves per-line speakers and voices for multi-line standalone slides", () => {
  const slide: PreparedSlide = {
    title: "단일 슬라이드",
    text: "여자 대사 남자 대사",
    lines: ["여자 대사", "남자 대사"],
    layout: "photo+body",
    dialogueSegments: [
      { type: "quote", text: "여자 대사", speakerId: "female_1", voice: "voice-f" },
      { type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" },
    ],
  };

  const split = splitStandaloneDialogueSegments(slide, ["여자 대사"], ["남자 대사"]);

  assert.deepEqual(split.left, [{ type: "quote", text: "여자 대사", speakerId: "female_1", voice: "voice-f" }]);
  assert.deepEqual(split.right, [{ type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" }]);
});

test("mergeStandaloneDialogueSegments preserves distinct speakers and voices from both standalone slides", () => {
  const left: PreparedSlide = {
    title: "왼쪽",
    text: "여자 대사",
    lines: ["여자 대사"],
    layout: "photo+body",
    dialogueSegments: [{ type: "quote", text: "여자 대사", speakerId: "female_1", voice: "voice-f" }],
  };
  const right: PreparedSlide = {
    title: "오른쪽",
    text: "남자 대사",
    lines: ["남자 대사"],
    layout: "photo+body",
    dialogueSegments: [{ type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" }],
  };

  assert.deepEqual(mergeStandaloneDialogueSegments(left, right), [
    { type: "quote", text: "여자 대사", speakerId: "female_1", voice: "voice-f" },
    { type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" },
  ]);
});

test("mergeStandaloneDialogueSegments keeps an unassigned slide as narration instead of borrowing the other voice", () => {
  const quoteSlide: PreparedSlide = {
    title: "대사",
    text: "남자 대사",
    lines: ["남자 대사"],
    layout: "photo+body",
    dialogueSegments: [{ type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" }],
  };
  const narrationSlide: PreparedSlide = {
    title: "설명",
    text: "일반 설명",
    lines: ["일반 설명"],
    layout: "photo+body",
  };

  assert.deepEqual(mergeStandaloneDialogueSegments(quoteSlide, narrationSlide), [
    { type: "quote", text: "남자 대사", speakerId: "male_1", voice: "voice-m" },
    { type: "narration", text: "일반 설명" },
  ]);
});

test("rebuildDialogueSegmentsForEditedLines keeps per-line speakers when line counts match", () => {
  assert.deepEqual(
    rebuildDialogueSegmentsForEditedLines(
      [
        { type: "quote", text: "이전 첫 줄", speakerId: "female_1", voice: "voice-f" },
        { type: "quote", text: "이전 둘째 줄", speakerId: "male_1", voice: "voice-m" },
      ],
      ["새 첫 줄", "새 둘째 줄"]
    ),
    [
      { type: "quote", text: "새 첫 줄", speakerId: "female_1", voice: "voice-f" },
      { type: "quote", text: "새 둘째 줄", speakerId: "male_1", voice: "voice-m" },
    ]
  );
});

test("rebuildDialogueSegmentsForEditedLines preserves per-line speed and pause when line counts match", () => {
  assert.deepEqual(
    rebuildDialogueSegmentsForEditedLines(
      [
        { type: "narration", text: "이전 첫 줄", speed: 0.9, pauseAfterMs: 0 },
        { type: "narration", text: "이전 둘째 줄", speed: 1.2, pauseAfterMs: 350 },
      ],
      ["새 첫 줄", "새 둘째 줄"]
    ),
    [
      { type: "narration", text: "새 첫 줄", speed: 0.9, pauseAfterMs: 0 },
      { type: "narration", text: "새 둘째 줄", speed: 1.2, pauseAfterMs: 350 },
    ]
  );
});

test("rebuildDialogueSegmentsForEditedLines does not collapse different timing routes", () => {
  assert.deepEqual(
    rebuildDialogueSegmentsForEditedLines(
      [
        { type: "narration", text: "이전 첫 줄", speed: 0.9, pauseAfterMs: 0 },
        { type: "narration", text: "이전 둘째 줄", speed: 1.2, pauseAfterMs: 300 },
      ],
      ["합쳐진 새 문장"]
    ),
    [{ type: "narration", text: "합쳐진 새 문장" }]
  );
});

test("rebuildDialogueSegmentsForEditedLines drops ambiguous speaker routing instead of keeping stale speech", () => {
  assert.deepEqual(
    rebuildDialogueSegmentsForEditedLines(
      [
        { type: "quote", text: "이전 첫 줄", speakerId: "female_1" },
        { type: "quote", text: "이전 둘째 줄", speakerId: "male_1" },
      ],
      ["합쳐진 새 문장"]
    ),
    [{ type: "narration", text: "합쳐진 새 문장" }]
  );
});

test("applyPreparedSlidesToJsonText collapses grouped frames and persists edited dialogue text", () => {
  const jsonText = JSON.stringify({
    title: "테스트",
    slides: [
      {
        text: "이전 첫 줄 이전 둘째 줄",
        lines: ["이전 첫 줄", "이전 둘째 줄"],
        manualImagePrompt: makeManualImagePrompt("stale json prompt"),
        dialogueSegments: [
          { type: "quote", text: "이전 첫 줄", speakerId: "female_1" },
          { type: "quote", text: "이전 둘째 줄", speakerId: "male_1" },
        ],
      },
    ],
  });
  const edited = applySlideNarrationTextChangeToSlides({
    slides: [
      {
        ...makeGroupedFrame(0, 0, ["이전 첫 줄"]),
        dialogueSegments: [
          { type: "quote", text: "이전 첫 줄", speakerId: "female_1" },
          { type: "quote", text: "이전 둘째 줄", speakerId: "male_1" },
        ],
      },
      {
        ...makeGroupedFrame(0, 1, ["이전 첫 줄", "이전 둘째 줄"]),
        dialogueSegments: [
          { type: "quote", text: "이전 첫 줄", speakerId: "female_1" },
          { type: "quote", text: "이전 둘째 줄", speakerId: "male_1" },
        ],
      },
    ],
    index: 0,
    value: "새 첫 줄\n새 둘째 줄",
    autoGenerateCaptionMetadata: false,
  });

  const parsed = JSON.parse(applyPreparedSlidesToJsonText({ jsonText, slides: edited })) as Record<string, unknown>;
  const slide = (parsed.slides as Array<Record<string, unknown>>)[0];
  assert.equal(slide.text, "새 첫 줄 새 둘째 줄");
  assert.deepEqual(slide.lines, ["새 첫 줄", "새 둘째 줄"]);
  assert.deepEqual(slide.dialogueSegments, [
    { type: "quote", text: "새 첫 줄", speakerId: "female_1" },
    { type: "quote", text: "새 둘째 줄", speakerId: "male_1" },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(slide, "manualImagePrompt"), false);
});

test("applyPreparedSlidesToJsonText serializes standalone splits without leaking asset metadata across slides", () => {
  const jsonText = JSON.stringify({
    title: "테스트",
    slides: [
      {
        title: "A",
        text: "A 원본",
        lines: ["A 원본"],
        imageRequest: { query: "A 원본 쿼리" },
        imageUrl: "https://example.com/original-a.png",
      },
      {
        title: "B",
        text: "B 원본",
        lines: ["B 원본"],
        imageRequest: { query: "B 원본 쿼리" },
        imageUrl: "https://example.com/original-b.png",
      },
    ],
  });

  const slides: PreparedSlide[] = [
    {
      title: "A-1",
      text: "A 첫 줄",
      lines: ["A 첫 줄"],
      layout: "photo+body",
      imageRequest: { query: "A 쿼리" },
      imageUrl: "https://example.com/a.png",
    },
    {
      title: "A-2",
      text: "A 둘째 줄",
      lines: ["A 둘째 줄"],
      layout: "photo+body",
      imageRequest: { query: "A 쿼리" },
      imageUrl: "https://example.com/a.png",
    },
    {
      title: "B",
      text: "B 첫 줄",
      lines: ["B 첫 줄"],
      layout: "photo+body",
      imageRequest: { query: "B 쿼리" },
      imageUrl: "https://example.com/b.png",
    },
  ];

  const parsed = JSON.parse(applyPreparedSlidesToJsonText({ jsonText, slides })) as {
    slides: Array<Record<string, unknown>>;
  };

  assert.equal(parsed.slides.length, 3);
  assert.deepEqual(parsed.slides[0]?.imageRequest, { query: "A 쿼리" });
  assert.equal(parsed.slides[0]?.imageUrl, "https://example.com/a.png");
  assert.deepEqual(parsed.slides[1]?.imageRequest, { query: "A 쿼리" });
  assert.equal(parsed.slides[1]?.imageUrl, "https://example.com/a.png");
  assert.deepEqual(parsed.slides[2]?.imageRequest, { query: "B 쿼리" });
  assert.equal(parsed.slides[2]?.imageUrl, "https://example.com/b.png");
});

test("applyPreparedSlidesToJsonText preserves unrelated persisted image and sfx planning metadata", () => {
  const prompt = makeManualImagePrompt("keep unrelated prompt");
  const slides: PreparedSlide[] = [
    {
      title: "편집 대상",
      text: "바뀐 장면",
      lines: ["바뀐 장면"],
      layout: "photo+body",
    },
    {
      title: "관련 없는 장면",
      text: "그대로 유지",
      lines: ["그대로 유지"],
      layout: "photo+body",
      manualImagePrompt: prompt,
      imageBeats: [{ beatId: "beat-keep", startLineIndex: 0, imageRequest: { query: "keep beat" } }],
      imageVariantId: "variant-keep",
      imageVariantStartLineIndex: 2,
      sfxPlan: [{ lineIndex: 0, tag: "keep-sfx" }],
    },
  ];

  const parsed = JSON.parse(
    applyPreparedSlidesToJsonText({ jsonText: JSON.stringify({ slides: [{}, {}] }), slides })
  ) as { slides: Array<Record<string, unknown>> };

  assert.deepEqual(parsed.slides[1]?.manualImagePrompt, prompt);
  assert.deepEqual(parsed.slides[1]?.imageBeats, [
    { beatId: "beat-keep", startLineIndex: 0, imageRequest: { query: "keep beat" } },
  ]);
  assert.equal(parsed.slides[1]?.imageVariantId, "variant-keep");
  assert.equal(parsed.slides[1]?.imageVariantStartLineIndex, 2);
  assert.deepEqual(parsed.slides[1]?.sfxPlan, [{ lineIndex: 0, tag: "keep-sfx" }]);
});

test("applyPreparedSlidesToJsonText persists later grouped manual cues as source sfx plan items", () => {
  const frames: PreparedSlide[] = [
    { ...makeGroupedFrame(4, 0, ["첫 줄"]), sfxCue: undefined },
    {
      ...makeGroupedFrame(4, 1, ["첫 줄", "둘째 줄"]),
      sfxCue: { enabled: true, tag: "수동 강조", gainDb: -2, offsetMs: 90, source: "manual" },
    },
  ];

  const parsed = JSON.parse(
    applyPreparedSlidesToJsonText({ jsonText: JSON.stringify({ slides: [{}] }), slides: frames })
  ) as { slides: Array<Record<string, unknown>> };

  assert.deepEqual(parsed.slides[0]?.sfxPlan, [
    { lineIndex: 1, enabled: true, tag: "수동 강조", gainDb: -2, offsetMs: 90, source: "manual" },
  ]);
});

test("applyPreparedSlidesToJsonText preserves a later grouped manual asset at its original line", () => {
  const frames: PreparedSlide[] = [
    makeGroupedFrame(8, 0, ["첫 줄"]),
    {
      ...makeGroupedFrame(8, 1, ["첫 줄", "둘째 줄"]),
      imageUrl: "https://example.com/manual-right.png",
      resolvedImageUrl: "https://example.com/manual-right.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:right",
        selectionReason: "manual library selection",
      },
    },
  ];

  const parsed = JSON.parse(
    applyPreparedSlidesToJsonText({ jsonText: JSON.stringify({ slides: [{}] }), slides: frames })
  ) as { slides: Array<Record<string, unknown>> };

  assert.equal(parsed.slides[0]?.imageUrl, undefined);
  assert.equal(parsed.slides[0]?.resolvedImageUrl, undefined);
  assert.deepEqual(parsed.slides[0]?.imageBeats, [
    {
      beatId: "8:1",
      startLineIndex: 1,
      imageUrl: "https://example.com/manual-right.png",
      resolvedImageUrl: "https://example.com/manual-right.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:right",
        selectionReason: "manual library selection",
      },
      reason: "preserved grouped visual transition",
    },
  ]);
});

test("grouped visual beats can clear a temporary manual asset after its original frame", () => {
  const frames: PreparedSlide[] = [
    makeGroupedFrame(9, 0, ["첫 줄"]),
    {
      ...makeGroupedFrame(9, 1, ["첫 줄", "둘째 줄"]),
      imageUrl: "https://example.com/manual-middle.png",
      resolvedImageUrl: "https://example.com/manual-middle.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "library:middle",
        selectionReason: "manual library selection",
      },
    },
    makeGroupedFrame(9, 2, ["첫 줄", "둘째 줄", "셋째 줄"]),
  ];
  const serialized = applyPreparedSlidesToJsonText({
    jsonText: JSON.stringify({ videoMode: "singleAudio", slides: [{}] }),
    slides: frames,
  });
  const parsed = parseRenderRequest(JSON.parse(serialized));
  const exploded = explodeSlidesForPop(parsed.slides);

  assert.deepEqual(parsed.slides[0]?.imageBeats?.map((beat) => ({ start: beat.startLineIndex, clear: beat.clearVisual })), [
    { start: 1, clear: undefined },
    { start: 2, clear: true },
  ]);
  assert.deepEqual(exploded.map((slide) => slide.imageUrl), [
    undefined,
    "https://example.com/manual-middle.png",
    undefined,
  ]);
});

test("applySlideSfxCueChangeToSlides records an explicit disabled manual tombstone", () => {
  const slides: PreparedSlide[] = [
    {
      ...makeGroupedFrame(3, 1, ["첫 줄", "둘째 줄"]),
      sfxPlan: [{ lineIndex: 1, enabled: true, tag: "수동 강조", gainDb: -2, offsetMs: 90, source: "manual" }],
    },
  ];

  const next = applySlideSfxCueChangeToSlides(slides, 0, null);

  assert.deepEqual(next[0]?.sfxCue, {
    enabled: false,
    tag: "수동 강조",
    gainDb: -2,
    offsetMs: 90,
    source: "manual",
  });
});

test("applyPreparedSlidesToJsonText preserves automatic media provenance across render parsing", () => {
  const source: PreparedSlide = {
    ...makeSlideWithMedia({
      imageUrl: "https://example.com/auto.png",
      resolvedImageUrl: "https://example.com/auto.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["automatic query"],
        selectedQuery: "automatic query",
        provider: "naver",
        selectedCandidateId: "naver:auto",
        selectionReason: "automatic provider selection: naver",
      },
    }),
  };
  const jsonText = applyPreparedSlidesToJsonText({
    jsonText: JSON.stringify({ videoMode: "singleAudio", slides: [{}] }),
    slides: [source],
  });
  const parsed = parseRenderRequest(JSON.parse(jsonText));

  assert.equal(parsed.slides[0]?.resolvedBy, "crawl");
  assert.equal(parsed.slides[0]?.imageSelection?.selectionReason, "automatic provider selection: naver");
  assert.equal(shouldPreserveSlideMediaAfterTextChange(parsed.slides[0]), false);
});

test("buildAddedStandaloneSlide starts without cloned media or generated image state", () => {
  const inserted = buildAddedStandaloneSlide(
    {
      title: "이전 제목",
      text: "이전 장면",
      lines: ["이전 장면"],
      layout: "photo+body",
      imageUrl: "https://example.com/previous.png",
      mediaUrl: "https://example.com/previous.mp4",
      mediaKind: "video",
      imageRequest: { query: "previous query" },
      resolvedImageUrl: "https://example.com/resolved.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "previous intent",
        queryCandidates: ["previous query"],
        selectedCandidateId: "previous-candidate",
      },
    },
    "새 슬라이드 내용을 입력하세요.",
    false
  );

  assert.equal(inserted.title, "새 슬라이드");
  assert.equal(inserted.text, "새 슬라이드 내용을 입력하세요.");
  assert.equal(inserted.imageUrl, undefined);
  assert.equal(inserted.mediaUrl, undefined);
  assert.equal(inserted.mediaKind, undefined);
  assert.equal(inserted.imageRequest, undefined);
  assert.equal(inserted.resolvedImageUrl, undefined);
  assert.equal(inserted.resolvedBy, undefined);
  assert.equal(inserted.imageSelection, undefined);
  assert.deepEqual(inserted.dialogueSegments, [{ type: "narration", text: "새 슬라이드 내용을 입력하세요." }]);
});

test("shouldPreserveSlideMediaAfterTextChange distinguishes direct manual choices from derived images", () => {
  assert.equal(
    shouldPreserveSlideMediaAfterTextChange(
      makeSlideWithMedia({
        resolvedBy: "direct",
        imageSelection: {
          intent: "library",
          queryCandidates: [],
          selectionReason: "codex generated asset: old scene",
        },
      })
    ),
    false
  );
  assert.equal(shouldPreserveSlideMediaAfterTextChange(makeSlideWithMedia({ resolvedBy: "crawl" })), false);
  assert.equal(
    shouldPreserveSlideMediaAfterTextChange(
      makeSlideWithMedia({
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
  assert.equal(shouldPreserveSlideMediaAfterTextChange(makeSlideWithMedia({ resolvedBy: "direct" })), true);
});

test("resolvePreferredPreservedMediaSource can preserve a manual asset from the right side of a merge", () => {
  const left = makeSlideWithMedia({
    imageUrl: "https://example.com/automatic.png",
    resolvedBy: "crawl",
  });
  const right = makeSlideWithMedia({
    imageUrl: "https://example.com/manual.png",
    resolvedImageUrl: "https://example.com/manual.png",
    resolvedBy: "direct",
    imageSelection: {
      intent: "library",
      queryCandidates: [],
      selectedCandidateId: "library:manual",
      selectionReason: "manual library selection",
    },
  });

  assert.equal(resolvePreferredPreservedMediaSource(left, right), right);
});

test("resolvePreferredManualSfxCue uses the right manual cue when the left side has only auto SFX", () => {
  const left = makeGroupedFrame(2, 0, ["첫 줄"]);
  left.sfxCue = { enabled: true, tag: "자동 효과음", source: "auto" };
  const right = makeGroupedFrame(2, 1, ["첫 줄", "둘째 줄"]);
  right.sfxCue = { enabled: false, tag: "수동 효과음", gainDb: -4, source: "manual" };

  assert.deepEqual(resolvePreferredManualSfxCue(left, right), right.sfxCue);
});

test("standalone text edits clear derived media but retain a manually selected asset", () => {
  const autoSlide = makeSlideWithMedia({
    resolvedBy: "crawl",
    imageRequest: { query: "old automatic query" },
    resolvedImageUrl: "https://example.com/auto.png",
    imageSelection: { intent: "news", queryCandidates: ["old automatic query"] },
  });
  const manualSlide = makeSlideWithMedia({
    resolvedBy: "crawl",
    imageRequest: { query: "old manual query" },
    resolvedImageUrl: "https://example.com/manual.png",
    imageUrl: "https://example.com/manual.png",
    imageSelection: {
      intent: "news",
      queryCandidates: ["old manual query"],
      selectionReason: "manual provider candidate selection: naver",
    },
  });

  const autoEdited = applySlideNarrationTextChangeToSlides({
    slides: [autoSlide],
    index: 0,
    value: "완전히 바뀐 자동 장면",
    autoGenerateCaptionMetadata: false,
  })[0];
  const manualEdited = applySlideNarrationTextChangeToSlides({
    slides: [manualSlide],
    index: 0,
    value: "완전히 바뀐 수동 장면",
    autoGenerateCaptionMetadata: false,
  })[0];

  assert.equal(autoEdited?.imageUrl, undefined);
  assert.equal(autoEdited?.resolvedImageUrl, undefined);
  assert.equal(autoEdited?.imageSelection, undefined);
  assert.equal(autoEdited?.imageRequest, undefined);
  assert.equal(manualEdited?.imageUrl, "https://example.com/manual.png");
  assert.equal(manualEdited?.resolvedImageUrl, "https://example.com/manual.png");
  assert.equal(manualEdited?.imageSelection?.selectionReason, "manual provider candidate selection: naver");
  assert.equal(manualEdited?.imageRequest, undefined);
});

test("standalone narration edit clears stale image planning fields and keeps manual sfx cue only", () => {
  const slides: PreparedSlide[] = [
    {
      title: "단일 슬라이드",
      text: "기존 문장",
      lines: ["기존 문장"],
      layout: "photo+body",
      imageBeats: [
        {
          beatId: "beat-1",
          startLineIndex: 0,
          imageRequest: { query: "stale beat" },
        },
      ],
      imageVariantId: "variant-1",
      imageVariantStartLineIndex: 3,
      sfxPlan: [{ lineIndex: 0, tag: "자동 효과음" }],
      sfxCue: { enabled: true, tag: "수동 효과음", source: "manual" },
      manualImagePrompt: makeManualImagePrompt("stale standalone"),
    },
  ];

  const next = applySlideNarrationTextChangeToSlides({
    slides,
    index: 0,
    value: "새 첫 줄\n새 둘째 줄",
    autoGenerateCaptionMetadata: false,
  });

  assert.equal(next[0]?.imageBeats, undefined);
  assert.equal(next[0]?.imageVariantId, undefined);
  assert.equal(next[0]?.imageVariantStartLineIndex, undefined);
  assert.equal(next[0]?.sfxPlan, undefined);
  assert.deepEqual(next[0]?.sfxCue, { enabled: true, tag: "수동 효과음", source: "manual" });
});

test("applySlideAssetToSlides applies a persistent library asset to all linked frames", () => {
  const slides: PreparedSlide[] = [
    {
      title: "묶음 1",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 10,
      stepIndex: 0,
      imageRequest: { query: "세무사" },
    },
    {
      title: "묶음 1",
      text: "둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      layout: "photo+body",
      groupId: 10,
      stepIndex: 1,
      imageRequest: { query: "세무사" },
    },
    {
      title: "묶음 2",
      text: "다른 줄",
      lines: ["다른 줄"],
      layout: "photo+body",
      groupId: 11,
      stepIndex: 0,
      imageRequest: { query: "회계" },
    },
  ];

  const next = applySlideAssetToSlides({
    slides,
    index: 0,
    getLinkedSlideIndexes: (rows, index) => {
      const targetGroupId = rows[index]?.groupId;
      return new Set(
        rows
          .map((slide, slideIndex) => (slide.groupId === targetGroupId ? slideIndex : -1))
          .filter((slideIndex) => slideIndex >= 0)
      );
    },
    asset: {
      imageUrl: "https://assets.example.com/persisted.png",
      assetId: "asset-123",
      title: "업로드한 이미지",
    },
  });

  assert.equal(next[0]?.imageUrl, "https://assets.example.com/persisted.png");
  assert.equal(next[1]?.imageUrl, "https://assets.example.com/persisted.png");
  assert.equal(next[2]?.imageUrl, undefined);
  assert.equal(next[0]?.imageSelection?.provider, "library");
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, "asset-123");
  assert.equal(next[1]?.imageSelection?.selectedCandidateId, "asset-123");
});

test("applyStudioImageCandidateToSlides changes current media only through explicit candidate approval", () => {
  const slides: PreparedSlide[] = [
    {
      title: "묶음 1",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 20,
      imageUrl: "https://assets.example.com/current.png",
      resolvedImageUrl: "https://assets.example.com/current.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["old"],
        selectedCandidateId: "current-candidate",
        candidateOptions: [
          {
            provider: "library",
            candidateId: "asset-new",
            imageUrl: "https://assets.example.com/new.png",
            title: "새 후보",
          },
        ],
      },
    },
    {
      title: "묶음 1",
      text: "둘째 줄",
      lines: ["둘째 줄"],
      layout: "photo+body",
      groupId: 20,
      imageUrl: "https://assets.example.com/current.png",
      resolvedImageUrl: "https://assets.example.com/current.png",
      resolvedBy: "crawl",
    },
  ];
  const candidate = slides[0]?.imageSelection?.candidateOptions?.[0] as ImageSelectionCandidate;

  assert.equal(slides[0]?.imageUrl, "https://assets.example.com/current.png");

  const approved = applyStudioImageCandidateToSlides({
    slides,
    index: 0,
    getLinkedSlideIndexes: (rows, index) => {
      const targetGroupId = rows[index]?.groupId;
      return new Set(
        rows
          .map((slide, slideIndex) => (slide.groupId === targetGroupId ? slideIndex : -1))
          .filter((slideIndex) => slideIndex >= 0)
      );
    },
    candidate,
  });

  assert.equal(approved[0]?.imageUrl, "https://assets.example.com/new.png");
  assert.equal(approved[1]?.imageUrl, "https://assets.example.com/new.png");
  assert.equal(approved[0]?.resolvedBy, "direct");
  assert.equal(approved[0]?.imageSelection?.selectedCandidateId, "asset-new");
});

test("mergeManualImageGenerateCandidateSlides refreshes candidates without replacing an approved image", () => {
  const currentSlides: PreparedSlide[] = [
    {
      title: "승인된 장면",
      text: "현재 장면",
      lines: ["현재 장면"],
      layout: "photo+body",
      imageUrl: "https://assets.example.com/current.png",
      mediaUrl: "https://assets.example.com/current.mp4",
      mediaKind: "video",
      resolvedImageUrl: "https://assets.example.com/current.png",
      resolvedBy: "crawl",
      imageSelection: {
        intent: "news",
        queryCandidates: ["current query"],
        selectedQuery: "current query",
        provider: "naver",
        providerCandidates: ["naver"],
        candidateOptions: [
          {
            provider: "naver",
            candidateId: "approved-current",
            imageUrl: "https://assets.example.com/current.png",
            title: "현재 승인 후보",
          },
          {
            provider: "naver",
            candidateId: "current-pending",
            imageUrl: "https://assets.example.com/current-pending.png",
            title: "기존 대기 후보",
          },
        ],
        selectedCandidateId: "approved-current",
        selectionReason: "automatic provider selection: naver",
      },
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...currentSlides[0],
      imageUrl: "https://assets.example.com/generated.png",
      mediaUrl: undefined,
      mediaKind: "image",
      resolvedImageUrl: "https://assets.example.com/generated.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: ["generated query"],
        selectedQuery: "generated query",
        provider: "library",
        providerCandidates: ["library"],
        selectedCandidateId: "asset-generated",
        selectionReason: "manual provider candidate selection: library",
        candidateOptions: [
          {
            provider: "library",
            candidateId: "asset-generated",
            imageUrl: "https://assets.example.com/generated.png",
            title: "새 생성 후보",
          },
        ],
      },
    },
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides: currentSlides, currentSlides, generatedSlides });

  assert.equal(next[0]?.imageUrl, "https://assets.example.com/current.png");
  assert.equal(next[0]?.mediaUrl, "https://assets.example.com/current.mp4");
  assert.equal(next[0]?.mediaKind, "video");
  assert.equal(next[0]?.resolvedImageUrl, "https://assets.example.com/current.png");
  assert.equal(next[0]?.resolvedBy, "crawl");
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, "approved-current");
  assert.equal(next[0]?.imageSelection?.selectionReason, "automatic provider selection: naver");
  const candidateIds = next[0]?.imageSelection?.candidateOptions?.map((candidate) => candidate.candidateId);
  assert.equal(candidateIds?.[0], "asset-generated");
  assert.equal(candidateIds?.includes("approved-current"), true);
  assert.equal(candidateIds?.includes("current-pending"), true);
});

test("mergeManualImageGenerateCandidateSlides accepts the server-applied image for slides without media", () => {
  const currentSlides: PreparedSlide[] = [
    {
      title: "이미지 없는 장면",
      text: "이미지가 없음",
      lines: ["이미지가 없음"],
      layout: "photo+body",
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...currentSlides[0],
      imageUrl: "https://assets.example.com/generated.png",
      mediaUrl: "https://assets.example.com/generated.png",
      mediaKind: "image",
      resolvedImageUrl: "https://assets.example.com/generated.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedQuery: "generated query",
        provider: "library",
        providerCandidates: ["library"],
        selectedCandidateId: "asset-generated",
        selectionReason: `${STUDIO_AUTO_APPLIED_SELECTION_REASON}: library`,
        candidateOptions: [
          {
            provider: "library",
            candidateId: "asset-generated",
            imageUrl: "https://assets.example.com/generated.png",
          },
        ],
      },
    },
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides: currentSlides, currentSlides, generatedSlides });

  assert.equal(next[0]?.imageUrl, "https://assets.example.com/generated.png");
  assert.equal(next[0]?.mediaUrl, "https://assets.example.com/generated.png");
  assert.equal(next[0]?.mediaKind, "image");
  assert.equal(next[0]?.resolvedImageUrl, "https://assets.example.com/generated.png");
  assert.equal(next[0]?.resolvedBy, "direct");
  assert.equal(next[0]?.imageSelection?.provider, "library");
  assert.equal(next[0]?.imageSelection?.selectedQuery, "generated query");
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, "asset-generated");
  assert.equal(
    next[0]?.imageSelection?.selectionReason,
    `${STUDIO_AUTO_APPLIED_SELECTION_REASON}: library`
  );
  assert.equal(next[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-generated");
});

test("mergeManualImageGenerateCandidateSlides keeps candidates unapplied when the server only added them", () => {
  const currentSlides: PreparedSlide[] = [
    {
      title: "이미지 없는 장면",
      text: "이미지가 없음",
      lines: ["이미지가 없음"],
      layout: "photo+body",
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...currentSlides[0],
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        candidateOptions: [
          {
            provider: "library",
            candidateId: "asset-generated",
            imageUrl: "https://assets.example.com/generated.png",
          },
        ],
      },
    },
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides: currentSlides, currentSlides, generatedSlides });

  assert.equal(next[0]?.imageUrl, undefined);
  assert.equal(next[0]?.resolvedBy, undefined);
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, undefined);
  assert.equal(next[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-generated");
});

test("mergeManualImageGenerateCandidateSlides keeps beat-visual slides candidate-only", () => {
  const currentSlides: PreparedSlide[] = [
    {
      title: "비트 시각 자료 장면",
      text: "슬라이드 이미지 없음",
      lines: ["슬라이드 이미지 없음"],
      layout: "photo+body",
      imageBeats: [
        {
          beatId: "beat-1",
          startLineIndex: 0,
          imageUrl: "https://assets.example.com/beat.png",
        },
      ],
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...currentSlides[0],
      imageUrl: "https://assets.example.com/generated.png",
      resolvedImageUrl: "https://assets.example.com/generated.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "asset-generated",
        selectionReason: `${STUDIO_AUTO_APPLIED_SELECTION_REASON}: library`,
        candidateOptions: [
          {
            provider: "library",
            candidateId: "asset-generated",
            imageUrl: "https://assets.example.com/generated.png",
          },
        ],
      },
    },
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides: currentSlides, currentSlides, generatedSlides });

  assert.equal(next[0]?.imageUrl, undefined);
  assert.equal(next[0]?.imageBeats?.[0]?.imageUrl, "https://assets.example.com/beat.png");
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, undefined);
  assert.equal(next[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-generated");
});

test("mergeManualImageGenerateCandidateSlides preserves safe in-flight current edits while adding generated review fields", () => {
  const requestSlides: PreparedSlide[] = [
    {
      title: "장면 A",
      text: "요청 당시 문장",
      lines: ["요청 당시 문장"],
      layout: "photo+body",
      dialogueSegments: [{ type: "narration", text: "요청 당시 문장", voice: "voice-old" }],
      sfxCue: { enabled: true, tag: "old sfx", source: "manual" },
      imageUrl: "https://assets.example.com/approved.png",
      resolvedImageUrl: "https://assets.example.com/approved.png",
      resolvedBy: "direct",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "approved",
        selectionReason: "manual library selection",
      },
    },
  ];
  const currentSlides: PreparedSlide[] = [
    {
      ...requestSlides[0],
      layout: "body-only",
      sfxCue: { enabled: false, tag: "new sfx", source: "manual" },
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...requestSlides[0],
      text: "요청 당시 문장",
      lines: ["요청 당시 문장"],
      layout: "photo+body",
      manualImagePrompt: makeManualImagePrompt("fresh prompt"),
      imageUrl: "https://assets.example.com/generated.png",
      resolvedImageUrl: "https://assets.example.com/generated.png",
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        selectedCandidateId: "asset-generated",
        selectionReason: "manual provider candidate selection: library",
        candidateOptions: [
          {
            provider: "library",
            candidateId: "asset-generated",
            imageUrl: "https://assets.example.com/generated.png",
          },
        ],
      },
    },
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides, currentSlides, generatedSlides });

  assert.equal(next[0]?.text, "요청 당시 문장");
  assert.deepEqual(next[0]?.lines, ["요청 당시 문장"]);
  assert.equal(next[0]?.layout, "body-only");
  assert.deepEqual(next[0]?.dialogueSegments, [{ type: "narration", text: "요청 당시 문장", voice: "voice-old" }]);
  assert.deepEqual(next[0]?.sfxCue, { enabled: false, tag: "new sfx", source: "manual" });
  assert.equal(next[0]?.imageUrl, "https://assets.example.com/approved.png");
  assert.equal(next[0]?.imageSelection?.selectedCandidateId, "approved");
  assert.equal(next[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-generated");
  assert.equal(next[0]?.manualImagePrompt?.finalPrompt, "fresh prompt");
});

test("mergeManualImageGenerateCandidateSlides ignores stale prompt and candidate after character ids change", () => {
  const requestSlides: PreparedSlide[] = [
    {
      title: "캐릭터 장면",
      text: "같은 대사",
      lines: ["같은 대사"],
      layout: "photo+body",
      characterIds: ["hero"],
      manualImagePrompt: makeManualImagePrompt("old hero prompt"),
    },
  ];
  const currentSlides: PreparedSlide[] = [
    {
      ...requestSlides[0],
      characterIds: ["mentor"],
      manualImagePrompt: undefined,
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...requestSlides[0],
      manualImagePrompt: makeManualImagePrompt("stale generated hero prompt"),
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        candidateOptions: [
          {
            provider: "library",
            candidateId: "stale-character-candidate",
            imageUrl: "https://assets.example.com/stale-character.png",
          },
        ],
      },
    },
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides, currentSlides, generatedSlides });

  assert.deepEqual(next[0]?.characterIds, ["mentor"]);
  assert.equal(next[0]?.manualImagePrompt, undefined);
  assert.equal(next[0]?.imageSelection, undefined);
});

test("mergeManualImageGenerateCandidateSlides ignores stale generation after a slide is deleted", () => {
  const requestSlides: PreparedSlide[] = [
    {
      title: "삭제된 장면",
      text: "삭제될 장면",
      lines: ["삭제될 장면"],
      layout: "photo+body",
    },
    {
      title: "남은 장면",
      text: "남은 장면",
      lines: ["남은 장면"],
      layout: "photo+body",
    },
  ];
  const currentSlides: PreparedSlide[] = [requestSlides[1] as PreparedSlide];
  const generatedSlides: PreparedSlide[] = [
    {
      ...requestSlides[0],
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        candidateOptions: [
          {
            provider: "library",
            candidateId: "stale-deleted",
            imageUrl: "https://assets.example.com/deleted.png",
          },
        ],
      },
    },
    requestSlides[1] as PreparedSlide,
  ];

  const next = mergeManualImageGenerateCandidateSlides({ requestSlides, currentSlides, generatedSlides });

  assert.equal(next.length, 1);
  assert.equal(next[0]?.title, "남은 장면");
  assert.equal(next[0]?.imageSelection, undefined);
});

test("mergeManualImageGenerateCandidateSlides ignores stale generation when the response index no longer matches the request slide", () => {
  const requestSlides: PreparedSlide[] = [
    {
      title: "장면 A",
      text: "A",
      lines: ["A"],
      layout: "photo+body",
    },
    {
      title: "장면 B",
      text: "B",
      lines: ["B"],
      layout: "photo+body",
    },
  ];
  const generatedSlides: PreparedSlide[] = [
    {
      ...requestSlides[1],
      imageSelection: {
        intent: "library",
        queryCandidates: [],
        candidateOptions: [
          {
            provider: "library",
            candidateId: "wrong-index",
            imageUrl: "https://assets.example.com/wrong.png",
          },
        ],
      },
    },
    requestSlides[0] as PreparedSlide,
  ];

  const next = mergeManualImageGenerateCandidateSlides({
    requestSlides,
    currentSlides: requestSlides,
    generatedSlides,
  });

  assert.equal(next[0]?.imageSelection, undefined);
  assert.equal(next[1]?.imageSelection, undefined);
});

test("normalizeSlideCharacterIds trims blanks and dedupes while preserving order", () => {
  assert.deepEqual(normalizeSlideCharacterIds([" hero ", "", "mentor", "hero", " mentor "]), ["hero", "mentor"]);
});

test("applySlideCharacterIdsToSlides applies characters to the linked image group and clears prompts", () => {
  const slides: PreparedSlide[] = [
    {
      title: "묶음 1",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 10,
      stepIndex: 0,
      manualImagePrompt: {
        source: "codex",
        mascotName: "old",
        usesFallbackMascot: false,
        basePrompt: "old",
        scenePrompt: "old",
        finalPrompt: "old",
      },
    },
    {
      title: "묶음 1",
      text: "둘째 줄",
      lines: ["첫 줄", "둘째 줄"],
      layout: "photo+body",
      groupId: 10,
      stepIndex: 1,
      manualImagePrompt: {
        source: "codex",
        mascotName: "old",
        usesFallbackMascot: false,
        basePrompt: "old",
        scenePrompt: "old",
        finalPrompt: "old",
      },
    },
    {
      title: "묶음 2",
      text: "다른 줄",
      lines: ["다른 줄"],
      layout: "photo+body",
      groupId: 11,
      stepIndex: 0,
      characterIds: ["other"],
      manualImagePrompt: {
        source: "codex",
        mascotName: "keep",
        usesFallbackMascot: false,
        basePrompt: "keep",
        scenePrompt: "keep",
        finalPrompt: "keep",
      },
    },
  ];

  const next = applySlideCharacterIdsToSlides({
    slides,
    index: 0,
    characterIds: [" hero ", "mentor", "hero"],
    getLinkedSlideIndexes: (rows, index) => {
      const targetGroupId = rows[index]?.groupId;
      return new Set(
        rows
          .map((slide, slideIndex) => (slide.groupId === targetGroupId ? slideIndex : -1))
          .filter((slideIndex) => slideIndex >= 0)
      );
    },
  });

  assert.deepEqual(next[0]?.characterIds, ["hero", "mentor"]);
  assert.deepEqual(next[1]?.characterIds, ["hero", "mentor"]);
  assert.equal(next[0]?.manualImagePrompt, undefined);
  assert.equal(next[1]?.manualImagePrompt, undefined);
  assert.deepEqual(next[2]?.characterIds, ["other"]);
  assert.equal(next[2]?.manualImagePrompt?.finalPrompt, "keep");
});

test("applySlideCharacterIdsToSlides removes empty character fields and invalidates prompt", () => {
  const slides: PreparedSlide[] = [
    {
      title: "단일",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      characterIds: ["hero"],
      manualImagePrompt: {
        source: "codex",
        mascotName: "old",
        usesFallbackMascot: false,
        basePrompt: "old",
        scenePrompt: "old",
        finalPrompt: "old",
      },
    },
  ];

  const next = applySlideCharacterIdsToSlides({
    slides,
    index: 0,
    characterIds: [" ", ""],
    getLinkedSlideIndexes: () => new Set([0]),
  });

  assert.equal(Object.prototype.hasOwnProperty.call(next[0] || {}, "characterIds"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(next[0] || {}, "manualImagePrompt"), false);
});

test("applySlideCharacterIdsToJsonText maps grouped prepared frames to source slide indexes", () => {
  const preparedSlides: PreparedSlide[] = [
    makeGroupedFrame(0, 0, ["첫 줄"]),
    makeGroupedFrame(0, 1, ["첫 줄", "둘째 줄"]),
    makeGroupedFrame(1, 0, ["다른 줄"]),
  ];
  const jsonText = JSON.stringify(
    {
      title: "테스트",
      slides: [
        {
          title: "원본 1",
          text: "첫 줄",
          manualImagePrompt: { finalPrompt: "stale prompt" },
        },
        {
          title: "원본 2",
          text: "다른 줄",
          characterIds: ["keep"],
          manualImagePrompt: { finalPrompt: "keep prompt" },
        },
      ],
    },
    null,
    2
  );

  const next = applySlideCharacterIdsToJsonText({
    jsonText,
    slides: preparedSlides,
    index: 1,
    characterIds: [" hero ", "hero", "mentor"],
    getLinkedSlideIndexes: () => new Set([0, 1]),
  });
  const parsed = JSON.parse(next) as { slides: Array<Record<string, unknown>> };

  assert.deepEqual(parsed.slides[0]?.characterIds, ["hero", "mentor"]);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.slides[0] || {}, "manualImagePrompt"), false);
  assert.deepEqual(parsed.slides[1]?.characterIds, ["keep"]);
  assert.deepEqual(parsed.slides[1]?.manualImagePrompt, { finalPrompt: "keep prompt" });
});

test("applySlideCharacterIdsToJsonText targets the reordered source row after an earlier group is deleted", () => {
  const preparedSlides: PreparedSlide[] = [
    makeGroupedFrame(1, 0, ["남은 첫 줄"]),
    makeGroupedFrame(1, 1, ["남은 첫 줄", "남은 둘째 줄"]),
  ];
  const jsonText = JSON.stringify({ slides: [{ title: "남은 원본", text: "남은 장면" }] }, null, 2);

  const next = applySlideCharacterIdsToJsonText({
    jsonText,
    slides: preparedSlides,
    index: 1,
    characterIds: ["female_1"],
    getLinkedSlideIndexes: () => new Set([0, 1]),
  });
  const parsed = JSON.parse(next) as { slides: Array<Record<string, unknown>> };

  assert.deepEqual(parsed.slides[0]?.characterIds, ["female_1"]);
});

test("applySlideCharacterIdsToJsonText can update multiple linked source indexes and preserves non-object slide rows", () => {
  const preparedSlides: PreparedSlide[] = [
    makeGroupedFrame(0, 0, ["첫 줄"]),
    makeGroupedFrame(2, 0, ["셋째 줄"]),
  ];
  const jsonText = JSON.stringify(
    {
      slides: [
        { title: "원본 1", text: "첫 줄", lines: ["첫 줄"] },
        "raw 문자열 보존",
        { title: "원본 3", text: "셋째 줄", lines: ["셋째 줄"] },
      ],
    },
    null,
    2
  );

  const next = applySlideCharacterIdsToJsonText({
    jsonText,
    slides: preparedSlides,
    index: 0,
    characterIds: ["hero"],
    getLinkedSlideIndexes: () => new Set([0, 1]),
  });
  const parsed = JSON.parse(next) as { slides: unknown[] };

  assert.deepEqual((parsed.slides[0] as Record<string, unknown>).characterIds, ["hero"]);
  assert.equal(parsed.slides[1], "raw 문자열 보존");
  assert.deepEqual((parsed.slides[2] as Record<string, unknown>).characterIds, ["hero"]);
});

test("applySlideCharacterIdsToJsonText removes empty character fields from source slides", () => {
  const preparedSlides: PreparedSlide[] = [
    {
      title: "단일",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
    },
  ];
  const jsonText = JSON.stringify(
    {
      slides: [
        {
          title: "원본",
          text: "첫 줄",
          lines: ["첫 줄"],
          characterIds: ["hero"],
          manualImagePrompt: { finalPrompt: "stale prompt" },
        },
      ],
    },
    null,
    2
  );

  const next = applySlideCharacterIdsToJsonText({
    jsonText,
    slides: preparedSlides,
    index: 0,
    characterIds: [],
    getLinkedSlideIndexes: () => new Set([0]),
  });
  const parsed = JSON.parse(next) as { slides: Array<Record<string, unknown>> };

  assert.equal(Object.prototype.hasOwnProperty.call(parsed.slides[0] || {}, "characterIds"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.slides[0] || {}, "manualImagePrompt"), false);
});

test("applySlideCharacterIdsToJsonText keeps invalid JSON unchanged", () => {
  const invalidJson = "{ invalid";
  const next = applySlideCharacterIdsToJsonText({
    jsonText: invalidJson,
    slides: [makeGroupedFrame(0, 0, ["첫 줄"])],
    index: 0,
    characterIds: ["hero"],
    getLinkedSlideIndexes: () => new Set([0]),
  });

  assert.equal(next, invalidJson);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import type { PreparedSlide } from "@/types/studio-json";
import {
  buildStudioRenderPreflightFingerprint,
  buildStudioRenderPreflightKey,
  buildStudioRenderPreflightSummary,
  hasRenderableMedia,
  type StudioRenderPreflightInput,
} from "./studio-render-preflight";

const sfxCategories: StudioSfxCategoryOption[] = [
  {
    id: "강조",
    label: "강조",
    files: [
      {
        id: "impact-1",
        tag: "강조",
        label: "impact",
        path: "/sfx/impact.mp3",
        defaultGainDb: -3,
      },
    ],
  },
];

const captionLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.05, y: 0.1, w: 0.9, h: 0.07 },
  bodySlot: { x: 0.05, y: 0.25, w: 0.9, h: 0.18 },
  imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
  infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
  titleColor: "#111111",
  bodyColor: "#111111",
  infoColor: "#666666",
  titleAlign: "center" as const,
  bodyAlign: "center" as const,
  headerSize: 17,
  titleSize: 20,
  bodySize: 16,
  infoSize: 15,
};

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "슬라이드",
    text: "첫 문장",
    narrationText: "첫 문장",
    lines: ["첫 문장"],
    layout: "photo+body",
    imageUrl: "https://example.com/image.jpg",
    mediaUrl: "https://example.com/image.jpg",
    mediaKind: "image",
    characterIds: ["hero"],
    ttsVoiceId: "voice-main",
    sfxCue: {
      enabled: true,
      tag: "강조",
    },
    ...overrides,
  };
}

function makeInput(overrides?: Partial<StudioRenderPreflightInput>): StudioRenderPreflightInput {
  const slides = overrides?.slides || [makeSlide()];
  return {
    slides,
    source: {
      mode: "normal",
      ttsVoiceId: "voice-main",
      characterProfiles: [{ characterId: "hero" }],
    },
    selectedVoiceId: "voice-main",
    selectedQuoteVoiceId: "",
    selectedMaleVoiceId: "",
    selectedFemaleVoiceId: "",
    previewTiming: {
      slides,
      frameDurationsSec: slides.map(() => 1.2),
    },
    renderNeedsRefresh: false,
    hasDraftVideo: true,
    templateRequirementAlert: null,
    bgmEnabled: true,
    bgmPath: "/bgm/Tango de la Noche - Wayne Jones.mp3",
    sfxEnabled: true,
    sfxCategories,
    ...overrides,
  };
}

function codes(input: Partial<StudioRenderPreflightInput>): string[] {
  return buildStudioRenderPreflightSummary(makeInput(input)).issues.map((issue) => issue.code);
}

test("hasRenderableMedia accepts slide-level media and image beats", () => {
  assert.equal(hasRenderableMedia(makeSlide()), true);
  assert.equal(
    hasRenderableMedia(makeSlide({ imageUrl: undefined, mediaUrl: undefined, resolvedImageUrl: "https://example.com/resolved.jpg" })),
    true
  );
  assert.equal(hasRenderableMedia(makeSlide({ imageUrl: "   ", mediaUrl: undefined })), false);
  assert.equal(
    hasRenderableMedia(
      makeSlide({
        imageUrl: undefined,
        mediaUrl: undefined,
        imageBeats: [{ beatId: "beat-1", startLineIndex: 0, imageUrl: "https://example.com/beat.jpg" }],
      })
    ),
    true
  );
  assert.equal(
    hasRenderableMedia(
      makeSlide({
        imageUrl: undefined,
        mediaUrl: undefined,
        imageBeats: [{ beatId: "beat-1", startLineIndex: 0 }],
      })
    ),
    false
  );
});

test("buildStudioRenderPreflightSummary passes clean render-ready input", () => {
  const summary = buildStudioRenderPreflightSummary(makeInput());

  assert.equal(summary.canRenderFinal, true);
  assert.deepEqual(summary.counts, { blocker: 0, warning: 0 });
  assert.deepEqual(summary.issues, []);
});

test("buildStudioRenderPreflightSummary blocks a caption that exceeds the selected layout width", () => {
  const slide = makeSlide({
    text: "달 월(月) 불 화(火) 물 수(水)",
    narrationText: "달 월 불 화 물 수",
    lines: ["달 월(月) 불 화(火) 물 수(水)"],
  });
  const baseInput = makeInput({
    slides: [slide],
    previewTiming: { slides: [slide], frameDurationsSec: [1.2] },
    templateId: "default",
    templateData: { bodyScale: 1 } as StudioRenderPreflightInput["templateData"],
    templateImageEnabled: true,
    templateImageLayout: captionLayout,
  });
  const summary = buildStudioRenderPreflightSummary({
    ...baseInput,
    templateImageLayout: { ...captionLayout, bodySize: 24 },
  });

  assert.equal(buildStudioRenderPreflightSummary(baseInput).canRenderFinal, true);
  assert.equal(summary.canRenderFinal, false);
  assert.notEqual(
    buildStudioRenderPreflightFingerprint(baseInput),
    buildStudioRenderPreflightFingerprint({
      ...baseInput,
      templateImageLayout: { ...captionLayout, bodySize: 24 },
    }),
  );
  assert.ok(summary.issues.some((issue) => issue.code === "caption-line-overflow"));
  assert.ok(summary.issues.some((issue) => issue.message === "화면 폭 초과 · 장면 구조 다시 만들기"));
});

test("buildStudioRenderPreflightSummary reports core blockers", () => {
  const slide = makeSlide({
    text: "",
    lines: ["정상", ""],
    dialogueSegments: [
      { type: "narration", text: "정상", voice: "voice-main" },
      { type: "quote", text: "", speakerId: "male_1", voice: "" },
    ],
    imageUrl: "",
    mediaUrl: "",
  });
  const summary = buildStudioRenderPreflightSummary(
    makeInput({
      slides: [slide],
      selectedVoiceId: "",
      source: { mode: "dialogue" },
      previewTiming: null,
      hasDraftVideo: false,
      renderNeedsRefresh: true,
      templateRequirementAlert: "템플릿 요구사항을 충족하지 못했습니다.",
    })
  );

  assert.equal(summary.canRenderFinal, false);
  assert.ok(summary.counts.blocker >= 8);
  assert.deepEqual(
    [
      "slide-text-empty",
      "slide-line-empty",
      "dialogue-segment-empty",
      "voice-missing",
      "media-missing",
      "draft-video-missing",
      "preview-timing-missing",
      "render-stale",
      "template-requirement",
    ].every((code) => summary.issues.some((issue) => issue.code === code)),
    true
  );
});

test("buildStudioRenderPreflightSummary treats disabled or empty optional audio as warnings", () => {
  const slide = makeSlide({ sfxCue: undefined, characterIds: [] });
  const summary = buildStudioRenderPreflightSummary(
    makeInput({
      slides: [slide],
      source: { mode: "normal", ttsVoiceId: "voice-main", characterProfiles: [] },
      previewTiming: { slides: [slide], frameDurationsSec: [1] },
      bgmEnabled: false,
      sfxEnabled: true,
    })
  );

  assert.equal(summary.canRenderFinal, true);
  assert.equal(summary.counts.blocker, 0);
  assert.deepEqual(
    summary.issues.map((issue) => issue.code).sort(),
    ["bgm-disabled", "characters-empty", "sfx-cues-empty"].sort()
  );

  assert.deepEqual(codes({ sfxEnabled: false }), ["sfx-disabled"]);
});

test("buildStudioRenderPreflightSummary blocks enabled BGM without a resolved asset path", () => {
  const summary = buildStudioRenderPreflightSummary(makeInput({ bgmEnabled: true, bgmPath: "  " }));

  assert.equal(summary.canRenderFinal, false);
  assert.deepEqual(summary.issues.map((issue) => issue.code), ["bgm-path-missing"]);
  assert.equal(summary.issues[0]?.targetStep, "caption_audio");
});

test("buildStudioRenderPreflightSummary blocks final render when the image stage is explicitly unapproved", () => {
  const summary = buildStudioRenderPreflightSummary(makeInput({ imageApproved: false }));

  assert.equal(summary.canRenderFinal, false);
  assert.equal(summary.counts.blocker, 1);
  assert.deepEqual(
    summary.issues.map((issue) => ({
      code: issue.code,
      targetStep: issue.targetStep,
      message: issue.message,
    })),
    [
      {
        code: "image-approval-required",
        targetStep: "image",
        message: "2단계 이미지 확인을 완료한 뒤 최종 렌더를 실행하세요.",
      },
    ]
  );
});

test("buildStudioRenderPreflightSummary keeps omitted approval readiness legacy-compatible", () => {
  assert.equal(buildStudioRenderPreflightSummary(makeInput()).canRenderFinal, true);
  assert.equal(buildStudioRenderPreflightSummary(makeInput({ imageApproved: true })).canRenderFinal, true);
});

test("buildStudioRenderPreflightSummary uses dialogue voice routing before checking missing voices", () => {
  const slide = makeSlide({
    ttsVoiceId: undefined,
    dialogueSegments: [
      { type: "narration", text: "설명" },
      { type: "quote", text: "남자 대사", speakerId: "male_1" },
      { type: "quote", text: "여자 대사", speakerId: "female_1" },
    ],
  });
  const summary = buildStudioRenderPreflightSummary(
    makeInput({
      slides: [slide],
      source: { mode: "dialogue" },
      selectedVoiceId: "narration-voice",
      selectedQuoteVoiceId: "quote-voice",
      selectedMaleVoiceId: "male-voice",
      selectedFemaleVoiceId: "female-voice",
      previewTiming: {
        slides: [
          makeSlide({
            ttsVoiceId: "narration-voice",
            dialogueSegments: [
              { type: "narration", text: "설명", voice: "narration-voice" },
              { type: "quote", text: "남자 대사", speakerId: "male_1", voice: "male-voice" },
              { type: "quote", text: "여자 대사", speakerId: "female_1", voice: "female-voice" },
            ],
          }),
        ],
        frameDurationsSec: [1],
      },
    })
  );

  assert.equal(summary.canRenderFinal, true);
  assert.equal(summary.issues.some((issue) => issue.code === "voice-missing"), false);
  assert.equal(summary.issues.some((issue) => issue.code === "preview-timing-slide-mismatch"), false);
});

test("buildStudioRenderPreflightSummary classifies render safety blockers and warnings", () => {
  const unsafeSlide = makeSlide({
    imageUrl: "blob:http://localhost/temp",
    mediaUrl: "https://giphy.com/gifs/funny-reaction",
    mediaKind: "animated_image",
  });
  const warningSlide = makeSlide({
    imageUrl: "https://example.com/animated.webp",
    mediaUrl: "https://example.com/player",
    mediaKind: "video",
  });
  const summary = buildStudioRenderPreflightSummary(
    makeInput({
      slides: [unsafeSlide, warningSlide],
      previewTiming: { slides: [unsafeSlide, warningSlide], frameDurationsSec: [1, 1] },
    })
  );

  assert.equal(summary.canRenderFinal, false);
  assert.equal(summary.issues.find((issue) => issue.code === "render-safety-blob-url")?.severity, "blocker");
  assert.equal(summary.issues.find((issue) => issue.code === "render-safety-giphy-page-url")?.severity, "blocker");
  assert.equal(summary.issues.find((issue) => issue.code === "render-safety-webp-url")?.severity, "warning");
  assert.equal(summary.issues.find((issue) => issue.code === "render-safety-video-not-direct")?.severity, "warning");
});

test("buildStudioRenderPreflightSummary validates preview timing and SFX catalog references", () => {
  const slide = makeSlide({ sfxCue: { enabled: true, tag: "없는효과" } });
  const summary = buildStudioRenderPreflightSummary(
    makeInput({
      slides: [slide],
      previewTiming: { slides: [makeSlide({ text: "이전 문장" })], frameDurationsSec: [0] },
    })
  );

  assert.equal(summary.canRenderFinal, false);
  assert.deepEqual(
    ["preview-timing-nonpositive", "preview-timing-slide-mismatch", "sfx-cue-category-missing"].every((code) =>
      summary.issues.some((issue) => issue.code === code)
    ),
    true
  );
});

test("buildStudioRenderPreflightKey changes for render-affecting inputs and redacts large data URLs", () => {
  const dataUrl = `data:image/png;base64,${"a".repeat(200)}`;
  const baseSlide = makeSlide({ imageUrl: dataUrl, mediaUrl: dataUrl });
  const base = makeInput({ slides: [baseSlide], previewTiming: { slides: [baseSlide], frameDurationsSec: [1] } });
  const baseKey = buildStudioRenderPreflightKey(base);
  const speedChanged = buildStudioRenderPreflightKey({
    ...base,
    slides: [makeSlide({ imageUrl: dataUrl, mediaUrl: dataUrl, dialogueSegments: [{ type: "narration", text: "첫 문장", speed: 1.2 }] })],
  });
  const sfxChanged = buildStudioRenderPreflightKey({
    ...base,
    sfxCategories: [
      {
        id: "강조",
        label: "강조",
        files: [{ id: "impact-2", tag: "강조", label: "impact2", path: "/sfx/impact-2.mp3", defaultGainDb: -3 }],
      },
    ],
  });

  assert.notEqual(baseKey, speedChanged);
  assert.notEqual(baseKey, sfxChanged);
  assert.equal(baseKey.includes("a".repeat(80)), false);
  assert.equal(baseKey.includes("data:"), true);

  const fingerprint = buildStudioRenderPreflightFingerprint(base);
  assert.match(fingerprint, /^studio-render-preflight-fp-v1:[a-z0-9]+$/);
  assert.notEqual(fingerprint, buildStudioRenderPreflightFingerprint({ ...base, sfxCategories: [] }));
  assert.notEqual(
    fingerprint,
    buildStudioRenderPreflightFingerprint({ ...base, bgmPath: "/bgm/Morning Stroll.mp3" })
  );
});

test("buildStudioRenderPreflightKey changes when approval readiness changes", () => {
  const base = makeInput();
  const legacyKey = buildStudioRenderPreflightKey(base);
  const pendingImageKey = buildStudioRenderPreflightKey({ ...base, imageApproved: false });
  const approvedImageKey = buildStudioRenderPreflightKey({ ...base, imageApproved: true });

  assert.equal(legacyKey.includes("imageApproved"), false);
  assert.notEqual(legacyKey, pendingImageKey);
  assert.notEqual(pendingImageKey, approvedImageKey);
  assert.notEqual(
    buildStudioRenderPreflightFingerprint({ ...base, imageApproved: false }),
    buildStudioRenderPreflightFingerprint({ ...base, imageApproved: true })
  );
});

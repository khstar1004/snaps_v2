import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import {
  addStudioImageCandidateToSlides,
  applyStudioImageCandidateToSlides,
  buildStudioLibraryImageCandidate,
} from "@/lib/studio/image-candidate-approval";
import {
  buildStudioDraftRenderFingerprint,
  buildStudioImageApprovalFingerprint,
  buildStudioRenderFingerprint,
  type StudioRenderFingerprintInput,
} from "./studio-render-fingerprint";

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "slide",
    text: "첫 문장",
    narrationText: "첫 문장",
    lines: ["첫 문장"],
    layout: "photo+body",
    imageUrl: "https://example.com/image-a.jpg",
    mediaUrl: "https://example.com/image-a.jpg",
    mediaKind: "image",
    dialogueSegments: [{ type: "narration", text: "첫 문장", speed: 1, pauseAfterMs: 0 }],
    sfxPlan: [{ lineIndex: 0, enabled: true, tag: "whoosh", source: "manual" }],
    groupId: 0,
    stepIndex: 0,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<StudioRenderFingerprintInput>): StudioRenderFingerprintInput {
  return {
    slides: [makeSlide()],
    source: { mode: "normal", ttsVoiceId: "voice-a" },
    selectedVoiceId: "voice-a",
    selectedQuoteVoiceId: "quote-a",
    selectedMaleVoiceId: "male-a",
    selectedFemaleVoiceId: "female-a",
    selectedTypecastEmotionType: "happy",
    selectedTypecastSpeed: "1.1",
    playbackRate: 1.5,
    bgmEnabled: true,
    selectedBgmTrack: "bright",
    bgmPath: "/bgm/bright.mp3",
    bgmVolume: 0.28,
    mixPresetId: "balanced",
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    sfxCatalog: [{ id: "whoosh", files: [{ id: "w1", path: "/sfx/whoosh.mp3", defaultGainDb: -1 }] }],
    branding: {
      headerTitle: "뉴스",
      headerAccentText: "속보",
      headerColor: "#111111",
      footerColor: "#222222",
      infoLineText: "정보",
      fontFamily: "Pretendard",
      imageRounded: true,
    },
    templateId: "news-card",
    templateData: { headline: "A", body: "B" },
    templateImageEnabled: true,
    templateImageUrl: "https://example.com/template.png",
    templateImageLayout: {
      imageSlot: { x: 1, y: 2, w: 3, h: 4 },
      titleSlot: { h: 1, w: 2, y: 3, x: 4 },
    },
    templateLayoutApply: { title: true, body: true, image: true, info: true },
    ...overrides,
  };
}

test("buildStudioRenderFingerprint is stable for identical input and object key order changes", () => {
  const left = buildStudioRenderFingerprint(makeInput());
  const right = buildStudioRenderFingerprint(
    makeInput({
      source: { ttsVoiceId: "voice-a", mode: "normal" },
      branding: {
        imageRounded: true,
        fontFamily: "Pretendard",
        infoLineText: "정보",
        footerColor: "#222222",
        headerColor: "#111111",
        headerAccentText: "속보",
        headerTitle: "뉴스",
      },
      templateData: { body: "B", headline: "A" },
    })
  );

  assert.equal(left, right);
  assert.match(left, /^studio-render-fp-v1:[a-z0-9]+$/);
});

test("buildStudioRenderFingerprint changes when voice routing or dialogue timing changes", () => {
  const base = buildStudioRenderFingerprint(
    makeInput({
      source: {
        mode: "dialogue",
        dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자" }],
      },
      slides: [makeSlide({ dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자", speed: 1, pauseAfterMs: 0 }] })],
    })
  );
  const differentVoice = buildStudioRenderFingerprint(
    makeInput({
      selectedMaleVoiceId: "male-b",
      source: {
        mode: "dialogue",
        dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자" }],
      },
      slides: [makeSlide({ dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자", speed: 1, pauseAfterMs: 0 }] })],
    })
  );
  const faster = buildStudioRenderFingerprint(
    makeInput({
      source: {
        mode: "dialogue",
        dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자" }],
      },
      slides: [makeSlide({ dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자", speed: 1.2, pauseAfterMs: 0 }] })],
    })
  );
  const paused = buildStudioRenderFingerprint(
    makeInput({
      source: {
        mode: "dialogue",
        dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자" }],
      },
      slides: [makeSlide({ dialogueSegments: [{ type: "quote", text: "대사", speakerId: "남자", speed: 1, pauseAfterMs: 300 }] })],
    })
  );

  assert.notEqual(base, differentVoice);
  assert.notEqual(base, faster);
  assert.notEqual(base, paused);
});

test("buildStudioRenderFingerprint changes when image, audio mix, sfx, branding, or template changes", () => {
  const baseInput = makeInput();
  const base = buildStudioRenderFingerprint(baseInput);

  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ slides: [makeSlide({ imageUrl: "https://example.com/image-b.jpg" })] })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ playbackRate: 1.2 })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ bgmEnabled: false })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ selectedBgmTrack: "dark", bgmPath: "/bgm/dark.mp3" })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ bgmVolume: 0.41 })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ mixPresetId: "voice-forward" })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ sfxEnabled: false })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ sfxMasterGainDb: -3 })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ sfxCatalog: [{ id: "hit", files: [{ path: "/sfx/hit.mp3" }] }] })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ branding: { ...baseInput.branding!, headerTitle: "다른 뉴스" } })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ templateId: "minimal" })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ templateData: { headline: "C", body: "B" } })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ templateImageEnabled: false })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ templateImageUrl: "https://example.com/template-b.png" })));
  assert.notEqual(base, buildStudioRenderFingerprint(makeInput({ templateLayoutApply: { title: true, body: false, image: true, info: true } })));
});

test("buildStudioRenderFingerprint does not expose long data urls or base64 payloads", () => {
  const dataUrl = `data:image/png;base64,${"a".repeat(5_000)}`;
  const fingerprint = buildStudioRenderFingerprint(
    makeInput({
      slides: [makeSlide({ imageUrl: dataUrl })],
      templateImageUrl: dataUrl,
    })
  );

  assert.match(fingerprint, /^studio-render-fp-v1:[a-z0-9]+$/);
  assert.equal(fingerprint.includes("data:image/png;base64"), false);
  assert.equal(fingerprint.includes("aaaa"), false);
});

test("buildStudioDraftRenderFingerprint ignores final-only BGM choices but keeps draft audio inputs", () => {
  const base = buildStudioDraftRenderFingerprint(makeInput());

  assert.equal(
    base,
    buildStudioDraftRenderFingerprint(
      makeInput({ bgmEnabled: false, selectedBgmTrack: "dark", bgmPath: "/bgm/dark.mp3", bgmVolume: 0.73 })
    )
  );
  assert.notEqual(base, buildStudioDraftRenderFingerprint(makeInput({ sfxMasterGainDb: -6 })));
});

test("script, prepare, and slide content changes make the preserved draft result stale", () => {
  const base = buildStudioDraftRenderFingerprint(makeInput());

  assert.notEqual(
    base,
    buildStudioDraftRenderFingerprint(
      makeInput({
        slides: [
          makeSlide({
            text: "수정한 문장",
            narrationText: "수정한 문장",
            lines: ["수정한 문장"],
            dialogueSegments: [{ type: "narration", text: "수정한 문장", speed: 1, pauseAfterMs: 0 }],
          }),
        ],
      })
    )
  );
  assert.notEqual(
    base,
    buildStudioDraftRenderFingerprint(
      makeInput({
        slides: [
          makeSlide({
            imageUrl: "https://example.com/prepared-image-b.jpg",
            resolvedImageUrl: "https://example.com/prepared-image-b.jpg",
          }),
        ],
      })
    )
  );
  assert.notEqual(
    base,
    buildStudioDraftRenderFingerprint(makeInput({ slides: [makeSlide(), makeSlide({ groupId: 1, stepIndex: 0 })] }))
  );
});

test("buildStudioImageApprovalFingerprint changes for scene, characters, image inputs, media, layout, template, and branding", () => {
  const baseInput = makeInput({
    source: {
      imageStylePrompt: "editorial photo",
      imagePlannerHint: "close-up",
      characterProfiles: [{ characterId: "hero", displayName: "주인공", identityPrompt: "red jacket" }],
    },
    slides: [
      makeSlide({
        characterIds: ["hero"],
        imageRequest: { query: "브리핑", scene: "회의실" },
        manualImagePrompt: {
          source: "codex",
          mascotName: "주인공",
          characterIds: ["hero"],
          basePrompt: "base",
          scenePrompt: "scene",
          finalPrompt: "final",
          usesFallbackMascot: false,
        },
        imageBeats: [{ beatId: "b1", startLineIndex: 0, imageUrl: "https://example.com/beat-a.jpg", imageRequest: { query: "beat" } }],
      }),
    ],
  });
  const base = buildStudioImageApprovalFingerprint(baseInput);

  assert.match(base, /^studio-image-approval-fp-v1:[a-z0-9]+$/);
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: [makeSlide({ text: "다른 장면" })] })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: [makeSlide({ characterIds: ["villain"] })] })));
  assert.notEqual(
    base,
    buildStudioImageApprovalFingerprint(
      makeInput({
        ...baseInput,
        source: { ...baseInput.source, characterProfiles: [{ characterId: "hero", identityPrompt: "blue jacket" }] },
      })
    )
  );
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, source: { ...baseInput.source, imageStylePrompt: "anime" } })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: [makeSlide({ imageRequest: { query: "다른 이미지" } })] })));
  assert.notEqual(
    base,
    buildStudioImageApprovalFingerprint(
      makeInput({
        ...baseInput,
        slides: [
          makeSlide({
            manualImagePrompt: {
              source: "codex",
              mascotName: "주인공",
              basePrompt: "base",
              scenePrompt: "different",
              finalPrompt: "final",
              usesFallbackMascot: false,
            },
          }),
        ],
      })
    )
  );
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: [makeSlide({ imageUrl: "https://example.com/image-b.jpg" })] })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: [makeSlide({ mediaUrl: "https://example.com/video.mp4", mediaKind: "video" })] })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: [makeSlide({ layout: "body-only" })] })));
  assert.notEqual(
    base,
    buildStudioImageApprovalFingerprint(
      makeInput({
        ...baseInput,
        slides: [makeSlide({ imageBeats: [{ beatId: "b1", startLineIndex: 0, imageUrl: "https://example.com/beat-b.jpg" }] })],
      })
    )
  );
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, branding: { ...baseInput.branding!, headerColor: "#333333" } })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, templateId: "minimal" })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, templateData: { headline: "Z" } })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, templateImageUrl: "https://example.com/template-b.png" })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, templateLayoutApply: { title: true, body: false, image: true, info: true } })));
});

test("buildStudioImageApprovalFingerprint ignores voice, BGM, and SFX-only changes", () => {
  const base = buildStudioImageApprovalFingerprint(makeInput());

  assert.equal(
    base,
    buildStudioImageApprovalFingerprint(
      makeInput({
        selectedVoiceId: "voice-b",
        selectedQuoteVoiceId: "quote-b",
        selectedMaleVoiceId: "male-b",
        selectedFemaleVoiceId: "female-b",
        selectedTypecastEmotionType: "sad",
        selectedTypecastSpeed: 1.3,
        playbackRate: 0.8,
        slides: [makeSlide({ ttsVoiceId: "voice-b", dialogueSegments: [{ type: "quote", text: "첫 문장", speakerId: "남자", voice: "male-b", speed: 1.2, pauseAfterMs: 300 }] })],
        bgmEnabled: false,
        selectedBgmTrack: "dark",
        bgmPath: "/bgm/dark.mp3",
        mixPresetId: "voice-forward",
        sfxEnabled: false,
        sfxMasterGainDb: -6,
        sfxCatalog: [{ id: "hit", files: [{ path: "/sfx/hit.mp3" }] }],
      })
    )
  );
});

test("buildStudioImageApprovalFingerprint ignores pending candidates but changes after explicit approval", () => {
  const approvedSlide = makeSlide({
    imageUrl: "https://example.com/approved.jpg",
    resolvedImageUrl: "https://example.com/approved.jpg",
    resolvedBy: "crawl",
    imageSelection: {
      intent: "news",
      queryCandidates: ["approved query"],
      selectedQuery: "approved query",
      provider: "naver",
      providerCandidates: ["naver"],
      candidateOptions: [
        {
          provider: "naver",
          candidateId: "approved-candidate",
          imageUrl: "https://example.com/approved.jpg",
        },
      ],
      selectedCandidateId: "approved-candidate",
      selectionReason: "automatic provider selection: naver",
    },
  });
  const candidate = buildStudioLibraryImageCandidate({
    assetId: "generated-candidate",
    imageUrl: "https://example.com/generated.jpg",
    title: "generated",
  });
  assert.ok(candidate);

  const baseInput = makeInput({ slides: [approvedSlide] });
  const stagedSlides = addStudioImageCandidateToSlides({
    slides: [approvedSlide],
    index: 0,
    getLinkedSlideIndexes: () => new Set([0]),
    candidate,
  });
  const approvedSlides = applyStudioImageCandidateToSlides({
    slides: stagedSlides,
    index: 0,
    getLinkedSlideIndexes: () => new Set([0]),
    candidate,
  });

  const base = buildStudioImageApprovalFingerprint(baseInput);
  assert.equal(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: stagedSlides })));
  assert.notEqual(base, buildStudioImageApprovalFingerprint(makeInput({ ...baseInput, slides: approvedSlides })));
});

test("approval fingerprints sanitize long data urls before hashing", () => {
  const dataUrl = `data:image/png;base64,${"a".repeat(5_000)}`;
  const differentDataUrl = `data:image/png;base64,${"b".repeat(5_000)}`;
  const base = buildStudioImageApprovalFingerprint(
    makeInput({
      slides: [makeSlide({ imageUrl: dataUrl })],
      templateImageUrl: dataUrl,
    })
  );
  const changed = buildStudioImageApprovalFingerprint(
    makeInput({
      slides: [makeSlide({ imageUrl: differentDataUrl })],
      templateImageUrl: differentDataUrl,
    })
  );

  assert.match(base, /^studio-image-approval-fp-v1:[a-z0-9]+$/);
  assert.equal(base.includes("data:image/png;base64"), false);
  assert.equal(base.includes("aaaa"), false);
  assert.notEqual(base, changed);
});

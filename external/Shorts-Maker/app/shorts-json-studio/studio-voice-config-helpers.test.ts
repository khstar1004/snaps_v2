import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import {
  applyVoiceSelectionToScriptJson,
  applyVoiceSelectionToSlides,
  applyNarrationVoiceSelectionToScriptJson,
  applyNarrationVoiceSelectionToSlides,
  normalizeDefaultVoiceSelectionForRender,
  resolveDialogueVoiceSelectionForRender,
} from "./studio-voice-config-helpers";

test("applyVoiceSelectionToSlides updates slide and dialogue segment voices together", () => {
  const slides: PreparedSlide[] = [
    {
      title: "슬라이드",
      text: "본문",
      lines: ["본문"],
      layout: "photo+body",
      ttsVoiceId: "old-voice",
      dialogueSegments: [
        { type: "narration", text: "내레이션", voice: "old-voice" },
        { type: "quote", text: "인용", speakerId: "speaker-a", voice: "old-voice" },
      ],
    },
  ];

  const next = applyVoiceSelectionToSlides(slides, "new-voice");

  assert.equal(next[0]?.ttsVoiceId, "new-voice");
  assert.deepEqual(
    next[0]?.dialogueSegments?.map((segment) => segment.voice),
    ["new-voice", "new-voice"]
  );
});

test("applyVoiceSelectionToScriptJson rewrites dialogue voice routing and speaker map", () => {
  const source = {
    mode: "dialogue",
    ttsVoiceId: "old-voice",
    narrationVoice: "old-voice",
    quoteVoice: "old-voice",
    speakerVoices: {
      alice: "old-voice",
      bob: "other-voice",
    },
    slides: [
      {
        ttsVoiceId: "old-voice",
        dialogueSegments: [
          { type: "quote", text: "인용", speakerId: "alice", voice: "old-voice" },
        ],
      },
    ],
  } satisfies Record<string, unknown>;

  const next = applyVoiceSelectionToScriptJson(source, "new-voice");

  assert.equal(next.ttsVoiceId, "new-voice");
  assert.equal(next.narrationVoice, "new-voice");
  assert.equal(next.quoteVoice, "new-voice");
  assert.deepEqual(next.speakerVoices, {
    alice: "new-voice",
    bob: "new-voice",
  });

  const nextSlides = Array.isArray(next.slides) ? next.slides : [];
  const firstSlide = nextSlides[0] as Record<string, unknown>;
  assert.equal(firstSlide.ttsVoiceId, "new-voice");
});

test("normalizeDefaultVoiceSelectionForRender clears stale uniform explicit voice routing when global selection is default", () => {
  const source = {
    mode: "dialogue",
    ttsVoiceId: "old-voice",
    narrationVoice: "old-voice",
    quoteVoice: "old-voice",
    speakerVoices: {
      alice: "old-voice",
      bob: "old-voice",
    },
    slides: [
      {
        ttsVoiceId: "old-voice",
        dialogueSegments: [{ type: "quote", text: "인용", voice: "old-voice" }],
      },
    ],
  } satisfies Record<string, unknown>;
  const slides: PreparedSlide[] = [
    {
      title: "슬라이드",
      text: "본문",
      lines: ["본문"],
      layout: "photo+body",
      ttsVoiceId: "old-voice",
      dialogueSegments: [{ type: "quote", text: "인용", voice: "old-voice" }],
    },
  ];

  const normalized = normalizeDefaultVoiceSelectionForRender({
    selectedVoiceId: "",
    source,
    slides,
  });

  assert.equal(normalized.clearedExplicitVoiceId, "old-voice");
  assert.equal(normalized.source.ttsVoiceId, undefined);
  assert.equal(normalized.source.narrationVoice, undefined);
  assert.equal(normalized.source.quoteVoice, undefined);
  assert.equal(normalized.source.speakerVoices, undefined);
  assert.equal(normalized.slides[0]?.ttsVoiceId, undefined);
  assert.equal(normalized.slides[0]?.dialogueSegments?.[0]?.voice, undefined);
});

test("normalizeDefaultVoiceSelectionForRender preserves mixed explicit voice routing", () => {
  const source = {
    mode: "dialogue",
    narrationVoice: "voice-a",
    quoteVoice: "voice-b",
  } satisfies Record<string, unknown>;
  const slides: PreparedSlide[] = [
    {
      title: "슬라이드",
      text: "본문",
      lines: ["본문"],
      layout: "photo+body",
      ttsVoiceId: "voice-a",
      dialogueSegments: [{ type: "quote", text: "인용", voice: "voice-b" }],
    },
  ];

  const normalized = normalizeDefaultVoiceSelectionForRender({
    selectedVoiceId: "",
    source,
    slides,
  });

  assert.equal(normalized.clearedExplicitVoiceId, undefined);
  assert.equal(normalized.source, source);
  assert.equal(normalized.slides, slides);
});

test("applyNarrationVoiceSelection keeps quote segments untouched in dialogue mode", () => {
  const source = {
    mode: "dialogue",
    narrationVoice: "old-narration",
    quoteVoice: "old-quote",
    slides: [
      {
        ttsVoiceId: "old-narration",
        dialogueSegments: [
          { type: "narration", text: "설명", voice: "old-narration" },
          { type: "quote", text: "대사", speakerId: "female_1", voice: "old-quote" },
        ],
      },
    ],
  } satisfies Record<string, unknown>;
  const slides: PreparedSlide[] = [
    {
      title: "슬라이드",
      text: "본문",
      lines: ["본문"],
      layout: "photo+body",
      ttsVoiceId: "old-narration",
      dialogueSegments: [
        { type: "narration", text: "설명", voice: "old-narration" },
        { type: "quote", text: "대사", speakerId: "female_1", voice: "old-quote" },
      ],
    },
  ];

  const nextSource = applyNarrationVoiceSelectionToScriptJson(source, "new-narration");
  const nextSlides = applyNarrationVoiceSelectionToSlides(slides, "new-narration");
  const nextSourceSlides = Array.isArray(nextSource.slides) ? nextSource.slides : [];
  const firstSlide = nextSourceSlides[0] as Record<string, unknown>;
  const firstSlideSegments = Array.isArray(firstSlide.dialogueSegments) ? firstSlide.dialogueSegments : [];

  assert.equal(nextSource.narrationVoice, "new-narration");
  assert.equal(nextSource.quoteVoice, "old-quote");
  assert.equal(firstSlide.ttsVoiceId, "new-narration");
  assert.deepEqual(
    firstSlideSegments.map((segment) => (segment as Record<string, unknown>).voice),
    ["new-narration", "old-quote"]
  );
  assert.equal(nextSlides[0]?.ttsVoiceId, "new-narration");
  assert.deepEqual(
    nextSlides[0]?.dialogueSegments?.map((segment) => segment.voice),
    ["new-narration", "old-quote"]
  );
});

test("resolveDialogueVoiceSelectionForRender applies dialogue role slots and explicit speaker overrides", () => {
  const source = {
    mode: "dialogue",
    speakerVoices: {
      male_2: "custom-male-2",
    },
  } satisfies Record<string, unknown>;
  const slides: PreparedSlide[] = [
    {
      title: "슬라이드",
      text: "설명 대사",
      lines: ["설명", "대사"],
      layout: "photo+body",
      dialogueSegments: [
        { type: "narration", text: "설명" },
        { type: "quote", text: "남자 대사", speakerId: "male_1" },
        { type: "quote", text: "여자 대사", speakerId: "female_1" },
        { type: "quote", text: "또 다른 남자", speakerId: "male_2" },
        { type: "quote", text: "정체 불명", speakerId: "unknown_1" },
      ],
    },
  ];

  const routed = resolveDialogueVoiceSelectionForRender({
    selectedVoiceId: "narration-voice",
    selectedQuoteVoiceId: "quote-voice",
    selectedMaleVoiceId: "male-voice",
    selectedFemaleVoiceId: "female-voice",
    source,
    slides,
  });

  assert.equal(routed.source.narrationVoice, "narration-voice");
  assert.equal(routed.source.quoteVoice, "quote-voice");
  assert.deepEqual(routed.source.speakerVoices, {
    male_1: "male-voice",
    female_1: "female-voice",
    male_2: "custom-male-2",
    unknown_1: "quote-voice",
  });
  assert.deepEqual(
    routed.slides[0]?.dialogueSegments?.map((segment) => segment.voice),
    ["narration-voice", "male-voice", "female-voice", "custom-male-2", "quote-voice"]
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSlideSegmentGroups,
  resolveDialogueRenderOptions,
  resolveSynthesizedSpeechPreviewWindow,
  splitSpeechSegmentsByQuote,
  synthesizeSlideNarrationSegments,
  type DialogueSpeechSynthesizer,
} from "./render-dialogue";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioSynthesizedSpeech } from "@/lib/studio/tts-service";

function makeSlide(input: Partial<PreparedSlide> = {}): PreparedSlide {
  return {
    title: input.title || "테스트 슬라이드",
    text: input.text || "기본 문장",
    lines: input.lines || [input.text || "기본 문장"],
    layout: input.layout || "photo+body",
    narrationText: input.narrationText,
    dialogueSegments: input.dialogueSegments,
    groupId: input.groupId,
    stepIndex: input.stepIndex,
    ttsVoiceId: input.ttsVoiceId,
  };
}

function makeWavBase64(durationSec: number, audibleEndSec?: number): string {
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const channelCount = 1;
  const blockAlign = (channelCount * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const sampleCount = Math.max(1, Math.round(durationSec * sampleRate));
  const dataLength = sampleCount * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);
  const samples = Buffer.alloc(dataLength);
  if (Number.isFinite(audibleEndSec)) {
    const audibleSampleCount = Math.min(sampleCount, Math.max(0, Math.round(Number(audibleEndSec) * sampleRate)));
    for (let index = 0; index < audibleSampleCount; index += 1) {
      samples.writeInt16LE(12_000, index * blockAlign);
    }
  }
  return Buffer.concat([header, samples]).toString("base64");
}

function makeSpeech(
  text: string,
  voiceId: string | undefined,
  durationSec = 1,
  spokenEndSec = durationSec,
  wavAudibleEndSec?: number
): StudioSynthesizedSpeech {
  const safeVoiceId = voiceId || "default-voice";
  const charCount = text.length;
  const safeSpokenEndSec = Math.max(0.001, Math.min(durationSec, spokenEndSec));
  const characterStartTimesSec = Array.from({ length: charCount }, (_, index) => (safeSpokenEndSec * index) / Math.max(1, charCount));
  const characterEndTimesSec = Array.from(
    { length: charCount },
    (_, index) => (safeSpokenEndSec * (index + 1)) / Math.max(1, charCount)
  );
  return {
    audioBase64: makeWavBase64(durationSec, wavAudibleEndSec),
    durationSec,
    mimeType: "audio/wav",
    format: "wav",
    provider: "typecast",
    supportsAlignment: true,
    words: [
      {
        word: text,
        startSec: 0,
        endSec: safeSpokenEndSec,
        charStart: 0,
        charEnd: text.length,
      },
    ],
    characterStartTimesSec,
    characterEndTimesSec,
    resolvedVoice: {
      id: safeVoiceId,
      label: safeVoiceId,
      provider: "typecast",
      previewText: "",
      settings: {
        defaultProvider: "typecast",
        defaultVoiceId: safeVoiceId,
        previewText: "",
        typecast: {
          apiKey: "",
          defaultVoiceId: safeVoiceId,
          modelId: "test-model",
          defaultLanguage: "kor",
          defaultEmotionType: "normal",
          speed: 1,
        },
        updatedAtMs: 0,
      },
      typecast: {
        voiceId: safeVoiceId,
        modelId: "test-model",
        language: "kor",
        emotionType: "normal",
      },
    },
  };
}

function makeTrackingSynthesizer(callLog: Array<{ text: string; voiceId?: string }>): DialogueSpeechSynthesizer {
  return async (text, voiceId) => {
    callLog.push({ text, voiceId });
    return makeSpeech(text, voiceId);
  };
}

function makePlannedSynthesizer(
  callLog: Array<{ text: string; voiceId?: string }>,
  plan: Record<string, { durationSec: number; spokenEndSec: number }>
): DialogueSpeechSynthesizer {
  return async (text, voiceId) => {
    callLog.push({ text, voiceId });
    const item = plan[text] || { durationSec: 1, spokenEndSec: 1 };
    return makeSpeech(text, voiceId, item.durationSec, item.spokenEndSec);
  };
}

function makeDetailedTrackingSynthesizer(
  callLog: Array<{
    text: string;
    voiceId?: string;
    typecastEmotionType?: string;
    typecastSpeed?: number;
  }>
): DialogueSpeechSynthesizer {
  return async (text, voiceId, typecastEmotionType, typecastSpeed) => {
    callLog.push({ text, voiceId, typecastEmotionType, typecastSpeed });
    return makeSpeech(text, voiceId);
  };
}

test("resolveDialogueRenderOptions auto-enables dialogue mode when quoted text appears", () => {
  const options = resolveDialogueRenderOptions({
    ttsVoiceId: "voice-default",
    typecastEmotionType: "calm",
    slides: [makeSlide({ text: '진행자가 말했다 "Alice: 안녕하세요"' })],
  });

  assert.equal(options.mode, "dialogue");
  assert.equal(options.narrationVoice, "voice-default");
  assert.equal(options.quoteVoice, "voice-default");
  assert.equal(options.typecastEmotionType, "calm");
});

test("splitSpeechSegmentsByQuote extracts quote speaker prefixes and surrounding narration", () => {
  const parsed = splitSpeechSegmentsByQuote('도입 설명 "Alice: 안녕하세요" 마무리');

  assert.equal(parsed.hasQuote, true);
  assert.deepEqual(parsed.segments, [
    { type: "narration", text: "도입 설명", speakerId: undefined },
    { type: "quote", text: "안녕하세요", speakerId: "Alice" },
    { type: "narration", text: "마무리", speakerId: undefined },
  ]);
});

test("buildSlideSegmentGroups sorts grouped frames by stepIndex before combining narration", () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
  });
  const groups = buildSlideSegmentGroups(
    [
      makeSlide({ groupId: 3, stepIndex: 1, text: "둘째 문장", lines: ["둘째 문장"] }),
      makeSlide({ groupId: 3, stepIndex: 0, text: "첫 문장", lines: ["첫 문장"] }),
    ],
    options
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.groupId, 3);
  assert.deepEqual(
    groups[0]?.frames.map((frame) => frame.stepIndex),
    [0, 1]
  );
  assert.equal(groups[0]?.text, "첫 문장 둘째 문장");
  assert.deepEqual(groups[0]?.speechSegments, [
    {
      type: "narration",
      text: "첫 문장 둘째 문장",
      voiceId: "voice-default",
      pauseAfterMs: 0,
    },
  ]);
});

test("buildSlideSegmentGroups preserves explicit per-line settings in normal mode", () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
  });
  const groups = buildSlideSegmentGroups(
    [
      makeSlide({
        text: "첫 문장 둘째 문장",
        lines: ["첫 문장", "둘째 문장"],
        dialogueSegments: [
          { type: "narration", text: "첫 문장", voice: "voice-a", speed: 0.8, pauseAfterMs: 250 },
          { type: "narration", text: "둘째 문장", voice: "voice-b", speed: 1.2, pauseAfterMs: 0 },
        ],
      }),
    ],
    options
  );

  assert.deepEqual(groups[0]?.speechSegments, [
    {
      type: "narration",
      text: "첫 문장",
      speakerId: undefined,
      voiceId: "voice-a",
      speed: 0.8,
      pauseAfterMs: 250,
    },
    {
      type: "narration",
      text: "둘째 문장",
      speakerId: undefined,
      voiceId: "voice-b",
      speed: 1.2,
      pauseAfterMs: 0,
    },
  ]);
});

test("synthesizeSlideNarrationSegments applies clamped per-line speed before the global speed", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
    typecastEmotionType: "calm",
    typecastSpeed: 1.1,
  });
  const groups = buildSlideSegmentGroups(
    [
      makeSlide({
        text: "빠르게 느리게 기본으로",
        lines: ["빠르게", "느리게", "기본으로"],
        dialogueSegments: [
          { type: "narration", text: "빠르게", speed: 4 },
          { type: "narration", text: "느리게", speed: 0.1 },
          { type: "narration", text: "기본으로" },
        ],
      }),
    ],
    options
  );
  const calls: Array<{
    text: string;
    voiceId?: string;
    typecastEmotionType?: string;
    typecastSpeed?: number;
  }> = [];

  await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    typecastEmotionType: options.typecastEmotionType,
    typecastSpeed: options.typecastSpeed,
    synthesizeText: makeDetailedTrackingSynthesizer(calls),
  });

  assert.deepEqual(calls, [
    { text: "빠르게", voiceId: "voice-default", typecastEmotionType: "calm", typecastSpeed: 2 },
    { text: "느리게", voiceId: "voice-default", typecastEmotionType: "calm", typecastSpeed: 0.5 },
    { text: "기본으로", voiceId: "voice-default", typecastEmotionType: "calm", typecastSpeed: 1.1 },
  ]);
});

test("synthesizeSlideNarrationSegments includes explicit pause in part, frame, and total durations", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
  });
  const groups = buildSlideSegmentGroups(
    [
      makeSlide({
        text: "첫 문장 둘째 문장",
        lines: ["첫 문장", "둘째 문장"],
        dialogueSegments: [
          { type: "narration", text: "첫 문장", pauseAfterMs: 400 },
          { type: "narration", text: "둘째 문장", pauseAfterMs: 0 },
        ],
      }),
    ],
    options
  );
  const result = await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    synthesizeText: makeTrackingSynthesizer([]),
  });

  assert.equal(result.narrationSegments.length, 2);
  assert.equal(result.narrationSegments[0]?.durationMs, 1400);
  assert.equal(result.narrationSegments[0]?.pauseAfterMs, 400);
  assert.equal(result.narrationSegments[1]?.durationMs, 1000);
  assert.equal(result.narrationSegments[1]?.pauseAfterMs, 0);
  assert.equal(result.frameDurationsSec.reduce((total, value) => total + value, 0), 2.4);
  assert.equal(result.durationMs, 2400);
});

test("synthesizeSlideNarrationSegments keeps different dialogue voices as separate TTS calls inside one group", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "dialogue",
    narrationVoice: "narrator-voice",
    quoteVoice: "quote-voice",
  });
  const groups = buildSlideSegmentGroups(
    [
      makeSlide({
        text: "Intro Hello",
        lines: ["Intro Hello"],
        dialogueSegments: [
          { type: "narration", text: "Intro" },
          { type: "quote", text: "Hello", speakerId: "speaker_1" },
        ],
      }),
    ],
    options
  );
  const calls: Array<{ text: string; voiceId?: string }> = [];
  const result = await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    synthesizeText: makePlannedSynthesizer(calls, {
      Intro: { durationSec: 1.5, spokenEndSec: 1 },
      Hello: { durationSec: 2, spokenEndSec: 1.3 },
    }),
  });

  assert.deepEqual(calls, [
    { text: "Intro", voiceId: "narrator-voice" },
    { text: "Hello", voiceId: "quote-voice" },
  ]);
  assert.equal(result.narrationSegments.length, 2);
  assert.equal(result.narrationSegments[0]?.segmentId, "segment-1-1");
  assert.equal(result.narrationSegments[1]?.segmentId, "segment-1-2");
  assert.equal(result.narrationSegments[0]?.groupId, 0);
  assert.equal(result.narrationSegments[1]?.groupId, 0);
  assert.equal(result.narrationSegments[0]?.durationMs, 1250);
  assert.equal(result.narrationSegments[1]?.durationMs, 1750);
  assert.equal(result.narrationSegments[0]?.trimStartMs, 0);
  assert.equal(result.narrationSegments[1]?.trimStartMs, 0);
  assert.equal(result.narrationSegments[0]?.trimEndMs, 1250);
  assert.equal(result.narrationSegments[1]?.trimEndMs, 1750);
  assert.deepEqual(result.crossfadeMsByBoundary, [0]);
  assert.equal(result.durationMs, 3000);
  assert.equal(result.ttsChars, "Intro".length + "Hello".length);
});

test("synthesizeSlideNarrationSegments prefers manual male and female speaker voices over the quote default", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "dialogue",
    narrationVoice: "female-default",
    quoteVoice: "male-default",
    speakerVoices: {
      민수: "manual-minsu-voice",
      지수: "manual-jisu-voice",
    },
  });
  const groups = buildSlideSegmentGroups(
    [
      makeSlide({
        text: "설명 남자 대사 여자 대사",
        lines: ["설명 남자 대사 여자 대사"],
        dialogueSegments: [
          { type: "narration", text: "설명" },
          { type: "quote", text: "남자 대사", speakerId: "민수" },
          { type: "quote", text: "여자 대사", speakerId: "지수" },
        ],
      }),
    ],
    options
  );
  const calls: Array<{ text: string; voiceId?: string }> = [];
  const result = await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    synthesizeText: makeTrackingSynthesizer(calls),
  });

  assert.deepEqual(calls, [
    { text: "설명", voiceId: "female-default" },
    { text: "남자 대사", voiceId: "manual-minsu-voice" },
    { text: "여자 대사", voiceId: "manual-jisu-voice" },
  ]);
  assert.equal(result.narrationSegments.length, 3);
});

test("synthesizeSlideNarrationSegments keeps normal single narration as one TTS call", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
  });
  const groups = buildSlideSegmentGroups(
    [makeSlide({ text: "한 문장 나레이션", lines: ["한 문장 나레이션"] })],
    options
  );
  const calls: Array<{ text: string; voiceId?: string }> = [];
  const result = await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    synthesizeText: makeTrackingSynthesizer(calls),
  });

  assert.deepEqual(calls, [{ text: "한 문장 나레이션", voiceId: "voice-default" }]);
  assert.equal(result.narrationSegments.length, 1);
  assert.equal(result.narrationSegments[0]?.durationMs, 1000);
  assert.equal(result.narrationSegments[0]?.pauseAfterMs, 0);
});

test("synthesizeSlideNarrationSegments trims waveform tail when Typecast timestamps cover the full audio", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
  });
  const groups = buildSlideSegmentGroups(
    [makeSlide({ text: "후행 무음 제거", lines: ["후행 무음 제거"] })],
    options
  );
  const result = await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    synthesizeText: async (text, voiceId) => makeSpeech(text, voiceId, 1, 1, 0.75),
  });

  assert.equal(result.narrationSegments.length, 1);
  assert.equal(result.narrationSegments[0]?.trimEndMs, 830);
  assert.equal(result.narrationSegments[0]?.durationMs, 830);
  assert.equal(result.durationMs, 830);
});

test("resolveSynthesizedSpeechPreviewWindow matches the render tail trim", () => {
  const text = "후행 무음 미리듣기";
  const speech = makeSpeech(text, "voice-default", 1, 1, 0.75);

  assert.deepEqual(resolveSynthesizedSpeechPreviewWindow(text, speech), {
    trimStartMs: 0,
    trimEndMs: 830,
    durationMs: 830,
  });
});

test("synthesizeSlideNarrationSegments keeps short waveform tails to protect quiet word endings", async () => {
  const options = resolveDialogueRenderOptions({
    mode: "normal",
    ttsVoiceId: "voice-default",
  });
  const groups = buildSlideSegmentGroups(
    [makeSlide({ text: "말끝 보호", lines: ["말끝 보호"] })],
    options
  );
  const result = await synthesizeSlideNarrationSegments(groups, {
    mode: options.mode,
    synthesizeText: async (text, voiceId) => makeSpeech(text, voiceId, 1, 1, 0.9),
  });

  assert.equal(result.narrationSegments[0]?.trimEndMs, 1000);
  assert.equal(result.durationMs, 1000);
});

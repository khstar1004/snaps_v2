import test from "node:test";
import assert from "node:assert/strict";
import type { ResolvedStudioVoiceSelection } from "./tts-config";
import { buildStudioSpeechCacheContext, synthesizeStudioSpeechFromSelection } from "./tts-service";
import { prepareStudioTtsText, STUDIO_TTS_TEXT_NORMALIZATION_VERSION } from "./tts-text";

function createTinyWavBuffer(): ArrayBuffer {
  const dataLength = 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + dataLength, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, dataLength, true);
  view.setInt16(44, 0, true);
  return buffer;
}

function makeSelection(): ResolvedStudioVoiceSelection {
  return {
    id: "typecast:voice:tc_test_voice",
    label: "테스트 음성",
    provider: "typecast",
    previewText: "",
    settings: {
      defaultProvider: "typecast",
      defaultVoiceId: "typecast:voice:tc_test_voice",
      previewText: "",
      typecast: {
        apiKey: "test-key",
        defaultVoiceId: "tc_test_voice",
        modelId: "ssfm-v30",
        defaultLanguage: "kor",
        defaultEmotionType: "smart",
        speed: 1,
      },
      updatedAtMs: 0,
    },
    typecast: {
      voiceId: "tc_test_voice",
      modelId: "ssfm-v30",
      language: "kor",
      emotionType: "smart",
    },
  };
}

test("prepareStudioTtsText removes only parenthesized Hanja from TTS text", () => {
  const normalization = prepareStudioTtsText(
    "달 월(月) 불 화(火) 물 수(水) 나무 목(木) 쇠 금(金) 흙 토(土) 해 일(日)"
  );

  assert.equal(normalization.text, "달 월 불 화 물 수 나무 목 쇠 금 흙 토 해 일");
  assert.equal(prepareStudioTtsText("월(月)이 무슨 뜻인지").text, "월이 무슨 뜻인지");
  assert.equal(prepareStudioTtsText("월(요일)과 (1편), (月요일), （火）").text, "월(요일)과 (1편), (月요일),");
});

test("synthesizeStudioSpeechFromSelection sends normalized text and remaps alignment to the source", async (t) => {
  const originalFetch = global.fetch;
  let requestedText = "";

  global.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body || "{}")) as { text?: string };
    requestedText = String(payload.text || "");
    return Response.json({
      audio: Buffer.from(createTinyWavBuffer()).toString("base64"),
      audio_format: "wav",
      audio_duration: 0.25,
      words: [{ text: requestedText, start: 0, end: 0.25 }],
      characters: Array.from(requestedText).map((character, index) => ({
        text: character,
        start: index * 0.05,
        end: (index + 1) * 0.05,
      })),
    });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const selection = makeSelection();
  const result = await synthesizeStudioSpeechFromSelection(selection, "월(月)이");

  assert.equal(requestedText, "월이");
  assert.deepEqual(result.words, [{ word: "월이", startSec: 0, endSec: 0.25, charStart: 0, charEnd: 5 }]);
  assert.deepEqual(result.characterStartTimesSec, [0, Number.NaN, Number.NaN, Number.NaN, 0.05]);
  assert.deepEqual(result.characterEndTimesSec, [0.05, Number.NaN, Number.NaN, Number.NaN, 0.1]);

  const cacheVariant = JSON.parse(buildStudioSpeechCacheContext(selection).variant) as {
    textNormalizationVersion?: string;
  };
  assert.equal(cacheVariant.textNormalizationVersion, STUDIO_TTS_TEXT_NORMALIZATION_VERSION);
});

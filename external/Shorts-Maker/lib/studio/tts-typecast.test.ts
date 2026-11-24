import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeTypecastSpeech } from "./tts-typecast";

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

function createTypecastTimestampResponse(text = "테스트"): Record<string, unknown> {
  return {
    audio: Buffer.from(createTinyWavBuffer()).toString("base64"),
    audio_format: "wav",
    audio_duration: 0.25,
    words: [{ text, start: 0, end: 0.25 }],
    characters: Array.from(text).map((character, index) => ({
      text: character,
      start: index * 0.05,
      end: (index + 1) * 0.05,
    })),
  };
}

test("synthesizeTypecastSpeech forwards the configured emotion type", async (t) => {
  const originalFetch = global.fetch;
  let prompt: Record<string, unknown> | null = null;

  global.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body || "{}")) as { prompt?: Record<string, unknown> };
    prompt = payload.prompt || null;
    return Response.json(createTypecastTimestampResponse());
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await synthesizeTypecastSpeech(
    { apiKey: "test-key" },
    {
      text: "테스트",
      voiceId: "tc_test_voice",
      model: "ssfm-v30",
      language: "kor",
      emotionType: "sad",
      speed: 1,
    }
  );

  assert.deepEqual(prompt, {
    emotion_type: "preset",
    emotion_preset: "sad",
    emotion_intensity: 1,
  });
  assert.equal(result.mimeType, "audio/wav");
  assert.equal(result.durationSec, 0.25);
  assert.deepEqual(result.words, [{ word: "테스트", startSec: 0, endSec: 0.25, charStart: 0, charEnd: 3 }]);
  assert.deepEqual(result.characterStartTimesSec, [0, 0.05, 0.1]);
});

test("synthesizeTypecastSpeech uses v21 preset payload for legacy emotions", async (t) => {
  const originalFetch = global.fetch;
  let prompt: Record<string, unknown> | null = null;

  global.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body || "{}")) as { prompt?: Record<string, unknown> };
    prompt = payload.prompt || null;
    return Response.json(createTypecastTimestampResponse());
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  await synthesizeTypecastSpeech(
    { apiKey: "test-key" },
    {
      text: "테스트",
      voiceId: "tc_test_voice",
      model: "ssfm-v21",
      emotionType: "happy",
    }
  );

  assert.deepEqual(prompt, {
    emotion_preset: "happy",
    emotion_intensity: 1,
  });
});

test("synthesizeTypecastSpeech falls back to smart prompt for unsupported emotion text", async (t) => {
  const originalFetch = global.fetch;
  let prompt: Record<string, unknown> | null = null;

  global.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body || "{}")) as { prompt?: Record<string, unknown> };
    prompt = payload.prompt || null;
    return Response.json(createTypecastTimestampResponse());
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  await synthesizeTypecastSpeech(
    { apiKey: "test-key" },
    {
      text: "테스트",
      voiceId: "tc_test_voice",
      model: "ssfm-v21",
      emotionType: "calm",
      previousText: "이전 문장",
      nextText: "다음 문장",
    }
  );

  assert.deepEqual(prompt, {
    emotion_type: "smart",
    previous_text: "이전 문장",
    next_text: "다음 문장",
  });
});

test("synthesizeTypecastSpeech retries after a 429 rate limit response", async (t) => {
  const originalFetch = global.fetch;
  const originalRetries = process.env.TYPECAST_RATE_LIMIT_RETRIES;
  const originalBaseDelay = process.env.TYPECAST_RATE_LIMIT_BASE_DELAY_MS;
  let attempt = 0;

  process.env.TYPECAST_RATE_LIMIT_RETRIES = "2";
  process.env.TYPECAST_RATE_LIMIT_BASE_DELAY_MS = "0";

  global.fetch = async () => {
    attempt += 1;
    if (attempt === 1) {
      return new Response('{"error_code":"RATE_LIMIT_EXCEEDED","message":"Too many requests"}', {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "0",
        },
      });
    }
    return Response.json(createTypecastTimestampResponse());
  };

  t.after(() => {
    global.fetch = originalFetch;
    if (typeof originalRetries === "string") process.env.TYPECAST_RATE_LIMIT_RETRIES = originalRetries;
    else delete process.env.TYPECAST_RATE_LIMIT_RETRIES;
    if (typeof originalBaseDelay === "string") process.env.TYPECAST_RATE_LIMIT_BASE_DELAY_MS = originalBaseDelay;
    else delete process.env.TYPECAST_RATE_LIMIT_BASE_DELAY_MS;
  });

  const result = await synthesizeTypecastSpeech(
    { apiKey: "test-key" },
    {
      text: "테스트",
      voiceId: "tc_test_voice",
      model: "ssfm-v21",
      emotionType: "happy",
    }
  );

  assert.equal(attempt, 2);
  assert.equal(result.mimeType, "audio/wav");
  assert.ok(result.durationSec > 0);
});

test("synthesizeTypecastSpeech calls the timestamp endpoint", async (t) => {
  const originalFetch = global.fetch;
  let requestedUrl = "";

  global.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json(createTypecastTimestampResponse("정확한 싱크"));
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await synthesizeTypecastSpeech(
    { apiKey: "test-key" },
    {
      text: "정확한 싱크",
      voiceId: "tc_test_voice",
      model: "ssfm-v30",
      language: "kor",
      emotionType: "smart",
    }
  );

  assert.match(requestedUrl, /\/v1\/text-to-speech\/with-timestamps$/);
  assert.equal(result.durationSec, 0.25);
  assert.ok(result.characterEndTimesSec.some((value) => Number.isFinite(value)));
});

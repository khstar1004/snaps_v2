import test from "node:test";
import assert from "node:assert/strict";
import { getTypecastDefaultEmotionTypeFromEnv } from "./tts-typecast";
import { applyTypecastSpeedOverride } from "./typecast-speed-override";

test("getTypecastDefaultEmotionTypeFromEnv prefers TYPECAST_DEFAULT_EMOTION_TYPE", () => {
  assert.equal(
    getTypecastDefaultEmotionTypeFromEnv({
      TYPECAST_DEFAULT_EMOTION_TYPE: "calm",
      TYPECAST_EMOTION_TYPE: "sad",
    }),
    "calm"
  );
});

test("getTypecastDefaultEmotionTypeFromEnv falls back to TYPECAST_EMOTION_TYPE", () => {
  assert.equal(
    getTypecastDefaultEmotionTypeFromEnv({
      TYPECAST_EMOTION_TYPE: "sad",
    }),
    "sad"
  );
});

test("applyTypecastSpeedOverride updates speed without mutating the original settings object", () => {
  const settings = {
    defaultProvider: "typecast",
    previewText: "preview",
    typecast: {
      speed: 1.2,
      defaultVoiceId: "tc_default_voice",
    },
  };

  const next = applyTypecastSpeedOverride(settings, 0.8);

  assert.notEqual(next, settings);
  assert.equal(next.typecast.speed, 0.8);
  assert.equal(settings.typecast.speed, 1.2);
});

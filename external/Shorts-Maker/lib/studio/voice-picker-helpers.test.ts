import assert from "node:assert/strict";
import test from "node:test";
import {
  filterStudioVoiceOptions,
  normalizeStudioVoiceFavoriteId,
  normalizeStudioVoiceFavoriteIds,
  type StudioVoiceSearchOption,
} from "./voice-picker-helpers";

const VOICES: StudioVoiceSearchOption[] = [
  {
    id: "typecast:voice:tc_sanghyun",
    label: "Sanghyun · Typecast",
    description: "male · adult · ssfm-v30",
    provider: "typecast",
    source: "runtime",
  },
  {
    id: "typecast:voice:tc_seohyeon",
    label: "Seohyeon · Typecast",
    description: "female · young · ssfm-v30",
    provider: "typecast",
    source: "runtime",
  },
  {
    id: "voice-asset-custom",
    label: "내 저장 보이스 · Typecast",
    description: "custom narration voice",
    provider: "typecast",
    source: "asset",
  },
];

test("normalizeStudioVoiceFavoriteId keeps Typecast ids stable across raw and prefixed forms", () => {
  assert.equal(normalizeStudioVoiceFavoriteId("tc_sanghyun"), "typecast:voice:tc_sanghyun");
  assert.equal(normalizeStudioVoiceFavoriteId("typecast:voice:tc_sanghyun"), "typecast:voice:tc_sanghyun");
  assert.equal(normalizeStudioVoiceFavoriteId("voice-asset-custom"), "voice-asset-custom");
  assert.deepEqual(
    normalizeStudioVoiceFavoriteIds(["tc_sanghyun", "typecast:voice:tc_sanghyun", "voice-asset-custom"]),
    ["typecast:voice:tc_sanghyun", "voice-asset-custom"]
  );
});

test("filterStudioVoiceOptions matches English labels, ids, and descriptions case-insensitively", () => {
  assert.deepEqual(
    filterStudioVoiceOptions({ options: VOICES, query: "seo" }).map((voice) => voice.id),
    ["typecast:voice:tc_seohyeon"]
  );
  assert.deepEqual(
    filterStudioVoiceOptions({ options: VOICES, query: "TC SANG" }).map((voice) => voice.id),
    ["typecast:voice:tc_sanghyun"]
  );
  assert.deepEqual(
    filterStudioVoiceOptions({ options: VOICES, query: "custom narration" }).map((voice) => voice.id),
    ["voice-asset-custom"]
  );
});

test("filterStudioVoiceOptions sorts favorites first and supports favorite-only mode", () => {
  assert.deepEqual(
    filterStudioVoiceOptions({
      options: VOICES,
      favoriteIds: ["tc_seohyeon"],
      selectedId: "typecast:voice:tc_sanghyun",
    }).map((voice) => voice.id),
    ["typecast:voice:tc_seohyeon", "typecast:voice:tc_sanghyun", "voice-asset-custom"]
  );

  assert.deepEqual(
    filterStudioVoiceOptions({
      options: VOICES,
      favoriteIds: ["tc_seohyeon"],
      favoriteOnly: true,
    }).map((voice) => voice.id),
    ["typecast:voice:tc_seohyeon"]
  );
});

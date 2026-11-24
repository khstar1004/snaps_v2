import assert from "node:assert/strict";
import test from "node:test";
import {
  addManualTypecastVoiceOption,
  createManualTypecastVoiceOption,
  dedupeStudioVoiceOptionsById,
  findMatchingStudioVoiceOption,
  getTypecastVoiceCatalogId,
  mergeStudioVoiceOptions,
  toNormalizedTypecastVoiceOptionId,
} from "./studio-manual-voice-options";

test("toNormalizedTypecastVoiceOptionId prefixes raw voice ids", () => {
  assert.equal(toNormalizedTypecastVoiceOptionId("tc_1234"), "typecast:voice:tc_1234");
  assert.equal(toNormalizedTypecastVoiceOptionId(" typecast:voice:tc_1234 "), "typecast:voice:tc_1234");
});

test("getTypecastVoiceCatalogId strips the typecast prefix", () => {
  assert.equal(getTypecastVoiceCatalogId("typecast:voice:tc_9876"), "tc_9876");
  assert.equal(getTypecastVoiceCatalogId("tc_9876"), "tc_9876");
});

test("mergeStudioVoiceOptions keeps a selected custom voice visible", () => {
  const merged = mergeStudioVoiceOptions(
    [
      {
        id: "typecast:voice:tc_builtin",
        label: "기본 Typecast",
        provider: "typecast",
        source: "builtin",
      },
    ],
    [],
    "typecast:voice:tc_manual"
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.id, "typecast:voice:tc_manual");
});

test("addManualTypecastVoiceOption reuses existing catalog entries", () => {
  const result = addManualTypecastVoiceOption(
    [
      {
        id: "typecast:voice:tc_existing",
        label: "기존 음성",
        provider: "typecast",
        source: "runtime",
      },
    ],
    [],
    "tc_existing"
  );

  assert.deepEqual(result, {
    manualOptions: [],
    selectedVoiceId: "typecast:voice:tc_existing",
  });
});

test("createManualTypecastVoiceOption can preserve an exact selected id", () => {
  const option = createManualTypecastVoiceOption("tc_raw_selected", { preserveExactId: true });
  assert.equal(option?.id, "tc_raw_selected");
  assert.equal(option?.label, "tc_raw_selected · Typecast 직접 추가");
});

test("findMatchingStudioVoiceOption matches raw tc ids to prefixed options", () => {
  const matched = findMatchingStudioVoiceOption(
    [
      {
        id: "typecast:voice:tc_existing",
        label: "기존 음성",
        provider: "typecast",
        source: "runtime",
      },
    ],
    "tc_existing"
  );

  assert.equal(matched?.id, "typecast:voice:tc_existing");
});

test("dedupeStudioVoiceOptionsById keeps the first option for duplicate ids", () => {
  const options = dedupeStudioVoiceOptionsById([
    { id: "typecast:voice:tc_duplicate", label: "TC A", provider: "typecast", source: "builtin" },
    { id: "typecast:voice:tc_duplicate", label: "TC B", provider: "typecast", source: "runtime" },
    { id: "typecast:voice:tc_1", label: "TC 1", provider: "typecast", source: "builtin" },
  ]);

  assert.deepEqual(
    options.map((option) => option.label),
    ["TC A", "TC 1"]
  );
});

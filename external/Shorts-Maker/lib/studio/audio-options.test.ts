import assert from "node:assert/strict";
import test from "node:test";
import { GENERAL_STUDIO_SFX_CATEGORY_ID, resolveAutoSfxCategoryIds } from "./audio-options";

test("resolveAutoSfxCategoryIds prefers specific sfx folders over the general bucket", () => {
  const result = resolveAutoSfxCategoryIds([
    { id: GENERAL_STUDIO_SFX_CATEGORY_ID },
    { id: "재미" },
    { id: "놀람" },
  ]);

  assert.deepEqual(result, ["재미", "놀람"]);
});

test("resolveAutoSfxCategoryIds falls back to the general bucket when it is the only category", () => {
  const result = resolveAutoSfxCategoryIds([{ id: GENERAL_STUDIO_SFX_CATEGORY_ID }]);

  assert.deepEqual(result, [GENERAL_STUDIO_SFX_CATEGORY_ID]);
});

test("resolveAutoSfxCategoryIds falls back to the first category when the general bucket is missing", () => {
  const result = resolveAutoSfxCategoryIds([{ id: "전환" }, { id: "놀람" }], GENERAL_STUDIO_SFX_CATEGORY_ID);

  assert.deepEqual(result, ["전환", "놀람"]);
});

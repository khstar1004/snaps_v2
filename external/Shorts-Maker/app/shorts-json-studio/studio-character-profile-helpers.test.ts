import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyStoryCharacterProfileRow,
  getNextStoryCharacterId,
  removeStoryCharacterProfileRow,
  resolveStoryCharacterAnchorPreviewUrl,
  updateStoryCharacterProfileRow,
} from "./studio-character-profile-helpers";
import type { StoryCharacterProfileEditorRow } from "./studio-page-helpers";

function makeRow(overrides: Partial<StoryCharacterProfileEditorRow>): StoryCharacterProfileEditorRow {
  return {
    characterId: "character_1",
    displayName: "",
    identityPrompt: "",
    anchorImageUrl: "",
    anchorAssetId: "",
    sampleTexts: [],
    isInferred: false,
    ...overrides,
  };
}

test("getNextStoryCharacterId skips existing character ids", () => {
  assert.equal(
    getNextStoryCharacterId([
      { characterId: "character_1" },
      { characterId: "female_1" },
      { characterId: "character_2" },
    ]),
    "character_3"
  );
});

test("createEmptyStoryCharacterProfileRow creates a non-inferred editable profile", () => {
  const row = createEmptyStoryCharacterProfileRow([{ characterId: "character_1" }]);

  assert.deepEqual(row, {
    characterId: "character_2",
    displayName: "새 캐릭터 2",
    identityPrompt: "",
    anchorImageUrl: "",
    anchorAssetId: "",
    sampleTexts: [],
    isInferred: false,
  });
});

test("updateStoryCharacterProfileRow edits only the requested immutable id row", () => {
  const rows = [
    makeRow({ characterId: "female_1", displayName: "기존" }),
    makeRow({ characterId: "male_1", identityPrompt: "검은 코트" }),
  ];

  const next = updateStoryCharacterProfileRow(rows, "male_1", "identityPrompt", "짧은 머리, 검은 코트");

  assert.equal(next[0]?.displayName, "기존");
  assert.equal(next[1]?.identityPrompt, "짧은 머리, 검은 코트");
  assert.equal(next[1]?.characterId, "male_1");
});

test("removeStoryCharacterProfileRow drops the manual row and leaves other rows intact", () => {
  const rows = [
    makeRow({ characterId: "female_1", isInferred: true }),
    makeRow({ characterId: "character_1", displayName: "고정 캐릭터" }),
  ];

  assert.deepEqual(removeStoryCharacterProfileRow(rows, "character_1"), [rows[0]]);
});

test("resolveStoryCharacterAnchorPreviewUrl keeps same-origin paths and proxies remote anchors", () => {
  assert.equal(
    resolveStoryCharacterAnchorPreviewUrl(" /api/local-storage/images/anchor.png "),
    "/api/local-storage/images/anchor.png"
  );
  assert.equal(
    resolveStoryCharacterAnchorPreviewUrl("https://images.example.com/anchor.png"),
    "/api/studio/image-proxy?url=https%3A%2F%2Fimages.example.com%2Fanchor.png"
  );
  assert.equal(resolveStoryCharacterAnchorPreviewUrl("//127.0.0.1/private.png"), null);
  assert.equal(resolveStoryCharacterAnchorPreviewUrl("/studio-assets/private.png"), null);
  assert.equal(resolveStoryCharacterAnchorPreviewUrl("data:image/png;base64,AAAA"), null);
});

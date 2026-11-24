import assert from "node:assert/strict";
import test from "node:test";
import {
  areStudioCharacterProfilesEqual,
  normalizeStudioCharacterProfiles,
  resolveStudioCharacterProfileById,
  resolveStudioFixedCharacterProfileRoster,
} from "./character-profiles";

test("normalizeStudioCharacterProfiles sanitizes and deduplicates saved profile characters", () => {
  assert.deepEqual(
    normalizeStudioCharacterProfiles([
      {
        characterId: " hero 1 ",
        displayName: "  주인공  ",
        identityPrompt: " 검은 머리\n남색 재킷 ",
        anchorImageUrl: " https://assets.example.com/hero.png ",
      },
      { characterId: "hero_1", displayName: "중복" },
      { characterId: "" },
    ]),
    [
      {
        characterId: "hero_1",
        displayName: "주인공",
        identityPrompt: "검은 머리 남색 재킷",
        anchorImageUrl: "https://assets.example.com/hero.png",
        anchorAssetId: undefined,
      },
    ]
  );
});

test("normalizeStudioCharacterProfiles preserves long identity prompts", () => {
  const identityPrompt = `${"detailed appearance ".repeat(24)}final appearance marker`;

  const [profile] = normalizeStudioCharacterProfiles([
    { characterId: "hero", identityPrompt },
  ]);

  assert.equal(profile?.identityPrompt, identityPrompt.trim());
  assert.match(profile?.identityPrompt || "", /final appearance marker$/);
});

test("resolveStudioCharacterProfileById requires an explicit valid selection", () => {
  const profiles = [
    { characterId: "only_one", displayName: "한 명", identityPrompt: "고정 외형" },
  ];
  assert.equal(resolveStudioCharacterProfileById(profiles, ""), undefined);
  assert.equal(resolveStudioCharacterProfileById(profiles, "deleted"), undefined);
  assert.equal(
    resolveStudioCharacterProfileById(profiles, "only_one")?.characterId,
    "only_one"
  );
});

test("resolveStudioFixedCharacterProfileRoster prefers the default content profile over legacy template data", () => {
  const canonical = [{ characterId: "canonical", identityPrompt: "공통 외형" }];
  const legacy = [{ characterId: "legacy", identityPrompt: "이전 템플릿 외형" }];

  assert.deepEqual(resolveStudioFixedCharacterProfileRoster(canonical, legacy), {
    profiles: [
      {
        characterId: "canonical",
        displayName: undefined,
        identityPrompt: "공통 외형",
        anchorImageUrl: undefined,
        anchorAssetId: undefined,
      },
    ],
    source: "default",
  });
  assert.equal(resolveStudioFixedCharacterProfileRoster([], legacy).source, "legacy");
});

test("areStudioCharacterProfilesEqual compares normalized saved values", () => {
  assert.equal(
    areStudioCharacterProfilesEqual(
      [{ characterId: " hero ", identityPrompt: " 검은 머리\n남색 재킷 " }],
      [{ characterId: "hero", identityPrompt: "검은 머리 남색 재킷" }]
    ),
    true
  );
  assert.equal(
    areStudioCharacterProfilesEqual(
      [{ characterId: "hero", identityPrompt: "남색 재킷" }],
      [{ characterId: "hero", identityPrompt: "빨간 재킷" }]
    ),
    false
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { __internal } from "./use-studio-input-actions";

test("applySpeakerRenameMapToScriptJson rewrites dialogue segment speaker ids for manual unknown assignment", () => {
  const updated = __internal.applySpeakerRenameMapToScriptJson(
    {
      mode: "dialogue",
      speakerVoices: {
        unknown_1: "voice-a",
        female_1: "voice-b",
      },
      characterProfiles: [
        {
          characterId: "female_1",
          displayName: "도서관 여자",
          identityPrompt: "긴 생머리, 베이지 가디건",
          anchorImageUrl: "https://cdn.example.com/female-anchor.png",
          anchorAssetId: "",
        },
        {
          characterId: "unknown_1",
          displayName: "정체 미상 인물",
          identityPrompt: "후드티를 입은 인물",
          anchorImageUrl: "",
          anchorAssetId: "local-unknown-anchor",
        },
      ],
      slides: [
        {
          text: "첫 슬라이드",
          lines: ["첫 슬라이드"],
          characterIds: ["unknown_1", "female_1"],
          manualImagePrompt: { finalPrompt: "stale unknown character prompt" },
          dialogueSegments: [
            { type: "quote", speakerId: "unknown_1", text: "여기 앉으실래요?" },
            { type: "quote", speakerId: "female_1", text: "안녕하세요" },
          ],
        },
        {
          text: "다른 슬라이드",
          lines: ["다른 슬라이드"],
          characterIds: ["unknown_1", "mentor"],
          manualImagePrompt: { finalPrompt: "stale unrelated prompt" },
        },
      ],
    },
    {
      unknown_1: "female_1",
    }
  );

  const firstSlide = Array.isArray(updated.slides) ? (updated.slides[0] as Record<string, unknown>) : null;
  const segments = Array.isArray(firstSlide?.dialogueSegments)
    ? (firstSlide?.dialogueSegments as Array<Record<string, unknown>>)
    : [];

  assert.equal(segments[0]?.speakerId, "female_1");
  assert.equal(segments[1]?.speakerId, "female_1");
  assert.deepEqual(firstSlide?.characterIds, ["female_1"]);
  assert.equal(Object.prototype.hasOwnProperty.call(firstSlide || {}, "manualImagePrompt"), false);
  const secondSlide = Array.isArray(updated.slides) ? (updated.slides[1] as Record<string, unknown>) : null;
  assert.deepEqual(secondSlide?.characterIds, ["female_1", "mentor"]);
  assert.equal(Object.prototype.hasOwnProperty.call(secondSlide || {}, "manualImagePrompt"), false);

  const profiles = Array.isArray(updated.characterProfiles)
    ? (updated.characterProfiles as Array<Record<string, unknown>>)
    : [];
  assert.equal(profiles.filter((profile) => profile.characterId === "female_1").length, 1);
  assert.deepEqual(profiles[0], {
    characterId: "female_1",
    displayName: "도서관 여자",
    identityPrompt: "긴 생머리, 베이지 가디건",
    anchorImageUrl: "https://cdn.example.com/female-anchor.png",
    anchorAssetId: "local-unknown-anchor",
  });
});

test("toSpeakerVoiceMap preserves manually added speakers without selected voices", () => {
  const speakerVoices = __internal.toSpeakerVoiceMap([
    { speakerId: " unknown_1 ", voiceId: "" },
    { speakerId: "female_1", voiceId: "voice-female" },
  ]);

  assert.deepEqual(speakerVoices, {
    unknown_1: "",
    female_1: "voice-female",
  });
});

test("updateStoryCharacterProfilesInScriptJson stores only meaningful character rows", () => {
  const longIdentityPrompt = `${"detailed appearance ".repeat(24)}final appearance marker`;
  const updated = __internal.updateStoryCharacterProfilesInScriptJson(
    {
      title: "테스트",
      slides: [
        {
          text: "본문",
          lines: ["본문"],
          manualImagePrompt: { finalPrompt: "stale prompt" },
        },
        "raw slide",
      ],
    },
    [
      {
        characterId: "male_1",
        displayName: "남자 주인공",
        identityPrompt: longIdentityPrompt,
        anchorImageUrl: "",
        anchorAssetId: "",
      },
      {
        characterId: "female_1",
        displayName: "",
        identityPrompt: "",
        anchorImageUrl: "",
        anchorAssetId: "",
      },
    ]
  ) as Record<string, unknown>;

  assert.deepEqual(updated.characterProfiles, [
    {
      characterId: "male_1",
      displayName: "남자 주인공",
      identityPrompt: longIdentityPrompt.trim(),
      anchorImageUrl: undefined,
      anchorAssetId: undefined,
    },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call((updated.slides as Array<Record<string, unknown>>)[0] || {}, "manualImagePrompt"),
    false
  );
  assert.equal((updated.slides as unknown[])[1], "raw slide");
});

test("updateImageStylePromptInScriptJson upserts and clears work image style prompt", () => {
  const withPrompt = __internal.updateImageStylePromptInScriptJson(
    {
      title: "테스트",
      slides: [
        {
          text: "본문",
          lines: ["본문"],
          manualImagePrompt: { finalPrompt: "stale prompt" },
        },
      ],
    },
    "warm editorial illustration, beige and mint palette, crisp linework"
  ) as Record<string, unknown>;

  assert.equal(withPrompt.imageStylePrompt, "warm editorial illustration, beige and mint palette, crisp linework");
  assert.equal(
    Object.prototype.hasOwnProperty.call((withPrompt.slides as Array<Record<string, unknown>>)[0] || {}, "manualImagePrompt"),
    false
  );

  const cleared = __internal.updateImageStylePromptInScriptJson(withPrompt, "   ") as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(cleared, "imageStylePrompt"), false);
});

test("updateFixedCharacterProfileIdInScriptJson keeps one project selection and clears stale prompts", () => {
  const selected = __internal.updateFixedCharacterProfileIdInScriptJson(
    {
      title: "테스트",
      imageStylePrompt: "preserved style",
      slides: [{ text: "본문", manualImagePrompt: { finalPrompt: "stale" } }],
    },
    "saved lead"
  ) as Record<string, unknown>;

  assert.equal(selected.fixedCharacterProfileId, "saved_lead");
  assert.equal(selected.imageStylePrompt, "preserved style");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      (selected.slides as Array<Record<string, unknown>>)[0] || {},
      "manualImagePrompt"
    ),
    false
  );

  const cleared = __internal.updateFixedCharacterProfileIdInScriptJson(selected, "");
  assert.equal(Object.prototype.hasOwnProperty.call(cleared, "fixedCharacterProfileId"), false);
  assert.equal(cleared.imageStylePrompt, "preserved style");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assignDialogueSpeakersByCodex,
  isDialogueSpeakerPlannerError,
} from "./dialogue-speaker-planner";

test("assignDialogueSpeakersByCodex rewrites slides with Codex-planned dialogue speaker slots", async () => {
  const planned = await assignDialogueSpeakersByCodex(
    {
      sourceJson: {
        title: "매일 같은 자리",
        speakerVoices: {
          female_1: "voice-female",
          unknown_1: "voice-unknown",
        },
        characterProfiles: [
          {
            characterId: "female_1",
            displayName: "도서관 여자",
            identityPrompt: "긴 생머리",
          },
          {
            characterId: "unknown_1",
            displayName: "정체 미상 인물",
            identityPrompt: "후드티를 입은 인물",
            anchorImageUrl: "https://cdn.example.com/unknown-anchor.png",
          },
        ],
        slides: [
          {
            text: '멍하니 서 있으니까 옆에서 "여기 앉으실래요?" 하는데 그 여자였음.',
            lines: ["멍하니 서 있으니까", '옆에서 "여기 앉으실래요?"', "하는데 그 여자였음."],
            characterIds: ["unknown_1", "mentor"],
            dialogueSegments: [
              { type: "narration", text: "멍하니 서 있으니까 옆에서" },
              { type: "quote", speakerId: "unknown_1", text: "여기 앉으실래요?" },
              { type: "quote", speakerId: "mentor", text: "하는데 그 여자였음." },
            ],
          },
          {
            text: '"오늘 뭐 공부해요?" 이런 거.',
            lines: ['"오늘 뭐 공부해요?"', "이런 거."],
          },
        ],
      },
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async () => ({
          slides: [
            {
              slideIndex: 0,
              dialogueSegments: [
                { type: "narration", text: "멍하니 서 있으니까 옆에서" },
                { type: "quote", speakerId: "guide_female", text: "여기 앉으실래요" },
                { type: "narration", text: "하는데 그 여자였음." },
              ],
            },
            {
              slideIndex: 1,
              dialogueSegments: [{ type: "quote", speakerId: "mystery_guest", text: "오늘 뭐 공부해요?" }],
            },
          ],
        }),
      },
    }
  );

  assert.equal(planned.json.mode, "dialogue");
  assert.deepEqual(planned.usage, {
    model: "gpt-5.6-sol",
  });

  const slides = Array.isArray(planned.json.slides) ? (planned.json.slides as Array<Record<string, unknown>>) : [];
  const firstSlideSegments = Array.isArray(slides[0]?.dialogueSegments)
    ? (slides[0]?.dialogueSegments as Array<Record<string, unknown>>)
    : [];
  const secondSlideSegments = Array.isArray(slides[1]?.dialogueSegments)
    ? (slides[1]?.dialogueSegments as Array<Record<string, unknown>>)
    : [];

  assert.equal(firstSlideSegments[1]?.speakerId, "female_1");
  assert.equal(secondSlideSegments[0]?.speakerId, "unknown_1");
  assert.deepEqual(slides[0]?.characterIds, ["female_1", "mentor"]);
  assert.deepEqual(slides[1]?.characterIds, ["unknown_1"]);
  assert.deepEqual(planned.json.speakerVoices, {
    female_1: "voice-female",
  });
  assert.deepEqual(planned.json.characterProfiles, [
    {
      characterId: "female_1",
      displayName: "도서관 여자",
      identityPrompt: "긴 생머리",
      anchorImageUrl: "https://cdn.example.com/unknown-anchor.png",
    },
  ]);
});

test("assignDialogueSpeakersByCodex rejects when local Codex CLI bridge is unavailable", async () => {
  await assert.rejects(
    () =>
      assignDialogueSpeakersByCodex(
        {
          sourceJson: {
            title: "매일 같은 자리",
            slides: [
              {
                text: '"오늘 뭐 공부해요?" 이런 거.',
                lines: ['"오늘 뭐 공부해요?"', "이런 거."],
              },
            ],
          },
        },
        {
          transportOverrides: {
            canUseLocalCliBridge: () => false,
          },
        }
      ),
    (error: unknown) => {
      assert.equal(isDialogueSpeakerPlannerError(error), true);
      assert.equal((error as { code?: string }).code, "DIALOGUE_SPEAKER_PLAN_CLI_UNAVAILABLE");
      return true;
    }
  );
});

test("assignDialogueSpeakersByCodex uses the API transport when the CLI bridge is unavailable but a token is present", async () => {
  const apiTokens: string[] = [];

  const planned = await assignDialogueSpeakersByCodex(
    {
      sourceJson: {
        title: "매일 같은 자리",
        slides: [
          {
            text: '"오늘 뭐 공부해요?" 이런 거.',
            lines: ['"오늘 뭐 공부해요?"', "이런 거."],
          },
        ],
      },
      codexAccessToken: "test-api-token",
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => false,
        planByCodexCli: async () => {
          throw new Error("CLI transport must not be used when the bridge is unavailable");
        },
        planByCodexApi: async (_slides, codexAccessToken) => {
          apiTokens.push(codexAccessToken);
          return {
            slides: [
              {
                slideIndex: 0,
                dialogueSegments: [{ type: "quote" as const, speakerId: "mystery_guest", text: "오늘 뭐 공부해요?" }],
              },
            ],
          };
        },
      },
    }
  );

  assert.deepEqual(apiTokens, ["test-api-token"]);
  assert.equal(planned.json.mode, "dialogue");
});

test("assignDialogueSpeakersByCodex preserves canonical speaker slot numbers regardless of encounter order", async () => {
  const planned = await assignDialogueSpeakersByCodex(
    {
      sourceJson: {
        slides: [
          { text: "둘째 인물이 먼저 말한다", lines: ["둘째 인물이 먼저 말한다"] },
          { text: "첫째 인물이 나중에 말한다", lines: ["첫째 인물이 나중에 말한다"] },
        ],
      },
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async () => ({
          slides: [
            {
              slideIndex: 0,
              dialogueSegments: [{ type: "quote", speakerId: "female_2", text: "둘째 인물이 먼저 말한다" }],
            },
            {
              slideIndex: 1,
              dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "첫째 인물이 나중에 말한다" }],
            },
          ],
        }),
      },
    }
  );

  const slides = planned.json.slides as Array<Record<string, unknown>>;
  const firstSegments = slides[0]?.dialogueSegments as Array<Record<string, unknown>>;
  const secondSegments = slides[1]?.dialogueSegments as Array<Record<string, unknown>>;
  assert.equal(firstSegments[0]?.speakerId, "female_2");
  assert.equal(secondSegments[0]?.speakerId, "female_1");
});

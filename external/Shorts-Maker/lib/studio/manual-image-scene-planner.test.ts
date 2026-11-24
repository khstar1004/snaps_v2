import assert from "node:assert/strict";
import test from "node:test";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PreparedSlide } from "@/types/studio-json";
import { __internal, planManualImageScenePrompts } from "./manual-image-scene-planner";

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "오프닝",
    text: "정부 발표 핵심을 짧게 요약한다.",
    lines: ["정부 발표 핵심을", "짧게 요약한다."],
    layout: "photo+body",
    ...overrides,
  };
}

function makeMetadata(overrides?: Partial<PublishMetadata>): PublishMetadata {
  return {
    description: "기본 설명",
    tags: ["뉴스"],
    ttsVoiceId: "",
    bgmEnabled: true,
    bgmTrackId: "bgm",
    mixPresetId: "mix",
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "",
    topicToScriptPrompt: "topic",
    scriptToJsonPrompt: "json",
    mascotName: "브리피",
    mascotDescription: "파란 재킷을 입은 뉴스 브리핑 여우 캐릭터",
    mascotStyle: "깔끔한 editorial illustration",
    mascotTone: "라이트 톤, 블루/시안 포인트",
    ...overrides,
  };
}

test("manual image scene planner prompt requests scene-only JSON output", () => {
  const prompt = __internal.toPrompt(
    [
      {
        slideIndex: 0,
        title: "오프닝",
        text: "정부 발표 핵심을 짧게 요약한다.",
        lines: ["정부 발표 핵심을", "짧게 요약한다."],
        characterIds: [],
        imageSceneHint: "브리핑 데스크",
        imageQueryHint: "정부 발표",
      },
    ],
    {
      publishCategory: "news",
      metadata: makeMetadata(),
      codexModel: "gpt-5.4",
    }
  );

  assert.match(prompt, /per-slide scene prompt 핵심만 만든다/);
  assert.match(prompt, /final full prompt를 만들지 않는다/);
  assert.match(prompt, /extra limbs/);
  assert.match(prompt, /한 가지 핵심 동작 \+ 배경 소품/);
  assert.match(prompt, /"scenePrompt":"\.\.\."/);
  assert.match(prompt, /"characterIds":\["male_1"\]/);
  assert.match(prompt, /items\.characterIds는 빈 배열 또는 \[작업 캐릭터\]/);
  assert.match(prompt, /익명의 학생, 어떤 여자, 한 남자 같은 generic 표현을 쓰지 말고/);
  assert.match(prompt, /mascotName=/);
});

test("manual image scene planner prompt includes work character profiles and slide character ids", () => {
  const longIdentityPrompt = `${"detailed appearance ".repeat(24)}final appearance marker`;
  const prompt = __internal.toPrompt(
    [
      {
        slideIndex: 0,
        title: "도서관 첫 만남",
        text: "남자와 여자가 처음 마주친다.",
        lines: ["남자와 여자가", "처음 마주친다."],
        characterIds: ["male_1", "female_1"],
      },
    ],
    {
      publishCategory: "story",
      metadata: makeMetadata({ mascotStyle: "웹툰풍 디지털 일러스트" }),
      characterProfiles: [
        {
          characterId: "male_1",
          displayName: "남자 주인공",
          identityPrompt: longIdentityPrompt,
        },
        {
          characterId: "female_1",
          displayName: "여자 주인공",
          identityPrompt: "20대 여자 대학생, 긴 생머리, 베이지 가디건",
        },
      ],
    }
  );

  assert.match(prompt, /\[작업 캐릭터\]/);
  assert.match(prompt, /characterId=\"male_1\"/);
  assert.ok(prompt.includes(longIdentityPrompt.trim()));
  assert.match(prompt, /final appearance marker/);
  assert.match(prompt, /characterIds=\[\"male_1\",\"female_1\"\]/);
  assert.match(prompt, /slide\.characterIds가 있으면 선택된 캐릭터를 누락하지 말고 모두 장면 주연으로 사용한다/);
  assert.match(prompt, /slide\.characterIds가 비어 있으면/);
});

test("manual image scene planner removes anchor URL credentials before sending the Codex prompt", () => {
  const prompt = __internal.toPrompt(
    [
      {
        slideIndex: 0,
        title: "주인공 등장",
        text: "주인공이 화면에 등장한다.",
        lines: ["주인공이 화면에 등장한다."],
        characterIds: ["lead"],
      },
    ],
    {
      publishCategory: "story",
      characterProfiles: [
        {
          characterId: "lead",
          displayName: "주인공",
          identityPrompt: "검은 짧은 머리와 네이비 재킷",
          anchorImageUrl: "https://user:secret@assets.example.com/lead.png?token=signed-value#preview",
          anchorAssetId: "anchor-asset-1",
        },
      ],
    }
  );

  assert.match(prompt, /anchorImageUrl="https:\/\/assets\.example\.com\/lead\.png"/);
  assert.doesNotMatch(prompt, /user:secret|token=signed-value|#preview/);
});

test("manual image scene planner schema keeps nullable fields required for strict structured outputs", () => {
  const required = (
    (__internal.manualImageSceneResponseSchema.properties as { items: { items: { required: string[] } } }).items.items.required
  ).slice();

  assert.deepEqual(required, ["slideIndex", "characterIds", "scenePrompt", "emotion", "action", "background", "props", "composition"]);
  const characterIdsSchema = (
    (__internal.manualImageSceneResponseSchema.properties as {
      items: { items: { properties: { characterIds: Record<string, unknown> } } };
    }).items.items.properties.characterIds
  );
  assert.equal(Object.prototype.hasOwnProperty.call(characterIdsSchema, "maxItems"), false);
});

test("manual image scene planner preserves more than two selected characters", () => {
  const parsed = __internal.parsePlannedManualImageSceneResponse(
    JSON.stringify({
      items: [
        {
          slideIndex: 0,
          characterIds: ["male_1", "female_1", "mentor_1"],
          scenePrompt: "세 사람이 회의 테이블에서 대화한다.",
          emotion: null,
          action: null,
          background: null,
          props: null,
          composition: null,
        },
      ],
    })
  );

  assert.deepEqual(parsed.items[0]?.characterIds, ["male_1", "female_1", "mentor_1"]);
});

test("manual image scene planner uses local Codex scene output but deterministic base prompt", async () => {
  const result = await planManualImageScenePrompts(
    {
      publishCategory: "news",
      slides: [makeSlide()],
      metadata: makeMetadata(),
      codexModel: "gpt-5.4",
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async () => ({
          items: [
            {
              slideIndex: 0,
              characterIds: [],
              scenePrompt: "뉴스 브리핑 데스크 앞에서 브리피가 자신감 있게 핵심 내용을 설명하는 장면. 정돈된 스튜디오 배경과 정사각형 구도.",
              emotion: "자신감",
              action: "핵심을 짚으며 설명",
            },
          ],
        }),
      },
    }
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.source, "codex");
  assert.equal(result.items[0]?.scenePrompt.includes("브리피가 자신감 있게"), true);
  assert.equal(result.items[0]?.emotion, "자신감");
  assert.match(result.items[0]?.basePrompt || "", /same mascot identity/);
  assert.match(result.items[0]?.finalPrompt || "", /\[Per-slide scene prompt\]/);
});

test("manual image scene planner applies Codex-selected character ids to narration slides", async () => {
  const result = await planManualImageScenePrompts(
    {
      publishCategory: "story",
      slides: [
        makeSlide({
          title: "같은 자리",
          text: "내가 늘 같은 자리에서 과제를 하던 장면이다.",
          lines: ["내가 늘 같은 자리에서", "과제를 하던 장면이다."],
        }),
        makeSlide({
          title: "첫 대사",
          text: "그 여자가 먼저 말을 건다.",
          lines: ["그 여자가 먼저 말을 건다."],
          dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "여기 앉으실래요?" }],
        }),
      ],
      metadata: makeMetadata({ mascotStyle: "웹툰풍 디지털 일러스트" }),
      characterProfiles: [
        { characterId: "male_1", displayName: "남자 주인공", identityPrompt: "20대 남자 대학생, 검은 짧은 머리, 후드티" },
        { characterId: "female_1", displayName: "여자 주인공", identityPrompt: "20대 여자 대학생, 긴 생머리, 가디건" },
      ],
      imageStylePrompt: "soft shoujo manga inspired romance illustration style, gentle pastel tones, no text",
      codexModel: "gpt-5.4",
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async () => ({
          items: [
            {
              slideIndex: 0,
              characterIds: ["male_1"],
              scenePrompt: "male_1 혼자 도서관 창가 자리에 앉아 과제에 몰두하는 장면.",
              emotion: "집중",
              action: "과제에 몰두",
            },
            {
              slideIndex: 1,
              characterIds: ["female_1"],
              scenePrompt: "female_1 이 먼저 자리를 권하며 말을 건네는 장면.",
              emotion: "조심스러움",
              action: "자리를 권함",
            },
          ],
        }),
      },
    }
  );

  assert.deepEqual(result.items[0]?.characterIds, ["male_1"]);
  assert.match(result.items[0]?.basePrompt || "", /이번 장면 주연 후보: 남자 주인공/);
  assert.deepEqual(result.items[1]?.characterIds, ["female_1"]);
});

test("manual image scene planner heuristically fills story character ids when Codex leaves them empty", async () => {
  const result = await planManualImageScenePrompts(
    {
      publishCategory: "story",
      slides: [
        makeSlide({
          title: "도서관 루틴",
          text: "나도 매일 같은 자리에 앉는 스타일이라 자연스럽게 눈에 들어옴.",
          lines: ["나도 매일 같은 자리에", "앉는 스타일이라", "자연스럽게 눈에 들어옴."],
        }),
        makeSlide({
          title: "첫 제안",
          text: "그 여자가 먼저 말을 건다.",
          lines: ["그 여자가 먼저 말을 건다."],
          dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "여기 앉으실래요?" }],
        }),
      ],
      metadata: makeMetadata({ mascotStyle: "웹툰풍 디지털 일러스트" }),
      characterProfiles: [
        { characterId: "male_1", displayName: "남자 주인공", identityPrompt: "20대 남자 대학생, 검은 짧은 머리, 후드티" },
        { characterId: "female_1", displayName: "여자 주인공", identityPrompt: "20대 여자 대학생, 긴 생머리, 가디건" },
      ],
      imageStylePrompt: "soft shoujo manga inspired romance illustration style, gentle pastel tones, no text",
      codexModel: "gpt-5.4",
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async () => ({
          items: [
            {
              slideIndex: 0,
              characterIds: [],
              scenePrompt: "대학교 도서관의 익숙한 창가 자리가 중심인 장면. 노트북과 과제 더미가 놓인 책상에 한 학생이 오래 머무는 분위기.",
              emotion: "잔잔함",
              action: "과제에 몰두",
            },
            {
              slideIndex: 1,
              characterIds: ["female_1"],
              scenePrompt: "female_1 이 먼저 자리를 권하며 말을 건네는 장면.",
              emotion: "조심스러움",
              action: "자리를 권함",
            },
          ],
        }),
      },
    }
  );

  assert.deepEqual(result.items[0]?.characterIds, ["male_1"]);
  assert.match(result.items[0]?.scenePrompt || "", /^등장 캐릭터: 남자 주인공\./);
});

test("manual image scene planner falls back when local Codex CLI bridge is unavailable", async () => {
  const result = await planManualImageScenePrompts(
    {
      publishCategory: "news",
      slides: [makeSlide()],
      metadata: makeMetadata(),
    },
    {
      transportOverrides: {
        canUseLocalCliBridge: () => false,
      },
    }
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.source, "fallback");
  assert.match(result.items[0]?.scenePrompt || "", /현재 슬라이드 핵심 상황/);
  assert.equal(result.items[0]?.warning, "Codex local scene planner를 사용할 수 없어 규칙 기반 scene prompt로 대체했습니다.");
  assert.match(result.warnings.join("\n"), /Codex local scene planner를 사용할 수 없어 규칙 기반 scene prompt로 대체했습니다\.\s+\(슬라이드 1\)/);
});

test("manual image scene planner uses the API transport when the CLI bridge is unavailable but a token is present", async () => {
  const apiTokens: string[] = [];

  const result = await planManualImageScenePrompts(
    {
      publishCategory: "news",
      slides: [makeSlide()],
      metadata: makeMetadata(),
    },
    {
      codexAccessToken: "test-api-token",
      transportOverrides: {
        canUseLocalCliBridge: () => false,
        planByCodexCli: async () => {
          throw new Error("CLI transport must not be used when the bridge is unavailable");
        },
        planByCodexApi: async (_slides, codexAccessToken) => {
          apiTokens.push(codexAccessToken);
          return {
            items: [
              {
                slideIndex: 0,
                characterIds: [],
                scenePrompt: "API 경로로 생성한 장면. 정돈된 스튜디오 배경과 정사각형 구도.",
                emotion: "차분함",
                action: "핵심을 짚으며 설명",
              },
            ],
          };
        },
      },
    }
  );

  assert.deepEqual(apiTokens, ["test-api-token"]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.source, "codex");
  assert.equal(result.items[0]?.scenePrompt.includes("API 경로로 생성한 장면"), true);
  assert.equal(result.items[0]?.emotion, "차분함");
});

test("manual image scene planner falls back only for slides missing from a partial Codex response", async () => {
  const result = await planManualImageScenePrompts(
    {
      publishCategory: "news",
      slides: [makeSlide(), makeSlide({ title: "마무리", text: "구독을 안내한다.", lines: ["구독을 안내한다."] })],
      metadata: makeMetadata(),
    },
    {
      batchSize: 2,
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides) => {
          if (slides.length === 1) {
            throw new Error("planner timeout");
          }
          return {
            items: [
              {
                slideIndex: 0,
                characterIds: [],
                scenePrompt: "브리피가 브리핑 데스크에서 핵심 뉴스를 소개하는 장면.",
              },
            ],
          };
        },
      },
    }
  );

  assert.equal(result.items[0]?.source, "codex");
  assert.equal(result.items[1]?.source, "fallback");
  assert.equal(result.items[1]?.warning, "Codex local scene planner 응답 시간 초과로 규칙 기반 scene prompt로 대체했습니다.");
  assert.match(result.warnings.join("\n"), /Codex local scene planner 응답 시간 초과로 규칙 기반 scene prompt로 대체했습니다\.\s+\(슬라이드 2\)/);
});

test("manual image scene planner uses the default batch size when env is blank", async () => {
  const previousBatchSize = process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE;
  delete process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE;
  const batchCalls: number[][] = [];

  try {
    await planManualImageScenePrompts(
      {
        publishCategory: "news",
        slides: Array.from({ length: 5 }, (_, index) =>
          makeSlide({
            title: `슬라이드 ${index + 1}`,
            text: `본문 ${index + 1}`,
            lines: [`본문 ${index + 1}`],
          })
        ),
        metadata: makeMetadata(),
      },
      {
        transportOverrides: {
          canUseLocalCliBridge: () => true,
          planByCodexCli: async (slides) => {
            batchCalls.push(slides.map((slide) => slide.slideIndex));
            return {
              items: slides.map((slide) => ({
              slideIndex: slide.slideIndex,
              characterIds: [],
              scenePrompt: `scene ${slide.slideIndex}`,
            })),
          };
          },
        },
      }
    );
  } finally {
    if (typeof previousBatchSize === "string") {
      process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE = previousBatchSize;
    } else {
      delete process.env.STUDIO_MANUAL_IMAGE_SCENE_PLANNER_BATCH_SIZE;
    }
  }

  assert.deepEqual(batchCalls, [
    [0, 1, 2, 3],
    [4],
  ]);
});

test("manual image scene planner summarizes parse failures into a short fallback warning", () => {
  const summary = __internal.summarizeManualImageScenePlannerFailure({
    error: new SyntaxError("Unexpected token ']' in JSON at position 731"),
  });

  assert.equal(summary.code, "parse_failed");
  assert.equal(summary.warning, "Codex local scene planner 결과 파싱 실패로 규칙 기반 scene prompt로 대체했습니다.");
});

test("manual image scene planner does not misclassify invalid_json_schema as a parse failure", () => {
  const summary = __internal.summarizeManualImageScenePlannerFailure({
    error: new Error('{"type":"error","error":{"type":"invalid_request_error","code":"invalid_json_schema"}}'),
  });

  assert.equal(summary.code, "execution_failed");
  assert.equal(summary.warning, "Codex local scene planner 실행 실패로 규칙 기반 scene prompt로 대체했습니다.");
});

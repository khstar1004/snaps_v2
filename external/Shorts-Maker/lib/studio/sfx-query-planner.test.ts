import assert from "node:assert/strict";
import test from "node:test";
import { __internal, planMissingSlideSfx } from "./sfx-query-planner";
import type { StudioPrepareRequest } from "@/types/studio-json";

function createPayload(overrides?: Partial<StudioPrepareRequest>): StudioPrepareRequest {
  return {
    publishCategory: "fun",
    videoMode: "singleAudio",
    ttsProvider: "typecast",
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    crawlMode: "auto",
    sfxCategories: ["일반 효과음"],
    slides: [
      {
        title: "첫 슬라이드",
        text: "충격적인 첫 줄!",
        lines: ["충격적인 첫 줄!"],
        layout: "photo+body",
        groupId: 0,
        stepIndex: 0,
      },
    ],
    ...overrides,
  };
}

test("planMissingSlideSfx uses local Codex CLI transport without an access token", async () => {
  let cliCalls = 0;
  let apiCalls = 0;

  const planned = await planMissingSlideSfx(createPayload(), {
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides, allowedTags) => {
        cliCalls += 1;
        assert.equal(slides.length, 1);
        return {
          items: [
            {
              slideIndex: slides[0]?.slideIndex || 0,
              sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음", gainDb: 1, offsetMs: -20 }],
            },
          ],
        };
      },
      planByCodexApi: async () => {
        apiCalls += 1;
        throw new Error("API planner should not run when local CLI is available");
      },
    },
  });

  assert.equal(cliCalls, 1);
  assert.equal(apiCalls, 0);
  assert.equal(planned.warnings.length, 0);
  assert.equal(planned.payload.slides[0]?.sfxPlan, undefined);
  assert.equal(planned.payload.slides[0]?.sfxCue?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[0]?.sfxCue?.gainDb, 1);
  assert.equal(planned.payload.slides[0]?.sfxCue?.offsetMs, -20);
  assert.equal(planned.payload.slides[0]?.sfxCue?.source, "auto");
});

test("planMissingSlideSfx treats a disabled manual cue as an existing user decision", async () => {
  let cliCalls = 0;
  const payload = createPayload({
    slides: [
      {
        title: "첫 슬라이드",
        text: "충격적인 첫 줄!",
        lines: ["충격적인 첫 줄!"],
        layout: "photo+body",
        groupId: 0,
        stepIndex: 0,
        sfxCue: { enabled: false, tag: "일반 효과음", source: "manual" },
      },
    ],
  });

  const planned = await planMissingSlideSfx(payload, {
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async () => {
        cliCalls += 1;
        return { items: [] };
      },
    },
  });

  assert.equal(cliCalls, 0);
  assert.deepEqual(planned.payload.slides[0]?.sfxCue, payload.slides[0]?.sfxCue);
});

test("planMissingSlideSfx replans only explicitly targeted missing slides", async () => {
  const requestedSlideIndexes: number[][] = [];
  const payload = createPayload({
    slides: [
      {
        title: "첫 슬라이드",
        text: "첫 줄",
        lines: ["첫 줄"],
        layout: "photo+body",
        groupId: 0,
        stepIndex: 0,
      },
      {
        title: "둘째 슬라이드",
        text: "둘째 줄",
        lines: ["둘째 줄"],
        layout: "photo+body",
        groupId: 1,
        stepIndex: 0,
      },
    ],
  });

  const planned = await planMissingSlideSfx(payload, {
    targetSlideIndexes: [1],
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides, allowedTags) => {
        requestedSlideIndexes.push(slides.map((slide) => slide.slideIndex));
        return {
          items: [
            {
              slideIndex: 1,
              sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
            },
          ],
        };
      },
    },
  });

  assert.deepEqual(requestedSlideIndexes, [[1]]);
  assert.equal(planned.payload.slides[0]?.sfxCue, undefined);
  assert.equal(planned.payload.slides[1]?.sfxCue?.tag, "일반 효과음");
});

test("resolveTimelineCuesFromSlide does not fall back behind an explicit disabled cue", () => {
  const cues = __internal.resolveTimelineCuesFromSlide(
    {
      title: "첫 슬라이드",
      text: "첫 줄",
      lines: ["첫 줄"],
      layout: "photo+body",
      groupId: 0,
      stepIndex: 0,
      sfxCue: { enabled: false, tag: "일반 효과음", source: "manual" },
      sfxPlan: [{ lineIndex: 0, enabled: true, tag: "강조 효과음", source: "manual" }],
    },
    0,
    new Set(["일반 효과음", "강조 효과음"])
  );

  assert.deepEqual(cues, []);
});

test("planMissingSlideSfx prefers the project-wide gpt-5.6-sol model for local Codex CLI planning", async () => {
  const seenModels: string[] = [];

  const planned = await planMissingSlideSfx(
    createPayload({
      codexModel: "gpt-5.4-mini",
    }),
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides, allowedTags, options) => {
          seenModels.push(String(options?.codexModel || ""));
          return {
            items: [
              {
                slideIndex: slides[0]?.slideIndex || 0,
                sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
              },
            ],
          };
        },
      },
    }
  );

  assert.deepEqual(seenModels, ["gpt-5.6-sol"]);
  assert.equal(planned.payload.slides[0]?.sfxCue?.tag, "일반 효과음");
});

test("planMissingSlideSfx rejects when neither local bridge nor token is available", async () => {
  await assert.rejects(
    () =>
      planMissingSlideSfx(createPayload(), {
        transportOverrides: {
          canUseLocalCliBridge: () => false,
          planByCodexCli: async () => {
            throw new Error("CLI planner should not run without a local bridge");
          },
          planByCodexApi: async () => {
            throw new Error("API planner should not run without an access token");
          },
        },
      }),
    /Codex 연결이 없어 자동 SFX 배정을 시작할 수 없습니다/
  );
});

test("planMissingSlideSfx rejects when local Codex CLI execution fails", async () => {
  await assert.rejects(
    () =>
      planMissingSlideSfx(createPayload(), {
        transportOverrides: {
          canUseLocalCliBridge: () => true,
          planByCodexCli: async () => {
            const error = new Error("spawn codex ENOENT");
            (error as Error & { code?: string }).code = "ENOENT";
            throw error;
          },
        },
      }),
    /로컬 Codex CLI를 찾지 못했습니다/
  );
});

test("planMissingSlideSfx leaves slides unchanged when bestEffort is enabled and local Codex CLI fails", async () => {
  const planned = await planMissingSlideSfx(createPayload(), {
    bestEffort: true,
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async () => {
        throw new Error(
          [
            "Command failed: codex exec ...",
            "2026-03-31T06:31:13.056585Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 500 Internal Server Error, url: wss://api.openai.com/v1/responses",
          ].join("\n")
        );
      },
    },
  });

  assert.equal(planned.payload.slides[0]?.sfxPlan, undefined);
  assert.equal(planned.payload.slides[0]?.sfxCue, undefined);
  assert.equal(planned.warnings.length, 1);
  assert.match(planned.warnings[0] || "", /\[sfx-planner\] 로컬 Codex CLI SFX planner 실행 실패:/);
  assert.match(planned.warnings[0] || "", /HTTP error: 500 Internal Server Error/);
  assert.doesNotMatch(planned.warnings[0] || "", /Command failed: codex exec/);
});

test("planMissingSlideSfx leaves slides unchanged when bestEffort is enabled and no Codex transport is available", async () => {
  const planned = await planMissingSlideSfx(createPayload(), {
    bestEffort: true,
    transportOverrides: {
      canUseLocalCliBridge: () => false,
      planByCodexCli: async () => {
        throw new Error("CLI planner should not run without a local bridge");
      },
      planByCodexApi: async () => {
        throw new Error("API planner should not run without an access token");
      },
    },
  });

  assert.equal(planned.payload.slides[0]?.sfxPlan, undefined);
  assert.equal(planned.payload.slides[0]?.sfxCue, undefined);
  assert.deepEqual(planned.warnings, [
    "[sfx-planner] Codex 연결이 없어 자동 SFX 배정을 시작할 수 없습니다. 로컬 Codex CLI 또는 OAuth 연결을 확인해 주세요.",
  ]);
});

test("planMissingSlideSfx rejects partial slide decisions when Codex omits slides", async () => {
  await assert.rejects(
    () =>
      planMissingSlideSfx(
        createPayload({
          slides: [
            { title: "슬라이드 1", text: "첫 줄", lines: ["첫 줄"], layout: "photo+body" },
            { title: "슬라이드 2", text: "둘째 줄", lines: ["둘째 줄"], layout: "photo+body" },
          ],
        }),
        {
          transportOverrides: {
            canUseLocalCliBridge: () => true,
            planByCodexCli: async () => ({
              items: [{ slideIndex: 0, sfxPlan: [] }],
            }),
          },
        }
      ),
    /Codex SFX planner did not return decisions for slides 1/
  );
});

test("planMissingSlideSfx warns on partial decisions in bestEffort mode and keeps missing slides empty", async () => {
  const planned = await planMissingSlideSfx(
    createPayload({
      slides: [
        { title: "슬라이드 1", text: "첫 줄", lines: ["첫 줄"], layout: "photo+body" },
        { title: "슬라이드 2", text: "둘째 줄", lines: ["둘째 줄"], layout: "photo+body" },
      ],
    }),
    {
      bestEffort: true,
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides, allowedTags) => ({
          items: [
            {
              slideIndex: slides[0]?.slideIndex || 0,
              sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음", gainDb: 0, offsetMs: -30 }],
            },
          ],
        }),
      },
    }
  );

  assert.equal(planned.warnings.length, 1);
  assert.match(planned.warnings[0] || "", /Codex SFX planner did not return decisions for slides 1/);
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[1]?.sfxPlan, undefined);
  assert.equal(planned.payload.slides[1]?.sfxCue, undefined);
});

test("planMissingSlideSfx retries transient local Codex CLI failures before succeeding", async () => {
  let cliCalls = 0;

  const planned = await planMissingSlideSfx(createPayload(), {
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides, allowedTags) => {
        cliCalls += 1;
        if (cliCalls === 1) {
          throw new Error(
            "2026-03-31T06:31:13.056585Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 500 Internal Server Error, url: wss://api.openai.com/v1/responses"
          );
        }
        return {
          items: [
            {
              slideIndex: slides[0]?.slideIndex || 0,
              sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
            },
          ],
        };
      },
    },
  });

  assert.equal(cliCalls, 2);
  assert.equal(planned.payload.slides[0]?.sfxCue?.tag, "일반 효과음");
});

test("planMissingSlideSfx retries transient Codex API failures before succeeding", async () => {
  let apiCalls = 0;

  const planned = await planMissingSlideSfx(createPayload(), {
    codexAccessToken: "test-token",
    transportOverrides: {
      canUseLocalCliBridge: () => false,
      planByCodexApi: async (slides, allowedTags) => {
        apiCalls += 1;
        if (apiCalls === 1) {
          throw new Error('Codex API SFX planner failed (500): {"error":{"message":"Internal server error","code":"internal_error"}}');
        }
        return {
          items: [
            {
              slideIndex: slides[0]?.slideIndex || 0,
              sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
            },
          ],
        };
      },
    },
  });

  assert.equal(apiCalls, 2);
  assert.equal(planned.payload.slides[0]?.sfxCue?.tag, "일반 효과음");
});

test("planMissingSlideSfx keeps at most two Codex-provided cues per group and clamps cue values", async () => {
  const planned = await planMissingSlideSfx(
    createPayload({
      sfxCategories: ["일반 효과음", "강조 효과음", "전환 효과음"],
      slides: [
        {
          title: "슬라이드 1",
          text: "이렇게 생각하면 큰일 나",
          lines: ["이렇게 생각하면", "큰일 나", "정말 문제야"],
          layout: "photo+body",
        },
      ],
    }),
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides, allowedTags) => ({
          items: [
            {
              slideIndex: slides[0]?.slideIndex || 0,
              sfxPlan: [
                { lineIndex: 2, tag: allowedTags[2] || "전환 효과음", gainDb: 99, offsetMs: -9999 },
                { lineIndex: 0, tag: allowedTags[0] || "일반 효과음", gainDb: -1, offsetMs: -30 },
                { lineIndex: 1, tag: allowedTags[1] || "강조 효과음", gainDb: 3, offsetMs: -10 },
              ],
            },
          ],
        }),
      },
    }
  );

  assert.equal(planned.warnings.length, 0);
  assert.equal(planned.payload.slides[0]?.sfxPlan?.length, 2);
  assert.deepEqual(
    planned.payload.slides[0]?.sfxPlan?.map((item) => item.lineIndex),
    [0, 1]
  );
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.gainDb, -1);
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.offsetMs, -30);
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[1]?.tag, "강조 효과음");
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[1]?.gainDb, 3);
  assert.equal(planned.payload.slides[0]?.sfxPlan?.[1]?.offsetMs, -10);
});

test("planMissingSlideSfx replaces consecutive duplicate auto tags when an alternative tag is available", async () => {
  const planned = await planMissingSlideSfx(
    createPayload({
      sfxCategories: ["일반 효과음", "강조 효과음"],
      slides: [
        { title: "슬라이드 1", text: "갑자기 반전", lines: ["갑자기 반전"], layout: "photo+body" },
        { title: "슬라이드 2", text: "바로 다음 리액션", lines: ["바로 다음 리액션"], layout: "photo+body" },
      ],
    }),
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides, allowedTags) => ({
          items: slides.map((slide) => ({
            slideIndex: slide.slideIndex,
            sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
          })),
        }),
      },
    }
  );

  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[1]?.sfxPlan?.[0]?.tag, "강조 효과음");
});

test("planMissingSlideSfx keeps one duplicate auto tag when it is required to satisfy the group minimum", async () => {
  const planned = await planMissingSlideSfx(
    createPayload({
      slides: [
        { title: "슬라이드 1", text: "첫 반응", lines: ["첫 반응"], layout: "photo+body" },
        { title: "슬라이드 2", text: "두 번째 반응", lines: ["두 번째 반응"], layout: "photo+body" },
      ],
    }),
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides, allowedTags) => ({
          items: slides.map((slide) => ({
            slideIndex: slide.slideIndex,
            sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
          })),
        }),
      },
    }
  );

  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[1]?.sfxPlan?.[0]?.tag, "일반 효과음");
});

test("planMissingSlideSfx keeps informational slides empty when the same group already has one cue", async () => {
  const planned = await planMissingSlideSfx(
    createPayload({
      sfxCategories: ["일반 효과음", "강조 효과음"],
      slides: [
        { title: "슬라이드 1", text: "핵심 반전이 나왔다", lines: ["핵심 반전이 나왔다"], layout: "photo+body", groupId: 0 },
        { title: "슬라이드 2", text: "다음 설명으로 넘어갑니다", lines: ["다음 설명으로 넘어갑니다"], layout: "photo+body", groupId: 0 },
      ],
    }),
    {
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides, allowedTags) => ({
          items: [
            {
              slideIndex: slides[0]?.slideIndex || 0,
              sfxPlan: [{ lineIndex: 0, tag: allowedTags[0] || "일반 효과음" }],
            },
            {
              slideIndex: slides[1]?.slideIndex || 1,
              sfxPlan: [],
            },
          ],
        }),
      },
    }
  );

  assert.equal(planned.payload.slides[0]?.sfxPlan?.[0]?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[1]?.sfxPlan, undefined);
  assert.equal(planned.payload.slides[1]?.sfxCue, undefined);
});

test("planMissingSlideSfx backfills one auto cue when an entire prepared group is empty", async () => {
  const planned = await planMissingSlideSfx(createPayload(), {
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides) => ({
        items: slides.map((slide) => ({
          slideIndex: slide.slideIndex,
          sfxPlan: [],
        })),
      }),
    },
  });

  assert.equal(planned.payload.slides[0]?.sfxPlan, undefined);
  assert.equal(planned.payload.slides[0]?.sfxCue?.tag, "일반 효과음");
  assert.equal(planned.payload.slides[0]?.sfxCue?.source, "auto");
});

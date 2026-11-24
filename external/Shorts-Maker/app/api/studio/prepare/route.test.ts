import test from "node:test";
import assert from "node:assert/strict";
import { defaultStudioPrepareRouteDependencies, handleStudioPreparePost } from "./route";
import { createJsonNextRequest, createSessionUser, createValidatedHeaders, createWorkspaceSessionUser } from "../../test-helpers";

function createPrepareRequest(body: unknown, headers?: Headers, url = "http://localhost/api/studio/prepare") {
  return createJsonNextRequest(url, body, headers);
}

function createPrepareRouteDependencies(overrides?: Partial<NonNullable<Parameters<typeof handleStudioPreparePost>[1]>>) {
  return {
    ...defaultStudioPrepareRouteDependencies,
    ...overrides,
  };
}

test("studio prepare route requires an authenticated session", async () => {
  const response = await handleStudioPreparePost(
    createPrepareRequest({
      slides: [],
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "로그인이 필요합니다.",
    errorCode: "AUTH_REQUIRED",
    retryable: false,
  });
});

test("studio prepare route rejects categories outside the editor scope", async () => {
  let parseCalled = false;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      { publishCategory: "blocked-category" },
      createValidatedHeaders({
        authUser: createSessionUser({
          id: "member-auth",
          loginId: "member",
          email: "member@example.com",
          displayName: "멤버",
          role: "member",
        }),
        user: createWorkspaceSessionUser({
          id: "member-workspace",
          loginId: "member",
          email: "member@example.com",
          displayName: "멤버",
          role: "member",
          authUserId: "member-auth",
          authLoginId: "member",
          authDisplayName: "멤버",
          workspaceUserId: "member-workspace",
          workspaceLoginId: "member",
          workspaceDisplayName: "멤버",
          isActingAs: false,
        }),
      })
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => {
        parseCalled = true;
        throw new Error("권한 검사 전에 전체 payload를 파싱하면 안 됩니다.");
      },
      getCategoryAccessScope: async () => ({
        accessMode: "selected",
        allAccessLevel: "view",
        hasRestrictions: true,
        allowedCategories: ["allowed-category"],
        allowedCategorySet: new Set(["allowed-category"]),
        categoryPermissions: new Map([["allowed-category", "view"]]),
      }),
      canEditCategory: () => false,
    })
  );

  assert.equal(response.status, 403);
  assert.equal(parseCalled, false);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "편집 권한이 있는 고객(category)만 제작할 수 있습니다.",
    errorCode: "AUTH_FORBIDDEN",
    retryable: false,
  });
});

test("studio prepare route returns prepared slides and timing warnings", async () => {
  const nowMarks = [1_000, 1_010, 1_030, 1_050, 1_080];
  const plannerInputs: Array<{ libraryUserScope?: string; codexAccessToken?: string | null }> = [];
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders()
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "crawl-only",
          allowGenerated: false,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
          },
        ],
      }),
      now: () => nowMarks.shift() || 1_080,
      resolveCodexAccessTokenFromRequest: async () => "codex-token",
      planMissingSlideImageRequests: async (payload, options) => {
        plannerInputs.push({
          libraryUserScope: payload.libraryUserScope,
          codexAccessToken: options?.codexAccessToken || null,
        });
        return {
          payload: {
            ...payload,
            slides: payload.slides.map((slide) => ({
              ...slide,
              imageUrl: "https://images.example.com/slide-1.jpg",
            })),
          },
          warnings: ["planner warning"],
        };
      },
      applyImagePolicy: async (payload) => ({
        slides: payload.slides.map((slide) => ({
          ...slide,
          resolvedImageUrl: slide.imageUrl,
          resolvedBy: "crawl" as const,
        })),
        warnings: ["policy warning"],
      }),
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(plannerInputs, [
    {
      libraryUserScope: "auth-user",
      codexAccessToken: "codex-token",
    },
  ]);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: [
      "[timing] prepare planner_ms=20 policy_ms=30 total_ms=80",
      "planner warning",
      "policy warning",
    ],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        imageUrl: "https://images.example.com/slide-1.jpg",
        resolvedImageUrl: "https://images.example.com/slide-1.jpg",
        resolvedBy: "crawl",
      },
    ],
    usage: {
      imagePolicyMs: 80,
    },
  });
});

test("studio prepare route can return planner-only slides", async () => {
  const nowMarks = [2_000, 2_010, 2_040];
  let plannerCalled = 0;
  let policyCalled = 0;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=plan"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "crawl-only",
          allowGenerated: false,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
          },
        ],
      }),
      now: () => nowMarks.shift() || 2_040,
      resolveCodexAccessTokenFromRequest: async () => "codex-token",
      planMissingSlideImageRequests: async (payload) => {
        plannerCalled += 1;
        return {
          payload: {
            ...payload,
            slides: payload.slides.map((slide) => ({
              ...slide,
              imageRequest: {
                query: "awkward reaction",
                queryCandidates: ["awkward reaction"],
                preferredProviders: ["giphy" as const],
                scene: "reaction",
                orientation: "landscape",
                mustAvoid: [],
                plannerSource: "codex" as const,
              },
            })),
          },
          warnings: ["planner warning"],
        };
      },
      applyImagePolicy: async () => {
        policyCalled += 1;
        return {
          slides: [],
          warnings: [],
        };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(plannerCalled, 1);
  assert.equal(policyCalled, 0);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: ["[timing] prepare_plan planner_ms=30 total_ms=40", "planner warning"],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        imageRequest: {
          query: "awkward reaction",
          queryCandidates: ["awkward reaction"],
          preferredProviders: ["giphy"],
          scene: "reaction",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
      },
    ],
    usage: {
      imagePolicyMs: 0,
    },
  });
});

test("studio prepare route can resolve images from an already planned payload", async () => {
  const nowMarks = [3_000, 3_010, 3_050];
  let plannerCalled = 0;
  let policyCalled = 0;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=resolve"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "crawl-only",
          allowGenerated: false,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
            imageRequest: {
              query: "서류 사진",
              queryCandidates: ["서류 사진"],
              preferredProviders: ["naver"],
              scene: "문서",
              orientation: "landscape",
              mustAvoid: [],
              plannerSource: "codex",
            },
          },
        ],
      }),
      now: () => nowMarks.shift() || 3_050,
      planMissingSlideImageRequests: async (payload) => {
        plannerCalled += 1;
        return { payload, warnings: [] };
      },
      applyImagePolicy: async (payload) => {
        policyCalled += 1;
        return {
          slides: payload.slides.map((slide) => ({
            ...slide,
            resolvedImageUrl: "https://images.example.com/slide-1.jpg",
            resolvedBy: "crawl" as const,
          })),
          warnings: ["policy warning"],
        };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(plannerCalled, 0);
  assert.equal(policyCalled, 1);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: ["[timing] prepare_resolve policy_ms=40 total_ms=50", "policy warning"],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        imageRequest: {
          query: "서류 사진",
          queryCandidates: ["서류 사진"],
          preferredProviders: ["naver"],
          scene: "문서",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
        resolvedImageUrl: "https://images.example.com/slide-1.jpg",
        resolvedBy: "crawl",
      },
    ],
    usage: {
      imagePolicyMs: 50,
    },
  });
});

test("studio prepare route skips crawl planner/policy in manual AI prompt mode", async () => {
  const nowMarks = [4_000, 4_010, 4_035, 4_045];
  let plannerCalled = 0;
  let policyCalled = 0;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=resolve"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "manual-ai-prompt",
          allowGenerated: true,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
            imageUrl: "https://images.example.com/automatic.jpg",
            resolvedImageUrl: "https://images.example.com/automatic-resolved.jpg",
            resolvedBy: "crawl",
            imageSelection: {
              intent: "news",
              queryCandidates: ["automatic query"],
              selectionReason: "automatic provider selection",
            },
          },
        ],
      }),
      now: () => nowMarks.shift() || 4_045,
      planMissingSlideImageRequests: async (payload) => {
        plannerCalled += 1;
        return { payload, warnings: [] };
      },
      applyImagePolicy: async () => {
        policyCalled += 1;
        return {
          slides: [],
          warnings: [],
        };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(plannerCalled, 0);
  assert.equal(policyCalled, 0);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: [
      "[timing] prepare_resolve prompt_ms=35 total_ms=35",
      "AI 이미지(수동 생성) 모드: ChatGPT 웹에 프롬프트를 붙여 넣어 정사각형 이미지를 만든 뒤 슬라이드에 업로드하거나 내 자산에서 적용하세요.",
    ],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        imageUrl: "https://images.example.com/automatic.jpg",
        resolvedImageUrl: "https://images.example.com/automatic-resolved.jpg",
        resolvedBy: "crawl",
        imageSelection: {
          intent: "news",
          queryCandidates: ["automatic query"],
          selectionReason: "automatic provider selection",
        },
      },
    ],
    usage: {
      imagePolicyMs: 0,
    },
  });
});

test("studio prepare route plans manual AI image prompts with local Codex scene planner", async () => {
  const nowMarks = [5_000, 5_005, 5_025, 5_040];
  let imagePlannerCalled = 0;
  let scenePlannerCalled = 0;
  let policyCalled = 0;
  let receivedFixedCharacterCount = -1;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=plan"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        codexModel: "gpt-5.4",
        characterProfiles: [
          { characterId: "automatic_only", identityPrompt: "must be ignored in manual mode" },
        ],
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "manual-ai-prompt",
          allowGenerated: true,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
          },
        ],
      }),
      now: () => nowMarks.shift() || 5_040,
      resolveCodexAccessTokenFromRequest: async () => "codex-token",
      getPublishCategoryMetadata: async () => ({
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
        fixedCharacterProfiles: [
          {
            characterId: "fixed_lead",
            displayName: "브리피",
            identityPrompt: "파란 재킷과 둥근 안경",
          },
        ],
      }),
      planManualImageScenePrompts: async (input) => {
        scenePlannerCalled += 1;
        receivedFixedCharacterCount = input.characterProfiles?.length || 0;
        return {
          warnings: ["scene planner warning"],
          items: [
            {
              slideIndex: 0,
              source: "codex",
              mascotName: "브리피",
              characterIds: ["male_1"],
              basePrompt: "base prompt",
              scenePrompt: "scene prompt",
              finalPrompt: "final prompt",
              usesFallbackMascot: false,
              plannerModel: "gpt-5.4",
            },
          ],
        };
      },
      planMissingSlideImageRequests: async (payload) => {
        imagePlannerCalled += 1;
        return { payload, warnings: [] };
      },
      applyImagePolicy: async () => {
        policyCalled += 1;
        return { slides: [], warnings: [] };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(imagePlannerCalled, 0);
  assert.equal(scenePlannerCalled, 1);
  assert.equal(receivedFixedCharacterCount, 0);
  assert.equal(policyCalled, 0);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: [
      "[timing] prepare_plan prompt_ms=35 total_ms=25",
      "scene planner warning",
      "AI 이미지(수동 생성) 모드: ChatGPT 웹에 프롬프트를 붙여 넣어 정사각형 이미지를 만든 뒤 슬라이드에 업로드하거나 내 자산에서 적용하세요.",
    ],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        characterIds: ["male_1"],
        manualImagePrompt: {
          source: "codex",
          mascotName: "브리피",
          characterIds: ["male_1"],
          basePrompt: "base prompt",
          scenePrompt: "scene prompt",
          finalPrompt: "final prompt",
          usesFallbackMascot: false,
          plannerModel: "gpt-5.4",
        },
      },
    ],
    usage: {
      imagePolicyMs: 0,
    },
  });
});

test("studio prepare route uses the latest explicitly selected profile for manual AI image prompts", async () => {
  let dbMetadataCalled = false;
  let plannerMascotName = "";
  let plannerFixedCharacterId = "";
  let plannerStylePrompt = "";
  let plannerSlideCharacterId = "";
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=plan"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        fixedCharacterProfileId: "latest_lead",
        imageStylePrompt: "must be ignored",
        characterProfiles: [{ characterId: "client_lead", identityPrompt: "must be ignored" }],
        projectProfileSnapshot: {
          version: 1,
          projectId: "project-1",
          createdAt: "2026-07-20T00:00:00.000Z",
          contentProfile: {
            category: "alpha",
            label: "Alpha",
            metadataSnapshot: {
              description: "snapshot",
              tags: [],
              ttsVoiceId: "",
              bgmEnabled: true,
              bgmTrackId: "bgm",
              mixPresetId: "mix",
              sfxEnabled: true,
              sfxMasterGainDb: 2,
              templateNotes: "",
              topicToScriptPrompt: "topic",
              scriptToJsonPrompt: "json",
              mascotName: "스냅샷 마스코트",
              fixedCharacterProfiles: [
                {
                  characterId: "snapshot_lead",
                  identityPrompt: "스냅샷 외형",
                },
              ],
            },
          },
        },
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "manual-ai-prompt",
          allowGenerated: true,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
          },
        ],
      }),
      getPublishCategoryMetadata: async () => {
        dbMetadataCalled = true;
        return {
          description: "latest",
          tags: [],
          ttsVoiceId: "",
          bgmTrackId: "",
          templateNotes: "",
          mascotName: "최신 프로필 마스코트",
          fixedCharacterProfiles: [
            {
              characterId: "latest_lead",
              identityPrompt: "최신 외형",
            },
          ],
        };
      },
      planManualImageScenePrompts: async (input) => {
        plannerMascotName = input.metadata?.mascotName || "";
        plannerFixedCharacterId =
          input.characterProfiles?.[0]?.characterId || "";
        plannerStylePrompt = input.imageStylePrompt || "";
        plannerSlideCharacterId = input.slides[0]?.characterIds?.[0] || "";
        return {
          warnings: [],
          items: [],
        };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(dbMetadataCalled, true);
  assert.equal(plannerMascotName, "");
  assert.equal(plannerFixedCharacterId, "latest_lead");
  assert.equal(plannerStylePrompt, "");
  assert.equal(plannerSlideCharacterId, "latest_lead");
});

test("studio prepare route reuses manual prompt planning for auto AI generation mode", async () => {
  const nowMarks = [5_500, 5_505, 5_525, 5_540];
  let imagePlannerCalled = 0;
  let scenePlannerCalled = 0;
  let policyCalled = 0;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=plan"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        codexModel: "gpt-5.4",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "auto-ai-generate",
          allowGenerated: true,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
          },
        ],
      }),
      now: () => nowMarks.shift() || 5_540,
      resolveCodexAccessTokenFromRequest: async () => "codex-token",
      getPublishCategoryMetadata: async () => ({
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
      }),
      planManualImageScenePrompts: async () => {
        scenePlannerCalled += 1;
        return {
          warnings: ["scene planner warning"],
          items: [
            {
              slideIndex: 0,
              source: "codex",
              mascotName: "브리피",
              characterIds: ["male_1"],
              basePrompt: "base prompt",
              scenePrompt: "scene prompt",
              finalPrompt: "final prompt",
              usesFallbackMascot: false,
              plannerModel: "gpt-5.4",
            },
          ],
        };
      },
      planMissingSlideImageRequests: async (payload) => {
        imagePlannerCalled += 1;
        return { payload, warnings: [] };
      },
      applyImagePolicy: async () => {
        policyCalled += 1;
        return { slides: [], warnings: [] };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(imagePlannerCalled, 0);
  assert.equal(scenePlannerCalled, 1);
  assert.equal(policyCalled, 0);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: [
      "[timing] prepare_plan prompt_ms=35 total_ms=25",
      "scene planner warning",
      "AI 이미지(자동 생성) 모드: prepare 후 이미지 없는 슬라이드만 Codex가 생성해 자동 첨부합니다.",
    ],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        characterIds: ["male_1"],
        manualImagePrompt: {
          source: "codex",
          mascotName: "브리피",
          characterIds: ["male_1"],
          basePrompt: "base prompt",
          scenePrompt: "scene prompt",
          finalPrompt: "final prompt",
          usesFallbackMascot: false,
          plannerModel: "gpt-5.4",
        },
      },
    ],
    usage: {
      imagePolicyMs: 0,
    },
  });
});

test("studio prepare route allows script-driven style when no fixed character is selected", async () => {
  let receivedPreferStyleOnlyBasePrompt: boolean | undefined;

  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=plan"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        codexModel: "gpt-5.4",
        mode: "dialogue",
        imageStylePrompt: "soft shoujo manga inspired romance illustration style, gentle pastel tones, no text",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "auto-ai-generate",
          allowGenerated: true,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
            dialogueSegments: [{ type: "narration", text: "설명" }],
          },
        ],
      }),
      resolveCodexAccessTokenFromRequest: async () => "codex-token",
      getPublishCategoryMetadata: async () => null,
      planManualImageScenePrompts: async (input) => {
        receivedPreferStyleOnlyBasePrompt = input.preferStyleOnlyBasePrompt;
        return {
          warnings: [],
          items: [
            {
              slideIndex: 0,
              source: "codex",
              mascotName: "브리피",
              basePrompt: "base prompt",
              scenePrompt: "scene prompt",
              finalPrompt: "final prompt",
              usesFallbackMascot: false,
            },
          ],
        };
      },
      planMissingSlideImageRequests: async (payload) => ({ payload, warnings: [] }),
      applyImagePolicy: async () => ({ slides: [], warnings: [] }),
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(receivedPreferStyleOnlyBasePrompt, true);
});

test("studio prepare route preserves manual AI image prompts during resolve", async () => {
  const nowMarks = [6_000, 6_010, 6_030];
  let scenePlannerCalled = 0;
  let policyCalled = 0;
  const response = await handleStudioPreparePost(
    createPrepareRequest(
      {},
      createValidatedHeaders(),
      "http://localhost/api/studio/prepare?stage=resolve"
    ),
    createPrepareRouteDependencies({
      parsePrepareRequest: () => ({
        publishCategory: "alpha",
        videoMode: "singleAudio",
        ttsProvider: "typecast",
        imagePolicy: {
          source: "manual-ai-prompt",
          allowGenerated: true,
          fallback: "body-only",
        },
        crawlMode: "auto",
        slides: [
          {
            title: "오프닝",
            text: "첫 문장",
            lines: ["첫 문장"],
            layout: "photo+body",
            manualImagePrompt: {
              source: "codex",
              mascotName: "브리피",
              basePrompt: "base prompt",
              scenePrompt: "scene prompt",
              finalPrompt: "final prompt",
              usesFallbackMascot: false,
            },
          },
        ],
      }),
      now: () => nowMarks.shift() || 6_030,
      planManualImageScenePrompts: async () => {
        scenePlannerCalled += 1;
        return { warnings: [], items: [] };
      },
      applyImagePolicy: async () => {
        policyCalled += 1;
        return { slides: [], warnings: [] };
      },
      explodeSlidesForPop: (slides) => slides,
      logInfo: () => undefined,
    })
  );

  assert.equal(scenePlannerCalled, 0);
  assert.equal(policyCalled, 0);
  assert.deepEqual(await response.json(), {
    ok: true,
    warnings: [
      "[timing] prepare_resolve prompt_ms=20 total_ms=30",
      "AI 이미지(수동 생성) 모드: ChatGPT 웹에 프롬프트를 붙여 넣어 정사각형 이미지를 만든 뒤 슬라이드에 업로드하거나 내 자산에서 적용하세요.",
    ],
    slides: [
      {
        title: "오프닝",
        text: "첫 문장",
        lines: ["첫 문장"],
        layout: "photo+body",
        manualImagePrompt: {
          source: "codex",
          mascotName: "브리피",
          basePrompt: "base prompt",
          scenePrompt: "scene prompt",
          finalPrompt: "final prompt",
          usesFallbackMascot: false,
        },
      },
    ],
    usage: {
      imagePolicyMs: 0,
    },
  });
});

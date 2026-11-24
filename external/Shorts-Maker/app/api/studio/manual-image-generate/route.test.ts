import assert from "node:assert/strict";
import test from "node:test";
import { defaultManualImageGenerateRouteDependencies, handleManualImageGeneratePost } from "./route";
import { createJsonNextRequest, createValidatedHeaders } from "../../test-helpers";
import type { PreparedSlide } from "@/types/studio-json";

function createManualImageGenerateRequest(
  body: unknown,
  url = "http://localhost/api/studio/manual-image-generate"
) {
  const normalizedBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? {
          imageSource: "auto-ai-generate",
          ...(body as Record<string, unknown>),
        }
      : body;
  return createJsonNextRequest(
    url,
    normalizedBody,
    createValidatedHeaders()
  );
}

function createRouteDependencies(overrides?: Partial<NonNullable<Parameters<typeof handleManualImageGeneratePost>[1]>>) {
  return {
    ...defaultManualImageGenerateRouteDependencies,
    ...overrides,
  };
}

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "기본 슬라이드",
    text: "기본 설명",
    lines: ["기본 설명"],
    layout: "photo+body",
    manualImagePrompt: {
      source: "codex",
      mascotName: "브리피",
      basePrompt: "base prompt",
      scenePrompt: "scene prompt",
      finalPrompt: "final prompt",
      usesFallbackMascot: false,
    },
    ...overrides,
  };
}

function makeMediaAsset(input: {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  tags?: string[];
}) {
  return {
    id: input.id,
    userId: "auth-user",
    provider: "codex-local",
    providerAssetId: input.id,
    isFavorite: false,
    title: input.title,
    summary: undefined,
    folderPath: input.folderPath,
    mediaKind: "image",
    sourceUrl: input.url,
    storageUrl: input.url,
    sourceMediaUrl: undefined,
    sourcePageUrl: undefined,
    storageMediaUrl: undefined,
    width: undefined,
    height: undefined,
    tags: input.tags || ["codex-generated", "alpha"],
    manualTags: input.tags || ["codex-generated", "alpha"],
    autoTags: [],
    emotionTags: [],
    manualEmotionTags: [],
    autoEmotionTags: [],
    queryHints: [],
    manualQueryHints: [],
    autoQueryHints: [],
    autoSourceMetadata: {
      provider: "codex-local",
      providerQuery: "",
      queryCandidates: [],
      providerTitle: input.title,
      providerSlug: "",
      providerRating: "",
      providerTags: [],
      providerCandidates: [],
      selectionDetails: [],
    },
    vlmStatus: undefined,
    insertedAtMs: 1,
    updatedAtMs: 1,
  } as Awaited<ReturnType<typeof defaultManualImageGenerateRouteDependencies.createOrUpdateStudioMediaAsset>>;
}

test("manual image generate route checks category access before parsing the full payload", async () => {
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "blocked-category",
      projectProfileSnapshot: { malformed: true },
    }),
    createRouteDependencies({
      getCategoryAccessScope: async () => ({
        accessMode: "selected",
        allAccessLevel: "view",
        hasRestrictions: true,
        allowedCategories: [],
        allowedCategorySet: new Set(),
        categoryPermissions: new Map(),
      }),
      canEditCategory: () => false,
    })
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "편집 권한이 있는 고객(category)만 제작할 수 있습니다.",
    errorCode: "AUTH_FORBIDDEN",
    retryable: false,
  });
});

test("manual image generate route rejects manual prompt mode before invoking the generator", async () => {
  let generationCalls = 0;
  let uploadCalls = 0;
  let assetStoreCalls = 0;
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      imageSource: "manual-ai-prompt",
      mode: "selected",
      slideIndexes: [0],
      slides: [makeSlide()],
    }),
    createRouteDependencies({
      generateCodexLocalImages: async () => {
        generationCalls += 1;
        return {
          requestId: "should-not-run",
          outputDir: "tmp/codex-imagegen/should-not-run",
          results: [],
        };
      },
      uploadSupabaseStorageFile: async (input) => {
        uploadCalls += 1;
        return {
          bucket: input.bucket || "video-assets",
          path: input.path,
          publicUrl: "https://cdn.example.com/should-not-upload.png",
        };
      },
      createOrUpdateStudioMediaAsset: async (input) => {
        assetStoreCalls += 1;
        return makeMediaAsset({
          id: String(input.providerAssetId || "should-not-store"),
          title: String(input.title || "should-not-store"),
          url: String(input.sourceUrl || "https://cdn.example.com/should-not-store.png"),
          folderPath: String(input.folderPath || "should-not-store"),
        });
      },
    })
  );

  assert.equal(response.status, 400);
  assert.equal(generationCalls, 0);
  assert.equal(uploadCalls, 0);
  assert.equal(assetStoreCalls, 0);
  const payload = await response.json();
  assert.match(payload.error || "", /자동 생성/);
});

test("auto image generation uses one latest selected profile for every scene and ignores style state", async () => {
  let generatedPrompt = "";
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      imageSource: "auto-ai-generate",
      fixedCharacterProfileId: "saved_lead",
      imageStylePrompt: "automatic-only style",
      characterProfiles: [
        { characterId: "client_character", identityPrompt: "client-only appearance" },
      ],
      mode: "selected",
      slideIndexes: [0],
      slides: [
        makeSlide({
          title: "선택 장면",
          characterIds: ["female_1"],
        }),
        makeSlide({
          title: "선택하지 않은 장면",
          characterIds: ["male_1"],
          manualImagePrompt: {
            source: "codex",
            mascotName: "",
            basePrompt: "unchanged base",
            scenePrompt: "unchanged scene",
            finalPrompt: "unchanged prompt",
            usesFallbackMascot: false,
          },
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-selected-fixed-cast",
      getPublishCategoryMetadata: async () => ({
        description: "",
        tags: [],
        ttsVoiceId: "",
        bgmTrackId: "",
        templateNotes: "",
        fixedCharacterProfiles: [
          {
            characterId: "saved_lead",
            displayName: "저장 캐릭터",
            identityPrompt: "짧은 검은 머리와 남색 재킷",
          },
        ],
      }),
      generateCodexLocalImages: async (input) => {
        generatedPrompt = input.items[0]?.prompt || "";
        return {
          requestId: "request-selected-fixed-cast",
          outputDir: "tmp/codex-imagegen/request-selected-fixed-cast",
          results: [
            {
              slideIndex: 0,
              status: "error",
              requestId: "request-selected-fixed-cast",
              code: "execution_failed",
              reason: "expected test failure",
              warnings: [],
            },
          ],
        };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.match(generatedPrompt, /짧은 검은 머리와 남색 재킷/);
  assert.doesNotMatch(generatedPrompt, /automatic-only style/);
  const payload = await response.json();
  assert.match(payload.slides[1]?.manualImagePrompt?.finalPrompt || "", /짧은 검은 머리와 남색 재킷/);
  assert.equal(payload.characterProfiles, undefined);
});

test("auto image generation treats a deleted selected character as unselected", async () => {
  let generatedPrompt = "";
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      fixedCharacterProfileId: "deleted_lead",
      imageStylePrompt: "soft paper collage style",
      mode: "selected",
      slideIndexes: [0],
      slides: [makeSlide({ manualImagePrompt: undefined, characterIds: undefined })],
    }),
    createRouteDependencies({
      getPublishCategoryMetadata: async () => ({
        description: "",
        tags: [],
        ttsVoiceId: "",
        bgmTrackId: "",
        templateNotes: "",
        fixedCharacterProfiles: [],
      }),
      generateCodexLocalImages: async (input) => {
        generatedPrompt = input.items[0]?.prompt || "";
        return {
          requestId: "deleted-selection",
          outputDir: "tmp/codex-imagegen/deleted-selection",
          results: [
            {
              slideIndex: 0,
              status: "error",
              requestId: "deleted-selection",
              code: "execution_failed",
              reason: "expected test failure",
              warnings: [],
            },
          ],
        };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.match(generatedPrompt, /soft paper collage style/);
  const payload = await response.json();
  assert.match(payload.warnings[0] || "", /선택 안 함/);
});

test("manual image generate route adds a generated asset candidate to all linked slides without replacing approved media", async () => {
  const uploadCalls: Array<{ path: string; contentType?: string }> = [];
  const assetCalls: Array<Record<string, unknown>> = [];

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "selected",
      slideIndexes: [0],
      slides: [
        makeSlide({
          title: "묶음 1",
          groupId: 7,
          stepIndex: 0,
          imageUrl: "https://cdn.example.com/approved-slide-01.png",
          resolvedImageUrl: "https://cdn.example.com/approved-slide-01.png",
          resolvedBy: "crawl",
          imageRequest: { query: "브리핑" },
          imageSelection: {
            intent: "news",
            queryCandidates: ["브리핑"],
            selectedQuery: "브리핑",
            provider: "naver",
            providerCandidates: ["naver"],
            candidateOptions: [
              {
                provider: "naver",
                candidateId: "naver-approved",
                imageUrl: "https://cdn.example.com/approved-slide-01.png",
                title: "승인 이미지",
              },
            ],
            selectedCandidateId: "naver-approved",
            selectionReason: "automatic provider selection: naver",
          },
        }),
        makeSlide({
          title: "묶음 1",
          groupId: 7,
          stepIndex: 1,
          imageUrl: "https://cdn.example.com/approved-slide-01.png",
          resolvedImageUrl: "https://cdn.example.com/approved-slide-01.png",
          resolvedBy: "crawl",
          imageRequest: { query: "브리핑" },
          imageSelection: {
            intent: "news",
            queryCandidates: ["브리핑"],
            selectedQuery: "브리핑",
            provider: "naver",
            providerCandidates: ["naver"],
            selectedCandidateId: "naver-approved",
            selectionReason: "automatic provider selection: naver",
          },
        }),
        makeSlide({ title: "다른 슬라이드", groupId: 8, stepIndex: 0 }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-1",
      createAssetId: () => "asset-1",
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async () => ({
        requestId: "request-1",
        outputDir: "tmp/codex-imagegen/request-1",
        results: [
          {
            slideIndex: 0,
            status: "ok",
            requestId: "request-1",
            filePath: "tmp/codex-imagegen/request-1/slide-01.png",
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-1/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          },
        ],
      }),
      uploadSupabaseStorageFile: async (input) => {
        uploadCalls.push({ path: input.path, contentType: input.contentType });
        return {
          bucket: "video-assets",
          path: input.path,
          publicUrl: "https://cdn.example.com/generated-slide-01.png",
        };
      },
      createOrUpdateStudioMediaAsset: async (input) => {
        assetCalls.push({ ...input });
        return {
          id: "asset-1",
          userId: "auth-user",
          provider: "codex-local",
          providerAssetId: "asset-1",
          isFavorite: false,
          title: "묶음 1",
          summary: "scene prompt",
          folderPath: "ai-generated/alpha/codex-local",
          mediaKind: "image",
          sourceUrl: "https://cdn.example.com/generated-slide-01.png",
          storageUrl: "https://cdn.example.com/generated-slide-01.png",
          sourceMediaUrl: undefined,
          sourcePageUrl: undefined,
          storageMediaUrl: undefined,
          width: undefined,
          height: undefined,
          tags: ["codex-generated", "alpha"],
          manualTags: ["codex-generated", "alpha"],
          autoTags: [],
          emotionTags: [],
          manualEmotionTags: [],
          autoEmotionTags: [],
          queryHints: ["브리핑", "브리피", "묶음 1"],
          manualQueryHints: ["브리핑", "브리피", "묶음 1"],
          autoQueryHints: [],
          autoSourceMetadata: {
            provider: "codex-local",
            providerQuery: "",
            queryCandidates: [],
            providerTitle: "묶음 1",
            providerSlug: "",
            providerRating: "",
            providerTags: [],
            providerCandidates: [],
            selectionDetails: [],
          },
          vlmStatus: undefined,
          insertedAtMs: 1,
          updatedAtMs: 1,
        } as Awaited<ReturnType<typeof defaultManualImageGenerateRouteDependencies.createOrUpdateStudioMediaAsset>>;
      },
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(uploadCalls.length, 1);
  assert.equal(assetCalls.length, 1);
  const payload = await response.json();
  assert.deepEqual(payload.warnings, []);
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].status, "ok");
  assert.equal(payload.slides[0].imageUrl, "https://cdn.example.com/approved-slide-01.png");
  assert.equal(payload.slides[1].imageUrl, "https://cdn.example.com/approved-slide-01.png");
  assert.equal(payload.slides[0].resolvedBy, "crawl");
  assert.equal(payload.slides[1].resolvedBy, "crawl");
  assert.equal(payload.slides[2].imageUrl, undefined);
  assert.equal(payload.slides[0].imageSelection?.provider, "naver");
  assert.equal(payload.slides[0].imageSelection?.selectedCandidateId, "naver-approved");
  assert.equal(payload.slides[0].imageSelection?.selectionReason, "automatic provider selection: naver");
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-1");
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.imageUrl, "https://cdn.example.com/generated-slide-01.png");
  assert.equal(payload.slides[1].imageSelection?.selectedCandidateId, "naver-approved");
  assert.equal(payload.slides[1].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-1");
});

test("auto image generation does not inherit an unselected profile mascot", async () => {
  let dbMetadataCalled = false;
  let prompt = "";
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
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
          },
        },
      },
      mode: "selected",
      slideIndexes: [0],
      slides: [
        makeSlide({
          title: "프롬프트 생성 대상",
          manualImagePrompt: undefined,
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-snapshot",
      getPublishCategoryMetadata: async () => {
        dbMetadataCalled = true;
        return null;
      },
      logInfo: () => undefined,
      generateCodexLocalImages: async (input) => {
        prompt = input.items[0]?.prompt || "";
        return {
          requestId: "request-snapshot",
          outputDir: "tmp/codex-imagegen/request-snapshot",
          results: [
            {
              slideIndex: 0,
              status: "error",
              requestId: "request-snapshot",
              code: "manifest_missing",
              reason: "테스트 오류",
              warnings: [],
            },
          ],
        };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(dbMetadataCalled, false);
  assert.doesNotMatch(prompt, /스냅샷 마스코트/);
  assert.match(prompt, /same art style across the project/);
});

test("manual image generate route rejects project profile snapshot category mismatches", async () => {
  let generated = false;
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      projectProfileSnapshot: {
        version: 1,
        projectId: "project-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        contentProfile: {
          category: "beta",
          label: "Beta",
          metadataSnapshot: null,
        },
      },
      mode: "selected",
      slideIndexes: [0],
      slides: [makeSlide()],
    }),
    createRouteDependencies({
      generateCodexLocalImages: async () => {
        generated = true;
        return {
          requestId: "request-mismatch",
          outputDir: "tmp/codex-imagegen/request-mismatch",
          results: [],
        };
      },
    })
  );

  assert.equal(response.status, 400);
  assert.equal(generated, false);
  assert.equal((await response.json()).errorCode, "INVALID_MANUAL_IMAGE_GENERATE_INPUT");
});

test("manual image generate route caps slide and missing-character anchor generations together", async () => {
  let generationCalls = 0;
  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "selected",
      slideIndexes: [0],
      slides: [
        makeSlide({
          manualImagePrompt: undefined,
          dialogueSegments: Array.from({ length: 12 }, (_, index) => ({
            type: "quote" as const,
            speakerId: `speaker_${index + 1}`,
            text: `대사 ${index + 1}`,
          })),
        }),
      ],
    }),
    createRouteDependencies({
      getPublishCategoryMetadata: async () => null,
      generateCodexLocalImages: async () => {
        generationCalls += 1;
        return {
          requestId: "request-over-cap",
          outputDir: "tmp/codex-imagegen/request-over-cap",
          results: [],
        };
      },
    })
  );

  assert.equal(response.status, 400);
  assert.equal(generationCalls, 0);
  const payload = await response.json();
  assert.equal(payload.errorCode, "MANUAL_IMAGE_GENERATE_FAILED");
  assert.match(payload.error, /12개를 넘습니다/);
});

test("manual image generate route keeps partial successes when some slides fail", async () => {
  let uploadCallCount = 0;
  let assetCallCount = 0;

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "selected",
      slideIndexes: [0, 2],
      slides: [
        makeSlide({ title: "성공 슬라이드", groupId: 1, stepIndex: 0 }),
        makeSlide({ title: "성공 슬라이드", groupId: 1, stepIndex: 1 }),
        makeSlide({ title: "실패 슬라이드", groupId: 2, stepIndex: 0 }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-2",
      createAssetId: () => "asset-2",
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async () => ({
        requestId: "request-2",
        outputDir: "tmp/codex-imagegen/request-2",
        results: [
          {
            slideIndex: 0,
            status: "ok",
            requestId: "request-2",
            filePath: "tmp/codex-imagegen/request-2/slide-01.png",
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-2/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          },
          {
            slideIndex: 2,
            status: "error",
            requestId: "request-2",
            code: "manifest_missing",
            reason: "Codex가 이미지 생성 manifest를 반환하지 않았습니다.",
            warnings: [],
          },
        ],
      }),
      uploadSupabaseStorageFile: async (input) => {
        uploadCallCount += 1;
        return {
          bucket: "video-assets",
          path: input.path,
          publicUrl: "https://cdn.example.com/generated-slide-02.png",
        };
      },
      createOrUpdateStudioMediaAsset: async () => {
        assetCallCount += 1;
        return {
          id: "asset-2",
          userId: "auth-user",
          provider: "codex-local",
          providerAssetId: "asset-2",
          isFavorite: false,
          title: "성공 슬라이드",
          summary: "scene prompt",
          folderPath: "ai-generated/alpha/codex-local",
          mediaKind: "image",
          sourceUrl: "https://cdn.example.com/generated-slide-02.png",
          storageUrl: "https://cdn.example.com/generated-slide-02.png",
          sourceMediaUrl: undefined,
          sourcePageUrl: undefined,
          storageMediaUrl: undefined,
          width: undefined,
          height: undefined,
          tags: ["codex-generated", "alpha"],
          manualTags: ["codex-generated", "alpha"],
          autoTags: [],
          emotionTags: [],
          manualEmotionTags: [],
          autoEmotionTags: [],
          queryHints: ["성공 슬라이드"],
          manualQueryHints: ["성공 슬라이드"],
          autoQueryHints: [],
          autoSourceMetadata: {
            provider: "codex-local",
            providerQuery: "",
            queryCandidates: [],
            providerTitle: "성공 슬라이드",
            providerSlug: "",
            providerRating: "",
            providerTags: [],
            providerCandidates: [],
            selectionDetails: [],
          },
          vlmStatus: undefined,
          insertedAtMs: 1,
          updatedAtMs: 1,
        } as Awaited<ReturnType<typeof defaultManualImageGenerateRouteDependencies.createOrUpdateStudioMediaAsset>>;
      },
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(uploadCallCount, 1);
  assert.equal(assetCallCount, 1);

  const payload = await response.json();
  assert.equal(payload.results.length, 2);
  assert.equal(payload.results[0].status, "ok");
  assert.equal(payload.results[1].status, "error");
  assert.equal(payload.results[1].code, "manifest_missing");
  assert.match(payload.warnings[0], /슬라이드 3/);
  assert.equal(payload.slides[0].imageUrl, "https://cdn.example.com/generated-slide-02.png");
  assert.equal(payload.slides[1].imageUrl, "https://cdn.example.com/generated-slide-02.png");
  assert.equal(payload.slides[0].resolvedImageUrl, "https://cdn.example.com/generated-slide-02.png");
  assert.equal(payload.slides[1].resolvedImageUrl, "https://cdn.example.com/generated-slide-02.png");
  assert.equal(payload.slides[0].resolvedBy, "direct");
  assert.equal(payload.slides[1].resolvedBy, "direct");
  assert.equal(payload.slides[0].imageSelection?.selectedCandidateId, "asset-2");
  assert.equal(payload.slides[1].imageSelection?.selectedCandidateId, "asset-2");
  assert.match(payload.slides[0].imageSelection?.selectionReason || "", /^auto-applied generated image candidate/);
  assert.match(payload.slides[1].imageSelection?.selectionReason || "", /^auto-applied generated image candidate/);
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-2");
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.imageUrl, "https://cdn.example.com/generated-slide-02.png");
  assert.equal(payload.slides[1].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-2");
  assert.equal(payload.slides[2].imageUrl, undefined);
});

test("manual image generate route in missing mode applies generated images immediately only to slide groups without an existing image", async () => {
  let assetSeq = 0;
  let uploadSeq = 0;

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "missing",
      slides: [
        makeSlide({
          title: "보유 묶음",
          groupId: 20,
          stepIndex: 0,
          imageUrl: "https://cdn.example.com/existing-a.png",
          resolvedImageUrl: "https://cdn.example.com/existing-a.png",
          resolvedBy: "crawl",
        }),
        makeSlide({
          title: "보유 묶음",
          groupId: 20,
          stepIndex: 1,
          imageUrl: "https://cdn.example.com/existing-a.png",
          resolvedImageUrl: "https://cdn.example.com/existing-a.png",
          resolvedBy: "crawl",
        }),
        makeSlide({ title: "미보유 묶음", groupId: 21, stepIndex: 0 }),
        makeSlide({ title: "미보유 묶음", groupId: 21, stepIndex: 1 }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-mixed",
      createAssetId: () => {
        assetSeq += 1;
        return `asset-mixed-${assetSeq}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async () => ({
        requestId: "request-mixed",
        outputDir: "tmp/codex-imagegen/request-mixed",
        results: [
          {
            slideIndex: 0,
            status: "ok",
            requestId: "request-mixed",
            filePath: "tmp/codex-imagegen/request-mixed/slide-01.png",
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-mixed/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          },
          {
            slideIndex: 2,
            status: "ok",
            requestId: "request-mixed",
            filePath: "tmp/codex-imagegen/request-mixed/slide-03.png",
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-mixed/slide-03.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          },
        ],
      }),
      uploadSupabaseStorageFile: async (input) => {
        uploadSeq += 1;
        return {
          bucket: "video-assets",
          path: input.path,
          publicUrl: `https://cdn.example.com/generated-mixed-${uploadSeq}.png`,
        };
      },
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId),
          title: String(input.title),
          url: String(input.sourceUrl),
          folderPath: String(input.folderPath),
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.results.length, 2);

  assert.equal(payload.slides[0].imageUrl, "https://cdn.example.com/existing-a.png");
  assert.equal(payload.slides[1].imageUrl, "https://cdn.example.com/existing-a.png");
  assert.equal(payload.slides[0].resolvedBy, "crawl");
  assert.equal(payload.slides[0].imageSelection?.selectedCandidateId, undefined);
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-mixed-1");
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.imageUrl, "https://cdn.example.com/generated-mixed-1.png");
  assert.equal(payload.slides[1].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-mixed-1");

  assert.equal(payload.slides[2].imageUrl, "https://cdn.example.com/generated-mixed-2.png");
  assert.equal(payload.slides[3].imageUrl, "https://cdn.example.com/generated-mixed-2.png");
  assert.equal(payload.slides[2].resolvedImageUrl, "https://cdn.example.com/generated-mixed-2.png");
  assert.equal(payload.slides[2].resolvedBy, "direct");
  assert.equal(payload.slides[3].resolvedBy, "direct");
  assert.equal(payload.slides[2].imageSelection?.selectedCandidateId, "asset-mixed-2");
  assert.equal(payload.slides[3].imageSelection?.selectedCandidateId, "asset-mixed-2");
  assert.match(payload.slides[2].imageSelection?.selectionReason || "", /^auto-applied generated image candidate/);
  assert.match(payload.slides[3].imageSelection?.selectionReason || "", /^auto-applied generated image candidate/);
});

test("manual image generate route keeps generated results candidate-only for slides with resolved or beat visuals", async () => {
  let assetSeq = 0;
  let uploadSeq = 0;

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "missing",
      slides: [
        makeSlide({
          title: "리졸브만 보유",
          groupId: 30,
          stepIndex: 0,
          resolvedImageUrl: "https://cdn.example.com/resolved-only.png",
          resolvedBy: "crawl",
        }),
        makeSlide({
          title: "비트만 보유",
          groupId: 31,
          stepIndex: 0,
          imageBeats: [
            {
              beatId: "beat-1",
              startLineIndex: 0,
              imageUrl: "https://cdn.example.com/beat-visual.png",
            },
          ],
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-visual",
      createAssetId: () => {
        assetSeq += 1;
        return `asset-visual-${assetSeq}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async () => ({
        requestId: "request-visual",
        outputDir: "tmp/codex-imagegen/request-visual",
        results: [
          {
            slideIndex: 0,
            status: "ok",
            requestId: "request-visual",
            filePath: "tmp/codex-imagegen/request-visual/slide-01.png",
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-visual/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          },
          {
            slideIndex: 1,
            status: "ok",
            requestId: "request-visual",
            filePath: "tmp/codex-imagegen/request-visual/slide-02.png",
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-visual/slide-02.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          },
        ],
      }),
      uploadSupabaseStorageFile: async (input) => {
        uploadSeq += 1;
        return {
          bucket: "video-assets",
          path: input.path,
          publicUrl: `https://cdn.example.com/generated-visual-${uploadSeq}.png`,
        };
      },
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId),
          title: String(input.title),
          url: String(input.sourceUrl),
          folderPath: String(input.folderPath),
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.results.length, 2);

  assert.equal(payload.slides[0].imageUrl, undefined);
  assert.equal(payload.slides[0].resolvedImageUrl, "https://cdn.example.com/resolved-only.png");
  assert.equal(payload.slides[0].resolvedBy, "crawl");
  assert.equal(payload.slides[0].imageSelection?.selectedCandidateId, undefined);
  assert.equal(payload.slides[0].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-visual-1");

  assert.equal(payload.slides[1].imageUrl, undefined);
  assert.equal(payload.slides[1].imageBeats?.[0]?.imageUrl, "https://cdn.example.com/beat-visual.png");
  assert.equal(payload.slides[1].imageSelection?.selectedCandidateId, undefined);
  assert.equal(payload.slides[1].imageSelection?.candidateOptions?.[0]?.candidateId, "asset-visual-2");
});

test("manual image generate route creates missing character anchors before slide generation", async () => {
  let assetIndex = 0;
  const generationCalls: Array<{ requestId?: string; items: Array<{ slideIndex: number; prompt: string; anchorImageUrl?: string }> }> = [];

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest(
      {
        publishCategory: "alpha",
        mode: "missing",
        imageStylePrompt: "chibi moe style, no text, square 1:1",
        slides: [
          makeSlide({
            manualImagePrompt: undefined,
            title: "대화 장면",
            text: "안녕",
            lines: ["안녕"],
            dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "안녕" }],
          }),
        ],
      },
      "http://localhost:4100/api/studio/manual-image-generate"
    ),
    createRouteDependencies({
      createRequestId: () => "request-anchor",
      createAssetId: () => {
        assetIndex += 1;
        return `asset-${assetIndex}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async (input) => {
        generationCalls.push({
          requestId: input.requestId,
          items: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            prompt: item.prompt,
            anchorImageUrl: item.anchorImageUrl,
          })),
        });
        return {
          requestId: input.requestId || "request-anchor",
          outputDir: `tmp/codex-imagegen/${input.requestId || "request-anchor"}`,
          results: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            status: "ok" as const,
            requestId: input.requestId || "request-anchor",
            filePath: `tmp/codex-imagegen/${input.requestId || "request-anchor"}/slide-01.png`,
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-anchor/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          })),
        };
      },
      uploadSupabaseStorageFile: async (input) => ({
        bucket: "video-assets",
        path: input.path,
        publicUrl: input.path.includes("character-anchors")
          ? "http://localhost:3000/api/local-storage/video-assets/female-1-anchor.png"
          : "http://localhost:3000/api/local-storage/video-assets/generated-slide.png",
      }),
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId || "asset"),
          title: String(input.title || "asset"),
          url: String(input.storageUrl || input.sourceUrl || ""),
          folderPath: String(input.folderPath || ""),
          tags: input.tags,
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(generationCalls.length, 2);
  assert.equal(generationCalls[0].requestId, "request-anchor-anchors");
  assert.match(generationCalls[0].items[0]?.prompt || "", /캐릭터 기준 이미지 생성/);
  assert.equal(generationCalls[1].requestId, "request-anchor");
  assert.equal(
    generationCalls[1].items[0]?.anchorImageUrl,
    "http://localhost:3000/api/local-storage/video-assets/female-1-anchor.png"
  );

  const payload = await response.json();
  assert.equal(payload.characterProfiles[0].characterId, "female_1");
  assert.equal(
    payload.characterProfiles[0].anchorImageUrl,
    "http://localhost:4100/api/local-storage/video-assets/female-1-anchor.png"
  );
  assert.equal(payload.characterProfiles[0].anchorAssetId, "asset-1");
  assert.equal(
    payload.slides[0].manualImagePrompt.anchorImageUrl,
    "http://localhost:4100/api/local-storage/video-assets/female-1-anchor.png"
  );
  assert.equal(payload.slides[0].imageUrl, "http://localhost:4100/api/local-storage/video-assets/generated-slide.png");
  assert.equal(
    payload.slides[0].imageSelection?.candidateOptions?.[0]?.imageUrl,
    "http://localhost:4100/api/local-storage/video-assets/generated-slide.png"
  );
  assert.equal(payload.results[0].imageUrl, "http://localhost:4100/api/local-storage/video-assets/generated-slide.png");
});

test("manual image generate route refreshes existing prompts with newly generated character anchors", async () => {
  let assetIndex = 0;
  const generationCalls: Array<{ requestId?: string; items: Array<{ slideIndex: number; prompt: string; anchorImageUrl?: string }> }> = [];

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "selected",
      slideIndexes: [0],
      imageStylePrompt: "consistent webtoon style, no text, square 1:1",
      characterProfiles: [
        {
          characterId: "female_1",
          displayName: "여성 주인공",
          identityPrompt: "검은 단발머리와 민트 니트, 차분한 표정",
        },
      ],
      slides: [
        makeSlide({
          title: "기존 프롬프트 장면",
          text: "오늘은 달라",
          lines: ["오늘은 달라"],
          characterIds: ["female_1"],
          dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "오늘은 달라" }],
          manualImagePrompt: {
            source: "codex",
            mascotName: "여성 주인공",
            characterIds: ["female_1"],
            characterNames: ["여성 주인공"],
            characterSummary: "여성 주인공",
            basePrompt: "[female_1] 여성 주인공: 검은 단발머리와 민트 니트, 차분한 표정.",
            scenePrompt: "기존 장면 프롬프트를 유지한다.",
            finalPrompt:
              "[Base character/style prompt]\n[female_1] 여성 주인공: 검은 단발머리와 민트 니트, 차분한 표정.\n\n[Per-slide scene prompt]\n기존 장면 프롬프트를 유지한다.",
            usesFallbackMascot: false,
          },
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-refresh-anchor",
      createAssetId: () => {
        assetIndex += 1;
        return `asset-${assetIndex}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async (input) => {
        generationCalls.push({
          requestId: input.requestId,
          items: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            prompt: item.prompt,
            anchorImageUrl: item.anchorImageUrl,
          })),
        });
        return {
          requestId: input.requestId || "request-refresh-anchor",
          outputDir: `tmp/codex-imagegen/${input.requestId || "request-refresh-anchor"}`,
          results: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            status: "ok" as const,
            requestId: input.requestId || "request-refresh-anchor",
            filePath: `tmp/codex-imagegen/${input.requestId || "request-refresh-anchor"}/slide-01.png`,
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-refresh-anchor/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          })),
        };
      },
      uploadSupabaseStorageFile: async (input) => ({
        bucket: "video-assets",
        path: input.path,
        publicUrl: input.path.includes("character-anchors")
          ? "https://cdn.example.com/refreshed-female-anchor.png"
          : "https://cdn.example.com/generated-with-refreshed-anchor.png",
      }),
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId || "asset"),
          title: String(input.title || "asset"),
          url: String(input.storageUrl || input.sourceUrl || ""),
          folderPath: String(input.folderPath || ""),
          tags: input.tags,
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(generationCalls.length, 2);
  assert.equal(generationCalls[0].requestId, "request-refresh-anchor-anchors");
  assert.equal(generationCalls[1].requestId, "request-refresh-anchor");
  assert.equal(generationCalls[1].items[0]?.anchorImageUrl, "https://cdn.example.com/refreshed-female-anchor.png");
  assert.match(generationCalls[1].items[0]?.prompt || "", /https:\/\/cdn\.example\.com\/refreshed-female-anchor\.png/);
  assert.match(generationCalls[1].items[0]?.prompt || "", /기존 장면 프롬프트를 유지한다/);

  const payload = await response.json();
  assert.equal(payload.characterProfiles[0].anchorImageUrl, "https://cdn.example.com/refreshed-female-anchor.png");
  assert.equal(payload.slides[0].manualImagePrompt.anchorImageUrl, "https://cdn.example.com/refreshed-female-anchor.png");
  assert.match(payload.slides[0].manualImagePrompt.finalPrompt, /https:\/\/cdn\.example\.com\/refreshed-female-anchor\.png/);
  assert.match(payload.slides[0].manualImagePrompt.scenePrompt, /기존 장면 프롬프트를 유지한다/);
});

test("manual image generate route limits selected character anchors to targeted slides", async () => {
  let assetIndex = 0;
  const generationCalls: Array<{ requestId?: string; items: Array<{ slideIndex: number; prompt: string; anchorImageUrl?: string }> }> = [];

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "selected",
      slideIndexes: [0],
      slides: [
        makeSlide({
          manualImagePrompt: undefined,
          title: "선택한 여성 화자 장면",
          text: "안녕",
          lines: ["안녕"],
          dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "안녕" }],
        }),
        makeSlide({
          manualImagePrompt: undefined,
          title: "선택하지 않은 남성 화자 장면",
          text: "좋아",
          lines: ["좋아"],
          dialogueSegments: [{ type: "quote", speakerId: "male_1", text: "좋아" }],
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-selected-anchor-scope",
      createAssetId: () => {
        assetIndex += 1;
        return `asset-${assetIndex}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async (input) => {
        generationCalls.push({
          requestId: input.requestId,
          items: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            prompt: item.prompt,
            anchorImageUrl: item.anchorImageUrl,
          })),
        });
        return {
          requestId: input.requestId || "request-selected-anchor-scope",
          outputDir: `tmp/codex-imagegen/${input.requestId || "request-selected-anchor-scope"}`,
          results: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            status: "ok" as const,
            requestId: input.requestId || "request-selected-anchor-scope",
            filePath: `tmp/codex-imagegen/${input.requestId || "request-selected-anchor-scope"}/slide-01.png`,
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-selected-anchor-scope/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          })),
        };
      },
      uploadSupabaseStorageFile: async (input) => ({
        bucket: "video-assets",
        path: input.path,
        publicUrl: input.path.includes("character-anchors")
          ? "https://cdn.example.com/selected-anchor.png"
          : "https://cdn.example.com/selected-slide.png",
      }),
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId || "asset"),
          title: String(input.title || "asset"),
          url: String(input.storageUrl || input.sourceUrl || ""),
          folderPath: String(input.folderPath || ""),
          tags: input.tags,
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(generationCalls.length, 2);
  assert.equal(generationCalls[0].requestId, "request-selected-anchor-scope-anchors");
  assert.equal(generationCalls[0].items.length, 1);
  assert.match(generationCalls[0].items[0]?.prompt || "", /female_1|여성/);
  assert.doesNotMatch(generationCalls[0].items[0]?.prompt || "", /male_1/);

  const payload = await response.json();
  assert.deepEqual(
    payload.characterProfiles.map((profile: { characterId: string }) => profile.characterId),
    ["female_1"]
  );
});

test("manual image generate route includes linked-group characters for selected anchor scope", async () => {
  let assetIndex = 0;
  const generationCalls: Array<{ requestId?: string; items: Array<{ prompt: string }> }> = [];

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "selected",
      slideIndexes: [0],
      slides: [
        makeSlide({
          manualImagePrompt: undefined,
          title: "같은 묶음 장면",
          text: "안녕",
          lines: ["안녕"],
          groupId: 7,
          imageVariantId: "linked-scene",
          dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "안녕" }],
        }),
        makeSlide({
          manualImagePrompt: undefined,
          title: "같은 묶음 장면",
          text: "좋아",
          lines: ["좋아"],
          groupId: 7,
          imageVariantId: "linked-scene",
          dialogueSegments: [{ type: "quote", speakerId: "male_1", text: "좋아" }],
        }),
        makeSlide({
          manualImagePrompt: undefined,
          title: "다른 묶음 장면",
          text: "해설",
          lines: ["해설"],
          groupId: 8,
          imageVariantId: "unrelated-scene",
          dialogueSegments: [{ type: "quote", speakerId: "narrator_1", text: "해설" }],
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-linked-anchor-scope",
      createAssetId: () => {
        assetIndex += 1;
        return `asset-${assetIndex}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async (input) => {
        generationCalls.push({
          requestId: input.requestId,
          items: input.items.map((item) => ({ prompt: item.prompt })),
        });
        return {
          requestId: input.requestId || "request-linked-anchor-scope",
          outputDir: `tmp/codex-imagegen/${input.requestId || "request-linked-anchor-scope"}`,
          results: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            status: "ok" as const,
            requestId: input.requestId || "request-linked-anchor-scope",
            filePath: `tmp/codex-imagegen/${input.requestId || "request-linked-anchor-scope"}/slide-01.png`,
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-linked-anchor-scope/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          })),
        };
      },
      uploadSupabaseStorageFile: async (input) => ({
        bucket: "video-assets",
        path: input.path,
        publicUrl: input.path.includes("character-anchors")
          ? `https://cdn.example.com/linked-anchor-${assetIndex}.png`
          : "https://cdn.example.com/linked-slide.png",
      }),
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId || "asset"),
          title: String(input.title || "asset"),
          url: String(input.storageUrl || input.sourceUrl || ""),
          folderPath: String(input.folderPath || ""),
          tags: input.tags,
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(generationCalls.length, 2);
  assert.equal(generationCalls[0].requestId, "request-linked-anchor-scope-anchors");
  assert.equal(generationCalls[0].items.length, 2);
  const anchorPrompts = generationCalls[0].items.map((item) => item.prompt).join("\n");
  assert.match(anchorPrompts, /female_1|여성/);
  assert.match(anchorPrompts, /male_1|남성/);
  assert.doesNotMatch(anchorPrompts, /narrator_1/);

  const payload = await response.json();
  assert.deepEqual(
    payload.characterProfiles.map((profile: { characterId: string }) => profile.characterId),
    ["female_1", "male_1"]
  );
});

test("manual image generate route keeps all-slide character anchor scope for all mode", async () => {
  let assetIndex = 0;
  const generationCalls: Array<{ requestId?: string; items: Array<{ prompt: string }> }> = [];

  const response = await handleManualImageGeneratePost(
    createManualImageGenerateRequest({
      publishCategory: "alpha",
      mode: "all",
      slides: [
        makeSlide({
          manualImagePrompt: undefined,
          title: "여성 화자 장면",
          text: "안녕",
          lines: ["안녕"],
          dialogueSegments: [{ type: "quote", speakerId: "female_1", text: "안녕" }],
        }),
        makeSlide({
          manualImagePrompt: undefined,
          title: "남성 화자 장면",
          text: "좋아",
          lines: ["좋아"],
          dialogueSegments: [{ type: "quote", speakerId: "male_1", text: "좋아" }],
        }),
      ],
    }),
    createRouteDependencies({
      createRequestId: () => "request-all-anchor-scope",
      createAssetId: () => {
        assetIndex += 1;
        return `asset-${assetIndex}`;
      },
      getPublishCategoryMetadata: async () => null,
      logInfo: () => undefined,
      generateCodexLocalImages: async (input) => {
        generationCalls.push({
          requestId: input.requestId,
          items: input.items.map((item) => ({ prompt: item.prompt })),
        });
        return {
          requestId: input.requestId || "request-all-anchor-scope",
          outputDir: `tmp/codex-imagegen/${input.requestId || "request-all-anchor-scope"}`,
          results: input.items.map((item) => ({
            slideIndex: item.slideIndex,
            status: "ok" as const,
            requestId: input.requestId || "request-all-anchor-scope",
            filePath: `tmp/codex-imagegen/${input.requestId || "request-all-anchor-scope"}/slide-01.png`,
            absoluteFilePath: "C:/Projects/Shorts_Maker/tmp/codex-imagegen/request-all-anchor-scope/slide-01.png",
            fileBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            contentType: "image/png",
            fileExtension: "png",
            warnings: [],
          })),
        };
      },
      uploadSupabaseStorageFile: async (input) => ({
        bucket: "video-assets",
        path: input.path,
        publicUrl: input.path.includes("character-anchors")
          ? `https://cdn.example.com/anchor-${assetIndex}.png`
          : `https://cdn.example.com/slide-${assetIndex}.png`,
      }),
      createOrUpdateStudioMediaAsset: async (input) =>
        makeMediaAsset({
          id: String(input.providerAssetId || "asset"),
          title: String(input.title || "asset"),
          url: String(input.storageUrl || input.sourceUrl || ""),
          folderPath: String(input.folderPath || ""),
          tags: input.tags,
        }),
      resolveStudioMediaAssetUrls: (item) => ({
        imageUrl: item.storageUrl || item.sourceUrl || "",
        mediaUrl: item.storageMediaUrl || item.sourceMediaUrl,
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(generationCalls.length, 2);
  assert.equal(generationCalls[0].requestId, "request-all-anchor-scope-anchors");
  assert.equal(generationCalls[0].items.length, 2);
  const payload = await response.json();
  assert.deepEqual(
    payload.characterProfiles.map((profile: { characterId: string }) => profile.characterId),
    ["female_1", "male_1"]
  );
});

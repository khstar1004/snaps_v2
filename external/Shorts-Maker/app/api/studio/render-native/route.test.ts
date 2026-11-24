import test from "node:test";
import assert from "node:assert/strict";
import { defaultStudioNativeRenderRouteDependencies, handleStudioNativeRenderPost } from "./route";
import { createJsonNextRequest, createValidatedHeaders } from "../../test-helpers";

function createRenderNativeRequest(body: unknown, headers?: Headers, url = "http://localhost/api/studio/render-native") {
  return createJsonNextRequest(url, body, headers);
}

function createRenderNativeRouteDependencies(overrides?: Partial<NonNullable<Parameters<typeof handleStudioNativeRenderPost>[1]>>) {
  return {
    ...defaultStudioNativeRenderRouteDependencies,
    ...overrides,
  };
}

test("studio render-native route requires an authenticated session", async () => {
  const response = await handleStudioNativeRenderPost(createRenderNativeRequest({}));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "로그인이 필요합니다.",
    errorCode: "AUTH_REQUIRED",
    retryable: false,
  });
});

test("studio render-native route reports disabled renderer state", async () => {
  const response = await handleStudioNativeRenderPost(
    createRenderNativeRequest({}, createValidatedHeaders()),
    createRenderNativeRouteDependencies({
      isServerRendererEnabled: () => false,
    })
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    renderer: "server_native",
    error: "서버 네이티브 렌더러가 비활성화되어 있습니다.",
    errorCode: "SERVER_RENDERER_DISABLED",
    retryable: false,
  });
});

test("studio render-native route preserves required BGM failures", async () => {
  const response = await handleStudioNativeRenderPost(
    createRenderNativeRequest({}, createValidatedHeaders()),
    createRenderNativeRouteDependencies({
      parseStudioNativeRenderRequest: () => ({
        fullAudio: "base64-audio",
        narration: {
          mode: "singleAudio",
          fullAudio: "base64-audio",
        },
        durationMs: 1_000,
        frameDurationsSec: [1],
        visuals: {
          slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
          branding: {} as never,
        },
      }),
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "manage",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      canEditCategory: () => true,
      renderVideoWithServerNative: async () => ({
        ok: false,
        renderer: "server_native",
        error: "BGM_ASSET_UNAVAILABLE: BGM 파일을 불러올 수 없습니다.",
        errorCode: "BGM_ASSET_UNAVAILABLE",
        retryable: false,
      }),
    })
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    ok: false,
    renderer: "server_native",
    error: "BGM_ASSET_UNAVAILABLE: BGM 파일을 불러올 수 없습니다.",
    errorCode: "BGM_ASSET_UNAVAILABLE",
    retryable: false,
  });
});

test("studio render-native route treats missing narration references as invalid input", async () => {
  const response = await handleStudioNativeRenderPost(
    createRenderNativeRequest({}, createValidatedHeaders()),
    createRenderNativeRouteDependencies({
      parseStudioNativeRenderRequest: () => ({
        fullAudio: "",
        narration: {
          mode: "segmentsRef",
          narrationRef: "narration-ref",
        },
        durationMs: 1_000,
        frameDurationsSec: [1],
        visuals: {
          slides: [
            {
              title: "첫 장",
              text: "본문",
              lines: ["본문"],
              layout: "photo+body",
            },
          ],
          branding: {} as never,
        },
        asset: {
          publishCategory: "alpha",
        },
      }),
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "manage",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      canEditCategory: () => true,
      loadStudioNarrationInput: async () => null,
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    renderer: "server_native",
    error: "narration reference is missing or expired",
    errorCode: "SERVER_NATIVE_RENDER_REQUEST_INVALID",
    retryable: false,
  });
});

test("studio render-native route uploads rendered assets and cleans the workdir", async () => {
  const loadedNarrationRefs: string[] = [];
  const uploadedAssets: string[] = [];
  const cleanedWorkDirs: string[] = [];
  const savedSnapshots: Array<{ userId: string; assetId: string; snapshot: unknown }> = [];
  const response = await handleStudioNativeRenderPost(
    createRenderNativeRequest({}, createValidatedHeaders()),
    createRenderNativeRouteDependencies({
      parseStudioNativeRenderRequest: () => ({
        fullAudio: "",
        narration: {
          mode: "segmentsRef",
          narrationRef: "narration-ref",
        },
        durationMs: 1_000,
        frameDurationsSec: [1],
        visuals: {
          slides: [
            {
              title: "첫 장",
              text: "본문",
              lines: ["본문"],
              layout: "photo+body",
            },
          ],
          branding: {} as never,
        },
        asset: {
          title: "렌더 결과",
          publishCategory: "alpha",
          studioSnapshot: {
            version: 2,
            renderStage: "final",
            createdAtMs: 123,
            draft: {
              workName: "렌더 결과 작업",
            },
          },
        },
      }),
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "manage",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      canEditCategory: () => true,
      loadStudioNarrationInput: async (narrationRef) => {
        loadedNarrationRefs.push(narrationRef);
        return {
          mode: "segments",
          segments: [
            {
              segmentId: "segment-1",
              groupId: 0,
              audioBase64: "base64-audio",
              durationMs: 500,
            },
          ],
        };
      },
      resolveBaseUrl: () => "http://localhost",
      renderVideoWithServerNative: async () => ({
        ok: true,
        renderer: "server_native",
        videoPath: "C:\\temp\\rendered.mp4",
        videoSizeBytes: 4_096,
        workDir: "C:\\temp\\render-workdir",
        audioDiagnostics: {
          mixPresetId: "default",
          peakRisk: "low",
          previewLoudnessIndex: 1,
          finalLoudnessIndex: 1,
          loudnessMismatchRatio: 0,
          loudnessMismatchDelta: 0,
          loudnessMismatchLevel: "low",
          expectedSfxCues: 0,
          effectiveSfxCues: 0,
          expectedBgmEnabled: false,
          effectiveBgmEnabled: false,
        },
        memoryBudget: {
          softLimitMb: 512,
          hardLimitMb: 1024,
          estimatedMb: 128,
          degradeLevel: "none",
          degraded: false,
          blocked: false,
          softLimitExceeded: false,
          expectedSfxCues: 0,
          maxSfxCues: 0,
          expectedBgmEnabled: false,
          effectiveBgmEnabled: false,
          inputImageMb: 10,
          inputNarrationMb: 5,
        },
        usage: {
          renderMs: 321,
        },
      }),
      uploadRenderedVideoAsset: async ({ videoPath }) => {
        uploadedAssets.push(videoPath);
        return {
          id: "asset-1",
          url: "https://cdn.example.com/rendered.mp4",
        };
      },
      setVideoAssetStudioSnapshot: async (input) => {
        savedSnapshots.push(input);
      },
      removeWorkDir: async (workDir) => {
        cleanedWorkDirs.push(workDir);
      },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(loadedNarrationRefs, ["narration-ref"]);
  assert.deepEqual(uploadedAssets, ["C:\\temp\\rendered.mp4"]);
  assert.deepEqual(cleanedWorkDirs, ["C:\\temp\\render-workdir"]);
  assert.equal(savedSnapshots.length, 1);
  assert.equal(savedSnapshots[0]?.userId, "auth-user");
  assert.equal(savedSnapshots[0]?.assetId, "asset-1");
  assert.deepEqual(
    (savedSnapshots[0]?.snapshot as { draft?: { slides?: Array<{ title?: string }> } })?.draft?.slides?.map(
      (slide) => slide.title
    ),
    ["첫 장"]
  );
  assert.deepEqual(await response.json(), {
    ok: true,
    renderer: "server_native",
    uploadedAssetId: "asset-1",
    uploadedAssetUrl: "https://cdn.example.com/rendered.mp4",
    studioSnapshotSaved: true,
    audioDiagnostics: {
      mixPresetId: "default",
      peakRisk: "low",
      previewLoudnessIndex: 1,
      finalLoudnessIndex: 1,
      loudnessMismatchRatio: 0,
      loudnessMismatchDelta: 0,
      loudnessMismatchLevel: "low",
      expectedSfxCues: 0,
      effectiveSfxCues: 0,
      expectedBgmEnabled: false,
      effectiveBgmEnabled: false,
    },
    memoryBudget: {
      softLimitMb: 512,
      hardLimitMb: 1024,
      estimatedMb: 128,
      degradeLevel: "none",
      degraded: false,
      blocked: false,
      softLimitExceeded: false,
      expectedSfxCues: 0,
      maxSfxCues: 0,
      expectedBgmEnabled: false,
      effectiveBgmEnabled: false,
      inputImageMb: 10,
      inputNarrationMb: 5,
    },
    usage: {
      renderMs: 321,
    },
  });
});

test("studio render-native route keeps a successful asset when snapshot persistence fails", async () => {
  const cleanedWorkDirs: string[] = [];
  const response = await handleStudioNativeRenderPost(
    createRenderNativeRequest({}, createValidatedHeaders()),
    createRenderNativeRouteDependencies({
      parseStudioNativeRenderRequest: () => ({
        fullAudio: "base64-audio",
        narration: {
          mode: "singleAudio",
          fullAudio: "base64-audio",
        },
        durationMs: 1_000,
        frameDurationsSec: [1],
        visuals: {
          slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
          branding: {} as never,
        },
        asset: {
          title: "렌더 결과",
          publishCategory: "alpha",
          studioSnapshot: {
            version: 2,
            renderStage: "draft",
            draft: { workName: "렌더 결과 작업" },
          },
        },
      }),
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "manage",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      canEditCategory: () => true,
      resolveBaseUrl: () => "http://localhost",
      renderVideoWithServerNative: async () => ({
        ok: true,
        renderer: "server_native",
        videoPath: "C:\\temp\\rendered.mp4",
        videoSizeBytes: 4_096,
        workDir: "C:\\temp\\render-workdir",
        audioDiagnostics: {
          mixPresetId: "default",
          peakRisk: "low",
          previewLoudnessIndex: 1,
          finalLoudnessIndex: 1,
          loudnessMismatchRatio: 0,
          loudnessMismatchDelta: 0,
          loudnessMismatchLevel: "low",
          expectedSfxCues: 0,
          effectiveSfxCues: 0,
          expectedBgmEnabled: false,
          effectiveBgmEnabled: false,
        },
        memoryBudget: {
          softLimitMb: 512,
          hardLimitMb: 1024,
          estimatedMb: 128,
          degradeLevel: "none",
          degraded: false,
          blocked: false,
          softLimitExceeded: false,
          expectedSfxCues: 0,
          maxSfxCues: 0,
          expectedBgmEnabled: false,
          effectiveBgmEnabled: false,
          inputImageMb: 10,
          inputNarrationMb: 5,
        },
        usage: { renderMs: 321 },
      }),
      uploadRenderedVideoAsset: async () => ({
        id: "asset-1",
        url: "https://cdn.example.com/rendered.mp4",
      }),
      setVideoAssetStudioSnapshot: async () => {
        throw new Error("snapshot table unavailable");
      },
      removeWorkDir: async (workDir) => {
        cleanedWorkDirs.push(workDir);
      },
    })
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.uploadedAssetId, "asset-1");
  assert.equal(body.uploadedAssetUrl, "https://cdn.example.com/rendered.mp4");
  assert.equal(body.studioSnapshotSaved, false);
  assert.deepEqual(cleanedWorkDirs, ["C:\\temp\\render-workdir"]);
});

test("studio render-native route rebases stale loopback local-storage urls to the request origin", async () => {
  const response = await handleStudioNativeRenderPost(
    createRenderNativeRequest({}, createValidatedHeaders(), "http://localhost:4100/api/studio/render-native"),
    createRenderNativeRouteDependencies({
      parseStudioNativeRenderRequest: () => ({
        fullAudio: "base64-audio",
        narration: {
          mode: "singleAudio",
          fullAudio: "base64-audio",
        },
        durationMs: 1_000,
        frameDurationsSec: [1],
        visuals: {
          slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
          branding: {} as never,
        },
        asset: { title: "렌더 결과", publishCategory: "alpha" },
      }),
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "manage",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      canEditCategory: () => true,
      resolveBaseUrl: () => "http://localhost:4100",
      renderVideoWithServerNative: async () => ({
        ok: true,
        renderer: "server_native",
        videoPath: "C:\\temp\\rendered.mp4",
        videoSizeBytes: 4_096,
        workDir: "C:\\temp\\render-workdir",
        audioDiagnostics: {
          mixPresetId: "default",
          peakRisk: "low",
          previewLoudnessIndex: 1,
          finalLoudnessIndex: 1,
          loudnessMismatchRatio: 0,
          loudnessMismatchDelta: 0,
          loudnessMismatchLevel: "low",
          expectedSfxCues: 0,
          effectiveSfxCues: 0,
          expectedBgmEnabled: false,
          effectiveBgmEnabled: false,
        },
        memoryBudget: {
          softLimitMb: 512,
          hardLimitMb: 1024,
          estimatedMb: 128,
          degradeLevel: "none",
          degraded: false,
          blocked: false,
          softLimitExceeded: false,
          expectedSfxCues: 0,
          maxSfxCues: 0,
          expectedBgmEnabled: false,
          effectiveBgmEnabled: false,
          inputImageMb: 10,
          inputNarrationMb: 5,
        },
        usage: { renderMs: 321 },
      }),
      uploadRenderedVideoAsset: async () => ({
        id: "asset-1",
        url: "http://localhost:3000/api/local-storage/video-assets/shorts/final.mp4",
      }),
      removeWorkDir: async () => {},
    })
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.uploadedAssetUrl, "http://localhost:4100/api/local-storage/video-assets/shorts/final.mp4");
});

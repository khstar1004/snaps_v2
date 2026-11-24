import assert from "node:assert/strict";
import test from "node:test";
import { defaultScriptToJsonRouteDependencies, handleScriptToJsonPost } from "./route";
import { createJsonNextRequest, createValidatedHeaders } from "../../test-helpers";

function createRequest(body: unknown) {
  return createJsonNextRequest("http://localhost/api/studio/script-to-json", body, createValidatedHeaders());
}

function createDeps(overrides?: Partial<NonNullable<Parameters<typeof handleScriptToJsonPost>[1]>>) {
  return {
    ...defaultScriptToJsonRouteDependencies,
    ...overrides,
  };
}

test("script-to-json uses project profile snapshot prompt before latest category metadata", async () => {
  let dbMetadataCalled = false;
  let prompt = "";
  let captionLayoutPolicy: unknown;
  const response = await handleScriptToJsonPost(
    createRequest({
      script: "훅 문장\n본문 문장",
      publishCategory: "alpha",
      projectProfileSnapshot: {
        version: 1,
        projectId: "project-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        contentProfile: {
          category: "alpha",
          label: "Alpha",
          metadataSnapshot: {
            topicToScriptPrompt: "snapshot topic prompt",
            scriptToJsonPrompt: "snapshot script prompt",
          },
        },
      },
    }),
    createDeps({
      getPublishCategoryMetadata: async () => {
        dbMetadataCalled = true;
        return { scriptToJsonPrompt: "latest script prompt" } as never;
      },
      resolveCodexAccessTokenFromRequest: async () => "token",
      convertScriptToStudioJson: async (_script, _category, _token, _model, promptTemplates, _mode, policy) => {
        prompt = promptTemplates?.scriptToJsonPrompt || "";
        captionLayoutPolicy = policy;
        return {
          title: "훅 문장",
          payload: {
            videoMode: "segments",
            imagePolicy: { source: "crawl-only", allowGenerated: false, fallback: "body-only" },
            slides: [{ title: "훅 문장", text: "본문 문장", lines: ["본문 문장"], layout: "photo+body" }],
          },
        };
      },
      parsePrepareRequest: () => ({
        videoMode: "segments",
        imagePolicy: { source: "crawl-only", allowGenerated: false, fallback: "body-only" },
        slides: [{ title: "훅 문장", text: "본문 문장", lines: ["본문 문장"], layout: "photo+body" }],
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(dbMetadataCalled, false);
  assert.equal(prompt, "snapshot script prompt");
  assert.deepEqual(captionLayoutPolicy, { mode: "character-count", maxCharacters: 12 });
  assert.equal((await response.json()).json.title, "훅 문장");
});

test("script-to-json falls back to latest category metadata without a snapshot", async () => {
  let prompt = "";
  let captionLayoutPolicy: unknown;
  const response = await handleScriptToJsonPost(
    createRequest({
      script: "훅 문장\n본문 문장",
      publishCategory: "alpha",
      templateId: "default",
      templateData: { bodyScale: 1 },
      templateImageEnabled: true,
      templateImageLayout: {
        bodySlot: { x: 0.05, y: 0.25, w: 0.9, h: 0.18 },
        bodySize: 16,
      },
    }),
    createDeps({
      getPublishCategoryMetadata: async () => ({ scriptToJsonPrompt: "latest script prompt" }) as never,
      resolveCodexAccessTokenFromRequest: async () => "token",
      convertScriptToStudioJson: async (_script, _category, _token, _model, promptTemplates, _mode, policy) => {
        prompt = promptTemplates?.scriptToJsonPrompt || "";
        captionLayoutPolicy = policy;
        return {
          title: "훅 문장",
          payload: {
            videoMode: "segments",
            imagePolicy: { source: "crawl-only", allowGenerated: false, fallback: "body-only" },
            slides: [{ title: "훅 문장", text: "본문 문장", lines: ["본문 문장"], layout: "photo+body" }],
          },
        };
      },
      parsePrepareRequest: () => ({
        videoMode: "segments",
        imagePolicy: { source: "crawl-only", allowGenerated: false, fallback: "body-only" },
        slides: [{ title: "훅 문장", text: "본문 문장", lines: ["본문 문장"], layout: "photo+body" }],
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(prompt, "latest script prompt");
  assert.equal((captionLayoutPolicy as { mode?: string }).mode, "render-width");
  assert.equal((captionLayoutPolicy as { fontSizePx?: number }).fontSizePx, 64);
  assert.ok(Math.abs(Number((captionLayoutPolicy as { maxWidthPx?: number }).maxWidthPx) - 862.6) < 0.001);
});

test("script-to-json rejects project profile snapshot category mismatches", async () => {
  let converted = false;
  const response = await handleScriptToJsonPost(
    createRequest({
      script: "훅 문장\n본문 문장",
      publishCategory: "alpha",
      projectProfileSnapshot: {
        version: 1,
        projectId: "project-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        contentProfile: {
          category: "beta",
          label: "Beta",
          metadataSnapshot: {
            scriptToJsonPrompt: "snapshot script prompt",
          },
        },
      },
    }),
    createDeps({
      convertScriptToStudioJson: async () => {
        converted = true;
        return {
          payload: {
            videoMode: "segments",
            imagePolicy: { source: "crawl-only", allowGenerated: false, fallback: "body-only" },
            slides: [],
          },
        };
      },
    })
  );

  assert.equal(response.status, 400);
  assert.equal(converted, false);
  assert.equal((await response.json()).errorCode, "PROJECT_PROFILE_SNAPSHOT_INVALID");
});

test("script-to-json requires publishCategory when a project profile snapshot is supplied", async () => {
  const response = await handleScriptToJsonPost(
    createRequest({
      script: "테스트 대본입니다.",
      projectProfileSnapshot: {
        version: 1,
        projectId: "project-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        contentProfile: {
          category: "alpha",
          label: "Alpha",
          metadataSnapshot: null,
        },
      },
    }),
    createDeps()
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).errorCode, "PROJECT_PROFILE_SNAPSHOT_INVALID");
});

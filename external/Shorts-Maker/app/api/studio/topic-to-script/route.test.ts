import assert from "node:assert/strict";
import test from "node:test";
import { defaultTopicToScriptRouteDependencies, handleTopicToScriptPost } from "./route";
import { createJsonNextRequest, createValidatedHeaders } from "../../test-helpers";

function createRequest(body: unknown) {
  return createJsonNextRequest("http://localhost/api/studio/topic-to-script", body, createValidatedHeaders());
}

function createDeps(overrides?: Partial<NonNullable<Parameters<typeof handleTopicToScriptPost>[1]>>) {
  return {
    ...defaultTopicToScriptRouteDependencies,
    ...overrides,
  };
}

test("topic-to-script uses project profile snapshot prompt before latest category metadata", async () => {
  let dbMetadataCalled = false;
  let prompt = "";
  const response = await handleTopicToScriptPost(
    createRequest({
      topic: "AI 뉴스",
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
        return { topicToScriptPrompt: "latest topic prompt" } as never;
      },
      resolveCodexAccessTokenFromRequest: async () => "token",
      generateScriptFromTopic: async (_topic, _token, _model, _category, promptTemplates) => {
        prompt = promptTemplates?.topicToScriptPrompt || "";
        return { script: "생성 대본" };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(dbMetadataCalled, false);
  assert.equal(prompt, "snapshot topic prompt");
  assert.deepEqual(await response.json(), { ok: true, script: "생성 대본" });
});

test("topic-to-script falls back to latest category metadata without a snapshot", async () => {
  let prompt = "";
  const response = await handleTopicToScriptPost(
    createRequest({
      topic: "AI 뉴스",
      publishCategory: "alpha",
    }),
    createDeps({
      getPublishCategoryMetadata: async () => ({ topicToScriptPrompt: "latest topic prompt" }) as never,
      resolveCodexAccessTokenFromRequest: async () => "token",
      generateScriptFromTopic: async (_topic, _token, _model, _category, promptTemplates) => {
        prompt = promptTemplates?.topicToScriptPrompt || "";
        return { script: "생성 대본" };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(prompt, "latest topic prompt");
});

test("topic-to-script rejects project profile snapshot category mismatches", async () => {
  let generated = false;
  const response = await handleTopicToScriptPost(
    createRequest({
      topic: "AI 뉴스",
      publishCategory: "alpha",
      projectProfileSnapshot: {
        version: 1,
        projectId: "project-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        contentProfile: {
          category: "beta",
          label: "Beta",
          metadataSnapshot: {
            topicToScriptPrompt: "snapshot topic prompt",
          },
        },
      },
    }),
    createDeps({
      generateScriptFromTopic: async () => {
        generated = true;
        return { script: "생성 대본" };
      },
    })
  );

  assert.equal(response.status, 400);
  assert.equal(generated, false);
  assert.equal((await response.json()).errorCode, "PROJECT_PROFILE_SNAPSHOT_INVALID");
});

test("topic-to-script requires publishCategory when a project profile snapshot is supplied", async () => {
  const response = await handleTopicToScriptPost(
    createRequest({
      topic: "AI 뉴스",
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

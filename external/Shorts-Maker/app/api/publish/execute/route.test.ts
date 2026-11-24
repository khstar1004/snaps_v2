import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { OAuthAccount, PublishJobRecord } from "@/lib/publish/types";
import { defaultPublishExecuteRouteDependencies, handlePublishExecutePost } from "./route";

function createExecuteRequest(body: unknown, secret = ""): NextRequest {
  return new NextRequest("http://localhost/api/publish/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publish-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

function createPublishRecord(overrides?: Partial<PublishJobRecord>): PublishJobRecord {
  return {
    userId: "user-1",
    id: "job-1",
    platform: "youtube" as const,
    channelId: "channel-1",
    publishCategory: "alpha",
    videoUrl: "https://cdn.example.com/video.mp4",
    title: "테스트 쇼츠",
    description: "설명",
    tags: ["alpha"],
    visibility: "private" as const,
    scheduledAt: null,
    status: "pending" as const,
    attempts: 0,
    lastError: null,
    platformPostId: null,
    publishedUrl: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createExecuteRouteDependencies(overrides?: Partial<NonNullable<Parameters<typeof handlePublishExecutePost>[1]>>) {
  return {
    ...defaultPublishExecuteRouteDependencies,
    now: () => 1_000,
    generateLockToken: () => "lock-token",
    enqueuePublishJob: async () => undefined,
    acquirePublishJobExecutionLock: async () => true,
    getPublishJob: async () => createPublishRecord(),
    releasePublishJobExecutionLock: async () => undefined,
    getYoutubeAccount: async (): Promise<OAuthAccount> => ({
      userId: "user-1",
      platform: "youtube" as const,
      channelId: "channel-1",
      channelTitle: "채널",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiryDate: 2_000,
      scope: "youtube.upload",
    }),
    refreshYoutubeAccountToken: async () => null,
    updatePublishJobStatus: async () => createPublishRecord(),
    uploadYoutubeShorts: async () => ({
      videoId: "video-1",
      url: "https://youtube.com/watch?v=video-1",
      refreshed: {
        accessToken: "new-access-token",
        expiryDate: 9_999,
      },
    }),
    ...overrides,
  };
}

test("publish execute route rejects invalid secret", async (t) => {
  const originalSecret = process.env.PUBLISH_EXECUTE_SECRET;
  process.env.PUBLISH_EXECUTE_SECRET = "expected-secret";
  t.after(() => {
    if (typeof originalSecret === "string") {
      process.env.PUBLISH_EXECUTE_SECRET = originalSecret;
      return;
    }
    delete process.env.PUBLISH_EXECUTE_SECRET;
  });

  const response = await handlePublishExecutePost(
    createExecuteRequest(
      {
        userId: "user-1",
        jobId: "job-1",
      },
      "wrong-secret"
    ),
    createExecuteRouteDependencies()
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "실행 요청 인증에 실패했습니다.",
    errorCode: "PUBLISH_EXECUTE_UNAUTHORIZED",
    retryable: false,
  });
});

test("publish execute route re-enqueues future scheduled jobs", async (t) => {
  const originalSecret = process.env.PUBLISH_EXECUTE_SECRET;
  process.env.PUBLISH_EXECUTE_SECRET = "expected-secret";
  t.after(() => {
    if (typeof originalSecret === "string") {
      process.env.PUBLISH_EXECUTE_SECRET = originalSecret;
      return;
    }
    delete process.env.PUBLISH_EXECUTE_SECRET;
  });

  const enqueued: Array<{ jobId: string; userId: string; delayMs: number }> = [];
  const released: string[] = [];
  const response = await handlePublishExecutePost(
    createExecuteRequest(
      {
        userId: "user-1",
        jobId: "job-1",
      },
      "expected-secret"
    ),
    createExecuteRouteDependencies({
      now: () => 1_000,
      getPublishJob: async () =>
        createPublishRecord({
          scheduledAt: 8_000,
        }),
      enqueuePublishJob: async (jobId: string, userId: string, delayMs?: number) => {
        enqueued.push({ jobId, userId, delayMs: delayMs ?? 0 });
      },
      releasePublishJobExecutionLock: async (_userId, _jobId, token) => {
        released.push(token);
      },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "scheduled_waiting",
  });
  assert.deepEqual(enqueued, [
    {
      jobId: "job-1",
      userId: "user-1",
      delayMs: 7_000,
    },
  ]);
  assert.deepEqual(released, ["lock-token"]);
});

test("publish execute route marks jobs published after upload succeeds", async (t) => {
  const originalSecret = process.env.PUBLISH_EXECUTE_SECRET;
  process.env.PUBLISH_EXECUTE_SECRET = "expected-secret";
  t.after(() => {
    if (typeof originalSecret === "string") {
      process.env.PUBLISH_EXECUTE_SECRET = originalSecret;
      return;
    }
    delete process.env.PUBLISH_EXECUTE_SECRET;
  });

  const updatedStatuses: string[] = [];
  const refreshedTokens: string[] = [];
  const released: string[] = [];
  const response = await handlePublishExecutePost(
    createExecuteRequest(
      {
        userId: "user-1",
        jobId: "job-1",
      },
      "expected-secret"
    ),
    createExecuteRouteDependencies({
      updatePublishJobStatus: async (input) => {
        updatedStatuses.push(input.status);
        return createPublishRecord({
          status: input.status,
          attempts: input.attempts ?? 0,
        });
      },
      refreshYoutubeAccountToken: async (input) => {
        refreshedTokens.push(input.accessToken);
        return {
          userId: input.userId,
          platform: "youtube",
          channelId: input.channelId,
          channelTitle: "채널",
          accessToken: input.accessToken,
          refreshToken: "refresh-token",
          expiryDate: input.expiryDate,
          scope: "youtube.upload",
        };
      },
      releasePublishJobExecutionLock: async (_userId, _jobId, token) => {
        released.push(token);
      },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "published",
    url: "https://youtube.com/watch?v=video-1",
  });
  assert.deepEqual(updatedStatuses, ["processing", "published"]);
  assert.deepEqual(refreshedTokens, ["new-access-token"]);
  assert.deepEqual(released, ["lock-token"]);
});

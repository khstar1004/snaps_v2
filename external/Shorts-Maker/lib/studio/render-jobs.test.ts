import test from "node:test";
import assert from "node:assert/strict";
import type { StudioNativeRenderRequest } from "@/types/studio-renderer";
import { retryCompletedStudioRenderJobSnapshot, toStudioRenderJobFingerprint } from "./render-jobs";

function createPayload(createdAtMs: number, workName = "동일한 편집 상태"): StudioNativeRenderRequest {
  return {
    fullAudio: "base64-audio",
    narration: {
      mode: "singleAudio",
      fullAudio: "base64-audio",
    },
    durationMs: 1_000,
    frameDurationsSec: [1],
    visuals: {
      slides: [{ title: "첫 장", text: "본문", lines: ["본문"], layout: "photo+body" }],
      branding: {
        headerTitle: "헤더",
        headerAccentText: "강조",
        headerColor: "#111111",
        footerColor: "#222222",
        infoLineText: "정보",
        fontFamily: "sans-serif",
        imageRounded: true,
      },
    },
    asset: {
      title: "렌더 결과",
      studioSnapshot: {
        version: 2,
        renderStage: "final",
        createdAtMs,
        draft: { workName },
      },
    },
  };
}

test("studio render job fingerprint ignores only the snapshot creation timestamp", () => {
  const first = toStudioRenderJobFingerprint(createPayload(100));
  const second = toStudioRenderJobFingerprint(createPayload(200));

  assert.equal(first, second);
});

test("studio render job fingerprint changes when the snapshot editing state changes", () => {
  const first = toStudioRenderJobFingerprint(createPayload(100, "첫 편집 상태"));
  const second = toStudioRenderJobFingerprint(createPayload(200, "다른 편집 상태"));

  assert.notEqual(first, second);
});

test("completed render job retries only the missing snapshot without rerendering", async () => {
  const payload = createPayload(100);
  const writes: Array<{ userId: string; assetId: string }> = [];
  const updates: Array<{ jobId: string; studioSnapshotSaved?: boolean }> = [];
  const retried = await retryCompletedStudioRenderJobSnapshot(
    "user-1",
    {
      id: "job-1",
      renderer: "server_native",
      status: "completed",
      createdAtMs: 1,
      updatedAtMs: 2,
      uploadedAssetId: "asset-1",
      uploadedAssetUrl: "https://cdn.example.com/rendered.mp4",
      studioSnapshotSaved: false,
    },
    payload,
    {
      completeStudioAssetSnapshot: ({ snapshot, assetUrl }) => ({
        ...(snapshot || {}),
        draft: {
          ...(snapshot?.draft || {}),
          videoUrl: assetUrl,
          uploadedVideoUrl: assetUrl,
        },
      }),
      setVideoAssetStudioSnapshot: async ({ userId, assetId }) => {
        writes.push({ userId, assetId });
      },
      updateStudioRenderJob: async (_userId, jobId, patch) => {
        updates.push({ jobId, studioSnapshotSaved: patch.studioSnapshotSaved });
        return {
          id: jobId,
          renderer: "server_native",
          status: "completed",
          createdAtMs: 1,
          updatedAtMs: 3,
          uploadedAssetId: "asset-1",
          uploadedAssetUrl: "https://cdn.example.com/rendered.mp4",
          studioSnapshotSaved: true,
        };
      },
    }
  );

  assert.deepEqual(writes, [{ userId: "user-1", assetId: "asset-1" }]);
  assert.deepEqual(updates, [{ jobId: "job-1", studioSnapshotSaved: true }]);
  assert.equal(retried.studioSnapshotSaved, true);
});

test("completed render job snapshot retry keeps the reusable asset on another storage failure", async () => {
  const original = {
    id: "job-1",
    renderer: "server_native" as const,
    status: "completed" as const,
    createdAtMs: 1,
    updatedAtMs: 2,
    uploadedAssetId: "asset-1",
    uploadedAssetUrl: "https://cdn.example.com/rendered.mp4",
    studioSnapshotSaved: false,
  };
  const retried = await retryCompletedStudioRenderJobSnapshot("user-1", original, createPayload(100), {
    completeStudioAssetSnapshot: ({ snapshot }) => snapshot || null,
    setVideoAssetStudioSnapshot: async () => {
      throw new Error("temporary store failure");
    },
    updateStudioRenderJob: async () => {
      throw new Error("must not update after a failed snapshot write");
    },
  });

  assert.equal(retried, original);
  assert.equal(retried.studioSnapshotSaved, false);
});

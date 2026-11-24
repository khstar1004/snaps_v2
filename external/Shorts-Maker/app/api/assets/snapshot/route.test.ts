import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createValidatedHeaders } from "../../test-helpers";
import { defaultAssetSnapshotRouteDependencies, handleAssetSnapshotGet } from "./route";

function createRequest() {
  return new NextRequest("http://localhost:3011/api/assets/snapshot?assetId=asset-1", {
    headers: createValidatedHeaders(),
  });
}

function createDependencies(
  overrides?: Partial<NonNullable<Parameters<typeof handleAssetSnapshotGet>[1]>>
) {
  return {
    ...defaultAssetSnapshotRouteDependencies,
    getVideoAsset: async () => ({
      id: "asset-1",
      userId: "auth-user",
      title: "렌더 자산",
      url: "https://cdn.example.com/rendered.mp4",
      publishCategory: "news",
      sizeBytes: 1,
      mimeType: "video/mp4",
      createdAt: 1,
    }),
    ...overrides,
  };
}

test("asset snapshot route requires edit permission instead of view-only access", async () => {
  let snapshotReads = 0;
  const response = await handleAssetSnapshotGet(
    createRequest(),
    createDependencies({
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "view",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      getVideoAssetStudioSnapshot: async () => {
        snapshotReads += 1;
        return { version: 2, renderStage: "final", draft: { scriptText: "비공개 대본" } };
      },
    })
  );

  assert.equal(response.status, 403);
  assert.equal(snapshotReads, 0);
});

test("asset snapshot route returns the owned category with an editable snapshot", async () => {
  const response = await handleAssetSnapshotGet(
    createRequest(),
    createDependencies({
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "edit",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      getVideoAssetStudioSnapshot: async () => ({
        version: 2,
        renderStage: "final",
        draft: { scriptText: "복원 대본" },
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    asset: {
      id: "asset-1",
      title: "렌더 자산",
      url: "https://cdn.example.com/rendered.mp4",
      publishCategory: "news",
    },
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: { scriptText: "복원 대본" },
    },
  });
});

test("asset snapshot route rebases local-storage asset and snapshot URLs to the current request origin", async () => {
  const response = await handleAssetSnapshotGet(
    createRequest(),
    createDependencies({
      getCategoryAccessScope: async () => ({
        accessMode: "all",
        allAccessLevel: "edit",
        hasRestrictions: false,
        allowedCategories: null,
        allowedCategorySet: null,
        categoryPermissions: new Map(),
      }),
      getVideoAsset: async () => ({
        id: "asset-1",
        userId: "auth-user",
        title: "로컬 렌더",
        url: "http://localhost:3000/api/local-storage/video-assets/final.mp4",
        publishCategory: "news",
        sizeBytes: 1,
        mimeType: "video/mp4",
        storageBucket: "video-assets",
        storagePath: "final.mp4",
        createdAt: 1,
      }),
      getVideoAssetStudioSnapshot: async () => ({
        version: 2,
        renderStage: "final",
        draft: {
          videoUrl: "http://localhost:3000/api/local-storage/video-assets/final.mp4",
          uploadedVideoUrl: "/api/local-storage/video-assets/final.mp4",
          slides: [
            {
              title: "장면",
              text: "본문",
              lines: ["본문"],
              layout: "photo+body",
              imageUrl: "http://localhost:3000/api/local-storage/images/slide-1.png",
              sourceUrl: "https://cdn.example.com/api/local-storage/images/slide-1.png",
            },
          ],
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    asset: {
      id: "asset-1",
      title: "로컬 렌더",
      url: "http://localhost:3011/api/local-storage/video-assets/final.mp4",
      publishCategory: "news",
    },
    snapshot: {
      version: 2,
      renderStage: "final",
      draft: {
        videoUrl: "http://localhost:3011/api/local-storage/video-assets/final.mp4",
        uploadedVideoUrl: "http://localhost:3011/api/local-storage/video-assets/final.mp4",
        slides: [
          {
            title: "장면",
            text: "본문",
            lines: ["본문"],
            layout: "photo+body",
            imageUrl: "http://localhost:3011/api/local-storage/images/slide-1.png",
            sourceUrl: "https://cdn.example.com/api/local-storage/images/slide-1.png",
          },
        ],
      },
    },
  });
});

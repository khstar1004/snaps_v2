import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createValidatedHeaders } from "../../test-helpers";
import { defaultAssetsLatestRouteDependencies, handleAssetsLatestGet } from "./route";

function createRequest() {
  return new NextRequest("http://localhost:3011/api/assets/latest", {
    headers: createValidatedHeaders(),
  });
}

function createDependencies(
  overrides?: Partial<NonNullable<Parameters<typeof handleAssetsLatestGet>[1]>>
) {
  return {
    ...defaultAssetsLatestRouteDependencies,
    getCategoryAccessScope: async () => ({
      accessMode: "all" as const,
      allAccessLevel: "edit" as const,
      hasRestrictions: false,
      allowedCategories: null,
      allowedCategorySet: null,
      categoryPermissions: new Map(),
    }),
    canManageWorkspace: () => false,
    filterCategoriesByAccess: <T>(items: T[]) => items,
    backfillVideoAssetCategoriesFromJobs: async () => ({ scanned: 0, updated: 0 }),
    ...overrides,
  };
}

test("assets latest route rebases local-storage asset URLs to the current request origin", async () => {
  const response = await handleAssetsLatestGet(
    createRequest(),
    createDependencies({
      getLatestVideoAsset: async () => ({
        id: "asset-local",
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
      listVideoAssets: async () => [
        {
          id: "asset-local",
          userId: "auth-user",
          title: "로컬 렌더",
          url: "/api/local-storage/video-assets/final.mp4",
          publishCategory: "news",
          sizeBytes: 1,
          mimeType: "video/mp4",
          storageBucket: "video-assets",
          storagePath: "final.mp4",
          createdAt: 1,
        },
        {
          id: "asset-cdn",
          userId: "auth-user",
          title: "외부 렌더",
          url: "https://cdn.example.com/final.mp4",
          publishCategory: "news",
          sizeBytes: 1,
          mimeType: "video/mp4",
          createdAt: 2,
        },
        {
          id: "asset-other-service",
          userId: "auth-user",
          title: "다른 서비스",
          url: "http://localhost:3000/other-service/final.mp4",
          publishCategory: "news",
          sizeBytes: 1,
          mimeType: "video/mp4",
          createdAt: 3,
        },
      ],
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.latest.url, "http://localhost:3011/api/local-storage/video-assets/final.mp4");
  assert.equal(body.items[0].url, "http://localhost:3011/api/local-storage/video-assets/final.mp4");
  assert.equal(body.items[1].url, "https://cdn.example.com/final.mp4");
  assert.equal(body.items[2].url, "http://localhost:3000/other-service/final.mp4");
});

import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createValidatedHeaders } from "../../test-helpers";
import { defaultAssetsDownloadRouteDependencies, handleAssetsDownloadGet } from "./route";

const LOCAL_ASSET_URL = "http://localhost:4100/api/local-storage/video-assets/shorts/final.mp4";

function createRequest(url: string, fileName = "최종 영상.mp4") {
  const target = new URL("http://localhost:4100/api/assets/download");
  target.searchParams.set("url", url);
  target.searchParams.set("filename", fileName);
  return new NextRequest(target, { headers: createValidatedHeaders() });
}

function createDependencies(
  overrides?: Partial<NonNullable<Parameters<typeof handleAssetsDownloadGet>[1]>>
) {
  return {
    ...defaultAssetsDownloadRouteDependencies,
    hasLocalStorageConfig: () => true,
    getLocalStorageFilePath: (bucket: string, path: string) => `D:/storage/${bucket}/${path}`,
    createLocalStorageReadStream: ((): unknown => "local-bytes") as unknown as typeof defaultAssetsDownloadRouteDependencies.createLocalStorageReadStream,
    statLocalFile: async () => ({ size: 3863270, isFile: true }),
    fetchWithRedirectValidation: (async () => {
      throw new Error("unsupported port");
    }) as unknown as typeof defaultAssetsDownloadRouteDependencies.fetchWithRedirectValidation,
    ...overrides,
  };
}

test("assets download route streams local-storage assets from disk instead of refetching over http", async () => {
  let guardCalls = 0;
  const response = await handleAssetsDownloadGet(
    createRequest(LOCAL_ASSET_URL),
    createDependencies({
      fetchWithRedirectValidation: (async () => {
        guardCalls += 1;
        throw new Error("unsupported port");
      }) as unknown as typeof defaultAssetsDownloadRouteDependencies.fetchWithRedirectValidation,
    })
  );

  assert.equal(response.status, 200);
  assert.equal(guardCalls, 0);
  assert.equal(response.headers.get("Content-Type"), "video/mp4");
  assert.equal(response.headers.get("Content-Length"), "3863270");
  assert.equal(
    response.headers.get("Content-Disposition"),
    `attachment; filename*=UTF-8''${encodeURIComponent("최종 영상.mp4")}`
  );
});

test("assets download route serves local-storage assets whose stored origin is stale", async () => {
  const response = await handleAssetsDownloadGet(
    createRequest("http://localhost:3000/api/local-storage/video-assets/shorts/final.mp4"),
    createDependencies()
  );

  assert.equal(response.status, 200);
});

test("assets download route reports a missing local file as not found", async () => {
  const response = await handleAssetsDownloadGet(
    createRequest(LOCAL_ASSET_URL),
    createDependencies({ statLocalFile: async () => null })
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.errorCode, "ASSET_DOWNLOAD_NOT_FOUND");
});

test("assets download route rejects a local path that escapes the storage root", async () => {
  const response = await handleAssetsDownloadGet(
    createRequest(LOCAL_ASSET_URL),
    createDependencies({
      getLocalStorageFilePath: () => {
        throw new Error("local storage path escaped storage root");
      },
    })
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.errorCode, "ASSET_DOWNLOAD_URL_INVALID");
});

test("assets download route still proxies remote assets through the redirect guard", async () => {
  let guardCalls = 0;
  const response = await handleAssetsDownloadGet(
    createRequest("https://cdn.example.com/video-assets/final.mp4"),
    createDependencies({
      fetchWithRedirectValidation: (async () => {
        guardCalls += 1;
        return {
          ok: true,
          status: 200,
          body: "remote-bytes",
          headers: new Headers({ "content-type": "video/mp4", "content-length": "128" }),
        };
      }) as unknown as typeof defaultAssetsDownloadRouteDependencies.fetchWithRedirectValidation,
    })
  );

  assert.equal(guardCalls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), "128");
});

test("assets download route falls back to the guard when local storage is not configured", async () => {
  let guardCalls = 0;
  const response = await handleAssetsDownloadGet(
    createRequest(LOCAL_ASSET_URL),
    createDependencies({
      hasLocalStorageConfig: () => false,
      fetchWithRedirectValidation: (async () => {
        guardCalls += 1;
        throw new Error("unsupported port");
      }) as unknown as typeof defaultAssetsDownloadRouteDependencies.fetchWithRedirectValidation,
    })
  );

  assert.equal(guardCalls, 1);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.errorCode, "ASSET_DOWNLOAD_URL_UNSUPPORTED");
});

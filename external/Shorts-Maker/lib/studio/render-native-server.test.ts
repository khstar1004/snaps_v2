import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyServerNativeRenderFailure,
  loadRequiredStudioBgmAsset,
  resolveServerNativeBgmRequest,
} from "./render-native-server";

test("resolveServerNativeBgmRequest keeps optional audio options backward-compatible", () => {
  assert.deepEqual(resolveServerNativeBgmRequest(undefined), { bgmEnabled: false, bgmPath: "" });
  assert.deepEqual(resolveServerNativeBgmRequest({ playbackRate: 1.2 }), { bgmEnabled: false, bgmPath: "" });
  assert.deepEqual(resolveServerNativeBgmRequest({ bgmPath: "/bgm/track.mp3" }), {
    bgmEnabled: true,
    bgmPath: "/bgm/track.mp3",
  });
  assert.deepEqual(resolveServerNativeBgmRequest({ bgmEnabled: true, bgmPath: "  " }), {
    bgmEnabled: true,
    bgmPath: "",
  });
});

test("loadRequiredStudioBgmAsset returns non-empty BGM bytes", async () => {
  const paths: Array<{ pathOrUrl: string; baseUrl: string }> = [];
  const bytes = await loadRequiredStudioBgmAsset(
    "/bgm/track.mp3",
    "http://localhost:3000",
    async (pathOrUrl, baseUrl) => {
      paths.push({ pathOrUrl, baseUrl });
      return Buffer.from("bgm");
    }
  );

  assert.equal(bytes.toString(), "bgm");
  assert.deepEqual(paths, [{ pathOrUrl: "/bgm/track.mp3", baseUrl: "http://localhost:3000" }]);
});

test("loadRequiredStudioBgmAsset rejects missing, empty, and unreadable BGM assets", async () => {
  await assert.rejects(
    () => loadRequiredStudioBgmAsset("  ", "http://localhost", async () => Buffer.from("ignored")),
    /BGM_ASSET_UNAVAILABLE: BGM 경로가 비어 있습니다\./
  );
  await assert.rejects(
    () => loadRequiredStudioBgmAsset("/bgm/empty.mp3", "http://localhost", async () => Buffer.alloc(0)),
    /BGM_ASSET_UNAVAILABLE: BGM 파일을 불러올 수 없습니다\./
  );
  await assert.rejects(
    () =>
      loadRequiredStudioBgmAsset("/bgm/missing.mp3", "http://localhost", async () => {
        throw new Error("ASSET_FETCH_FAILED: 404");
      }),
    /BGM_ASSET_UNAVAILABLE: BGM 파일을 불러올 수 없습니다\..*ASSET_FETCH_FAILED: 404/
  );
});

test("loadRequiredStudioBgmAsset retries a recovered URL after an empty response", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(requestCount === 1 ? new Uint8Array() : new Uint8Array([1, 2, 3]), { status: 200 });
  };
  try {
    await assert.rejects(
      () => loadRequiredStudioBgmAsset("/bgm/cache-recovery.mp3", "http://bgm-cache.test"),
      /BGM_ASSET_UNAVAILABLE/
    );
    const recovered = await loadRequiredStudioBgmAsset("/bgm/cache-recovery.mp3", "http://bgm-cache.test");

    assert.deepEqual([...recovered], [1, 2, 3]);
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("classifyServerNativeRenderFailure preserves required audio asset failures as non-retryable", () => {
  assert.deepEqual(classifyServerNativeRenderFailure("BGM_ASSET_UNAVAILABLE: missing"), {
    errorCode: "BGM_ASSET_UNAVAILABLE",
    retryable: false,
  });
  assert.deepEqual(classifyServerNativeRenderFailure("render TIMEOUT"), {
    errorCode: "TIMEOUT",
    retryable: true,
  });
  assert.deepEqual(classifyServerNativeRenderFailure("[SFX_ASSET_UNAVAILABLE] missing"), {
    errorCode: "SFX_ASSET_UNAVAILABLE",
    retryable: false,
  });
});

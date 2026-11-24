import test from "node:test";
import assert from "node:assert/strict";
import { classifyRenderError } from "./render-errors";
import {
  loadRequiredStudioSfxAsset,
  loadRequiredStudioSfxAssets,
  resolveRequiredStudioSfxExtension,
} from "./required-sfx-asset";

test("resolveRequiredStudioSfxExtension accepts supported audio paths with query strings", () => {
  assert.equal(resolveRequiredStudioSfxExtension("/sfx/impact.MP3?v=1#cue"), ".mp3");
  assert.equal(resolveRequiredStudioSfxExtension("/sfx/impact.wav"), ".wav");
  assert.equal(resolveRequiredStudioSfxExtension("/sfx/impact.ogg"), ".ogg");
  assert.equal(resolveRequiredStudioSfxExtension("/sfx/transition.m4a"), ".m4a");
  assert.equal(resolveRequiredStudioSfxExtension("/sfx/transition.M4A?v=1#cue"), ".m4a");
});

test("loadRequiredStudioSfxAsset returns bytes and rejects unusable assets", async () => {
  const loaded = await loadRequiredStudioSfxAsset(" /sfx/impact.mp3 ", async () => new Uint8Array([1, 2]));
  assert.deepEqual(loaded, {
    path: "/sfx/impact.mp3",
    extension: ".mp3",
    bytes: new Uint8Array([1, 2]),
  });

  const loadedM4a = await loadRequiredStudioSfxAsset(" /sfx/transition.M4A?v=1#cue ", async () =>
    new Uint8Array([3, 4])
  );
  assert.deepEqual(loadedM4a, {
    path: "/sfx/transition.M4A?v=1#cue",
    extension: ".m4a",
    bytes: new Uint8Array([3, 4]),
  });

  await assert.rejects(
    () => loadRequiredStudioSfxAsset("/sfx/impact.txt", async () => new Uint8Array([1])),
    /SFX_ASSET_UNAVAILABLE.*지원하지 않는 효과음 파일 형식/
  );
  await assert.rejects(
    () => loadRequiredStudioSfxAsset("/sfx/empty.mp3", async () => new Uint8Array()),
    /SFX_ASSET_UNAVAILABLE.*효과음 파일을 불러올 수 없습니다/
  );
  await assert.rejects(
    () =>
      loadRequiredStudioSfxAsset("/sfx/missing.mp3", async () => {
        throw new Error("ASSET_FETCH_FAILED: 404");
      }),
    /SFX_ASSET_UNAVAILABLE.*ASSET_FETCH_FAILED: 404/
  );
});

test("classifyRenderError keeps required SFX failures explicit and non-retryable", () => {
  assert.deepEqual(classifyRenderError(new Error("[SFX_ASSET_UNAVAILABLE] missing")), {
    code: "SFX_ASSET_UNAVAILABLE",
    message: "missing",
    retryable: false,
  });
});

test("loadRequiredStudioSfxAssets preserves cue order and bounds concurrent fetches", async () => {
  let active = 0;
  let maxActive = 0;
  const cues = Array.from({ length: 6 }, (_, index) => ({ path: `/sfx/${index}.mp3`, startSec: index }));
  const loaded = await loadRequiredStudioSfxAssets(
    cues,
    async (path) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new TextEncoder().encode(path);
    },
    2
  );

  assert.equal(maxActive, 2);
  assert.deepEqual(
    loaded.map(({ path, startSec, extension }) => ({ path, startSec, extension })),
    cues.map(({ path, startSec }) => ({ path, startSec, extension: ".mp3" }))
  );
});

test("loadRequiredStudioSfxAssets rejects an enabled cue with an empty catalog path", async () => {
  await assert.rejects(
    () => loadRequiredStudioSfxAssets([{ path: "", startSec: 0 }], async () => new Uint8Array([1])),
    /SFX_ASSET_UNAVAILABLE.*효과음 경로가 비어 있습니다/
  );
});

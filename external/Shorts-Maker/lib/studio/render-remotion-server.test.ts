import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { StudioNativeRenderRequest } from "@/types/studio-renderer";
import { __renderRemotionServerTestInternals } from "./render-remotion-server";

const TEST_BRANDING = {
  headerTitle: "Test",
  headerAccentText: "Accent",
  headerColor: "#111111",
  footerColor: "#222222",
  infoLineText: "Info",
  fontFamily: "Arial",
  imageRounded: true,
};

function makeRequest(overrides?: Partial<StudioNativeRenderRequest>): StudioNativeRenderRequest {
  return {
    fullAudio: "",
    durationMs: 1000,
    frameDurationsSec: [1],
    visuals: {
      slides: [
        {
          title: "Private slide",
          text: "Private slide body",
          lines: ["Private slide body"],
          layout: "photo+body",
        },
      ],
      branding: TEST_BRANDING,
    },
    ...overrides,
  } as StudioNativeRenderRequest;
}

function decodeDataUrlText(value: string): string {
  const [, base64 = ""] = value.split(",", 2);
  return Buffer.from(base64, "base64").toString("utf8");
}

test("toCompositionProps falls back before fetching private slide and template image URLs", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("private URL should be blocked before fetch");
  }) as typeof fetch;
  try {
    const props = await __renderRemotionServerTestInternals.toCompositionProps(
      makeRequest({
        visuals: {
          slides: [
            {
              title: "Private slide",
              text: "Private slide body",
              lines: ["Private slide body"],
              layout: "photo+body",
              imageUrl: "http://127.0.0.1/private-slide.png",
            },
          ],
          branding: TEST_BRANDING,
          templateImageEnabled: true,
          templateImageUrl: "http://127.0.0.1/private-template.png",
        },
      }),
      "http://localhost:3000"
    );

    assert.equal(fetchCalls, 0);
    assert.match(props.slides[0]?.imageUrl || "", /^data:image\/svg\+xml;base64,/);
    assert.match(decodeDataUrlText(props.slides[0]?.imageUrl || ""), /IMAGE UNAVAILABLE/);
    assert.match(props.templateImageUrl || "", /^data:image\/svg\+xml;base64,/);
    assert.match(decodeDataUrlText(props.templateImageUrl || ""), /Template background/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("toCompositionProps materializes video and animated media instead of exposing private URLs to Remotion", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("private media URL should be blocked before fetch");
  }) as typeof fetch;
  try {
    const props = await __renderRemotionServerTestInternals.toCompositionProps(
      makeRequest({
        frameDurationsSec: [1, 1],
        visuals: {
          slides: [
            {
              title: "Private video",
              text: "Private video body",
              lines: ["Private video body"],
              layout: "photo+body",
              mediaKind: "video",
              mediaUrl: "http://127.0.0.1/private.mp4",
            },
            {
              title: "Private gif",
              text: "Private gif body",
              lines: ["Private gif body"],
              layout: "photo+body",
              mediaKind: "animated_image",
              imageUrl: "http://127.0.0.1/private.gif",
            },
          ],
          branding: TEST_BRANDING,
        },
      }),
      "http://localhost:3000"
    );

    assert.equal(fetchCalls, 0);
    for (const slide of props.slides) {
      assert.equal(slide.mediaKind, "image");
      assert.equal(slide.mediaUrl, undefined);
      assert.match(slide.imageUrl || "", /^data:image\/svg\+xml;base64,/);
      assert.doesNotMatch(slide.imageUrl || "", /127\.0\.0\.1/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed still-image fallbacks are label-specific and are not retained in the shared cache", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const privateUrl = "http://127.0.0.1/shared-private.png";
  const first = await __renderRemotionServerTestInternals.transcodeStillImageToDataUrl(privateUrl, "First private title");
  const second = await __renderRemotionServerTestInternals.transcodeStillImageToDataUrl(privateUrl, "Second private title");

  assert.match(decodeDataUrlText(first), /First private title/);
  assert.doesNotMatch(decodeDataUrlText(first), /Second private title/);
  assert.match(decodeDataUrlText(second), /Second private title/);
  assert.doesNotMatch(decodeDataUrlText(second), /First private title/);
  assert.equal(__renderRemotionServerTestInternals.getPreparedStillImageCacheSize(), 0);
});

test("proxy error responses are cancelled before Remotion falls back", async () => {
  let cancelled = false;
  const target = encodeURIComponent("https://93.184.216.34/missing.png");
  const fetchRemote = (async () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 404, headers: { "content-type": "image/png" } }
    )) as Parameters<typeof __renderRemotionServerTestInternals.fetchStillImageSource>[2];

  await assert.rejects(
    __renderRemotionServerTestInternals.fetchStillImageSource(
      `/api/studio/image-proxy?url=${target}`,
      100,
      fetchRemote
    ),
    /HTTP_404/
  );
  assert.equal(cancelled, true);
});

test("toCompositionProps keeps trusted local-storage still images on the non-network path", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const originalEnv = {
    LOCAL_STORAGE_ENABLE_IN_TESTS: process.env.LOCAL_STORAGE_ENABLE_IN_TESTS,
    LOCAL_STORAGE_PUBLIC_BASE_URL: process.env.LOCAL_STORAGE_PUBLIC_BASE_URL,
    LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
  };
  const storageRoot = await mkdtemp(join(tmpdir(), "remotion-local-storage-"));
  const imagePath = join(storageRoot, "video-assets", "templates", "bg.svg");
  await mkdir(join(storageRoot, "video-assets", "templates"), { recursive: true });
  await writeFile(
    imagePath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>trusted-local-storage</text></svg>`
  );

  process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = "1";
  process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = "http://localhost:3000";
  process.env.LOCAL_STORAGE_ROOT = storageRoot;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("local-storage image should not use network fetch");
  }) as typeof fetch;
  try {
    const props = await __renderRemotionServerTestInternals.toCompositionProps(
      makeRequest({
        visuals: {
          slides: [
            {
              title: "Local slide",
              text: "Local slide body",
              lines: ["Local slide body"],
              layout: "photo+body",
              imageUrl: "/api/local-storage/video-assets/templates/bg.svg",
            },
          ],
          branding: TEST_BRANDING,
          templateImageEnabled: true,
          templateImageUrl: "/api/local-storage/video-assets/templates/bg.svg",
        },
      }),
      "http://localhost:3000"
    );

    assert.match(props.slides[0]?.imageUrl || "", /^data:image\/svg\+xml;base64,/);
    assert.match(decodeDataUrlText(props.slides[0]?.imageUrl || ""), /trusted-local-storage/);
    assert.match(props.templateImageUrl || "", /^data:image\/svg\+xml;base64,/);
    assert.match(decodeDataUrlText(props.templateImageUrl || ""), /trusted-local-storage/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = originalEnv.LOCAL_STORAGE_ENABLE_IN_TESTS;
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = originalEnv.LOCAL_STORAGE_PUBLIC_BASE_URL;
    process.env.LOCAL_STORAGE_ROOT = originalEnv.LOCAL_STORAGE_ROOT;
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("toCompositionProps falls back when local-storage still image exceeds the render fetch limit", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const originalEnv = {
    LOCAL_STORAGE_ENABLE_IN_TESTS: process.env.LOCAL_STORAGE_ENABLE_IN_TESTS,
    LOCAL_STORAGE_PUBLIC_BASE_URL: process.env.LOCAL_STORAGE_PUBLIC_BASE_URL,
    LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
  };
  const storageRoot = await mkdtemp(join(tmpdir(), "remotion-large-local-storage-"));
  const imagePath = join(storageRoot, "video-assets", "templates", "large.svg");
  await mkdir(join(storageRoot, "video-assets", "templates"), { recursive: true });
  await writeFile(imagePath, Buffer.alloc(12 * 1024 * 1024 + 1));

  process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = "1";
  process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = "http://localhost:3000";
  process.env.LOCAL_STORAGE_ROOT = storageRoot;

  try {
    const props = await __renderRemotionServerTestInternals.toCompositionProps(
      makeRequest({
        visuals: {
          slides: [
            {
              title: "Large slide",
              text: "Large slide body",
              lines: ["Large slide body"],
              layout: "photo+body",
              imageUrl: "/api/local-storage/video-assets/templates/large.svg",
            },
          ],
          branding: TEST_BRANDING,
        },
      }),
      "http://localhost:3000"
    );

    assert.match(props.slides[0]?.imageUrl || "", /^data:image\/svg\+xml;base64,/);
    assert.match(decodeDataUrlText(props.slides[0]?.imageUrl || ""), /IMAGE UNAVAILABLE/);
  } finally {
    process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = originalEnv.LOCAL_STORAGE_ENABLE_IN_TESTS;
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = originalEnv.LOCAL_STORAGE_PUBLIC_BASE_URL;
    process.env.LOCAL_STORAGE_ROOT = originalEnv.LOCAL_STORAGE_ROOT;
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("toCompositionProps forwards audioOptions.playbackRate into the composition props", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const props = await __renderRemotionServerTestInternals.toCompositionProps(
    makeRequest({
      audioOptions: {
        playbackRate: 1.75,
      },
    }),
    "http://localhost:3000"
  );

  assert.equal(props.playbackRate, 1.75);
});

test("prepared still-image cache evicts old successful entries", async () => {
  __renderRemotionServerTestInternals.clearPreparedStillImageCache();
  const originalEnv = {
    LOCAL_STORAGE_ENABLE_IN_TESTS: process.env.LOCAL_STORAGE_ENABLE_IN_TESTS,
    LOCAL_STORAGE_PUBLIC_BASE_URL: process.env.LOCAL_STORAGE_PUBLIC_BASE_URL,
    LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT,
  };
  const storageRoot = await mkdtemp(join(tmpdir(), "remotion-cache-bound-"));
  await mkdir(join(storageRoot, "video-assets", "cache"), { recursive: true });
  for (let index = 0; index < 6; index += 1) {
    await writeFile(
      join(storageRoot, "video-assets", "cache", `${index}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>${index}</text></svg>`
    );
  }

  process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = "1";
  process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = "http://localhost:3000";
  process.env.LOCAL_STORAGE_ROOT = storageRoot;
  try {
    for (let index = 0; index < 6; index += 1) {
      const result = await __renderRemotionServerTestInternals.transcodeStillImageToDataUrl(
        `/api/local-storage/video-assets/cache/${index}.svg`,
        `Cache ${index}`
      );
      assert.match(result, /^data:image\/svg\+xml;base64,/);
    }
    assert.equal(__renderRemotionServerTestInternals.getPreparedStillImageCacheSize(), 4);
  } finally {
    process.env.LOCAL_STORAGE_ENABLE_IN_TESTS = originalEnv.LOCAL_STORAGE_ENABLE_IN_TESTS;
    process.env.LOCAL_STORAGE_PUBLIC_BASE_URL = originalEnv.LOCAL_STORAGE_PUBLIC_BASE_URL;
    process.env.LOCAL_STORAGE_ROOT = originalEnv.LOCAL_STORAGE_ROOT;
    await rm(storageRoot, { recursive: true, force: true });
  }
});

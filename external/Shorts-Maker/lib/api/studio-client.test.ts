import test from "node:test";
import assert from "node:assert/strict";
import { __internal, refreshStudioCategoryMetadata } from "./studio-client";

test("refreshStudioCategoryMetadata bypasses the cached category metadata request", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInput = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        ok: true,
        metadata: {
          description: "최신 프로필",
          tags: [],
          ttsVoiceId: "",
          bgmTrackId: "",
          templateNotes: "",
          fixedCharacterProfiles: [
            { characterId: "hero", identityPrompt: "최신 외형" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const response = await refreshStudioCategoryMetadata("alpha");
    assert.equal(response.metadata?.fixedCharacterProfiles?.[0]?.characterId, "hero");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const requestUrl = new URL(capturedInput, "http://localhost");
  assert.equal(requestUrl.pathname, "/api/publish/category-metadata");
  assert.equal(requestUrl.searchParams.get("category"), "alpha");
  assert.equal(requestUrl.searchParams.get("templateId"), "default");
  assert.ok(requestUrl.searchParams.get("refresh"));
  assert.equal(capturedInit?.cache, "no-store");
});

test("buildStudioPreparePayload preserves project profile snapshot", () => {
  const payload = __internal.buildStudioPreparePayload({
    parsed: {
      title: "상위 제목",
      slides: [{ text: "본문", lines: ["본문"] }],
    },
    publishCategory: "alpha",
    projectProfileSnapshot: {
      version: 1,
      projectId: "project-1",
      createdAt: "2026-07-20T00:00:00.000Z",
      contentProfile: {
        category: "alpha",
        label: "Alpha",
        metadataSnapshot: {
          description: "snapshot",
          tags: [],
          ttsVoiceId: "",
          bgmEnabled: true,
          bgmTrackId: "bgm",
          mixPresetId: "mix",
          sfxEnabled: true,
          sfxMasterGainDb: 2,
          templateNotes: "",
          topicToScriptPrompt: "snapshot topic",
          scriptToJsonPrompt: "snapshot script",
        },
      },
    },
    imageSource: "crawl-only",
    crawlMode: "auto",
  });

  assert.deepEqual(payload.projectProfileSnapshot, {
    version: 1,
    projectId: "project-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category: "alpha",
      label: "Alpha",
      metadataSnapshot: {
        description: "snapshot",
        tags: [],
        ttsVoiceId: "",
        bgmEnabled: true,
        bgmTrackId: "bgm",
        mixPresetId: "mix",
        sfxEnabled: true,
        sfxMasterGainDb: 2,
        templateNotes: "",
        topicToScriptPrompt: "snapshot topic",
        scriptToJsonPrompt: "snapshot script",
      },
    },
  });
});

test("buildStudioPreparePayload isolates image settings by mode and fixed character selection", () => {
  const parsed = {
    slides: [{ text: "본문", lines: ["본문"] }],
    fixedCharacterProfileId: "deleted-character",
    imageStylePrompt: "soft watercolor",
    characterProfiles: [{ characterId: "hero", identityPrompt: "navy jacket" }],
  };
  const automatic = __internal.buildStudioPreparePayload({
    parsed,
    publishCategory: "alpha",
    imageSource: "auto-ai-generate",
    crawlMode: "auto",
  });
  const manual = __internal.buildStudioPreparePayload({
    parsed,
    publishCategory: "alpha",
    imageSource: "manual-ai-prompt",
    crawlMode: "auto",
  });
  const crawl = __internal.buildStudioPreparePayload({
    parsed,
    publishCategory: "alpha",
    imageSource: "crawl-only",
    crawlMode: "auto",
  });

  assert.equal(automatic.imageStylePrompt, "soft watercolor");
  assert.deepEqual(automatic.characterProfiles, parsed.characterProfiles);
  assert.equal(manual.imageStylePrompt, "soft watercolor");
  assert.equal(Object.prototype.hasOwnProperty.call(manual, "characterProfiles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(crawl, "imageStylePrompt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(crawl, "characterProfiles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(crawl, "fixedCharacterProfileId"), false);

  for (const imageSource of ["manual-ai-prompt", "auto-ai-generate"] as const) {
    const selected = __internal.buildStudioPreparePayload({
      parsed,
      publishCategory: "alpha",
      fixedCharacterProfileId: "saved-character",
      imageSource,
      crawlMode: "auto",
    });
    assert.equal(selected.fixedCharacterProfileId, "saved-character");
    assert.equal(Object.prototype.hasOwnProperty.call(selected, "imageStylePrompt"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(selected, "characterProfiles"), false);
  }
});

test("sanitizeSlidesForPrepareResolve strips forbidden fields while preserving media provenance", () => {
  const sanitized = __internal.sanitizeSlidesForPrepareResolve({
    title: "상위 제목",
    slides: [
      {
        title: "슬라이드 제목",
        layout: "photo+body",
        text: "본문",
        lines: ["본문"],
        imageRequest: {
          query: "서류 사진",
          preferredProviders: ["naver"],
        },
        manualImagePrompt: {
          source: "codex",
          mascotName: "브리피",
          basePrompt: "base prompt",
          scenePrompt: "scene prompt",
          finalPrompt: "final prompt",
          usesFallbackMascot: false,
        },
        resolvedImageUrl: "https://example.com/image.jpg",
        resolvedBy: "crawl",
        imageSelection: {
          provider: "naver",
          selectedQuery: "서류 사진",
        },
      },
    ],
  });

  assert.equal(sanitized.title, "상위 제목");
  assert.deepEqual(sanitized.slides, [
    {
      text: "본문",
      lines: ["본문"],
      imageRequest: {
        query: "서류 사진",
        preferredProviders: ["naver"],
      },
      manualImagePrompt: {
        source: "codex",
        mascotName: "브리피",
        basePrompt: "base prompt",
        scenePrompt: "scene prompt",
        finalPrompt: "final prompt",
        usesFallbackMascot: false,
      },
      resolvedImageUrl: "https://example.com/image.jpg",
      resolvedBy: "crawl",
      imageSelection: {
        provider: "naver",
        selectedQuery: "서류 사진",
      },
    },
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { applyImagePolicy, __internal as policyInternal } from "./policy";
import { buildProviderResolutionCacheKey } from "./provider-resolution-cache";
import { buildSelectionNoveltyHistorySignature } from "./provider-candidate-diversity";
import type { ImageProviderId } from "@/types/studio-json";

test("provider resolution cache key changes when reserved media exclusions change", () => {
  const base = {
    providers: ["giphy", "naver"] as ImageProviderId[],
    query: "놀란 표정",
    scene: "",
    mustAvoid: [] as string[],
    sort: "sim" as const,
    minScore: 12,
    intent: "meme" as const,
    crawlMode: "fun" as const,
    noFilter: false,
    excludeCandidateIds: ["giphy:aaa111"],
  };

  const first = buildProviderResolutionCacheKey({
    ...base,
    excludeUrls: ["https://media2.giphy.com/media/aaa111/giphy.gif"],
  });
  const second = buildProviderResolutionCacheKey({
    ...base,
    excludeUrls: ["https://media2.giphy.com/media/bbb222/giphy.gif"],
  });

  assert.notEqual(first, second);
});

test("provider resolution cache key changes when selection offset changes", () => {
  const base = {
    providers: ["giphy", "naver"] as ImageProviderId[],
    query: "놀란 표정",
    scene: "공문 받고 당황하는 장면",
    mustAvoid: [] as string[],
    sort: "sim" as const,
    minScore: 12,
    intent: "meme" as const,
    crawlMode: "fun" as const,
    noFilter: false,
  };

  const first = buildProviderResolutionCacheKey({
    ...base,
    selectionOffset: 0,
  });
  const second = buildProviderResolutionCacheKey({
    ...base,
    selectionOffset: 1,
  });

  assert.notEqual(first, second);
});

test("provider resolution cache key changes when recent novelty history changes", () => {
  const base = {
    providers: ["giphy", "naver"] as ImageProviderId[],
    query: "놀란 표정",
    scene: "공문 받고 당황하는 장면",
    mustAvoid: [] as string[],
    sort: "sim" as const,
    minScore: 12,
    intent: "meme" as const,
    crawlMode: "fun" as const,
    noFilter: false,
  };

  const first = buildProviderResolutionCacheKey({
    ...base,
    historySignature: "family:awkward@1",
  });
  const second = buildProviderResolutionCacheKey({
    ...base,
    historySignature: "family:shock@1",
  });

  assert.notEqual(first, second);
});

test("recent novelty history expires after the configured ttl window", () => {
  const scopeKey = policyInternal.buildRecentSelectionHistoryScopeKey({
    libraryUserScope: "tester",
    publishCategory: "news",
  });
  policyInternal.clearRecentSelectionHistory(scopeKey);

  policyInternal.rememberRecentSelectionHistory(
    scopeKey,
    {
      mediaIdentity: "giphy:first",
      sourceIdentity: "https://example.com/article/1",
      reactionFamily: "awkward",
      queryRoot: "awkward",
    },
    1_000,
    1_000
  );

  const beforeExpiry = buildSelectionNoveltyHistorySignature(policyInternal.loadRecentSelectionHistory(scopeKey, 1_200));
  const afterExpiry = buildSelectionNoveltyHistorySignature(policyInternal.loadRecentSelectionHistory(scopeKey, 2_100));

  assert.match(beforeExpiry, /awkward/);
  assert.equal(afterExpiry, "");
  policyInternal.clearRecentSelectionHistory(scopeKey);
});

test("manual direct image paths stay untouched even when recent novelty history exists", async () => {
  const scopeKey = policyInternal.buildRecentSelectionHistoryScopeKey({
    libraryUserScope: "tester",
    publishCategory: "news",
  });
  policyInternal.clearRecentSelectionHistory(scopeKey);
  policyInternal.rememberRecentSelectionHistory(scopeKey, {
    mediaIdentity: "giphy:first",
    sourceIdentity: "https://example.com/article/1",
    reactionFamily: "awkward",
    queryRoot: "awkward",
  });

  try {
    const result = await applyImagePolicy({
      videoMode: "segments",
      crawlMode: "fun",
      publishCategory: "news",
      libraryUserScope: "tester",
      imagePolicy: {
        source: "crawl-only",
        allowGenerated: false,
        fallback: "body-only",
      },
      slides: [
        {
          title: "직접 업로드",
          text: "사용자 제공 이미지",
          lines: ["사용자 제공 이미지"],
          layout: "photo+body",
          imageUrl: "https://images.example.com/direct.jpg",
        },
      ],
    });

    assert.equal(result.slides[0]?.resolvedBy, "direct");
    assert.equal(result.slides[0]?.imageSelection?.selectionReason, "manual/direct image URL");
  } finally {
    policyInternal.clearRecentSelectionHistory(scopeKey);
  }
});

test("persisted crawl provenance stays automatic when prepare receives a concrete image url", async () => {
  const result = await applyImagePolicy({
    videoMode: "segments",
    crawlMode: "auto",
    publishCategory: "news",
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: [
      {
        title: "자동 선택",
        text: "자동 이미지가 있는 장면",
        lines: ["자동 이미지가 있는 장면"],
        layout: "photo+body",
        imageUrl: "https://images.example.com/automatic.jpg",
        resolvedImageUrl: "https://images.example.com/automatic.jpg",
        resolvedBy: "crawl",
        imageSelection: {
          intent: "news",
          queryCandidates: ["automatic query"],
          provider: "naver",
          selectedCandidateId: "naver:automatic",
          selectionReason: "automatic provider selection",
        },
      },
    ],
  });

  assert.equal(result.slides[0]?.resolvedBy, "crawl");
  assert.equal(result.slides[0]?.imageSelection?.selectedCandidateId, "naver:automatic");
  assert.equal(result.slides[0]?.imageSelection?.selectionReason, "automatic provider selection");
});

test("derived provenance without selection metadata is not reclassified as a manual direct image", async () => {
  const result = await applyImagePolicy({
    videoMode: "segments",
    crawlMode: "auto",
    publishCategory: "news",
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: [
      {
        title: "레거시 자동 선택",
        text: "선택 메타데이터가 없는 자동 이미지",
        lines: ["선택 메타데이터가 없는 자동 이미지"],
        layout: "photo+body",
        imageUrl: "https://images.example.com/legacy-automatic.jpg",
        resolvedBy: "crawl",
      },
    ],
  });

  assert.equal(result.slides[0]?.resolvedBy, "crawl");
  assert.equal(result.slides[0]?.imageSelection, undefined);
});

test("explicit later image beats keep their line position and provenance through image policy", async () => {
  const result = await applyImagePolicy({
    videoMode: "segments",
    crawlMode: "auto",
    publishCategory: "news",
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: [
      {
        title: "전환 장면",
        text: "첫 줄\n둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        layout: "photo+body",
        imageUrl: "https://images.example.com/automatic.jpg",
        resolvedBy: "crawl",
        imageSelection: {
          intent: "news",
          queryCandidates: ["automatic query"],
          selectionReason: "automatic provider selection",
        },
        imageBeats: [
          {
            beatId: "manual-right",
            startLineIndex: 1,
            resolvedImageUrl: "https://images.example.com/manual.jpg",
            resolvedBy: "direct",
            imageSelection: {
              intent: "library",
              queryCandidates: [],
              selectedCandidateId: "library:manual-right",
              selectionReason: "manual library selection",
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.slides[0]?.resolvedBy, "crawl");
  assert.equal(result.slides[0]?.imageBeats?.[0]?.startLineIndex, 1);
  assert.equal(result.slides[0]?.imageBeats?.[0]?.resolvedBy, "direct");
  assert.equal(result.slides[0]?.imageBeats?.[0]?.imageSelection?.selectedCandidateId, "library:manual-right");
});

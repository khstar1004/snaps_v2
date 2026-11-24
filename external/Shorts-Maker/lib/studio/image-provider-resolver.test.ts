import test from "node:test";
import assert from "node:assert/strict";
import { hasExcludedMediaReservationMatch } from "./media-reservation";
import { mergeResolvedProviderCandidate } from "./provider-selection";
import {
  buildGiphyCandidateOptionsForReview,
  resolveImageUrlByProviders,
  selectDirectGiphyCandidate,
} from "./image-provider-resolver";
import {
  buildCandidateNoveltySignals,
  createSelectionNoveltyHistory,
  recordSelectionNovelty,
} from "./provider-candidate-diversity";

type RankedCandidate = {
  provider: "giphy" | "naver";
  providerRank: number;
  score: number;
  url: string;
};

test("finalizeOnAcceptedProvider locks in the first accepted giphy candidate", () => {
  const giphyCandidate: RankedCandidate = {
    provider: "giphy" as const,
    providerRank: 0,
    score: 4,
    url: "https://example.com/giphy.jpg",
  };

  const result = mergeResolvedProviderCandidate(null, giphyCandidate, {
    finalizeOnAcceptedProvider: "giphy",
  });

  assert.equal(result.best, giphyCandidate);
  assert.equal(result.finalized, true);
});

test("without finalizeOnAcceptedProvider a later higher-score provider can still win", () => {
  const giphyCandidate: RankedCandidate = {
    provider: "giphy" as const,
    providerRank: 0,
    score: 4,
    url: "https://example.com/giphy.jpg",
  };
  const naverCandidate: RankedCandidate = {
    provider: "naver" as const,
    providerRank: 1,
    score: 12,
    url: "https://example.com/naver.jpg",
  };

  const first = mergeResolvedProviderCandidate(null, giphyCandidate);
  const second = mergeResolvedProviderCandidate(first.best, naverCandidate);

  assert.equal(first.best, giphyCandidate);
  assert.equal(first.finalized, false);
  assert.equal(second.best, naverCandidate);
  assert.equal(second.finalized, false);
});

test("canonical media reservation matching blocks repeated giphy assets across variant urls", () => {
  const blocked = hasExcludedMediaReservationMatch(
    [
      "https://media2.giphy.com/media/abc123/200w.gif",
      "https://media2.giphy.com/media/abc123/giphy.gif?cid=test",
      "https://giphy.com/gifs/example-abc123",
    ],
    ["http://localhost:3000/api/studio/image-proxy?url=https%3A%2F%2Fmedia2.giphy.com%2Fmedia%2Fabc123%2F200w_s.gif%3Fcid%3Dtest"]
  );

  assert.equal(blocked, true);
});

test("selectDirectGiphyCandidate keeps the first non-excluded result without extra ranking", () => {
  const selected = selectDirectGiphyCandidate(
    [
      {
        provider: "giphy",
        id: "giphy:first",
        url: "https://media.giphy.com/media/first/giphy.gif",
      },
      {
        provider: "giphy",
        id: "giphy:second",
        url: "https://media.giphy.com/media/second/giphy.gif",
        width: 640,
        height: 360,
      },
    ],
    new Set(["giphy:first"]),
    new Set<string>()
  );

  assert.equal(selected?.id, "giphy:second");
});

test("giphy review options keep the original top candidates even when selection skips an excluded asset", () => {
  const candidates = [
    {
      provider: "giphy" as const,
      id: "giphy:first",
      url: "https://media.giphy.com/media/first/giphy.gif",
    },
    {
      provider: "giphy" as const,
      id: "giphy:second",
      url: "https://media.giphy.com/media/second/giphy.gif",
    },
    {
      provider: "giphy" as const,
      id: "giphy:third",
      url: "https://media.giphy.com/media/third/giphy.gif",
    },
  ];

  const candidateOptions = buildGiphyCandidateOptionsForReview(candidates);
  const selected = selectDirectGiphyCandidate(candidates, new Set(["giphy:first"]), new Set<string>());

  assert.deepEqual(candidateOptions.map((item) => item.candidateId), ["giphy:first", "giphy:second", "giphy:third"]);
  assert.equal(selected?.id, "giphy:second");
});

test("selectDirectGiphyCandidate can rotate within the top pool when a selection offset is provided", () => {
  const candidates = [
    {
      provider: "giphy" as const,
      id: "giphy:first",
      url: "https://media.giphy.com/media/first/giphy.gif",
    },
    {
      provider: "giphy" as const,
      id: "giphy:second",
      url: "https://media.giphy.com/media/second/giphy.gif",
    },
    {
      provider: "giphy" as const,
      id: "giphy:third",
      url: "https://media.giphy.com/media/third/giphy.gif",
    },
  ];

  const rotated = selectDirectGiphyCandidate(candidates, new Set<string>(), new Set<string>(), 1);

  assert.equal(rotated?.id, "giphy:second");
});

test("selectDirectGiphyCandidate avoids recent-family repeats when a fresher family exists", () => {
  const recentHistory = createSelectionNoveltyHistory();
  recordSelectionNovelty(
    recentHistory,
    buildCandidateNoveltySignals({
      provider: "giphy",
      id: "giphy:recent",
      url: "https://media.giphy.com/media/recent/giphy.gif",
      mediaUrl: "https://media.giphy.com/media/recent/giphy.mp4",
      pageUrl: "https://giphy.com/gifs/recent",
      title: "awkward reaction",
      query: "awkward reaction",
      sourceMetadata: {
        providerQuery: "awkward reaction",
        providerTags: ["awkward", "reaction"],
      },
    })
  );

  const selected = selectDirectGiphyCandidate(
    [
      {
        provider: "giphy",
        id: "giphy:first",
        url: "https://media.giphy.com/media/first/giphy.gif",
        title: "awkward reaction",
        sourceMetadata: {
          providerQuery: "awkward reaction",
          providerTags: ["awkward", "reaction"],
        },
      },
      {
        provider: "giphy",
        id: "giphy:second",
        url: "https://media.giphy.com/media/second/giphy.gif",
        title: "cringe reaction",
        sourceMetadata: {
          providerQuery: "cringe reaction",
          providerTags: ["cringe", "reaction"],
        },
      },
      {
        provider: "giphy",
        id: "giphy:third",
        url: "https://media.giphy.com/media/third/giphy.gif",
        title: "shocked reaction",
        sourceMetadata: {
          providerQuery: "shocked reaction",
          providerTags: ["shocked", "reaction"],
        },
      },
    ],
    new Set<string>(),
    new Set<string>(),
    0,
    recentHistory
  );

  assert.equal(selected?.id, "giphy:third");
});

test("resolveImageUrlByProviders annotates giphy novelty penalties for recent media/source reuse", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GIPHY_API_KEY;
  process.env.GIPHY_API_KEY = "test-key";

  const recentHistory = createSelectionNoveltyHistory();
  recordSelectionNovelty(
    recentHistory,
    buildCandidateNoveltySignals({
      provider: "giphy",
      id: "giphy:first",
      url: "https://media.giphy.com/media/first/200_s.gif",
      mediaUrl: "https://media.giphy.com/media/first/200.mp4",
      pageUrl: "https://giphy.com/gifs/first",
      title: "awkward reaction",
      query: "awkward reaction",
      sourceMetadata: {
        providerQuery: "awkward reaction",
        providerTags: ["awkward", "reaction"],
      },
    })
  );

  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "first",
              title: "awkward reaction",
              slug: "awkward-reaction",
              url: "https://giphy.com/gifs/first",
              rating: "pg",
              images: {
                fixed_height_still: {
                  url: "https://media.giphy.com/media/first/200_s.gif",
                  width: "200",
                  height: "320",
                },
                fixed_height: {
                  url: "https://media.giphy.com/media/first/200.gif",
                  mp4: "https://media.giphy.com/media/first/200.mp4",
                  width: "200",
                  height: "320",
                },
              },
            },
            {
              id: "second",
              title: "shocked reaction",
              slug: "shocked-reaction",
              url: "https://giphy.com/gifs/second",
              rating: "pg",
              images: {
                fixed_height_still: {
                  url: "https://media.giphy.com/media/second/200_s.gif",
                  width: "200",
                  height: "320",
                },
                fixed_height: {
                  url: "https://media.giphy.com/media/second/200.gif",
                  mp4: "https://media.giphy.com/media/second/200.mp4",
                  width: "200",
                  height: "320",
                },
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )) as typeof fetch;

    const resolved = await resolveImageUrlByProviders(
      {
        query: "awkward reaction",
        queryCandidates: ["shocked reaction"],
        orientation: "portrait",
        plannerSource: "codex",
      },
      {
        providers: ["giphy"],
        intent: "meme",
        maxCandidatesPerProvider: 3,
        providerTimeBudgetMs: 2_000,
        recentHistory,
      }
    );

    assert.equal(resolved.ok, true);
    assert.equal(resolved.candidateId, "giphy:second");
    assert.match(String(resolved.selectionReason || ""), /recent-history-penalty/);
    assert.match(String(resolved.selectionReason || ""), /media-identity-penalty/);
    assert.match(String(resolved.selectionReason || ""), /source-duplicate-penalty/);
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "string") process.env.GIPHY_API_KEY = originalApiKey;
    else delete process.env.GIPHY_API_KEY;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildGiphyQuery, resolveGiphySearchStrategy, searchGiphy } from "./image-provider-giphy";
import { buildGiphyReactionQueriesFromRequest } from "./image-provider-resolver-helpers";
import type { ImageRequest } from "@/types/studio-json";

test("resolveGiphySearchStrategy disables library reuse during crawl mode", () => {
  const strategy = resolveGiphySearchStrategy({ libraryOnly: false });

  assert.deepEqual(strategy, {
    useLibraryCandidates: false,
    useLibraryIdentityFilter: false,
    useExternalApi: true,
  });
});

test("resolveGiphySearchStrategy keeps library reuse while still allowing external fallback", () => {
  const strategy = resolveGiphySearchStrategy({ libraryOnly: true });

  assert.deepEqual(strategy, {
    useLibraryCandidates: true,
    useLibraryIdentityFilter: true,
    useExternalApi: true,
  });
});

test("buildGiphyReactionQueriesFromRequest preserves direct english reaction phrases", () => {
  const queries = buildGiphyReactionQueriesFromRequest({
    query: "shocked reaction",
    queryCandidates: ["surprised reaction"],
    orientation: "portrait",
  });

  assert.equal(queries[0], "shocked reaction");
  assert.equal(queries.includes("funny reaction"), false);
});

test("buildGiphyQuery prefers a searchable english meme query over generic fallback", () => {
  const query = buildGiphyQuery(
    {
      query: "shocked reaction",
      queryCandidates: ["surprised reaction"],
      orientation: "portrait",
    },
    "meme"
  );

  assert.equal(query, "shocked reaction");
});

test("buildGiphyQuery still runs codex-planned giphy queries through normalization", () => {
  const query = buildGiphyQuery(
    {
      query: "mid blown gif",
      queryCandidates: ["buffering reaction", "office scene photo"],
      orientation: "portrait",
      plannerSource: "codex",
    },
    "meme"
  );

  assert.equal(query, "mind blown reaction");
});

test("searchGiphy scans beyond the first three raw API items to collect three usable candidates", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GIPHY_API_KEY;
  const requests: string[] = [];
  process.env.GIPHY_API_KEY = "test-key";

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push(url);
    return new Response(
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
            title: "second reaction",
            slug: "second-reaction",
            url: "https://giphy.com/gifs/second",
            rating: "pg",
          },
          {
            id: "third",
            title: "third reaction",
            slug: "third-reaction",
            url: "https://giphy.com/gifs/third",
            rating: "pg",
          },
          {
            id: "fourth",
            title: "fourth reaction",
            slug: "fourth-reaction",
            url: "https://giphy.com/gifs/fourth",
            rating: "pg",
            images: {
              fixed_height_still: {
                url: "https://media.giphy.com/media/fourth/200_s.gif",
                width: "200",
                height: "320",
              },
            },
          },
          {
            id: "fifth",
            title: "fifth reaction",
            slug: "fifth-reaction",
            url: "https://giphy.com/gifs/fifth",
            rating: "pg",
            images: {
              fixed_width_still: {
                url: "https://media.giphy.com/media/fifth/200_s.gif",
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
    );
  }) as typeof fetch;

  try {
    const request: ImageRequest = {
      query: "민망한 상황",
      queryCandidates: ["awkward reaction", "side eye reaction"],
      scene: "awkward office reaction",
      orientation: "portrait",
      plannerSource: "codex",
    };

    const result = await searchGiphy(request, {
      intent: "meme",
      maxCandidatesPerProvider: 8,
      providerTimeBudgetMs: 2_000,
      libraryUserScope: "",
    });

    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 3);
    assert.equal(result.candidates[0]?.id, "giphy:first");
    assert.equal(result.candidates[0]?.mediaKind, "video");
    assert.equal(result.candidates[0]?.mediaUrl, "https://media.giphy.com/media/first/200.mp4");
    assert.equal(result.candidates[1]?.id, "giphy:fourth");
    assert.equal(result.candidates[2]?.id, "giphy:fifth");
    assert.equal(result.searchedQueries?.length, 1);
    assert.ok(result.searchedQueries?.[0]);
    const giphySearchRequests = requests.filter((value) => value.includes("https://api.giphy.com/v1/gifs/search"));
    assert.equal(giphySearchRequests.length, 1);

    const requestedUrl = new URL(giphySearchRequests[0]!);
    assert.equal(requestedUrl.pathname, "/v1/gifs/search");
    assert.equal(requestedUrl.searchParams.get("q"), result.searchedQueries?.[0]);
    assert.equal(requestedUrl.searchParams.get("limit"), "12");
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "string") process.env.GIPHY_API_KEY = originalApiKey;
    else delete process.env.GIPHY_API_KEY;
  }
});

test("searchGiphy retries additional queries when the primary query does not fill three candidates", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GIPHY_API_KEY;
  const requests: string[] = [];
  process.env.GIPHY_API_KEY = "test-key";

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push(url);
    const parsed = new URL(url);
    const query = parsed.searchParams.get("q") || "";
    if (query === "awkward reaction") {
      return new Response(
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
      );
    }
    if (query === "side eye reaction") {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "second",
              title: "side eye reaction",
              slug: "side-eye-reaction",
              url: "https://giphy.com/gifs/second",
              rating: "pg",
              images: {
                fixed_height_still: {
                  url: "https://media.giphy.com/media/second/200_s.gif",
                  width: "200",
                  height: "320",
                },
              },
            },
            {
              id: "third",
              title: "third reaction",
              slug: "third-reaction",
              url: "https://giphy.com/gifs/third",
              rating: "pg",
              images: {
                fixed_height_still: {
                  url: "https://media.giphy.com/media/third/200_s.gif",
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
      );
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    const request: ImageRequest = {
      query: "awkward reaction",
      queryCandidates: ["side eye reaction", "nervous laugh"],
      scene: "awkward office reaction",
      orientation: "portrait",
      plannerSource: "codex",
    };

    const result = await searchGiphy(request, {
      intent: "meme",
      maxCandidatesPerProvider: 8,
      providerTimeBudgetMs: 2_000,
      libraryUserScope: "",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.id),
      ["giphy:first", "giphy:second", "giphy:third"]
    );
    const giphySearchRequests = requests.filter((value) => value.includes("https://api.giphy.com/v1/gifs/search"));
    assert.equal(giphySearchRequests.length, 2);
    assert.deepEqual(result.searchedQueries, ["awkward reaction", "side eye reaction"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "string") process.env.GIPHY_API_KEY = originalApiKey;
    else delete process.env.GIPHY_API_KEY;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderQueries, scoreCandidate } from "./image-provider-resolver-search";
import type { ImageRequest } from "@/types/studio-json";

test("buildProviderQueries keeps the primary provider query stable and deduped", () => {
  const request: ImageRequest = {
    query: "office work",
    queryCandidates: ["office work", "team meeting"],
    scene: "office work",
    plannerSource: "codex",
  };

  const queries = buildProviderQueries("pexels", request, "news");

  assert.equal(queries[0], "office work");
  assert.equal(queries.filter((query) => query === "office work").length, 1);
  assert.ok(queries.length <= 6);
});

test("buildProviderQueries lets naver meme searches use Korean reaction queries before stock fallbacks", () => {
  const request: ImageRequest = {
    query: "당황 짤",
    queryCandidates: ["어이없음 짤", "황당 짤"],
    scene: "사장님 멘붕",
    plannerSource: "codex",
  };

  const queries = buildProviderQueries("naver", request, "meme");

  assert.match(queries[0] || "", /짤|표정/u);
  assert.ok(queries.slice(0, 3).every((query) => /[가-힣]/u.test(query)));
  assert.ok(queries.some((query) => query === "당황 짤"));
  assert.ok(queries.some((query) => query === "황당 짤" || query === "어이없음 짤"));
  assert.equal(queries.slice(0, 3).some((query) => /awkward|office|desk|photo/i.test(query)), false);
});

test("scoreCandidate keeps the promotional naver block", () => {
  const request: ImageRequest = {
    query: "tax refund",
    scene: "office document",
    plannerSource: "codex",
  };

  const judged = scoreCandidate(
    {
      provider: "pexels",
      id: "blocked",
      url: "https://img.example.com/image.jpg",
      title: "sample",
      pageUrl: "https://shopping.naver.com/promo",
    },
    request,
    "news"
  );

  assert.equal(judged.score, -999);
  assert.equal(judged.reason, "promotional/provider image");
});

test("scoreCandidate ignores non-promotional mustAvoid hints when ranking provider results", () => {
  const request: ImageRequest = {
    query: "document",
    scene: "document",
    mustAvoid: ["캡처", "로고", "워터마크"],
    plannerSource: "codex",
  };

  const judged = scoreCandidate(
    {
      provider: "giphy",
      id: "ok",
      url: "https://media.giphy.com/media/example/giphy.gif",
      pageUrl: "https://giphy.com/gifs/example",
      title: "document reaction",
      mediaKind: "animated_image",
      width: 480,
      height: 480,
    },
    request,
    "meme"
  );

  assert.ok(judged.score > 0);
  assert.doesNotMatch(judged.reason, /must-avoid/);
});

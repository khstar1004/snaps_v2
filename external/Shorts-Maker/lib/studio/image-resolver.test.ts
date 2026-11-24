import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidateNoveltySignals,
  createSelectionNoveltyHistory,
  recordSelectionNovelty,
} from "./provider-candidate-diversity";
import {
  buildNaverCandidateId,
  filterPromotionalMustAvoidTokens,
  isBlockedPromotionalNaverCandidate,
  isExcludedNaverCandidate,
  resolveImageUrlByNaver,
  scoreNaverCandidateForTest,
  selectPreferredNaverQuery,
  shouldAllowMemeLikeNaverResults,
  toKoreanNaverQuery,
} from "./image-resolver";

test("toKoreanNaverQuery localizes translated office-document phrases into Korean", () => {
  assert.equal(toKoreanNaverQuery("bank account book"), "통장");
  assert.equal(toKoreanNaverQuery("tax filing documents"), "서류");
  assert.equal(toKoreanNaverQuery("accounting office work"), "책상");
  assert.equal(toKoreanNaverQuery("tax filing documents 움짤"), "서류");
  assert.equal(toKoreanNaverQuery("bank account book gif"), "통장");
  assert.equal(toKoreanNaverQuery("awkward reaction gif"), "당황 표정");
  assert.equal(toKoreanNaverQuery("사무실 급여 명세서"), "급여 명세서");
});

test("selectPreferredNaverQuery prefers localized Korean candidates over english ones", () => {
  const selected = selectPreferredNaverQuery({
    query: "bank account book",
    queryCandidates: ["tax filing documents"],
    scene: "accounting office work",
  });

  assert.equal(selected, "통장");
});

test("selectPreferredNaverQuery keeps codex-planned naver query verbatim", () => {
  const selected = selectPreferredNaverQuery({
    query: "tax filing documents",
    queryCandidates: ["bank account book"],
    scene: "accounting office work",
    plannerSource: "codex",
  });

  assert.equal(selected, "tax filing documents");
});

test("reaction-like naver queries allow meme-like results without forcing news penalties", () => {
  assert.equal(shouldAllowMemeLikeNaverResults("당황 표정", ["당황", "표정"], "news"), true);
  assert.equal(shouldAllowMemeLikeNaverResults("수상한 표정", ["수상한", "표정"], "news"), true);
  assert.equal(shouldAllowMemeLikeNaverResults("서류", ["서류"], "news"), false);
});

test("only promotional must-avoid tokens are kept for naver filtering", () => {
  assert.deepEqual(filterPromotionalMustAvoidTokens(["캡처", "로고", "광고", "상담문의", "워터마크"]), ["광고", "상담문의"]);
});

test("naver scoring keeps non-promotional meme-like candidates eligible in news mode", () => {
  const scored = scoreNaverCandidateForTest(
    {
      link: "https://i1.ruliweb.com/example/suspicious-face.gif",
      title: "수상한 표정 움짤",
      sizewidth: "240",
      sizeheight: "240",
    },
    ["수상한", "표정"],
    "수상한 표정",
    "news"
  );

  assert.ok(scored.score > 0);
  assert.match(scored.reason, /meme title hint/);
  assert.doesNotMatch(scored.reason, /meme domain in news|meme-like title in news|small image/);
});

test("naver resolver accepts a non-promotional candidate even when image verification fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const originalClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  process.env.NAVER_SEARCH_CLIENT_ID = "test-client";
  process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret";

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://openapi.naver.com/v1/search/image")) {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("query"), "통장 -광고");
        return new Response(
          JSON.stringify({
            items: [
              {
                link: "https://images.example.com/bankbook.jpg",
                title: "통장 이미지",
                sizewidth: "900",
                sizeheight: "1200",
              },
              {
                link: "https://images.example.com/account.jpg",
                title: "계좌 이미지",
                sizewidth: "700",
                sizeheight: "900",
              },
              {
                link: "https://images.example.com/passbook.jpg",
                title: "통장 사진",
                sizewidth: "600",
                sizeheight: "800",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("blocked", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;

    const resolved = await resolveImageUrlByNaver({
      query: "통장",
      mustAvoid: ["캡처", "광고", "로고"],
      orientation: "portrait",
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.url, "https://images.example.com/bankbook.jpg");
    assert.match(String(resolved.selectionReason || ""), /unverified-accepted/);
    assert.equal(resolved.candidateOptions?.length, 3);
    assert.equal(resolved.candidateOptions?.[0]?.provider, "naver");
    assert.equal(resolved.candidateOptions?.[0]?.candidateId, "naver:https://images.example.com/bankbook.jpg");
    assert.match(String(resolved.candidateOptions?.[0]?.imageUrl || ""), /\/api\/studio\/image-proxy\?url=/);
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalClientId === "string") process.env.NAVER_SEARCH_CLIENT_ID = originalClientId;
    else delete process.env.NAVER_SEARCH_CLIENT_ID;
    if (typeof originalClientSecret === "string") process.env.NAVER_SEARCH_CLIENT_SECRET = originalClientSecret;
    else delete process.env.NAVER_SEARCH_CLIENT_SECRET;
  }
});

test("naver resolver sends the codex-planned query without localization or must-avoid suffixes", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const originalClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  process.env.NAVER_SEARCH_CLIENT_ID = "test-client";
  process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret";

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://openapi.naver.com/v1/search/image")) {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("query"), "tax filing documents");
        return new Response(
          JSON.stringify({
            items: [
              {
                link: "https://images.example.com/raw-query.jpg",
                title: "tax filing documents",
                sizewidth: "900",
                sizeheight: "1200",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("blocked", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;

    const resolved = await resolveImageUrlByNaver({
      query: "tax filing documents",
      queryCandidates: ["bank account book"],
      mustAvoid: ["광고", "상담문의"],
      orientation: "portrait",
      plannerSource: "codex",
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.selectedQuery, "tax filing documents");
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalClientId === "string") process.env.NAVER_SEARCH_CLIENT_ID = originalClientId;
    else delete process.env.NAVER_SEARCH_CLIENT_ID;
    if (typeof originalClientSecret === "string") process.env.NAVER_SEARCH_CLIENT_SECRET = originalClientSecret;
    else delete process.env.NAVER_SEARCH_CLIENT_SECRET;
  }
});

test("naver resolver can rotate within top scored candidates when selectionOffset is provided", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const originalClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  process.env.NAVER_SEARCH_CLIENT_ID = "test-client";
  process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret";

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://openapi.naver.com/v1/search/image")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: "https://images.example.com/bankbook.jpg",
                title: "통장 이미지",
                sizewidth: "900",
                sizeheight: "1200",
              },
              {
                link: "https://images.example.com/account.jpg",
                title: "계좌 이미지",
                sizewidth: "880",
                sizeheight: "1180",
              },
              {
                link: "https://images.example.com/passbook.jpg",
                title: "통장 사진",
                sizewidth: "860",
                sizeheight: "1160",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("blocked", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;

    const resolved = await resolveImageUrlByNaver({
      query: "통장",
      orientation: "portrait",
    }, {
      selectionOffset: 1,
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.url, "https://images.example.com/passbook.jpg");
    assert.equal(resolved.candidateOptions?.[0]?.candidateId, "naver:https://images.example.com/bankbook.jpg");
    assert.match(String(resolved.selectionReason || ""), /diversified-offset=1/);
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalClientId === "string") process.env.NAVER_SEARCH_CLIENT_ID = originalClientId;
    else delete process.env.NAVER_SEARCH_CLIENT_ID;
    if (typeof originalClientSecret === "string") process.env.NAVER_SEARCH_CLIENT_SECRET = originalClientSecret;
    else delete process.env.NAVER_SEARCH_CLIENT_SECRET;
  }
});

test("naver resolver dedupes candidate options that share the same context identity", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const originalClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  process.env.NAVER_SEARCH_CLIENT_ID = "test-client";
  process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret";

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://openapi.naver.com/v1/search/image")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: "https://img1.daumcdn.net/thumb/r1280x0.fpng/?fname=https://t1.daumcdn.net/news/1.jpg",
                title: "기사 이미지 1",
                contextLink: "https://v.daum.net/v/202604030001",
                sizewidth: "900",
                sizeheight: "1200",
              },
              {
                link: "https://img1.daumcdn.net/thumb/r1280x0.fpng/?fname=https://t1.daumcdn.net/news/1-alt.jpg",
                title: "기사 이미지 1 대체",
                contextLink: "https://v.daum.net/v/202604030001",
                sizewidth: "900",
                sizeheight: "1200",
              },
              {
                link: "https://images.example.com/unique.jpg",
                title: "고유 이미지",
                contextLink: "https://news.example.com/article/2",
                sizewidth: "800",
                sizeheight: "1000",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("blocked", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;

    const resolved = await resolveImageUrlByNaver({
      query: "기사 이미지",
      mustAvoid: ["광고"],
      orientation: "portrait",
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.candidateOptions?.length, 2);
    assert.deepEqual(
      resolved.candidateOptions?.map((candidate) => candidate.candidateId),
      ["naver:https://v.daum.net/v/202604030001", "naver:https://news.example.com/article/2"]
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalClientId === "string") process.env.NAVER_SEARCH_CLIENT_ID = originalClientId;
    else delete process.env.NAVER_SEARCH_CLIENT_ID;
    if (typeof originalClientSecret === "string") process.env.NAVER_SEARCH_CLIENT_SECRET = originalClientSecret;
    else delete process.env.NAVER_SEARCH_CLIENT_SECRET;
  }
});

test("naver resolver penalizes recent source and media reuse before choosing a fallback article", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const originalClientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  process.env.NAVER_SEARCH_CLIENT_ID = "test-client";
  process.env.NAVER_SEARCH_CLIENT_SECRET = "test-secret";

  const recentHistory = createSelectionNoveltyHistory();
  recordSelectionNovelty(
    recentHistory,
    buildCandidateNoveltySignals({
      provider: "naver",
      id: "naver:https://news.example.com/article/1",
      url: "https://images.example.com/reused.jpg",
      pageUrl: "https://news.example.com/article/1",
      title: "기사 이미지 1",
      query: "기사 이미지",
      queryCandidates: ["기사 이미지"],
    })
  );

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://openapi.naver.com/v1/search/image")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: "https://images.example.com/reused.jpg",
                title: "기사 이미지 1",
                contextLink: "https://news.example.com/article/1",
                sizewidth: "1200",
                sizeheight: "1600",
              },
              {
                link: "https://images.example.com/fresh.jpg",
                title: "기사 이미지 2",
                contextLink: "https://news.example.com/article/2",
                sizewidth: "900",
                sizeheight: "1200",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("", {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }) as typeof fetch;

    const resolved = await resolveImageUrlByNaver(
      {
        query: "기사 이미지",
        mustAvoid: ["광고"],
        orientation: "portrait",
      },
      {
        recentHistory,
      }
    );

    assert.equal(resolved.ok, true);
    assert.equal(resolved.url, "https://images.example.com/fresh.jpg");
    assert.match(String(resolved.selectionReason || ""), /recent-history-penalty/);
    assert.match(String(resolved.selectionReason || ""), /media-identity-penalty/);
    assert.match(String(resolved.selectionReason || ""), /source-duplicate-penalty/);
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalClientId === "string") process.env.NAVER_SEARCH_CLIENT_ID = originalClientId;
    else delete process.env.NAVER_SEARCH_CLIENT_ID;
    if (typeof originalClientSecret === "string") process.env.NAVER_SEARCH_CLIENT_SECRET = originalClientSecret;
    else delete process.env.NAVER_SEARCH_CLIENT_SECRET;
  }
});

test("promotional shopping and office-ad naver candidates are blocked", () => {
  assert.equal(
    isBlockedPromotionalNaverCandidate({
      link: "http://shop1.phinf.naver.net/20181023_269/patocom_1540252333765zo05B_JPEG/main-sample-fitness-21.jpg",
    }),
    true
  );
  assert.equal(
    isBlockedPromotionalNaverCandidate({
      link: "https://d2v80xjmx68n4w.cloudfront.net/gigs/lcmWI1580838295.jpg",
    }),
    true
  );
  assert.equal(
    isBlockedPromotionalNaverCandidate({
      link: "https://image.example.com/banner-tax.jpg",
      title: "강남세무회계 무료상담 이벤트",
      contextLink: "https://smartstore.naver.com/example/products/123",
    }),
    true
  );
});

test("naver candidate identity reuses contextLink so the same source article is treated as one image source", () => {
  const first = buildNaverCandidateId({
    link: "https://imgnews.pstatic.net/image/origin/001/2026/03/23/example_a.jpg?type=w860",
    contextLink: "https://news.naver.com/main/read.naver?oid=001&aid=0012345678",
  });
  const second = buildNaverCandidateId({
    link: "https://imgnews.pstatic.net/image/origin/001/2026/03/23/example_b.jpg?type=w430",
    contextLink: "https://news.naver.com/main/read.naver?oid=001&aid=0012345678",
  });

  assert.equal(first, second);
});

test("naver exclusions block already-used candidates by context identity and url", () => {
  const item = {
    link: "https://imgnews.pstatic.net/image/origin/001/2026/03/23/example_a.jpg?type=w860",
    contextLink: "https://news.naver.com/main/read.naver?oid=001&aid=0012345678",
  };

  assert.equal(
    isExcludedNaverCandidate(item, {
      excludeCandidateIds: [buildNaverCandidateId(item)],
    }),
    true
  );
  assert.equal(
    isExcludedNaverCandidate(item, {
      excludeUrls: ["http://localhost:3000/api/studio/image-proxy?url=https%3A%2F%2Fnews.naver.com%2Fmain%2Fread.naver%3Foid%3D001%26aid%3D0012345678"],
    }),
    true
  );
});

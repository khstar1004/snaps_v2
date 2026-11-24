import test from "node:test";
import assert from "node:assert/strict";
import { __internal, buildLocalHeuristicPlan, planMissingSlideImageRequests } from "./image-query-planner";
import {
  buildGiphyFallbackQueriesFromRequest,
  inferGiphyReactionFamily,
  isGiphySearchableQuery,
  normalizeGiphySearchQuery,
  sanitizeTrustedGiphyPlannerQuery,
} from "./giphy-query-utils";
import type { StudioPrepareRequest } from "@/types/studio-json";

function buildPreparePayload(slideCount: number): StudioPrepareRequest {
  return {
    publishCategory: "default",
    videoMode: "segments",
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    crawlMode: "fun",
    slides: Array.from({ length: slideCount }, (_, slideIndex) => ({
      title: `슬라이드 ${slideIndex + 1}`,
      text: `테스트 문장 ${slideIndex + 1}`,
      lines: [`테스트 문장 ${slideIndex + 1}`],
      layout: "photo+body" as const,
    })),
  };
}

test("fun heuristic planner uses slide-specific english visuals instead of a fixed confused reaction", () => {
  const taxPlan = buildLocalHeuristicPlan(
    [
      {
        slideIndex: 0,
        title: "",
        text: "지금 세금마다 통장 잔액이 무서운 사장님이라면",
        lines: ["지금 세금마다", "통장 잔액이 무서운", "사장님이라면"],
      },
    ],
    { crawlMode: "fun" }
  );
  const phonePlan = buildLocalHeuristicPlan(
    [
      {
        slideIndex: 0,
        title: "",
        text: "연락 끊고 잠수 탄 예약자 때문에 식당 자리가 비었다",
        lines: ["연락 끊고", "잠수 탄 예약자", "식당 자리가 비었다"],
      },
    ],
    { crawlMode: "fun" }
  );

  const taxQueries = taxPlan.items[0]?.queryCandidates || [];
  const phoneQueries = phonePlan.items[0]?.queryCandidates || [];

  assert.ok(taxQueries.length > 0);
  assert.ok(phoneQueries.length > 0);
  assert.notEqual(taxQueries[0], "confused reaction");
  assert.notEqual(phoneQueries[0], "confused reaction");
  assert.notDeepEqual(taxQueries, phoneQueries);
  assert.ok(phoneQueries.some((query) => query.includes("restaurant") || query.includes("empty table") || query.includes("frustrated")));
});

test("giphy fallback queries are translated from request context before generic meme defaults", () => {
  const queries = buildGiphyFallbackQueriesFromRequest({
    query: "지금 세금마다",
    queryCandidates: ["통장 잔액이 무서운", "사장님이라면"],
    scene: "통장 사진",
  });

  assert.ok(queries.length > 0);
  assert.equal(queries.some((query) => query.includes("bank") || query.includes("tax")), false);
  assert.ok(queries.some((query) => query.includes("reaction") || query.includes("meme")));
  assert.equal(new Set(queries.map((query) => inferGiphyReactionFamily(query) || query)).size, queries.length);
});

test("giphy searchable filter rejects office-document phrases even with gif suffix", () => {
  assert.equal(isGiphySearchableQuery("tax filing documents gif"), false);
  assert.equal(isGiphySearchableQuery("bank account book gif"), false);
  assert.equal(isGiphySearchableQuery("awkward reaction gif"), true);
});

test("giphy planner sanitizer strips gif noise, preserves key phrases, and rejects b-roll phrases", () => {
  assert.equal(normalizeGiphySearchQuery("mid blown gif"), "mind blown reaction");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("mid blown gif"), "mind blown reaction");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("side eye gif"), "side eye reaction");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("done with this reaction gif"), "done with this reaction");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("blank stare reaction"), "blank stare reaction");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("nervous laugh"), "nervous laugh");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("sug smile reaction"), "smile reaction");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("serious"), "");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("paperwork desk gif"), "");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("office scene photo"), "");
});

test("image planner prompt requests compact query-only output", () => {
  const prompt = __internal.toPrompt(
    [
      {
        slideIndex: 0,
        title: "제목",
        text: "직원 퇴직금 그냥 나중에 한번에 주면 되는 거 아니야?",
        lines: ["직원 퇴직금 그냥", "나중에 한번에 주면", "되는 거 아니야?"],
      },
    ],
    {
      category: "칠도세무회계",
      crawlMode: "fun",
    }
  );

  assert.match(prompt, /provider와 queryCandidates를 정하고/);
  assert.match(prompt, /"provider":"naver"/);
  assert.doesNotMatch(prompt, /"switchProvider":"giphy"/);
  assert.match(prompt, /\[카테고리 지침: 칠도세무회계 전용\]/);
  assert.match(prompt, /provider는 슬라이드의 내용으로 결정한다/);
  assert.match(prompt, /slide index parity나 고정된 alternating 규칙으로 provider를 정하지 않는다/);
  assert.match(prompt, /슬라이드마다 이미지는 반드시 한 장만 쓴다/);
  assert.match(prompt, /naver는 짧은 한국어 queryCandidates를 쓴다/);
  assert.match(prompt, /`당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정` 같은 한국어 반응 검색어도 허용한다/);
  assert.match(prompt, /provider가 giphy면 모두 영어, provider가 naver면 모두 한국어로 쓴다/);
  assert.doesNotMatch(prompt, /providerSlot=/);
  assert.doesNotMatch(prompt, /provider 교차 규칙/);
  assert.doesNotMatch(prompt, /"scene":"장면명"/);
  assert.doesNotMatch(prompt, /"people":\[\]/);
});

test("image planner compact response is accepted with provider hints and scene is server-composed", () => {
  const parsed = __internal.parsePlannedResponse(
    JSON.stringify({
      items: [
        {
          slideIndex: 0,
          provider: "giphy",
          queryCandidates: ["awkward reaction", "severance myth", "confused boss face"],
          switchAtLineIndex: 2,
          switchProvider: "giphy",
          switchQueryCandidates: ["mind blown gif", "paperwork desk"],
        },
      ],
    })
  );

  const slide = {
    title: "",
    text: "직원 퇴직금 그냥 나중에 한번에 주면 되는 거 아니야?",
    lines: ["직원 퇴직금 그냥", "나중에 한번에 주면", "되는 거 아니야?"],
    layout: "photo+body" as const,
  };
  const primary = __internal.sanitizePlannedItem(parsed.items[0]!, slide, "fun", "codex");
  const switched = __internal.sanitizePlannedSwitchItem(parsed.items[0]!, slide, "fun", "codex");

  assert.equal(primary.queryCandidates?.[0], "awkward reaction");
  assert.deepEqual(primary.preferredProviders, ["giphy"]);
  assert.ok((primary.scene || "").length > 0);
  assert.equal(switched?.startLineIndex, 2);
  assert.deepEqual(switched?.imageRequest.preferredProviders, ["giphy"]);
  assert.equal(switched?.imageRequest.query, "mind blown reaction");
  assert.equal(switched?.imageRequest.queryCandidates?.[0], "mind blown reaction");
  assert.equal(switched?.imageRequest.queryCandidates?.some((query) => /paperwork|office|photo|gif/i.test(query)), false);
  assert.ok((switched?.imageRequest.scene || "").length > 0);
});

test("image planner parser repairs malformed array commas from codex cli output", () => {
  const parsed = __internal.parsePlannedResponse(`{
    "items": [
      {
        "slideIndex": 0,
        "provider": "giphy",
        "queryCandidates": ["awkward reaction" "side eye reaction"]
      }
      {
        "slideIndex": 1,
        "provider": "naver",
        "queryCandidates": ["서류" "급여 명세서",]
      }
    ]
  }`);

  assert.equal(parsed.items.length, 2);
  assert.deepEqual(parsed.items[0]?.queryCandidates, ["awkward reaction", "side eye reaction"]);
  assert.deepEqual(parsed.items[1]?.queryCandidates, ["서류", "급여 명세서"]);
});

test("fun planned item post-processes codex-selected giphy queries through the server quality gate", () => {
  const slide = {
    title: "",
    text: "퇴직금 폭탄 맞고 사장님 멘붕 오는 순간",
    lines: ["퇴직금 폭탄 맞고", "사장님 멘붕 오는 순간"],
    layout: "photo+body" as const,
  };
  const primary = __internal.sanitizePlannedItem(
    {
      slideIndex: 0,
      provider: "giphy",
      queryCandidates: ["mid blown gif", "buffering reaction", "paperwork desk", "office scene photo", "side eye reaction"],
      scene: "office scene",
      people: [],
    },
    slide,
    "fun",
    "codex"
  );

  assert.equal(primary.query, "mind blown reaction");
  assert.equal(primary.queryCandidates?.[0], "mind blown reaction");
  assert.equal(primary.queryCandidates?.some((query) => /paperwork|office scene|photo|gif/i.test(query)), false);
  assert.equal(primary.queryCandidates?.some((query) => inferGiphyReactionFamily(query) === "meltdown"), true);
  assert.equal(
    new Set((primary.queryCandidates || []).map((query) => inferGiphyReactionFamily(query) || query)).size,
    primary.queryCandidates?.length
  );
  assert.deepEqual(primary.preferredProviders, ["giphy"]);
});

test("fun heuristic planned item keeps only trusted giphy-style reaction queries", () => {
  const slide = {
    title: "",
    text: "퇴직금 폭탄 맞고 사장님 멘붕 오는 순간",
    lines: ["퇴직금 폭탄 맞고", "사장님 멘붕 오는 순간"],
    layout: "photo+body" as const,
  };
  const primary = __internal.sanitizePlannedItem(
    {
      slideIndex: 0,
      provider: "giphy",
      queryCandidates: ["mid blown gif", "paperwork desk", "office scene photo"],
      scene: "office scene",
      people: [],
    },
    slide,
    "fun",
    "heuristic"
  );

  assert.equal(primary.queryCandidates?.[0], "mind blown reaction");
  assert.equal(primary.queryCandidates?.some((query) => /gif|paperwork|office scene|photo/i.test(query)), false);
});

test("stock planned item keeps codex-selected naver queries verbatim", () => {
  const slide = {
    title: "",
    text: "퇴직금을 따로 적립해 두지 않으면 직원 퇴사 때 한번에 큰돈이 나간다",
    lines: ["퇴직금을 따로 적립해 두지 않으면", "직원 퇴사 때", "한번에 큰돈이 나간다"],
    layout: "photo+body" as const,
  };
  const primary = __internal.sanitizePlannedItem(
    {
      slideIndex: 0,
      provider: "naver",
      queryCandidates: ["퇴직금 별도적립", "직원 갑작 퇴사", "한번에 돈 마련"],
    },
    slide,
    "stock",
    "codex"
  );

  assert.equal(primary.queryCandidates?.[0], "퇴직금 별도적립");
  assert.deepEqual(primary.queryCandidates, ["퇴직금 별도적립", "직원 갑작 퇴사", "한번에 돈 마련"]);
  assert.equal(primary.query, "퇴직금 별도적립");
  assert.deepEqual(primary.preferredProviders, ["naver"]);
});

test("professional-service heuristic spreads retirement-tax scenes across concrete visuals instead of one bankbook query", () => {
  const plan = buildLocalHeuristicPlan(
    [
      {
        slideIndex: 0,
        title: "",
        text: "퇴직연금 납입 시기를 놓치지 않게 미리 준비해야 한다",
        lines: ["퇴직연금 납입 시기를", "놓치지 않게", "미리 준비해야 한다"],
      },
      {
        slideIndex: 1,
        title: "",
        text: "퇴직금 정산 전에 증빙 서류와 급여 명세서를 다시 확인해야 한다",
        lines: ["퇴직금 정산 전에", "증빙 서류와", "급여 명세서를", "다시 확인해야 한다"],
      },
      {
        slideIndex: 2,
        title: "",
        text: "법인세 절세를 보려면 세금 계산과 증빙 정리가 같이 필요하다",
        lines: ["법인세 절세를 보려면", "세금 계산과", "증빙 정리가", "같이 필요하다"],
      },
    ],
    { category: "세무", crawlMode: "stock" }
  );

  const queries = plan.items.map((item) => item.queryCandidates?.[0] || "");
  assert.equal(new Set(queries).size >= 2, true);
  assert.equal(queries.includes("통장"), false);
  assert.equal(queries.includes("serious reaction"), false);
  assert.ok(queries.some((query) => /달력|일정표|납입/.test(query)));
  assert.ok(queries.some((query) => /서류|명세서|증빙/.test(query)));
  assert.ok(queries.some((query) => /세금|계산기|회계/.test(query)));
});

test("image planner prompt enforces a single image per slide", () => {
  const prompt = __internal.toPrompt(
    [
      {
        slideIndex: 0,
        title: "제목",
        text: "퇴직금 폭탄 맞고 멘붕 오는 순간",
        lines: ["퇴직금 폭탄 맞고", "멘붕 오는 순간"],
      },
    ],
    {}
  );

  assert.match(prompt, /너는 숏폼 영상 이미지 검색 플래너다/);
  assert.match(prompt, /어떤 provider에서 어떤 query로 이미지를 찾는 게 가장 맞는지 정한다/);
  assert.match(prompt, /\[카테고리 지침: 일반\]/);
  assert.match(prompt, /provider는 반드시 `naver` 또는 `giphy` 중 하나만 쓴다/);
  assert.match(prompt, /provider는 슬라이드의 내용으로 결정한다/);
  assert.match(prompt, /한 요청 안에서 같은 reaction family를 남발하지 않는다/);
  assert.match(prompt, /slideIndex는 입력에 적힌 숫자를 그대로 복사한다/);
  assert.match(prompt, /slideIndex=0/);
  assert.match(prompt, /naver는 짧은 한국어 queryCandidates를 쓴다/);
  assert.match(prompt, /좋은 네이버 예: `당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정`/);
  assert.match(prompt, /영어 literal 번역을 그대로 쓰지 않는다\. 예: `tax filing documents`류는 `서류`, `bank account book`류는 `통장`, `accounting office work`류는 `책상`처럼 줄인다\./);
  assert.match(prompt, /giphy는 짧은 영어 reaction phrase queryCandidates를 쓴다/);
  assert.match(prompt, /추상 요약\/행동 설명만 있는 queryCandidates는 금지한다/);
  assert.match(prompt, /단독 형용사 1단어만 있는 GIPHY queryCandidates는 금지한다/);
  assert.match(prompt, /슬라이드마다 이미지는 반드시 한 장만 쓴다/);
  assert.match(prompt, /switchAtLineIndex, switchProvider, switchQueryCandidates는 작성하지 않는다/);
  assert.doesNotMatch(prompt, /providerSlot=/);
  assert.doesNotMatch(prompt, /provider 교차 규칙/);
  assert.doesNotMatch(prompt, /switch를 넣을 수 있다/);
  assert.doesNotMatch(prompt, /switchProvider는 기본 provider와 같아도 되고 달라도 된다/);
  assert.doesNotMatch(prompt, /카테고리: 칠도세무회계/);
  assert.doesNotMatch(prompt, /크롤링 분위기/);
  assert.doesNotMatch(prompt, /4줄 슬라이드는 switchAtLineIndex를 2로 작성/);
});

test("planner collapses codex switch output into a single image request", async () => {
  const result = await planMissingSlideImageRequests(buildPreparePayload(1), {
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async () => ({
        items: [
          {
            slideIndex: 0,
            provider: "giphy",
            queryCandidates: ["awkward reaction", "facepalm reaction"],
            switchAtLineIndex: 1,
            switchProvider: "giphy",
            switchQueryCandidates: ["mind blown gif", "shocked reaction"],
          },
        ],
      }),
    },
  });

  assert.equal(result.payload.slides[0]?.imageBeats, undefined);
  assert.equal(result.payload.slides[0]?.imageRequest?.query, "awkward reaction");
});

test("image planner fails fast when Codex leaves some slides unresolved", async () => {
  const payload = buildPreparePayload(5);
  const batchCalls: number[][] = [];

  await assert.rejects(
    () =>
      planMissingSlideImageRequests(payload, {
        batchSize: 2,
        transportOverrides: {
          canUseLocalCliBridge: () => true,
          planByCodexCli: async (slides) => {
            batchCalls.push(slides.map((slide) => slide.slideIndex));
            if (slides.some((slide) => slide.slideIndex === 2 || slide.slideIndex === 3)) {
              throw new Error("planner timeout");
            }
            return {
              items: slides.map((slide) => ({
                slideIndex: slide.slideIndex,
                provider: "giphy",
                queryCandidates: [`batch ${slide.slideIndex} reaction`, `fallback ${slide.slideIndex} reaction`],
              })),
            };
          },
        },
      }),
    /Codex image planner did not return plans for slides 2, 3\. Resolved 3\/5\. Heuristic fallback is disabled\./
  );

  const uniqueBatchCalls = batchCalls.filter((call, index) => {
    if (index <= 0) return true;
    return JSON.stringify(call) !== JSON.stringify(batchCalls[index - 1]);
  });

  assert.deepEqual(uniqueBatchCalls, [
    [0, 1],
    [2, 3],
    [4],
  ]);
});

test("image planner fails when Codex is unavailable and heuristic fallback is disabled", async () => {
  const payload = buildPreparePayload(1);

  await assert.rejects(
    () =>
      planMissingSlideImageRequests(payload, {
        transportOverrides: {
          canUseLocalCliBridge: () => false,
        },
      }),
    /Codex image planner is unavailable because neither the local Codex CLI bridge nor an API access token is available, and heuristic fallback is disabled\./
  );
});

test("image planner uses the API transport when the CLI bridge is unavailable but a token is present", async () => {
  const payload = buildPreparePayload(2);
  const apiCalls: Array<{ slideIndexes: number[]; token: string }> = [];

  const result = await planMissingSlideImageRequests(payload, {
    codexAccessToken: "test-api-token",
    transportOverrides: {
      canUseLocalCliBridge: () => false,
      planByCodexCli: async () => {
        throw new Error("CLI transport must not be used when the bridge is unavailable");
      },
      planByCodexApi: async (slides, codexAccessToken) => {
        apiCalls.push({ slideIndexes: slides.map((slide) => slide.slideIndex), token: codexAccessToken });
        return {
          items: slides.map((slide) => ({
            slideIndex: slide.slideIndex,
            provider: "naver" as const,
            queryCandidates: [`api ${slide.slideIndex} query`, `api ${slide.slideIndex} alternate`],
          })),
        };
      },
    },
  });

  // Batching is a separate concern, so assert on the slides the API transport
  // was asked to plan overall rather than on how they were split into batches.
  assert.deepEqual(
    apiCalls.flatMap((call) => call.slideIndexes).sort((a, b) => a - b),
    [0, 1]
  );
  assert.ok(apiCalls.every((call) => call.token === "test-api-token"));
  assert.equal(result.payload.slides[0]?.imageRequest?.query, "api 0 query");
  assert.equal(result.payload.slides[1]?.imageRequest?.query, "api 1 query");
});

test("image planner uses heuristic fallback when Codex leaves some slides unresolved in best-effort mode", async () => {
  const payload = buildPreparePayload(5);

  const result = await planMissingSlideImageRequests(payload, {
    batchSize: 2,
    bestEffort: true,
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides) => {
        if (slides.some((slide) => slide.slideIndex === 2 || slide.slideIndex === 3)) {
          throw new Error("planner timeout");
        }
        return {
          items: slides.map((slide) => ({
            slideIndex: slide.slideIndex,
            provider: "giphy",
            queryCandidates: [`batch ${slide.slideIndex} reaction`, `fallback ${slide.slideIndex} reaction`],
          })),
        };
      },
    },
  });

  assert.equal(result.payload.slides.every((slide) => Boolean(slide.imageRequest?.query)), true);
  assert.equal(result.payload.slides[0]?.imageRequest?.plannerSource, "codex");
  assert.equal(result.payload.slides[2]?.imageRequest?.plannerSource, "heuristic");
  assert.equal(result.payload.slides[3]?.imageRequest?.plannerSource, "heuristic");
  assert.match(result.warnings.join("\n"), /planner timeout/);
  assert.match(result.warnings.join("\n"), /Using local heuristic plan for slides 2, 3/);
});

test("image planner uses heuristic fallback when Codex is unavailable in best-effort mode", async () => {
  const payload = buildPreparePayload(1);

  const result = await planMissingSlideImageRequests(payload, {
    bestEffort: true,
    transportOverrides: {
      canUseLocalCliBridge: () => false,
    },
  });

  assert.equal(result.payload.slides[0]?.imageRequest?.plannerSource, "heuristic");
  assert.match(result.warnings.join("\n"), /Codex image planner is unavailable/);
  assert.match(result.warnings.join("\n"), /Using local heuristic plan for slides 0/);
});

test("image planner remaps batch-local slide indexes back to original slide indexes", async () => {
  const payload = buildPreparePayload(5);

  const result = await planMissingSlideImageRequests(payload, {
    batchSize: 2,
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides) => ({
        items: slides.map((_, localIndex) => ({
          slideIndex: localIndex,
          provider: "giphy",
          queryCandidates: ["fast reaction"],
        })),
      }),
    },
  });

  assert.equal(result.payload.slides.every((slide) => slide.imageRequest?.plannerSource === "codex"), true);
  assert.match(result.warnings.join("\n"), /Codex plan remapped local slideIndex batch 2\/3/);
  assert.match(result.warnings.join("\n"), /Codex plan remapped local slideIndex batch 3\/3/);
});

test("image planner retries only unresolved slides when Codex returns a partial batch", async () => {
  const payload = buildPreparePayload(3);
  const batchCalls: number[][] = [];
  const previousPartialRetryAttempts = process.env.STUDIO_IMAGE_QUERY_PLANNER_PARTIAL_RETRY_ATTEMPTS;
  process.env.STUDIO_IMAGE_QUERY_PLANNER_PARTIAL_RETRY_ATTEMPTS = "3";

  try {
    const result = await planMissingSlideImageRequests(payload, {
      batchSize: 3,
      transportOverrides: {
        canUseLocalCliBridge: () => true,
        planByCodexCli: async (slides) => {
          batchCalls.push(slides.map((slide) => slide.slideIndex));
          if (slides.length === 3) {
            return {
              items: [
                {
                  slideIndex: 0,
                  provider: "giphy",
                  queryCandidates: ["batch zero reaction"],
                },
                {
                  slideIndex: 2,
                  provider: "giphy",
                  queryCandidates: ["batch two reaction"],
                },
              ],
            };
          }
          return {
            items: slides.map((slide) => ({
              slideIndex: slide.slideIndex,
              provider: "giphy",
              queryCandidates: [`retry ${slide.slideIndex} reaction`],
            })),
          };
        },
      },
    });

    assert.deepEqual(batchCalls, [
      [0, 1, 2],
      [1],
    ]);
    assert.equal(result.payload.slides[1]?.imageRequest?.plannerSource, "codex");
    assert.match(result.warnings.join("\n"), /Codex plan partial attempt 1\/3: expected \[0, 1, 2\], received \[0, 2\], raw \[0, 2\]; retrying missing \[1\]/);
  } finally {
    if (typeof previousPartialRetryAttempts === "string") {
      process.env.STUDIO_IMAGE_QUERY_PLANNER_PARTIAL_RETRY_ATTEMPTS = previousPartialRetryAttempts;
    } else {
      delete process.env.STUDIO_IMAGE_QUERY_PLANNER_PARTIAL_RETRY_ATTEMPTS;
    }
  }
});

test("image planner prefers the project-wide gpt-5.6-sol model for local CLI planning", async () => {
  const payload = buildPreparePayload(1);
  payload.codexModel = "gpt-5.4";
  const seenModels: string[] = [];

  const result = await planMissingSlideImageRequests(payload, {
    transportOverrides: {
      canUseLocalCliBridge: () => true,
      planByCodexCli: async (slides, options) => {
        seenModels.push(String(options?.codexModel || ""));
        return {
          items: slides.map((slide) => ({
            slideIndex: slide.slideIndex,
            provider: "giphy",
            queryCandidates: ["fast reaction"],
          })),
        };
      },
    },
  });

  assert.deepEqual(seenModels, ["gpt-5.6-sol"]);
  assert.equal(result.payload.slides[0]?.imageRequest?.plannerSource, "codex");
});

test("image planner preserves an explicit later media beat without promoting it to the first line", async () => {
  const payload = buildPreparePayload(1);
  payload.slides[0] = {
    ...payload.slides[0],
    text: "첫 줄\n둘째 줄",
    lines: ["첫 줄", "둘째 줄"],
    imageRequest: {
      query: "base scene",
      queryCandidates: ["base scene"],
      orientation: "landscape",
      plannerSource: "manual",
    },
    imageBeats: [
      {
        beatId: "manual-right",
        startLineIndex: 1,
        imageUrl: "https://example.com/manual-right.png",
        resolvedImageUrl: "https://example.com/manual-right.png",
        resolvedBy: "direct",
        imageSelection: {
          intent: "library",
          queryCandidates: [],
          selectedCandidateId: "library:manual-right",
          selectionReason: "manual library selection",
        },
      },
    ],
  };

  const result = await planMissingSlideImageRequests(payload);

  assert.equal(result.payload.slides[0]?.imageUrl, undefined);
  assert.equal(result.payload.slides[0]?.imageBeats?.[0]?.startLineIndex, 1);
  assert.equal(result.payload.slides[0]?.imageBeats?.[0]?.imageUrl, "https://example.com/manual-right.png");
  assert.equal(result.payload.slides[0]?.imageBeats?.[0]?.resolvedBy, "direct");
});

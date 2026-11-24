import test from "node:test";
import assert from "node:assert/strict";
import { inferGiphyReactionFamily } from "./giphy-query-utils";
import { applyImageSelectionPlanningPolicy } from "./image-selection-policy";

function createHelpers(): Parameters<typeof applyImageSelectionPlanningPolicy>[0]["helpers"] {
  return {
    normalizeWhitespace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    },
    toFallbackImageRequest(slide, _crawlMode, provider) {
      return {
        query: provider === "giphy" ? "awkward reaction" : "현장 사진",
        queryCandidates: provider === "giphy" ? ["awkward reaction", "side eye reaction"] : ["현장 사진", "서류 사진"],
        preferredProviders: provider ? [provider] : undefined,
        scene: slide.text,
        orientation: "landscape" as const,
        mustAvoid: [],
        plannerSource: "fallback" as const,
      };
    },
    toSearchableQueryCandidates(
      input,
      _scene,
      _slide,
      fallback,
      _crawlMode,
      provider
    ) {
      const values = input.filter(Boolean);
      if (provider === "giphy") {
        const english = values.filter((value) => /[a-z]/i.test(value) && !/[가-힣]/u.test(value));
        return english.length > 0 ? english : fallback.queryCandidates || [fallback.query];
      }
      if (provider === "naver") {
        const korean = values.filter((value) => /[가-힣]/u.test(value));
        return korean.length > 0 ? korean : fallback.queryCandidates || [fallback.query];
      }
      return values.length > 0 ? values : fallback.queryCandidates || [fallback.query];
    },
  };
}

test("selection policy no longer forces a 4-line slide into two image beats", async () => {
  const result = await applyImageSelectionPlanningPolicy({
    slides: [
      {
        title: "",
        text: "첫째 둘째 셋째 넷째",
        lines: ["첫째", "둘째", "셋째", "넷째"],
        layout: "photo+body",
      },
    ],
    helpers: createHelpers(),
  });

  assert.equal(result.slides[0]?.imageBeats, undefined);
  assert.equal(result.slides[0]?.imageRequest?.query, "현장 사진");
  assert.deepEqual(result.slides[0]?.imageRequest?.preferredProviders, ["naver"]);
});

test("selection policy preserves explicit image beat transitions", async () => {
  const result = await applyImageSelectionPlanningPolicy({
    slides: [
      {
        title: "",
        text: "첫 장면 다음 장면",
        lines: ["첫 장면", "다음 장면"],
        layout: "photo+body",
        imageBeats: [
          {
            beatId: "0:0",
            startLineIndex: 0,
            imageUrl: "https://example.com/primary.jpg",
            imageRequest: {
              query: "awkward reaction",
              queryCandidates: ["awkward reaction", "side eye reaction"],
              preferredProviders: ["giphy"],
              scene: "첫 장면",
              orientation: "landscape",
              mustAvoid: [],
              plannerSource: "manual",
            },
          },
          {
            beatId: "0:1",
            startLineIndex: 1,
            imageUrl: "https://example.com/secondary.jpg",
            imageRequest: {
              query: "mind blown reaction",
              queryCandidates: ["mind blown reaction"],
              preferredProviders: ["giphy"],
              scene: "다음 장면",
              orientation: "landscape",
              mustAvoid: [],
              plannerSource: "manual",
            },
          },
        ],
      },
    ],
    helpers: createHelpers(),
  });

  assert.equal(result.slides[0]?.imageUrl, "https://example.com/primary.jpg");
  assert.equal(result.slides[0]?.imageRequest?.query, "awkward reaction");
  assert.deepEqual(
    result.slides[0]?.imageBeats?.map((beat) => ({ startLineIndex: beat.startLineIndex, imageUrl: beat.imageUrl })),
    [
      { startLineIndex: 0, imageUrl: "https://example.com/primary.jpg" },
      { startLineIndex: 1, imageUrl: "https://example.com/secondary.jpg" },
    ]
  );
});

test("selection policy avoids exact duplicate queries when alternates exist", async () => {
  const result = await applyImageSelectionPlanningPolicy({
    slides: [
      {
        title: "",
        text: "퇴직연금은 미리 준비해야 한다",
        lines: ["퇴직연금은", "미리 준비해야 한다"],
        layout: "photo+body",
        imageRequest: {
          query: "통장",
          queryCandidates: ["통장", "달력 메모", "계좌 화면"],
          preferredProviders: ["naver"],
          scene: "퇴직연금 일정표",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "heuristic",
        },
      },
      {
        title: "",
        text: "퇴직금 정산은 서류를 다시 봐야 한다",
        lines: ["퇴직금 정산은", "서류를 다시 봐야 한다"],
        layout: "photo+body",
        imageRequest: {
          query: "통장",
          queryCandidates: ["통장", "퇴직금 정산 서류", "급여 명세서"],
          preferredProviders: ["naver"],
          scene: "퇴직금 정산 서류",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "heuristic",
        },
      },
    ],
    helpers: createHelpers(),
  });

  assert.equal(result.slides[0]?.imageRequest?.query, "통장");
  assert.notEqual(result.slides[1]?.imageRequest?.query, "통장");
  assert.match(String(result.slides[1]?.imageRequest?.query || ""), /서류|명세서/);
});

test("selection policy keeps content-driven providers instead of alternating parity", async () => {
  const result = await applyImageSelectionPlanningPolicy({
    slides: [
      {
        title: "",
        text: "첫 슬라이드는 리액션이 더 어울린다",
        lines: ["첫 슬라이드", "리액션"],
        layout: "photo+body",
        imageRequest: {
          query: "awkward reaction",
          queryCandidates: ["awkward reaction", "side eye reaction"],
          preferredProviders: ["giphy"],
          scene: "reaction",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
      },
      {
        title: "",
        text: "둘째 슬라이드는 서류 사진이 더 어울린다",
        lines: ["둘째 슬라이드", "서류 사진"],
        layout: "photo+body",
        imageRequest: {
          query: "퇴직금 정산 서류",
          queryCandidates: ["퇴직금 정산 서류", "급여 명세서"],
          preferredProviders: ["naver"],
          scene: "서류 사진",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
      },
      {
        title: "",
        text: "셋째 슬라이드도 사진이 더 어울린다",
        lines: ["셋째 슬라이드", "사무실 책상"],
        layout: "photo+body",
        imageRequest: {
          query: "사무실 책상",
          queryCandidates: ["사무실 책상", "서류 사진"],
          preferredProviders: ["naver"],
          scene: "사무실 책상",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
      },
    ],
    debug: true,
    helpers: createHelpers(),
  });

  assert.deepEqual(result.slides.map((slide) => slide.imageRequest?.preferredProviders?.[0]), ["giphy", "naver", "naver"]);
  assert.doesNotMatch(result.warnings.join("\n"), /provider-pattern/);
  assert.doesNotMatch(result.warnings.join("\n"), /provider-shift=naver->giphy/);
});

test("selection policy penalizes repeated giphy reaction families across consecutive slides", async () => {
  const result = await applyImageSelectionPlanningPolicy({
    slides: [
      {
        title: "",
        text: "첫 반응은 민망함이다",
        lines: ["민망한", "첫 반응"],
        layout: "photo+body",
        imageRequest: {
          query: "awkward reaction",
          queryCandidates: ["awkward reaction", "nervous laugh", "side eye reaction"],
          preferredProviders: ["giphy"],
          scene: "reaction",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
      },
      {
        title: "",
        text: "다음 슬라이드는 비슷하지만 다른 계열이 필요하다",
        lines: ["비슷하지만", "다른 계열"],
        layout: "photo+body",
        imageRequest: {
          query: "cringe reaction",
          queryCandidates: ["cringe reaction", "nervous laugh", "blank stare reaction", "mind blown reaction"],
          preferredProviders: ["giphy"],
          scene: "reaction",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "codex",
        },
      },
    ],
    helpers: createHelpers(),
  });

  const firstFamily = inferGiphyReactionFamily(String(result.slides[0]?.imageRequest?.query || ""));
  const secondQuery = String(result.slides[1]?.imageRequest?.query || "");
  const secondFamily = inferGiphyReactionFamily(secondQuery);

  assert.equal(firstFamily, "awkward");
  assert.notEqual(secondFamily, "awkward");
  assert.ok(["deadpan", "meltdown", "suspicious"].includes(String(secondFamily)));
  assert.doesNotMatch(secondQuery, /cringe|nervous laugh/i);
});

test("selection policy preserves direct image urls and manual requests", async () => {
  const result = await applyImageSelectionPlanningPolicy({
    slides: [
      {
        title: "",
        text: "직접 고른 이미지",
        lines: ["직접", "고른 이미지"],
        layout: "photo+body",
        imageUrl: "https://example.com/manual.jpg",
        imageRequest: {
          query: "직접 선택 이미지",
          queryCandidates: ["직접 선택 이미지"],
          preferredProviders: ["naver"],
          scene: "직접 고른 이미지",
          orientation: "landscape",
          mustAvoid: [],
          plannerSource: "manual",
        },
      },
    ],
    helpers: createHelpers(),
  });

  assert.equal(result.slides[0]?.imageUrl, "https://example.com/manual.jpg");
  assert.equal(result.slides[0]?.imageRequest?.query, "직접 선택 이미지");
  assert.deepEqual(result.slides[0]?.imageRequest?.preferredProviders, ["naver"]);
});

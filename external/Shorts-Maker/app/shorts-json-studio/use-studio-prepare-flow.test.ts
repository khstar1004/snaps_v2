import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { STUDIO_AUTO_APPLIED_SELECTION_REASON } from "@/lib/studio/image-candidate-approval";
import { __internal } from "./use-studio-prepare-flow";

function makeSlide(text: string): PreparedSlide {
  return {
    title: text,
    text,
    lines: [text],
    layout: "photo+body",
  };
}

test("resolveStudioPrepareImageMode distinguishes crawl, manual, and auto image sources", () => {
  assert.equal(__internal.resolveStudioPrepareImageMode("crawl-only"), "crawl-only");
  assert.equal(__internal.resolveStudioPrepareImageMode("manual-ai-prompt"), "manual-ai-prompt");
  assert.equal(__internal.resolveStudioPrepareImageMode("auto-ai-generate"), "auto-ai-generate");
});

test("toVisibleStudioWarnings removes timing noise and duplicates", () => {
  assert.deepEqual(
    __internal.toVisibleStudioWarnings([
      "[timing] prepare total_ms=50",
      "슬라이드 1: anchor 이미지를 첨부하지 못했습니다.",
      "슬라이드 1: anchor 이미지를 첨부하지 못했습니다.",
      "",
    ]),
    ["슬라이드 1: anchor 이미지를 첨부하지 못했습니다."],
  );
});

test("clearSfxDecisionForSlide replans only the requested slide", () => {
  const slides: PreparedSlide[] = [
    {
      ...makeSlide("첫 슬라이드"),
      sfxCue: { enabled: true, tag: "강조", source: "manual" },
      sfxPlan: [{ lineIndex: 0, tag: "강조", source: "manual" }],
    },
    {
      ...makeSlide("둘째 슬라이드"),
      sfxCue: { enabled: false, tag: "전환", source: "manual" },
      sfxPlan: [{ lineIndex: 0, tag: "전환", source: "auto" }],
    },
  ];

  const next = __internal.clearSfxDecisionForSlide(slides, 1);

  assert.equal(next[0], slides[0]);
  assert.equal(next[1]?.sfxCue, undefined);
  assert.equal(next[1]?.sfxPlan, undefined);
  assert.equal(slides[1]?.sfxCue?.enabled, false);
});

test("clearSfxDecisionForSlide ignores an out-of-range target", () => {
  const slides = [makeSlide("첫 슬라이드")];
  assert.equal(__internal.clearSfxDecisionForSlide(slides, 3), slides);
});

test("single-slide SFX replans do not mark the full SFX plan completed", () => {
  assert.equal(__internal.shouldMarkFullSfxPlanCompleted(1), false);
  assert.equal(__internal.shouldMarkFullSfxPlanCompleted(null), true);
});

test("autoGeneratePreparedSlides calls manual-image-generate with missing mode for auto source", async () => {
  const slides = [makeSlide("첫 슬라이드"), makeSlide("둘째 슬라이드")];
  const projectProfileSnapshot: StudioProjectProfileSnapshot = {
    version: 1 as const,
    projectId: "project-1",
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category: "news",
      label: "뉴스 채널",
      metadataSnapshot: null,
    },
  };
  let capturedRequest: {
    publishCategory: string;
    slides: PreparedSlide[];
    slideIndexes?: number[];
    mode: "selected" | "missing" | "all";
    codexModel?: string;
    imageStylePrompt?: string;
    characterProfiles?: Array<{ characterId: string; anchorImageUrl?: string }>;
    fixedCharacterProfileId?: string;
    projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  } | null = null;

  const result = await __internal.autoGeneratePreparedSlides({
    enabled: true,
    publishCategory: "news",
    slides,
    codexModel: "gpt-5.4",
    imageStylePrompt: "chibi moe, no text",
    characterProfiles: [{ characterId: "female_1", anchorImageUrl: "https://assets.example.com/female-1.png" }],
    fixedCharacterProfileId: "saved_lead",
    projectProfileSnapshot,
    requestManualImageGenerate: async (request) => {
      capturedRequest = request;
      return {
        ok: true,
        requestId: "req-1",
        characterProfiles: [{ characterId: "female_1", anchorImageUrl: "https://assets.example.com/female-1.png" }],
        slides: [
          {
            ...slides[0],
            imageUrl: "https://assets.example.com/generated-1.png",
            mediaUrl: "https://assets.example.com/generated-1.png",
            mediaKind: "image",
            resolvedImageUrl: "https://assets.example.com/generated-1.png",
            resolvedBy: "direct",
            imageSelection: {
              intent: "library",
              queryCandidates: [],
              provider: "library",
              selectedCandidateId: "asset-generated-1",
              selectionReason: `${STUDIO_AUTO_APPLIED_SELECTION_REASON}: library / 생성 후보`,
              candidateOptions: [
                {
                  provider: "library",
                  candidateId: "asset-generated-1",
                  imageUrl: "https://assets.example.com/generated-1.png",
                  title: "생성 후보",
                },
              ],
            },
          },
          slides[1],
        ],
        warnings: ["[timing] manual_image_generate_api total_ms=10", "슬라이드 2: 이미지는 기존 자산을 유지했습니다."],
        results: [
          {
            slideIndex: 0,
            linkedSlideIndexes: [0],
            status: "ok",
            imageUrl: "https://assets.example.com/generated-1.png",
            warnings: [],
          },
          {
            slideIndex: 1,
            linkedSlideIndexes: [1],
            status: "error",
            code: "generation_skipped",
            reason: "이미지가 이미 연결되어 있습니다.",
            warnings: [],
          },
        ],
      };
    },
  });

  assert.deepEqual(capturedRequest, {
    publishCategory: "news",
    imageSource: "auto-ai-generate",
    slides,
    mode: "missing",
    codexModel: "gpt-5.4",
    fixedCharacterProfileId: "saved_lead",
    projectProfileSnapshot,
  });
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 1);
  assert.equal(result.slides[0]?.imageUrl, "https://assets.example.com/generated-1.png");
  assert.equal(result.slides[0]?.resolvedImageUrl, "https://assets.example.com/generated-1.png");
  assert.equal(result.slides[0]?.resolvedBy, "direct");
  assert.equal(result.slides[0]?.imageSelection?.selectedCandidateId, "asset-generated-1");
  assert.match(
    String(result.slides[0]?.imageSelection?.selectionReason),
    new RegExp(`^${STUDIO_AUTO_APPLIED_SELECTION_REASON}`, "u")
  );
  assert.equal(result.slides[0]?.imageSelection?.candidateOptions?.[0]?.candidateId, "asset-generated-1");
  assert.equal(result.slides[0]?.imageSelection?.candidateOptions?.[0]?.imageUrl, "https://assets.example.com/generated-1.png");
  assert.deepEqual(result.warnings, ["슬라이드 2: 이미지는 기존 자산을 유지했습니다."]);
});

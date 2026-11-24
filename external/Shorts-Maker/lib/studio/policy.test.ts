import assert from "node:assert/strict";
import test from "node:test";
import { __internal } from "./policy";
import type { StudioPrepareRequest } from "@/types/studio-json";

function makePreparePayload(overrides?: Partial<StudioPrepareRequest>): StudioPrepareRequest {
  return {
    videoMode: "segments",
    crawlMode: "fun",
    imagePolicy: {
      source: "crawl-only",
      allowGenerated: false,
      fallback: "body-only",
    },
    slides: [
      {
        title: "테스트",
        text: "rich",
        lines: ["rich"],
        layout: "photo+body",
      },
    ],
    ...overrides,
  };
}

test("resolveImageSearchTuning floors maxCandidatesPerProvider to 3 for review UI", () => {
  const tuning = __internal.resolveImageSearchTuning(
    makePreparePayload({
      imageSearchTuning: {
        maxCandidatesPerProvider: 1,
        providers: ["giphy", "naver"],
      },
    })
  );

  assert.equal(tuning.maxCandidatesPerProvider, 3);
});

test("resolveImageSearchTuning keeps higher maxCandidatesPerProvider values intact", () => {
  const tuning = __internal.resolveImageSearchTuning(
    makePreparePayload({
      imageSearchTuning: {
        maxCandidatesPerProvider: 8,
        providers: ["giphy", "naver"],
      },
    })
  );

  assert.equal(tuning.maxCandidatesPerProvider, 8);
});

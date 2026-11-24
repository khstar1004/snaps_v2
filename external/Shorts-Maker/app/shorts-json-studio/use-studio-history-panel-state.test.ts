import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import { getSuggestedStudioWorkName, hasStudioWorkContent } from "./studio-history-panel-helpers";

test("hasStudioWorkContent returns false only when the current draft is effectively empty", () => {
  assert.equal(
    hasStudioWorkContent({
      topicText: "   ",
      scriptText: "",
      jsonText: "",
      slides: [],
      preselectedMediaItemCount: 0,
      previewTiming: null,
      videoUrl: null,
      uploadedVideoUrl: null,
      renderStatus: "   ",
    }),
    false
  );

  assert.equal(
    hasStudioWorkContent({
      topicText: "",
      scriptText: "",
      jsonText: "",
      slides: [],
      preselectedMediaItemCount: 1,
      previewTiming: null,
      videoUrl: null,
      uploadedVideoUrl: null,
      renderStatus: "",
    }),
    true
  );
});

test("getSuggestedStudioWorkName prefers explicit names before content-derived fallbacks", () => {
  const slides: PreparedSlide[] = [
    {
      title: "첫 슬라이드 제목",
      text: "본문",
      lines: ["본문"],
      layout: "photo+body",
    },
  ];

  assert.equal(
    getSuggestedStudioWorkName({
      workName: "  직접 지정한 이름  ",
      publishTitle: "발행 제목",
      slides,
      topicText: "주제 첫 줄\n주제 둘째 줄",
      scriptText: "대본 첫 줄\n대본 둘째 줄",
      publishCategory: "default",
    }),
    "직접 지정한 이름"
  );

  assert.equal(
    getSuggestedStudioWorkName({
      workName: "",
      publishTitle: "",
      slides: [],
      topicText: "주제 첫 줄\n주제 둘째 줄",
      scriptText: "대본 첫 줄\n대본 둘째 줄",
      publishCategory: "default",
    }),
    "주제 첫 줄"
  );
});

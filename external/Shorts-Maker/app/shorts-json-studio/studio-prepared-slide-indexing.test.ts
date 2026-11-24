import test from "node:test";
import assert from "node:assert/strict";
import { buildPreparedSlideSourceIndexMap, getPreparedSlideSourceIndex } from "./studio-prepared-slide-indexing";
import type { PreparedSlide } from "@/types/studio-json";

function slide(groupId?: number, stepIndex?: number): PreparedSlide {
  return {
    title: "테스트",
    text: "테스트",
    lines: ["테스트"],
    layout: "photo+body",
    groupId,
    stepIndex,
  };
}

test("buildPreparedSlideSourceIndexMap maps expanded groups and standalone slides by current visual order", () => {
  const slides = [slide(8, 0), slide(8, 1), slide(), slide(22, 0), slide(22, 1), slide()];
  assert.deepEqual(buildPreparedSlideSourceIndexMap(slides), [0, 0, 1, 2, 2, 3]);
});

test("getPreparedSlideSourceIndex ignores stale numeric group ids after an earlier group is deleted", () => {
  const remainingSlides = [slide(1, 0), slide(1, 1)];
  assert.equal(getPreparedSlideSourceIndex(remainingSlides, 0), 0);
  assert.equal(getPreparedSlideSourceIndex(remainingSlides, 1), 0);
});

test("getPreparedSlideSourceIndex rejects indexes outside the prepared slide list", () => {
  assert.equal(getPreparedSlideSourceIndex([slide()], -1), null);
  assert.equal(getPreparedSlideSourceIndex([slide()], 1), null);
});

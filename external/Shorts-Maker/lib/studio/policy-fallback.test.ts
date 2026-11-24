import test from "node:test";
import assert from "node:assert/strict";
import { toFallbackImageDataUrl } from "./policy-fallback";

test("fallback image data url changes when reservation salt changes", () => {
  const first = toFallbackImageDataUrl("같은 제목", "같은 본문", "reservation-slide-1");
  const second = toFallbackImageDataUrl("같은 제목", "같은 본문", "reservation-slide-2");

  assert.notEqual(first, second);
});

test("fallback image data url stays stable when salt is unchanged", () => {
  const first = toFallbackImageDataUrl("같은 제목", "같은 본문", "reservation-slide-1");
  const second = toFallbackImageDataUrl("같은 제목", "같은 본문", "reservation-slide-1");

  assert.equal(first, second);
});

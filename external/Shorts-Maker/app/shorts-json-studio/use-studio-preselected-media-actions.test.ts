import assert from "node:assert/strict";
import test from "node:test";
import type { StudioPreselectedMediaItem } from "./types";
import {
  appendUniquePreselectedMediaItems,
  movePreselectedMediaItem,
  reorderPreselectedMediaItem,
  updatePreselectedMediaTargetSlide,
} from "./use-studio-preselected-media-actions";

function createItem(
  id: string,
  overrides: Partial<StudioPreselectedMediaItem> = {}
): StudioPreselectedMediaItem {
  return {
    id,
    source: "library",
    title: id,
    imageUrl: `https://example.com/${id}.jpg`,
    createdAtMs: 1,
    ...overrides,
  };
}

test("appendUniquePreselectedMediaItems keeps first matching asset and caps the selection", () => {
  const current = [createItem("a"), createItem("b", { assetId: "shared-asset" })];
  const itemsToAppend = [
    createItem("dup", { assetId: "shared-asset" }),
    createItem("c"),
    createItem("d", { source: "session-upload" }),
  ];

  const next = appendUniquePreselectedMediaItems(current, itemsToAppend, 4);

  assert.deepEqual(
    next.map((item) => item.id),
    ["a", "b", "c", "d"]
  );
});

test("updatePreselectedMediaTargetSlide clears and applies explicit target indexes", () => {
  const current = [createItem("a", { targetSlideIndex: 2 }), createItem("b")];

  const cleared = updatePreselectedMediaTargetSlide(current, "a", null);
  assert.equal(cleared.changed, true);
  assert.equal(cleared.items[0]?.targetSlideIndex, undefined);

  const assigned = updatePreselectedMediaTargetSlide(current, "b", 4);
  assert.equal(assigned.changed, true);
  assert.equal(assigned.items[1]?.targetSlideIndex, 4);
});

test("movePreselectedMediaItem and reorderPreselectedMediaItem respect boundaries", () => {
  const current = [createItem("a"), createItem("b"), createItem("c")];

  const moved = movePreselectedMediaItem(current, "b", 1);
  assert.equal(moved.changed, true);
  assert.deepEqual(
    moved.items.map((item) => item.id),
    ["a", "c", "b"]
  );

  const sameBoundary = movePreselectedMediaItem(current, "a", -1);
  assert.equal(sameBoundary.changed, false);
  assert.equal(sameBoundary.items, current);

  const reordered = reorderPreselectedMediaItem(current, "c", 99);
  assert.equal(reordered.changed, false);
  assert.equal(reordered.items, current);

  const toFront = reorderPreselectedMediaItem(current, "c", 0);
  assert.equal(toFront.changed, true);
  assert.deepEqual(
    toFront.items.map((item) => item.id),
    ["c", "a", "b"]
  );
});

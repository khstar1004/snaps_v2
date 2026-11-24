import test from "node:test";
import assert from "node:assert/strict";
import { buildReservationDelta, hasReservationDeltaConflict } from "./policy-reservation";

test("reservation delta tracks newly added segment assets only", () => {
  const baseline = new Set(["giphy:base", "https://example.com/base.gif"]);
  const current = new Set([
    "giphy:base",
    "https://example.com/base.gif",
    "giphy:unique-primary",
    "giphy:duplicate-secondary",
  ]);

  assert.deepEqual(buildReservationDelta(current, baseline), [
    "giphy:unique-primary",
    "giphy:duplicate-secondary",
  ]);
});

test("reservation conflict detects duplicates introduced by a different segment after the attempt started", () => {
  const baseline = new Set(["giphy:base"]);
  const target = new Set(["giphy:base", "giphy:duplicate-secondary"]);
  const current = new Set([
    "giphy:base",
    "giphy:unique-primary",
    "giphy:duplicate-secondary",
  ]);

  assert.equal(hasReservationDeltaConflict(target, baseline, current), true);
});

test("reservation conflict ignores assets that were already reserved before the attempt snapshot", () => {
  const baseline = new Set(["giphy:base", "giphy:already-used"]);
  const target = new Set(["giphy:base", "giphy:already-used"]);
  const current = new Set(["giphy:base", "giphy:already-used", "giphy:new-one"]);

  assert.equal(hasReservationDeltaConflict(target, baseline, current), false);
});

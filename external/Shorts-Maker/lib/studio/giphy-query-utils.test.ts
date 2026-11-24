import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeGiphyQueriesByFamily,
  inferGiphyReactionFamily,
  normalizeGiphySearchQuery,
  sanitizeTrustedGiphyPlannerQuery,
} from "./giphy-query-utils";

test("giphy canonicalizer preserves important multiword phrases", () => {
  assert.equal(normalizeGiphySearchQuery("done with this reaction"), "done with this reaction");
  assert.equal(normalizeGiphySearchQuery("done with this reaction gif"), "done with this reaction");
  assert.equal(normalizeGiphySearchQuery("mind blown reaction"), "mind blown reaction");
  assert.equal(normalizeGiphySearchQuery("side eye reaction"), "side eye reaction");
  assert.equal(normalizeGiphySearchQuery("blank stare reaction"), "blank stare reaction");
  assert.equal(normalizeGiphySearchQuery("nervous laugh"), "nervous laugh");
});

test("giphy reaction families group equivalent reaction phrases", () => {
  assert.equal(inferGiphyReactionFamily("awkward reaction"), "awkward");
  assert.equal(inferGiphyReactionFamily("nervous laugh"), "awkward");
  assert.equal(inferGiphyReactionFamily("cringe reaction"), "awkward");
  assert.equal(inferGiphyReactionFamily("shocked reaction"), "shock");
  assert.equal(inferGiphyReactionFamily("done with this reaction"), "frustration");
  assert.equal(inferGiphyReactionFamily("blank stare reaction"), "deadpan");
});

test("giphy family dedupe keeps only one query per family while preserving distinct families", () => {
  const deduped = dedupeGiphyQueriesByFamily(
    [
      "awkward reaction",
      "nervous laugh",
      "cringe reaction",
      "side eye reaction",
      "mind blown reaction",
      "blank stare reaction",
    ],
    { limit: 6, sanitize: true }
  );

  assert.deepEqual(deduped, ["awkward reaction", "side eye reaction", "mind blown reaction", "blank stare reaction"]);
});

test("giphy sanitizer rejects collapsed generic leftovers after quality gating", () => {
  assert.equal(sanitizeTrustedGiphyPlannerQuery("this reaction"), "");
  assert.equal(sanitizeTrustedGiphyPlannerQuery("paperwork desk"), "");
});

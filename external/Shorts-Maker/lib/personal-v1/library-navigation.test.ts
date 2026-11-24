import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonalV1LibraryHref,
  getPersonalV1AssetsViewFromSearch,
  PERSONAL_V1_LIBRARY_SECTIONS,
} from "./library-navigation";

test("personal V1 library exposes only projects, completed videos, and supporting assets", () => {
  assert.deepEqual(
    PERSONAL_V1_LIBRARY_SECTIONS.map((section) => section.label),
    ["프로젝트", "완성 영상", "보조 자산"]
  );
});

test("asset view query restores supported sections and falls back to completed videos", () => {
  assert.equal(getPersonalV1AssetsViewFromSearch("?view=videos"), "videos");
  assert.equal(getPersonalV1AssetsViewFromSearch("?view=supporting"), "supporting");
  assert.equal(getPersonalV1AssetsViewFromSearch("?view=assets"), "supporting");
  assert.equal(getPersonalV1AssetsViewFromSearch("?view=unknown"), "videos");
  assert.equal(getPersonalV1AssetsViewFromSearch(""), "videos");
});

test("personal V1 library links preserve the selected section", () => {
  assert.equal(buildPersonalV1LibraryHref("projects"), "/projects");
  assert.equal(buildPersonalV1LibraryHref("videos"), "/assets?view=videos");
  assert.equal(buildPersonalV1LibraryHref("supporting"), "/assets?view=supporting");
});

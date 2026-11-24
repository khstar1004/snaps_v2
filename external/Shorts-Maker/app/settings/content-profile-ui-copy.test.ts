import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_PROFILE_COPY, CONTENT_PROFILE_TERM } from "./content-profile-ui-copy";

test("content profile settings uses the approved personal V1 term", () => {
  assert.equal(CONTENT_PROFILE_TERM, "콘텐츠 프로필");
  assert.match(CONTENT_PROFILE_COPY.pageTitle, /콘텐츠 프로필/u);
  assert.match(CONTENT_PROFILE_COPY.mappingTitle, /콘텐츠 프로필/u);
  assert.match(CONTENT_PROFILE_COPY.mappingSummary, /현재 연결 대상/u);
});

test("content profile copy does not expose legacy customer, category, or role language", () => {
  const visibleCopy = Object.values(CONTENT_PROFILE_COPY).join("\n");
  assert.doesNotMatch(visibleCopy, /고객|카테고리|category|전체 관리 권한/u);
  assert.match(CONTENT_PROFILE_COPY.readOnlyMessage, /읽기 전용/u);
});

test("platform connection stays secondary to the provider-neutral profile mapping", () => {
  assert.equal(CONTENT_PROFILE_COPY.externalConnectionTitle, "외부 연결");
  assert.equal(CONTENT_PROFILE_COPY.connectYoutubeButton, "YouTube 연결");
  assert.doesNotMatch(CONTENT_PROFILE_COPY.mappingTitle, /YouTube/u);
});

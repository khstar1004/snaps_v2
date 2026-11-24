import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const categoryBrowserSource = readFileSync(resolve("components/assets-category-browser.tsx"), "utf8");
const overviewCardSource = readFileSync(resolve("components/assets-overview-card.tsx"), "utf8");
const assetsPageSource = readFileSync(resolve("app/assets/page.tsx"), "utf8");
const newProjectSource = readFileSync(resolve("app/projects/new/page.tsx"), "utf8");

test("completed video library keeps personal editing actions visible", () => {
  for (const label of ["재생", "스튜디오에서 열기", "수정본 만들기", "원본 열기", "삭제"]) {
    assert.match(categoryBrowserSource, new RegExp(label));
  }
});

test("completed video library does not expose publish-job management or permission metadata", () => {
  for (const legacyCopy of [
    "작업 권한",
    "편집 권한 필요",
    "발행 상태를 관리",
    "대기 발행",
    "작업 관리",
    "연결된 발행 작업이 없습니다",
    "발행 작업 상태를 변경",
    "canPublishCategoryAction",
    "onRunJobAction",
    "runPublishJobAction",
    "toWorkspacePermissionLevelLabel",
  ]) {
    assert.doesNotMatch(categoryBrowserSource, new RegExp(legacyCopy));
    assert.doesNotMatch(overviewCardSource, new RegExp(legacyCopy));
    assert.doesNotMatch(assetsPageSource, new RegExp(legacyCopy));
  }
});

test("completed video library uses safe invalid-date fallbacks", () => {
  assert.match(categoryBrowserSource, /toLocalDateTimeLabel/);
  assert.match(categoryBrowserSource, /업로드 시각 없음/);
  assert.match(categoryBrowserSource, /저장 시각 없음/);
  assert.doesNotMatch(categoryBrowserSource, /new Date\(item\.createdAt\)\.toLocaleString/);
  assert.doesNotMatch(categoryBrowserSource, /new Date\(studioResume\.createdAt\)\.toLocaleString/);
});

test("new project profile cards use platform-neutral channel copy and selected-only check marks", () => {
  assert.match(newProjectSource, /연결 채널 없음/);
  assert.doesNotMatch(newProjectSource, /발행 채널 미연결/);
  assert.match(newProjectSource, /selected \? <span className=\{styles\.selectionMark\}/);
});

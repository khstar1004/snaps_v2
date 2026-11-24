import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSiblingSource(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

test("Studio keeps the selected profile read-only and starts new projects through the profile wizard", () => {
  const shellSource = readSiblingSource("./components/studio-mode-shells.tsx");
  const workspaceActionSource = readSiblingSource("./use-studio-workspace-settings-actions.ts");

  assert.match(shellSource, /aria-label="현재 프로필"/u);
  assert.match(shellSource, /resolvedProfileSnapshotLabel/u);
  assert.match(shellSource, /href="\/projects\/new"/u);
  assert.match(shellSource, /프로젝트 초기화/u);
  assert.doesNotMatch(shellSource, /프로필 고정/u);
  assert.doesNotMatch(shellSource, /studio-publish-category|handlePublishCategoryChange/u);
  assert.doesNotMatch(workspaceActionSource, /handlePublishCategoryChange|setPublishCategory/u);
});

test("Studio profile snapshot label prefers frozen project labels over live category labels", () => {
  const shellSource = readSiblingSource("./components/studio-mode-shells.tsx");
  const shellPropsSource = readSiblingSource("./use-studio-mode-shell-props.ts");

  assert.match(shellSource, /profileSnapshotLabel\?: string/u);
  assert.match(shellSource, /projectProfileLabel\?: string/u);
  assert.match(shellSource, /resolveStudioProfileSnapshotLabel/u);
  assert.match(shellSource, /<strong>\{resolvedProfileSnapshotLabel\}<\/strong>/u);
  assert.match(shellPropsSource, /projectProfileLabel\?: string/u);
  assert.match(shellPropsSource, /profileSnapshotLabel: resolvedProfileSnapshotLabel/u);

  const snapshotIndex = shellSource.indexOf("if (profileSnapshotLabel) return profileSnapshotLabel");
  const projectIndex = shellSource.indexOf("if (projectProfileLabel) return projectProfileLabel");
  const liveCategoryIndex = shellSource.indexOf("categoryOptions.find");
  assert.ok(snapshotIndex >= 0, "profileSnapshotLabel should be checked first");
  assert.ok(projectIndex > snapshotIndex, "projectProfileLabel should be checked after profileSnapshotLabel");
  assert.ok(liveCategoryIndex > projectIndex, "live category label should be fallback only");
});

test("Project settings edits only a bounded name and keeps frozen profile context read-only", () => {
  const shellSource = readSiblingSource("./components/studio-mode-shells.tsx");
  const drawerSource = readSiblingSource("./components/studio-project-settings-drawer.tsx");

  assert.match(shellSource, /프로젝트 설정/u);
  assert.match(shellSource, /버전 저장/u);
  assert.match(drawerSource, /maxLength=\{120\}/u);
  assert.match(drawerSource, /aria-modal="true"/u);
  assert.match(drawerSource, /event\.key !== "Tab"/u);
  assert.match(drawerSource, /summary\.profileLabel/u);
  assert.match(drawerSource, /summary\.templateSummary/u);
  assert.match(drawerSource, /summary\.outputSummary/u);
  assert.doesNotMatch(drawerSource, /<select|summary\.projectId|onProfileChange/u);
});
